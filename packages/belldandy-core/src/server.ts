import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";

import express from "express";
import { type WebSocket } from "ws";
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
import { MockAgent, type AgentPromptDelta, type BelldandyAgent, ConversationStore, type AgentRegistry, isResidentAgentProfile, type ModelProfile, type CompactionRuntimeReport, type ProviderNativeSystemBlock, type SessionTimelineProjection, type SessionTranscriptExportBundle, type SystemPromptSection } from "@belldandy/agent";
import type {
  GatewayReqFrame,
  GatewayResFrame,
  GatewayEventFrame,
  MessageSendParams,
  ChatMessageMeta,
} from "@belldandy/protocol";
import { approvePairingCode, ensurePairingCode, isClientAllowed, resolveStateDir } from "./security/store.js";
import type { BelldandyLogger } from "./logger/index.js";
import type { ToolsConfigManager } from "./tools-config.js";
import type { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import type { ExternalOutboundAuditStore } from "./external-outbound-audit-store.js";
import type { ExternalOutboundConfirmationStore } from "./external-outbound-confirmation-store.js";
import type { ExternalOutboundSenderRegistry } from "./external-outbound-sender-registry.js";
import {
  buildPromptObservabilitySummary,
  formatPromptObservabilityHeadline,
  toPromptObservabilityView,
} from "./prompt-observability.js";
import { resolveModelMediaCapabilities } from "./media-capability-registry.js";
import {
  buildToolBehaviorObservability,
  readConfiguredPromptExperimentToolContracts,
} from "./tool-behavior-observability.js";
import { buildToolContractV2Observability } from "./tool-contract-v2-observability.js";
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
  applyTimelineProjectionFilter,
  applyTranscriptExportProjection,
  normalizeConversationIdPrefix,
  normalizeTimelineKinds,
  normalizeTranscriptEventTypes,
  normalizeTranscriptRestoreView,
  parsePositiveInteger,
} from "./conversation-debug-projection.js";
import { listRecentConversationExports } from "./conversation-export-index.js";
import {
  loadConversationPromptSnapshotArtifact,
  type ConversationPromptSnapshotArtifact,
} from "./conversation-prompt-snapshot.js";
import { buildAgentRoster } from "./query-runtime-agent-roster.js";
import { ensureResidentAgentSession } from "./query-runtime-agent-sessions.js";
import { buildLearningReviewNudgeRuntimeReport } from "./learning-review-nudge-runtime.js";
import { buildDeploymentBackendsDoctorReport, ensureDeploymentBackendsConfig } from "./deployment-backends.js";
import { buildResidentAgentObservabilitySnapshot } from "./resident-agent-observability.js";
import { resolveResidentStateBindingViewForAgent } from "./resident-state-binding.js";
import { buildAgentLaunchExplainability } from "./agent-launch-explainability.js";
import type { RuntimeResilienceDoctorReport } from "./runtime-resilience.js";
import { QueryRuntimeTraceStore } from "./query-runtime-trace.js";
import { ResidentConversationStore } from "./resident-conversation-store.js";
import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";
import { notifyConversationToolEvent } from "./query-runtime-side-effects.js";
import { buildDelegationObservabilitySnapshot } from "./subtask-result-envelope.js";
import type { ToolExecutor, TranscribeOptions, TranscribeResult, SkillRegistry } from "@belldandy/skills";
import type { ToolExecutionRuntimeContext } from "@belldandy/skills";
import { listToolContractsV2, TOOL_SETTINGS_CONTROL_NAME } from "@belldandy/skills";
import type { PluginRegistry } from "@belldandy/plugins";
import type { WebhookConfig, IdempotencyManager } from "./webhook/index.js";
import type { GoalManager } from "./goals/manager.js";
import { ResidentAgentRuntimeRegistry } from "./resident-agent-runtime.js";
import { handleAgentsSystemMethod } from "./server-methods/agents-system.js";
import { handleModelsConfigMethod } from "./server-methods/models-config.js";
import { handleQueryRuntimeDomainsMethod } from "./server-methods/query-runtime-domains.js";
import { handleConfigChannelMethod } from "./server-methods/config-channel.js";
import { handleGoalMethod } from "./server-methods/goals.js";
import { handleMemoryExperienceMethod } from "./server-methods/memory-experience.js";
import { handleMessageSendMethod } from "./server-methods/message-send.js";
import { buildGatewayHttpRoutesContext } from "./server-http-runtime.js";
import { registerGatewayHttpRoutes } from "./server-http-routes.js";
import {
  createGatewayWebSocketRequestHandler,
  type GatewayWebSocketRequestContext,
} from "./server-websocket-dispatch.js";
import {
  createGatewayWebSocketRuntime,
  sendGatewayEvent,
} from "./server-websocket-runtime.js";
import { handleSystemDoctorMethod } from "./server-methods/system-doctor.js";
import { handleWorkspaceConversationMethod } from "./server-methods/workspace-conversation.js";
import { buildChannelSecurityDoctorReport } from "./channel-security-doctor.js";
import {
  getChannelReplyChunkingConfigContent,
  parseChannelReplyChunkingConfigContent,
  writeChannelReplyChunkingConfig,
} from "./channel-reply-chunking-store.js";
import {
  approveChannelSecurityApprovalRequest,
  getChannelSecurityConfigContent,
  parseChannelSecurityConfigContent,
  readChannelSecurityApprovalStore,
  rejectChannelSecurityApprovalRequest,
  writeChannelSecurityConfig,
} from "./channel-security-store.js";
import { buildExternalOutboundDoctorReport, type ExternalOutboundDoctorReport } from "./external-outbound-doctor.js";
import { normalizePreferredProviderIds } from "./provider-model-catalog.js";
import type { ChannelSecurityApprovalRequestInput } from "@belldandy/channels";
import type { BackgroundContinuationRuntimeDoctorReport } from "./background-continuation-runtime.js";
import type { CronRuntimeDoctorReport } from "./cron/observability.js";

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
  primaryModelConfig?: { baseUrl: string; apiKey: string; model: string; protocol?: string; wireApi?: string };
  /** 备用模型配置（来自 models.json） */
  modelFallbacks?: ModelProfile[];
  /** provider 排序偏好（来自 env/config） */
  preferredProviderIds?: string[];
  /** models.json 的实际路径（支持自定义配置文件） */
  modelConfigPath?: string;
  conversationStoreOptions?: { maxHistory?: number; ttlSeconds?: number };
  conversationStore?: ConversationStore; // [NEW] Allow passing shared instance
  getCompactionRuntimeReport?: () => CompactionRuntimeReport | undefined;
  getRuntimeResilienceReport?: () => RuntimeResilienceDoctorReport | undefined;
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
  /** 外部渠道外发确认存储 */
  externalOutboundConfirmationStore?: ExternalOutboundConfirmationStore;
  /** 外部渠道外发 sender registry */
  externalOutboundSenderRegistry?: ExternalOutboundSenderRegistry;
  /** 外部渠道外发审计存储 */
  externalOutboundAuditStore?: ExternalOutboundAuditStore;
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
  /** Prompt dump / inspect 能力 */
  inspectAgentPrompt?: (input: {
    agentId?: string;
    conversationId?: string;
    runId?: string;
  }) => Promise<{
    scope?: "agent" | "run";
    agentId: string;
    displayName?: string;
    model?: string;
    conversationId?: string;
    runId?: string;
    createdAt?: number;
    text: string;
    truncated: boolean;
    maxChars?: number;
    totalChars: number;
    finalChars: number;
    sections: Array<SystemPromptSection & { charLength: number; estimatedChars: number; estimatedTokens: number }>;
    droppedSections: Array<SystemPromptSection & { charLength: number; estimatedChars: number; estimatedTokens: number }>;
    deltas?: Array<AgentPromptDelta & { charLength: number; estimatedChars: number; estimatedTokens: number }>;
    providerNativeSystemBlocks?: Array<ProviderNativeSystemBlock & { charLength: number; estimatedChars: number; estimatedTokens: number }>;
    messages?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  }>;
  getConversationPromptSnapshot?: (input: {
    conversationId: string;
    runId?: string;
  }) => Promise<ConversationPromptSnapshotArtifact | undefined>;
  /** 长期任务管理器 */
  goalManager?: GoalManager;
  /** 子任务运行时存储 */
  subTaskRuntimeStore?: SubTaskRuntimeStore;
  /** 子任务 resume / continuation 控制 */
  resumeSubTask?: (taskId: string, message?: string) => Promise<SubTaskRecord | undefined>;
  /** 子任务 takeover 控制 */
  takeoverSubTask?: (taskId: string, agentId: string, message?: string) => Promise<SubTaskRecord | undefined>;
  /** 子任务 steering / update 控制 */
  updateSubTask?: (taskId: string, message: string) => Promise<SubTaskRecord | undefined>;
  /** 子任务停止控制 */
  stopSubTask?: (taskId: string, reason?: string) => Promise<SubTaskRecord | undefined>;
  /** Webhook 配置 */
  webhookConfig?: WebhookConfig;
  /** Webhook 幂等性管理器 */
  webhookIdempotency?: IdempotencyManager;
  /** Resident MemoryManager 组装记录 */
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  /** Cron 运行态观测摘要 */
  getCronRuntimeDoctorReport?: () => Promise<CronRuntimeDoctorReport | undefined>;
  /** Background continuation runtime 摘要 */
  getBackgroundContinuationRuntimeDoctorReport?: () => Promise<BackgroundContinuationRuntimeDoctorReport | undefined>;
  /** 当 community/http 等入口命中 DM allowlist 阻断时记录待审批 sender */
  onChannelSecurityApprovalRequired?: (input: ChannelSecurityApprovalRequestInput) => void | Promise<void>;
};

export type GatewayServer = {
  port: number;
  host: string;
  close: () => Promise<void>;
  broadcast: (frame: GatewayEventFrame) => void;
  requestDurableExtractionFromDigest: (input: {
    conversationId: string;
    source: string;
    threshold?: number;
    force?: boolean;
  }) => Promise<void>;
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

function hasTranscriptExportArtifacts(bundle: SessionTranscriptExportBundle | undefined): boolean {
  if (!bundle) {
    return false;
  }
  return bundle.summary.eventCount > 0 || bundle.restore.rawMessages.length > 0;
}

function hasTimelineArtifacts(timeline: SessionTimelineProjection | undefined): boolean {
  if (!timeline) {
    return false;
  }
  return timeline.summary.eventCount > 0
    || timeline.summary.messageCount > 0
    || timeline.items.some((item) => item.kind !== "restore_result");
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

export async function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer> {
  await ensureWebRoot(opts.webRoot);
  const stateDir = opts.stateDir ?? resolveStateDir();
  const avatarDir = path.join(stateDir, "avatar");
  const runtimePreferredProviderIds = Array.isArray(opts.preferredProviderIds)
    ? opts.preferredProviderIds
    : [];
  const getConversationPromptSnapshot = opts.getConversationPromptSnapshot
    ?? (async ({ conversationId, runId }: { conversationId: string; runId?: string }) => {
      return loadConversationPromptSnapshotArtifact({
        stateDir,
        conversationId,
        runId,
      });
    });

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

  await registerGatewayHttpRoutes(buildGatewayHttpRoutesContext({
    app,
    stateDir,
    log,
    options: {
      auth: opts.auth,
      webRoot: opts.webRoot,
      stateDir: opts.stateDir,
      agentFactory: opts.agentFactory,
      agentRegistry: opts.agentRegistry,
      webhookConfig: opts.webhookConfig,
      webhookIdempotency: opts.webhookIdempotency,
      onChannelSecurityApprovalRequired: opts.onChannelSecurityApprovalRequired,
    },
    getConversationStore: () => conversationStore,
    getQueryRuntimeTraceStore: () => queryRuntimeTraceStore,
    writeBinaryFileAtomic,
    writeTextFileAtomic,
    emitAutoRunTaskTokenResult,
  }));

  const server = http.createServer(app);
  const host = opts.host ?? "127.0.0.1"; // Default to localhost for security

  // 初始化会话存储
  const sessionsDir = path.join(stateDir, "sessions");

  // Ensure sessions dir exists
  await fsp.mkdir(sessionsDir, { recursive: true });
  await fsp.mkdir(avatarDir, { recursive: true });
  await ensureDeploymentBackendsConfig(stateDir);

  const conversationStore = opts.conversationStore ?? new ResidentConversationStore({
    ...opts.conversationStoreOptions,
    stateDir,
    agentRegistry: opts.agentRegistry,
  });
  (opts.toolExecutor as (ToolExecutor & {
    setConversationStore?: (conversationStore?: ConversationStore) => void;
  }) | undefined)?.setConversationStore?.(conversationStore);
  const residentAgentRuntime = new ResidentAgentRuntimeRegistry(
    opts.agentRegistry?.list().filter((profile) => isResidentAgentProfile(profile)).map((profile) => profile.id) ?? ["default"],
  );
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
      extractor: createDurableExtractionSurface({
        get isPaused() {
          return durableExtractionManager.isPaused;
        },
        extractMemoriesFromConversation(sessionKey, messages, options) {
          const scopedManager = getGlobalMemoryManager({
            conversationId: options?.sourceConversationId ?? sessionKey,
          }) ?? durableExtractionManager;
          return scopedManager.extractMemoriesFromConversation(sessionKey, messages, options);
        },
        isConversationMemoryExtractionEnabled() {
          return durableExtractionManager.isConversationMemoryExtractionEnabled();
        },
        getConversationMemoryExtractionSupport() {
          return durableExtractionManager.getConversationMemoryExtractionSupport();
        },
        getDurableMemoryGuidance() {
          return durableExtractionManager.getDurableMemoryGuidance();
        },
      }),
      getMessages: async (conversationId) => {
        return conversationStore.getCanonicalExtractionView(conversationId);
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

  let broadcastEvent: ((frame: GatewayEventFrame) => void) | undefined;
  const handleWebSocketRequest = createGatewayWebSocketRequestHandler({
    stateDir,
    additionalWorkspaceRoots: opts.additionalWorkspaceRoots ?? [],
    envDir: opts.envDir,
    auth: opts.auth,
    log,
    agentFactory: opts.agentFactory ?? (() => new MockAgent()),
    agentRegistry: opts.agentRegistry,
    inspectAgentPrompt: opts.inspectAgentPrompt,
    getConversationPromptSnapshot,
    primaryModelConfig: opts.primaryModelConfig,
    modelFallbacks: opts.modelFallbacks,
    preferredProviderIds: runtimePreferredProviderIds,
    modelConfigPath: opts.modelConfigPath,
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
    externalOutboundConfirmationStore: opts.externalOutboundConfirmationStore,
    externalOutboundSenderRegistry: opts.externalOutboundSenderRegistry,
    externalOutboundAuditStore: opts.externalOutboundAuditStore,
    getAgentToolControlMode: opts.getAgentToolControlMode,
    getAgentToolControlConfirmPassword: opts.getAgentToolControlConfirmPassword,
    sttTranscribe: opts.sttTranscribe,
    pluginRegistry: opts.pluginRegistry,
    extensionHost: opts.extensionHost,
    skillRegistry: opts.skillRegistry,
    goalManager: opts.goalManager,
    subTaskRuntimeStore: opts.subTaskRuntimeStore,
    resumeSubTask: opts.resumeSubTask,
    takeoverSubTask: opts.takeoverSubTask,
    updateSubTask: opts.updateSubTask,
    stopSubTask: opts.stopSubTask,
    tokenUsageUploadConfig,
    broadcastEvent: (frame) => broadcastEvent?.(frame),
    getCompactionRuntimeReport: opts.getCompactionRuntimeReport,
    getRuntimeResilienceReport: opts.getRuntimeResilienceReport,
    queryRuntimeTraceStore,
    residentAgentRuntime,
    residentMemoryManagers: opts.residentMemoryManagers,
    getCronRuntimeDoctorReport: opts.getCronRuntimeDoctorReport,
    getBackgroundContinuationRuntimeDoctorReport: opts.getBackgroundContinuationRuntimeDoctorReport,
    handleReq,
  });
  const websocketRuntime = createGatewayWebSocketRuntime({
    server,
    host,
    stateDir,
    auth: opts.auth,
    log,
    onActivity: opts.onActivity,
    isConfigured: opts.isConfigured,
    onRequest: handleWebSocketRequest,
  });
  broadcastEvent = websocketRuntime.broadcast;
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
    broadcastEvent?.({
      type: "event",
      event,
      payload,
    });
  });
  const detachSubTaskBroadcast = opts.subTaskRuntimeStore?.subscribe((event) => {
    broadcastEvent?.({
      type: "event",
      event: "subtask.update",
      payload: {
        kind: event.kind,
        item: event.item,
      },
    });
  });

  // MemoryManager is now created and registered globally by gateway.ts (unified instance)
  // No need to create a separate instance here.
  const detachDurableExtractionBroadcast = durableExtractionRuntime?.subscribe((event) => {
    broadcastEvent?.({
      type: "event",
      event: "conversation.memory.extraction.updated",
      payload: {
        conversationId: event.record.conversationId,
        extraction: event.record,
      },
    });
  });
  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));

  const address = server.address();
  const port =
    typeof address === "object" && address && "port" in address ? Number(address.port) : opts.port;
  const requestDurableExtractionFromDigest = async (input: {
    conversationId: string;
    source: string;
    threshold?: number;
    force?: boolean;
  }): Promise<void> => {
    if (!durableExtractionRuntime?.isAvailable()) {
      return;
    }
    try {
      await refreshConversationDigestAndBroadcast(
        conversationStore,
        {
          conversationId: input.conversationId,
          source: input.source,
          threshold: input.threshold,
          force: input.force === true,
        },
        undefined,
        durableExtractionRuntime,
        requestDurableExtraction,
        memoryUsageAccounting,
        memoryBudgetGuard,
        false,
      );
    } catch (error) {
      if (!(error instanceof MemoryBudgetExceededError)) {
        throw error;
      }
      log.warn("memory-evolution", "Session digest refresh budget exceeded during durable extraction scheduling; reusing current digest snapshot", {
        conversationId: input.conversationId,
        source: input.source,
        retryAfterMs: error.decision.retryAfterMs,
        observedRuns: error.decision.observedRuns,
        maxRuns: error.decision.maxRuns,
        windowMs: error.decision.windowMs,
      });
    }
    const digest = await conversationStore.getSessionDigest(input.conversationId, { threshold: input.threshold });
    await (requestDurableExtraction ?? durableExtractionRuntime.requestExtraction.bind(durableExtractionRuntime))({
      conversationId: input.conversationId,
      source: input.source,
      digest: toDurableExtractionDigestSnapshot(digest),
    });
  };

  return {
    port,
    host,
    close: async () => {
      detachSubTaskBroadcast?.();
      detachDurableExtractionBroadcast?.();
      await websocketRuntime.close();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await durableExtractionRuntime?.close();
      await memoryUsageAccounting.flush();
    },
    broadcast: broadcastEvent,
    requestDurableExtractionFromDigest,
  };
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
  sendGatewayEvent(ws, {
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
  scheduleDurableExtraction = true,
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
  if (scheduleDurableExtraction && result.updated && durableExtractionRuntime?.isAvailable()) {
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
  ctx: GatewayWebSocketRequestContext,
): Promise<GatewayResFrame | null> {
  const secureMethods = [
    "message.send",
    "tool_settings.confirm",
    "external_outbound.confirm",
    "external_outbound.audit.list",
    "models.config.get",
    "models.config.update",
    "config.read",
    "config.readRaw",
    "config.update",
    "config.writeRaw",
    "channel.reply_chunking.get",
    "channel.reply_chunking.update",
    "channel.security.get",
    "channel.security.update",
    "channel.security.pending.list",
    "channel.security.approve",
    "channel.security.reject",
    "system.restart",
    "system.doctor",
    "workspace.write",
    "workspace.read",
    "workspace.readSource",
    "workspace.list",
    "context.compact",
    "context.compact.partial",
    "conversation.meta",
    "conversation.restore",
    "conversation.transcript.export",
    "conversation.timeline.get",
    "conversation.prompt_snapshot.get",
    "conversation.digest.get",
    "conversation.digest.refresh",
    "conversation.memory.extract",
    "conversation.memory.extraction.get",
    "subtask.list",
    "subtask.get",
    "subtask.resume",
    "subtask.takeover",
    "subtask.update",
    "subtask.stop",
    "subtask.archive",
    "agent.catalog.get",
    "agent.contracts.get",
    "delegation.inspect.get",
    "agents.prompt.inspect",
    "tools.update",
    "memory.search",
    "memory.get",
    "memory.recent",
    "memory.stats",
    "memory.share.promote",
    "memory.share.claim",
    "memory.share.review",
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
    "experience.skill.freshness.update",
    "goal.create",
    "goal.list",
    "goal.get",
    "goal.resume",
    "goal.pause",
    "goal.handoff.get",
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
      sendGatewayEvent(ws, {
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

  const queryRuntimeDomainsContext = {
    clientId: ctx.clientId,
    stateDir: ctx.stateDir,
    agentRegistry: ctx.agentRegistry,
    residentAgentRuntime: ctx.residentAgentRuntime,
    queryRuntimeTraceStore: ctx.queryRuntimeTraceStore,
    toolExecutor: ctx.toolExecutor,
    toolsConfigManager: ctx.toolsConfigManager,
    toolControlConfirmationStore: ctx.toolControlConfirmationStore,
    getAgentToolControlMode: ctx.getAgentToolControlMode,
    getAgentToolControlConfirmPassword: ctx.getAgentToolControlConfirmPassword,
    pluginRegistry: ctx.pluginRegistry,
    extensionHost: ctx.extensionHost,
    skillRegistry: ctx.skillRegistry,
    subTaskRuntimeStore: ctx.subTaskRuntimeStore,
    getConversationPromptSnapshot: ctx.getConversationPromptSnapshot,
    resumeSubTask: ctx.resumeSubTask,
    takeoverSubTask: ctx.takeoverSubTask,
    updateSubTask: ctx.updateSubTask,
    stopSubTask: ctx.stopSubTask,
    externalOutboundConfirmationStore: ctx.externalOutboundConfirmationStore,
    externalOutboundSenderRegistry: ctx.externalOutboundSenderRegistry,
    externalOutboundAuditStore: ctx.externalOutboundAuditStore,
    emitEvent: (frame: GatewayEventFrame) => {
      if (ctx.broadcastEvent) {
        ctx.broadcastEvent(frame);
      } else {
        sendGatewayEvent(ws, frame);
      }
    },
    parseToolSettingsConfirmParams,
    parseExternalOutboundConfirmParams,
    resolvePendingToolControlRequest,
    applyToolControlChanges: (
      disabled: {
        builtin: string[];
        mcp_servers: string[];
        plugins: string[];
        skills?: string[];
      },
      changes: unknown,
    ) => ({
      ...applyToolControlChanges({
        builtin: disabled.builtin,
        mcp_servers: disabled.mcp_servers,
        plugins: disabled.plugins,
        skills: Array.isArray(disabled.skills) ? disabled.skills : [],
      }, changes as Parameters<typeof applyToolControlChanges>[1]),
      skills: Array.isArray(disabled.skills) ? disabled.skills : [],
    }),
    buildToolControlDisabledPayload: (disabled: {
      builtin: string[];
      mcp_servers: string[];
      plugins: string[];
      skills?: string[];
    }) => buildToolControlDisabledPayload({
      builtin: disabled.builtin,
      mcp_servers: disabled.mcp_servers,
      plugins: disabled.plugins,
      skills: Array.isArray(disabled.skills) ? disabled.skills : [],
    }),
    resolveToolControlPolicySnapshot,
    summarizeGroupedVisibility,
  } as const;

  const agentsSystemMethodContext = {
    stateDir: ctx.stateDir,
    clientId: ctx.clientId,
    log: ctx.log,
    agentRegistry: ctx.agentRegistry,
    residentAgentRuntime: ctx.residentAgentRuntime,
    residentMemoryManagers: ctx.residentMemoryManagers,
    conversationStore: ctx.conversationStore,
    subTaskRuntimeStore: ctx.subTaskRuntimeStore,
    inspectAgentPrompt: ctx.inspectAgentPrompt,
  } as const;

  const modelsConfigMethodContext = {
    stateDir: ctx.stateDir,
    primaryModelConfig: ctx.primaryModelConfig,
    modelFallbacks: ctx.modelFallbacks,
    preferredProviderIds: ctx.preferredProviderIds,
    modelConfigPath: ctx.modelConfigPath,
    agentRegistry: ctx.agentRegistry,
    queryRuntimeTraceStore: ctx.queryRuntimeTraceStore,
  } as const;

  switch (req.method) {
    case "pairing.approve": {
      const parsed = parsePairingApproveParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }
      const approved = await approvePairingCode({
        code: parsed.value.code,
        stateDir: ctx.stateDir,
      });
      if (!approved.ok) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "pairing_approve_failed", message: approved.message },
        };
      }
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          code: parsed.value.code,
          clientId: approved.clientId,
        },
      };
    }

    case "models.list":
    case "models.config.get":
    case "models.config.update":
      return handleModelsConfigMethod(req, modelsConfigMethodContext);

    case "message.send": {
      return handleMessageSendMethod(req, ws, {
        clientId: ctx.clientId,
        userUuid: ctx.userUuid,
        stateDir: ctx.stateDir,
        log: ctx.log,
        agentFactory: ctx.agentFactory,
        agentRegistry: ctx.agentRegistry,
        primaryModelConfig: ctx.primaryModelConfig,
        modelFallbacks: ctx.modelFallbacks,
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        requestDurableExtraction: ctx.requestDurableExtraction,
        memoryUsageAccounting: ctx.memoryUsageAccounting,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        ttsEnabled: ctx.ttsEnabled,
        ttsSynthesize: ctx.ttsSynthesize,
        toolControlConfirmationStore: ctx.toolControlConfirmationStore,
        getAgentToolControlMode: ctx.getAgentToolControlMode,
        getAgentToolControlConfirmPassword: ctx.getAgentToolControlConfirmPassword,
        sttTranscribe: ctx.sttTranscribe,
        tokenUsageUploadConfig: ctx.tokenUsageUploadConfig,
        broadcastEvent: ctx.broadcastEvent,
        queryRuntimeTraceStore: ctx.queryRuntimeTraceStore,
        residentAgentRuntime: ctx.residentAgentRuntime,
        parseMessageSendParams,
        getAttachmentPromptLimits,
        truncateTextForPrompt,
        formatLocalMessageTime,
        toChatMessageMeta,
        emitAutoRunTaskTokenResult,
        refreshConversationDigestAndBroadcast,
      });
    }

    case "tool_settings.confirm":
    case "external_outbound.confirm":
    case "external_outbound.audit.list": {
      return handleQueryRuntimeDomainsMethod(req, queryRuntimeDomainsContext);
    }

    case "config.read":
    case "config.update":
    case "channel.reply_chunking.get":
    case "channel.reply_chunking.update":
    case "channel.security.get":
    case "channel.security.update":
    case "channel.security.pending.list":
    case "channel.security.approve":
    case "channel.security.reject":
    case "config.readRaw":
    case "config.writeRaw": {
      return handleConfigChannelMethod(req, {
        envDir: ctx.envDir,
        auth: ctx.auth,
        stateDir: ctx.stateDir,
        preferredProviderIds: ctx.preferredProviderIds,
        statIfExists,
        readEnvFileIntoConfig,
        updateEnvFile,
        writeTextFileAtomic,
      });
    }

    case "tools.list":
    case "tools.update":
    case "agent.catalog.get":
    case "agent.contracts.get":
    case "delegation.inspect.get": {
      return handleQueryRuntimeDomainsMethod(req, queryRuntimeDomainsContext);
    }

    case "system.restart":
    case "agents.list":
    case "agents.roster.get":
    case "agent.session.ensure":
    case "agents.prompt.inspect":
      return handleAgentsSystemMethod(req, agentsSystemMethodContext);

    case "system.doctor": {
      return handleSystemDoctorMethod(req, {
        stateDir: ctx.stateDir,
        agentFactory: ctx.agentFactory,
        agentRegistry: ctx.agentRegistry,
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        durableExtractionRequestRateLimiter: ctx.durableExtractionRequestRateLimiter,
        toolsConfigManager: ctx.toolsConfigManager,
        toolExecutor: ctx.toolExecutor,
        externalOutboundAuditStore: ctx.externalOutboundAuditStore,
        pluginRegistry: ctx.pluginRegistry,
        extensionHost: ctx.extensionHost,
        skillRegistry: ctx.skillRegistry,
        getCompactionRuntimeReport: ctx.getCompactionRuntimeReport,
        getRuntimeResilienceReport: ctx.getRuntimeResilienceReport,
        queryRuntimeTraceStore: ctx.queryRuntimeTraceStore,
        residentAgentRuntime: ctx.residentAgentRuntime,
        residentMemoryManagers: ctx.residentMemoryManagers,
        getCronRuntimeDoctorReport: ctx.getCronRuntimeDoctorReport,
        getBackgroundContinuationRuntimeDoctorReport: ctx.getBackgroundContinuationRuntimeDoctorReport,
        inspectAgentPrompt: ctx.inspectAgentPrompt,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
      });
    }

    case "goal.create":
    case "goal.list":
    case "goal.get":
    case "goal.resume":
    case "goal.pause":
    case "goal.handoff.get":
    case "goal.handoff.generate":
    case "goal.retrospect.generate":
    case "goal.experience.suggest":
    case "goal.method_candidates.generate":
    case "goal.skill_candidates.generate":
    case "goal.flow_patterns.generate":
    case "goal.flow_patterns.cross_goal":
    case "goal.review_governance.summary":
    case "goal.approval.scan":
    case "goal.suggestion_review.list":
    case "goal.suggestion_review.workflow.set":
    case "goal.suggestion_review.decide":
    case "goal.suggestion_review.escalate":
    case "goal.suggestion_review.scan":
    case "goal.suggestion.publish":
    case "goal.checkpoint.list":
    case "goal.checkpoint.request":
    case "goal.checkpoint.approve":
    case "goal.checkpoint.reject":
    case "goal.checkpoint.expire":
    case "goal.checkpoint.reopen":
    case "goal.checkpoint.escalate":
    case "goal.task_graph.read":
    case "goal.task_graph.create":
    case "goal.task_graph.update":
    case "goal.task_graph.claim":
    case "goal.task_graph.pending_review":
    case "goal.task_graph.validating":
    case "goal.task_graph.complete":
    case "goal.task_graph.block":
    case "goal.task_graph.fail":
    case "goal.task_graph.skip":
      return handleGoalMethod(req, {
        goalManager: ctx.goalManager,
        stateDir: ctx.stateDir,
        residentMemoryManagers: ctx.residentMemoryManagers,
        parseGoalTaskCheckpointStatus,
        parseGoalTaskCreateStatus,
      });

    case "memory.search":
    case "memory.get":
    case "memory.recent":
    case "memory.stats":
    case "memory.share.queue":
    case "memory.share.promote":
    case "memory.share.review":
    case "memory.share.claim":
    case "memory.task.list":
    case "memory.task.get":
    case "experience.candidate.get":
    case "experience.candidate.list":
    case "experience.candidate.accept":
    case "experience.candidate.reject":
    case "experience.usage.get":
    case "experience.usage.list":
    case "experience.usage.stats":
    case "experience.usage.revoke":
    case "experience.skill.freshness.update":
      return handleMemoryExperienceMethod(req, {
        stateDir: ctx.stateDir,
        residentMemoryManagers: ctx.residentMemoryManagers,
        agentRegistry: ctx.agentRegistry,
        skillRegistry: ctx.skillRegistry,
      });

    case "workspace.list":
    case "workspace.read":
    case "workspace.readSource":
    case "workspace.write":
    case "context.compact":
    case "context.compact.partial":
    case "conversation.meta":
    case "conversation.transcript.export":
    case "conversation.timeline.get":
    case "conversation.prompt_snapshot.get":
    case "conversation.digest.get":
    case "conversation.digest.refresh":
    case "conversation.memory.extraction.get":
    case "conversation.memory.extract":
    case "conversation.restore": {
      return handleWorkspaceConversationMethod(req, {
        stateDir: ctx.stateDir,
        additionalWorkspaceRoots: ctx.additionalWorkspaceRoots,
        conversationStore: ctx.conversationStore,
        getConversationPromptSnapshot: ctx.getConversationPromptSnapshot,
        agentRegistry: ctx.agentRegistry,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        requestDurableExtraction: ctx.requestDurableExtraction,
        memoryUsageAccounting: ctx.memoryUsageAccounting,
        memoryBudgetGuard: ctx.memoryBudgetGuard,
        durableExtractionRequestRateLimiter: ctx.durableExtractionRequestRateLimiter,
        broadcastEvent: ctx.broadcastEvent,
        getCompactionRuntimeReport: ctx.getCompactionRuntimeReport,
        queryRuntimeTraceStore: ctx.queryRuntimeTraceStore,
        statIfExists,
        isUnderRoot,
        writeTextFileAtomic,
        guardTeamSharedMemoryWrite,
        goalManager: ctx.goalManager,
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
      });
    }

    case "subtask.list":
    case "subtask.get":
    case "subtask.resume":
    case "subtask.takeover":
    case "subtask.update":
    case "subtask.stop":
    case "subtask.archive": {
      return handleQueryRuntimeDomainsMethod(req, queryRuntimeDomainsContext);
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

function parsePairingApproveParams(
  value: unknown,
): { ok: true; value: { code: string } } | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "params must be an object" };
  const obj = value as Record<string, unknown>;
  const code = typeof obj.code === "string" ? obj.code.trim().toUpperCase() : "";
  if (!code) return { ok: false, message: "code is required" };
  return { ok: true, value: { code } };
}

function parseExternalOutboundConfirmParams(
  value: unknown,
): { ok: true; value: { requestId: string; decision: "approve" | "reject"; conversationId?: string } } | { ok: false; message: string } {
  return parseToolSettingsConfirmParams(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampListLimit(value: unknown, fallback: number, max = 100): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
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

async function ensureWebRoot(webRoot: string): Promise<void> {
  const stat = await statIfExists(webRoot);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Invalid webRoot: ${webRoot}`);
  }
}
