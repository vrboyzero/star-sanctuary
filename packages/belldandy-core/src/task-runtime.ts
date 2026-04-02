import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  normalizeAgentLaunchSpec,
  type AgentLaunchSpec,
  type AgentLaunchSpecInput,
  type SpawnOptions as OrchestratorSpawnOptions,
  type SubAgentEvent,
  type SubAgentOrchestrator,
} from "@belldandy/agent";
import type { AgentCapabilities, SessionInfo, SpawnSubAgentOptions, SubAgentResult } from "@belldandy/skills";
import type { SubTaskWorktreeRuntime, SubTaskWorktreeRuntimeSummary, WorktreeRuntimeStatus } from "./worktree-runtime.js";

export type SubTaskStatus = "pending" | "running" | "done" | "error" | "timeout" | "stopped";

export type SubTaskNotificationKind =
  | "queued"
  | "started"
  | "progress"
  | "stop_requested"
  | "stopped"
  | "archived"
  | "completed"
  | "failed"
  | "timeout";

export type SubTaskProgress = {
  phase: SubTaskStatus;
  message?: string;
  lastActivityAt: number;
};

export type SubTaskNotification = {
  id: string;
  kind: SubTaskNotificationKind;
  message: string;
  createdAt: number;
};

export type SubTaskLaunchSpec = {
  agentId: string;
  profileId: string;
  background: boolean;
  timeoutMs: number;
  channel: string;
  role?: "default" | "coder" | "researcher" | "verifier";
  cwd?: string;
  resolvedCwd?: string;
  toolSet?: string[];
  allowedToolFamilies?: string[];
  maxToolRiskLevel?: "low" | "medium" | "high" | "critical";
  policySummary?: string;
  permissionMode?: string;
  isolationMode?: string;
  parentTaskId?: string;
  contextKeys?: string[];
  worktreePath?: string;
  worktreeRepoRoot?: string;
  worktreeBranch?: string;
  worktreeStatus?: WorktreeRuntimeStatus;
  worktreeError?: string;
};

export type SubTaskRecord = {
  id: string;
  kind: "sub_agent";
  parentConversationId: string;
  sessionId?: string;
  agentId: string;
  launchSpec: SubTaskLaunchSpec;
  background: boolean;
  status: SubTaskStatus;
  instruction: string;
  summary: string;
  progress: SubTaskProgress;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  stopRequestedAt?: number;
  stopReason?: string;
  archivedAt?: number;
  archiveReason?: string;
  outputPath?: string;
  outputPreview?: string;
  error?: string;
  notifications: SubTaskNotification[];
};

export type SubTaskChangeEvent = {
  kind: "created" | "updated" | "stop_requested" | "stopped" | "archived" | "completed";
  item: SubTaskRecord;
};

type SubTaskRuntimeState = {
  version: 1;
  items: SubTaskRecord[];
};

type CreateSubTaskInput = {
  launchSpec: AgentLaunchSpecInput;
};

type CompleteSubTaskInput = {
  status: Extract<SubTaskStatus, "done" | "error" | "timeout" | "stopped">;
  sessionId?: string;
  output?: string;
  error?: string;
};

type RuntimeLogger = {
  info?: (message: string, data?: unknown) => void;
  warn?: (message: string, data?: unknown) => void;
  error?: (message: string, data?: unknown) => void;
  debug?: (message: string, data?: unknown) => void;
};

const STATE_VERSION = 1 as const;
const MAX_NOTIFICATIONS = 20;
const OUTPUT_FILENAME = "result.md";

function truncateText(value: string, maxLength = 240): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function inferNotificationKind(status: Extract<SubTaskStatus, "done" | "error" | "timeout" | "stopped">): SubTaskNotificationKind {
  if (status === "done") return "completed";
  if (status === "timeout") return "timeout";
  if (status === "stopped") return "stopped";
  return "failed";
}

function isTerminalStatus(status: SubTaskStatus): boolean {
  return status === "done" || status === "error" || status === "timeout" || status === "stopped";
}

function inferSummary(record: SubTaskRecord, fallback = ""): string {
  return truncateText(record.outputPreview || record.error || fallback || record.instruction, 200);
}

function createLaunchSpecSummary(
  spec: AgentLaunchSpec,
  runtimeSummary: Partial<SubTaskWorktreeRuntimeSummary> = {},
): SubTaskLaunchSpec {
  return {
    agentId: spec.agentId,
    profileId: spec.profileId,
    background: spec.background,
    timeoutMs: spec.timeoutMs,
    channel: spec.channel,
    role: spec.role,
    cwd: runtimeSummary.requestedCwd ?? spec.cwd,
    resolvedCwd: runtimeSummary.resolvedCwd ?? spec.cwd,
    toolSet: spec.toolSet ? [...spec.toolSet] : undefined,
    allowedToolFamilies: spec.allowedToolFamilies ? [...spec.allowedToolFamilies] : undefined,
    maxToolRiskLevel: spec.maxToolRiskLevel,
    policySummary: spec.policySummary,
    permissionMode: spec.permissionMode,
    isolationMode: spec.isolationMode,
    parentTaskId: spec.parentTaskId,
    contextKeys: spec.context ? Object.keys(spec.context).sort() : undefined,
    worktreePath: runtimeSummary.worktreePath,
    worktreeRepoRoot: runtimeSummary.worktreeRepoRoot,
    worktreeBranch: runtimeSummary.worktreeBranch,
    worktreeStatus: runtimeSummary.worktreeStatus ?? (spec.isolationMode === "worktree" ? "pending" : "not_requested"),
    worktreeError: runtimeSummary.worktreeError,
  };
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, targetPath);
}

function cloneRecord(record: SubTaskRecord): SubTaskRecord {
  return {
    ...record,
    launchSpec: {
      ...record.launchSpec,
      toolSet: record.launchSpec.toolSet ? [...record.launchSpec.toolSet] : undefined,
      allowedToolFamilies: record.launchSpec.allowedToolFamilies ? [...record.launchSpec.allowedToolFamilies] : undefined,
      contextKeys: record.launchSpec.contextKeys ? [...record.launchSpec.contextKeys] : undefined,
    },
    progress: { ...record.progress },
    notifications: record.notifications.map((item) => ({ ...item })),
  };
}

function mergeLaunchSpecWorktreeRuntime(
  current: SubTaskLaunchSpec,
  runtimeSummary: Partial<SubTaskWorktreeRuntimeSummary>,
): SubTaskLaunchSpec {
  const next: SubTaskLaunchSpec = {
    ...current,
  };

  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "requestedCwd")) {
    next.cwd = runtimeSummary.requestedCwd;
  }
  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "resolvedCwd")) {
    next.resolvedCwd = runtimeSummary.resolvedCwd;
  }
  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "worktreePath")) {
    next.worktreePath = runtimeSummary.worktreePath;
  }
  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "worktreeRepoRoot")) {
    next.worktreeRepoRoot = runtimeSummary.worktreeRepoRoot;
  }
  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "worktreeBranch")) {
    next.worktreeBranch = runtimeSummary.worktreeBranch;
  }
  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "worktreeStatus")) {
    next.worktreeStatus = runtimeSummary.worktreeStatus;
  }
  if (Object.prototype.hasOwnProperty.call(runtimeSummary, "worktreeError")) {
    next.worktreeError = runtimeSummary.worktreeError;
  }

  return next;
}

export class SubTaskRuntimeStore {
  private readonly runtimeDir: string;
  private readonly statePath: string;
  private readonly outputsDir: string;
  private readonly logger?: RuntimeLogger;
  private readonly records = new Map<string, SubTaskRecord>();
  private readonly sessionToTask = new Map<string, string>();
  private readonly listeners = new Set<(event: SubTaskChangeEvent) => void>();
  private writeChain = Promise.resolve();
  private loadPromise: Promise<void> | null = null;

  constructor(stateDir: string, logger?: RuntimeLogger) {
    this.runtimeDir = path.join(stateDir, "subtasks");
    this.statePath = path.join(this.runtimeDir, "registry.json");
    this.outputsDir = path.join(this.runtimeDir, "outputs");
    this.logger = logger;
  }

  async load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = (async () => {
      await fs.mkdir(this.runtimeDir, { recursive: true });
      this.records.clear();
      this.sessionToTask.clear();
      try {
        const raw = await fs.readFile(this.statePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<SubTaskRuntimeState>;
        for (const item of Array.isArray(parsed.items) ? parsed.items : []) {
          const record = this.normalizeRecord(item);
          if (!record) continue;
          this.records.set(record.id, record);
          if (record.sessionId) {
            this.sessionToTask.set(record.sessionId, record.id);
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
          this.logger?.warn?.("Failed to load subtask runtime state, starting fresh.", error);
        }
      }
    })();
    return this.loadPromise;
  }

  subscribe(listener: (event: SubTaskChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async createTask(input: CreateSubTaskInput): Promise<SubTaskRecord> {
    await this.load();
    return this.mutate(async () => {
      const now = Date.now();
      const launchSpec = normalizeAgentLaunchSpec(input.launchSpec);
      const record: SubTaskRecord = {
        id: `task_${crypto.randomUUID().slice(0, 8)}`,
        kind: "sub_agent",
        parentConversationId: launchSpec.parentConversationId,
        agentId: launchSpec.agentId,
        launchSpec: createLaunchSpecSummary(launchSpec),
        background: launchSpec.background,
        status: "pending",
        instruction: launchSpec.instruction,
        summary: truncateText(launchSpec.instruction, 160),
        progress: {
          phase: "pending",
          message: "Task created and waiting to start.",
          lastActivityAt: now,
        },
        createdAt: now,
        updatedAt: now,
        notifications: [],
      };
      this.pushNotification(record, "queued", "Task created and waiting for orchestration.");
      this.records.set(record.id, record);
      this.emitChange("created", record);
      return cloneRecord(record);
    });
  }

  async updateTaskLaunchSpec(
    taskId: string,
    input: {
      launchSpec: AgentLaunchSpec;
      runtimeSummary?: Partial<SubTaskWorktreeRuntimeSummary>;
    },
  ): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const now = Date.now();
      record.agentId = input.launchSpec.agentId;
      record.background = input.launchSpec.background;
      record.updatedAt = now;
      record.launchSpec = createLaunchSpecSummary(input.launchSpec, input.runtimeSummary);
      this.emitChange("updated", record);
      return cloneRecord(record);
    });
  }

  async updateTaskWorktreeRuntime(
    taskId: string,
    input: {
      runtimeSummary: Partial<SubTaskWorktreeRuntimeSummary>;
    },
  ): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      record.updatedAt = Date.now();
      record.launchSpec = mergeLaunchSpecWorktreeRuntime(record.launchSpec, input.runtimeSummary);
      this.emitChange("updated", record);
      return cloneRecord(record);
    });
  }

  async markQueued(taskId: string, position: number): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const now = Date.now();
      record.status = "pending";
      record.updatedAt = now;
      record.progress = {
        phase: "pending",
        message: `Queued at position ${position}.`,
        lastActivityAt: now,
      };
      record.summary = inferSummary(record, `Queued at position ${position}.`);
      this.pushNotification(record, "queued", `Queued at position ${position}.`);
      this.emitChange("updated", record);
      return cloneRecord(record);
    });
  }

  async requestStop(taskId: string, reason = "Task stop requested by user."): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      if (isTerminalStatus(record.status)) return cloneRecord(record);
      const now = Date.now();
      record.stopRequestedAt = now;
      record.stopReason = reason;
      record.updatedAt = now;
      record.progress = {
        phase: record.status,
        message: record.sessionId ? "Task stop requested. Waiting for runtime shutdown." : "Task stop requested before execution.",
        lastActivityAt: now,
      };
      record.summary = inferSummary(record, record.progress.message);
      this.pushNotification(record, "stop_requested", reason);
      this.emitChange("stop_requested", record);
      return cloneRecord(record);
    });
  }

  async markStopped(
    taskId: string,
    input: {
      reason?: string;
      sessionId?: string;
    } = {},
  ): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const now = Date.now();
      const reason = input.reason?.trim() || record.stopReason || "Task stopped by user.";
      if (input.sessionId && input.sessionId !== record.sessionId) {
        record.sessionId = input.sessionId;
        this.sessionToTask.set(input.sessionId, taskId);
      }
      record.status = "stopped";
      record.updatedAt = now;
      record.finishedAt = now;
      record.stopRequestedAt = record.stopRequestedAt ?? now;
      record.stopReason = reason;
      record.error = reason;
      record.progress = {
        phase: "stopped",
        message: reason,
        lastActivityAt: now,
      };
      record.summary = inferSummary(record, reason);
      this.pushNotification(record, "stopped", reason);
      this.emitChange("stopped", record);
      return cloneRecord(record);
    });
  }

  async archiveTask(taskId: string, reason = "Archived by user."): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const now = Date.now();
      record.archivedAt = now;
      record.archiveReason = reason;
      record.updatedAt = now;
      this.pushNotification(record, "archived", reason);
      this.emitChange("archived", record);
      return cloneRecord(record);
    });
  }

  async attachSession(taskId: string, sessionId: string, agentId?: string): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const now = Date.now();
      record.sessionId = sessionId;
      if (agentId?.trim()) {
        record.agentId = agentId.trim();
        record.launchSpec.agentId = agentId.trim();
      }
      record.status = "running";
      record.updatedAt = now;
      record.progress = {
        phase: "running",
        message: "Task is running.",
        lastActivityAt: now,
      };
      record.summary = inferSummary(record, "Task is running.");
      this.sessionToTask.set(sessionId, taskId);
      this.pushNotification(record, "started", `Task started in session ${sessionId}.`);
      this.emitChange("updated", record);
      return cloneRecord(record);
    });
  }

  async recordThoughtDeltaBySession(sessionId: string, delta: string): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const taskId = this.sessionToTask.get(sessionId);
      if (!taskId) return undefined;
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const snippet = truncateText(delta, 180);
      if (!snippet) return cloneRecord(record);
      const now = Date.now();
      record.updatedAt = now;
      record.progress = {
        phase: record.status === "pending" ? "running" : record.status,
        message: snippet,
        lastActivityAt: now,
      };
      if (record.status === "pending") {
        record.status = "running";
      }
      record.summary = inferSummary(record, snippet);
      this.emitChange("updated", record);
      return cloneRecord(record);
    });
  }

  async completeTask(taskId: string, input: CompleteSubTaskInput): Promise<SubTaskRecord | undefined> {
    await this.load();
    return this.mutate(async () => {
      const record = this.records.get(taskId);
      if (!record) return undefined;
      const now = Date.now();
      if (input.sessionId && input.sessionId !== record.sessionId) {
        record.sessionId = input.sessionId;
        this.sessionToTask.set(input.sessionId, taskId);
      }
      record.status = input.status;
      record.updatedAt = now;
      record.finishedAt = now;
      record.error = input.error ?? (input.status === "stopped" ? (record.stopReason || "Task stopped by user.") : undefined);
      if (typeof input.output === "string" && input.output.trim()) {
        record.outputPreview = truncateText(input.output, 200);
        const outputPath = path.join(this.outputsDir, taskId, OUTPUT_FILENAME);
        await atomicWriteText(outputPath, input.output);
        record.outputPath = outputPath;
      }
      record.progress = {
        phase: input.status,
        message: input.status === "done"
          ? "Task completed."
          : input.status === "stopped"
            ? (record.stopReason || "Task stopped by user.")
          : input.error
            ? truncateText(input.error, 180)
            : "Task finished with an error.",
        lastActivityAt: now,
      };
      record.summary = inferSummary(record, record.progress.message);
      this.pushNotification(
        record,
        inferNotificationKind(input.status),
        input.status === "done"
          ? "Task completed successfully."
          : input.error || "Task finished with an error.",
      );
      this.emitChange(input.status === "stopped" ? "stopped" : "completed", record);
      return cloneRecord(record);
    });
  }

  async getTask(taskId: string): Promise<SubTaskRecord | undefined> {
    await this.load();
    const record = this.records.get(taskId);
    return record ? cloneRecord(record) : undefined;
  }

  async listTasks(parentConversationId?: string, options: { includeArchived?: boolean } = {}): Promise<SubTaskRecord[]> {
    await this.load();
    return [...this.records.values()]
      .filter((record) => !parentConversationId || record.parentConversationId === parentConversationId)
      .filter((record) => options.includeArchived ? true : !record.archivedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((record) => cloneRecord(record));
  }

  async listSessionInfos(parentConversationId?: string, options: { includeArchived?: boolean } = {}): Promise<SessionInfo[]> {
    const records = await this.listTasks(parentConversationId, options);
    return records.map((record) => ({
      id: record.sessionId ?? record.id,
      taskId: record.id,
      parentId: record.parentConversationId,
      agentId: record.agentId,
      status: record.status,
      createdAt: record.createdAt,
      finishedAt: record.finishedAt,
      summary: record.summary,
      progressText: record.progress.message,
      outputPath: record.outputPath,
      notificationCount: record.notifications.length,
    }));
  }

  private normalizeRecord(source: unknown): SubTaskRecord | null {
    if (!source || typeof source !== "object") return null;
    const value = source as Record<string, unknown>;
    const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
    if (!id) return null;
    const status = this.normalizeStatus(value.status);
    const createdAt = Number(value.createdAt);
    const updatedAt = Number(value.updatedAt);
    const progressSource = value.progress && typeof value.progress === "object"
      ? value.progress as Record<string, unknown>
      : {};
    const launchSpecSource = value.launchSpec && typeof value.launchSpec === "object" && !Array.isArray(value.launchSpec)
      ? value.launchSpec as Record<string, unknown>
      : undefined;
    const rawContextKeys = launchSpecSource
      ? launchSpecSource.contextKeys
      : undefined;
    const fallbackLaunchSpec = normalizeAgentLaunchSpec({
      instruction: typeof value.instruction === "string" ? value.instruction : "",
      parentConversationId: typeof value.parentConversationId === "string" ? value.parentConversationId : "system",
      agentId: typeof value.agentId === "string" && value.agentId.trim() ? value.agentId : "default",
      background: value.background !== false,
    });
    const notifications = Array.isArray(value.notifications)
      ? value.notifications
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const current = item as Record<string, unknown>;
          return {
            id: typeof current.id === "string" ? current.id : `task_notification_${crypto.randomUUID().slice(0, 8)}`,
            kind: this.normalizeNotificationKind(current.kind),
            message: typeof current.message === "string" ? current.message : "",
            createdAt: Number(current.createdAt) || Date.now(),
          };
        })
      : [];
    return {
      id,
      kind: "sub_agent",
      parentConversationId: typeof value.parentConversationId === "string" ? value.parentConversationId : "system",
      sessionId: typeof value.sessionId === "string" && value.sessionId.trim() ? value.sessionId : undefined,
      agentId: typeof value.agentId === "string" && value.agentId.trim() ? value.agentId : "default",
      launchSpec: {
        ...createLaunchSpecSummary(fallbackLaunchSpec),
        ...(launchSpecSource
          ? {
            agentId: typeof launchSpecSource.agentId === "string" && String(launchSpecSource.agentId).trim()
              ? String(launchSpecSource.agentId).trim()
              : fallbackLaunchSpec.agentId,
            profileId: typeof launchSpecSource.profileId === "string" && String(launchSpecSource.profileId).trim()
              ? String(launchSpecSource.profileId).trim()
              : fallbackLaunchSpec.profileId,
            background: launchSpecSource.background !== false,
            timeoutMs: Number.isFinite(Number(launchSpecSource.timeoutMs))
              ? Number(launchSpecSource.timeoutMs)
              : fallbackLaunchSpec.timeoutMs,
            channel: typeof launchSpecSource.channel === "string" && String(launchSpecSource.channel).trim()
              ? String(launchSpecSource.channel).trim()
              : fallbackLaunchSpec.channel,
            cwd: typeof launchSpecSource.cwd === "string" && String(launchSpecSource.cwd).trim()
              ? String(launchSpecSource.cwd).trim()
              : fallbackLaunchSpec.cwd,
            resolvedCwd: typeof launchSpecSource.resolvedCwd === "string" && String(launchSpecSource.resolvedCwd).trim()
              ? String(launchSpecSource.resolvedCwd).trim()
              : fallbackLaunchSpec.cwd,
            toolSet: Array.isArray(launchSpecSource.toolSet)
              ? launchSpecSource.toolSet
                .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                .map((item) => item.trim())
              : fallbackLaunchSpec.toolSet,
            role: launchSpecSource.role === "coder" || launchSpecSource.role === "researcher" || launchSpecSource.role === "verifier" || launchSpecSource.role === "default"
              ? launchSpecSource.role
              : fallbackLaunchSpec.role,
            allowedToolFamilies: Array.isArray(launchSpecSource.allowedToolFamilies)
              ? launchSpecSource.allowedToolFamilies
                .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                .map((item) => item.trim())
              : fallbackLaunchSpec.allowedToolFamilies,
            maxToolRiskLevel: launchSpecSource.maxToolRiskLevel === "low"
              || launchSpecSource.maxToolRiskLevel === "medium"
              || launchSpecSource.maxToolRiskLevel === "high"
              || launchSpecSource.maxToolRiskLevel === "critical"
              ? launchSpecSource.maxToolRiskLevel
              : fallbackLaunchSpec.maxToolRiskLevel,
            policySummary: typeof launchSpecSource.policySummary === "string" && String(launchSpecSource.policySummary).trim()
              ? String(launchSpecSource.policySummary).trim()
              : fallbackLaunchSpec.policySummary,
            permissionMode: typeof launchSpecSource.permissionMode === "string" && String(launchSpecSource.permissionMode).trim()
              ? String(launchSpecSource.permissionMode).trim()
              : fallbackLaunchSpec.permissionMode,
            isolationMode: typeof launchSpecSource.isolationMode === "string" && String(launchSpecSource.isolationMode).trim()
              ? String(launchSpecSource.isolationMode).trim()
              : fallbackLaunchSpec.isolationMode,
            parentTaskId: typeof launchSpecSource.parentTaskId === "string" && String(launchSpecSource.parentTaskId).trim()
              ? String(launchSpecSource.parentTaskId).trim()
              : fallbackLaunchSpec.parentTaskId,
            contextKeys: Array.isArray(rawContextKeys)
              ? rawContextKeys
                .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                .map((item) => item.trim())
              : createLaunchSpecSummary(fallbackLaunchSpec).contextKeys,
            worktreePath: typeof launchSpecSource.worktreePath === "string" && String(launchSpecSource.worktreePath).trim()
              ? String(launchSpecSource.worktreePath).trim()
              : undefined,
            worktreeRepoRoot: typeof launchSpecSource.worktreeRepoRoot === "string" && String(launchSpecSource.worktreeRepoRoot).trim()
              ? String(launchSpecSource.worktreeRepoRoot).trim()
              : undefined,
            worktreeBranch: typeof launchSpecSource.worktreeBranch === "string" && String(launchSpecSource.worktreeBranch).trim()
              ? String(launchSpecSource.worktreeBranch).trim()
              : undefined,
            worktreeStatus: isWorktreeRuntimeStatus(launchSpecSource.worktreeStatus)
              ? launchSpecSource.worktreeStatus
              : createLaunchSpecSummary(fallbackLaunchSpec).worktreeStatus,
            worktreeError: typeof launchSpecSource.worktreeError === "string" && String(launchSpecSource.worktreeError).trim()
              ? String(launchSpecSource.worktreeError).trim()
              : undefined,
          }
          : {}),
      },
      background: value.background !== false,
      status,
      instruction: typeof value.instruction === "string" ? value.instruction : "",
      summary: typeof value.summary === "string" ? value.summary : "",
      progress: {
        phase: this.normalizeStatus(progressSource.phase ?? status),
        message: typeof progressSource.message === "string" ? progressSource.message : undefined,
        lastActivityAt: Number(progressSource.lastActivityAt) || updatedAt || createdAt || Date.now(),
      },
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Number.isFinite(createdAt) ? createdAt : Date.now(),
      finishedAt: Number.isFinite(Number(value.finishedAt)) ? Number(value.finishedAt) : undefined,
      stopRequestedAt: Number.isFinite(Number(value.stopRequestedAt)) ? Number(value.stopRequestedAt) : undefined,
      stopReason: typeof value.stopReason === "string" ? value.stopReason : undefined,
      archivedAt: Number.isFinite(Number(value.archivedAt)) ? Number(value.archivedAt) : undefined,
      archiveReason: typeof value.archiveReason === "string" ? value.archiveReason : undefined,
      outputPath: typeof value.outputPath === "string" && value.outputPath.trim() ? value.outputPath : undefined,
      outputPreview: typeof value.outputPreview === "string" ? value.outputPreview : undefined,
      error: typeof value.error === "string" ? value.error : undefined,
      notifications: notifications.slice(-MAX_NOTIFICATIONS),
    };
  }

  private normalizeStatus(value: unknown): SubTaskStatus {
    switch (value) {
      case "pending":
      case "running":
      case "done":
      case "error":
      case "timeout":
      case "stopped":
        return value;
      default:
        return "pending";
    }
  }

  private normalizeNotificationKind(value: unknown): SubTaskNotificationKind {
    switch (value) {
      case "queued":
      case "started":
      case "progress":
      case "stop_requested":
      case "stopped":
      case "archived":
      case "completed":
      case "failed":
      case "timeout":
        return value;
      default:
        return "progress";
    }
  }

  private pushNotification(record: SubTaskRecord, kind: SubTaskNotificationKind, message: string): void {
    record.notifications.push({
      id: `task_notification_${crypto.randomUUID().slice(0, 8)}`,
      kind,
      message,
      createdAt: Date.now(),
    });
    if (record.notifications.length > MAX_NOTIFICATIONS) {
      record.notifications = record.notifications.slice(-MAX_NOTIFICATIONS);
    }
  }

  private async mutate<T>(mutator: () => Promise<T>): Promise<T> {
    let result!: T;
    const run = this.writeChain.then(async () => {
      result = await mutator();
      await this.persist();
    });
    this.writeChain = run.catch(() => {});
    await run;
    return result;
  }

  private async persist(): Promise<void> {
    const state: SubTaskRuntimeState = {
      version: STATE_VERSION,
      items: [...this.records.values()]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((record) => ({
          ...record,
          launchSpec: {
            ...record.launchSpec,
            toolSet: record.launchSpec.toolSet ? [...record.launchSpec.toolSet] : undefined,
            allowedToolFamilies: record.launchSpec.allowedToolFamilies ? [...record.launchSpec.allowedToolFamilies] : undefined,
            contextKeys: record.launchSpec.contextKeys ? [...record.launchSpec.contextKeys] : undefined,
          },
          progress: { ...record.progress },
          notifications: record.notifications.map((item) => ({ ...item })),
        })),
    };
    await atomicWriteText(this.statePath, JSON.stringify(state, null, 2));
  }

  private emitChange(kind: SubTaskChangeEvent["kind"], record: SubTaskRecord): void {
    const item = cloneRecord(record);
    for (const listener of this.listeners) {
      try {
        listener({ kind, item });
      } catch (error) {
        this.logger?.warn?.("Failed to emit subtask runtime listener event.", error);
      }
    }
  }
}

function isWorktreeRuntimeStatus(value: unknown): value is WorktreeRuntimeStatus {
  return value === "not_requested" || value === "pending" || value === "created" || value === "failed";
}

function inferTaskStatusFromResult(result: SubAgentResult): Extract<SubTaskStatus, "done" | "error" | "timeout" | "stopped"> {
  if (result.success) return "done";
  if (/stopped|cancelled before execution/i.test(String(result.error ?? ""))) return "stopped";
  return /timed out/i.test(String(result.error ?? "")) ? "timeout" : "error";
}

type SpawnWithCallbacks = OrchestratorSpawnOptions;

type SubAgentSpawner = Pick<SubAgentOrchestrator, "spawn" | "listSessions">;

export function createSubTaskRuntimeEventHandler(
  runtimeStore: SubTaskRuntimeStore,
  logger?: RuntimeLogger,
): (event: SubAgentEvent) => void {
  return (event) => {
    if (event.type !== "thought_delta") return;
    void runtimeStore.recordThoughtDeltaBySession(event.sessionId, event.delta).catch((error) => {
      logger?.warn?.("Failed to record subtask progress delta.", error);
    });
  };
}

export async function reconcileSubTaskWorktreeRuntimes(input: {
  runtimeStore: SubTaskRuntimeStore;
  worktreeRuntime: SubTaskWorktreeRuntime;
  logger?: RuntimeLogger;
}): Promise<{
  scanned: number;
  reconciled: number;
  cleaned: number;
  failed: number;
}> {
  const tasks = await input.runtimeStore.listTasks(undefined, { includeArchived: true });
  let scanned = 0;
  let reconciled = 0;
  let cleaned = 0;
  let failed = 0;

  for (const task of tasks) {
    if (task.launchSpec.isolationMode !== "worktree") {
      continue;
    }
    scanned += 1;

    const runtimeSummary = task.archivedAt
      ? await input.worktreeRuntime.cleanupTaskRuntime(task.id, task.launchSpec)
      : await input.worktreeRuntime.reconcileTaskRuntime(task.id, task.launchSpec);

    await input.runtimeStore.updateTaskWorktreeRuntime(task.id, {
      runtimeSummary,
    });

    if (task.archivedAt) {
      if (runtimeSummary.worktreeStatus === "removed") {
        cleaned += 1;
      } else if (runtimeSummary.worktreeStatus === "remove_failed") {
        failed += 1;
      }
    } else if (runtimeSummary.worktreeStatus === "created") {
      reconciled += 1;
    } else if (runtimeSummary.worktreeStatus === "failed" || runtimeSummary.worktreeStatus === "missing") {
      failed += 1;
    }
  }

  input.logger?.info?.("Reconciled persisted subtask worktree runtimes.", {
    scanned,
    reconciled,
    cleaned,
    failed,
  });

  return {
    scanned,
    reconciled,
    cleaned,
    failed,
  };
}

export function createSubTaskWorktreeLifecycleHandler(input: {
  runtimeStore: SubTaskRuntimeStore;
  worktreeRuntime: SubTaskWorktreeRuntime;
  logger?: RuntimeLogger;
}): (event: SubTaskChangeEvent) => void {
  return (event) => {
    if (event.kind !== "archived" || event.item.launchSpec.isolationMode !== "worktree") {
      return;
    }
    void (async () => {
      const current = await input.runtimeStore.getTask(event.item.id);
      if (!current?.archivedAt) {
        return;
      }
      const runtimeSummary = await input.worktreeRuntime.cleanupTaskRuntime(current.id, current.launchSpec);
      await input.runtimeStore.updateTaskWorktreeRuntime(current.id, {
        runtimeSummary,
      });
    })().catch((error) => {
      input.logger?.warn?.("Failed to cleanup archived subtask worktree runtime.", {
        taskId: event.item.id,
        error,
      });
    });
  };
}

export function createSubTaskAgentCapabilities(input: {
  orchestrator: SubAgentSpawner;
  runtimeStore: SubTaskRuntimeStore;
  worktreeRuntime?: SubTaskWorktreeRuntime;
  logger?: RuntimeLogger;
}): AgentCapabilities {
  const spawnOne = async (opts: SpawnSubAgentOptions): Promise<SubAgentResult> => {
    const launchSpec = normalizeAgentLaunchSpec({
      instruction: opts.instruction,
      parentConversationId: opts.parentConversationId ?? "system",
      agentId: opts.agentId,
      profileId: opts.profileId,
      background: opts.background,
      timeoutMs: opts.timeoutMs,
      channel: opts.channel ?? "subtask",
      context: opts.context as Record<string, unknown> | undefined,
      cwd: opts.cwd,
      toolSet: opts.toolSet,
      permissionMode: opts.permissionMode,
      isolationMode: opts.isolationMode,
      parentTaskId: opts.parentTaskId,
      role: opts.role,
      allowedToolFamilies: opts.allowedToolFamilies,
      maxToolRiskLevel: opts.maxToolRiskLevel,
      policySummary: opts.policySummary,
    });
    const task = await input.runtimeStore.createTask({
      launchSpec,
    });

    let attachedSessionId: string | undefined;
    let resolvedLaunchSpec = launchSpec;
    try {
      if (input.worktreeRuntime) {
        try {
          const prepared = await input.worktreeRuntime.prepareTaskLaunch(task.id, launchSpec);
          resolvedLaunchSpec = prepared.launchSpec;
          await input.runtimeStore.updateTaskLaunchSpec(task.id, {
            launchSpec: resolvedLaunchSpec,
            runtimeSummary: {
              requestedCwd: launchSpec.cwd,
              ...prepared.summary,
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await input.runtimeStore.updateTaskLaunchSpec(task.id, {
            launchSpec,
            runtimeSummary: {
              requestedCwd: launchSpec.cwd,
              resolvedCwd: launchSpec.cwd,
              worktreeStatus: "failed",
              worktreeError: errorMessage,
            },
          });
          const completed = await input.runtimeStore.completeTask(task.id, {
            status: "error",
            output: "",
            error: errorMessage,
          });
          return {
            success: false,
            output: "",
            error: errorMessage,
            taskId: task.id,
            outputPath: completed?.outputPath,
          };
        }
      }

      const spawnOptions: SpawnWithCallbacks = {
        launchSpec: resolvedLaunchSpec,
        shouldAbortBeforeStart: async () => {
          const current = await input.runtimeStore.getTask(task.id);
          return Boolean(current && (current.status === "stopped" || current.stopRequestedAt));
        },
        onQueued: (position: number) => {
          void input.runtimeStore.markQueued(task.id, position).catch((error) => {
            input.logger?.warn?.("Failed to mark queued subtask.", error);
          });
        },
        onSessionCreated: (sessionId: string, resolvedAgentId: string) => {
          attachedSessionId = sessionId;
          void input.runtimeStore.attachSession(task.id, sessionId, resolvedAgentId).catch((error) => {
            input.logger?.warn?.("Failed to attach subtask session.", {
              error,
              taskId: task.id,
              sessionId,
              agentId: resolvedAgentId,
            });
          });
        },
      };
      const result = await input.orchestrator.spawn(spawnOptions);
      const completed = await input.runtimeStore.completeTask(task.id, {
        status: inferTaskStatusFromResult(result),
        sessionId: result.sessionId ?? attachedSessionId,
        output: result.output,
        error: result.error,
      });
      return {
        ...result,
        sessionId: result.sessionId ?? attachedSessionId,
        taskId: task.id,
        outputPath: completed?.outputPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const completed = await input.runtimeStore.completeTask(task.id, {
        status: /timed out/i.test(errorMessage) ? "timeout" : "error",
        sessionId: attachedSessionId,
        output: "",
        error: errorMessage,
      });
      return {
        success: false,
        output: "",
        error: errorMessage,
        sessionId: attachedSessionId,
        taskId: task.id,
        outputPath: completed?.outputPath,
      };
    }
  };

  return {
    spawnSubAgent: (opts: SpawnSubAgentOptions) => spawnOne(opts),
    spawnParallel: (tasks: SpawnSubAgentOptions[]) => Promise.all(tasks.map((task: SpawnSubAgentOptions) => spawnOne(task))),
    listSessions: (parentConversationId?: string) => input.runtimeStore.listSessionInfos(parentConversationId),
  };
}
