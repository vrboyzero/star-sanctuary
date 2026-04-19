import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { DreamObsidianMirrorOptions, MemorySearchResult } from "@belldandy/memory";
import { getGlobalMemoryManager, writeObsidianCommonsExport } from "@belldandy/memory";

import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";
import { resolveResidentSharedStateDir } from "./resident-memory-policy.js";
import {
  getResidentSharedPromotionMetadata,
  type ResidentSharedPromotionMetadata,
} from "./resident-shared-memory.js";

type CommonsExportStatus = "idle" | "running" | "completed" | "failed" | "skipped";

export interface ObsidianCommonsRuntimeState {
  version: 1;
  status: CommonsExportStatus;
  updatedAt: string;
  lastRunId?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  approvedCount?: number;
  revokedCount?: number;
  noteCount?: number;
  agentPageCount?: number;
  targetPath?: string;
  indexPath?: string;
  error?: string;
}

export interface ObsidianCommonsRuntimeResult {
  state: ObsidianCommonsRuntimeState;
  exported: boolean;
}

export interface ObsidianCommonsRuntimeLogger {
  debug?: (message: string, data?: unknown) => void;
  warn?: (message: string, data?: unknown) => void;
  error?: (message: string, data?: unknown) => void;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function truncateText(value: unknown, maxLength = 240): string | undefined {
  const normalized = normalizeText(value)?.replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return truncateText(error.message, 240) ?? error.name;
  }
  return truncateText(String(error), 240) ?? "Unknown Commons export error";
}

function buildStatePath(stateDir: string): string {
  return path.join(stateDir, "obsidian-commons-runtime.json");
}

function buildRunId(now: Date): string {
  const datePart = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `commons-${datePart}-${crypto.randomUUID().slice(0, 8)}`;
}

function createDefaultState(now = new Date()): ObsidianCommonsRuntimeState {
  return {
    version: 1,
    status: "idle",
    updatedAt: now.toISOString(),
  };
}

function normalizeState(raw: unknown): ObsidianCommonsRuntimeState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createDefaultState();
  }
  const value = raw as Record<string, unknown>;
  const status = value.status === "running"
    || value.status === "completed"
    || value.status === "failed"
    || value.status === "skipped"
    ? value.status
    : "idle";
  return {
    version: 1,
    status,
    updatedAt: normalizeText(value.updatedAt) ?? new Date().toISOString(),
    ...(normalizeText(value.lastRunId) ? { lastRunId: normalizeText(value.lastRunId) } : {}),
    ...(normalizeText(value.lastAttemptAt) ? { lastAttemptAt: normalizeText(value.lastAttemptAt) } : {}),
    ...(normalizeText(value.lastSuccessAt) ? { lastSuccessAt: normalizeText(value.lastSuccessAt) } : {}),
    ...(normalizeText(value.lastFailureAt) ? { lastFailureAt: normalizeText(value.lastFailureAt) } : {}),
    ...(typeof value.approvedCount === "number" ? { approvedCount: Math.max(0, Math.floor(value.approvedCount)) } : {}),
    ...(typeof value.revokedCount === "number" ? { revokedCount: Math.max(0, Math.floor(value.revokedCount)) } : {}),
    ...(typeof value.noteCount === "number" ? { noteCount: Math.max(0, Math.floor(value.noteCount)) } : {}),
    ...(typeof value.agentPageCount === "number" ? { agentPageCount: Math.max(0, Math.floor(value.agentPageCount)) } : {}),
    ...(truncateText(value.targetPath, 320) ? { targetPath: truncateText(value.targetPath, 320) } : {}),
    ...(truncateText(value.indexPath, 320) ? { indexPath: truncateText(value.indexPath, 320) } : {}),
    ...(truncateText(value.error, 240) ? { error: truncateText(value.error, 240) } : {}),
  };
}

async function atomicWriteJson(targetPath: string, value: ObsidianCommonsRuntimeState): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tmpPath, targetPath);
}

function isApprovedExportPromotion(
  promotion: ResidentSharedPromotionMetadata | null | undefined,
): promotion is ResidentSharedPromotionMetadata & { status: "approved" | "active" } {
  return promotion?.status === "approved" || promotion?.status === "active";
}

function isRevokedExportPromotion(
  promotion: ResidentSharedPromotionMetadata | null | undefined,
): promotion is ResidentSharedPromotionMetadata & { status: "revoked" } {
  return promotion?.status === "revoked";
}

function mapApprovedExportItem(
  item: MemorySearchResult,
  promotion: ResidentSharedPromotionMetadata & { status: "approved" | "active" },
) {
  return {
    sharedChunkId: promotion.targetSharedChunkId,
    sourceAgentId: promotion.sourceAgentId,
    sourceChunkId: promotion.sourceChunkId,
    sourcePath: promotion.sourcePath,
    sharedStatus: promotion.status,
    sharedReviewedAt: promotion.reviewedAt,
    reviewerAgentId: promotion.reviewerAgentId,
    decisionNote: promotion.decisionNote,
    reason: promotion.reason,
    category: item.category,
    memoryType: item.memoryType,
    topic: typeof item.metadata?.topic === "string" ? item.metadata.topic : undefined,
    summary: item.summary,
    snippet: item.snippet,
    content: item.content,
    updatedAt: item.updatedAt,
  } as const;
}

function mapRevokedExportItem(
  item: MemorySearchResult,
  promotion: ResidentSharedPromotionMetadata & { status: "revoked" },
) {
  return {
    sharedChunkId: promotion.targetSharedChunkId,
    sourceAgentId: promotion.sourceAgentId,
    sourceChunkId: promotion.sourceChunkId,
    sourcePath: promotion.sourcePath,
    sharedStatus: "revoked",
    sharedReviewedAt: promotion.reviewedAt ?? promotion.revokedAt,
    reviewerAgentId: promotion.reviewerAgentId,
    decisionNote: promotion.decisionNote,
    reason: promotion.reason,
    category: item.category,
    memoryType: item.memoryType,
    topic: typeof item.metadata?.topic === "string" ? item.metadata.topic : undefined,
    summary: item.summary,
    snippet: item.snippet,
    content: item.content,
    updatedAt: item.updatedAt,
  } as const;
}

export class ObsidianCommonsRuntime {
  private readonly stateDir: string;
  private readonly statePath: string;
  private readonly residentMemoryManagers?: ScopedMemoryManagerRecord[];
  private readonly mirror?: DreamObsidianMirrorOptions;
  private readonly logger?: ObsidianCommonsRuntimeLogger;
  private readonly nowProvider: () => Date;
  private loadPromise: Promise<void> | null = null;
  private state: ObsidianCommonsRuntimeState | null = null;
  private activeRun: Promise<ObsidianCommonsRuntimeResult> | null = null;

  constructor(options: {
    stateDir: string;
    residentMemoryManagers?: ScopedMemoryManagerRecord[];
    mirror?: DreamObsidianMirrorOptions;
    logger?: ObsidianCommonsRuntimeLogger;
    now?: () => Date;
  }) {
    this.stateDir = path.resolve(options.stateDir);
    this.statePath = buildStatePath(this.stateDir);
    this.residentMemoryManagers = options.residentMemoryManagers;
    this.mirror = options.mirror
      ? {
          enabled: options.mirror.enabled === true,
          vaultPath: normalizeText(options.mirror.vaultPath),
          rootDir: normalizeText(options.mirror.rootDir),
        }
      : undefined;
    this.logger = options.logger;
    this.nowProvider = options.now ?? (() => new Date());
  }

  getAvailability(): {
    enabled: boolean;
    available: boolean;
    reason?: string;
    sharedStateDir?: string;
    vaultPath?: string;
  } {
    if (this.mirror?.enabled !== true) {
      return {
        enabled: false,
        available: false,
        reason: "commons export disabled",
        sharedStateDir: this.resolveSharedStateDir(),
        vaultPath: this.mirror?.vaultPath,
      };
    }
    if (!this.mirror?.vaultPath) {
      return {
        enabled: true,
        available: false,
        reason: "missing commons vault path",
        sharedStateDir: this.resolveSharedStateDir(),
      };
    }
    const sharedStateDir = this.resolveSharedStateDir();
    if (!sharedStateDir) {
      return {
        enabled: true,
        available: false,
        reason: "resident memory managers unavailable",
        vaultPath: this.mirror.vaultPath,
      };
    }
    const sharedManager = getGlobalMemoryManager({ workspaceRoot: sharedStateDir });
    if (!sharedManager) {
      return {
        enabled: true,
        available: false,
        reason: "shared memory manager unavailable",
        sharedStateDir,
        vaultPath: this.mirror.vaultPath,
      };
    }
    return {
      enabled: true,
      available: true,
      sharedStateDir,
      vaultPath: this.mirror.vaultPath,
    };
  }

  async getState(): Promise<ObsidianCommonsRuntimeState> {
    await this.load();
    return { ...(this.state ?? createDefaultState()) };
  }

  async runNow(): Promise<ObsidianCommonsRuntimeResult> {
    if (this.activeRun) {
      return this.activeRun;
    }
    const task = this.runInternal().finally(() => {
      this.activeRun = null;
    });
    this.activeRun = task;
    return task;
  }

  private async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      await fs.mkdir(this.stateDir, { recursive: true });
      try {
        const raw = await fs.readFile(this.statePath, "utf-8");
        this.state = normalizeState(JSON.parse(raw));
      } catch {
        this.state = createDefaultState(this.nowProvider());
      }
    })();
    return this.loadPromise;
  }

  private async persist(next: ObsidianCommonsRuntimeState): Promise<ObsidianCommonsRuntimeState> {
    const normalized = normalizeState(next);
    this.state = normalized;
    await atomicWriteJson(this.statePath, normalized);
    return { ...normalized };
  }

  private resolveSharedStateDir(): string | undefined {
    const record = this.residentMemoryManagers?.[0];
    return record?.policy.sharedStateDir ?? resolveResidentSharedStateDir(this.stateDir);
  }

  private async runInternal(): Promise<ObsidianCommonsRuntimeResult> {
    await this.load();
    const availability = this.getAvailability();
    const startedAt = this.nowProvider();
    const startedIso = startedAt.toISOString();
    const runId = buildRunId(startedAt);

    await this.persist({
      ...(this.state ?? createDefaultState(startedAt)),
      status: "running",
      updatedAt: startedIso,
      lastRunId: runId,
      lastAttemptAt: startedIso,
      error: undefined,
    });

    if (!availability.available) {
      const status = availability.enabled ? "failed" : "skipped";
      const next = await this.persist({
        ...(this.state ?? createDefaultState(startedAt)),
        status,
        updatedAt: startedIso,
        lastRunId: runId,
        lastAttemptAt: startedIso,
        ...(status === "failed" ? { lastFailureAt: startedIso } : {}),
        error: availability.reason,
      });
      return {
        state: next,
        exported: false,
      };
    }

    const sharedManager = getGlobalMemoryManager({ workspaceRoot: availability.sharedStateDir! });
    if (!sharedManager) {
      const next = await this.persist({
        ...(this.state ?? createDefaultState(startedAt)),
        status: "failed",
        updatedAt: startedIso,
        lastRunId: runId,
        lastAttemptAt: startedIso,
        lastFailureAt: startedIso,
        error: "shared memory manager unavailable",
      });
      return {
        state: next,
        exported: false,
      };
    }

    try {
      const totalCandidates = sharedManager.countChunks({
        scope: "shared",
        sharedPromotionStatus: ["approved", "active", "revoked"],
      });
      const items = sharedManager.getRecent(Math.max(totalCandidates + 20, 50), {
        scope: "shared",
        sharedPromotionStatus: ["approved", "active", "revoked"],
      }, true);

      const approvedItems = items
        .map((item) => {
          const promotion = getResidentSharedPromotionMetadata(item);
          if (!isApprovedExportPromotion(promotion)) return null;
          return mapApprovedExportItem(item, promotion);
        })
        .filter((item): item is ReturnType<typeof mapApprovedExportItem> => Boolean(item));

      const revokedItems = items
        .map((item) => {
          const promotion = getResidentSharedPromotionMetadata(item);
          if (!isRevokedExportPromotion(promotion)) return null;
          return mapRevokedExportItem(item, promotion);
        })
        .filter((item): item is ReturnType<typeof mapRevokedExportItem> => Boolean(item));

      const exportResult = await writeObsidianCommonsExport({
        mirror: this.mirror,
        approvedItems,
        revokedItems,
        agentIds: [...new Set((this.residentMemoryManagers ?? []).map((item) => item.agentId))],
        now: this.nowProvider,
      });
      const completedAt = this.nowProvider().toISOString();
      const next = await this.persist({
        version: 1,
        status: "completed",
        updatedAt: completedAt,
        lastRunId: runId,
        lastAttemptAt: startedIso,
        lastSuccessAt: completedAt,
        approvedCount: exportResult.approvedCount,
        revokedCount: exportResult.revokedCount,
        noteCount: exportResult.noteCount,
        agentPageCount: exportResult.agentPageCount,
        targetPath: exportResult.commonsPath,
        indexPath: exportResult.indexPath,
      });
      this.logger?.debug?.("commons export completed", {
        runId,
        approvedCount: exportResult.approvedCount,
        revokedCount: exportResult.revokedCount,
      });
      return {
        state: next,
        exported: true,
      };
    } catch (error) {
      const finishedAt = this.nowProvider().toISOString();
      const next = await this.persist({
        ...(this.state ?? createDefaultState(startedAt)),
        status: "failed",
        updatedAt: finishedAt,
        lastRunId: runId,
        lastAttemptAt: startedIso,
        lastFailureAt: finishedAt,
        error: serializeError(error),
      });
      this.logger?.error?.("commons export failed", {
        runId,
        error: next.error,
      });
      return {
        state: next,
        exported: false,
      };
    }
  }
}
