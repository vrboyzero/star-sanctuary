import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";

import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveEnvFilePaths } from "@star-sanctuary/distribution";

import {
  createDurableExtractionSurface,
  DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
  DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
  DurableExtractionRuntime,
  getGlobalMemoryManager,
  guardTeamSharedMemoryWrite,
  type DurableExtractionDigestSnapshot,
  type DurableExtractionRecord,
} from "@belldandy/memory";
import { DEFAULT_STATE_DIR_DISPLAY, type TokenUsageUploadConfig } from "@belldandy/protocol";
import { MockAgent, type BelldandyAgent, ConversationStore, type AgentRegistry, extractIdentityInfo, type Conversation, type ConversationMessage, type ModelProfile } from "@belldandy/agent";
import type {
  GatewayFrame,
  GatewayReqFrame,
  GatewayResFrame,
  GatewayEventFrame,
  MessageSendParams,
  ChatMessageMeta,
  ConversationMetaMessage,
  ConnectRequestFrame,
  BelldandyRole,
  GatewayAuth,
} from "@belldandy/protocol";
import { ensurePairingCode, isClientAllowed, resolveStateDir } from "./security/store.js";
import type { BelldandyLogger } from "./logger/index.js";
import type { ToolsConfigManager } from "./tools-config.js";
import type { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import type { SubTaskRecord, SubTaskRuntimeStore } from "./task-runtime.js";
import {
  applyToolControlChanges,
  buildToolControlDisabledPayload,
  resolvePendingToolControlRequest,
  resolveToolControlPolicySnapshot,
  tryApproveToolControlPasswordInput,
} from "./tool-control-policy.js";
import {
  MemoryRuntimeBudgetGuard,
  MemoryRuntimeUsageAccounting,
  SlidingWindowRateLimiter,
  type MemoryBudgetDecision,
  type RateLimitState,
} from "./memory-runtime-budget.js";
import {
  buildMemoryRuntimeDoctorReport,
  getDurableExtractionAvailability,
} from "./memory-runtime-introspection.js";
import { buildExtensionGovernanceReport } from "./extension-governance.js";
import { loadExtensionMarketplaceState } from "./extension-marketplace-state.js";
import { buildExtensionRuntimeReport } from "./extension-runtime.js";
import type { ExtensionHostState } from "./extension-host.js";
import { handleMessageSendWithQueryRuntime, MessageSendConfigurationError } from "./query-runtime-message-send.js";
import {
  handleConversationDigestGetWithQueryRuntime,
  handleConversationDigestRefreshWithQueryRuntime,
  handleConversationMemoryExtractionGetWithQueryRuntime,
  handleConversationMemoryExtractWithQueryRuntime,
} from "./query-runtime-memory.js";
import {
  handleSubTaskArchiveWithQueryRuntime,
  handleSubTaskGetWithQueryRuntime,
  handleSubTaskListWithQueryRuntime,
  handleSubTaskStopWithQueryRuntime,
} from "./query-runtime-subtask.js";
import {
  handleWorkspaceListWithQueryRuntime,
  handleWorkspaceReadWithQueryRuntime,
  handleWorkspaceReadSourceWithQueryRuntime,
  handleWorkspaceWriteWithQueryRuntime,
} from "./query-runtime-workspace.js";
import {
  handleToolSettingsConfirmWithQueryRuntime,
  handleToolsListWithQueryRuntime,
  handleToolsUpdateWithQueryRuntime,
} from "./query-runtime-tools.js";
import {
  handleCommunityMessageWithQueryRuntime,
  handleWebhookReceiveWithQueryRuntime,
  type QueryRuntimeHttpJsonResponse,
} from "./query-runtime-http.js";
import { QueryRuntimeTraceStore } from "./query-runtime-trace.js";
import { notifyConversationToolEvent } from "./query-runtime-side-effects.js";
import type { ToolExecutor, TranscribeOptions, TranscribeResult, SkillRegistry } from "@belldandy/skills";
import type { ToolExecutionRuntimeContext } from "@belldandy/skills";
import {
  checkAndConsumeRestartCooldown,
  formatRestartCooldownMessage,
  publishSkillCandidate,
  TOOL_SETTINGS_CONTROL_NAME,
} from "@belldandy/skills";
import type { PluginRegistry } from "@belldandy/plugins";
import type { WebhookConfig, WebhookRequestParams, IdempotencyManager } from "./webhook/index.js";
import { BELLDANDY_VERSION } from "./version.generated.js";
import type { GoalManager } from "./goals/manager.js";

export type GatewayServerOptions = {
  port: number;
  host?: string; // [NEW] Allow binding to specific host
  auth: {
    mode: "none" | "token" | "password";
    token?: string;
    password?: string;
  };
  webRoot: string;
  envDir?: string;
  stateDir?: string;
  additionalWorkspaceRoots?: string[];
  agentFactory?: () => BelldandyAgent;
  /** Multi-Agent registry (takes precedence over agentFactory when agentId is specified) */
  agentRegistry?: AgentRegistry;
  /** 主模型配置（用于 models.list 返回默认模型） */
  primaryModelConfig?: { baseUrl: string; apiKey: string; model: string };
  /** 备用模型配置（来自 models.json） */
  modelFallbacks?: ModelProfile[];
  conversationStoreOptions?: { maxHistory?: number; ttlSeconds?: number };
  conversationStore?: ConversationStore; // [NEW] Allow passing shared instance
  onActivity?: () => void;
  /** 可选：统一 Logger，未提供时使用 console */
  logger?: BelldandyLogger;
  /** Server-side auto TTS: check if TTS mode is enabled */
  ttsEnabled?: () => boolean;
  /** Server-side auto TTS: synthesize speech from text */
  ttsSynthesize?: (text: string) => Promise<{ webPath: string; htmlAudio: string } | null>;
  /** 调用设置管理器 */
  toolsConfigManager?: ToolsConfigManager;
  /** 工具执行器（用于获取已注册工具列表） */
  toolExecutor?: ToolExecutor;
  /** 工具调用设置确认存储 */
  toolControlConfirmationStore?: ToolControlConfirmationStore;
  /** 获取 Agent 工具控制模式 */
  getAgentToolControlMode?: () => "disabled" | "confirm" | "auto";
  /** 获取 Agent 工具控制确认密码 */
  getAgentToolControlConfirmPassword?: () => string | undefined;
  /** STT implementation: transcribe speech from audio buffer */
  sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
  /** 插件注册表（用于获取已加载插件列表） */
  pluginRegistry?: PluginRegistry;
  /** 扩展宿主快照（用于统一 extension runtime / lifecycle 诊断） */
  extensionHost?: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle">;
  /** 可选：检查当前是否已配置好 AI 模型（用于 hello-ok 中告知前端是否需要引导配置）*/
  isConfigured?: () => boolean;
  /** 技能注册表（用于获取已加载技能列表） */
  skillRegistry?: SkillRegistry;
  /** 长期任务管理器 */
  goalManager?: GoalManager;
  /** 子任务运行时存储 */
  subTaskRuntimeStore?: SubTaskRuntimeStore;
  /** 子任务停止控制 */
  stopSubTask?: (taskId: string, reason?: string) => Promise<SubTaskRecord | undefined>;
  /** Webhook 配置 */
  webhookConfig?: WebhookConfig;
  /** Webhook 幂等性管理器 */
  webhookIdempotency?: IdempotencyManager;
};

export type GatewayServer = {
  port: number;
  host: string;
  close: () => Promise<void>;
  broadcast: (frame: GatewayEventFrame) => void;
};

type GatewayLog = {
  debug: (module: string, message: string, data?: unknown) => void;
  info: (module: string, message: string, data?: unknown) => void;
  warn: (module: string, message: string, data?: unknown) => void;
  error: (module: string, message: string, data?: unknown) => void;
};

type ToolVisibilityPayload = {
  available: boolean;
  reasonCode: string;
  reasonMessage: string;
  alwaysEnabled?: boolean;
  contractReason?: string;
};

class MemoryBudgetExceededError extends Error {
  readonly decision: MemoryBudgetDecision;

  constructor(decision: MemoryBudgetDecision) {
    super(decision.reasonMessage || "Memory runtime budget exceeded.");
    this.name = "MemoryBudgetExceededError";
    this.decision = decision;
  }
}

function summarizeGroupedVisibility(entries: ToolVisibilityPayload[]): ToolVisibilityPayload {
  if (entries.length === 0) {
    return {
      available: true,
      reasonCode: "available",
      reasonMessage: "",
    };
  }
  if (entries.some((item) => item.available)) {
    return {
      available: true,
      reasonCode: "available",
      reasonMessage: "",
    };
  }
  const first = entries[0];
  const uniqueReasonCodes = [...new Set(entries.map((item) => item.reasonCode).filter(Boolean))];
  if (uniqueReasonCodes.length === 1) {
    return {
      available: false,
      reasonCode: first.reasonCode,
      reasonMessage: first.reasonMessage,
    };
  }
  return {
    available: false,
    reasonCode: "blocked-by-security-matrix",
    reasonMessage: `All tools in this group are currently unavailable: ${uniqueReasonCodes.join(", ")}`,
  };
}

const DEFAULT_METHODS = [
  "message.send",
  "tool_settings.confirm",
  "models.list",
  "config.read",
  "config.update",
  "system.doctor",
  "system.restart",
  "workspace.list",
  "workspace.read",
  "workspace.readSource",
  "workspace.write",
  "context.compact",
  "conversation.meta",
  "conversation.digest.get",
  "conversation.digest.refresh",
  "conversation.memory.extract",
  "conversation.memory.extraction.get",
  "subtask.list",
  "subtask.get",
  "subtask.stop",
  "subtask.archive",
  "tools.list",
  "tools.update",
  "agents.list",
  "memory.search",
  "memory.get",
  "memory.recent",
  "memory.stats",
  "memory.task.list",
  "memory.task.get",
  "experience.candidate.get",
  "experience.candidate.list",
  "experience.candidate.accept",
  "experience.candidate.reject",
  "experience.usage.get",
  "experience.usage.list",
  "experience.usage.stats",
  "experience.usage.revoke",
  "goal.create",
  "goal.list",
  "goal.get",
  "goal.resume",
  "goal.pause",
  "goal.handoff.generate",
  "goal.retrospect.generate",
  "goal.experience.suggest",
  "goal.method_candidates.generate",
  "goal.skill_candidates.generate",
  "goal.flow_patterns.generate",
  "goal.flow_patterns.cross_goal",
  "goal.review_governance.summary",
  "goal.approval.scan",
  "goal.suggestion_review.list",
  "goal.suggestion_review.workflow.set",
  "goal.suggestion_review.decide",
  "goal.suggestion_review.escalate",
  "goal.suggestion_review.scan",
  "goal.suggestion.publish",
  "goal.checkpoint.list",
  "goal.checkpoint.request",
  "goal.checkpoint.approve",
  "goal.checkpoint.reject",
  "goal.checkpoint.expire",
  "goal.checkpoint.reopen",
  "goal.checkpoint.escalate",
  "goal.task_graph.read",
  "goal.task_graph.create",
  "goal.task_graph.update",
  "goal.task_graph.claim",
  "goal.task_graph.pending_review",
  "goal.task_graph.validating",
  "goal.task_graph.complete",
  "goal.task_graph.block",
  "goal.task_graph.fail",
  "goal.task_graph.skip",
];
const DEFAULT_EVENTS = [
  "chat.delta",
  "chat.final",
  "agent.status",
  "token.usage",
  "token.counter.result",
  "conversation.digest.updated",
  "conversation.memory.extraction.updated",
  "goal.update",
  "subtask.update",
  "pairing.required",
  "tools.config.updated",
  "tool_settings.confirm.required",
  "tool_settings.confirm.resolved",
];
const DEFAULT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const DEFAULT_ATTACHMENT_TEXT_CHAR_LIMIT = 200_000;
const DEFAULT_ATTACHMENT_TEXT_TOTAL_CHAR_LIMIT = 200_000;
const DEFAULT_AUDIO_TRANSCRIPT_APPEND_CHAR_LIMIT = 12_000;

type AttachmentLimits = {
  maxFileBytes: number;
  maxTotalBytes: number;
};

type AttachmentPromptLimits = {
  textCharLimit: number;
  totalTextCharLimit: number;
  audioTranscriptAppendCharLimit: number;
};

function isUnderRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const rel = path.relative(resolvedRoot, path.resolve(target));
  return !(rel.startsWith("..") || path.isAbsolute(rel));
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function parsePositiveIntEnv(varName: string, fallback: number): number {
  const raw = process.env[varName];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseOptionalPositiveIntEnv(varName: string): number | undefined {
  const raw = process.env[varName];
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function readEnvTrimmed(varName: string): string | undefined {
  const raw = process.env[varName];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function buildDurableExtractionUnavailableError(
  durableExtractionRuntime?: DurableExtractionRuntime,
): { code: string; message: string } {
  const availability = getDurableExtractionAvailability(durableExtractionRuntime);
  if (availability.available) {
    return {
      code: "not_available",
      message: "Durable extraction runtime is not available.",
    };
  }
  const code = availability.reasonCodes[0] ?? "not_available";
  const detail = availability.reasonMessages.join(" ");
  return {
    code,
    message: detail
      ? `Durable extraction runtime is not available. ${detail}`
      : "Durable extraction runtime is not available.",
  };
}

function formatRateLimitState(rateLimit: RateLimitState): string {
  if (!rateLimit.configured) {
    return "unlimited";
  }
  const base = `${rateLimit.observedRuns}/${rateLimit.maxRuns} in ${rateLimit.windowMs}ms`;
  if (rateLimit.status === "limited") {
    return `${base}, retryAfter=${rateLimit.retryAfterMs ?? 0}ms`;
  }
  return base;
}

function getAttachmentLimits(): AttachmentLimits {
  return {
    maxFileBytes: parsePositiveIntEnv("BELLDANDY_ATTACHMENT_MAX_FILE_BYTES", DEFAULT_ATTACHMENT_MAX_FILE_BYTES),
    maxTotalBytes: parsePositiveIntEnv("BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES", DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES),
  };
}

function getAttachmentPromptLimits(): AttachmentPromptLimits {
  return {
    textCharLimit: parsePositiveIntEnv("BELLDANDY_ATTACHMENT_TEXT_CHAR_LIMIT", DEFAULT_ATTACHMENT_TEXT_CHAR_LIMIT),
    totalTextCharLimit: parsePositiveIntEnv("BELLDANDY_ATTACHMENT_TEXT_TOTAL_CHAR_LIMIT", DEFAULT_ATTACHMENT_TEXT_TOTAL_CHAR_LIMIT),
    audioTranscriptAppendCharLimit: parsePositiveIntEnv("BELLDANDY_AUDIO_TRANSCRIPT_APPEND_CHAR_LIMIT", DEFAULT_AUDIO_TRANSCRIPT_APPEND_CHAR_LIMIT),
  };
}

function truncateTextForPrompt(text: string, limit: number, suffix: string): { text: string; truncated: boolean } {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  if (limit <= 0) {
    return { text: "", truncated: true };
  }
  if (limit <= suffix.length) {
    return { text: text.slice(0, limit), truncated: true };
  }
  return {
    text: `${text.slice(0, Math.max(0, limit - suffix.length))}${suffix}`,
    truncated: true,
  };
}

function estimateBase64DecodedBytes(base64: string): number | null {
  const normalized = base64.trim().replace(/\s+/g, "");
  if (!normalized) return 0;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  if (normalized.length % 4 !== 0) return null;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, (normalized.length / 4) * 3 - padding);
}

async function statIfExists(targetPath: string): Promise<fs.Stats | null> {
  try {
    return await fsp.stat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function mergeEnvContentIntoConfig(raw: string, config: Record<string, string>): void {
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        config[key] = val;
      }
    }
  });
}

async function readEnvFileIntoConfig(filePath: string, config: Record<string, string>): Promise<void> {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    mergeEnvContentIntoConfig(raw, config);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return;
    }
  }
}

async function writeTextFileAtomic(filePath: string, content: string, options: { ensureParent?: boolean; mode?: number } = {}): Promise<void> {
  if (options.ensureParent) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true, mode: options.mode });
  }
  const tmpFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tmpFile, content, "utf-8");
  await fsp.rename(tmpFile, filePath);
}

async function writeBinaryFileAtomic(filePath: string, content: Buffer, options: { ensureParent?: boolean; mode?: number } = {}): Promise<void> {
  if (options.ensureParent) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true, mode: options.mode });
  }
  const tmpFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tmpFile, content);
  await fsp.rename(tmpFile, filePath);
}

async function updateEnvFile(filePath: string, changes: Record<string, string>): Promise<boolean> {
  if (Object.keys(changes).length === 0) return true;

  let lines: string[] = [];
  try {
    lines = (await fsp.readFile(filePath, "utf-8")).split(/\r?\n/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
      return false;
    }
  }

  const newKeys = new Set(Object.keys(changes));
  const nextLines: string[] = [];
  const handledKeys = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        if (newKeys.has(key)) {
          nextLines.push(`${key}="${changes[key]}"`);
          handledKeys.add(key);
          matched = true;
        }
      }
    }
    if (!matched) nextLines.push(line);
  }

  for (const key of newKeys) {
    if (!handledKeys.has(key)) {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
      nextLines.push(`${key}="${changes[key]}"`);
    }
  }

  if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");

  try {
    await writeTextFileAtomic(filePath, nextLines.join("\n"), { ensureParent: true });
    return true;
  } catch {
    return false;
  }
}

const AVATAR_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME_TYPES = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
]);

type AvatarUploadRole = "user" | "agent";

type AvatarUploadFileLike = File;

function normalizeAvatarUploadRole(value: unknown): AvatarUploadRole | null {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (role === "user" || role === "agent") {
    return role;
  }
  return null;
}

function isAvatarUploadFileLike(value: FormDataEntryValue | null): value is AvatarUploadFileLike {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as AvatarUploadFileLike).arrayBuffer === "function"
    && typeof (value as AvatarUploadFileLike).size === "number"
    && typeof (value as AvatarUploadFileLike).type === "string"
    && typeof (value as AvatarUploadFileLike).name === "string";
}

function resolveAvatarUploadExtension(file: AvatarUploadFileLike): string | null {
  const mimeType = file.type.trim().toLowerCase();
  if (AVATAR_ALLOWED_MIME_TYPES.has(mimeType)) {
    return AVATAR_ALLOWED_MIME_TYPES.get(mimeType) ?? null;
  }

  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp") {
    if (ext === ".jpeg") return ".jpg";
    return ext;
  }

  return null;
}

function replaceAvatarMarkdown(content: string, avatarPath: string): string {
  const avatarLinePattern = /^(\s*[-*]?\s*\*\*头像[：:]\*\*\s*)(.*)$/m;
  if (avatarLinePattern.test(content)) {
    return content.replace(avatarLinePattern, `$1${avatarPath}`);
  }

  const emojiLinePattern = /^(\s*[-*]?\s*\*\*Emoji[：:]\*\*\s*.*)$/m;
  const avatarLine = `- **头像：** ${avatarPath}`;
  if (!content.trim()) {
    return `${avatarLine}\n`;
  }
  if (emojiLinePattern.test(content)) {
    return content.replace(emojiLinePattern, `$1\n${avatarLine}`);
  }

  const nameLinePattern = /^(\s*[-*]?\s*\*\*名字[：:]\*\*\s*.*)$/m;
  if (nameLinePattern.test(content)) {
    return content.replace(nameLinePattern, `$1\n${avatarLine}`);
  }

  return `${content.trimEnd()}\n\n${avatarLine}\n`;
}

function resolveAgentIdentityDir(
  rootDir: string,
  agentRegistry: AgentRegistry | undefined,
  agentId: string | undefined,
): { dir: string; profileId: string } | null {
  const resolvedAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
  if (resolvedAgentId === "default") {
    return { dir: rootDir, profileId: "default" };
  }

  const profile = agentRegistry?.getProfile(resolvedAgentId);
  if (!profile) return null;

  const workspaceDir = profile.workspaceDir?.trim() || profile.id;
  return {
    dir: path.join(rootDir, "agents", workspaceDir),
    profileId: profile.id,
  };
}

function readHeaderValue(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  return undefined;
}

function isAuthorizedAvatarUpload(req: http.IncomingMessage, auth: GatewayServerOptions["auth"]): boolean {
  if (auth.mode === "none") {
    return true;
  }

  if (auth.mode === "token") {
    const bearer = readHeaderValue(req.headers, "authorization");
    const token = bearer?.startsWith("Bearer ") ? bearer.slice("Bearer ".length).trim() : "";
    return Boolean(auth.token?.trim()) && token === auth.token?.trim();
  }

  const password = readHeaderValue(req.headers, "x-belldandy-password");
  return Boolean(auth.password?.trim()) && password === auth.password?.trim();
}

async function requestToFormData(req: http.IncomingMessage): Promise<FormData> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") continue;
    if (Array.isArray(value)) {
      headers.set(name, value.join(", "));
    } else {
      headers.set(name, value);
    }
  }

  const url = `http://127.0.0.1${req.url ?? "/"}`;
  const request = new Request(url, {
    method: req.method ?? "POST",
    headers,
    body: Readable.toWeb(req) as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return request.formData();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalMessageTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;
  const offsetText = minutes > 0 ? `GMT${sign}${hours}:${pad2(minutes)}` : `GMT${sign}${hours}`;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ${offsetText}`;
}

function toChatMessageMeta(timestampMs: number, isLatest = false): ChatMessageMeta {
  return {
    timestampMs,
    displayTimeText: formatLocalMessageTime(timestampMs),
    isLatest,
  };
}

function normalizeConversationMessage(message: ConversationMessage, isLatest: boolean): ConversationMetaMessage {
  return {
    role: message.role,
    content: message.content,
    timestampMs: message.timestamp,
    displayTimeText: formatLocalMessageTime(message.timestamp),
    isLatest,
    agentId: message.agentId,
    clientContext: message.clientContext,
  };
}

function buildConversationMetaMessages(conversation?: Conversation): ConversationMetaMessage[] {
  if (!conversation?.messages?.length) return [];
  return conversation.messages.map((message, index) => normalizeConversationMessage(message, index === conversation.messages.length - 1));
}

export async function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer> {
  await ensureWebRoot(opts.webRoot);
  const stateDir = opts.stateDir ?? resolveStateDir();
  const avatarDir = path.join(stateDir, "avatar");

  const log: GatewayLog = opts.logger
    ? {
      debug: (m: string, msg: string, d?: unknown) => opts.logger!.debug(m, msg, d),
      info: (m: string, msg: string, d?: unknown) => opts.logger!.info(m, msg, d),
      warn: (m: string, msg: string, d?: unknown) => opts.logger!.warn(m, msg, d),
      error: (m: string, msg: string, d?: unknown) => opts.logger!.error(m, msg, d),
    }
    : {
      debug: () => { },
      info: (m: string, msg: string) => console.log(`[${m}] ${msg}`),
      warn: (m: string, msg: string, d?: unknown) => console.warn(`[${m}] ${msg}`, d ?? ""),
      error: (m: string, msg: string, d?: unknown) => console.error(`[${m}] ${msg}`, d ?? ""),
    };

  const app = express();
  if (opts.stateDir) {
    const generatedDir = path.join(opts.stateDir, "generated");
    try {
      await fsp.mkdir(generatedDir, { recursive: true });
    } catch {
      // ignore
    }
    app.use("/generated", express.static(generatedDir));
    log.info("gateway", `Static: serving /generated -> ${generatedDir}`);
  }
  app.use("/avatar", express.static(avatarDir));
  log.info("gateway", `Static: serving /avatar -> ${avatarDir}`);

  app.use(express.static(opts.webRoot));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(opts.webRoot, "index.html"));
  });

  // Health check endpoint for Docker/K8s
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: BELLDANDY_VERSION,
    });
  });

  app.post("/api/avatar/upload", async (req, res) => {
    try {
      if (!isAuthorizedAvatarUpload(req, opts.auth)) {
        const challenge = opts.auth.mode === "token"
          ? { header: "WWW-Authenticate", value: 'Bearer realm="belldandy-upload"' }
          : null;
        if (challenge) {
          res.setHeader(challenge.header, challenge.value);
        }
        return res.status(401).json({
          ok: false,
          error: {
            code: "unauthorized",
            message: opts.auth.mode === "password"
              ? "Missing or invalid x-belldandy-password header."
              : "Missing or invalid bearer token.",
          },
        });
      }

      const formData = await requestToFormData(req);
      const role = normalizeAvatarUploadRole(formData.get("role"));
      const rawAgentId = formData.get("agentId");
      const requestedAgentId = typeof rawAgentId === "string" && rawAgentId.trim()
        ? rawAgentId.trim()
        : undefined;
      if (!role) {
        return res.status(400).json({
          ok: false,
          error: { code: "invalid_role", message: 'role must be "user" or "agent".' },
        });
      }

      const rawFile = formData.get("file");
      if (!isAvatarUploadFileLike(rawFile)) {
        return res.status(400).json({
          ok: false,
          error: { code: "missing_file", message: "file is required." },
        });
      }

      if (rawFile.size <= 0) {
        return res.status(400).json({
          ok: false,
          error: { code: "missing_file", message: "file is empty." },
        });
      }
      if (rawFile.size > AVATAR_UPLOAD_MAX_BYTES) {
        return res.status(413).json({
          ok: false,
          error: { code: "file_too_large", message: `file exceeds ${AVATAR_UPLOAD_MAX_BYTES} bytes.` },
        });
      }

      const ext = resolveAvatarUploadExtension(rawFile);
      if (!ext) {
        return res.status(400).json({
          ok: false,
          error: { code: "invalid_file_type", message: "Only png, jpg, gif, and webp images are allowed." },
        });
      }

      await fsp.mkdir(avatarDir, { recursive: true });
      const fileName = `avatar-${role}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
      const avatarPath = `/avatar/${fileName}`;
      const targetFile = path.join(avatarDir, fileName);
      let mdPath = path.join(stateDir, role === "user" ? "USER.md" : "IDENTITY.md");
      if (role === "agent" && requestedAgentId) {
        const identityTarget = resolveAgentIdentityDir(stateDir, opts.agentRegistry, requestedAgentId);
        if (!identityTarget) {
          return res.status(404).json({
            ok: false,
            error: { code: "invalid_agent", message: `Agent "${requestedAgentId}" does not exist.` },
          });
        }
        mdPath = path.join(identityTarget.dir, "IDENTITY.md");
      }

      let previousMarkdown = "";
      try {
        previousMarkdown = await fsp.readFile(mdPath, "utf-8");
      } catch (error) {
        const err = error as NodeJS.ErrnoException | undefined;
        if (err?.code === "ENOENT") {
          return res.status(404).json({
            ok: false,
            error: { code: "md_not_found", message: `${path.basename(mdPath)} does not exist.` },
          });
        }
        throw error;
      }

      const fileBuffer = Buffer.from(await rawFile.arrayBuffer());
      await writeBinaryFileAtomic(targetFile, fileBuffer, { ensureParent: true, mode: 0o600 });

      try {
        const nextMarkdown = replaceAvatarMarkdown(previousMarkdown, avatarPath);
        await writeTextFileAtomic(mdPath, nextMarkdown, { ensureParent: true, mode: 0o600 });
      } catch (error) {
        await fsp.unlink(targetFile).catch(() => {});
        return res.status(500).json({
          ok: false,
          error: { code: "md_update_failed", message: error instanceof Error ? error.message : String(error) },
        });
      }

      return res.status(200).json({
        ok: true,
        role,
        agentId: role === "agent" ? requestedAgentId ?? "default" : undefined,
        avatarPath,
        mdPath,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: { code: "write_failed", message: error instanceof Error ? error.message : String(error) },
      });
    }
  });

  // Community message endpoint (for office.goddess.ai integration)
  const communityApiEnabled = String(process.env.BELLDANDY_COMMUNITY_API_ENABLED ?? "false").toLowerCase() === "true";
  const communityApiToken =
    process.env.BELLDANDY_COMMUNITY_API_TOKEN
    ?? process.env.BELLDANDY_AUTH_TOKEN
    ?? (opts.auth.mode === "token" ? opts.auth.token : undefined);
  const tokenUsageUploadConfig: TokenUsageUploadConfig = {
    enabled: String(process.env.BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED ?? "false").toLowerCase() === "true",
    url: readEnvTrimmed("BELLDANDY_TOKEN_USAGE_UPLOAD_URL"),
    token:
      readEnvTrimmed("BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY")
      ?? readEnvTrimmed("BELLDANDY_TOKEN_USAGE_UPLOAD_TOKEN"), // backward compatible
    timeoutMs: parsePositiveIntEnv("BELLDANDY_TOKEN_USAGE_UPLOAD_TIMEOUT_MS", 3000),
  };

  app.use(express.json());
  if (!communityApiEnabled) {
    app.post("/api/message", (_req, res) => {
      res.status(404).json({
        ok: false,
        error: {
          code: "API_DISABLED",
          message: "Community API is disabled. Set BELLDANDY_COMMUNITY_API_ENABLED=true to enable.",
        },
      });
    });
  } else {
    app.post("/api/message", async (req, res) => {
      const response = await handleCommunityMessageWithQueryRuntime({
        requestId: `api.message:${crypto.randomUUID()}`,
        authorization: req.headers.authorization,
        communityApiToken,
        body: req.body,
        agentFactory: opts.agentFactory,
        agentRegistry: opts.agentRegistry,
        conversationStore,
        log,
        runtimeObserver: queryRuntimeTraceStore.createObserver<"api.message">(),
        emitAutoRunTaskTokenResult: (store, payload) => {
          emitAutoRunTaskTokenResult(store, payload);
        },
      });
      sendHttpJson(res, response);
    });
  }

  // Webhook endpoint (for external system integration)
  const webhookEnabled = opts.webhookConfig && opts.webhookConfig.webhooks.length > 0;
  if (!webhookEnabled) {
    app.post("/api/webhook/:id", (_req, res) => {
      res.status(404).json({
        ok: false,
        error: {
          code: "WEBHOOK_DISABLED",
          message: `Webhook API is disabled. Configure webhooks in ${DEFAULT_STATE_DIR_DISPLAY}/webhooks.json to enable.`,
        },
      });
    });
  } else {
    app.post("/api/webhook/:id", async (req, res) => {
      const response = await handleWebhookReceiveWithQueryRuntime({
        requestId: `webhook.receive:${crypto.randomUUID()}`,
        webhookId: req.params.id,
        authorization: req.headers.authorization,
        idempotencyKey: typeof req.headers["x-idempotency-key"] === "string" ? req.headers["x-idempotency-key"] : undefined,
        body: req.body as WebhookRequestParams,
        agentFactory: opts.agentFactory,
        agentRegistry: opts.agentRegistry,
        webhookConfig: opts.webhookConfig,
        webhookIdempotency: opts.webhookIdempotency,
        conversationStore,
        log,
        runtimeObserver: queryRuntimeTraceStore.createObserver<"webhook.receive">(),
        emitAutoRunTaskTokenResult: (store, payload) => {
          emitAutoRunTaskTokenResult(store, payload);
        },
      });
      sendHttpJson(res, response);
    });
  }

  const server = http.createServer(app);

  // [SECURITY] Origin Header 白名单校验（防 CSWSH）
  const allowedOriginsRaw = process.env.BELLDANDY_ALLOWED_ORIGINS;
  const hostVal = opts.host ?? "127.0.0.1";
  const isLocalBinding = hostVal === "127.0.0.1" || hostVal === "localhost";
  const allowedOriginsSource = allowedOriginsRaw
    ? allowedOriginsRaw.split(",").map((o) => o.trim()).filter(Boolean)
    : []; // 公网绑定时默认拒绝所有跨域（需显式配置）
  const allowedOrigins = allowedOriginsSource
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  const wss = new WebSocketServer({
    server,
    verifyClient: (info: { origin?: string; req: http.IncomingMessage; secure: boolean }) => {
      const rawOrigin = info.origin || "";

      // 若未配置白名单（空数组），则仅对公网绑定生效（拒绝所有）
      if (allowedOrigins.length === 0 && isLocalBinding) {
        if (!rawOrigin) {
          return true; // 本地开发下允许无 Origin 的客户端
        }
        const allowed = isLocalLoopbackOrigin(rawOrigin);
        if (!allowed) {
          log.info("ws", `Rejected origin: ${rawOrigin}`);
        }
        return allowed;
      }
      if (allowedOrigins.length === 0) {
        log.error("ws", `Rejected connection: no allowed origins configured for ${hostVal}`);
        return false;
      }
      const origin = normalizeOrigin(rawOrigin);
      if (!origin) {
        log.info("ws", `Rejected origin: ${rawOrigin}`);
        return false;
      }
      const allowed = allowedOrigins.includes(origin);
      if (!allowed) {
        log.info("ws", `Rejected origin: ${rawOrigin}`);
      }
      return allowed;
    },
  });
  const broadcastEvent = (frame: GatewayEventFrame) => {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(frame));
      }
    }
  };
  const detachSubTaskBroadcast = opts.subTaskRuntimeStore?.subscribe((event) => {
    broadcastEvent({
      type: "event",
      event: "subtask.update",
      payload: {
        kind: event.kind,
        item: event.item,
      },
    });
  });

  // 初始化会话存储
  const sessionsDir = path.join(stateDir, "sessions");

  // Ensure sessions dir exists
  await fsp.mkdir(sessionsDir, { recursive: true });
  await fsp.mkdir(avatarDir, { recursive: true });

  const conversationStore = opts.conversationStore ?? new ConversationStore({
    ...opts.conversationStoreOptions,
    dataDir: sessionsDir,
  });
  const memoryUsageAccounting = new MemoryRuntimeUsageAccounting({
    stateDir,
    logger: {
      warn: (message, data) => log.warn("memory-usage", message, data),
    },
  });
  await memoryUsageAccounting.load();
  const memoryBudgetGuard = MemoryRuntimeBudgetGuard.fromEnv(memoryUsageAccounting);
  const durableExtractionRequestRateLimiter = new SlidingWindowRateLimiter(
    parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS"),
    parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS") ?? 60 * 60 * 1_000,
  );
  const queryRuntimeTraceStore = new QueryRuntimeTraceStore();
  (opts.toolExecutor as (ToolExecutor & {
    setBroadcast?: (
      broadcast?: (event: string, payload: Record<string, unknown>) => void,
    ) => void;
    setBroadcastObserver?: (
      observer?: (event: string, payload: Record<string, unknown>, meta: {
        conversationId: string;
        agentId?: string;
        toolName: string;
      }) => void,
    ) => void;
  }) | undefined)?.setBroadcast?.((event: string, payload: Record<string, unknown>) => {
    broadcastEvent({
      type: "event",
      event,
      payload,
    });
  });
  (opts.toolExecutor as (ToolExecutor & {
    setBroadcastObserver?: (
      observer?: (event: string, payload: Record<string, unknown>, meta: {
        conversationId: string;
        agentId?: string;
        toolName: string;
      }) => void,
    ) => void;
  }) | undefined)?.setBroadcastObserver?.((event: string, payload: Record<string, unknown>, meta: {
    conversationId: string;
    agentId?: string;
    toolName: string;
  }) => {
    notifyConversationToolEvent(meta.conversationId, {
      event,
      toolName: meta.toolName,
      agentId: meta.agentId,
      source: payload.source,
      mode: payload.mode,
    });
  });

  const durableExtractionManager = getGlobalMemoryManager();
  const durableExtractionRuntime = durableExtractionManager
    ? new DurableExtractionRuntime({
      stateDir,
      extractor: createDurableExtractionSurface(durableExtractionManager),
      getMessages: async (conversationId) => {
        const conversation = conversationStore.get(conversationId);
        return (conversation?.messages ?? []).map((item) => ({
          role: item.role,
          content: item.content,
        }));
      },
      getDigest: async (conversationId) => {
        const digest = await conversationStore.getSessionDigest(conversationId);
        return toDurableExtractionDigestSnapshot(digest);
      },
      minPendingMessages: parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_MIN_PENDING_MESSAGES"),
      minMessageDelta: parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_MIN_MESSAGE_DELTA"),
      successCooldownMs: parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_SUCCESS_COOLDOWN_MS"),
      failureBackoffMs: parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_FAILURE_BACKOFF_MS"),
      failureBackoffMaxMs: parseOptionalPositiveIntEnv("BELLDANDY_MEMORY_DURABLE_EXTRACTION_FAILURE_BACKOFF_MAX_MS"),
      canStartRun: async (event) => {
        const decision = await memoryBudgetGuard.evaluateDurableExtractionRun();
        if (!decision.allowed) {
          const usageEvent = {
            consumer: "durable_extraction_run",
            outcome: "blocked",
            timestamp: Date.now(),
            conversationId: event.conversationId,
            source: event.source,
            metadata: {
              extractionKey: event.extractionKey,
              digestAt: event.digestAt,
              messageCount: event.messageCount,
              threshold: event.threshold,
              digestStatus: event.digestStatus,
              runCount: event.projectedRunCount,
              reasonCode: decision.reasonCode,
              reasonMessage: decision.reasonMessage,
              retryAfterMs: decision.retryAfterMs,
              observedRuns: decision.observedRuns,
              maxRuns: decision.maxRuns,
              windowMs: decision.windowMs,
            },
          } as const;
          memoryBudgetGuard.noteEvent(usageEvent);
          await memoryUsageAccounting.recordEvent(usageEvent);
          return {
            allowed: false,
            reason: decision.reasonCode ?? "durable_extraction_run_budget_exceeded",
            retryAfterMs: decision.retryAfterMs,
          };
        }
        return { allowed: true };
      },
      onRunStarted: async (event) => {
        const usageEvent = {
          consumer: "durable_extraction_run",
          outcome: "started",
          timestamp: Date.now(),
          conversationId: event.conversationId,
          source: event.source,
          metadata: {
            extractionKey: event.extractionKey,
            digestAt: event.digestAt,
            messageCount: event.messageCount,
            threshold: event.threshold,
            digestStatus: event.digestStatus,
            runCount: event.projectedRunCount,
          },
        } as const;
        memoryBudgetGuard.noteEvent(usageEvent);
        await memoryUsageAccounting.recordEvent(usageEvent);
      },
      onRunFinished: async (event) => {
        const usageEvent = {
          consumer: "durable_extraction_run",
          outcome: event.failure ? "failed" : "completed",
          timestamp: Date.now(),
          conversationId: event.conversationId,
          source: event.source,
          quantity: event.extractedCount,
          metadata: {
            extractionKey: event.extractionKey,
            digestAt: event.digestAt,
            messageCount: event.messageCount,
            threshold: event.threshold,
            digestStatus: event.digestStatus,
            runCount: event.runCount,
            failure: event.failure,
          },
        } as const;
        memoryBudgetGuard.noteEvent(usageEvent);
        await memoryUsageAccounting.recordEvent(usageEvent);
      },
      logger: {
        debug: (message, data) => log.debug("durable-extraction", message, data),
        warn: (message, data) => log.warn("durable-extraction", message, data),
        error: (message, data) => log.error("durable-extraction", message, data),
      },
    })
    : undefined;
  await durableExtractionRuntime?.load();

  const requestDurableExtraction = async (input: {
    conversationId: string;
    source: string;
    digest: DurableExtractionDigestSnapshot;
  }): Promise<DurableExtractionRecord | undefined> => {
    if (!durableExtractionRuntime?.isAvailable()) {
      return undefined;
    }
    const decision = durableExtractionRequestRateLimiter.evaluate(
      DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
      DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
    );
    if (!decision.allowed) {
      const usageEvent = {
        consumer: "durable_extraction_request",
        outcome: "blocked",
        timestamp: Date.now(),
        conversationId: input.conversationId,
        source: input.source,
        metadata: {
          digestAt: input.digest.lastDigestAt,
          messageCount: input.digest.messageCount,
          threshold: input.digest.threshold,
          digestStatus: input.digest.status,
          reasonCode: decision.reasonCode,
          reasonMessage: decision.reasonMessage,
          retryAfterMs: decision.retryAfterMs,
          observedRuns: decision.observedRuns,
          maxRuns: decision.maxRuns,
          windowMs: decision.windowMs,
        },
      } as const;
      memoryBudgetGuard.noteEvent(usageEvent);
      await memoryUsageAccounting.recordEvent(usageEvent);
      return durableExtractionRuntime.getRecord(input.conversationId);
    }
    const record = await durableExtractionRuntime.requestExtraction(input);
    const requestEvent = {
      consumer: "durable_extraction_request",
      outcome: record.status === "queued" || record.pending ? "queued" : "skipped",
      timestamp: Date.now(),
      conversationId: input.conversationId,
      source: input.source,
      metadata: {
        digestAt: input.digest.lastDigestAt,
        messageCount: input.digest.messageCount,
        threshold: input.digest.threshold,
        digestStatus: input.digest.status,
        status: record.status,
        pending: record.pending,
        lastSkipReason: record.lastSkipReason,
      },
    } as const;
    memoryBudgetGuard.noteEvent(requestEvent);
    await memoryUsageAccounting.recordEvent(requestEvent);
    if (record.status === "queued" || record.pending) {
      durableExtractionRequestRateLimiter.note();
    }
    return record;
  };

  // MemoryManager is now created and registered globally by gateway.ts (unified instance)
  // No need to create a separate instance here.
  const detachDurableExtractionBroadcast = durableExtractionRuntime?.subscribe((event) => {
    broadcastEvent({
      type: "event",
      event: "conversation.memory.extraction.updated",
      payload: {
        conversationId: event.record.conversationId,
        extraction: event.record,
      },
    });
  });

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    log.info("ws", `New connection from ${ip}`);

    ws.on("error", (err) => {
      log.error("ws", `Error (${ip}): ${err.message}`);
    });

    ws.on("close", (code, reason) => {
      log.info("ws", `Closed (${ip}): ${code} ${reason}`);
    });

    const state: ConnectionState = {
      connected: false,
      nonce: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      role: "web",
      challengeSentAt: Date.now(),
    };

    sendFrame(ws, { type: "connect.challenge", nonce: state.nonce });

    const challengeTimer = setTimeout(() => {
      if (!state.connected) {
        safeClose(ws, 4401, "connect timeout");
      }
    }, 10_000);

    ws.on("message", async (data) => {
      // Activity Tracking
      opts.onActivity?.();

      const raw = typeof data === "string" ? data : data.toString("utf-8");
      const frame = safeParseFrame(raw);
      if (!frame) {
        safeClose(ws, 4400, "invalid frame");
        return;
      }

      if (!state.connected) {
        if (frame.type !== "connect") {
          sendRes(ws, {
            type: "res",
            id: crypto.randomUUID(),
            ok: false,
            error: { code: "not_connected", message: "Handshake required." },
          });
          return;
        }
        const accepted = acceptConnect(frame, opts.auth);
        if (!accepted.ok) {
          safeClose(ws, 4403, accepted.message);
          return;
        }
        clearTimeout(challengeTimer);
        state.connected = true;
        state.role = accepted.role;
        state.clientId = normalizeClientId(frame.clientId) ?? state.sessionId;
        state.userUuid = frame.userUuid; // 保存用户UUID
        log.debug("ws", "WebSocket connected", {
          clientId: state.clientId,
          hasUserUuid: Boolean(state.userUuid),
        });

        // 提取身份信息（异步）
        const identityInfo = await extractIdentityInfo(opts.stateDir ?? resolveStateDir());

        sendFrame(ws, {
          type: "hello-ok",
          sessionId: state.sessionId,
          role: state.role,
          methods: DEFAULT_METHODS,
          events: DEFAULT_EVENTS,
          version: BELLDANDY_VERSION,
          agentName: identityInfo.agentName,
          agentAvatar: identityInfo.agentAvatar,
          userName: identityInfo.userName,
          userAvatar: identityInfo.userAvatar,
          supportsUuid: true,
          // configOk=false 时，前端应自动打开设置面板引导用户配置 API Key
          configOk: opts.isConfigured ? opts.isConfigured() : true,
        });
        return;
      }

      if (frame.type !== "req") {
        return;
      }

      const res = await handleReq(ws, frame, {
        clientId: state.clientId ?? state.sessionId,
        userUuid: state.userUuid, // 传递UUID
        stateDir: opts.stateDir ?? resolveStateDir(),
        additionalWorkspaceRoots: opts.additionalWorkspaceRoots ?? [],
        envDir: opts.envDir,
        auth: opts.auth,
        agentFactory: opts.agentFactory ?? (() => new MockAgent()),
        agentRegistry: opts.agentRegistry,
        primaryModelConfig: opts.primaryModelConfig,
        modelFallbacks: opts.modelFallbacks,
        conversationStore,
        durableExtractionRuntime,
        requestDurableExtraction,
        memoryUsageAccounting,
        memoryBudgetGuard,
        durableExtractionRequestRateLimiter,
        ttsEnabled: opts.ttsEnabled,
        ttsSynthesize: opts.ttsSynthesize,
        toolsConfigManager: opts.toolsConfigManager,
        toolExecutor: opts.toolExecutor,
        toolControlConfirmationStore: opts.toolControlConfirmationStore,
        getAgentToolControlMode: opts.getAgentToolControlMode,
        getAgentToolControlConfirmPassword: opts.getAgentToolControlConfirmPassword,
        sttTranscribe: opts.sttTranscribe,
        pluginRegistry: opts.pluginRegistry,
        extensionHost: opts.extensionHost,
        skillRegistry: opts.skillRegistry,
        goalManager: opts.goalManager,
        subTaskRuntimeStore: opts.subTaskRuntimeStore,
        stopSubTask: opts.stopSubTask,
        tokenUsageUploadConfig,
        broadcastEvent,
        queryRuntimeTraceStore,
        log,
      });
      if (res) sendRes(ws, res);
    });

    ws.on("close", () => {
      clearTimeout(challengeTimer);
    });
  });

  const host = opts.host ?? "127.0.0.1"; // Default to localhost for security
  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));

  const address = server.address();
  const port =
    typeof address === "object" && address && "port" in address ? Number(address.port) : opts.port;

  return {
    port,
    host,
    close: async () => {
      detachSubTaskBroadcast?.();
      detachDurableExtractionBroadcast?.();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
    broadcast: broadcastEvent,
  };
}

type ConnectionState = {
  connected: boolean;
  nonce: string;
  sessionId: string;
  role: BelldandyRole;
  challengeSentAt: number;
  clientId?: string;
  /** 用户UUID（从连接握手中获取） */
  userUuid?: string;
};

function acceptConnect(
  frame: ConnectRequestFrame,
  authCfg: GatewayServerOptions["auth"],
): { ok: true; role: BelldandyRole } | { ok: false; message: string } {
  const auth = frame.auth ?? { mode: "none" };
  const role = frame.role ?? "web";
  if (!isRole(role)) return { ok: false, message: "invalid role" };

  if (authCfg.mode === "none") return { ok: true, role };

  if (authCfg.mode === "token") {
    if (!authCfg.token) return { ok: false, message: "server auth misconfigured" };
    if (auth.mode !== "token") return { ok: false, message: "token required" };
    if (auth.token !== authCfg.token) return { ok: false, message: "invalid token" };
    return { ok: true, role };
  }

  if (authCfg.mode === "password") {
    if (!authCfg.password) return { ok: false, message: "server auth misconfigured" };
    if (auth.mode !== "password") return { ok: false, message: "password required" };
    if (auth.password !== authCfg.password) return { ok: false, message: "invalid password" };
    return { ok: true, role };
  }

  return { ok: false, message: "invalid auth mode" };
}

function emitAutoRunTaskTokenResult(
  conversationStore: ConversationStore,
  payload: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  },
  ws?: WebSocket,
): void {
  const result = {
    name: "run",
    inputTokens: Math.max(0, Number(payload.inputTokens ?? 0)),
    outputTokens: Math.max(0, Number(payload.outputTokens ?? 0)),
    totalTokens: Math.max(0, Number(payload.inputTokens ?? 0) + Number(payload.outputTokens ?? 0)),
    durationMs: Math.max(0, Number(payload.durationMs ?? 0)),
    auto: true,
  };
  conversationStore.recordTaskTokenResult(payload.conversationId, result);
  if (!ws) return;
  sendEvent(ws, {
    type: "event",
    event: "token.counter.result",
    payload: {
      conversationId: payload.conversationId,
      ...result,
    },
  });
}

async function refreshConversationDigestAndBroadcast(
  conversationStore: ConversationStore,
  payload: {
    conversationId: string;
    force?: boolean;
    threshold?: number;
    source: string;
  },
  broadcastEvent?: (frame: GatewayEventFrame) => void,
  durableExtractionRuntime?: DurableExtractionRuntime,
  requestDurableExtraction?: (input: {
    conversationId: string;
    source: string;
    digest: DurableExtractionDigestSnapshot;
  }) => Promise<DurableExtractionRecord | undefined>,
  memoryUsageAccounting?: MemoryRuntimeUsageAccounting,
  memoryBudgetGuard?: MemoryRuntimeBudgetGuard,
): Promise<{
  digest: Awaited<ReturnType<ConversationStore["refreshSessionDigest"]>>["digest"];
  updated: boolean;
  compacted: boolean;
  originalTokens?: number;
  compactedTokens?: number;
  tier?: string;
}> {
  const decision = await memoryBudgetGuard?.evaluateSessionDigestRefresh();
  if (decision && !decision.allowed) {
    const usageEvent = {
      consumer: "session_digest_refresh",
      outcome: "blocked",
      timestamp: Date.now(),
      conversationId: payload.conversationId,
      source: payload.source,
      metadata: {
        reasonCode: decision.reasonCode,
        reasonMessage: decision.reasonMessage,
        retryAfterMs: decision.retryAfterMs,
        observedRuns: decision.observedRuns,
        maxRuns: decision.maxRuns,
        windowMs: decision.windowMs,
      },
    } as const;
    memoryBudgetGuard?.noteEvent(usageEvent);
    await memoryUsageAccounting?.recordEvent(usageEvent);
    throw new MemoryBudgetExceededError(decision);
  }

  const result = await conversationStore.refreshSessionDigest(payload.conversationId, {
    force: payload.force === true,
    threshold: payload.threshold,
  });
  const usageEvent = {
    consumer: "session_digest_refresh",
    outcome: result.updated ? "completed" : "skipped",
    timestamp: Date.now(),
    conversationId: payload.conversationId,
    source: payload.source,
    metadata: {
      threshold: payload.threshold,
      force: payload.force === true,
      compacted: result.compacted,
      originalTokens: result.originalTokens,
      compactedTokens: result.compactedTokens,
      tier: result.tier,
      digestStatus: result.digest.status,
      digestLastDigestAt: result.digest.lastDigestAt,
      messageCount: result.digest.messageCount,
      pendingMessageCount: result.digest.pendingMessageCount,
    },
  } as const;
  memoryBudgetGuard?.noteEvent(usageEvent);
  await memoryUsageAccounting?.recordEvent(usageEvent);
  broadcastEvent?.({
    type: "event",
    event: "conversation.digest.updated",
    payload: {
      conversationId: payload.conversationId,
      source: payload.source,
      updated: result.updated,
      compacted: result.compacted,
      originalTokens: result.originalTokens,
      compactedTokens: result.compactedTokens,
      tier: result.tier,
      digest: result.digest,
    },
  });
  if (result.updated && durableExtractionRuntime?.isAvailable()) {
    void (requestDurableExtraction ?? durableExtractionRuntime.requestExtraction.bind(durableExtractionRuntime))({
      conversationId: payload.conversationId,
      source: payload.source,
      digest: toDurableExtractionDigestSnapshot(result.digest),
    }).catch(() => {
      // keep digest refresh non-blocking even if extraction scheduling fails
    });
  }
  return result;
}

function toDurableExtractionDigestSnapshot(
  digest: Awaited<ReturnType<ConversationStore["getSessionDigest"]>>,
): DurableExtractionDigestSnapshot {
  return {
    status: digest.status,
    threshold: digest.threshold,
    messageCount: digest.messageCount,
    digestedMessageCount: digest.digestedMessageCount,
    pendingMessageCount: digest.pendingMessageCount,
    lastDigestAt: digest.lastDigestAt,
  };
}

async function handleReq(
  ws: WebSocket,
  req: GatewayReqFrame,
  ctx: {
    clientId: string;
    userUuid?: string; // 添加UUID字段
    stateDir: string;
    additionalWorkspaceRoots: string[];
    envDir?: string;
    auth: GatewayServerOptions["auth"];
    log: GatewayLog;
    agentFactory: () => BelldandyAgent;
    agentRegistry?: AgentRegistry;
    primaryModelConfig?: { baseUrl: string; apiKey: string; model: string };
    modelFallbacks?: ModelProfile[];
    conversationStore: ConversationStore;
    durableExtractionRuntime?: DurableExtractionRuntime;
    requestDurableExtraction?: (input: {
      conversationId: string;
      source: string;
      digest: DurableExtractionDigestSnapshot;
    }) => Promise<DurableExtractionRecord | undefined>;
    memoryUsageAccounting: MemoryRuntimeUsageAccounting;
    memoryBudgetGuard: MemoryRuntimeBudgetGuard;
    durableExtractionRequestRateLimiter: SlidingWindowRateLimiter;
    ttsEnabled?: () => boolean;
    ttsSynthesize?: (text: string) => Promise<{ webPath: string; htmlAudio: string } | null>;
    toolsConfigManager?: ToolsConfigManager;
    toolExecutor?: ToolExecutor;
    toolControlConfirmationStore?: ToolControlConfirmationStore;
    getAgentToolControlMode?: () => "disabled" | "confirm" | "auto";
    getAgentToolControlConfirmPassword?: () => string | undefined;
    sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
    pluginRegistry?: PluginRegistry;
    extensionHost?: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle">;
    skillRegistry?: SkillRegistry;
    goalManager?: GoalManager;
    subTaskRuntimeStore?: SubTaskRuntimeStore;
    stopSubTask?: (taskId: string, reason?: string) => Promise<SubTaskRecord | undefined>;
    tokenUsageUploadConfig: TokenUsageUploadConfig;
    broadcastEvent?: (frame: GatewayEventFrame) => void;
    queryRuntimeTraceStore: QueryRuntimeTraceStore;
  },
): Promise<GatewayResFrame | null> {
  const secureMethods = [
    "message.send",
    "tool_settings.confirm",
    "config.read",
    "config.readRaw",
    "config.update",
    "config.writeRaw",
    "system.restart",
    "system.doctor",
    "workspace.write",
    "workspace.read",
    "workspace.readSource",
    "workspace.list",
    "context.compact",
    "conversation.meta",
    "conversation.digest.get",
    "conversation.digest.refresh",
    "conversation.memory.extract",
    "conversation.memory.extraction.get",
    "subtask.list",
    "subtask.get",
    "subtask.stop",
    "subtask.archive",
    "tools.update",
    "memory.search",
    "memory.get",
    "memory.recent",
      "memory.stats",
      "memory.task.list",
      "memory.task.get",
      "experience.candidate.get",
      "experience.candidate.list",
      "experience.candidate.accept",
      "experience.candidate.reject",
      "experience.usage.get",
      "experience.usage.list",
      "experience.usage.stats",
      "experience.usage.revoke",
      "goal.create",
      "goal.list",
      "goal.get",
      "goal.resume",
      "goal.pause",
      "goal.handoff.generate",
      "goal.retrospect.generate",
      "goal.experience.suggest",
      "goal.method_candidates.generate",
      "goal.skill_candidates.generate",
      "goal.flow_patterns.generate",
      "goal.flow_patterns.cross_goal",
      "goal.review_governance.summary",
      "goal.approval.scan",
      "goal.suggestion_review.list",
      "goal.suggestion_review.workflow.set",
      "goal.suggestion_review.decide",
      "goal.suggestion_review.escalate",
      "goal.suggestion_review.scan",
      "goal.suggestion.publish",
      "goal.checkpoint.list",
      "goal.checkpoint.request",
      "goal.checkpoint.approve",
      "goal.checkpoint.reject",
      "goal.checkpoint.expire",
      "goal.checkpoint.reopen",
      "goal.checkpoint.escalate",
  ];
  if (secureMethods.includes(req.method)) {
    const allowed = await isClientAllowed({ clientId: ctx.clientId, stateDir: ctx.stateDir });
    if (!allowed) {
      const pairing = await ensurePairingCode({ clientId: ctx.clientId, stateDir: ctx.stateDir });
      sendEvent(ws, {
        type: "event",
        event: "pairing.required",
        payload: {
          clientId: ctx.clientId,
          code: pairing.code,
          message: "pairing required: approve this code to allow messages",
        },
      });
      return {
        type: "res",
        id: req.id,
        ok: false,
        error: { code: "pairing_required", message: `Pairing required. Code: ${pairing.code}` },
      };
    }
  }

  switch (req.method) {
    case "models.list": {
      const models: Array<{ id: string; displayName: string; model: string }> = [];
      const defaultModelRef = ctx.agentRegistry?.getProfile("default")?.model ?? "primary";

      if (ctx.primaryModelConfig?.model) {
        const defaultTag = defaultModelRef === "primary" ? "（默认）" : "";
        models.push({
          id: "primary",
          displayName: `${ctx.primaryModelConfig.model}${defaultTag}`,
          model: ctx.primaryModelConfig.model,
        });
      }

      for (const fb of ctx.modelFallbacks ?? []) {
        const fallbackId = fb.id ?? fb.model;
        const defaultTag = fallbackId === defaultModelRef ? "（默认）" : "";
        models.push({
          id: fallbackId,
          displayName: `${fb.displayName ?? fb.model}${defaultTag}`,
          model: fb.model,
        });
      }

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          models,
          currentDefault: defaultModelRef,
        },
      };
    }

    case "message.send": {
      const parsed = parseMessageSendParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }

      try {
        return await handleMessageSendWithQueryRuntime({
          request: {
            ws,
            requestId: req.id,
            params: parsed.value,
            clientId: ctx.clientId,
            userUuid: ctx.userUuid,
            stateDir: ctx.stateDir,
          },
          runtime: {
            log: ctx.log,
            agentFactory: ctx.agentFactory,
            agentRegistry: ctx.agentRegistry,
            conversationStore: ctx.conversationStore,
            runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<"message.send">(),
          },
          toolControl: {
            confirmationStore: ctx.toolControlConfirmationStore,
            getMode: ctx.getAgentToolControlMode,
            getConfirmPassword: ctx.getAgentToolControlConfirmPassword,
            tryApprovePasswordInput: tryApproveToolControlPasswordInput,
          },
          media: {
            sttTranscribe: ctx.sttTranscribe,
            ttsEnabled: ctx.ttsEnabled,
            ttsSynthesize: ctx.ttsSynthesize,
            getAttachmentPromptLimits,
            truncateTextForPrompt,
            formatLocalMessageTime,
          },
          io: {
            broadcastEvent: ctx.broadcastEvent,
            sendEvent,
            toChatMessageMeta,
          },
          effects: {
            tokenUsageUploadConfig: ctx.tokenUsageUploadConfig,
            durableExtractionRuntime: ctx.durableExtractionRuntime,
            requestDurableExtraction: ctx.requestDurableExtraction,
            memoryUsageAccounting: ctx.memoryUsageAccounting,
            memoryBudgetGuard: ctx.memoryBudgetGuard,
            emitAutoRunTaskTokenResult,
            refreshConversationDigestAndBroadcast,
          },
        });
      } catch (error) {
        if (error instanceof MessageSendConfigurationError) {
          return {
            type: "res",
            id: req.id,
            ok: false,
            error: { code: "config_required", message: "API Key or configuration missing." },
          };
        }
        throw error;
      }
    }

    case "tool_settings.confirm": {
      const parsed = parseToolSettingsConfirmParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }
      return handleToolSettingsConfirmWithQueryRuntime({
        requestId: req.id,
        clientId: ctx.clientId,
        toolsConfigManager: ctx.toolsConfigManager,
        toolControlConfirmationStore: ctx.toolControlConfirmationStore,
        getAgentToolControlMode: ctx.getAgentToolControlMode,
        getAgentToolControlConfirmPassword: ctx.getAgentToolControlConfirmPassword,
        resolvePendingToolControlRequest,
        applyToolControlChanges: (disabled, changes) => ({
          ...applyToolControlChanges(disabled as Parameters<typeof applyToolControlChanges>[0], changes as Parameters<typeof applyToolControlChanges>[1]),
          skills: Array.isArray(disabled.skills) ? disabled.skills : [],
        }),
        buildToolControlDisabledPayload: (disabled) => buildToolControlDisabledPayload({
          builtin: disabled.builtin,
          mcp_servers: disabled.mcp_servers,
          plugins: disabled.plugins,
          skills: Array.isArray(disabled.skills) ? disabled.skills : [],
        }),
        resolveToolControlPolicySnapshot,
        summarizeGroupedVisibility,
        emitEvent: (frame) => {
          if (ctx.broadcastEvent) {
            ctx.broadcastEvent(frame);
          } else {
            sendEvent(ws, frame);
          }
        },
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "tools.list"
          | "tools.update"
          | "tool_settings.confirm"
        >(),
      }, parsed.value);
    }

    case "config.read": {
      const { envPath, envLocalPath: localEnvPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      const config: Record<string, string> = {};

      // 1. Read .env (Base)
      await readEnvFileIntoConfig(envPath, config);
      // 2. Read .env.local (Override)
      await readEnvFileIntoConfig(localEnvPath, config);

      // [SECURITY] 对敏感字段进行脱敏处理
      const REDACT_PATTERNS = [/KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i];
      for (const key of Object.keys(config)) {
        if (REDACT_PATTERNS.some(p => p.test(key))) {
          config[key] = "[REDACTED]";
        }
      }

      return { type: "res", id: req.id, ok: true, payload: { config } };
    }

    case "config.update": {
      const params = req.params as unknown as { updates: Record<string, string> } | undefined;
      const updates = params?.updates;
      if (!updates || typeof updates !== "object") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing updates" } };
      }

      // [SECURITY] 仅允许修改白名单内的配置项
      const SAFE_UPDATE_KEYS = new Set([
        "BELLDANDY_OPENAI_BASE_URL", "BELLDANDY_OPENAI_MODEL",
        "BELLDANDY_HEARTBEAT_ENABLED", "BELLDANDY_HEARTBEAT_INTERVAL",
        "BELLDANDY_HEARTBEAT_ACTIVE_HOURS", "BELLDANDY_AGENT_TIMEOUT_MS",
        "BELLDANDY_OPENAI_STREAM", "BELLDANDY_MEMORY_ENABLED",
        "BELLDANDY_EXTRA_WORKSPACE_ROOTS",
        "BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED",
        // Extended whitelist for settings panel
        "BELLDANDY_OPENAI_API_KEY", "BELLDANDY_AGENT_PROVIDER",
        "BELLDANDY_BROWSER_RELAY_ENABLED", "BELLDANDY_RELAY_PORT",
        "BELLDANDY_MCP_ENABLED", "BELLDANDY_CRON_ENABLED",
        "BELLDANDY_TOOLS_ENABLED",
        "BELLDANDY_AGENT_TOOL_CONTROL_MODE",
        "BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD",
        "BELLDANDY_EMBEDDING_ENABLED",
        "BELLDANDY_EMBEDDING_OPENAI_API_KEY", "BELLDANDY_EMBEDDING_OPENAI_BASE_URL",
        "BELLDANDY_EMBEDDING_MODEL",
        // TTS & DashScope
        "BELLDANDY_TTS_ENABLED", "BELLDANDY_TTS_PROVIDER", "BELLDANDY_TTS_VOICE", "DASHSCOPE_API_KEY",
        "BELLDANDY_FACET_ANCHOR",
        "BELLDANDY_INJECT_AGENTS", "BELLDANDY_INJECT_SOUL", "BELLDANDY_INJECT_MEMORY",
        "BELLDANDY_MAX_SYSTEM_PROMPT_CHARS", "BELLDANDY_MAX_HISTORY",
        "BELLDANDY_TASK_DEDUP_GUARD_ENABLED", "BELLDANDY_TASK_DEDUP_WINDOW_MINUTES",
        "BELLDANDY_TASK_DEDUP_MODE", "BELLDANDY_TASK_DEDUP_POLICY",
        // Channels
        "BELLDANDY_COMMUNITY_API_ENABLED", "BELLDANDY_COMMUNITY_API_TOKEN",
        "BELLDANDY_FEISHU_APP_ID", "BELLDANDY_FEISHU_APP_SECRET", "BELLDANDY_FEISHU_AGENT_ID",
        "BELLDANDY_QQ_APP_ID", "BELLDANDY_QQ_APP_SECRET", "BELLDANDY_QQ_AGENT_ID", "BELLDANDY_QQ_SANDBOX",
        "BELLDANDY_DISCORD_ENABLED", "BELLDANDY_DISCORD_BOT_TOKEN", "BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID",
      ]);
      for (const key of Object.keys(updates)) {
        if (!SAFE_UPDATE_KEYS.has(key)) {
          return { type: "res", id: req.id, ok: false, error: { code: "forbidden", message: `不允许修改配置项: ${key}` } };
        }
      }

      const { envPath, envLocalPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      const currentConfig: Record<string, string> = {};
      await readEnvFileIntoConfig(envPath, currentConfig);
      await readEnvFileIntoConfig(envLocalPath, currentConfig);

      const mergedConfig = {
        ...currentConfig,
        ...updates,
      };
      const effectiveAuthMode = String(
        mergedConfig.BELLDANDY_AUTH_MODE
        ?? (ctx.auth.mode === "token" ? "token" : ctx.auth.mode === "password" ? "password" : "none"),
      ).trim().toLowerCase();
      const communityApiEnabled = String(mergedConfig.BELLDANDY_COMMUNITY_API_ENABLED ?? "false").trim().toLowerCase() === "true";
      if (communityApiEnabled && effectiveAuthMode === "none") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "community_api_requires_auth",
            message: "BELLDANDY_COMMUNITY_API_ENABLED=true cannot be used with BELLDANDY_AUTH_MODE=none",
          },
        };
      }

      // Split updates
      const envUpdates: Record<string, string> = {};
      const localUpdates: Record<string, string> = {};

      for (const key of Object.keys(updates)) {
        if (key === "BELLDANDY_EXTRA_WORKSPACE_ROOTS") {
          envUpdates[key] = updates[key];
        } else {
          localUpdates[key] = updates[key];
        }
      }

      const envOk = await updateEnvFile(envPath, envUpdates);
      const localOk = await updateEnvFile(envLocalPath, localUpdates);

      if (!envOk || !localOk) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: "Failed to write config files" } };
      }

      return { type: "res", id: req.id, ok: true };
    }

    // [NEW] 读取 .env 文件原始内容（用于编辑器）
    case "config.readRaw": {
      const { envPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      try {
        const stat = await statIfExists(envPath);
        if (!stat?.isFile()) {
          return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: ".env 文件不存在" } };
        }
        const content = await fsp.readFile(envPath, "utf-8");
        return { type: "res", id: req.id, ok: true, payload: { content } };
      } catch (e) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(e) } };
      }
    }

    // [NEW] 写入 .env 文件原始内容（用于编辑器）
    case "config.writeRaw": {
      const content = req.params?.content;
      if (typeof content !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing content" } };
      }
      const { envPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      try {
        await writeTextFileAtomic(envPath, content, { ensureParent: true });
        return { type: "res", id: req.id, ok: true };
      } catch (e) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: String(e) } };
      }
    }

    case "tools.list": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const requestedTaskId = typeof params.taskId === "string" && params.taskId.trim()
        ? params.taskId.trim()
        : undefined;
      const visibilityAgentId = typeof params.agentId === "string" && params.agentId.trim()
        ? params.agentId.trim()
        : undefined;
      const visibilityConversationId = typeof params.conversationId === "string" && params.conversationId.trim()
        ? params.conversationId.trim()
        : undefined;
      return handleToolsListWithQueryRuntime({
        requestId: req.id,
        toolExecutor: ctx.toolExecutor,
        toolsConfigManager: ctx.toolsConfigManager,
        toolControlConfirmationStore: ctx.toolControlConfirmationStore,
        getAgentToolControlMode: ctx.getAgentToolControlMode,
        getAgentToolControlConfirmPassword: ctx.getAgentToolControlConfirmPassword,
        pluginRegistry: ctx.pluginRegistry,
        stateDir: ctx.stateDir,
        extensionHost: ctx.extensionHost,
        skillRegistry: ctx.skillRegistry,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        resolveToolControlPolicySnapshot,
        summarizeGroupedVisibility,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "tools.list"
          | "tools.update"
          | "tool_settings.confirm"
        >(),
      }, {
        taskId: requestedTaskId,
        agentId: visibilityAgentId,
        conversationId: visibilityConversationId,
      });
    }

    case "tools.update": {
      const params = req.params as unknown as { disabled?: { builtin?: string[]; mcp_servers?: string[]; plugins?: string[] } } | undefined;
      if (!params?.disabled) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing disabled" } };
      }
      return handleToolsUpdateWithQueryRuntime({
        requestId: req.id,
        toolExecutor: ctx.toolExecutor,
        toolsConfigManager: ctx.toolsConfigManager,
        toolControlConfirmationStore: ctx.toolControlConfirmationStore,
        getAgentToolControlMode: ctx.getAgentToolControlMode,
        getAgentToolControlConfirmPassword: ctx.getAgentToolControlConfirmPassword,
        pluginRegistry: ctx.pluginRegistry,
        skillRegistry: ctx.skillRegistry,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        resolveToolControlPolicySnapshot,
        summarizeGroupedVisibility,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "tools.list"
          | "tools.update"
          | "tool_settings.confirm"
        >(),
      }, {
        disabled: params.disabled,
      });
    }

    case "system.restart": {
      const cooldownCheck = checkAndConsumeRestartCooldown({ stateDir: ctx.stateDir });
      if (!cooldownCheck.allowed) {
        const message = formatRestartCooldownMessage(cooldownCheck.remainingSeconds);
        ctx.log.warn("system", "system.restart blocked by cooldown", {
          clientId: ctx.clientId,
          remainingSeconds: cooldownCheck.remainingSeconds,
        });
        return { type: "res", id: req.id, ok: false, error: { code: "restart_cooldown", message } };
      }
      setTimeout(() => {
        process.exit(100);
      }, 500);
      return { type: "res", id: req.id, ok: true };
    }

    case "system.doctor": {
      type MCPDoctorDiagnostics = NonNullable<Awaited<ReturnType<typeof import("./mcp/index.js")["getMCPDiagnostics"]>>> & {
        loadError?: string;
      };
      const checks: any[] = [
        { id: "node", name: "Node.js Environment", status: "pass", message: process.version },
        { id: "memory_db", name: "Vector Database", status: "pass", message: "OK" },
      ];

      const dbPath = path.join(ctx.stateDir, "memory.sqlite");
      const stat = await statIfExists(dbPath);
      if (stat?.isFile()) {
        checks[1].message = `Size: ${(stat.size / 1024).toFixed(1)} KB`;
      } else {
        checks[1].status = "warn";
        checks[1].message = "Not created yet";
      }

      try {
        ctx.agentFactory();
        checks.push({ id: "agent_config", name: "Agent Configuration", status: "pass", message: "Valid" });
      } catch {
        checks.push({ id: "agent_config", name: "Agent Configuration", status: "fail", message: "Missing API Keys" });
      }

      const memoryRuntime = await buildMemoryRuntimeDoctorReport({
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        stateDir: ctx.stateDir,
        teamSharedMemoryEnabled: process.env.BELLDANDY_TEAM_SHARED_MEMORY_ENABLED === "true",
        sessionDigestRateLimit: ctx.memoryBudgetGuard.getSessionDigestRateLimitState(),
        durableExtractionRequestRateLimit: ctx.durableExtractionRequestRateLimiter.getState(
          DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
          DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
        ),
        durableExtractionRunRateLimit: ctx.memoryBudgetGuard.getDurableExtractionRunRateLimitState(),
      });
      const extensionRuntimeBase = ctx.extensionHost?.extensionRuntime ?? buildExtensionRuntimeReport({
        pluginRegistry: ctx.pluginRegistry,
        skillRegistry: ctx.skillRegistry,
        toolsConfigManager: ctx.toolsConfigManager,
      });
      const extensionRuntime = ctx.extensionHost
        ? {
          ...extensionRuntimeBase,
          host: {
            lifecycle: ctx.extensionHost.lifecycle,
          },
        }
        : extensionRuntimeBase;
      const extensionMarketplace = await (async () => {
        try {
          return {
            ...(await loadExtensionMarketplaceState(ctx.stateDir)),
            loadError: undefined as string | undefined,
          };
        } catch (error) {
          return {
            knownMarketplaces: {
              version: 1 as const,
              marketplaces: {},
              updatedAt: new Date(0).toISOString(),
            },
            installedExtensions: {
              version: 1 as const,
              extensions: {},
              updatedAt: new Date(0).toISOString(),
            },
            summary: {
              knownMarketplaceCount: 0,
              autoUpdateMarketplaceCount: 0,
              installedExtensionCount: 0,
              installedPluginCount: 0,
              installedSkillPackCount: 0,
              pendingExtensionCount: 0,
              brokenExtensionCount: 0,
              disabledExtensionCount: 0,
            },
            loadError: error instanceof Error ? error.message : String(error),
          };
        }
      })();
      const extensionGovernance = buildExtensionGovernanceReport({
        extensionRuntime: extensionRuntimeBase,
        extensionMarketplace: extensionMarketplace.loadError ? undefined : extensionMarketplace,
        extensionHostLifecycle: ctx.extensionHost?.lifecycle,
        loadError: extensionMarketplace.loadError,
      });
      const queryRuntime = ctx.queryRuntimeTraceStore.getSummary();
      const mcpRuntime = await (async () => {
        const enabled = (process.env.BELLDANDY_MCP_ENABLED ?? "false") === "true";
        if (!enabled) {
          return { enabled, diagnostics: null as MCPDoctorDiagnostics | null };
        }
        try {
          const mcpModule = await import("./mcp/index.js");
          return {
            enabled,
            diagnostics: mcpModule.getMCPDiagnostics() as MCPDoctorDiagnostics | null,
          };
        } catch (error) {
          return {
            enabled,
            diagnostics: {
              initialized: false,
              toolCount: 0,
              serverCount: 0,
              connectedCount: 0,
              summary: {
                recentErrorServers: 0,
                recoveryAttemptedServers: 0,
                recoverySucceededServers: 0,
                persistedResultServers: 0,
                truncatedResultServers: 0,
              },
              servers: [],
              loadError: error instanceof Error ? error.message : String(error),
            } satisfies MCPDoctorDiagnostics,
          };
        }
      })();

      checks.push({
        id: "session_digest_runtime",
        name: "Session Digest Runtime",
        status: memoryRuntime.sessionDigest.rateLimit.status === "limited" ? "warn" : "pass",
        message: memoryRuntime.sessionDigest.rateLimit.status === "limited"
          ? `Available, but rate limited: ${formatRateLimitState(memoryRuntime.sessionDigest.rateLimit)}`
          : `Available (${formatRateLimitState(memoryRuntime.sessionDigest.rateLimit)})`,
      });

      const durableAvailability = memoryRuntime.durableExtraction.availability;
      const durableRunRateLimit = memoryRuntime.durableExtraction.rateLimit.run;
      checks.push({
        id: "durable_extraction_runtime",
        name: "Durable Extraction Runtime",
        status: !durableAvailability.available
          ? durableAvailability.enabled ? "fail" : "warn"
          : durableRunRateLimit.status === "limited" ? "warn" : "pass",
        message: !durableAvailability.available
          ? durableAvailability.reasonMessages.join(" ") || "Unavailable"
          : durableRunRateLimit.status === "limited"
            ? `Available, but run rate limited: ${formatRateLimitState(durableRunRateLimit)}`
            : `Available (${formatRateLimitState(durableRunRateLimit)})`,
      });
      if (memoryRuntime.durableExtraction.guidance) {
        checks.push({
          id: "durable_extraction_policy",
          name: "Durable Extraction Policy",
          status: "pass",
          message: `${memoryRuntime.durableExtraction.guidance.policyVersion}: ${memoryRuntime.durableExtraction.guidance.summary}`,
        });
      }
      checks.push({
        id: "team_shared_memory",
        name: "Team Shared Memory",
        status: memoryRuntime.sharedMemory.enabled ? "pass" : "warn",
        message: memoryRuntime.sharedMemory.enabled
          ? `enabled at ${memoryRuntime.sharedMemory.scope.relativeRoot} (${memoryRuntime.sharedMemory.scope.fileCount} files), secret guard ready, sync plan ${memoryRuntime.sharedMemory.syncPolicy.status}`
          : `disabled by default, path ${memoryRuntime.sharedMemory.scope.relativeRoot}, secret guard ready, sync plan ${memoryRuntime.sharedMemory.syncPolicy.status}`,
      });
      checks.push({
        id: "query_runtime_trace",
        name: "Query Runtime Trace",
        status: "pass",
        message: `Enabled (${queryRuntime.activeTraceCount} active traces, ${queryRuntime.traces.length} retained, ${queryRuntime.totalObservedEvents} observed events)`,
      });
      const hookBridgeSummary = ctx.extensionHost?.lifecycle.hookBridge;
      const extensionHookMessage = hookBridgeSummary && hookBridgeSummary.availableHookCount > 0
        ? `, legacy hooks ${hookBridgeSummary.bridgedHookCount}/${hookBridgeSummary.availableHookCount} bridged`
        : "";
      checks.push({
        id: "extension_runtime",
        name: "Extension Runtime",
        status: extensionRuntime.summary.pluginLoadErrorCount > 0 ? "warn" : "pass",
        message: `plugins ${extensionRuntime.summary.pluginCount} (${extensionRuntime.summary.disabledPluginCount} disabled, ${extensionRuntime.summary.pluginLoadErrorCount} load errors), skills ${extensionRuntime.summary.skillCount} (${extensionRuntime.summary.disabledSkillCount} disabled, ${extensionRuntime.summary.ineligibleSkillCount} ineligible)${extensionHookMessage}`,
      });
      checks.push({
        id: "extension_marketplace",
        name: "Extension Marketplace",
        status: extensionMarketplace.loadError
          ? "warn"
          : extensionMarketplace.summary.brokenExtensionCount > 0
            ? "warn"
            : "pass",
        message: extensionMarketplace.loadError
          ? `Unavailable: ${extensionMarketplace.loadError}`
          : `marketplaces ${extensionMarketplace.summary.knownMarketplaceCount} (${extensionMarketplace.summary.autoUpdateMarketplaceCount} auto-update), installed ${extensionMarketplace.summary.installedExtensionCount} (${extensionMarketplace.summary.installedPluginCount} plugins, ${extensionMarketplace.summary.installedSkillPackCount} skill-packs, ${extensionMarketplace.summary.brokenExtensionCount} broken, ${extensionMarketplace.summary.disabledExtensionCount} disabled)`,
      });
      checks.push({
        id: "extension_governance",
        name: "Extension Governance",
        status: extensionGovernance.loadError
          ? "warn"
          : extensionGovernance.summary.installedBrokenExtensionCount > 0
            ? "warn"
            : extensionGovernance.layers.hostLoad.lifecycleAvailable
              && extensionGovernance.summary.loadedMarketplaceExtensionCount
                < extensionGovernance.summary.installedEnabledExtensionCount
              ? "warn"
              : "pass",
        message: extensionGovernance.loadError
          ? `Unavailable: ${extensionGovernance.loadError}`
          : `ledger enabled ${extensionGovernance.summary.installedEnabledExtensionCount}/${extensionGovernance.summary.installedExtensionCount}, host loaded ${extensionGovernance.summary.loadedMarketplaceExtensionCount} (${extensionGovernance.summary.loadedMarketplacePluginCount} plugins, ${extensionGovernance.summary.loadedMarketplaceSkillPackCount} skill-packs), runtime policy disabled ${extensionGovernance.summary.runtimePolicyDisabledPluginCount} plugins / ${extensionGovernance.summary.runtimePolicyDisabledSkillCount} skills`,
      });
      const mcpDiag = mcpRuntime.diagnostics;
      const mcpRecoverySummary = mcpDiag && mcpDiag.summary.recoveryAttemptedServers > 0
        ? `, recovery ${mcpDiag.summary.recoverySucceededServers}/${mcpDiag.summary.recoveryAttemptedServers}`
        : "";
      const mcpPersistedSummary = mcpDiag && mcpDiag.summary.persistedResultServers > 0
        ? `, persisted refs ${mcpDiag.summary.persistedResultServers}`
        : "";
      checks.push({
        id: "mcp_runtime",
        name: "MCP Runtime",
        status: !mcpRuntime.enabled
          ? "pass"
          : mcpDiag?.loadError
            ? "warn"
            : mcpDiag && mcpDiag.connectedCount > 0
              ? "pass"
              : "warn",
        message: !mcpRuntime.enabled
          ? "Disabled"
          : mcpDiag?.loadError
            ? `Unavailable: ${mcpDiag.loadError}`
            : mcpDiag
              ? `${mcpDiag.connectedCount}/${mcpDiag.serverCount} connected, ${mcpDiag.toolCount} tools${mcpRecoverySummary}${mcpPersistedSummary}`
              : "Unavailable",
      });

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: { checks, memoryRuntime, extensionRuntime, extensionMarketplace, extensionGovernance, queryRuntime, mcpRuntime },
      };
    }

    case "agents.list": {
      const profiles = ctx.agentRegistry?.list() ?? [];
      const agents = await Promise.all(profiles.map(async (profile) => {
        const identityTarget = resolveAgentIdentityDir(ctx.stateDir, ctx.agentRegistry, profile.id);
        const identityInfo = identityTarget ? await extractIdentityInfo(identityTarget.dir) : {};
        return {
          id: profile.id,
          displayName: profile.displayName,
          name: identityInfo.agentName || profile.displayName,
          avatar: identityInfo.agentAvatar || undefined,
          model: profile.model,
        };
      }));
      return { type: "res", id: req.id, ok: true, payload: { agents } };
    }

    case "goal.create": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const title = typeof params.title === "string" ? params.title.trim() : "";
      const objective = typeof params.objective === "string" ? params.objective.trim() : undefined;
      const slug = typeof params.slug === "string" ? params.slug.trim() : undefined;
      const goalRoot = typeof params.goalRoot === "string" ? params.goalRoot.trim() : undefined;
      if (!title) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "title is required" } };
      }
      try {
        const goal = await ctx.goalManager.createGoal({ title, objective, slug, goalRoot });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            goal,
            conversationId: goal.activeConversationId,
          },
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_create_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.list": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const goals = await ctx.goalManager.listGoals();
      return { type: "res", id: req.id, ok: true, payload: { goals } };
    }

    case "goal.get": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      const goal = await ctx.goalManager.getGoal(goalId);
      if (!goal) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Goal not found." } };
      }
      return { type: "res", id: req.id, ok: true, payload: { goal } };
    }

    case "goal.resume": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : undefined;
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.resumeGoal(goalId, nodeId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_resume_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.pause": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const goal = await ctx.goalManager.pauseGoal(goalId);
        return { type: "res", id: req.id, ok: true, payload: { goal } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_pause_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.handoff.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateHandoff(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_handoff_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.retrospect.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateRetrospective(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_retrospect_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.experience.suggest": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateExperienceSuggestions(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_experience_suggest_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.method_candidates.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateMethodCandidates(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_method_candidates_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.skill_candidates.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateSkillCandidates(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_skill_candidates_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.flow_patterns.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateFlowPatterns(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_flow_patterns_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.flow_patterns.cross_goal": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      try {
        const result = await ctx.goalManager.generateCrossGoalFlowPatterns();
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_cross_goal_flow_patterns_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.review_governance.summary": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const summary = await ctx.goalManager.getReviewGovernanceSummary(goalId);
        return { type: "res", id: req.id, ok: true, payload: { summary } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_review_governance_summary_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.approval.scan": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.scanApprovalWorkflows(goalId, {
          now: typeof params.now === "string" ? params.now.trim() || undefined : undefined,
          autoEscalate: Boolean(params.autoEscalate),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_approval_scan_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.list": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const reviews = await ctx.goalManager.listSuggestionReviews(goalId);
        return { type: "res", id: req.id, ok: true, payload: { reviews } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_list_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.workflow.set": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const mode = typeof params.mode === "string" ? params.mode.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId || !mode) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and mode are required" } };
      }
      if (!["single", "chain", "quorum"].includes(mode)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "mode is invalid" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.configureSuggestionReviewWorkflow(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          mode: mode as "single" | "chain" | "quorum",
          reviewers: Array.isArray(params.reviewers)
            ? params.reviewers.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
            : undefined,
          reviewerRoles: Array.isArray(params.reviewerRoles)
            ? params.reviewerRoles.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
            : undefined,
          minApprovals: typeof params.minApprovals === "number" && Number.isFinite(params.minApprovals) ? params.minApprovals : undefined,
          stages: Array.isArray(params.stages)
            ? params.stages.map((item) => {
              const stage = isObjectRecord(item) ? item : {};
              return {
                title: typeof stage.title === "string" ? stage.title.trim() || undefined : undefined,
                reviewers: Array.isArray(stage.reviewers)
                  ? stage.reviewers.map((reviewer) => typeof reviewer === "string" ? reviewer.trim() : "").filter(Boolean)
                  : [],
                reviewerRoles: Array.isArray(stage.reviewerRoles)
                  ? stage.reviewerRoles.map((role) => typeof role === "string" ? role.trim() : "").filter(Boolean)
                  : undefined,
                minApprovals: typeof stage.minApprovals === "number" && Number.isFinite(stage.minApprovals) ? stage.minApprovals : undefined,
                slaHours: typeof stage.slaHours === "number" && Number.isFinite(stage.slaHours) ? stage.slaHours : undefined,
              };
            }).filter((item) => item.reviewers.length > 0)
            : undefined,
          slaHours: typeof params.slaHours === "number" && Number.isFinite(params.slaHours) ? params.slaHours : undefined,
          escalationMode: typeof params.escalationMode === "string" && (params.escalationMode === "none" || params.escalationMode === "manual")
            ? params.escalationMode
            : undefined,
          escalationReviewer: typeof params.escalationReviewer === "string" ? params.escalationReviewer.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_workflow_set_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.decide": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const decision = typeof params.decision === "string" ? params.decision.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId || !decision) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and decision are required" } };
      }
      if (!["accepted", "rejected", "deferred", "needs_revision"].includes(decision)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "decision is invalid" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.decideSuggestionReview(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          decision: decision as "accepted" | "rejected" | "deferred" | "needs_revision",
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_decide_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.escalate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.escalateSuggestionReview(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          escalatedBy: typeof params.escalatedBy === "string" ? params.escalatedBy.trim() || undefined : undefined,
          escalatedTo: typeof params.escalatedTo === "string" ? params.escalatedTo.trim() || undefined : undefined,
          reason: typeof params.reason === "string" ? params.reason.trim() || undefined : undefined,
          force: Boolean(params.force),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_escalate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.scan": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.scanSuggestionReviewWorkflows(goalId, {
          now: typeof params.now === "string" ? params.now.trim() || undefined : undefined,
          autoEscalate: Boolean(params.autoEscalate),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_scan_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion.publish": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.publishSuggestion(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_publish_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.list": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const checkpoints = await ctx.goalManager.listCheckpoints(goalId);
        return { type: "res", id: req.id, ok: true, payload: { checkpoints } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_list_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.request": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.requestCheckpoint(goalId, nodeId, {
          title: typeof params.title === "string" ? params.title.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_request_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.approve": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.approveCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_approve_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.reject": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.rejectCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_reject_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.expire": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.expireCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_expire_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.reopen": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.reopenCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_reopen_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.escalate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.escalateCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          escalatedBy: typeof params.escalatedBy === "string" ? params.escalatedBy.trim() || undefined : undefined,
          escalatedTo: typeof params.escalatedTo === "string" ? params.escalatedTo.trim() || undefined : undefined,
          reason: typeof params.reason === "string" ? params.reason.trim() || undefined : undefined,
          force: Boolean(params.force),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_escalate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.read": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const graph = await ctx.goalManager.readTaskGraph(goalId);
        return { type: "res", id: req.id, ok: true, payload: { graph } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_read_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.create": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const title = typeof params.title === "string" ? params.title.trim() : "";
      if (!goalId || !title) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and title are required" } };
      }
      try {
        const result = await ctx.goalManager.createTaskNode(goalId, {
          id: typeof params.nodeId === "string" ? params.nodeId.trim() || undefined : undefined,
          title,
          description: typeof params.description === "string" ? params.description.trim() || undefined : undefined,
          phase: typeof params.phase === "string" ? params.phase.trim() || undefined : undefined,
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          dependsOn: Array.isArray(params.dependsOn) ? params.dependsOn.map((item) => String(item)) : undefined,
          acceptance: Array.isArray(params.acceptance) ? params.acceptance.map((item) => String(item)) : undefined,
          checkpointRequired: typeof params.checkpointRequired === "boolean" ? params.checkpointRequired : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          status: parseGoalTaskCreateStatus(params.status),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_create_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.update": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.updateTaskNode(goalId, nodeId, {
          title: typeof params.title === "string" ? params.title.trim() || undefined : undefined,
          description: typeof params.description === "string" ? params.description : undefined,
          phase: typeof params.phase === "string" ? params.phase : undefined,
          owner: typeof params.owner === "string" ? params.owner : undefined,
          dependsOn: Array.isArray(params.dependsOn) ? params.dependsOn.map((item) => String(item)) : undefined,
          acceptance: Array.isArray(params.acceptance) ? params.acceptance.map((item) => String(item)) : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointRequired: typeof params.checkpointRequired === "boolean" ? params.checkpointRequired : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_update_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.claim": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.claimTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_claim_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.pending_review": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.markTaskNodePendingReview(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_pending_review_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.validating": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.markTaskNodeValidating(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_validating_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.complete": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.completeTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_complete_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.block": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      const blockReason = typeof params.blockReason === "string" ? params.blockReason.trim() : "";
      if (!goalId || !nodeId || !blockReason) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId, nodeId and blockReason are required" } };
      }
      try {
        const result = await ctx.goalManager.blockTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_block_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.fail": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.failTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_fail_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.skip": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.skipTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_skip_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "memory.search": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const query = typeof params.query === "string" ? params.query.trim() : "";
      if (!query) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "query is required" } };
      }

      const limit = clampListLimit(params.limit, 20);
      const includeContent = params.includeContent !== false;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = await manager.search(query, { limit, filter: filter as any, includeContent });
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: toMemoryListPayloadItems(items, includeContent),
          query,
          limit,
        },
      };
    }

    case "memory.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const chunkId = typeof params.chunkId === "string" ? params.chunkId.trim() : "";
      if (!chunkId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "chunkId is required" } };
      }

      const item = manager.getMemory(chunkId);
      if (!item) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Memory not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { item } };
    }

    case "memory.recent": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 20);
      const includeContent = params.includeContent !== false;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.getRecent(limit, filter as any, includeContent);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: toMemoryListPayloadItems(items, includeContent),
          limit,
        },
      };
    }

    case "memory.stats": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const includeRecentTasks = params.includeRecentTasks === true;
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          status: manager.getStatus(),
          ...(includeRecentTasks ? { recentTasks: manager.getRecentTasks(5) } : {}),
        },
      };
    }

    case "memory.task.list": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const query = typeof params.query === "string" ? params.query.trim() : "";
      const limit = clampListLimit(params.limit, 20);
      const summaryOnly = params.summaryOnly === true;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = query
        ? manager.searchTasks(query, { limit, filter: filter as any })
        : manager.getRecentTasks(limit, filter as any);

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: toTaskListPayloadItems(items, summaryOnly),
          query,
          limit,
        },
      };
    }

    case "memory.task.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }

      const task = manager.getTaskDetail(taskId);
      if (!task) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Task not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { task } };
    }

    case "experience.candidate.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }

      const candidate = manager.getExperienceCandidate(candidateId);
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { candidate } };
    }

    case "experience.candidate.list": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceCandidates(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "experience.candidate.accept": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }

      const existing = manager.getExperienceCandidate(candidateId);
      if (!existing) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }
      if (existing.status !== "draft") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_state", message: `Experience candidate can only be accepted from draft status. Current status: ${existing.status}.` },
        };
      }

      let publishedPath: string | undefined;
      if (existing.type === "skill") {
        publishedPath = await publishSkillCandidate(existing, ctx.stateDir, ctx.skillRegistry);
      }

      const candidate = manager.acceptExperienceCandidate(candidateId, publishedPath ? { publishedPath } : {});
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { candidate } };
    }

    case "experience.candidate.reject": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }
      const existing = manager.getExperienceCandidate(candidateId);
      if (!existing) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }
      if (existing.status !== "draft") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_state", message: `Experience candidate can only be rejected from draft status. Current status: ${existing.status}.` },
        };
      }

      const candidate = manager.rejectExperienceCandidate(candidateId);
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { candidate } };
    }

    case "experience.usage.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const usageId = typeof params.usageId === "string" ? params.usageId.trim() : "";
      if (!usageId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "usageId is required" } };
      }

      const usage = manager.getExperienceUsage(usageId);
      if (!usage) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience usage not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { usage } };
    }

    case "experience.usage.list": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsages(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "experience.usage.stats": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsageStats(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "experience.usage.revoke": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const usageId = typeof params.usageId === "string" ? params.usageId.trim() : "";
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const assetType = typeof params.assetType === "string" ? params.assetType.trim() : "";
      const assetKey = typeof params.assetKey === "string" ? params.assetKey.trim() : "";

      if (!usageId && (!taskId || (assetType !== "method" && assetType !== "skill") || !assetKey)) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_params", message: "usageId or taskId + assetType + assetKey is required." },
        };
      }

      const usage = manager.revokeExperienceUsage({
        usageId: usageId || undefined,
        taskId: taskId || undefined,
        assetType: assetType === "method" || assetType === "skill" ? assetType : undefined,
        assetKey: assetKey || undefined,
      });

      return { type: "res", id: req.id, ok: true, payload: { usage, revoked: Boolean(usage) } };
    }

    case "workspace.list": {
      const params = req.params as { path?: string } | undefined;
      return handleWorkspaceListWithQueryRuntime({
        requestId: req.id,
        stateDir: ctx.stateDir,
        additionalWorkspaceRoots: ctx.additionalWorkspaceRoots,
        statIfExists,
        isUnderRoot,
        writeTextFileAtomic,
        guardTeamSharedMemoryWrite,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "workspace.list"
          | "workspace.read"
          | "workspace.readSource"
          | "workspace.write"
        >(),
      }, {
        path: params?.path,
      });
    }

    case "workspace.read": {
      const params = req.params as { path?: string } | undefined;
      const relativePath = params?.path;

      if (!relativePath || typeof relativePath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }
      return handleWorkspaceReadWithQueryRuntime({
        requestId: req.id,
        stateDir: ctx.stateDir,
        additionalWorkspaceRoots: ctx.additionalWorkspaceRoots,
        statIfExists,
        isUnderRoot,
        writeTextFileAtomic,
        guardTeamSharedMemoryWrite,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "workspace.list"
          | "workspace.read"
          | "workspace.readSource"
          | "workspace.write"
        >(),
      }, {
        path: relativePath,
      });
    }

    case "workspace.readSource": {
      const params = req.params as { path?: string } | undefined;
      const requestedPath = params?.path;

      if (!requestedPath || typeof requestedPath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }
      return handleWorkspaceReadSourceWithQueryRuntime({
        requestId: req.id,
        stateDir: ctx.stateDir,
        additionalWorkspaceRoots: ctx.additionalWorkspaceRoots,
        statIfExists,
        isUnderRoot,
        writeTextFileAtomic,
        guardTeamSharedMemoryWrite,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "workspace.list"
          | "workspace.read"
          | "workspace.readSource"
          | "workspace.write"
        >(),
      }, {
        path: requestedPath,
      });
    }

    case "workspace.write": {
      const params = req.params as { path?: string; content?: string } | undefined;
      const relativePath = params?.path;
      const content = params?.content;

      if (!relativePath || typeof relativePath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }
      if (typeof content !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "content is required" } };
      }
      return handleWorkspaceWriteWithQueryRuntime({
        requestId: req.id,
        stateDir: ctx.stateDir,
        additionalWorkspaceRoots: ctx.additionalWorkspaceRoots,
        statIfExists,
        isUnderRoot,
        writeTextFileAtomic,
        guardTeamSharedMemoryWrite,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "workspace.list"
          | "workspace.read"
          | "workspace.readSource"
          | "workspace.write"
        >(),
      }, {
        path: relativePath,
        content,
      });
    }

    case "context.compact": {
      const params = req.params as { conversationId?: string } | undefined;
      const conversationId = params?.conversationId;

      if (!conversationId || typeof conversationId !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      try {
        const result = await ctx.conversationStore.forceCompact(conversationId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            compacted: result.compacted,
            originalTokens: result.originalTokens,
            compactedTokens: result.compactedTokens,
            tier: result.tier,
          },
        };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "compact_failed", message: String(err) } };
      }
    }

    case "conversation.meta": {
      const params = req.params as { conversationId?: string; limit?: number } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const limit = typeof params?.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(50, Math.floor(params.limit)))
        : 10;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      const conversation = ctx.conversationStore.get(conversationId);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          conversationId,
          messages: buildConversationMetaMessages(conversation),
          taskTokenResults: ctx.conversationStore.getTaskTokenResults(conversationId, limit),
        },
      };
    }

    case "conversation.digest.get": {
      const params = req.params as { conversationId?: string; threshold?: number } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const threshold = typeof params?.threshold === "number" && Number.isFinite(params.threshold)
        ? Math.max(1, Math.floor(params.threshold))
        : undefined;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return handleConversationDigestGetWithQueryRuntime({
        requestId: req.id,
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        requestDurableExtraction: ctx.requestDurableExtraction,
        memoryUsageAccounting: ctx.memoryUsageAccounting,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        durableExtractionRequestRateLimiter: ctx.durableExtractionRequestRateLimiter,
        broadcastEvent: ctx.broadcastEvent,
        buildMemoryRuntimeDoctorReport,
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
        threshold,
      });
    }

    case "conversation.digest.refresh": {
      const params = req.params as { conversationId?: string; force?: boolean; threshold?: number } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const threshold = typeof params?.threshold === "number" && Number.isFinite(params.threshold)
        ? Math.max(1, Math.floor(params.threshold))
        : undefined;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return handleConversationDigestRefreshWithQueryRuntime({
        requestId: req.id,
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        requestDurableExtraction: ctx.requestDurableExtraction,
        memoryUsageAccounting: ctx.memoryUsageAccounting,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        durableExtractionRequestRateLimiter: ctx.durableExtractionRequestRateLimiter,
        broadcastEvent: ctx.broadcastEvent,
        buildMemoryRuntimeDoctorReport,
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
        threshold,
        force: params?.force === true,
      });
    }

    case "conversation.memory.extraction.get": {
      const params = req.params as { conversationId?: string; threshold?: number } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const threshold = typeof params?.threshold === "number" && Number.isFinite(params.threshold)
        ? Math.max(1, Math.floor(params.threshold))
        : undefined;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return handleConversationMemoryExtractionGetWithQueryRuntime({
        requestId: req.id,
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        stateDir: ctx.stateDir,
        teamSharedMemoryEnabled: process.env.BELLDANDY_TEAM_SHARED_MEMORY_ENABLED === "true",
        requestDurableExtraction: ctx.requestDurableExtraction,
        memoryUsageAccounting: ctx.memoryUsageAccounting,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        durableExtractionRequestRateLimiter: ctx.durableExtractionRequestRateLimiter,
        broadcastEvent: ctx.broadcastEvent,
        buildMemoryRuntimeDoctorReport,
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
        threshold,
      });
    }

    case "conversation.memory.extract": {
      const params = req.params as { conversationId?: string; threshold?: number; refreshDigest?: boolean } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const threshold = typeof params?.threshold === "number" && Number.isFinite(params.threshold)
        ? Math.max(1, Math.floor(params.threshold))
        : undefined;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return handleConversationMemoryExtractWithQueryRuntime({
        requestId: req.id,
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        stateDir: ctx.stateDir,
        teamSharedMemoryEnabled: process.env.BELLDANDY_TEAM_SHARED_MEMORY_ENABLED === "true",
        requestDurableExtraction: ctx.requestDurableExtraction,
        memoryUsageAccounting: ctx.memoryUsageAccounting,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        durableExtractionRequestRateLimiter: ctx.durableExtractionRequestRateLimiter,
        broadcastEvent: ctx.broadcastEvent,
        buildMemoryRuntimeDoctorReport,
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
        threshold,
        refreshDigest: params?.refreshDigest === true,
      });
    }

    case "subtask.list": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const conversationId = typeof params.conversationId === "string" && params.conversationId.trim()
        ? params.conversationId.trim()
        : undefined;
      const includeArchived = params.includeArchived === true;
      return handleSubTaskListWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        conversationId,
        includeArchived,
      });
    }

    case "subtask.get": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }
      return handleSubTaskGetWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
      });
    }

    case "subtask.stop": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const reason = typeof params.reason === "string" && params.reason.trim()
        ? params.reason.trim()
        : undefined;
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }
      return handleSubTaskStopWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
        reason,
      });
    }

    case "subtask.archive": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const reason = typeof params.reason === "string" && params.reason.trim()
        ? params.reason.trim()
        : undefined;
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }
      return handleSubTaskArchiveWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
        reason,
      });
    }
  }

  return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Unknown method." } };
}

function parseMessageSendParams(value: unknown): { ok: true; value: MessageSendParams } | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "params must be an object" };
  const obj = value as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text : "";
  const limits = getAttachmentLimits();

  let attachments: MessageSendParams["attachments"];
  if (obj.attachments !== undefined) {
    if (!Array.isArray(obj.attachments)) return { ok: false, message: "attachments must be an array" };
    attachments = [];
    let totalBytes = 0;
    for (let i = 0; i < obj.attachments.length; i += 1) {
      const raw = obj.attachments[i];
      if (!raw || typeof raw !== "object") {
        return { ok: false, message: `attachments[${i}] must be an object` };
      }
      const att = raw as Record<string, unknown>;
      const name = typeof att.name === "string" ? att.name.trim() : "";
      const type = typeof att.type === "string" ? att.type.trim() : "";
      const base64 = typeof att.base64 === "string" ? att.base64.trim() : "";
      if (!name || !type || !base64) {
        return { ok: false, message: `attachments[${i}] requires name/type/base64` };
      }
      const estimatedBytes = estimateBase64DecodedBytes(base64);
      if (estimatedBytes === null) {
        return { ok: false, message: `attachments[${i}].base64 is invalid` };
      }
      if (estimatedBytes > limits.maxFileBytes) {
        return { ok: false, message: `attachment "${name}" exceeds max file size (${limits.maxFileBytes} bytes)` };
      }
      totalBytes += estimatedBytes;
      if (totalBytes > limits.maxTotalBytes) {
        return { ok: false, message: `attachments total size exceeds limit (${limits.maxTotalBytes} bytes)` };
      }
      attachments.push({ name, type, base64 });
    }
  }

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!text.trim() && !hasAttachments) return { ok: false, message: "text or attachments required" };
  const conversationId =
    typeof obj.conversationId === "string" && obj.conversationId.trim() ? obj.conversationId.trim() : undefined;
  const from = typeof obj.from === "string" && obj.from.trim() ? obj.from.trim() : undefined;
  const agentId = typeof obj.agentId === "string" && obj.agentId.trim() ? obj.agentId.trim() : undefined;
  const modelId = typeof obj.modelId === "string" && obj.modelId.trim() ? obj.modelId.trim() : undefined;
  const userUuid = typeof obj.userUuid === "string" && obj.userUuid.trim() ? obj.userUuid.trim() : undefined;
  const clientContextObj = obj.clientContext && typeof obj.clientContext === "object"
    ? obj.clientContext as Record<string, unknown>
    : undefined;
  const clientContext = clientContextObj
    ? {
      sentAtMs: typeof clientContextObj.sentAtMs === "number"
        ? clientContextObj.sentAtMs as number
        : undefined,
      timezoneOffsetMinutes: typeof clientContextObj.timezoneOffsetMinutes === "number"
        ? clientContextObj.timezoneOffsetMinutes as number
        : undefined,
      locale: typeof clientContextObj.locale === "string"
        ? clientContextObj.locale.trim() || undefined
        : undefined,
    }
    : undefined;

  // 解析 senderInfo 和 roomContext（用于 office.goddess.ai 社区）
  const senderInfo = obj.senderInfo && typeof obj.senderInfo === "object" ? obj.senderInfo as any : undefined;
  const roomContext = obj.roomContext && typeof obj.roomContext === "object" ? obj.roomContext as any : undefined;

  return { ok: true, value: { text, conversationId, from, agentId, modelId, userUuid, attachments, senderInfo, roomContext, clientContext } };
}

function parseToolSettingsConfirmParams(
  value: unknown,
): { ok: true; value: { requestId: string; decision: "approve" | "reject"; conversationId?: string } } | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "params must be an object" };
  const obj = value as Record<string, unknown>;
  const requestId = typeof obj.requestId === "string" ? obj.requestId.trim().toUpperCase() : "";
  const decision = typeof obj.decision === "string" ? obj.decision.trim().toLowerCase() : "";
  const conversationId =
    typeof obj.conversationId === "string" && obj.conversationId.trim() ? obj.conversationId.trim() : undefined;
  if (!requestId) return { ok: false, message: "requestId is required" };
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: 'decision must be "approve" or "reject"' };
  }
  return { ok: true, value: { requestId, decision, conversationId } };
}

function safeParseFrame(raw: string): GatewayFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const type = obj.type;
  if (type === "connect") {
    const role = typeof obj.role === "string" ? obj.role : "web";
    const auth = parseAuth(obj.auth);
    const clientId = typeof obj.clientId === "string" ? obj.clientId : undefined;
    const userUuid = typeof obj.userUuid === "string" && obj.userUuid.trim() ? obj.userUuid.trim() : undefined; // 解析 userUuid
    return {
      type: "connect",
      role: isRole(role) ? role : "web",
      clientId,
      auth,
      clientName: typeof obj.clientName === "string" ? obj.clientName : undefined,
      clientVersion: typeof obj.clientVersion === "string" ? obj.clientVersion : undefined,
      userUuid, // 添加 userUuid 字段
    };
  }
  if (type === "req") {
    const id = typeof obj.id === "string" ? obj.id : "";
    const method = typeof obj.method === "string" ? obj.method : "";
    if (!id || !method) return null;
    return { type: "req", id, method, params: (obj.params ?? undefined) as any };
  }
  return null;
}

function parseAuth(value: unknown): GatewayAuth {
  if (!value || typeof value !== "object") return { mode: "none" };
  const obj = value as Record<string, unknown>;
  const mode = obj.mode;
  if (mode === "token") {
    const token = typeof obj.token === "string" ? obj.token : "";
    return { mode: "token", token };
  }
  if (mode === "password") {
    const password = typeof obj.password === "string" ? obj.password : "";
    return { mode: "password", password };
  }
  return { mode: "none" };
}

function isRole(value: string): value is BelldandyRole {
  return value === "web" || value === "cli" || value === "node";
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampListLimit(value: unknown, fallback: number, max = 100): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function toMemoryListPayloadItems(items: Array<any>, includeContent: boolean): Array<Record<string, unknown>> {
  if (includeContent) {
    return items as Array<Record<string, unknown>>;
  }
  return items.map(({ content, ...rest }) => rest);
}

function toTaskListPayloadItems(items: Array<any>, summaryOnly: boolean): Array<Record<string, unknown>> {
  if (!summaryOnly) {
    return items as Array<Record<string, unknown>>;
  }
  return items.map((item) => ({
    id: item.id,
    conversationId: item.conversationId,
    title: item.title,
    objective: item.objective,
    summary: item.summary,
    status: item.status,
    source: item.source,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    createdAt: item.createdAt,
    metadata: item.metadata,
  }));
}

function parseGoalTaskCheckpointStatus(value: unknown): "not_required" | "required" | "waiting_user" | "approved" | "rejected" | "expired" | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  switch (normalized) {
    case "not_required":
    case "required":
    case "waiting_user":
    case "approved":
    case "rejected":
    case "expired":
      return normalized;
    default:
      return undefined;
  }
}

function parseGoalTaskCreateStatus(value: unknown): "draft" | "ready" | "blocked" | "skipped" | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  switch (normalized) {
    case "draft":
    case "ready":
    case "blocked":
    case "skipped":
      return normalized;
    default:
      return undefined;
  }
}

function sendRes(ws: WebSocket, frame: GatewayResFrame) {
  sendFrame(ws, frame);
}

function sendEvent(ws: WebSocket, frame: GatewayEventFrame) {
  sendFrame(ws, frame);
}

function sendFrame(ws: WebSocket, frame: GatewayFrame) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(frame));
}

function sendHttpJson(
  res: express.Response,
  response: QueryRuntimeHttpJsonResponse,
) {
  for (const [key, value] of Object.entries(response.headers ?? {})) {
    res.setHeader(key, value);
  }
  return res.status(response.status).json(response.body);
}

function safeClose(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // ignore
  }
}

async function ensureWebRoot(webRoot: string): Promise<void> {
  const stat = await statIfExists(webRoot);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Invalid webRoot: ${webRoot}`);
  }
}
