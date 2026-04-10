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
import { MockAgent, type AgentPromptDelta, type BelldandyAgent, ConversationStore, type AgentRegistry, extractIdentityInfo, isResidentAgentProfile, resolveAgentWorkspaceDir, type Conversation, type ConversationMessage, type ModelProfile, type CompactionRuntimeReport, type ProviderNativeSystemBlock, type SessionTimelineProjection, type SessionTranscriptExportBundle, type SystemPromptSection } from "@belldandy/agent";
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
import { buildGoalSessionStartBanner } from "./goal-session-banner.js";
import {
  handleConversationRestoreWithQueryRuntime,
  handleConversationTranscriptExportWithQueryRuntime,
  handleConversationTimelineGetWithQueryRuntime,
  handleConversationDigestGetWithQueryRuntime,
  handleConversationDigestRefreshWithQueryRuntime,
  handleConversationMemoryExtractionGetWithQueryRuntime,
  handleConversationMemoryExtractWithQueryRuntime,
} from "./query-runtime-memory.js";
import { handleConversationPromptSnapshotGetWithQueryRuntime } from "./query-runtime-prompt-snapshot.js";
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
import {
  handleSubTaskArchiveWithQueryRuntime,
  handleSubTaskGetWithQueryRuntime,
  handleSubTaskListWithQueryRuntime,
  handleSubTaskResumeWithQueryRuntime,
  handleSubTaskTakeoverWithQueryRuntime,
  handleSubTaskStopWithQueryRuntime,
  handleSubTaskUpdateWithQueryRuntime,
} from "./query-runtime-subtask.js";
import { handleDelegationInspectGetWithQueryRuntime } from "./query-runtime-delegation.js";
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
import { handleExternalOutboundConfirmWithQueryRuntime } from "./query-runtime-external-outbound.js";
import { handleModelCatalogListWithQueryRuntime } from "./query-runtime-model-catalog.js";
import { handleAgentCatalogGetWithQueryRuntime } from "./query-runtime-agent-catalog.js";
import { handleAgentContractsGetWithQueryRuntime } from "./query-runtime-agent-contracts.js";
import { buildAgentRoster } from "./query-runtime-agent-roster.js";
import { ensureResidentAgentSession } from "./query-runtime-agent-sessions.js";
import { buildLearningReviewInput } from "./learning-review-input.js";
import { buildLearningReviewNudgeRuntimeReport } from "./learning-review-nudge-runtime.js";
import { buildDeploymentBackendsDoctorReport, ensureDeploymentBackendsConfig } from "./deployment-backends.js";
import { buildMindProfileSnapshot } from "./mind-profile-snapshot.js";
import { buildResidentAgentObservabilitySnapshot } from "./resident-agent-observability.js";
import {
  buildSkillFreshnessSnapshot,
  findSkillFreshnessForCandidate,
  findSkillFreshnessForUsage,
} from "./skill-freshness.js";
import { updateSkillFreshnessManualMark } from "./skill-freshness-state.js";
import { resolveResidentStateBindingViewForAgent } from "./resident-state-binding.js";
import { buildAgentLaunchExplainability } from "./agent-launch-explainability.js";
import type { RuntimeResilienceDoctorReport } from "./runtime-resilience.js";
import {
  attachResidentExperienceCandidateSourceView,
  attachResidentExperienceUsageSourceView,
  attachResidentMemorySourceView,
  attachResidentMemorySourceViews,
  attachResidentTaskExperienceSourceView,
  buildResidentMemoryQueryView,
} from "./resident-memory-result-view.js";
import {
  claimResidentSharedMemoryPromotion,
  getResidentMemory,
  listResidentSharedReviewQueue,
  listRecentResidentMemory,
  normalizeResidentSharedPromotionStatus,
  mergeResidentMemoryStatus,
  promoteResidentMemoryToShared,
  reviewResidentSharedMemoryPromotion,
  resolveResidentSharedMemoryManager,
  searchResidentMemory,
} from "./resident-shared-memory.js";
import {
  handleCommunityMessageWithQueryRuntime,
  handleWebhookReceiveWithQueryRuntime,
  type QueryRuntimeHttpJsonResponse,
} from "./query-runtime-http.js";
import { QueryRuntimeTraceStore } from "./query-runtime-trace.js";
import { ResidentConversationStore } from "./resident-conversation-store.js";
import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";
import { notifyConversationToolEvent } from "./query-runtime-side-effects.js";
import { buildDelegationObservabilitySnapshot } from "./subtask-result-envelope.js";
import type { ToolExecutor, TranscribeOptions, TranscribeResult, SkillRegistry } from "@belldandy/skills";
import type { ToolExecutionRuntimeContext } from "@belldandy/skills";
import {
  checkAndConsumeRestartCooldown,
  formatRestartCooldownMessage,
  listToolContractsV2,
  publishSkillCandidate,
  TOOL_SETTINGS_CONTROL_NAME,
} from "@belldandy/skills";
import type { PluginRegistry } from "@belldandy/plugins";
import type { WebhookConfig, WebhookRequestParams, IdempotencyManager } from "./webhook/index.js";
import {
  beginWebhookRequestPipelineOrReject,
  createFixedWindowRateLimiter,
  createWebhookInFlightLimiter,
  readJsonWebhookBodyOrReject,
  WEBHOOK_BODY_READ_DEFAULTS,
  WEBHOOK_IN_FLIGHT_DEFAULTS,
  WEBHOOK_RATE_LIMIT_DEFAULTS,
} from "./webhook/index.js";
import { BELLDANDY_VERSION } from "./version.generated.js";
import type { GoalManager } from "./goals/manager.js";
import { ResidentAgentRuntimeRegistry } from "./resident-agent-runtime.js";
import { buildConversationContinuationState } from "./continuation-state.js";
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
import {
  getModelFallbackConfigContent,
  mergeModelFallbackConfigSecrets,
  parseModelFallbackConfigContent,
  REDACTED_MODEL_SECRET_PLACEHOLDER,
  resolveModelFallbackConfigPath,
  writeModelFallbackConfig,
} from "./model-fallback-config.js";
import { createFileExternalOutboundAuditStore, resolveExternalOutboundAuditStorePath } from "./external-outbound-audit-store.js";
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

const DEFAULT_METHODS = [
  "message.send",
  "tool_settings.confirm",
  "external_outbound.confirm",
  "external_outbound.audit.list",
  "models.list",
  "models.config.get",
  "models.config.update",
  "config.read",
  "config.update",
  "channel.reply_chunking.get",
  "channel.reply_chunking.update",
  "channel.security.get",
  "channel.security.update",
  "channel.security.pending.list",
  "channel.security.approve",
  "channel.security.reject",
  "system.doctor",
  "system.restart",
  "workspace.list",
  "workspace.read",
  "workspace.readSource",
  "workspace.write",
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
  "tools.list",
  "tools.update",
  "agent.catalog.get",
  "agent.contracts.get",
  "delegation.inspect.get",
  "agents.prompt.inspect",
  "agents.list",
  "agents.roster.get",
  "agent.session.ensure",
  "memory.search",
  "memory.get",
  "memory.recent",
  "memory.stats",
  "memory.share.queue",
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
  "channel.security.pending",
  "conversation.digest.updated",
  "conversation.memory.extraction.updated",
  "goal.update",
  "subtask.update",
  "pairing.required",
  "tools.config.updated",
  "tool_settings.confirm.required",
  "tool_settings.confirm.resolved",
  "external_outbound.confirm.required",
  "external_outbound.confirm.resolved",
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

function resolveWebhookRequestGuardKey(req: http.IncomingMessage, webhookId: string): string {
  const remoteAddress = req.socket.remoteAddress?.trim() || "unknown";
  return `${webhookId}:${remoteAddress}`;
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

  const workspaceDir = resolveAgentWorkspaceDir(profile);
  return {
    dir: path.join(rootDir, "agents", workspaceDir),
    profileId: profile.id,
  };
}

function extractScopedMemoryAgentId(params: Record<string, unknown>): string | undefined {
  if (typeof params.agentId === "string" && params.agentId.trim()) {
    return params.agentId.trim();
  }
  if (typeof params.conversationId === "string" && params.conversationId.trim()) {
    return undefined;
  }
  const filter = isObjectRecord(params.filter) ? params.filter : undefined;
  if (filter && typeof filter.agentId === "string" && filter.agentId.trim()) {
    return filter.agentId.trim();
  }
  return undefined;
}

function extractTargetMemoryAgentId(params: Record<string, unknown>): string | undefined {
  if (typeof params.targetAgentId === "string" && params.targetAgentId.trim()) {
    return params.targetAgentId.trim();
  }
  return extractScopedMemoryAgentId(params);
}

function extractReviewerMemoryAgentId(params: Record<string, unknown>): string | undefined {
  if (typeof params.reviewerAgentId === "string" && params.reviewerAgentId.trim()) {
    return params.reviewerAgentId.trim();
  }
  return extractScopedMemoryAgentId(params);
}

function resolveScopedMemoryManager(params: Record<string, unknown> = {}) {
  const conversationId = typeof params.conversationId === "string" && params.conversationId.trim()
    ? params.conversationId.trim()
    : undefined;
  const agentId = extractScopedMemoryAgentId(params);
  return getGlobalMemoryManager({
    agentId,
    conversationId,
  });
}

function resolveScopedResidentMemoryPolicy(
  params: Record<string, unknown> = {},
  records: ScopedMemoryManagerRecord[] = [],
) {
  const agentId = extractScopedMemoryAgentId(params) ?? "default";
  return records.find((item) => item.agentId === agentId)?.policy
    ?? records.find((item) => item.agentId === "default")?.policy;
}

async function buildScopedSkillFreshnessSnapshot(
  stateDir: string,
  manager: ReturnType<typeof resolveScopedMemoryManager>,
) {
  return buildSkillFreshnessSnapshot({
    manager,
    stateDir,
  });
}

function attachSkillFreshnessToCandidatePayload(
  payload: Record<string, unknown>,
  candidate: any,
  snapshot?: Awaited<ReturnType<typeof buildSkillFreshnessSnapshot>>,
): Record<string, unknown> {
  const skillFreshness = candidate?.type === "skill" ? findSkillFreshnessForCandidate(snapshot, candidate) : undefined;
  return skillFreshness ? { ...payload, skillFreshness } : payload;
}

function attachSkillFreshnessToUsagePayload(
  payload: Record<string, unknown>,
  item: any,
  snapshot?: Awaited<ReturnType<typeof buildSkillFreshnessSnapshot>>,
): Record<string, unknown> {
  const skillFreshness = item?.assetType === "skill" ? findSkillFreshnessForUsage(snapshot, item) : undefined;
  return skillFreshness ? { ...payload, skillFreshness } : payload;
}

function resolveResidentMemoryManagerRecord(
  agentId: string | undefined,
  records: ScopedMemoryManagerRecord[] = [],
): ScopedMemoryManagerRecord | undefined {
  const normalizedAgentId = typeof agentId === "string" && agentId.trim()
    ? agentId.trim()
    : "default";
  return records.find((item) => item.agentId === normalizedAgentId)
    ?? records.find((item) => item.agentId === "default");
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
    id: message.id,
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

  const communityJsonParser = express.json();
  const webhookPreAuthMaxBytes = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_PREAUTH_MAX_BYTES",
    WEBHOOK_BODY_READ_DEFAULTS.preAuth.maxBytes,
  );
  const webhookPreAuthTimeoutMs = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_PREAUTH_TIMEOUT_MS",
    WEBHOOK_BODY_READ_DEFAULTS.preAuth.timeoutMs,
  );
  const webhookRateLimitWindowMs = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_RATE_LIMIT_WINDOW_MS",
    WEBHOOK_RATE_LIMIT_DEFAULTS.windowMs,
  );
  const webhookRateLimitMaxRequests = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_RATE_LIMIT_MAX_REQUESTS",
    WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests,
  );
  const webhookRateLimitMaxTrackedKeys = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_RATE_LIMIT_MAX_TRACKED_KEYS",
    WEBHOOK_RATE_LIMIT_DEFAULTS.maxTrackedKeys,
  );
  const webhookMaxInFlightPerKey = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_MAX_IN_FLIGHT_PER_KEY",
    WEBHOOK_IN_FLIGHT_DEFAULTS.maxInFlightPerKey,
  );
  const webhookMaxInFlightTrackedKeys = parsePositiveIntEnv(
    "BELLDANDY_WEBHOOK_MAX_IN_FLIGHT_TRACKED_KEYS",
    WEBHOOK_IN_FLIGHT_DEFAULTS.maxTrackedKeys,
  );
  const webhookRateLimiter = createFixedWindowRateLimiter({
    windowMs: webhookRateLimitWindowMs,
    maxRequests: webhookRateLimitMaxRequests,
    maxTrackedKeys: webhookRateLimitMaxTrackedKeys,
  });
  const webhookInFlightLimiter = createWebhookInFlightLimiter({
    maxInFlightPerKey: webhookMaxInFlightPerKey,
    maxTrackedKeys: webhookMaxInFlightTrackedKeys,
  });
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
    app.post("/api/message", communityJsonParser, async (req, res) => {
      const response = await handleCommunityMessageWithQueryRuntime({
        requestId: `api.message:${crypto.randomUUID()}`,
        authorization: req.headers.authorization,
        communityApiToken,
        body: req.body,
        stateDir,
        agentFactory: opts.agentFactory,
        agentRegistry: opts.agentRegistry,
        conversationStore,
        log,
        runtimeObserver: queryRuntimeTraceStore.createObserver<"api.message">(),
        onChannelSecurityApprovalRequired: opts.onChannelSecurityApprovalRequired,
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
      const webhookGuardKey = resolveWebhookRequestGuardKey(req, req.params.id);
      const pipeline = beginWebhookRequestPipelineOrReject({
        req,
        res,
        rateLimiter: webhookRateLimiter,
        rateLimitKey: webhookGuardKey,
        requireJsonContentType: true,
        inFlightLimiter: webhookInFlightLimiter,
        inFlightKey: webhookGuardKey,
      });
      if (!pipeline.ok) {
        return;
      }

      try {
        const bodyResult = await readJsonWebhookBodyOrReject({
          req,
          res,
          profile: "pre-auth",
          maxBytes: webhookPreAuthMaxBytes,
          timeoutMs: webhookPreAuthTimeoutMs,
          emptyObjectOnEmpty: true,
          invalidJsonMessage: "Invalid JSON",
        });
        if (!bodyResult.ok) {
          return;
        }

        const response = await handleWebhookReceiveWithQueryRuntime({
          requestId: `webhook.receive:${crypto.randomUUID()}`,
          webhookId: req.params.id,
          authorization: req.headers.authorization,
          idempotencyKey: typeof req.headers["x-idempotency-key"] === "string" ? req.headers["x-idempotency-key"] : undefined,
          body: bodyResult.value as WebhookRequestParams,
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
      } finally {
        pipeline.release();
      }
    });
  }

  if (webhookEnabled) {
    log.info(
      "webhook",
      `Ingress guard enabled (preAuthMaxBytes=${webhookPreAuthMaxBytes}, preAuthTimeoutMs=${webhookPreAuthTimeoutMs}, rateLimit=${webhookRateLimitMaxRequests}/${webhookRateLimitWindowMs}ms, maxInFlightPerKey=${webhookMaxInFlightPerKey})`,
    );
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
        broadcastEvent,
        getCompactionRuntimeReport: opts.getCompactionRuntimeReport,
        getRuntimeResilienceReport: opts.getRuntimeResilienceReport,
        queryRuntimeTraceStore,
        residentAgentRuntime,
        residentMemoryManagers: opts.residentMemoryManagers,
        getCronRuntimeDoctorReport: opts.getCronRuntimeDoctorReport,
        getBackgroundContinuationRuntimeDoctorReport: opts.getBackgroundContinuationRuntimeDoctorReport,
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
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
    broadcast: broadcastEvent,
    requestDurableExtractionFromDigest,
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
    inspectAgentPrompt?: GatewayServerOptions["inspectAgentPrompt"];
    getConversationPromptSnapshot?: GatewayServerOptions["getConversationPromptSnapshot"];
    primaryModelConfig?: { baseUrl: string; apiKey: string; model: string; protocol?: string; wireApi?: string };
    modelFallbacks?: ModelProfile[];
    preferredProviderIds: string[];
    modelConfigPath?: string;
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
    externalOutboundConfirmationStore?: ExternalOutboundConfirmationStore;
    externalOutboundSenderRegistry?: ExternalOutboundSenderRegistry;
    externalOutboundAuditStore?: ExternalOutboundAuditStore;
    getAgentToolControlMode?: () => "disabled" | "confirm" | "auto";
    getAgentToolControlConfirmPassword?: () => string | undefined;
    sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
    pluginRegistry?: PluginRegistry;
    extensionHost?: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle">;
    skillRegistry?: SkillRegistry;
    goalManager?: GoalManager;
    subTaskRuntimeStore?: SubTaskRuntimeStore;
    resumeSubTask?: (taskId: string, message?: string) => Promise<SubTaskRecord | undefined>;
    takeoverSubTask?: (taskId: string, agentId: string, message?: string) => Promise<SubTaskRecord | undefined>;
    updateSubTask?: (taskId: string, message: string) => Promise<SubTaskRecord | undefined>;
    stopSubTask?: (taskId: string, reason?: string) => Promise<SubTaskRecord | undefined>;
    tokenUsageUploadConfig: TokenUsageUploadConfig;
    broadcastEvent?: (frame: GatewayEventFrame) => void;
    getCompactionRuntimeReport?: () => CompactionRuntimeReport | undefined;
    getRuntimeResilienceReport?: () => RuntimeResilienceDoctorReport | undefined;
    queryRuntimeTraceStore: QueryRuntimeTraceStore;
    residentAgentRuntime: ResidentAgentRuntimeRegistry;
    residentMemoryManagers?: ScopedMemoryManagerRecord[];
    getCronRuntimeDoctorReport?: () => Promise<CronRuntimeDoctorReport | undefined>;
    getBackgroundContinuationRuntimeDoctorReport?: () => Promise<BackgroundContinuationRuntimeDoctorReport | undefined>;
  },
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
      return handleModelCatalogListWithQueryRuntime({
        requestId: req.id,
        primaryModelConfig: ctx.primaryModelConfig,
        modelFallbacks: ctx.modelFallbacks,
        currentDefault: ctx.agentRegistry?.getProfile("default")?.model ?? "primary",
        preferredProviderIds: ctx.preferredProviderIds,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<"models.list">(),
      });
    }

    case "models.config.get": {
      try {
        const payload = await getModelFallbackConfigContent(
          resolveModelFallbackConfigPath(ctx.stateDir, ctx.modelConfigPath),
          { redactApiKeys: true },
        );
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload,
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "model_config_read_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "models.config.update": {
      const params = req.params as unknown as { content?: string } | undefined;
      const content = typeof params?.content === "string" ? params.content : "";
      const modelConfigPath = resolveModelFallbackConfigPath(ctx.stateDir, ctx.modelConfigPath);
      try {
        const existingConfig = await getModelFallbackConfigContent(modelConfigPath);
        const editedConfig = parseModelFallbackConfigContent(content);
        const mergedConfig = mergeModelFallbackConfigSecrets(existingConfig.config, editedConfig, {
          redactedPlaceholder: REDACTED_MODEL_SECRET_PLACEHOLDER,
        });
        await writeModelFallbackConfig(modelConfigPath, mergedConfig);
        if (ctx.modelFallbacks) {
          ctx.modelFallbacks.splice(0, ctx.modelFallbacks.length, ...mergedConfig.fallbacks.map((item) => ({ ...item })));
        }
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: await getModelFallbackConfigContent(modelConfigPath, { redactApiKeys: true }),
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_model_config",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "message.send": {
      const parsed = parseMessageSendParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }
      const resolvedAgentId = typeof parsed.value.agentId === "string" && parsed.value.agentId.trim()
        ? parsed.value.agentId.trim()
        : "default";
      const resolvedConversationId = parsed.value.conversationId?.trim()
        ? parsed.value.conversationId.trim()
        : ensureResidentAgentSession({
          agentId: resolvedAgentId,
          agentRegistry: ctx.agentRegistry,
          residentAgentRuntime: ctx.residentAgentRuntime,
          conversationStore: ctx.conversationStore,
        }).conversationId;
      ctx.residentAgentRuntime.touchConversation(resolvedAgentId, resolvedConversationId, {
        main: resolvedConversationId === ctx.residentAgentRuntime.get(resolvedAgentId).mainConversationId,
      });

      try {
        return await handleMessageSendWithQueryRuntime({
          request: {
            ws,
            requestId: req.id,
            params: {
              ...parsed.value,
              agentId: resolvedAgentId,
              conversationId: resolvedConversationId,
            },
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
            residentAgentRuntime: ctx.residentAgentRuntime,
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
            resolveCurrentModelMediaCapabilities: ({ requestedAgentId, requestedModelId }) => {
              const resolvedAgentId = requestedAgentId ?? "default";
              const modelRef = typeof requestedModelId === "string" && requestedModelId.trim()
                ? requestedModelId.trim()
                : ctx.agentRegistry?.getProfile(resolvedAgentId)?.model;
              return resolveModelMediaCapabilities({
                modelRef,
                primaryModelConfig: ctx.primaryModelConfig,
                modelFallbacks: ctx.modelFallbacks,
              });
            },
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

    case "external_outbound.confirm": {
      const parsed = parseExternalOutboundConfirmParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }
      return handleExternalOutboundConfirmWithQueryRuntime({
        requestId: req.id,
        clientId: ctx.clientId,
        confirmationStore: ctx.externalOutboundConfirmationStore,
        senderRegistry: ctx.externalOutboundSenderRegistry,
        auditStore: ctx.externalOutboundAuditStore,
        emitEvent: (frame) => {
          if (ctx.broadcastEvent) {
            ctx.broadcastEvent(frame);
          } else {
            sendEvent(ws, frame);
          }
        },
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<"external_outbound.confirm">(),
      }, parsed.value);
    }

    case "external_outbound.audit.list": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(100, Math.floor(params.limit)))
        : 20;
      const auditStore = ctx.externalOutboundAuditStore
        ?? createFileExternalOutboundAuditStore(resolveExternalOutboundAuditStorePath(ctx.stateDir));
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: await auditStore.listRecent(limit),
          limit,
        },
      };
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
        "BELLDANDY_MODEL_PREFERRED_PROVIDERS",
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
        "BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION",
        "BELLDANDY_EMBEDDING_ENABLED",
        "BELLDANDY_EMBEDDING_OPENAI_API_KEY", "BELLDANDY_EMBEDDING_OPENAI_BASE_URL",
        "BELLDANDY_EMBEDDING_MODEL",
        // TTS & DashScope
        "BELLDANDY_TTS_ENABLED", "BELLDANDY_TTS_PROVIDER", "BELLDANDY_TTS_VOICE", "DASHSCOPE_API_KEY",
        "BELLDANDY_FACET_ANCHOR",
        "BELLDANDY_INJECT_AGENTS", "BELLDANDY_INJECT_SOUL", "BELLDANDY_INJECT_MEMORY",
        "BELLDANDY_MAX_SYSTEM_PROMPT_CHARS", "BELLDANDY_MAX_HISTORY", "BELLDANDY_CONVERSATION_ALLOWED_KINDS",
        "BELLDANDY_TASK_DEDUP_GUARD_ENABLED", "BELLDANDY_TASK_DEDUP_WINDOW_MINUTES",
        "BELLDANDY_TASK_DEDUP_MODE", "BELLDANDY_TASK_DEDUP_POLICY",
        // Channels
        "BELLDANDY_COMMUNITY_API_ENABLED", "BELLDANDY_COMMUNITY_API_TOKEN",
        "BELLDANDY_FEISHU_APP_ID", "BELLDANDY_FEISHU_APP_SECRET", "BELLDANDY_FEISHU_AGENT_ID",
        "BELLDANDY_QQ_APP_ID", "BELLDANDY_QQ_APP_SECRET", "BELLDANDY_QQ_AGENT_ID", "BELLDANDY_QQ_SANDBOX",
        "BELLDANDY_DISCORD_ENABLED", "BELLDANDY_DISCORD_BOT_TOKEN",
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

      if (Object.prototype.hasOwnProperty.call(updates, "BELLDANDY_MODEL_PREFERRED_PROVIDERS")) {
        const preferredProviderIds = normalizePreferredProviderIds(updates.BELLDANDY_MODEL_PREFERRED_PROVIDERS);
        ctx.preferredProviderIds.splice(0, ctx.preferredProviderIds.length, ...preferredProviderIds);
      }

      return { type: "res", id: req.id, ok: true };
    }

    case "channel.reply_chunking.get": {
      const payload = getChannelReplyChunkingConfigContent(ctx.stateDir);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload,
      };
    }

    case "channel.reply_chunking.update": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const content = typeof params.content === "string" ? params.content : "";
      try {
        const config = parseChannelReplyChunkingConfigContent(content);
        await writeChannelReplyChunkingConfig(ctx.stateDir, config);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: getChannelReplyChunkingConfigContent(ctx.stateDir),
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_channel_reply_chunking_config",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "channel.security.get": {
      const payload = getChannelSecurityConfigContent(ctx.stateDir);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload,
      };
    }

    case "channel.security.update": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const content = typeof params.content === "string" ? params.content : "";
      try {
        const config = parseChannelSecurityConfigContent(content);
        await writeChannelSecurityConfig(ctx.stateDir, config);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: getChannelSecurityConfigContent(ctx.stateDir),
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_channel_security_config",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "channel.security.pending.list": {
      const store = await readChannelSecurityApprovalStore(ctx.stateDir);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          pending: store.pending,
        },
      };
    }

    case "channel.security.approve": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
      if (!requestId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "requestId is required" } };
      }
      try {
        const approved = await approveChannelSecurityApprovalRequest(ctx.stateDir, requestId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            request: approved.request,
            config: approved.config,
            content: getChannelSecurityConfigContent(ctx.stateDir).content,
          },
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "channel_security_approve_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "channel.security.reject": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
      if (!requestId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "requestId is required" } };
      }
      try {
        const rejected = await rejectChannelSecurityApprovalRequest(ctx.stateDir, requestId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            request: rejected,
          },
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "channel_security_reject_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
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
        agentRegistry: ctx.agentRegistry,
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

    case "agent.catalog.get": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const agentId = typeof params.agentId === "string" && params.agentId.trim()
        ? params.agentId.trim()
        : undefined;
      return handleAgentCatalogGetWithQueryRuntime({
        requestId: req.id,
        stateDir: ctx.stateDir,
        agentRegistry: ctx.agentRegistry,
        residentAgentRuntime: ctx.residentAgentRuntime,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<"agent.catalog.get">(),
      }, {
        agentId,
      });
    }

    case "agent.contracts.get": {
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
      return handleAgentContractsGetWithQueryRuntime({
        requestId: req.id,
        toolExecutor: ctx.toolExecutor,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "agent.contracts.get"
        >(),
      }, {
        taskId: requestedTaskId,
        agentId: visibilityAgentId,
        conversationId: visibilityConversationId,
      });
    }

    case "delegation.inspect.get": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" && params.taskId.trim()
        ? params.taskId.trim()
        : "";
      if (!taskId) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_params", message: "taskId is required" },
        };
      }
      return handleDelegationInspectGetWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        agentRegistry: ctx.agentRegistry,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<"delegation.inspect.get">(),
      }, {
        taskId,
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
      const params = isObjectRecord(req.params) ? req.params : {};
      const conversationId = typeof params.conversationId === "string" ? params.conversationId.trim() : "";
      const includeTranscript = params.includeTranscript === true;
      const includeTimeline = params.includeTimeline === true;
      const timelinePreviewChars = typeof params.timelinePreviewChars === "number" && Number.isFinite(params.timelinePreviewChars)
        ? Math.max(24, Math.floor(params.timelinePreviewChars))
        : undefined;
      const transcriptEventTypes = normalizeTranscriptEventTypes(Array.isArray(params.transcriptEventTypes)
        ? params.transcriptEventTypes.filter((value): value is string => typeof value === "string")
        : undefined);
      const transcriptEventLimit = parsePositiveInteger(typeof params.transcriptEventLimit === "number" ? params.transcriptEventLimit : undefined);
      const transcriptRestoreView = normalizeTranscriptRestoreView(typeof params.transcriptRestoreView === "string"
        ? params.transcriptRestoreView.trim()
        : undefined);
      const timelineKinds = normalizeTimelineKinds(Array.isArray(params.timelineKinds)
        ? params.timelineKinds.filter((value): value is string => typeof value === "string")
        : undefined);
      const timelineLimit = parsePositiveInteger(typeof params.timelineLimit === "number" ? params.timelineLimit : undefined);
      const includeConversationCatalog = params.includeConversationCatalog === true;
      const includeRecentExports = params.includeRecentExports === true;
      const conversationIdPrefix = normalizeConversationIdPrefix(typeof params.conversationIdPrefix === "string"
        ? params.conversationIdPrefix
        : undefined);
      const conversationListLimit = parsePositiveInteger(typeof params.conversationListLimit === "number" ? params.conversationListLimit : undefined);
      const recentExportLimit = parsePositiveInteger(typeof params.recentExportLimit === "number" ? params.recentExportLimit : undefined);
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

      const channelSecurity = buildChannelSecurityDoctorReport({
        stateDir: ctx.stateDir,
        channels: {
          discord: {
            enabled:
              String(process.env.BELLDANDY_DISCORD_ENABLED ?? "false").trim().toLowerCase() === "true"
              && Boolean(String(process.env.BELLDANDY_DISCORD_BOT_TOKEN ?? "").trim()),
          },
          feishu: {
            enabled:
              Boolean(String(process.env.BELLDANDY_FEISHU_APP_ID ?? "").trim())
              && Boolean(String(process.env.BELLDANDY_FEISHU_APP_SECRET ?? "").trim()),
          },
          qq: {
            enabled:
              Boolean(String(process.env.BELLDANDY_QQ_APP_ID ?? "").trim())
              && Boolean(String(process.env.BELLDANDY_QQ_APP_SECRET ?? "").trim()),
          },
          community: (() => {
            const communityConfigPath = path.join(ctx.stateDir, "community.json");
            try {
              if (!fs.existsSync(communityConfigPath)) {
                return { enabled: false };
              }
              const parsed = JSON.parse(fs.readFileSync(communityConfigPath, "utf-8")) as {
                endpoint?: unknown;
                agents?: Array<{ name?: unknown }>;
              };
              const accountIds = Array.isArray(parsed.agents)
                ? parsed.agents
                  .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
                  .filter(Boolean)
                : [];
              return {
                enabled: Boolean(accountIds.length) && typeof parsed.endpoint === "string" && Boolean(parsed.endpoint.trim()),
                ...(accountIds.length ? { accountIds } : {}),
              };
            } catch {
              return { enabled: false };
            }
          })(),
        },
      });
      for (const item of channelSecurity.items) {
        checks.push({
          id: `channel_security_${item.channel}`,
          name: `Channel Security (${item.channel})`,
          status: item.status,
          message: item.message,
        });
      }

      const memoryRuntime = await buildMemoryRuntimeDoctorReport({
        conversationStore: ctx.conversationStore,
        compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
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
      const deploymentBackends = buildDeploymentBackendsDoctorReport({
        stateDir: ctx.stateDir,
      });
      const runtimeResilience = ctx.getRuntimeResilienceReport?.();
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
      let cronRuntime: CronRuntimeDoctorReport | undefined;
      let backgroundContinuationRuntime: BackgroundContinuationRuntimeDoctorReport | undefined;
      let externalOutboundRuntime: ExternalOutboundDoctorReport | undefined;
      try {
        cronRuntime = await ctx.getCronRuntimeDoctorReport?.();
      } catch (error) {
        checks.push({
          id: "cron_runtime",
          name: "Cron Runtime",
          status: "warn",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        backgroundContinuationRuntime = await ctx.getBackgroundContinuationRuntimeDoctorReport?.();
      } catch (error) {
        checks.push({
          id: "background_continuation_runtime",
          name: "Background Continuation Runtime",
          status: "warn",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      try {
        if (ctx.externalOutboundAuditStore) {
          externalOutboundRuntime = await buildExternalOutboundDoctorReport({
            auditStore: ctx.externalOutboundAuditStore,
            requireConfirmation: String(process.env.BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION ?? "true").trim().toLowerCase() !== "false",
          });
        }
      } catch (error) {
        checks.push({
          id: "external_outbound_runtime",
          name: "External Outbound Runtime",
          status: "warn",
          message: error instanceof Error ? error.message : String(error),
        });
      }
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
      const compactionRuntime = memoryRuntime.compactionRuntime;
      if (compactionRuntime) {
        checks.push({
          id: "compaction_runtime",
          name: "Compaction Runtime",
          status: compactionRuntime.circuitBreaker.open || compactionRuntime.totals.failures > 0
            ? "warn"
            : "pass",
          message: compactionRuntime.circuitBreaker.open
            ? `Circuit open (${compactionRuntime.circuitBreaker.remainingSkips} skips remaining), failures=${compactionRuntime.totals.failures}, PTL retries=${compactionRuntime.totals.promptTooLongRetries}`
            : `attempts=${compactionRuntime.totals.attempts}, warnings=${compactionRuntime.totals.warningHits}, blocking=${compactionRuntime.totals.blockingHits}, PTL retries=${compactionRuntime.totals.promptTooLongRetries}`,
        });
      }

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
        id: "deployment_backends",
        name: "Deployment Backends",
        status: deploymentBackends.summary.warningCount > 0
          || deploymentBackends.summary.selectedResolved === false
          ? "warn"
          : "pass",
        message: deploymentBackends.headline,
      });
      if (runtimeResilience) {
        checks.push({
          id: "runtime_resilience",
          name: "Runtime Resilience",
          status: runtimeResilience.latest && runtimeResilience.latest.finalStatus !== "success"
            ? "warn"
            : runtimeResilience.latest?.degraded
              ? "warn"
              : "pass",
          message: runtimeResilience.summary.headline,
        });
      }
      checks.push({
        id: "query_runtime_trace",
        name: "Query Runtime Trace",
        status: "pass",
        message: `Enabled (${queryRuntime.activeTraceCount} active traces, ${queryRuntime.traces.length} retained, ${queryRuntime.totalObservedEvents} observed events)`,
      });
      if (cronRuntime) {
        checks.push({
          id: "cron_runtime",
          name: "Cron Runtime",
          status: !cronRuntime.scheduler.enabled
            ? cronRuntime.totals.totalJobs > 0 ? "warn" : "pass"
            : cronRuntime.scheduler.running && cronRuntime.totals.invalidNextRunJobs === 0
              ? "pass"
              : "warn",
          message: cronRuntime.headline,
        });
      }
      if (backgroundContinuationRuntime) {
        checks.push({
          id: "background_continuation_runtime",
          name: "Background Continuation Runtime",
          status: backgroundContinuationRuntime.totals.failedRuns > 0
            ? "warn"
            : "pass",
          message: backgroundContinuationRuntime.headline,
        });
      }
      if (externalOutboundRuntime) {
        checks.push({
          id: "external_outbound_runtime",
          name: "External Outbound Runtime",
          status: externalOutboundRuntime.totals.failedCount > 0 || !externalOutboundRuntime.requireConfirmation
            ? "warn"
            : "pass",
          message: externalOutboundRuntime.headline,
        });
      }
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

      let conversationDebug: {
        conversationId: string;
        available: boolean;
        messageCount: number;
        updatedAt?: number;
        requested: {
          includeTranscript: boolean;
          includeTimeline: boolean;
          timelinePreviewChars?: number;
        };
        transcriptExport?: SessionTranscriptExportBundle;
        timeline?: SessionTimelineProjection;
      } | undefined;
      let conversationCatalog:
        | {
          items: Awaited<ReturnType<ConversationStore["listPersistedConversations"]>>;
          filter: {
            conversationIdPrefix?: string;
            limit?: number;
          };
        }
        | undefined;
      let recentConversationExports:
        | {
          items: Awaited<ReturnType<typeof listRecentConversationExports>>;
          filter: {
            conversationIdPrefix?: string;
            limit?: number;
          };
        }
        | undefined;
      let promptObservability:
        | {
          requested: {
            agentId?: string;
            conversationId?: string;
            runId?: string;
          };
          summary: ReturnType<typeof buildPromptObservabilitySummary>;
          launchExplainability?: ReturnType<typeof buildAgentLaunchExplainability>;
        }
        | undefined;
      let toolBehaviorObservability:
        | {
          requested: {
            agentId?: string;
            conversationId?: string;
            taskId?: string;
          };
          visibilityContext: {
            agentId: string;
            conversationId: string | null;
            launchExplainability?: ReturnType<typeof buildAgentLaunchExplainability>;
            residentStateBinding?: ReturnType<typeof resolveResidentStateBindingViewForAgent>;
            taskId?: string;
            launchSpec?: ToolExecutionRuntimeContext["launchSpec"];
          };
          counts: {
            visibleToolContractCount: number;
            includedContractCount: number;
            behaviorContractCount: number;
          };
          included: string[];
          contracts: ReturnType<typeof buildToolBehaviorObservability>["contracts"];
          summary?: string;
          experiment?: ReturnType<typeof buildToolBehaviorObservability>["experiment"];
        }
        | undefined;
      let toolContractV2Observability:
        | {
          requested: {
            agentId?: string;
            conversationId?: string;
            taskId?: string;
          };
          visibilityContext: {
            agentId: string;
            conversationId: string | null;
            launchExplainability?: ReturnType<typeof buildAgentLaunchExplainability>;
            residentStateBinding?: ReturnType<typeof resolveResidentStateBindingViewForAgent>;
            taskId?: string;
            launchSpec?: ToolExecutionRuntimeContext["launchSpec"];
          };
          summary: ReturnType<typeof buildToolContractV2Observability>["summary"];
          contracts: ReturnType<typeof buildToolContractV2Observability>["contracts"];
        }
        | undefined;
      let residentAgents: Awaited<ReturnType<typeof buildResidentAgentObservabilitySnapshot>> | undefined;
      let mindProfileSnapshot: Awaited<ReturnType<typeof buildMindProfileSnapshot>> | undefined;
      let learningReviewInput: ReturnType<typeof buildLearningReviewInput> | undefined;
      let learningReviewNudgeRuntime: Awaited<ReturnType<typeof buildLearningReviewNudgeRuntimeReport>> | undefined;
      let skillFreshness: Awaited<ReturnType<typeof buildSkillFreshnessSnapshot>> | undefined;
      let delegationObservability: ReturnType<typeof buildDelegationObservabilitySnapshot> | undefined;

      if (conversationId) {
        const conversationSnapshot = ctx.conversationStore.get(conversationId);
        const transcriptExportRaw = includeTranscript
          ? await ctx.conversationStore.buildConversationTranscriptExport(conversationId, { mode: "internal" })
          : undefined;
        const timelineRaw = includeTimeline
          ? await ctx.conversationStore.buildConversationTimeline(conversationId, { previewChars: timelinePreviewChars })
          : undefined;
        const transcriptExport = transcriptExportRaw
          ? applyTranscriptExportProjection(transcriptExportRaw, {
            eventTypes: transcriptEventTypes,
            eventLimit: transcriptEventLimit,
            restoreView: transcriptRestoreView,
          })
          : undefined;
        const timeline = timelineRaw
          ? applyTimelineProjectionFilter(timelineRaw, {
            kinds: timelineKinds,
            limit: timelineLimit,
          })
          : undefined;
        const available = Boolean(conversationSnapshot)
          || hasTranscriptExportArtifacts(transcriptExport)
          || hasTimelineArtifacts(timeline);
        const messageCount = conversationSnapshot?.messages.length ?? transcriptExport?.restore.rawMessages.length ?? 0;
        const details: string[] = [];
        if (messageCount > 0) {
          details.push(`${messageCount} messages`);
        }
        if (includeTranscript && transcriptExport) {
          details.push(`transcript ${transcriptExport.summary.eventCount} events`);
        }
        if (includeTimeline && timeline) {
          details.push(`timeline ${timeline.summary.itemCount} items`);
        }
        if (details.length === 0) {
          details.push("metadata only");
        }

        checks.push({
          id: "conversation_debug",
          name: "Conversation Debug",
          status: available ? "pass" : "warn",
          message: available
            ? `${conversationId} available (${details.join(", ")})`
            : `${conversationId} not found or transcript data is empty`,
        });

        conversationDebug = {
          conversationId,
          available,
          messageCount,
          updatedAt: conversationSnapshot?.updatedAt,
          requested: {
            includeTranscript,
            includeTimeline,
            ...(transcriptEventTypes ? { transcriptEventTypes } : {}),
            ...(typeof transcriptEventLimit === "number" ? { transcriptEventLimit } : {}),
            ...(transcriptRestoreView ? { transcriptRestoreView } : {}),
            ...(timelineKinds ? { timelineKinds } : {}),
            ...(typeof timelineLimit === "number" ? { timelineLimit } : {}),
            ...(includeTimeline ? { timelinePreviewChars: timelinePreviewChars ?? 120 } : {}),
          },
          ...(includeTranscript ? { transcriptExport } : {}),
          ...(includeTimeline ? { timeline } : {}),
        };
      }
      if (includeConversationCatalog) {
        const items = await ctx.conversationStore.listPersistedConversations({
          conversationIdPrefix,
          limit: conversationListLimit,
        });
        checks.push({
          id: "conversation_catalog",
          name: "Conversation Catalog",
          status: "pass",
          message: `${items.length} exportable conversations${conversationIdPrefix ? ` for prefix ${conversationIdPrefix}` : ""}`,
        });
        conversationCatalog = {
          items,
          filter: {
            ...(conversationIdPrefix ? { conversationIdPrefix } : {}),
            ...(typeof conversationListLimit === "number" ? { limit: conversationListLimit } : {}),
          },
        };
      }
      if (includeRecentExports) {
        const items = await listRecentConversationExports({
          stateDir: ctx.stateDir,
          conversationIdPrefix,
          limit: recentExportLimit,
        });
        checks.push({
          id: "conversation_export_index",
          name: "Conversation Export Index",
          status: "pass",
          message: `${items.length} recent export records${conversationIdPrefix ? ` for prefix ${conversationIdPrefix}` : ""}`,
        });
        recentConversationExports = {
          items,
          filter: {
            ...(conversationIdPrefix ? { conversationIdPrefix } : {}),
            ...(typeof recentExportLimit === "number" ? { limit: recentExportLimit } : {}),
          },
        };
      }

      if (ctx.inspectAgentPrompt) {
        const promptAgentId = typeof params.promptAgentId === "string" && params.promptAgentId.trim()
          ? params.promptAgentId.trim()
          : undefined;
        const promptConversationId = typeof params.promptConversationId === "string" && params.promptConversationId.trim()
          ? params.promptConversationId.trim()
          : undefined;
        const promptRunId = typeof params.promptRunId === "string" && params.promptRunId.trim()
          ? params.promptRunId.trim()
          : undefined;
        try {
          const inspection = await ctx.inspectAgentPrompt({
            agentId: promptAgentId,
            conversationId: promptConversationId,
            runId: promptRunId,
          });
          const residentStateBinding = resolveResidentStateBindingViewForAgent(
            ctx.stateDir,
            ctx.agentRegistry,
            promptAgentId ?? inspection.agentId,
          );
          const launchExplainability = buildAgentLaunchExplainability({
            agentRegistry: ctx.agentRegistry,
            agentId: promptAgentId ?? inspection.agentId,
            runtimeResilience,
          });
          const summary = buildPromptObservabilitySummary(inspection);
          const summaryView = toPromptObservabilityView(summary, {
            truncated: inspection.truncated,
            includesHookSystemPrompt: inspection.metadata?.includesHookSystemPrompt === true,
            hasPrependContext: inspection.metadata?.hasPrependContext === true,
          });
          checks.push({
            id: "prompt_observability",
            name: "Prompt Observability",
            status: "pass",
            message: formatPromptObservabilityHeadline(summaryView),
          });
          promptObservability = {
            requested: {
              ...(promptAgentId ? { agentId: promptAgentId } : {}),
              ...(promptConversationId ? { conversationId: promptConversationId } : {}),
              ...(promptRunId ? { runId: promptRunId } : {}),
            },
            summary,
            ...(residentStateBinding ? { residentStateBinding } : {}),
            ...(launchExplainability ? { launchExplainability } : {}),
          };
        } catch (error) {
          checks.push({
            id: "prompt_observability",
            name: "Prompt Observability",
            status: "warn",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (ctx.agentRegistry && (ctx.residentMemoryManagers?.length ?? 0) > 0) {
        const roster = await buildAgentRoster({
          stateDir: ctx.stateDir,
          agentRegistry: ctx.agentRegistry,
          residentAgentRuntime: ctx.residentAgentRuntime,
        });
        residentAgents = await buildResidentAgentObservabilitySnapshot({
          agents: roster,
          residentMemoryManagers: ctx.residentMemoryManagers,
          conversationStore: ctx.conversationStore,
          subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        });
        checks.push({
          id: "resident_agents",
          name: "Resident Agents",
          status: residentAgents.summary.totalCount > 0 ? "pass" : "warn",
          message: residentAgents.summary.headline,
        });
        mindProfileSnapshot = await buildMindProfileSnapshot({
          stateDir: ctx.stateDir,
          residentAgents,
          residentMemoryManagers: ctx.residentMemoryManagers,
          agentId: typeof params.mindAgentId === "string" && params.mindAgentId.trim()
            ? params.mindAgentId.trim()
            : undefined,
        });
        checks.push({
          id: "mind_profile_snapshot",
          name: "Mind / Profile Snapshot",
          status: mindProfileSnapshot.summary.available ? "pass" : "warn",
          message: mindProfileSnapshot.summary.headline,
        });
        learningReviewInput = buildLearningReviewInput({
          mindProfileSnapshot,
        });
        learningReviewNudgeRuntime = await buildLearningReviewNudgeRuntimeReport({
          stateDir: ctx.stateDir,
        });
        checks.push({
          id: "learning_review_input",
          name: "Learning / Review Input",
          status: learningReviewInput.summary.available || learningReviewNudgeRuntime.summary.available ? "pass" : "warn",
          message: learningReviewNudgeRuntime.summary.available
            ? learningReviewNudgeRuntime.summary.headline
            : learningReviewInput.summary.headline,
        });
      }

      skillFreshness = await buildScopedSkillFreshnessSnapshot(
        ctx.stateDir,
        resolveScopedMemoryManager(params),
      );
      checks.push({
        id: "skill_freshness",
        name: "Skill Freshness",
        status: (skillFreshness.summary.warnCount + skillFreshness.summary.needsPatchCount + skillFreshness.summary.needsNewSkillCount) > 0
          ? "warn"
          : skillFreshness.summary.available
            ? "pass"
            : "warn",
        message: skillFreshness.summary.headline,
      });

      if (ctx.subTaskRuntimeStore) {
        const subtaskItems = await ctx.subTaskRuntimeStore.listTasks(undefined, { includeArchived: true });
        delegationObservability = buildDelegationObservabilitySnapshot(subtaskItems);
        const delegationHasProtocolGap = delegationObservability.summary.activeCount > delegationObservability.summary.protocolBackedCount;
        checks.push({
          id: "delegation_protocol",
          name: "Delegation Protocol",
          status: delegationHasProtocolGap ? "warn" : "pass",
          message: delegationObservability.summary.headline,
        });
      }

      if (ctx.toolExecutor) {
        const toolAgentId = typeof params.toolAgentId === "string" && params.toolAgentId.trim()
          ? params.toolAgentId.trim()
          : undefined;
        const toolConversationId = typeof params.toolConversationId === "string" && params.toolConversationId.trim()
          ? params.toolConversationId.trim()
          : undefined;
        const toolTaskId = typeof params.toolTaskId === "string" && params.toolTaskId.trim()
          ? params.toolTaskId.trim()
          : undefined;
        const visibilityTask = toolTaskId && ctx.subTaskRuntimeStore
          ? await ctx.subTaskRuntimeStore.getTask(toolTaskId)
          : undefined;
        const visibilityAgentId = toolAgentId || visibilityTask?.agentId;
        const visibilityConversationId = toolConversationId || visibilityTask?.parentConversationId;
        const residentStateBinding = resolveResidentStateBindingViewForAgent(
          ctx.stateDir,
          ctx.agentRegistry,
          visibilityAgentId,
        );
        const launchExplainability = buildAgentLaunchExplainability({
          agentRegistry: ctx.agentRegistry,
          agentId: visibilityAgentId,
          profileId: visibilityTask?.launchSpec?.profileId,
          launchSpec: visibilityTask?.launchSpec,
          runtimeResilience,
        });
        const runtimeContext: ToolExecutionRuntimeContext | undefined = visibilityTask
          ? { launchSpec: visibilityTask.launchSpec }
          : undefined;
        const visibleContracts = ctx.toolExecutor.getContracts(
          visibilityAgentId,
          visibilityConversationId,
          runtimeContext,
        ).filter((contract) => contract.name !== TOOL_SETTINGS_CONTROL_NAME);
        const observability = buildToolBehaviorObservability({
          contracts: visibleContracts,
          disabledContractNamesConfigured: readConfiguredPromptExperimentToolContracts(),
        });
        const visibleToolNamesForV2 = visibleContracts.map((contract) => contract.name);
        const visibleContractV2 = listToolContractsV2(visibleContracts);
        const contractV2Observability = buildToolContractV2Observability({
          contracts: visibleContractV2,
          registeredToolNames: visibleToolNamesForV2,
        });
        const contractV2Summary = contractV2Observability.summary;
        checks.push({
          id: "tool_behavior_observability",
          name: "Tool Behavior Observability",
          status: observability.included.length > 0 ? "pass" : "warn",
          message: observability.included.length > 0
            ? `${observability.included.length} behavior contract(s) visible for ${visibilityAgentId ?? "default"}`
            : `No behavior contracts visible for ${visibilityAgentId ?? "default"}`,
        });
        toolBehaviorObservability = {
          requested: {
            ...(toolAgentId ? { agentId: toolAgentId } : {}),
            ...(toolConversationId ? { conversationId: toolConversationId } : {}),
            ...(toolTaskId ? { taskId: toolTaskId } : {}),
          },
          visibilityContext: {
            agentId: visibilityAgentId ?? "default",
            conversationId: visibilityConversationId ?? null,
            ...(launchExplainability ? { launchExplainability } : {}),
            ...(residentStateBinding ? { residentStateBinding } : {}),
            ...(visibilityTask
              ? {
                taskId: visibilityTask.id,
                launchSpec: visibilityTask.launchSpec,
              }
              : {}),
          },
          counts: {
            visibleToolContractCount: visibleContracts.length,
            includedContractCount: observability.counts.includedContractCount,
            behaviorContractCount: observability.counts.includedContractCount,
          },
          included: observability.included,
          contracts: observability.contracts,
          ...(observability.summary ? { summary: observability.summary } : {}),
          ...(observability.experiment ? { experiment: observability.experiment } : {}),
        };
        toolContractV2Observability = {
          requested: {
            ...(toolAgentId ? { agentId: toolAgentId } : {}),
            ...(toolConversationId ? { conversationId: toolConversationId } : {}),
            ...(toolTaskId ? { taskId: toolTaskId } : {}),
          },
          visibilityContext: {
            agentId: visibilityAgentId ?? "default",
            conversationId: visibilityConversationId ?? null,
            ...(launchExplainability ? { launchExplainability } : {}),
            ...(residentStateBinding ? { residentStateBinding } : {}),
            ...(visibilityTask
              ? {
                taskId: visibilityTask.id,
                launchSpec: visibilityTask.launchSpec,
              }
              : {}),
          },
          summary: contractV2Summary,
          contracts: contractV2Observability.contracts,
        };
      }

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          checks,
          memoryRuntime,
          deploymentBackends,
          ...(runtimeResilience ? { runtimeResilience } : {}),
          extensionRuntime,
          extensionMarketplace,
          extensionGovernance,
          queryRuntime,
          ...(cronRuntime ? { cronRuntime } : {}),
          ...(backgroundContinuationRuntime ? { backgroundContinuationRuntime } : {}),
          ...(externalOutboundRuntime ? { externalOutboundRuntime } : {}),
          mcpRuntime,
          ...(channelSecurity.items.length ? { channelSecurity } : {}),
          ...(promptObservability ? { promptObservability } : {}),
          ...(toolBehaviorObservability ? { toolBehaviorObservability } : {}),
          ...(toolContractV2Observability ? { toolContractV2Observability } : {}),
          ...(residentAgents ? { residentAgents } : {}),
          ...(mindProfileSnapshot ? { mindProfileSnapshot } : {}),
          ...(learningReviewInput ? { learningReviewInput } : {}),
          ...(learningReviewNudgeRuntime ? { learningReviewNudgeRuntime } : {}),
          ...(skillFreshness ? { skillFreshness } : {}),
          ...(delegationObservability ? { delegationObservability } : {}),
          ...(conversationDebug ? { conversationDebug } : {}),
          ...(conversationCatalog ? { conversationCatalog } : {}),
          ...(recentConversationExports ? { recentConversationExports } : {}),
        },
      };
    }

    case "agents.list": {
      const roster = await buildAgentRoster({
        stateDir: ctx.stateDir,
        agentRegistry: ctx.agentRegistry,
        residentAgentRuntime: ctx.residentAgentRuntime,
      });
      const agents = roster.map((agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        name: agent.name,
        avatar: agent.avatar,
        model: agent.model,
      }));
      return { type: "res", id: req.id, ok: true, payload: { agents } };
    }

    case "agents.roster.get": {
      const roster = await buildAgentRoster({
        stateDir: ctx.stateDir,
        agentRegistry: ctx.agentRegistry,
        residentAgentRuntime: ctx.residentAgentRuntime,
      });
      if ((ctx.residentMemoryManagers?.length ?? 0) > 0) {
        const observability = await buildResidentAgentObservabilitySnapshot({
          agents: roster,
          residentMemoryManagers: ctx.residentMemoryManagers,
          conversationStore: ctx.conversationStore,
          subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        });
        return { type: "res", id: req.id, ok: true, payload: { agents: observability.agents } };
      }
      const agents = roster;
      return { type: "res", id: req.id, ok: true, payload: { agents } };
    }

    case "agent.session.ensure": {
      const params = req.params as { agentId?: string } | undefined;
      try {
        const payload = ensureResidentAgentSession({
          agentId: params?.agentId,
          agentRegistry: ctx.agentRegistry,
          residentAgentRuntime: ctx.residentAgentRuntime,
          conversationStore: ctx.conversationStore,
        });
        return { type: "res", id: req.id, ok: true, payload };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_agent",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "agents.prompt.inspect": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const agentId = typeof params.agentId === "string" && params.agentId.trim()
        ? params.agentId.trim()
        : undefined;
      const conversationId = typeof params.conversationId === "string" && params.conversationId.trim()
        ? params.conversationId.trim()
        : undefined;
      const runId = typeof params.runId === "string" && params.runId.trim()
        ? params.runId.trim()
        : undefined;
      if (!ctx.inspectAgentPrompt) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "not_available", message: "Prompt inspection is not available." },
        };
      }
      try {
        const inspection = await ctx.inspectAgentPrompt({ agentId, conversationId, runId });
        const residentStateBinding = resolveResidentStateBindingViewForAgent(
          ctx.stateDir,
          ctx.agentRegistry,
          agentId ?? inspection.agentId,
        );
        const launchExplainability = buildAgentLaunchExplainability({
          agentRegistry: ctx.agentRegistry,
          agentId: agentId ?? inspection.agentId,
        });
        const metadata = isObjectRecord(inspection.metadata)
          ? { ...inspection.metadata }
          : {};
        if (residentStateBinding) {
          metadata.residentStateBinding = residentStateBinding;
        }
        if (launchExplainability) {
          metadata.launchExplainability = launchExplainability;
        }
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            ...inspection,
            metadata,
          },
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "prompt_inspect_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
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
      const checkpointId = typeof params.checkpointId === "string" ? params.checkpointId.trim() : undefined;
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.resumeGoal(goalId, nodeId, { checkpointId });
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

    case "goal.handoff.get": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.getHandoff(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_handoff_get_failed", message: err instanceof Error ? err.message : String(err) },
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
        const mindProfileSnapshot = await buildMindProfileSnapshot({
          stateDir: ctx.stateDir,
          residentMemoryManagers: ctx.residentMemoryManagers,
          agentId: typeof params.agentId === "string" && params.agentId.trim()
            ? params.agentId.trim()
            : undefined,
        });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            summary: {
              ...summary,
              learningReviewInput: buildLearningReviewInput({
                mindProfileSnapshot,
                goalReviewGovernanceSummary: summary,
              }),
            },
          },
        };
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
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const query = typeof params.query === "string" ? params.query.trim() : "";
      if (!query) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "query is required" } };
      }

      const limit = clampListLimit(params.limit, 20);
      const includeContent = params.includeContent !== false;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = await searchResidentMemory({
        manager,
        sharedManager,
        residentPolicy,
        query,
        limit,
        filter: filter as any,
        includeContent,
      });
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: toMemoryListPayloadItems(items, includeContent, residentPolicy),
          query,
          limit,
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "memory.get": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const chunkId = typeof params.chunkId === "string" ? params.chunkId.trim() : "";
      if (!chunkId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "chunkId is required" } };
      }

      const item = getResidentMemory({
        manager,
        sharedManager,
        residentPolicy,
        chunkId,
      });
      if (!item) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Memory not found." } };
      }

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          item: attachResidentMemorySourceView(item, residentPolicy),
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "memory.recent": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const limit = clampListLimit(params.limit, 20);
      const includeContent = params.includeContent !== false;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = listRecentResidentMemory({
        manager,
        sharedManager,
        residentPolicy,
        limit,
        filter: filter as any,
        includeContent,
      });
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: toMemoryListPayloadItems(items, includeContent, residentPolicy),
          limit,
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "memory.stats": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const includeRecentTasks = params.includeRecentTasks === true;
      const sharedStatus = residentPolicy?.includeSharedMemoryReads === true && sharedManager && sharedManager !== manager
        ? sharedManager.getStatus()
        : null;
      const sharedGovernance = buildSharedGovernanceCounts(manager, residentPolicy);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          status: mergeResidentMemoryStatus(manager.getStatus(), sharedStatus),
          sharedGovernance: {
            ...sharedGovernance,
            trackedCount:
              sharedGovernance.pendingCount
              + sharedGovernance.approvedCount
              + sharedGovernance.rejectedCount
              + sharedGovernance.revokedCount,
          },
          queryView: buildResidentMemoryQueryView(residentPolicy),
          ...(includeRecentTasks ? { recentTasks: manager.getRecentTasks(5) } : {}),
        },
      };
    }

    case "memory.share.queue": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50, 200);
      const query = typeof params.query === "string" ? params.query.trim() : "";
      const filter = isObjectRecord(params.filter) ? params.filter : {};
      const reviewerAgentId = extractReviewerMemoryAgentId(params) ?? "default";
      if ((ctx.residentMemoryManagers?.length ?? 0) <= 0) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Resident memory managers are not available." } };
      }

      const queue = listResidentSharedReviewQueue({
        records: ctx.residentMemoryManagers ?? [],
        agentRegistry: ctx.agentRegistry,
        reviewerAgentId,
        limit,
        query,
        filter: {
          sharedPromotionStatus: Array.isArray(filter.sharedPromotionStatus)
            ? filter.sharedPromotionStatus
              .map((item) => normalizeResidentSharedPromotionStatus(item))
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
            : normalizeResidentSharedPromotionStatus(filter.sharedPromotionStatus),
          targetAgentId: typeof filter.targetAgentId === "string" ? filter.targetAgentId.trim() : undefined,
          claimedByAgentId: typeof filter.claimedByAgentId === "string" ? filter.claimedByAgentId.trim() : undefined,
          actionableOnly: filter.actionableOnly === true,
        },
      });
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          reviewerAgentId,
          limit,
          items: queue.items.map((item) => {
            const targetPolicy = resolveResidentMemoryManagerRecord(item.targetAgentId, ctx.residentMemoryManagers)?.policy;
            return {
              ...attachResidentMemorySourceView(item, targetPolicy),
              targetAgentId: item.targetAgentId,
              targetDisplayName: item.targetDisplayName,
              targetMemoryMode: item.targetMemoryMode,
              reviewStatus: item.reviewStatus,
              actionableByReviewer: item.actionableByReviewer,
              blockedByOtherReviewer: item.blockedByOtherReviewer,
            };
          }),
          summary: queue.summary,
        },
      };
    }

    case "memory.share.promote": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const agentId = extractScopedMemoryAgentId(params) ?? residentPolicy?.agentId ?? "default";
      const chunkId = typeof params.chunkId === "string" ? params.chunkId.trim() : "";
      const sourcePath = typeof params.sourcePath === "string" ? params.sourcePath.trim() : "";
      const reason = typeof params.reason === "string" ? params.reason.trim() : "";
      if (!chunkId && !sourcePath) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "chunkId or sourcePath is required." } };
      }

      try {
        const result = promoteResidentMemoryToShared({
          manager,
          sharedManager,
          residentPolicy,
          agentId,
          chunkId: chunkId || undefined,
          sourcePath: sourcePath || undefined,
          reason,
        });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            promoted: true,
            promotedCount: result.promotedCount,
            mode: result.mode,
            reason: result.reason,
            item: result.item ? attachResidentMemorySourceView(result.item, residentPolicy) : null,
            items: result.items.map((item) => attachResidentMemorySourceView(item, residentPolicy)),
            queryView: buildResidentMemoryQueryView(residentPolicy),
          },
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "memory_share_promote_failed",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    case "memory.share.review": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const targetAgentId = extractTargetMemoryAgentId(params) ?? "default";
      const targetRecord = resolveResidentMemoryManagerRecord(targetAgentId, ctx.residentMemoryManagers);
      const manager = targetRecord?.manager ?? resolveScopedMemoryManager({ agentId: targetAgentId });
      const residentPolicy = targetRecord?.policy ?? resolveScopedResidentMemoryPolicy({ agentId: targetAgentId }, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const chunkId = typeof params.chunkId === "string" ? params.chunkId.trim() : "";
      const sourcePath = typeof params.sourcePath === "string" ? params.sourcePath.trim() : "";
      const decision = typeof params.decision === "string" ? params.decision.trim() : "";
      const note = typeof params.note === "string" ? params.note.trim() : "";
      if (!chunkId && !sourcePath) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "chunkId or sourcePath is required." } };
      }
      if (!["approved", "rejected", "revoked"].includes(decision)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "decision must be approved, rejected, or revoked." } };
      }
      const reviewerAgentId = extractReviewerMemoryAgentId(params) ?? targetAgentId;

      try {
        const result = reviewResidentSharedMemoryPromotion({
          manager,
          sharedManager,
          agentId: reviewerAgentId,
          chunkId: chunkId || undefined,
          sourcePath: sourcePath || undefined,
          decision: decision as "approved" | "rejected" | "revoked",
          note: note || undefined,
        });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            targetAgentId,
            reviewerAgentId,
            decision: result.decision,
            reviewedCount: result.reviewedCount,
            mode: result.mode,
            privateItem: result.privateItem ? attachResidentMemorySourceView(result.privateItem, residentPolicy) : null,
            sharedItem: result.sharedItem ? attachResidentMemorySourceView(result.sharedItem, residentPolicy) : null,
            privateItems: result.privateItems?.map((item) => attachResidentMemorySourceView(item, residentPolicy)) ?? [],
            sharedItems: result.sharedItems?.map((item) => attachResidentMemorySourceView(item, residentPolicy)) ?? [],
            queryView: buildResidentMemoryQueryView(residentPolicy),
          },
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "memory_share_review_failed",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    case "memory.share.claim": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const targetAgentId = extractTargetMemoryAgentId(params) ?? "default";
      const targetRecord = resolveResidentMemoryManagerRecord(targetAgentId, ctx.residentMemoryManagers);
      const manager = targetRecord?.manager ?? resolveScopedMemoryManager({ agentId: targetAgentId });
      const residentPolicy = targetRecord?.policy ?? resolveScopedResidentMemoryPolicy({ agentId: targetAgentId }, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const chunkId = typeof params.chunkId === "string" ? params.chunkId.trim() : "";
      const sourcePath = typeof params.sourcePath === "string" ? params.sourcePath.trim() : "";
      const action = typeof params.action === "string" ? params.action.trim() : "";
      if (!chunkId && !sourcePath) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "chunkId or sourcePath is required." } };
      }
      if (!["claim", "release"].includes(action)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "action must be claim or release." } };
      }
      const reviewerAgentId = extractReviewerMemoryAgentId(params) ?? targetAgentId;

      try {
        const result = claimResidentSharedMemoryPromotion({
          manager,
          sharedManager,
          agentId: reviewerAgentId,
          action: action as "claim" | "release",
          chunkId: chunkId || undefined,
          sourcePath: sourcePath || undefined,
        });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            targetAgentId,
            reviewerAgentId,
            action: result.action,
            claimedCount: result.claimedCount,
            mode: result.mode,
            privateItem: result.privateItem ? attachResidentMemorySourceView(result.privateItem, residentPolicy) : null,
            sharedItem: result.sharedItem ? attachResidentMemorySourceView(result.sharedItem, residentPolicy) : null,
            privateItems: result.privateItems.map((item) => attachResidentMemorySourceView(item, residentPolicy)),
            sharedItems: result.sharedItems.map((item) => attachResidentMemorySourceView(item, residentPolicy)),
            queryView: buildResidentMemoryQueryView(residentPolicy),
          },
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "memory_share_claim_failed",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    }

    case "memory.task.list": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

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
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }

      const task = manager.getTaskDetail(taskId);
      if (!task) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Task not found." } };
      }
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      const taskPayload = toTaskExperiencePayloadItem(manager, task, residentPolicy) as Record<string, unknown> & {
        usedSkills?: Array<Record<string, unknown>>;
      };
      taskPayload.usedSkills = (Array.isArray(taskPayload.usedSkills) ? taskPayload.usedSkills : []).map((item, index) =>
        attachSkillFreshnessToUsagePayload(item, task.usedSkills?.[index], skillFreshnessSnapshot),
      );

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          task: taskPayload,
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "experience.candidate.get": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }

      const candidate = manager.getExperienceCandidate(candidateId);
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          candidate: attachSkillFreshnessToCandidatePayload({
            ...toExperienceCandidatePayloadItem(candidate, residentPolicy),
            learningReviewInput: buildLearningReviewInput({
              mindProfileSnapshot: await buildMindProfileSnapshot({
                stateDir: ctx.stateDir,
                residentMemoryManagers: ctx.residentMemoryManagers,
                agentId: typeof params.agentId === "string" && params.agentId.trim()
                  ? params.agentId.trim()
                  : undefined,
              }),
              experienceCandidate: candidate,
            }),
          }, candidate, skillFreshnessSnapshot),
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "experience.candidate.list": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceCandidates(limit, filter as any);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: items.map((item) => attachSkillFreshnessToCandidatePayload(
            toExperienceCandidatePayloadItem(item, residentPolicy),
            item,
            skillFreshnessSnapshot,
          )),
          limit,
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "experience.candidate.accept": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

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
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

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
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const usageId = typeof params.usageId === "string" ? params.usageId.trim() : "";
      if (!usageId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "usageId is required" } };
      }

      const usage = manager.getExperienceUsage(usageId);
      if (!usage) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience usage not found." } };
      }
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          usage: attachSkillFreshnessToUsagePayload(
            toExperienceUsagePayloadItem(manager, usage, residentPolicy),
            usage,
            skillFreshnessSnapshot,
          ),
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "experience.usage.list": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsages(limit, filter as any);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: items.map((item) => attachSkillFreshnessToUsagePayload(
            toExperienceUsagePayloadItem(manager, item, residentPolicy),
            item,
            skillFreshnessSnapshot,
          )),
          limit,
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "experience.usage.stats": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsageStats(limit, filter as any);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items: items.map((item) => attachSkillFreshnessToUsagePayload(
            toExperienceUsagePayloadItem(manager, item, residentPolicy),
            item,
            skillFreshnessSnapshot,
          )),
          limit,
          queryView: buildResidentMemoryQueryView(residentPolicy),
        },
      };
    }

    case "experience.usage.revoke": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

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

    case "experience.skill.freshness.update": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const manager = resolveScopedMemoryManager(params);
      const sourceCandidateId = typeof params.sourceCandidateId === "string" ? params.sourceCandidateId.trim() : "";
      const stale = params.stale !== false;
      const candidate = sourceCandidateId && manager ? manager.getExperienceCandidate(sourceCandidateId) : null;
      if (candidate && candidate.type !== "skill") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_params", message: "sourceCandidateId must point to a skill candidate." },
        };
      }

      const skillKey = typeof params.skillKey === "string" && params.skillKey.trim()
        ? params.skillKey.trim()
        : candidate?.title || candidate?.slug || "";
      if (!skillKey && !sourceCandidateId) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_params", message: "skillKey or sourceCandidateId is required." },
        };
      }

      const updated = await updateSkillFreshnessManualMark(ctx.stateDir, {
        skillKey,
        sourceCandidateId: sourceCandidateId || undefined,
        reason: typeof params.reason === "string" ? params.reason.trim() : undefined,
        markedBy: typeof params.markedBy === "string" ? params.markedBy.trim() : extractScopedMemoryAgentId(params),
        stale,
      });
      const skillFreshnessSnapshot = manager
        ? await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager)
        : undefined;
      const skillFreshness = candidate
        ? findSkillFreshnessForCandidate(skillFreshnessSnapshot, candidate)
        : skillKey
          ? skillFreshnessSnapshot?.bySkillKey?.[skillKey.toLowerCase()]
          : undefined;

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          stale,
          mark: updated.mark,
          skillFreshness,
        },
      };
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
            boundary: result.boundary,
          },
        };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "compact_failed", message: String(err) } };
      }
    }

    case "context.compact.partial": {
      const params = req.params as {
        conversationId?: string;
        direction?: string;
        pivotMessageId?: string;
        pivotIndex?: number;
      } | undefined;
      const conversationId = params?.conversationId;
      const direction = params?.direction;

      if (!conversationId || typeof conversationId !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }
      if (direction !== "up_to" && direction !== "from") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "direction must be 'up_to' or 'from'" } };
      }

      try {
        const result = await ctx.conversationStore.forcePartialCompact(conversationId, {
          direction,
          pivotMessageId: typeof params?.pivotMessageId === "string" ? params.pivotMessageId : undefined,
          pivotIndex: typeof params?.pivotIndex === "number" && Number.isFinite(params.pivotIndex)
            ? params.pivotIndex
            : undefined,
        });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            compacted: result.compacted,
            direction: result.direction,
            originalTokens: result.originalTokens,
            compactedTokens: result.compactedTokens,
            tier: result.tier,
            boundary: result.boundary,
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
      const goalSessionEntryBanner = ctx.goalManager
        ? await buildGoalSessionStartBanner({
          sessionKey: conversationId,
          getGoal: (goalId) => ctx.goalManager!.getGoal(goalId),
          getHandoff: (goalId) => ctx.goalManager!.getHandoff(goalId),
          readTaskGraph: (goalId) => ctx.goalManager!.readTaskGraph(goalId),
        }).catch(() => undefined)
        : undefined;
      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          conversationId,
          messages: buildConversationMetaMessages(conversation),
          taskTokenResults: ctx.conversationStore.getTaskTokenResults(conversationId, limit),
          loadedDeferredTools: ctx.conversationStore.getLoadedToolNames(conversationId),
          compactBoundaries: ctx.conversationStore.getCompactBoundaries(conversationId, limit),
          continuationState: buildConversationContinuationState({
            conversationId,
            messages: buildConversationMetaMessages(conversation),
            taskTokenResults: ctx.conversationStore.getTaskTokenResults(conversationId, limit),
            loadedDeferredTools: ctx.conversationStore.getLoadedToolNames(conversationId),
            compactBoundaries: ctx.conversationStore.getCompactBoundaries(conversationId, limit),
          }),
          goalSessionEntryBanner,
        },
      };
    }

    case "conversation.transcript.export": {
      const params = req.params as {
        conversationId?: string;
        mode?: "internal" | "shareable" | "metadata_only";
      } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const mode = params?.mode;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      if (mode !== undefined && mode !== "internal" && mode !== "shareable" && mode !== "metadata_only") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "mode must be internal, shareable, or metadata_only" } };
      }

      return handleConversationTranscriptExportWithQueryRuntime({
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
        mode,
      });
    }

    case "conversation.timeline.get": {
      const params = req.params as {
        conversationId?: string;
        previewChars?: number;
      } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const previewChars = typeof params?.previewChars === "number" && Number.isFinite(params.previewChars)
        ? Math.max(24, Math.floor(params.previewChars))
        : undefined;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return handleConversationTimelineGetWithQueryRuntime({
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
        previewChars,
      });
    }

    case "conversation.prompt_snapshot.get": {
      const params = req.params as {
        conversationId?: string;
        runId?: string;
      } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const runId = typeof params?.runId === "string" && params.runId.trim()
        ? params.runId.trim()
        : undefined;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }
      if (!ctx.getConversationPromptSnapshot) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Prompt snapshot artifacts are not available." } };
      }

      return handleConversationPromptSnapshotGetWithQueryRuntime({
        requestId: req.id,
        stateDir: ctx.stateDir,
        agentRegistry: ctx.agentRegistry,
        loadPromptSnapshot: ctx.getConversationPromptSnapshot,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<"conversation.prompt_snapshot.get">(),
      }, {
        conversationId,
        runId,
      });
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
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

    case "conversation.restore": {
      const params = req.params as { conversationId?: string } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return handleConversationRestoreWithQueryRuntime({
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
        buildMemoryRuntimeDoctorReport: (input) => buildMemoryRuntimeDoctorReport({
          ...input,
          compactionRuntimeReport: ctx.getCompactionRuntimeReport?.(),
        }),
        buildDurableExtractionUnavailableError,
        refreshConversationDigestAndBroadcast,
        toDurableExtractionDigestSnapshot,
        isMemoryBudgetExceededError: (error): error is MemoryBudgetExceededError => error instanceof MemoryBudgetExceededError,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "conversation.restore"
          | "conversation.transcript.export"
          | "conversation.timeline.get"
          | "conversation.digest.get"
          | "conversation.digest.refresh"
          | "conversation.memory.extraction.get"
          | "conversation.memory.extract"
        >(),
      }, {
        conversationId,
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
        agentRegistry: ctx.agentRegistry,
        resumeSubTask: ctx.resumeSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
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
        stateDir: ctx.stateDir,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        agentRegistry: ctx.agentRegistry,
        loadPromptSnapshot: ctx.getConversationPromptSnapshot,
        resumeSubTask: ctx.resumeSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
      });
    }

    case "subtask.resume": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const message = typeof params.message === "string" && params.message.trim()
        ? params.message.trim()
        : undefined;
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }
      return handleSubTaskResumeWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        resumeSubTask: ctx.resumeSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
        message,
      });
    }

    case "subtask.takeover": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
      const message = typeof params.message === "string" && params.message.trim()
        ? params.message.trim()
        : undefined;
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }
      if (!agentId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "agentId is required" } };
      }
      return handleSubTaskTakeoverWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        resumeSubTask: ctx.resumeSubTask,
        takeoverSubTask: ctx.takeoverSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
        agentId,
        message,
      });
    }

    case "subtask.update": {
      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const message = typeof params.message === "string" ? params.message.trim() : "";
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }
      if (!message) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "message is required" } };
      }
      return handleSubTaskUpdateWithQueryRuntime({
        requestId: req.id,
        subTaskRuntimeStore: ctx.subTaskRuntimeStore,
        resumeSubTask: ctx.resumeSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
          | "subtask.stop"
          | "subtask.archive"
        >(),
      }, {
        taskId,
        message,
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
        resumeSubTask: ctx.resumeSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
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
        resumeSubTask: ctx.resumeSubTask,
        updateSubTask: ctx.updateSubTask,
        stopSubTask: ctx.stopSubTask,
        runtimeObserver: ctx.queryRuntimeTraceStore.createObserver<
          | "subtask.list"
          | "subtask.get"
          | "subtask.resume"
          | "subtask.takeover"
          | "subtask.update"
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

function parseExternalOutboundConfirmParams(
  value: unknown,
): { ok: true; value: { requestId: string; decision: "approve" | "reject"; conversationId?: string } } | { ok: false; message: string } {
  return parseToolSettingsConfirmParams(value);
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

function buildSharedGovernanceCounts(
  manager: ReturnType<typeof resolveScopedMemoryManager>,
  residentPolicy?: ScopedMemoryManagerRecord["policy"],
): {
  pendingCount: number;
  claimedCount: number;
  approvedCount: number;
  rejectedCount: number;
  revokedCount: number;
  noneCount: number;
} {
  if (!manager) {
    return {
      pendingCount: 0,
      claimedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      revokedCount: 0,
      noneCount: 0,
    };
  }

  if (residentPolicy?.writeTarget === "shared") {
    return {
      pendingCount: 0,
      claimedCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      revokedCount: 0,
      noneCount: 0,
    };
  }

  return {
    pendingCount: manager.countChunks({ sharedPromotionStatus: "pending" }),
    claimedCount: manager.countChunks({ sharedPromotionStatus: "pending", sharedPromotionClaimed: true }),
    approvedCount: manager.countChunks({ sharedPromotionStatus: "approved" }),
    rejectedCount: manager.countChunks({ sharedPromotionStatus: "rejected" }),
    revokedCount: manager.countChunks({ sharedPromotionStatus: "revoked" }),
    noneCount: manager.countChunks({ sharedPromotionStatus: "none" }),
  };
}

function toMemoryListPayloadItems(
  items: Array<any>,
  includeContent: boolean,
  residentPolicy?: ScopedMemoryManagerRecord["policy"],
): Array<Record<string, unknown>> {
  const withSourceView = attachResidentMemorySourceViews(items, residentPolicy);
  if (includeContent) {
    return withSourceView as Array<Record<string, unknown>>;
  }
  return withSourceView.map((item) => {
    const { content, ...rest } = item;
    return rest;
  });
}

function toExperienceCandidatePayloadItem(
  item: any,
  residentPolicy?: ScopedMemoryManagerRecord["policy"],
): Record<string, unknown> {
  return attachResidentExperienceCandidateSourceView(item, residentPolicy) as unknown as Record<string, unknown>;
}

function toExperienceUsagePayloadItem(
  manager: ReturnType<typeof resolveScopedMemoryManager>,
  item: any,
  residentPolicy?: ScopedMemoryManagerRecord["policy"],
): Record<string, unknown> {
  const sourceCandidate = item?.sourceCandidateId && manager
    ? manager.getExperienceCandidate(String(item.sourceCandidateId))
    : null;
  return attachResidentExperienceUsageSourceView(item, sourceCandidate, residentPolicy) as unknown as Record<string, unknown>;
}

function toTaskExperiencePayloadItem(
  manager: ReturnType<typeof resolveScopedMemoryManager>,
  item: any,
  residentPolicy?: ScopedMemoryManagerRecord["policy"],
): Record<string, unknown> {
  return attachResidentTaskExperienceSourceView(item, {
    policy: residentPolicy,
    resolveCandidate: (candidateId) => manager?.getExperienceCandidate(candidateId) ?? null,
  }) as unknown as Record<string, unknown>;
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
