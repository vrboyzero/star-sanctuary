import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensureDefaultEnvFile, resolveEnvFilePaths, resolveGatewayRuntimePaths } from "@star-sanctuary/distribution";
import { loadProjectEnvFiles } from "../cli/shared/env-loader.js";
import { buildAutoOpenTargetUrl, resolveLauncherSetupAuth } from "./launcher-auth.js";
import { deliverAutoMessageToResidentChannel } from "../auto-chat-delivery.js";
import { ResidentConversationStore } from "../resident-conversation-store.js";
import {
  createSubTaskAgentCapabilities,
  createSubTaskRuntimeEventHandler,
  createSubTaskWorktreeLifecycleHandler,
  reconcileSubTaskWorktreeRuntimes,
  SubTaskRuntimeStore,
} from "../task-runtime.js";
import { SubTaskWorktreeRuntime } from "../worktree-runtime.js";

import {
  OpenAIChatAgent,
  ToolEnabledAgent,
  type BelldandyAgent,
  ensureWorkspace,
  loadWorkspaceFiles,
  ensureAgentWorkspace,
  loadAgentWorkspaceFiles,
  buildProviderNativeSystemBlocks,
  buildSystemPromptResult,
  renderSystemPromptSections,
  ConversationStore,
  loadModelFallbacks,
  type ModelProfile,
  type VideoUploadConfig,
  FailoverClient,
  type SummarizerFn,
  AgentRegistry,
  SubAgentOrchestrator,
  loadAgentProfiles,
  buildDefaultProfile,
  resolveModelConfig,
  resolveAgentProfileMetadata,
  type AgentProfile,
  type AgentPromptDelta,
  type AgentPromptSnapshot,
  type AgentPromptSnapshotMessage,
  type ProviderNativeSystemBlock,
  type SystemPromptBuildResult,
  type SystemPromptSection,
  HookRegistry,
  createHookRunner,
  type HookRunner,
  CompactionRuntimeTracker,
} from "@belldandy/agent";
import {
  ToolExecutor,
  ToolPoolAssembler,
  DEFAULT_POLICY,
  type ToolPolicy,
  resolveSafeScopesForChannel,
  type ToolContractAccessPolicy,
  createToolSearchTool,
  TOOL_SEARCH_NAME,
  TOOL_SETTINGS_CONTROL_NAME,
  createToolSettingsControlTool,
  type AgentToolControlMode,
  fetchTool,
  applyPatchTool,
  fileReadTool,
  fileWriteTool,
  fileDeleteTool,
  listFilesTool,
  createMemorySearchTool,
  createMemoryGetTool,
  memoryReadTool,
  memoryWriteTool,
  memorySharePromoteTool,
  taskSearchTool,
  taskGetTool,
  taskRecentTool,
  taskPromoteMethodTool,
  taskPromoteSkillDraftTool,
  experienceCandidateGetTool,
  experienceCandidateListTool,
  experienceCandidateAcceptTool,
  experienceCandidateRejectTool,
  experienceUsageGetTool,
  experienceUsageListTool,
  experienceUsageRecordTool,
  experienceUsageRevokeTool,
  browserOpenTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserScreenshotTool,
  browserGetContentTool,
  cameraSnapTool,
  imageGenerateTool,
  textToSpeechTool,
  synthesizeSpeech,
  transcribeSpeech,
  runCommandTool,
  methodListTool,
  methodReadTool,
  methodCreateTool,
  methodSearchTool,
  goalInitTool,
  goalGetTool,
  goalListTool,
  goalResumeTool,
  goalPauseTool,
  goalHandoffGenerateTool,
  goalRetrospectGenerateTool,
  goalExperienceSuggestTool,
  goalMethodCandidatesGenerateTool,
  goalSkillCandidatesGenerateTool,
  goalFlowPatternsGenerateTool,
  goalCrossGoalFlowPatternsTool,
  goalReviewGovernanceSummaryTool,
  goalApprovalScanTool,
  goalSuggestionReviewListTool,
  goalSuggestionReviewWorkflowSetTool,
  goalSuggestionReviewDecideTool,
  goalSuggestionReviewEscalateTool,
  goalSuggestionReviewScanTool,
  goalSuggestionPublishTool,
  goalCheckpointListTool,
  goalCheckpointRequestTool,
  goalCheckpointApproveTool,
  goalCheckpointRejectTool,
  goalCheckpointExpireTool,
  goalCheckpointReopenTool,
  goalCheckpointEscalateTool,
  goalCapabilityPlanTool,
  goalOrchestrateTool,
  taskGraphReadTool,
  taskGraphCreateTool,
  taskGraphUpdateTool,
  taskGraphClaimTool,
  taskGraphPendingReviewTool,
  taskGraphValidatingTool,
  taskGraphCompleteTool,
  taskGraphBlockTool,
  taskGraphFailTool,
  taskGraphSkipTool,
  logReadTool,
  logSearchTool,
  createCronTool,
  createServiceRestartTool,
  switchFacetTool,
  sessionsSpawnTool,
  sessionsHistoryTool,
  delegateTaskTool,
  delegateParallelTool,
  conversationListTool,
  conversationReadTool,
  createCanvasTools,
  getUserUuidTool,
  getMessageSenderInfoTool,
  getRoomMembersTool,
  createLeaveRoomTool,
  createJoinRoomTool,
  officeWorkshopSearchTool,
  officeWorkshopGetItemTool,
  officeWorkshopDownloadTool,
  officeWorkshopPublishTool,
  officeWorkshopMineTool,
  officeWorkshopUpdateTool,
  officeWorkshopDeleteTool,
  officeHomesteadGetTool,
  officeHomesteadInventoryTool,
  officeHomesteadClaimTool,
  officeHomesteadPlaceTool,
  officeHomesteadRecallTool,
  officeHomesteadMountTool,
  officeHomesteadUnmountTool,
  officeHomesteadOpenBlindBoxTool,
  timerTool,
  tokenCounterStartTool,
  tokenCounterStopTool,
  type ConversationAccessKind,
} from "@belldandy/skills";
import { listMemoryFiles, ensureMemoryDir, getGlobalMemoryManager, listGlobalMemoryManagers, type MemoryCategory } from "@belldandy/memory";
import { RelayServer } from "@belldandy/browser";
import { FeishuChannel, QqChannel, CommunityChannel, DiscordChannel, loadCommunityConfig, getCommunityConfigPath, createChannelRouter } from "@belldandy/channels";
import { DEFAULT_STATE_DIR_DISPLAY, extractOwnerUuid, type JsonObject, type TokenUsageUploadConfig } from "@belldandy/protocol";
import { GoalManager } from "../goals/manager.js";
import { buildGoalCapabilityPlan } from "../goals/capability-planner.js";
import { parseGoalSessionKey } from "../goals/session.js";
import { buildContextInjectionPrelude } from "../context-injection.js";
import { searchEnabledSkills } from "../extension-runtime.js";
import { bridgeLegacyPluginHooks, initializeExtensionHost } from "../extension-host.js";
import { truncateToolTranscriptContent } from "../tool-transcript.js";

const GOAL_TOOL_NAMES = new Set([
  "goal_init",
  "goal_get",
  "goal_list",
  "goal_resume",
  "goal_pause",
  "goal_handoff_generate",
  "goal_retrospect_generate",
  "goal_experience_suggest",
  "goal_method_candidates_generate",
  "goal_skill_candidates_generate",
  "goal_flow_patterns_generate",
  "goal_cross_goal_flow_patterns",
  "goal_review_governance_summary",
  "goal_approval_scan",
  "goal_suggestion_review_list",
  "goal_suggestion_review_workflow_set",
  "goal_suggestion_review_decide",
  "goal_suggestion_review_escalate",
  "goal_suggestion_review_scan",
  "goal_suggestion_publish",
  "goal_checkpoint_list",
  "goal_checkpoint_request",
  "goal_checkpoint_approve",
  "goal_checkpoint_reject",
  "goal_checkpoint_expire",
  "goal_checkpoint_reopen",
  "goal_checkpoint_escalate",
  "goal_capability_plan",
  "goal_orchestrate",
  "task_graph_read",
  "task_graph_create",
  "task_graph_update",
  "task_graph_claim",
  "task_graph_pending_review",
  "task_graph_validating",
  "task_graph_complete",
  "task_graph_block",
  "task_graph_fail",
  "task_graph_skip",
]);

import { startGatewayServer } from "../server.js";
import { startHeartbeatRunner, type HeartbeatRunnerHandle } from "../heartbeat/index.js";
import { CronStore, startCronScheduler, type CronGoalApprovalScanPayload, type CronSchedulerHandle } from "../cron/index.js";
import {
  initMCPIntegration,
  shutdownMCPIntegration,
  registerMCPToolsToExecutor,
  getMCPManagerIfInitialized,
  getMCPDiagnostics,
  printMCPStatus,
} from "../mcp/index.js";
import { createLoggerFromEnv } from "../logger/index.js";
import { ToolsConfigManager } from "../tools-config.js";
import { ToolControlConfirmationStore } from "../tool-control-confirmation-store.js";
import { loadWebhookConfig, IdempotencyManager } from "../webhook/index.js";
import { BELLDANDY_VERSION } from "../version.generated.js";
import { checkForUpdates } from "../update-checker.js";
import { writeMCPDiscoveryWorkspaceDocs, type MCPPromptDiscoveryState } from "../mcp-discovery.js";
import { createScopedMemoryManagers } from "../resident-memory-managers.js";
import { loadConversationPromptSnapshotArtifact, persistConversationPromptSnapshot } from "../conversation-prompt-snapshot.js";
import { resolveResidentMemoryPolicy } from "../resident-memory-policy.js";
import { resolveResidentStateBindingView } from "../resident-state-binding.js";
import { PromptSnapshotStore } from "../prompt-snapshot-store.js";
import {
  applyPromptExperimentsToSections,
  buildPromptTokenBreakdown,
  parsePromptExperimentConfig,
  withDeltaPromptMetrics,
  withProviderNativeSystemBlockPromptMetrics,
  withSectionPromptMetrics,
  type PromptTextMetrics,
} from "../prompt-observability.js";
import { buildToolBehaviorObservability } from "../tool-behavior-observability.js";
import {
  buildToolActionKey,
  buildWarnOnlyDuplicateNotice,
  parseToolDedupGlobalMode,
  parseToolDedupPolicy,
  resolveToolDedupMode,
  summarizeToolDedupPolicy,
  shouldBypassToolDedup,
} from "../task-dedup.js";

// --- Env Loading ---
let runtimePaths = resolveGatewayRuntimePaths({
  env: process.env,
  cwd: process.cwd(),
  gatewayModuleUrl: import.meta.url,
});
let envFiles = resolveEnvFilePaths({ envDir: runtimePaths.envDir });
const ensuredDefaultEnv = ensureDefaultEnvFile(runtimePaths.envDir);

loadProjectEnvFiles({
  envPath: envFiles.envPath,
  envLocalPath: envFiles.envLocalPath,
});

runtimePaths = resolveGatewayRuntimePaths({
  env: process.env,
  cwd: process.cwd(),
  gatewayModuleUrl: import.meta.url,
});
envFiles = resolveEnvFilePaths({ envDir: runtimePaths.envDir });

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function parseConversationAllowedKinds(raw: string | undefined): ConversationAccessKind[] {
  const allKinds: ConversationAccessKind[] = ["main", "subtask", "goal", "heartbeat"];
  if (typeof raw === "undefined") {
    return allKinds;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (normalized === "none") {
    return [];
  }
  if (normalized === "all") {
    return allKinds;
  }
  const allowed = normalized
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ConversationAccessKind =>
      item === "main" || item === "subtask" || item === "goal" || item === "heartbeat");
  return [...new Set(allowed)];
}

// --- Configuration ---
const port = Number(readEnv("BELLDANDY_PORT") ?? "28889");
const host = readEnv("BELLDANDY_HOST") ?? "127.0.0.1"; // Security: Default to localhost
const authMode = (readEnv("BELLDANDY_AUTH_MODE") ?? "none") as "none" | "token" | "password";
const autoOpenBrowser = readEnv("AUTO_OPEN_BROWSER") === "true";
let authToken = readEnv("BELLDANDY_AUTH_TOKEN");
const launcherSetupAuth = resolveLauncherSetupAuth({
  authMode,
  authToken,
  autoOpenBrowser,
  setupToken: readEnv("SETUP_TOKEN"),
});
authToken = launcherSetupAuth.authToken;
const setupToken = launcherSetupAuth.setupToken;
if (setupToken) {
  process.env.SETUP_TOKEN = setupToken;
  process.env.BELLDANDY_AUTH_TOKEN = setupToken;
}
const authPassword = readEnv("BELLDANDY_AUTH_PASSWORD");
const communityApiEnabled = readEnv("BELLDANDY_COMMUNITY_API_ENABLED") === "true";
const webRoot = runtimePaths.webRoot;
const updateCheckEnabled = readEnv("BELLDANDY_UPDATE_CHECK") !== "false";
const updateCheckApiUrl = readEnv("BELLDANDY_UPDATE_CHECK_API_URL");
const updateCheckTimeoutMs = Number(readEnv("BELLDANDY_UPDATE_CHECK_TIMEOUT_MS") ?? "3000") || 3000;

// Channels
const feishuAppId = readEnv("BELLDANDY_FEISHU_APP_ID");
const feishuAppSecret = readEnv("BELLDANDY_FEISHU_APP_SECRET");
const feishuAgentId = readEnv("BELLDANDY_FEISHU_AGENT_ID");

// Channels - QQ
const qqAppId = readEnv("BELLDANDY_QQ_APP_ID");
const qqAppSecret = readEnv("BELLDANDY_QQ_APP_SECRET");
const qqAgentId = readEnv("BELLDANDY_QQ_AGENT_ID");
const qqSandbox = readEnv("BELLDANDY_QQ_SANDBOX") !== "false";

// Channels - Discord
const discordEnabled = readEnv("BELLDANDY_DISCORD_ENABLED") === "true";
const discordBotToken = readEnv("BELLDANDY_DISCORD_BOT_TOKEN");
const discordDefaultChannelId = readEnv("BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID");
const channelRouterEnabled = readEnv("BELLDANDY_CHANNEL_ROUTER_ENABLED") === "true";
const channelRouterDefaultAgentId = readEnv("BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID") ?? "default";

// Heartbeat
const heartbeatEnabled = readEnv("BELLDANDY_HEARTBEAT_ENABLED") === "true";
const heartbeatIntervalRaw = readEnv("BELLDANDY_HEARTBEAT_INTERVAL") ?? "30m";
const heartbeatActiveHoursRaw = readEnv("BELLDANDY_HEARTBEAT_ACTIVE_HOURS"); // e.g. "08:00-23:00"

// Cron 定时任务
const cronEnabled = readEnv("BELLDANDY_CRON_ENABLED") === "true";

// State & Memory
const stateDir = runtimePaths.stateDir;
const channelRouterConfigPath = readEnv("BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH") ?? path.join(stateDir, "channels-routing.json");
const webhookConfigPath = readEnv("BELLDANDY_WEBHOOK_CONFIG_PATH") ?? path.join(stateDir, "webhooks.json");
const webhookIdempotencyWindowMs = Number(readEnv("BELLDANDY_WEBHOOK_IDEMPOTENCY_WINDOW_MS")) || 10 * 60 * 1000; // 默认 10 分钟
const extraWorkspaceRootsRaw = readEnv("BELLDANDY_EXTRA_WORKSPACE_ROOTS");
const extraWorkspaceRoots = extraWorkspaceRootsRaw
  ? extraWorkspaceRootsRaw
    .split(",")
    .map((p) => path.resolve(p.trim()))
    .filter((p) => p.length > 0)
  : undefined;

// Logger（尽早初始化，后续所有输出走统一日志）
const logger = createLoggerFromEnv(stateDir);
logger.info("gateway", `Environment Dir: ${runtimePaths.envDir}`);
if (ensuredDefaultEnv.created) {
  logger.info("gateway", `Generated default .env at ${ensuredDefaultEnv.envPath}`);
}
if (runtimePaths.envSource === "legacy_root") {
  logger.warn("gateway", `Using legacy project-root env files from ${runtimePaths.envDir}; state-dir config at ${stateDir} is currently inactive`);
  logger.warn("gateway", "Run 'bdd config migrate-to-state-dir' when you are ready to switch to state-dir config");
}

function normalizeStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.map(v => String(v)).map(v => v.trim()).filter(Boolean);
}

function normalizeExecPolicy(input: unknown): ToolPolicy["exec"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    quickTimeoutMs: typeof obj.quickTimeoutMs === "number" ? obj.quickTimeoutMs : undefined,
    longTimeoutMs: typeof obj.longTimeoutMs === "number" ? obj.longTimeoutMs : undefined,
    quickCommands: normalizeStringArray(obj.quickCommands),
    longCommands: normalizeStringArray(obj.longCommands),
    extraSafelist: normalizeStringArray(obj.extraSafelist),
    extraBlocklist: normalizeStringArray(obj.extraBlocklist),
    nonInteractive: obj.nonInteractive && typeof obj.nonInteractive === "object"
      ? {
        enabled: typeof (obj.nonInteractive as any).enabled === "boolean" ? (obj.nonInteractive as any).enabled : undefined,
        additionalFlags: normalizeStringArray((obj.nonInteractive as any).additionalFlags),
        defaultFlags: normalizeStringArray((obj.nonInteractive as any).defaultFlags),
        rules: (obj.nonInteractive as any).rules && typeof (obj.nonInteractive as any).rules === "object"
          ? (obj.nonInteractive as any).rules as Record<string, string[] | string>
          : undefined,
      }
      : undefined,
  };
}

function normalizeFileWritePolicy(input: unknown): ToolPolicy["fileWrite"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    allowedExtensions: normalizeStringArray(obj.allowedExtensions),
    allowDotFiles: typeof obj.allowDotFiles === "boolean" ? obj.allowDotFiles : undefined,
    allowBinary: typeof obj.allowBinary === "boolean" ? obj.allowBinary : undefined,
  };
}

function normalizeToolsPolicy(input: unknown): Partial<ToolPolicy> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    allowedPaths: normalizeStringArray(obj.allowedPaths),
    deniedPaths: normalizeStringArray(obj.deniedPaths),
    allowedDomains: normalizeStringArray(obj.allowedDomains),
    deniedDomains: normalizeStringArray(obj.deniedDomains),
    maxTimeoutMs: typeof obj.maxTimeoutMs === "number" ? obj.maxTimeoutMs : undefined,
    maxResponseBytes: typeof obj.maxResponseBytes === "number" ? obj.maxResponseBytes : undefined,
    exec: normalizeExecPolicy(obj.exec),
    fileWrite: normalizeFileWritePolicy(obj.fileWrite),
  };
}


function mergePolicy(base: ToolPolicy, override?: Partial<ToolPolicy>): ToolPolicy {
  if (!override) return base;
  return {
    ...base,
    ...override,
    exec: {
      ...(base.exec ?? {}),
      ...(override.exec ?? {}),
      nonInteractive: {
        ...(base.exec?.nonInteractive ?? {}),
        ...(override.exec?.nonInteractive ?? {}),
      },
    },
    fileWrite: {
      ...(base.fileWrite ?? {}),
      ...(override.fileWrite ?? {}),
    },
  };
}


function loadToolsPolicy(filePath: string, log: typeof logger): Partial<ToolPolicy> | undefined {
  try {
    const resolved = path.resolve(filePath);
    const raw = fs.readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeToolsPolicy(parsed);
    if (!normalized) {
      log.warn("tools", `BELLDANDY_TOOLS_POLICY_FILE is not a valid object: ${resolved}`);
      return undefined;
    }
    log.info("tools", `Loaded tools policy from ${resolved}`);
    return normalized;
  } catch (err) {
    log.warn("tools", `Failed to load tools policy: ${String(err)}`);
    return undefined;
  }
}

const toolsPolicyFile = readEnv("BELLDANDY_TOOLS_POLICY_FILE");
const toolsPolicyFromFile = toolsPolicyFile ? loadToolsPolicy(toolsPolicyFile, logger) : undefined;
const toolsPolicy = mergePolicy(DEFAULT_POLICY, toolsPolicyFromFile);



// Agent & Tools
const agentProvider = (readEnv("BELLDANDY_AGENT_PROVIDER") ?? "mock") as "mock" | "openai";
const openaiBaseUrl = readEnv("BELLDANDY_OPENAI_BASE_URL");
const openaiApiKey = readEnv("BELLDANDY_OPENAI_API_KEY");
const openaiModel = readEnv("BELLDANDY_OPENAI_MODEL");
const openaiWireApi = (readEnv("BELLDANDY_OPENAI_WIRE_API") ?? "chat_completions").toLowerCase() === "responses"
  ? "responses"
  : "chat_completions";
const sanitizeResponsesToolSchema = (readEnv("BELLDANDY_RESPONSES_SANITIZE_TOOL_SCHEMA") ?? "false") === "true";
const openaiMaxRetriesRaw = readEnv("BELLDANDY_OPENAI_MAX_RETRIES");
const openaiMaxRetries = openaiMaxRetriesRaw ? Math.max(0, parseInt(openaiMaxRetriesRaw, 10) || 0) : 0;
const openaiRetryBackoffMsRaw = readEnv("BELLDANDY_OPENAI_RETRY_BACKOFF_MS");
const openaiRetryBackoffMs = openaiRetryBackoffMsRaw ? Math.max(100, parseInt(openaiRetryBackoffMsRaw, 10) || 300) : 300;
const openaiProxyUrl = readEnv("BELLDANDY_OPENAI_PROXY_URL");
const primaryWarmupEnabled = (readEnv("BELLDANDY_PRIMARY_WARMUP_ENABLED") ?? "true") !== "false";
const primaryWarmupTimeoutMsRaw = readEnv("BELLDANDY_PRIMARY_WARMUP_TIMEOUT_MS");
const primaryWarmupTimeoutMs = primaryWarmupTimeoutMsRaw ? Math.max(1000, parseInt(primaryWarmupTimeoutMsRaw, 10) || 8000) : 8000;
const primaryWarmupCooldownMsRaw = readEnv("BELLDANDY_PRIMARY_WARMUP_COOLDOWN_MS");
const primaryWarmupCooldownMs = primaryWarmupCooldownMsRaw ? Math.max(5000, parseInt(primaryWarmupCooldownMsRaw, 10) || 60000) : 60000;
const openaiStream = (readEnv("BELLDANDY_OPENAI_STREAM") ?? "true") !== "false";
const openaiSystemPrompt = readEnv("BELLDANDY_OPENAI_SYSTEM_PROMPT");
const agentProtocol = readEnv("BELLDANDY_AGENT_PROTOCOL") as "openai" | "anthropic" | undefined;
const injectAgents = (readEnv("BELLDANDY_INJECT_AGENTS") ?? "true") !== "false";
const injectSoul = (readEnv("BELLDANDY_INJECT_SOUL") ?? "true") !== "false";
const injectMemory = (readEnv("BELLDANDY_INJECT_MEMORY") ?? "true") !== "false";
const maxSystemPromptCharsRaw = readEnv("BELLDANDY_MAX_SYSTEM_PROMPT_CHARS");
const maxSystemPromptChars = maxSystemPromptCharsRaw ? parseInt(maxSystemPromptCharsRaw, 10) || 0 : 0;
const promptExperimentConfig = parsePromptExperimentConfig({
  disabledSectionIdsRaw: readEnv("BELLDANDY_PROMPT_EXPERIMENT_DISABLE_SECTIONS"),
  sectionPriorityOverridesRaw: readEnv("BELLDANDY_PROMPT_EXPERIMENT_SECTION_PRIORITY_OVERRIDES"),
  disabledToolContractNamesRaw: readEnv("BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS"),
});


const toolsEnabled = (readEnv("BELLDANDY_TOOLS_ENABLED") ?? "false") === "true";
const agentToolControlModeRaw = (readEnv("BELLDANDY_AGENT_TOOL_CONTROL_MODE") ?? "disabled").trim().toLowerCase();
const agentToolControlMode: AgentToolControlMode = (
  agentToolControlModeRaw === "auto" || agentToolControlModeRaw === "confirm"
    ? agentToolControlModeRaw
    : "disabled"
);
const agentToolControlConfirmPassword = (readEnv("BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD") ?? "").trim();
const toolGroups = new Set(
  (readEnv("BELLDANDY_TOOL_GROUPS") ?? "all").split(",").map(s => s.trim().toLowerCase()),
);
const allowedConversationKinds = parseConversationAllowedKinds(readEnv("BELLDANDY_CONVERSATION_ALLOWED_KINDS"));
const hasToolGroup = (group: string) => toolGroups.has("all") || toolGroups.has(group);
const agentTimeoutMsRaw = readEnv("BELLDANDY_AGENT_TIMEOUT_MS");
const agentTimeoutMs = agentTimeoutMsRaw ? Math.max(5000, parseInt(agentTimeoutMsRaw, 10) || 120_000) : undefined;
const maxInputTokensRaw = readEnv("BELLDANDY_MAX_INPUT_TOKENS");
const maxInputTokens = maxInputTokensRaw ? parseInt(maxInputTokensRaw, 10) || 0 : 0;
const maxOutputTokensRaw = readEnv("BELLDANDY_MAX_OUTPUT_TOKENS");
// 默认 4096，与硬编码默认值保持一致；用户可调大以避免长输出被截断
const maxOutputTokens = maxOutputTokensRaw ? parseInt(maxOutputTokensRaw, 10) || 4096 : 4096;

// Compaction 配置
const compactionEnabled = readEnv("BELLDANDY_COMPACTION_ENABLED") !== "false";
const compactionTokenThreshold = parseInt(readEnv("BELLDANDY_COMPACTION_THRESHOLD") || "12000", 10);
const compactionTriggerFraction = parseFloat(readEnv("BELLDANDY_COMPACTION_TRIGGER_FRACTION") || "0.75") || 0.75;
const compactionArchivalThreshold = parseInt(readEnv("BELLDANDY_COMPACTION_ARCHIVAL_THRESHOLD") || "2000", 10);
const compactionWarningThreshold = parseInt(
  readEnv("BELLDANDY_COMPACTION_WARNING_THRESHOLD") || String(Math.max(1024, Math.floor(compactionTokenThreshold * 0.7))),
  10,
);
const compactionBlockingThreshold = parseInt(
  readEnv("BELLDANDY_COMPACTION_BLOCKING_THRESHOLD") || String(Math.max(compactionWarningThreshold + 1, Math.floor(compactionTokenThreshold * 0.9))),
  10,
);
const compactionMaxConsecutiveFailures = parseInt(readEnv("BELLDANDY_COMPACTION_MAX_CONSECUTIVE_FAILURES") || "3", 10);
const compactionMaxPromptTooLongRetries = parseInt(readEnv("BELLDANDY_COMPACTION_MAX_PTL_RETRIES") || "2", 10);
const compactionModel = readEnv("BELLDANDY_COMPACTION_MODEL");
const compactionBaseUrl = readEnv("BELLDANDY_COMPACTION_BASE_URL");
const compactionApiKey = readEnv("BELLDANDY_COMPACTION_API_KEY");

// Video File Upload (dedicated endpoint when chat proxy doesn't support /files)
const videoFileApiUrl = readEnv("BELLDANDY_VIDEO_FILE_API_URL");
const videoFileApiKey = readEnv("BELLDANDY_VIDEO_FILE_API_KEY");
const videoUploadConfig: VideoUploadConfig | undefined =
  videoFileApiUrl ? { apiUrl: videoFileApiUrl, apiKey: videoFileApiKey || openaiApiKey || "" } : undefined;

// Model Failover
const modelConfigFile = readEnv("BELLDANDY_MODEL_CONFIG_FILE")
  ?? path.join(stateDir, "models.json");
let modelFallbacks: ModelProfile[] = [];
try {
  modelFallbacks = await loadModelFallbacks(modelConfigFile);
  if (modelFallbacks.length > 0) {
    logger.info("failover", `加载了 ${modelFallbacks.length} 个备用模型 Profile (from ${modelConfigFile})`);
  }
} catch (err) {
  logger.warn("failover", `加载备用模型配置失败: ${String(err)}`);
}

// Agent Profiles (Multi-Agent 预备)
const agentsConfigFile = path.join(stateDir, "agents.json");
const agentProfiles = await loadAgentProfiles(agentsConfigFile);
if (agentProfiles.length > 0) {
  logger.info("agent-profile", `加载了 ${agentProfiles.length} 个 Agent Profile (from ${agentsConfigFile})`);
}

// MCP
const mcpEnabled = (readEnv("BELLDANDY_MCP_ENABLED") ?? "false") === "true";


// --- Activity Tracking ---

let lastActiveTime = 0;
const onActivity = () => {
  lastActiveTime = Date.now();
};
const isBusy = () => {
  // Busy if active in last 2 minutes
  return Date.now() - lastActiveTime < 2 * 60 * 1000;
};

// --- Validation ---
if (!Number.isFinite(port) || port <= 0) {
  throw new Error("Invalid BELLDANDY_PORT");
}

if (authMode === "token" && !authToken) {
  throw new Error("BELLDANDY_AUTH_MODE=token requires BELLDANDY_AUTH_TOKEN");
}

if (authMode === "password" && !authPassword) {
  throw new Error("BELLDANDY_AUTH_MODE=password requires BELLDANDY_AUTH_PASSWORD");
}

// [MODIFIED] Lenient Mode: Removed strict check for OpenAI keys here.
// Validation happens lazily in createAgent.
/*
if (agentProvider === "openai") {
  if (!openaiBaseUrl) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_BASE_URL");
  if (!openaiApiKey) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_API_KEY");
  if (!openaiModel) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_MODEL");
}
*/

// Security Check: Reject unsafe configuration
if ((host === "0.0.0.0" || host === "::") && authMode === "none") {
  logger.error("gateway", "FATAL: Cannot bind to 0.0.0.0 with AUTH_MODE=none");
  logger.error("gateway", "Set BELLDANDY_AUTH_MODE=token and BELLDANDY_AUTH_TOKEN in .env to enable public access");
  process.exit(1);
}

// Security Check: Community API should never run with AUTH_MODE=none
if (communityApiEnabled && authMode === "none") {
  logger.error("gateway", "FATAL: BELLDANDY_COMMUNITY_API_ENABLED=true cannot be used with BELLDANDY_AUTH_MODE=none");
  logger.error("gateway", "Set BELLDANDY_AUTH_MODE=token (recommended) or password before enabling /api/message");
  process.exit(1);
}

// --- Initialization ---

// 1. Ensure state dir exists
if (!fs.existsSync(stateDir)) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch {
    // ignore
  }
}

// 1.5 Ensure methods and facets dir exists
const methodsDir = path.join(stateDir, "methods");
if (!fs.existsSync(methodsDir)) {
  try {
    fs.mkdirSync(methodsDir, { recursive: true });
  } catch {
    // ignore
  }
}

const facetsDir = path.join(stateDir, "facets");
if (!fs.existsSync(facetsDir)) {
  try {
    fs.mkdirSync(facetsDir, { recursive: true });
  } catch {
    // ignore
  }
}

// 1.6 Ensure agents dir exists
const agentsDir = path.join(stateDir, "agents");
if (!fs.existsSync(agentsDir)) {
  try {
    fs.mkdirSync(agentsDir, { recursive: true });
  } catch {
    // ignore
  }
}

// 2. Memory: unified MemoryManager created after sessionsDir init (see section 7.5b)

// 2.5 Init Embedding Provider (configured via env for MemoryManager)
const embeddingEnabled = readEnv("BELLDANDY_EMBEDDING_ENABLED") === "true";
if (embeddingEnabled && !openaiApiKey) {
  logger.warn("memory", "BELLDANDY_EMBEDDING_ENABLED=true but no OpenAI API key, skipping");
}

// [SECURITY] 危险工具需显式启用
const dangerousToolsEnabled = readEnv("BELLDANDY_DANGEROUS_TOOLS_ENABLED") === "true";

// Cron Store（无论是否启用调度器，工具都可以管理任务）
const cronStore = new CronStore(stateDir);
let cronSchedulerHandle: CronSchedulerHandle | undefined;

// 延迟绑定 broadcast：工具注册时 server 尚未创建，执行时才调用
let serverBroadcast: ((msg: unknown) => void) | undefined;

// 2.5 Init ToolsConfigManager (调用设置)
const toolsConfigManager = new ToolsConfigManager(stateDir, {
  info: (m) => logger.info("tools-config", m),
  warn: (m) => logger.warn("tools-config", m),
});
await toolsConfigManager.load();
const toolControlConfirmationStore = new ToolControlConfirmationStore();

// 3. Init Executor (conditional)
// Inject browser logger before registering tools
if (toolsEnabled) {
  const { setBrowserLogger } = await import("@belldandy/skills");
  setBrowserLogger(logger.child("browser"));
}

const gatewayToolPoolAssembler = new ToolPoolAssembler([
  {
    tools: [
      fetchTool,
      applyPatchTool,
      fileReadTool,
      fileWriteTool,
      fileDeleteTool,
      listFilesTool,
      createMemorySearchTool(),
      createMemoryGetTool(),
      memoryReadTool,
      memoryWriteTool,
      memorySharePromoteTool,
      taskSearchTool,
      taskGetTool,
      taskRecentTool,
      taskPromoteMethodTool,
      taskPromoteSkillDraftTool,
      experienceCandidateGetTool,
      experienceCandidateListTool,
      experienceCandidateAcceptTool,
      experienceCandidateRejectTool,
      experienceUsageGetTool,
      experienceUsageListTool,
      experienceUsageRecordTool,
      experienceUsageRevokeTool,
      getUserUuidTool,
      getMessageSenderInfoTool,
      getRoomMembersTool,
      createLeaveRoomTool(undefined),
      createJoinRoomTool(undefined),
      officeWorkshopSearchTool,
      officeWorkshopGetItemTool,
      officeWorkshopDownloadTool,
      officeWorkshopPublishTool,
      officeWorkshopMineTool,
      officeWorkshopUpdateTool,
      officeWorkshopDeleteTool,
      officeHomesteadGetTool,
      officeHomesteadInventoryTool,
      officeHomesteadClaimTool,
      officeHomesteadPlaceTool,
      officeHomesteadRecallTool,
      officeHomesteadMountTool,
      officeHomesteadUnmountTool,
      officeHomesteadOpenBlindBoxTool,
      timerTool,
      tokenCounterStartTool,
      tokenCounterStopTool,
      goalInitTool,
      goalGetTool,
      goalListTool,
      goalResumeTool,
      goalPauseTool,
      goalHandoffGenerateTool,
      goalRetrospectGenerateTool,
      goalExperienceSuggestTool,
      goalMethodCandidatesGenerateTool,
      goalSkillCandidatesGenerateTool,
      goalFlowPatternsGenerateTool,
      goalCrossGoalFlowPatternsTool,
      goalReviewGovernanceSummaryTool,
      goalApprovalScanTool,
      goalSuggestionReviewListTool,
      goalSuggestionReviewWorkflowSetTool,
      goalSuggestionReviewDecideTool,
      goalSuggestionReviewEscalateTool,
      goalSuggestionReviewScanTool,
      goalSuggestionPublishTool,
      goalCheckpointListTool,
      goalCheckpointRequestTool,
      goalCheckpointApproveTool,
      goalCheckpointRejectTool,
      goalCheckpointExpireTool,
      goalCheckpointReopenTool,
      goalCheckpointEscalateTool,
      goalCapabilityPlanTool,
      goalOrchestrateTool,
      taskGraphReadTool,
      taskGraphCreateTool,
      taskGraphUpdateTool,
      taskGraphClaimTool,
      taskGraphPendingReviewTool,
      taskGraphValidatingTool,
      taskGraphCompleteTool,
      taskGraphBlockTool,
      taskGraphFailTool,
      taskGraphSkipTool,
      sessionsSpawnTool,
      sessionsHistoryTool,
      delegateTaskTool,
      delegateParallelTool,
      conversationListTool,
      conversationReadTool,
    ],
  },
  {
    tool: runCommandTool,
  },
  {
    group: "browser",
    tools: [
      browserOpenTool,
      browserNavigateTool,
      browserClickTool,
      browserTypeTool,
      browserScreenshotTool,
      browserGetContentTool,
    ],
  },
  {
    group: "multimedia",
    tools: [
      cameraSnapTool,
      imageGenerateTool,
      textToSpeechTool,
    ],
  },
  {
    group: "methodology",
    tools: [
      methodListTool,
      methodReadTool,
      methodCreateTool,
      methodSearchTool,
    ],
  },
  {
    group: "system",
    factory: async () => [
      logReadTool,
      logSearchTool,
      createCronTool({
        store: cronStore,
        scheduler: {
          status: () => cronSchedulerHandle?.status() ?? { running: false, activeRuns: 0 },
        },
      }),
      createServiceRestartTool((msg) => serverBroadcast?.(msg)),
      switchFacetTool,
    ],
  },
  {
    group: "canvas",
    factory: async () => createCanvasTools((msg) => serverBroadcast?.(msg)),
  },
]);

const gatewayContractAccessPolicy: ToolContractAccessPolicy = {
  channel: "gateway",
  allowedSafeScopes: resolveSafeScopesForChannel("gateway"),
  blockedToolNames: dangerousToolsEnabled ? [] : [runCommandTool.definition.name],
};

const toolsToRegister = toolsEnabled
  ? await gatewayToolPoolAssembler.assemble({
    ...gatewayContractAccessPolicy,
    enabledGroups: toolGroups,
  })
  : [];

const gatewayExecutorContractAccessPolicy: ToolContractAccessPolicy = {
  ...gatewayContractAccessPolicy,
  blockedToolNames: [
    ...(gatewayContractAccessPolicy.blockedToolNames ? Array.from(gatewayContractAccessPolicy.blockedToolNames) : []),
    ...(promptExperimentConfig?.disabledToolContractNames ?? []),
  ],
};

const CORE_TOOL_NAMES = new Set<string>([
  TOOL_SETTINGS_CONTROL_NAME,
  TOOL_SEARCH_NAME,
  applyPatchTool.definition.name,
  fileReadTool.definition.name,
  listFilesTool.definition.name,
  runCommandTool.definition.name,
]);

const deferredToolNames = toolsToRegister
  .map((tool) => tool.definition.name)
  .filter((name) => !CORE_TOOL_NAMES.has(name));

let agentRegistry: AgentRegistry | undefined;

const toolExecutor = new ToolExecutor({
  tools: toolsToRegister,
  workspaceRoot: stateDir, // Use the resolved state directory as the workspace root for file operations
  extraWorkspaceRoots, // 额外允许 file_read/file_write/file_delete 的根目录（如其他盘符）
  alwaysEnabledTools: toolsEnabled ? [TOOL_SETTINGS_CONTROL_NAME, TOOL_SEARCH_NAME] : [],
  policy: toolsPolicy,
  contractAccessPolicy: gatewayExecutorContractAccessPolicy,
  deferredToolNames,
  allowedConversationKinds,
  isToolDisabled: (name) => toolsConfigManager.isToolDisabled(name),
  isToolAllowedForAgent: (toolName, agentId) => {
    const resolvedAgentId = typeof agentId === "string" && agentId.trim()
      ? agentId.trim()
      : "default";
    const profile = agentRegistry?.getProfile(resolvedAgentId);
    const whitelist = profile?.toolWhitelist?.filter((name) => typeof name === "string" && name.trim());

    if (!whitelist || whitelist.length === 0) {
      return true;
    }

    return whitelist.includes(toolName);
  },
  isToolAllowedInConversation: (toolName, conversationId) => {
    if (!GOAL_TOOL_NAMES.has(toolName)) {
      return true;
    }
    return Boolean(parseGoalSessionKey(conversationId));
  },
  broadcast: (event, payload) => {
    serverBroadcast?.({ type: "event", event, payload });
  },
  auditLogger: (log) => {
    const msg = log.success
      ? `${log.toolName} completed in ${log.durationMs}ms`
      : `${log.toolName} failed in ${log.durationMs}ms: ${log.error ?? "unknown"}`;
    logger.info("tools", msg, { toolName: log.toolName, success: log.success, durationMs: log.durationMs });
  },
  logger: {
    info: (m) => logger.info("tools", m),
    warn: (m) => logger.warn("tools", m),
    error: (m) => logger.error("tools", m),
    debug: (m) => logger.debug("tools", m),
  },
});

if (toolsEnabled) {
  toolExecutor.registerTool(createToolSearchTool({
    getCatalogEntries: (conversationId?: string, agentId?: string) =>
      toolExecutor.getCatalogEntries(agentId, conversationId),
    loadDeferredTools: (conversationId: string, toolNames: string[]) =>
      toolExecutor.loadDeferredTools(conversationId, toolNames),
  }), { silentReplace: true });
}

// 4. Log enabled tools
if (toolsEnabled) {
  const safeTools = "web_fetch, apply_patch, file_read, file_write, file_delete, list_files, memory_search, memory_get, memory_read, memory_write, memory_share_promote, task_search, task_get, task_recent, conversation_list, conversation_read, experience_candidate_get, experience_candidate_list, experience_usage_get, experience_usage_list, browser_*, log_read, log_search";
  if (dangerousToolsEnabled) {
    logger.warn("tools", "⚠️ DANGEROUS_TOOLS_ENABLED=true: run_command is active");
    logger.info("tools", `Tools enabled: ${safeTools}, run_command`);
  } else {
    logger.info("tools", `Tools enabled: ${safeTools}`);
  }
}

let mcpPromptDiscovery: MCPPromptDiscoveryState | undefined;

// 4.1 Initialize MCP and register MCP tools
if (mcpEnabled && toolsEnabled) {
  try {
    logger.info("mcp", "正在初始化 MCP 支持...");
    await initMCPIntegration(logger);
    const registeredCount = registerMCPToolsToExecutor(toolExecutor);
    const mcpManager = getMCPManagerIfInitialized();
    if (mcpManager) {
      mcpPromptDiscovery = await writeMCPDiscoveryWorkspaceDocs({
        stateDir,
        serverStates: mcpManager.getAllServerStates(),
      });
      logger.info("mcp", `已生成 MCP discovery docs: ${mcpPromptDiscovery.docsIndexPath}`);
    }
    if (registeredCount > 0) {
      logger.info("mcp", `已启用，注册了 ${registeredCount} 个 MCP 工具`);
    }
    printMCPStatus(logger);
  } catch (err) {
    logger.warn("mcp", "初始化失败，MCP 工具将不可用", err);
  }
} else if (mcpEnabled && !toolsEnabled) {
  logger.warn("mcp", "BELLDANDY_MCP_ENABLED=true 但 BELLDANDY_TOOLS_ENABLED=false，MCP 需要启用工具系统");
}

// 4.2 Prepare extension host runtime
const activeMcpServers: string[] = [];
try {
  const mcpModule = await import("../mcp/index.js");
  const diag = mcpModule.getMCPDiagnostics();
  if (diag) {
    for (const server of diag.servers) {
      if (server.status === "connected") activeMcpServers.push(server.name);
    }
  }
} catch { /* MCP not available */ }

const extensionHost = await initializeExtensionHost({
  stateDir,
  bundledSkillsDir: runtimePaths.bundledSkillsDir,
  workspaceRoot: stateDir,
  toolsEnabled,
  toolExecutor,
  toolsConfigManager,
  logger,
  activeMcpServers,
});

const {
  pluginRegistry,
  skillRegistry,
  promptSkills,
  searchableSkills,
} = extensionHost;

if (toolsEnabled) {
  toolExecutor.registerTool(createToolSettingsControlTool({
    toolsConfigManager,
    getControlMode: () => agentToolControlMode,
    getHasConfirmPassword: () => Boolean(agentToolControlConfirmPassword),
    listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
    listPluginIds: () => pluginRegistry.getPluginIds(),
    confirmationStore: toolControlConfirmationStore,
  }));
  logger.info("tools", `registered ${TOOL_SETTINGS_CONTROL_NAME} (mode=${agentToolControlMode})`);
}

// 4.4 Bridge plugin hooks → HookRegistry (deferred to after hookRegistry init, see section 7.5)

// 4.5 Ensure memory directory exists (actual indexing deferred to unified MemoryManager)
await ensureMemoryDir(stateDir);
const memoryFilesResult = await listMemoryFiles(stateDir);
if (memoryFilesResult.files.length > 0) {
  logger.info("memory", `found ${memoryFilesResult.files.length} files (MEMORY.md=${memoryFilesResult.hasMainMemory}, daily=${memoryFilesResult.dailyCount})`);
} else {
  logger.info("memory", `no files found (run 'echo "# Memory" > ${DEFAULT_STATE_DIR_DISPLAY}/MEMORY.md' to create)`);
}

// 5. Init Workspace (SOUL/Persona)
const workspaceResult = await ensureWorkspace({ dir: stateDir, createMissing: true });
if (workspaceResult.created.length > 0) {
  logger.info("workspace", `created ${workspaceResult.created.join(", ")}`);
}

// 6. Load Workspace files for system prompt
const workspace = await loadWorkspaceFiles(stateDir);
logger.info("workspace", `SOUL=${workspace.hasSoul}, IDENTITY=${workspace.hasIdentity}, USER=${workspace.hasUser}, BOOTSTRAP=${workspace.hasBootstrap}`);

// 7. Build dynamic system prompt
const skillInstructions = promptSkills.map(s => ({ name: s.name, instructions: s.instructions }));
const hasSearchableSkills = searchableSkills.length > 0;

const dynamicSystemPromptBuild = buildSystemPromptResult({
  workspace,
  extraSystemPrompt: openaiSystemPrompt,
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  currentTime: new Date().toISOString(),
  injectAgents,
  injectSoul,
  injectMemory,
  maxChars: maxSystemPromptChars,
  skillInstructions,
  hasSearchableSkills,
  sectionPriorityOverrides: promptExperimentConfig?.sectionPriorityOverrides,
});
const dynamicSystemPrompt = dynamicSystemPromptBuild.text;
logger.info("system-prompt", `length=${dynamicSystemPrompt.length} chars${maxSystemPromptChars ? `, limit=${maxSystemPromptChars}` : ""}`);

// 7.5 Hook System: HookRegistry + Context Injection
const hookRegistry = new HookRegistry();

// Context Injection: 对话开始时自动注入最近记忆摘要
const contextInjectionEnabled = readEnv("BELLDANDY_CONTEXT_INJECTION") !== "false"; // 默认启用
const contextInjectionLimit = Math.max(1, parseInt(readEnv("BELLDANDY_CONTEXT_INJECTION_LIMIT") || "5", 10));
const contextInjectionIncludeSession = readEnv("BELLDANDY_CONTEXT_INJECTION_INCLUDE_SESSION") === "true";
const contextInjectionTaskLimit = Math.max(0, parseInt(readEnv("BELLDANDY_CONTEXT_INJECTION_TASK_LIMIT") || "3", 10) || 3);
const contextInjectionAllowedCategories = parseContextInjectionCategories(
  readEnv("BELLDANDY_CONTEXT_INJECTION_ALLOWED_CATEGORIES") || "preference,fact,decision,entity",
);
// Auto-Recall: 对话开始时按当前用户输入自动进行语义召回（默认关闭）
const autoRecallEnabled = readEnv("BELLDANDY_AUTO_RECALL_ENABLED") === "true";
const autoRecallLimit = Math.max(1, parseInt(readEnv("BELLDANDY_AUTO_RECALL_LIMIT") || "3", 10) || 3);
const autoRecallMinScoreRaw = Number(readEnv("BELLDANDY_AUTO_RECALL_MIN_SCORE") || "0.3");
const autoRecallMinScore = Number.isFinite(autoRecallMinScoreRaw) ? autoRecallMinScoreRaw : 0.3;
const toolResultTranscriptCharLimit = Math.max(0, parseInt(readEnv("BELLDANDY_TOOL_RESULT_TRANSCRIPT_CHAR_LIMIT") || "12000", 10) || 12000);
const taskDedupGuardEnabled = readEnv("BELLDANDY_TASK_DEDUP_GUARD_ENABLED") !== "false";
const taskDedupWindowMinutes = Math.max(1, parseInt(readEnv("BELLDANDY_TASK_DEDUP_WINDOW_MINUTES") || "20", 10) || 20);
const taskDedupGlobalMode = parseToolDedupGlobalMode(readEnv("BELLDANDY_TASK_DEDUP_MODE"));
const taskDedupPolicy = parseToolDedupPolicy(readEnv("BELLDANDY_TASK_DEDUP_POLICY"));

if (contextInjectionEnabled || autoRecallEnabled) {
  hookRegistry.register({
    source: "context-injection",
    hookName: "before_agent_start",
    priority: 100,
    handler: async (event, _ctx) => {
      const mm = getGlobalMemoryManager({
        agentId: _ctx.agentId,
        conversationId: _ctx.sessionKey,
      });
      if (!mm) return undefined;
      try {
        return await buildContextInjectionPrelude(mm, event, _ctx, {
          contextInjectionEnabled,
          contextInjectionLimit,
          contextInjectionIncludeSession,
          contextInjectionTaskLimit,
          contextInjectionAllowedCategories,
          autoRecallEnabled,
          autoRecallLimit,
          autoRecallMinScore,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLocaleLowerCase().includes("semantic memory")) {
          logger.warn("auto-recall", `Failed to fetch semantic memory: ${message}`);
        } else {
          logger.warn("context-injection", `Failed to build context injection prelude: ${message}`);
        }
        return undefined;
      }
    },
  });
  if (contextInjectionEnabled) {
    logger.info(
      "context-injection",
      `enabled (memoryLimit=${contextInjectionLimit}, taskLimit=${contextInjectionTaskLimit}, includeSession=${contextInjectionIncludeSession}, categories=${contextInjectionAllowedCategories.join(",") || "all"})`,
    );
  }
  if (autoRecallEnabled) logger.info("auto-recall", `enabled (limit=${autoRecallLimit}, minScore=${autoRecallMinScore})`);
}

if (toolResultTranscriptCharLimit > 0) {
  hookRegistry.register({
    source: "tool-transcript",
    hookName: "tool_result_persist",
    priority: 100,
    handler: (event) => {
      const content = typeof event.message.content === "string"
        ? event.message.content
        : String(event.message.content ?? "");
      if (!content || content.length <= toolResultTranscriptCharLimit) {
        return undefined;
      }
      return {
        message: {
          ...event.message,
          content: truncateToolTranscriptContent(content, toolResultTranscriptCharLimit),
        },
      };
    },
  });
  logger.info("tool-transcript", `enabled (limit=${toolResultTranscriptCharLimit})`);
}

// 7.6 Bridge legacy plugin hooks → HookRegistry
bridgeLegacyPluginHooks({
  extensionHost,
  hookRegistry,
  logger,
});

const hookRunner: HookRunner = createHookRunner(hookRegistry, {
  logger: {
    debug: (m) => logger.debug("hooks", m),
    warn: (m) => logger.warn("hooks", m),
    error: (m) => logger.error("hooks", m),
  },
  catchErrors: true,
});

// 8. Agent Registry (replaces single agentFactory closure)
const primaryModelConfig = {
  baseUrl: openaiBaseUrl ?? "",
  apiKey: openaiApiKey ?? "",
  model: openaiModel ?? "",
};

let primaryBootstrapCooldownUntil = 0;

function getBootstrapProfileCooldowns(): Record<string, number> | undefined {
  const remainingMs = primaryBootstrapCooldownUntil - Date.now();
  if (remainingMs <= 0) return undefined;
  return { primary: remainingMs };
}

async function runPrimaryWarmupProbe(): Promise<void> {
  if (!primaryWarmupEnabled || agentProvider !== "openai") return;
  if (!openaiBaseUrl || !openaiApiKey || !openaiModel) return;

  const trimmedBase = openaiBaseUrl.replace(/\/+$/, "");
  const base = /\/v\d+$/.test(trimmedBase) ? trimmedBase : `${trimmedBase}/v1`;
  const isResponsesWireApi = openaiWireApi === "responses";
  const url = isResponsesWireApi ? `${base}/responses` : `${base}/chat/completions`;
  const body = isResponsesWireApi
    ? { model: openaiModel, input: "ping", max_output_tokens: 8 }
    : { model: openaiModel, messages: [{ role: "user", content: "ping" }], max_tokens: 8 };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), primaryWarmupTimeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.ok) {
      logger.info("warmup", `primary probe success (wire_api=${openaiWireApi}, model=${openaiModel})`);
      return;
    }

    const text = await res.text().catch(() => "");
    primaryBootstrapCooldownUntil = Date.now() + primaryWarmupCooldownMs;
    logger.warn(
      "warmup",
      `primary probe failed: HTTP ${res.status} (wire_api=${openaiWireApi}, model=${openaiModel}), apply ${primaryWarmupCooldownMs}ms cooldown. body=${text.slice(0, 200)}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    primaryBootstrapCooldownUntil = Date.now() + primaryWarmupCooldownMs;
    logger.warn(
      "warmup",
      `primary probe error: ${msg} (wire_api=${openaiWireApi}, model=${openaiModel}), apply ${primaryWarmupCooldownMs}ms cooldown.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

void runPrimaryWarmupProbe();

// 8.1 Pre-load per-agent workspaces (async, before sync factory)
const agentWorkspaceCache = new Map<string, { build: SystemPromptBuildResult }>();
const promptSnapshotStore = new PromptSnapshotStore({
  maxSnapshots: Math.max(1, parseInt(readEnv("BELLDANDY_PROMPT_SNAPSHOT_MAX_RUNS") || "48", 10) || 48),
});
const promptSnapshotMaxPersistedRuns = Math.max(1, parseInt(readEnv("BELLDANDY_PROMPT_SNAPSHOT_MAX_PERSISTED_RUNS") || "20", 10) || 20);
const promptSnapshotHeartbeatMaxRuns = Math.max(1, parseInt(readEnv("BELLDANDY_PROMPT_SNAPSHOT_HEARTBEAT_MAX_RUNS") || "5", 10) || 5);
const promptSnapshotRetentionDays = (() => {
  const raw = readEnv("BELLDANDY_PROMPT_SNAPSHOT_RETENTION_DAYS");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return 7;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return 7;
  }
  return Math.max(0, parsed);
})();

function persistPromptSnapshot(snapshot: AgentPromptSnapshot): void {
  promptSnapshotStore.save(snapshot);
  void persistConversationPromptSnapshot({
    stateDir,
    snapshot,
    retention: {
      defaultMaxRunsPerConversation: promptSnapshotMaxPersistedRuns,
      heartbeatMaxRuns: promptSnapshotHeartbeatMaxRuns,
      maxAgeDays: promptSnapshotRetentionDays,
    },
  }).catch((error) => {
    logger.warn("prompt-snapshot", `Failed to persist prompt snapshot for conversation "${snapshot.conversationId}"`, error);
  });
}

function createGatewaySystemPromptSection(input: {
  id: string;
  label: string;
  source: "runtime" | "profile";
  priority: number;
  text: string;
}): SystemPromptSection {
  return {
    id: input.id,
    label: input.label,
    source: input.source,
    priority: input.priority,
    text: input.text,
  };
}

function stripStructuredRuntimeIdentityFromSystemPrompt(input: {
  systemPrompt: string;
  deltas?: AgentPromptDelta[];
}): {
  primaryText: string;
  runtimeContextText?: string;
} | undefined {
  const runtimeIdentityTexts = (input.deltas ?? [])
    .filter((delta) => delta.deltaType === "runtime-identity" && delta.role === "system")
    .map((delta) => delta.text.trim())
    .filter(Boolean);

  if (runtimeIdentityTexts.length === 0) {
    return undefined;
  }

  let remaining = input.systemPrompt.trim();
  const extractedRuntimeTexts: string[] = [];
  for (const runtimeText of [...runtimeIdentityTexts].reverse()) {
    if (remaining === runtimeText) {
      extractedRuntimeTexts.unshift(runtimeText);
      remaining = "";
      continue;
    }

    const suffix = `\n${runtimeText}`;
    if (!remaining.endsWith(suffix)) {
      return undefined;
    }

    extractedRuntimeTexts.unshift(runtimeText);
    remaining = remaining.slice(0, remaining.length - suffix.length).trimEnd();
  }

  return {
    primaryText: remaining.trim(),
    runtimeContextText: extractedRuntimeTexts.join("\n").trim() || undefined,
  };
}

function cloneProviderNativeSystemBlocks(
  blocks?: ProviderNativeSystemBlock[],
): ProviderNativeSystemBlock[] {
  if (!blocks || blocks.length === 0) {
    return [];
  }
  return blocks.map((block) => ({
    ...block,
    sourceSectionIds: [...block.sourceSectionIds],
    sourceDeltaIds: [...block.sourceDeltaIds],
  }));
}

function renderProviderNativeSystemBlocksText(
  blocks: ProviderNativeSystemBlock[],
  blockType?: ProviderNativeSystemBlock["blockType"],
): string {
  const texts = blocks
    .filter((block) => !blockType || block.blockType === blockType)
    .map((block) => block.text.trim())
    .filter(Boolean);
  return texts.join("\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readResidentPromptMetadata(
  metadata: Record<string, unknown> | undefined,
): { residentProfile?: Record<string, unknown>; memoryPolicy?: Record<string, unknown>; residentStateBinding?: Record<string, unknown> } {
  return {
    ...(isRecord(metadata?.residentProfile) ? { residentProfile: { ...metadata.residentProfile } } : {}),
    ...(isRecord(metadata?.memoryPolicy) ? { memoryPolicy: { ...metadata.memoryPolicy } } : {}),
    ...(isRecord(metadata?.residentStateBinding) ? { residentStateBinding: { ...metadata.residentStateBinding } } : {}),
  };
}

function buildEffectiveAgentPromptInspection(profile: AgentProfile): {
  scope?: "agent" | "run";
  agentId: string;
  displayName: string;
  model: string;
  conversationId?: string;
  runId?: string;
  createdAt?: number;
  text: string;
  truncated: boolean;
  maxChars?: number;
  totalChars: number;
  finalChars: number;
  sections: Array<SystemPromptSection & PromptTextMetrics>;
  droppedSections: Array<SystemPromptSection & PromptTextMetrics>;
  deltas: Array<AgentPromptDelta & PromptTextMetrics>;
  providerNativeSystemBlocks: Array<ProviderNativeSystemBlock & PromptTextMetrics>;
  messages?: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
} {
  const baseBuild = agentWorkspaceCache.get(profile.id)?.build ?? dynamicSystemPromptBuild;
  const visibleToolContracts = toolExecutor.getContracts(profile.id);
  const registeredToolContractNames = new Set(toolExecutor.getRegisteredToolContracts().map((contract) => contract.name));
  const toolBehaviorContracts = buildToolBehaviorObservability({
    contracts: visibleToolContracts,
    disabledContractNamesConfigured: promptExperimentConfig?.disabledToolContractNames,
    disabledContractNamesApplied: (promptExperimentConfig?.disabledToolContractNames ?? [])
      .filter((name) => registeredToolContractNames.has(name)),
  });
  const sections = [...baseBuild.sections];

  const ttsEnv = process.env.BELLDANDY_TTS_ENABLED;
  const isTtsEnabled = ttsEnv === "false"
    ? false
    : ttsEnv === "true" || fs.existsSync(path.join(stateDir, "TTS_ENABLED"));
  if (isTtsEnabled) {
    sections.push(createGatewaySystemPromptSection({
      id: "tts-mode",
      label: "tts-mode",
      source: "runtime",
      priority: 130,
      text: `## [SYSTEM MODE: VOICE/TTS ENABLED]
The user has enabled text-to-speech. Audio will be generated automatically by the system.
You do NOT need to call any TTS tool — just respond with text as usual.
Do NOT include any <audio> HTML tags or [Download] links in your response.
Keep responses concise and natural for spoken delivery.`,
    }));
  }

  if (profile.systemPromptOverride) {
    sections.push(createGatewaySystemPromptSection({
      id: "profile-override",
      label: "profile-override",
      source: "profile",
      priority: 140,
      text: profile.systemPromptOverride.trim(),
    }));
  }

  if (toolBehaviorContracts.summary) {
    sections.push(createGatewaySystemPromptSection({
      id: "tool-behavior-contracts",
      label: "tool-behavior-contracts",
      source: "runtime",
      priority: 105,
      text: toolBehaviorContracts.summary,
    }));
  }

  if (mcpPromptDiscovery?.promptSummary) {
    sections.push(createGatewaySystemPromptSection({
      id: "mcp-discovery",
      label: "mcp-discovery",
      source: "runtime",
      priority: 108,
      text: mcpPromptDiscovery.promptSummary,
    }));
  }

  const promptExperimentResult = applyPromptExperimentsToSections(sections, promptExperimentConfig);
  const text = renderSystemPromptSections(promptExperimentResult.sections);
  const providerNativeSystemBlocks = buildPromptInspectionProviderNativeSystemBlocks({
    sections: promptExperimentResult.sections,
    fallbackText: text,
  });
  const tokenBreakdown = buildPromptTokenBreakdown({
    systemPromptText: text,
    sections: promptExperimentResult.sections,
    droppedSections: [...baseBuild.droppedSections, ...promptExperimentResult.droppedSections],
    providerNativeSystemBlocks,
  });
  const resolvedProfileMetadata = resolveAgentProfileMetadata(profile);
  const memoryPolicy = resolveResidentMemoryPolicy(stateDir, profile);
  const residentStateBinding = resolveResidentStateBindingView(stateDir, profile);
  return {
    scope: "agent",
    agentId: profile.id,
    displayName: profile.displayName,
    model: profile.model,
    text,
    truncated: baseBuild.truncated,
    maxChars: baseBuild.maxChars,
    totalChars: text.length,
    finalChars: text.length,
    sections: promptExperimentResult.sections.map(withSectionPromptMetrics),
    droppedSections: [...baseBuild.droppedSections, ...promptExperimentResult.droppedSections].map(withSectionPromptMetrics),
    deltas: [],
    providerNativeSystemBlocks,
    metadata: {
      workspaceDir: resolvedProfileMetadata.workspaceDir,
      residentProfile: {
        kind: resolvedProfileMetadata.kind,
        workspaceBinding: resolvedProfileMetadata.workspaceBinding,
        workspaceDir: resolvedProfileMetadata.workspaceDir,
        sessionNamespace: resolvedProfileMetadata.sessionNamespace,
        memoryMode: resolvedProfileMetadata.memoryMode,
      },
      memoryPolicy: {
        memoryMode: memoryPolicy.memoryMode,
        managerStateDir: memoryPolicy.managerStateDir,
        privateStateDir: memoryPolicy.privateStateDir,
        sharedStateDir: memoryPolicy.sharedStateDir,
        includeSharedMemoryReads: memoryPolicy.includeSharedMemoryReads,
        readTargets: [...memoryPolicy.readTargets],
        writeTarget: memoryPolicy.writeTarget,
        summary: memoryPolicy.summary,
      },
      residentStateBinding,
      includesTtsMode: isTtsEnabled,
      hasProfileOverride: Boolean(profile.systemPromptOverride),
      baseFinalChars: baseBuild.finalChars,
      baseSectionCount: baseBuild.sections.length,
      finalSectionCount: promptExperimentResult.sections.length,
      deltaCount: 0,
      deltaChars: 0,
      includesHookSystemPrompt: false,
      providerNativeSystemBlockCount: providerNativeSystemBlocks.length,
      providerNativeSystemBlockChars: tokenBreakdown.providerNativeSystemBlockEstimatedChars,
      providerNativeSystemBlockTypes: [...new Set(providerNativeSystemBlocks.map((block) => block.blockType))],
      providerNativeCacheEligibleBlockIds: providerNativeSystemBlocks
        .filter((block) => block.cacheControlEligible)
        .map((block) => block.id),
      tokenBreakdown,
      ...(baseBuild.truncationReason ? { truncationReason: { ...baseBuild.truncationReason } } : {}),
      toolBehaviorObservability: {
        counts: toolBehaviorContracts.counts,
        included: toolBehaviorContracts.included,
        ...(toolBehaviorContracts.summary ? { summary: toolBehaviorContracts.summary } : {}),
        ...(toolBehaviorContracts.experiment ? { experiment: toolBehaviorContracts.experiment } : {}),
      },
      promptExperiments: {
        disabledSectionIdsConfigured: promptExperimentConfig?.disabledSectionIds ?? [],
        disabledSectionIdsApplied: promptExperimentResult.disabledSectionIdsApplied,
        sectionPriorityOverridesConfigured: promptExperimentConfig?.sectionPriorityOverrides ?? {},
        sectionPriorityOverridesApplied: promptExperimentResult.sectionPriorityOverridesApplied,
        disabledToolContractNamesConfigured: promptExperimentConfig?.disabledToolContractNames ?? [],
        disabledToolContractNamesApplied: (promptExperimentConfig?.disabledToolContractNames ?? [])
          .filter((name) => registeredToolContractNames.has(name)),
      },
    },
  };
}

function normalizePromptSnapshotMessages(messages: AgentPromptSnapshotMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => ({
    role: message.role,
    content: Array.isArray(message.content)
      ? message.content.map((part) => ({ ...part }))
      : message.content,
    ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
  }));
}

function buildPromptInspectionProviderNativeSystemBlocks(input: {
  sections?: SystemPromptSection[];
  deltas?: AgentPromptDelta[];
  snapshot?: AgentPromptSnapshot;
  fallbackText?: string;
}): Array<ProviderNativeSystemBlock & PromptTextMetrics> {
  const snapshotBlocks = cloneProviderNativeSystemBlocks(input.snapshot?.providerNativeSystemBlocks);
  const resolvedBlocks = snapshotBlocks && snapshotBlocks.length > 0
    ? snapshotBlocks
    : buildProviderNativeSystemBlocks({
      sections: input.sections,
      deltas: input.deltas,
      fallbackText: input.fallbackText,
    });
  return resolvedBlocks.map(withProviderNativeSystemBlockPromptMetrics);
}

function buildRunPromptInspection(snapshot: AgentPromptSnapshot, profile?: AgentProfile): {
  scope: "run";
  agentId: string;
  displayName?: string;
  model?: string;
  conversationId: string;
  runId?: string;
  createdAt: number;
  text: string;
  truncated: boolean;
  maxChars?: number;
  totalChars: number;
  finalChars: number;
  sections: Array<SystemPromptSection & PromptTextMetrics>;
  droppedSections: Array<SystemPromptSection & PromptTextMetrics>;
  deltas: Array<AgentPromptDelta & PromptTextMetrics>;
  providerNativeSystemBlocks: Array<ProviderNativeSystemBlock & PromptTextMetrics>;
  messages: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
} {
  const baseInspection = profile ? buildEffectiveAgentPromptInspection(profile) : undefined;
  const snapshotProviderNativeBlocks = cloneProviderNativeSystemBlocks(snapshot.providerNativeSystemBlocks);
  const structuredSplitPrompt = snapshotProviderNativeBlocks.length === 0
    ? stripStructuredRuntimeIdentityFromSystemPrompt({
      systemPrompt: snapshot.systemPrompt,
      deltas: snapshot.deltas,
    })
    : undefined;
  const staticPromptText = snapshotProviderNativeBlocks.length > 0
    ? renderProviderNativeSystemBlocksText(
      snapshotProviderNativeBlocks.filter((block) => block.blockType !== "dynamic-runtime"),
    )
    : (structuredSplitPrompt?.primaryText || snapshot.systemPrompt).trim();
  const sections: SystemPromptSection[] = [];
  const deltaRecords: AgentPromptDelta[] = [];
  let droppedSections: Array<SystemPromptSection & PromptTextMetrics> = [];
  let truncated = false;
  let maxChars: number | undefined;

  if (snapshot.hookSystemPromptUsed) {
    sections.push(createGatewaySystemPromptSection({
      id: "hook-system-prompt",
      label: "hook-system-prompt",
      source: "runtime",
      priority: 145,
      text: staticPromptText || snapshot.systemPrompt,
    }));
  } else if (
    baseInspection
    && snapshotProviderNativeBlocks.length > 0
    && renderProviderNativeSystemBlocksText(
      snapshotProviderNativeBlocks.filter((block) => block.blockType !== "dynamic-runtime"),
    ) === baseInspection.text
  ) {
    sections.push(...baseInspection.sections);
    droppedSections = baseInspection.droppedSections;
    truncated = baseInspection.truncated;
    maxChars = baseInspection.maxChars;
  } else if (baseInspection && structuredSplitPrompt?.primaryText === baseInspection.text) {
    sections.push(...baseInspection.sections);
    droppedSections = baseInspection.droppedSections;
    truncated = baseInspection.truncated;
    maxChars = baseInspection.maxChars;
  } else if (staticPromptText || snapshot.systemPrompt) {
    sections.push(createGatewaySystemPromptSection({
      id: "runtime-system-prompt",
      label: "runtime-system-prompt",
      source: "runtime",
      priority: 145,
      text: staticPromptText || snapshot.systemPrompt,
    }));
  }

  if (snapshot.deltas && snapshot.deltas.length > 0) {
    for (const delta of snapshot.deltas) {
      deltaRecords.push({ ...delta });
    }
  }

  const deltas = deltaRecords.map(withDeltaPromptMetrics);
  const providerNativeSystemBlocks = buildPromptInspectionProviderNativeSystemBlocks({
    sections: snapshot.hookSystemPromptUsed ? undefined : sections,
    deltas: deltaRecords,
    snapshot,
    fallbackText: snapshot.systemPrompt,
  });
  const measuredSections = sections.map(withSectionPromptMetrics);
  const tokenBreakdown = buildPromptTokenBreakdown({
    systemPromptText: snapshot.systemPrompt,
    sections,
    droppedSections,
    deltas,
    providerNativeSystemBlocks,
  });
  const residentPromptMetadata = readResidentPromptMetadata(isRecord(snapshot.inputMeta) ? snapshot.inputMeta : undefined);

  return {
    scope: "run",
    agentId: snapshot.agentId ?? profile?.id ?? "default",
    displayName: profile?.displayName,
    model: profile?.model,
    conversationId: snapshot.conversationId,
    runId: snapshot.runId,
    createdAt: snapshot.createdAt,
    text: snapshot.systemPrompt,
    truncated,
    maxChars,
    totalChars: snapshot.systemPrompt.length,
    finalChars: snapshot.systemPrompt.length,
    sections: measuredSections,
    droppedSections,
    deltas,
    providerNativeSystemBlocks,
    messages: normalizePromptSnapshotMessages(snapshot.messages),
    metadata: {
      ...(baseInspection?.metadata ?? {}),
      ...residentPromptMetadata,
      snapshotScope: "run",
      snapshotCreatedAt: snapshot.createdAt,
      includesHookSystemPrompt: snapshot.hookSystemPromptUsed === true,
      hasPrependContext: Boolean(snapshot.prependContext),
      prependContextChars: snapshot.prependContext?.length ?? 0,
      includesRuntimeIdentityContext: deltas.some((delta) => delta.deltaType === "runtime-identity"),
      deltaCount: deltas.length,
      deltaChars: tokenBreakdown.deltaEstimatedChars,
      deltaTypes: [...new Set(deltas.map((delta) => delta.deltaType))],
      providerNativeSystemBlockCount: providerNativeSystemBlocks.length,
      providerNativeSystemBlockChars: tokenBreakdown.providerNativeSystemBlockEstimatedChars,
      providerNativeSystemBlockTypes: [...new Set(providerNativeSystemBlocks.map((block) => block.blockType))],
      providerNativeCacheEligibleBlockIds: providerNativeSystemBlocks
        .filter((block) => block.cacheControlEligible)
        .map((block) => block.id),
      tokenBreakdown,
      inputMeta: snapshot.inputMeta ? { ...snapshot.inputMeta } : undefined,
    },
  };
}

// Default agent uses the root workspace (already loaded above)
agentWorkspaceCache.set("default", { build: dynamicSystemPromptBuild });

// Non-default agents: ensure workspace dir + load + build system prompt
for (const profile of agentProfiles) {
  if (profile.id === "default") continue;
  const wsDir = profile.workspaceDir ?? profile.id;
  try {
    await ensureAgentWorkspace({ rootDir: stateDir, agentId: wsDir });
    const agentWs = await loadAgentWorkspaceFiles(stateDir, wsDir);
    const agentPromptBuild = buildSystemPromptResult({
      workspace: agentWs,
      extraSystemPrompt: openaiSystemPrompt,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTime: new Date().toISOString(),
      injectAgents,
      injectSoul,
      injectMemory,
      maxChars: maxSystemPromptChars,
      skillInstructions,
      hasSearchableSkills,
      sectionPriorityOverrides: promptExperimentConfig?.sectionPriorityOverrides,
    });
    agentWorkspaceCache.set(profile.id, { build: agentPromptBuild });
    logger.info("agent-workspace", `Loaded workspace for agent "${profile.id}" (dir: agents/${wsDir}/), prompt=${agentPromptBuild.text.length} chars`);
  } catch (err) {
    // Fallback to default workspace if agent workspace fails
    logger.warn("agent-workspace", `Failed to load workspace for agent "${profile.id}", falling back to default: ${err instanceof Error ? err.message : String(err)}`);
    agentWorkspaceCache.set(profile.id, { build: dynamicSystemPromptBuild });
  }
}

agentRegistry = agentProvider === "openai"
  ? new AgentRegistry((profile: AgentProfile, opts?: { modelOverride?: string }): BelldandyAgent => {
    const modelRef = opts?.modelOverride ?? profile.model;
    // Resolve model config: "primary" → env vars, named → models.json lookup
    const resolved = resolveModelConfig(modelRef, primaryModelConfig, modelFallbacks);
    if (modelRef !== "primary" && resolved.source === "primary") {
      logger.warn("agent-registry", `Model "${modelRef}" not found in models.json, falling back to primary config (agent: ${profile.id})`);
    }

    if (!resolved.apiKey) {
      throw new Error("CONFIG_REQUIRED");
    }

    const promptInspection = buildEffectiveAgentPromptInspection(profile);
    const currentSystemPrompt = promptInspection.text;

    // Determine tools enabled: profile override > env
    const profileToolsEnabled = profile.toolsEnabled ?? toolsEnabled;
    // Determine max input tokens: profile override > env
    const profileMaxInputTokens = profile.maxInputTokens ?? maxInputTokens;
    // Determine max output tokens: profile override > env（默认 4096，调大可避免长输出截断工具调用 JSON）
    const profileMaxOutputTokens = profile.maxOutputTokens ?? maxOutputTokens;

    // Resolve protocol: per-model override > global env
    const resolvedProtocol = (resolved.protocol ?? agentProtocol) as "openai" | "anthropic" | undefined;
    // Resolve wire_api: per-model override > global env
    const resolvedWireApi = (resolved.wireApi ?? "").toLowerCase() === "responses"
      ? "responses"
      : (resolved.wireApi ?? "").toLowerCase() === "chat_completions"
        ? "chat_completions"
        : openaiWireApi;
    const resolvedRequestTimeoutMs = (() => {
      const candidates: number[] = [];
      if (typeof resolved.requestTimeoutMs === "number" && resolved.requestTimeoutMs > 0) {
        candidates.push(resolved.requestTimeoutMs);
      }
      if (typeof agentTimeoutMs === "number" && agentTimeoutMs > 0) {
        candidates.push(agentTimeoutMs);
      }
      if (candidates.length === 0) return undefined;
      return Math.max(...candidates);
    })();
    const resolvedMaxRetries = resolved.maxRetries ?? openaiMaxRetries;
    const resolvedRetryBackoffMs = resolved.retryBackoffMs ?? openaiRetryBackoffMs;
    const resolvedProxyUrl = resolved.proxyUrl ?? openaiProxyUrl;
    const bootstrapProfileCooldowns = getBootstrapProfileCooldowns();

    if (profileToolsEnabled) {
      return new ToolEnabledAgent({
        baseUrl: resolved.baseUrl,
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt: currentSystemPrompt,
        systemPromptSections: promptInspection.sections,
        systemPromptMetadata: promptInspection.metadata as JsonObject,
        toolExecutor: toolExecutor,
        logger,
        hookRunner,
        onPromptSnapshot: (snapshot) => {
          persistPromptSnapshot(snapshot);
        },
        ...(resolvedRequestTimeoutMs !== undefined && { timeoutMs: resolvedRequestTimeoutMs }),
        maxRetries: resolvedMaxRetries,
        retryBackoffMs: resolvedRetryBackoffMs,
        ...(resolvedProxyUrl && { proxyUrl: resolvedProxyUrl }),
        ...(bootstrapProfileCooldowns && { bootstrapProfileCooldowns }),
        fallbacks: modelFallbacks.length > 0 ? modelFallbacks : undefined,
        failoverLogger: logger,
        videoUploadConfig,
        protocol: resolvedProtocol,
        wireApi: resolvedWireApi,
        sanitizeResponsesToolSchema,
        ...(profileMaxInputTokens > 0 && { maxInputTokens: profileMaxInputTokens }),
        ...(profileMaxOutputTokens > 0 && { maxOutputTokens: profileMaxOutputTokens }),
        compaction: compactionOpts,
        summarizer: compactionSummarizer,
        summarizerModelName: compactionModel || openaiModel,
        compactionRuntimeTracker,
        conversationStore: conversationStore, // 扩展 A：传入 conversationStore 支持跨 run 持久化
      });
    }
    return new OpenAIChatAgent({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      stream: openaiStream,
      systemPrompt: currentSystemPrompt,
      systemPromptSections: promptInspection.sections,
      systemPromptMetadata: promptInspection.metadata as JsonObject,
      onPromptSnapshot: (snapshot) => {
        persistPromptSnapshot(snapshot);
      },
      fallbacks: modelFallbacks.length > 0 ? modelFallbacks : undefined,
      failoverLogger: logger,
      videoUploadConfig,
      protocol: resolvedProtocol,
      wireApi: resolvedWireApi,
      ...(resolvedRequestTimeoutMs !== undefined && { timeoutMs: resolvedRequestTimeoutMs }),
      maxRetries: resolvedMaxRetries,
      retryBackoffMs: resolvedRetryBackoffMs,
      ...(resolvedProxyUrl && { proxyUrl: resolvedProxyUrl }),
      ...(bootstrapProfileCooldowns && { bootstrapProfileCooldowns }),
      ...(profileMaxOutputTokens > 0 && { maxOutputTokens: profileMaxOutputTokens }),
    });
  })
  : undefined;

// Register agent profiles
if (agentRegistry) {
  // Always register the default profile
  const defaultProfile = buildDefaultProfile();
  // Check if agents.json has a custom "default" override
  const customDefault = agentProfiles.find(p => p.id === "default");
  agentRegistry.register(customDefault ?? defaultProfile);

  // Register additional profiles from agents.json
  for (const profile of agentProfiles) {
    if (profile.id !== "default") {
      agentRegistry.register(profile);
    }
  }

  const profileIds = agentRegistry.list().map(p => p.id);
  logger.info("agent-registry", `Registered ${profileIds.length} agent profile(s): [${profileIds.join(", ")}]`);
}

// Backward-compatible agentFactory wrapper (for existing code paths)
const createAgent = agentRegistry
  ? () => agentRegistry.create("default")
  : undefined;

// 7.5 Init Conversation Store (Shared)
const sessionsDir = path.join(stateDir, "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });

// 创建 summarizer 函数（基于 FailoverClient，用便宜模型生成摘要）
let compactionSummarizer: SummarizerFn | undefined;
if (compactionEnabled) {
  // 优先使用专用压缩配置，回退到主模型配置
  const summarizerBaseUrl = compactionBaseUrl || openaiBaseUrl;
  const summarizerApiKey = compactionApiKey || openaiApiKey;
  const summarizerModel = compactionModel || openaiModel;
  if (summarizerBaseUrl && summarizerApiKey && summarizerModel) {
    const summarizerClient = new FailoverClient({
      primary: { id: "compaction", baseUrl: summarizerBaseUrl, apiKey: summarizerApiKey, model: summarizerModel },
      logger,
    });
    compactionSummarizer = async (prompt: string): Promise<string> => {
      const { response } = await summarizerClient.fetchWithFailover({
        timeoutMs: 30_000,
        buildRequest: (profile) => {
          const trimmedBase = profile.baseUrl.replace(/\/+$/, "");
          const base = /\/v\d+$/.test(trimmedBase) ? trimmedBase : `${trimmedBase}/v1`;
          const isResponsesWireApi = openaiWireApi === "responses";
          const url = isResponsesWireApi ? `${base}/responses` : `${base}/chat/completions`;
          const body = isResponsesWireApi
            ? {
              model: profile.model,
              input: prompt,
              max_output_tokens: 1024,
            }
            : {
              model: profile.model,
              messages: [{ role: "user", content: prompt }],
              max_tokens: 1024,
              temperature: 0.3,
            };
          return {
            url,
            init: {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${profile.apiKey}`,
              },
              body: JSON.stringify(body),
            },
          };
        },
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Compaction summarizer failed (HTTP ${response.status}): ${errorText.slice(0, 500)}`);
      }
      const json = await response.json() as any;
      if (openaiWireApi === "responses") {
        if (typeof json.output_text === "string") return json.output_text;
        const output = Array.isArray(json.output) ? json.output : [];
        const parts: string[] = [];
        for (const item of output) {
          if (item?.type !== "message" || !Array.isArray(item.content)) continue;
          for (const part of item.content) {
            if (typeof part?.text === "string") parts.push(part.text);
          }
        }
        return parts.join("");
      }
      return json.choices?.[0]?.message?.content ?? "";
    };
    logger.info("compaction", `Summarizer initialized (model: ${summarizerModel}, baseUrl: ${summarizerBaseUrl})`);
  }
}

const compactionOpts = {
  tokenThreshold: compactionTokenThreshold,
  warningThreshold: compactionWarningThreshold,
  blockingThreshold: compactionBlockingThreshold,
  keepRecentCount: parseInt(readEnv("BELLDANDY_COMPACTION_KEEP_RECENT") || "10", 10),
  triggerFraction: compactionTriggerFraction,
  archivalThreshold: compactionArchivalThreshold,
  maxConsecutiveCompactionFailures: compactionMaxConsecutiveFailures,
  maxPromptTooLongRetries: compactionMaxPromptTooLongRetries,
  enabled: compactionEnabled,
};
const compactionRuntimeTracker = new CompactionRuntimeTracker(compactionOpts);

const conversationStore = new ResidentConversationStore({
  stateDir,
  agentRegistry,
  maxHistory: parseInt(readEnv("BELLDANDY_MAX_HISTORY") || "50", 10),
  compaction: compactionOpts,
  summarizer: compactionSummarizer,
  summarizerModelName: compactionModel || openaiModel,
  compactionRuntimeTracker,
  onBeforeCompaction: async (event, ctx) => {
    logger.debug("compaction", "before compaction", {
      ...event,
      conversationId: ctx.sessionKey,
      agentId: ctx.agentId,
    });
    await hookRunner.runBeforeCompaction(event, ctx);
  },
  onAfterCompaction: async (event, ctx) => {
    logger.info("compaction", "after compaction", {
      ...event,
      conversationId: ctx.sessionKey,
      agentId: ctx.agentId,
    });
    await hookRunner.runAfterCompaction(event, ctx);
  },
});

// Wire conversationStore into ToolExecutor (for caching support)
toolExecutor.setConversationStore(conversationStore);

// 7.6 Init Sub-Agent Orchestrator (wire agentCapabilities into ToolExecutor)
let subTaskRuntimeStore: SubTaskRuntimeStore | undefined;
let subTaskWorktreeRuntime: SubTaskWorktreeRuntime | undefined;
let subAgentOrchestrator: SubAgentOrchestrator | undefined;
if (agentRegistry && toolsEnabled) {
  const subAgentMaxConcurrent = parseInt(readEnv("BELLDANDY_SUB_AGENT_MAX_CONCURRENT") || "3", 10);
  const subAgentTimeoutMs = parseInt(readEnv("BELLDANDY_SUB_AGENT_TIMEOUT_MS") || "120000", 10);
  const subAgentMaxDepth = parseInt(readEnv("BELLDANDY_SUB_AGENT_MAX_DEPTH") || "2", 10);
  const subAgentMaxQueueSize = parseInt(readEnv("BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE") || "10", 10);
  subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir, {
    info: (m, d) => logger.info("task-runtime", m, d),
    warn: (m, d) => logger.warn("task-runtime", m, d),
    error: (m, d) => logger.error("task-runtime", m, d),
    debug: (m, d) => logger.debug("task-runtime", m, d),
  });
  await subTaskRuntimeStore.load();
  subTaskWorktreeRuntime = new SubTaskWorktreeRuntime(stateDir, {
    info: (m, d) => logger.info("task-worktree", m, d),
    warn: (m, d) => logger.warn("task-worktree", m, d),
    error: (m, d) => logger.error("task-worktree", m, d),
    debug: (m, d) => logger.debug("task-worktree", m, d),
  });
  subTaskRuntimeStore.subscribe(createSubTaskWorktreeLifecycleHandler({
    runtimeStore: subTaskRuntimeStore,
    worktreeRuntime: subTaskWorktreeRuntime,
    logger: {
      info: (m, d) => logger.info("task-worktree", m, d),
      warn: (m, d) => logger.warn("task-worktree", m, d),
      error: (m, d) => logger.error("task-worktree", m, d),
      debug: (m, d) => logger.debug("task-worktree", m, d),
    },
  }));
  await reconcileSubTaskWorktreeRuntimes({
    runtimeStore: subTaskRuntimeStore,
    worktreeRuntime: subTaskWorktreeRuntime,
    logger: {
      info: (m, d) => logger.info("task-worktree", m, d),
      warn: (m, d) => logger.warn("task-worktree", m, d),
      error: (m, d) => logger.error("task-worktree", m, d),
      debug: (m, d) => logger.debug("task-worktree", m, d),
    },
  });

  subAgentOrchestrator = new SubAgentOrchestrator({
    agentRegistry,
    conversationStore,
    maxConcurrent: subAgentMaxConcurrent,
    maxQueueSize: subAgentMaxQueueSize,
    sessionTimeoutMs: subAgentTimeoutMs,
    maxDepth: subAgentMaxDepth,
    logger: {
      info: (m, d) => logger.info("orchestrator", m, d),
      warn: (m, d) => logger.warn("orchestrator", m, d),
      error: (m, d) => logger.error("orchestrator", m, d),
      debug: (m, d) => logger.debug("orchestrator", m, d),
    },
    onEvent: createSubTaskRuntimeEventHandler(subTaskRuntimeStore, {
      warn: (m, d) => logger.warn("task-runtime", m, d),
    }),
  });

  toolExecutor.setAgentCapabilities(createSubTaskAgentCapabilities({
    orchestrator: subAgentOrchestrator,
    runtimeStore: subTaskRuntimeStore,
    agentRegistry,
    worktreeRuntime: subTaskWorktreeRuntime,
    logger: {
      warn: (m, d) => logger.warn("task-runtime", m, d),
    },
  }));

  logger.info("orchestrator", `Sub-agent orchestrator initialized (maxConcurrent=${subAgentMaxConcurrent}, queue=${subAgentMaxQueueSize}, timeout=${subAgentTimeoutMs}ms, maxDepth=${subAgentMaxDepth})`);
  logger.info("task-runtime", "Sub-task runtime initialized for sub-agent orchestration.");
}

const ttsEnabledPath = path.join(stateDir, "TTS_ENABLED");
const isTtsEnabledFn = () => {
  const ttsEnv = process.env.BELLDANDY_TTS_ENABLED;
  if (ttsEnv === "false") return false;
  return ttsEnv === "true" || fs.existsSync(ttsEnabledPath);
};

// 7.7 Init scoped MemoryManagers (default + resident agent workspaces)
const teamSharedMemoryEnabled = readEnv("BELLDANDY_TEAM_SHARED_MEMORY_ENABLED") === "true";
const embeddingApiKey = readEnv("BELLDANDY_EMBEDDING_OPENAI_API_KEY") ?? openaiApiKey;
const embeddingBaseUrl = readEnv("BELLDANDY_EMBEDDING_OPENAI_BASE_URL") ?? openaiBaseUrl;
const embeddingModel = readEnv("BELLDANDY_EMBEDDING_MODEL");
const embeddingProvider = (readEnv("BELLDANDY_EMBEDDING_PROVIDER") as "openai" | "local") || "openai";
const localEmbeddingModel = readEnv("BELLDANDY_LOCAL_EMBEDDING_MODEL");
const embeddingBatchSize = Number(readEnv("BELLDANDY_EMBEDDING_BATCH_SIZE")) || 2;

// 若 embedding 需要 API Key 但 key 为空，则自动降级为不启用向量检索。
// MemoryManager 会使用 NullEmbeddingProvider，Gateway 可以正常启动。
// 用户通过 WebChat 设置面板配置 Key 后重启即可恢复向量检索。
const resolvedEmbeddingEnabled = embeddingEnabled && !(embeddingProvider === "openai" && !embeddingApiKey);
if (embeddingEnabled && !resolvedEmbeddingEnabled) {
  logger.warn("memory", "BELLDANDY_EMBEDDING_ENABLED=true but no API key found — embedding disabled. Configure API Key via WebChat settings and restart.");
}


// L0 摘要层配置
const summaryEnabled = readEnv("BELLDANDY_MEMORY_SUMMARY_ENABLED") === "true";
const summaryModel = readEnv("BELLDANDY_MEMORY_SUMMARY_MODEL") || openaiModel;
const summaryBaseUrl = readEnv("BELLDANDY_MEMORY_SUMMARY_BASE_URL") || openaiBaseUrl;
const summaryApiKey = readEnv("BELLDANDY_MEMORY_SUMMARY_API_KEY") || openaiApiKey;

// M-N3: 会话记忆自动提取配置
const evolutionEnabled = readEnv("BELLDANDY_MEMORY_EVOLUTION_ENABLED") === "true";
const evolutionModel = readEnv("BELLDANDY_MEMORY_EVOLUTION_MODEL") || openaiModel;
const evolutionBaseUrl = readEnv("BELLDANDY_MEMORY_EVOLUTION_BASE_URL") || openaiBaseUrl;
const evolutionApiKey = readEnv("BELLDANDY_MEMORY_EVOLUTION_API_KEY") || openaiApiKey;
const evolutionMinMessages = Number(readEnv("BELLDANDY_MEMORY_EVOLUTION_MIN_MESSAGES")) || 4;

// M-N4: 源路径聚合检索配置
const deepRetrievalEnabled = readEnv("BELLDANDY_MEMORY_DEEP_RETRIEVAL") === "true";

// Task 层总结配置
const taskMemoryEnabled = readEnv("BELLDANDY_TASK_MEMORY_ENABLED") === "true";
const taskSummaryEnabled = readEnv("BELLDANDY_TASK_SUMMARY_ENABLED") === "true";
const taskSummaryModel = readEnv("BELLDANDY_TASK_SUMMARY_MODEL") || openaiModel;
const taskSummaryBaseUrl = readEnv("BELLDANDY_TASK_SUMMARY_BASE_URL") || openaiBaseUrl;
const taskSummaryApiKey = readEnv("BELLDANDY_TASK_SUMMARY_API_KEY") || openaiApiKey;
const taskSummaryMinDurationMs = Number(readEnv("BELLDANDY_TASK_SUMMARY_MIN_DURATION_MS")) || 15_000;
const taskSummaryMinToolCalls = Number(readEnv("BELLDANDY_TASK_SUMMARY_MIN_TOOL_CALLS")) || 2;
const taskSummaryMinTokenTotal = Number(readEnv("BELLDANDY_TASK_SUMMARY_MIN_TOKEN_TOTAL")) || 2_000;
const experienceAutoPromotionEnabled = (readEnv("BELLDANDY_EXPERIENCE_AUTO_PROMOTION_ENABLED") ?? "true") !== "false";
const experienceAutoMethodEnabled = (readEnv("BELLDANDY_EXPERIENCE_AUTO_METHOD_ENABLED") ?? "true") !== "false";
const experienceAutoSkillEnabled = (readEnv("BELLDANDY_EXPERIENCE_AUTO_SKILL_ENABLED") ?? "true") !== "false";
let requestMemoryEvolutionExtraction:
  | ((input: {
    conversationId: string;
    source: string;
    threshold?: number;
    force?: boolean;
  }) => Promise<void>)
  | undefined;

// P1-4: Task-aware Embedding 前缀（用于 Jina/BGE 等支持 task 参数的模型）
const embeddingQueryPrefix = readEnv("BELLDANDY_EMBEDDING_QUERY_PREFIX") || undefined;
const embeddingPassagePrefix = readEnv("BELLDANDY_EMBEDDING_PASSAGE_PREFIX") || undefined;

// P1-5 & P0-2: Reranker 配置
const rerankerMinScore = Number(readEnv("BELLDANDY_RERANKER_MIN_SCORE")) || undefined;
const rerankerLengthNormAnchor = Number(readEnv("BELLDANDY_RERANKER_LENGTH_NORM_ANCHOR")) || undefined;

const scopedMemoryManagers = createScopedMemoryManagers({
  stateDir,
  agentRegistry,
  modelsDir: path.join(stateDir, "models"),
  includeTeamSharedMemory: teamSharedMemoryEnabled,
  openaiApiKey: embeddingApiKey,
  openaiBaseUrl: embeddingBaseUrl,
  openaiModel: embeddingModel,
  provider: embeddingProvider,
  localModel: localEmbeddingModel,
  embeddingBatchSize,
  embeddingQueryPrefix,
  embeddingPassagePrefix,
  summaryEnabled,
  summaryModel,
  summaryBaseUrl,
  summaryApiKey,
  evolutionEnabled,
  evolutionModel,
  evolutionBaseUrl,
  evolutionApiKey,
  evolutionMinMessages,
  taskMemoryEnabled,
  taskSummaryEnabled,
  taskSummaryModel,
  taskSummaryBaseUrl,
  taskSummaryApiKey,
  taskSummaryMinDurationMs,
  taskSummaryMinToolCalls,
  taskSummaryMinTokenTotal,
  experienceAutoPromotionEnabled,
  experienceAutoMethodEnabled,
  experienceAutoSkillEnabled,
  conversationStore,
  deepRetrievalEnabled,
  rerankerOptions: {
    ...(rerankerMinScore != null ? { minScore: rerankerMinScore } : {}),
    ...(rerankerLengthNormAnchor != null ? { lengthNormAnchor: rerankerLengthNormAnchor } : {}),
  },
  indexerOptions: {
    ignorePatterns: ["node_modules", ".git", "logs", "models", "plugins", "skills", "methods", ".star_sanctuary", ".belldandy"],
    extensions: [".md", ".txt", ".jsonl"],
    watch: true,
  },
});
// Start async indexing (non-blocking)
for (const record of [...new Map(scopedMemoryManagers.records.map((item) => [item.stateDir, item])).values()]) {
  record.manager.indexWorkspace().catch(err => {
    logger.error("memory", `Failed to start scoped memory indexing for ${record.agentId}: ${err instanceof Error ? err.message : String(err)}`);
  });
}
logger.info(
  "memory",
  `Scoped MemoryManagers initialized (bindings=${scopedMemoryManagers.records.length}, unique=${new Set(scopedMemoryManagers.records.map((item) => item.stateDir)).size}, teamShared=${teamSharedMemoryEnabled}, summary=${summaryEnabled}, evolution=${evolutionEnabled}, taskMemory=${taskMemoryEnabled}, experienceAuto=${experienceAutoPromotionEnabled}, methodAuto=${experienceAutoMethodEnabled}, skillAuto=${experienceAutoSkillEnabled})`,
);

// ========== 后台任务调度：pause/resume + 空闲摘要 ==========

// 活跃 Agent 计数器（支持并发会话）
let activeAgentCount = 0;
let idleSummaryTimer: ReturnType<typeof setInterval> | null = null;
const IDLE_SUMMARY_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

// before_agent_start: 暂停后台 LLM 任务
hookRegistry.register({
  source: "memory-throttle",
  hookName: "before_agent_start",
  priority: 50, // 高优先级，尽早暂停
  handler: async () => {
    activeAgentCount++;
    for (const mm of listGlobalMemoryManagers()) {
      if (!mm.isPaused) {
        mm.pause();
      }
    }
    logger.debug("memory-throttle", "Paused background LLM tasks (agent active)");
  },
});

// agent_end: 恢复后台 LLM 任务
hookRegistry.register({
  source: "memory-throttle",
  hookName: "agent_end",
  priority: 50, // 高优先级，在 evolution hook 之前恢复
  handler: async () => {
    activeAgentCount = Math.max(0, activeAgentCount - 1);
    if (activeAgentCount === 0) {
      const managers = listGlobalMemoryManagers();
      if (managers.length > 0) {
        // 延迟 3s 恢复，给 evolution 提取留出窗口
        setTimeout(() => {
          if (activeAgentCount === 0) {
            for (const mm of managers) {
              mm.resume();
            }
            logger.debug("memory-throttle", "Resumed background LLM tasks (agent idle)");
          }
        }, 3000);
      }
    }
  },
});

// 空闲定时器：定期触发摘要生成（仅在无活跃 Agent 时）
if (summaryEnabled) {
  idleSummaryTimer = setInterval(() => {
    if (activeAgentCount > 0) return;
    for (const mm of listGlobalMemoryManagers()) {
      mm.runIdleSummaries().then(count => {
        if (count > 0) {
          logger.info("memory-summary", `Idle summary run: generated ${count} summaries`);
        }
      }).catch(err => {
        logger.error("memory-summary", `Idle summary failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }, IDLE_SUMMARY_INTERVAL_MS);
  // 不阻止进程退出
  if (idleSummaryTimer.unref) idleSummaryTimer.unref();
  logger.info("memory-summary", `Idle summary timer started (interval=${IDLE_SUMMARY_INTERVAL_MS / 1000}s)`);
}

function detectTaskSource(sessionKey: string, meta?: Record<string, unknown>): "chat" | "sub_agent" | "cron" | "heartbeat" | "manual" {
  if (typeof meta?._parentConversationId === "string" && meta._parentConversationId.trim()) {
    return "sub_agent";
  }
  if (sessionKey.startsWith("sub_")) return "sub_agent";
  if (sessionKey.startsWith("cron-")) return "cron";
  if (sessionKey.startsWith("heartbeat-")) return "heartbeat";
  return "chat";
}

function extractGoalTaskMetadata(
  sessionKey: string,
  meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const parsed = parseGoalSessionKey(sessionKey);
  const goalId = typeof meta?.goalId === "string" && meta.goalId.trim()
    ? meta.goalId.trim()
    : parsed?.goalId;
  const nodeId = typeof meta?.nodeId === "string" && meta.nodeId.trim()
    ? meta.nodeId.trim()
    : parsed?.kind === "goal_node" ? parsed.nodeId : undefined;
  const runId = typeof meta?.runId === "string" && meta.runId.trim()
    ? meta.runId.trim()
    : parsed?.kind === "goal_node" ? parsed.runId : undefined;
  const goalSession = typeof meta?.goalSession === "boolean"
    ? meta.goalSession
    : Boolean(parsed?.goalSession);

  const result: Record<string, unknown> = {};
  if (goalId) result.goalId = goalId;
  if (nodeId) result.nodeId = nodeId;
  if (runId) result.runId = runId;
  if (goalSession) result.goalSession = true;
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseContextInjectionCategories(raw: string | undefined): MemoryCategory[] {
  const allowed = new Set<MemoryCategory>(["preference", "fact", "decision", "entity", "experience", "other"]);
  const values = String(raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is MemoryCategory => allowed.has(item as MemoryCategory));
  return values.length > 0 ? values : ["preference", "fact", "decision", "entity"];
}

function extractTaskArtifactPaths(toolName: string, result: unknown, params: Record<string, unknown>): string[] {
  if (toolName === "file_write" && typeof params.path === "string" && params.path.trim()) {
    return [params.path.trim()];
  }

  if (toolName === "method_create" && typeof params.filename === "string" && params.filename.trim()) {
    return [`methods/${params.filename.trim()}`];
  }

  if (typeof result !== "string" || !result.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(result) as Record<string, unknown>;

    if (toolName === "apply_patch" && parsed.summary && typeof parsed.summary === "object") {
      const summary = parsed.summary as Record<string, unknown>;
      const values = [
        ...(Array.isArray(summary.added) ? summary.added : []),
        ...(Array.isArray(summary.modified) ? summary.modified : []),
      ].map((value) => String(value)).filter(Boolean);
      return [...new Set(values)];
    }

    if ((toolName === "file_write" || toolName === "file_delete") && typeof parsed.path === "string" && parsed.path.trim()) {
      return [parsed.path.trim()];
    }
  } catch {
    // ignore parse failure
  }

  return [];
}

if (taskMemoryEnabled) {
  hookRegistry.register({
    source: "task-memory",
    hookName: "before_agent_start",
    priority: 40,
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const mm = getGlobalMemoryManager({
        agentId: ctx.agentId,
        conversationId: sessionKey,
      });
      if (!mm) return;

      const meta = event.meta && typeof event.meta === "object"
        ? event.meta as Record<string, unknown>
        : undefined;
      const objective = typeof event.userInput === "string" && event.userInput.trim()
        ? event.userInput
        : event.prompt;

      mm.startTaskCapture({
        conversationId: sessionKey,
        sessionKey,
        agentId: ctx.agentId,
        source: detectTaskSource(sessionKey, meta),
        objective,
        parentConversationId: typeof meta?._parentConversationId === "string"
          ? meta._parentConversationId
          : undefined,
        metadata: extractGoalTaskMetadata(sessionKey, meta),
      });
    },
  });

  if (taskDedupGuardEnabled) {
    hookRegistry.register({
      source: "task-memory",
      hookName: "before_tool_call",
      priority: 40,
      handler: async (event, ctx) => {
        const mm = getGlobalMemoryManager({
          agentId: ctx.agentId,
          conversationId: ctx.sessionKey,
        });
        if (!mm) return;

        if (shouldBypassToolDedup(event.params ?? {})) {
          return;
        }

        const mode = resolveToolDedupMode(event.toolName, {
          globalMode: taskDedupGlobalMode,
          policy: taskDedupPolicy,
        });
        if (mode === "off") return;

        const actionKey = buildToolActionKey(event.toolName, event.params ?? {});
        if (!actionKey) return;

        const duplicated = mm.findRecentDuplicateToolAction({
          toolName: event.toolName,
          actionKey,
          agentId: ctx.agentId,
          withinMinutes: taskDedupWindowMinutes,
        });
        if (!duplicated) return;

        const label = duplicated.title ?? duplicated.objective ?? duplicated.summary ?? duplicated.id;
        const duplicateMessage = `检测到相同工具动作已在 ${duplicated.finishedAt ?? duplicated.updatedAt} 的任务「${label}」中成功执行`;

        if (mode === "warn-only") {
          logger.warn("task-dedup", `${duplicateMessage}，本次将把重复执行提示注入给 Agent: tool=${event.toolName}, actionKey=${actionKey}`);
          return {
            skipExecution: true,
            syntheticResult: buildWarnOnlyDuplicateNotice({
              toolName: event.toolName,
              actionKey,
              finishedAt: duplicated.finishedAt ?? duplicated.updatedAt,
              taskLabel: label,
              withinMinutes: taskDedupWindowMinutes,
            }),
          };
        }

        return {
          block: true,
          blockReason: `${duplicateMessage}。当前工具属于高风险重复动作，已阻止再次执行。若确需重试，请显式传入 retry=true、force=true 或 allowDuplicate=true。`,
        };
      },
    });
  }

  hookRegistry.register({
    source: "task-memory",
    hookName: "after_tool_call",
    priority: 40,
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const mm = getGlobalMemoryManager({
        agentId: ctx.agentId,
        conversationId: sessionKey,
      });
      if (!mm) return;

      const artifactPaths = extractTaskArtifactPaths(
        event.toolName,
        event.result,
        event.params ?? {},
      );

      mm.recordTaskToolCall(sessionKey, {
        toolName: event.toolName,
        success: !event.error,
        durationMs: event.durationMs,
        note: event.error,
        actionKey: buildToolActionKey(event.toolName, event.params ?? {}),
        artifactPaths,
      });
    },
  });

  hookRegistry.register({
    source: "task-memory",
    hookName: "agent_end",
    priority: 40,
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const mm = getGlobalMemoryManager({
        agentId: ctx.agentId,
        conversationId: sessionKey,
      });
      if (!mm) return;

      mm.completeTaskCapture({
        conversationId: sessionKey,
        success: event.success,
        durationMs: event.durationMs,
        error: event.error,
        messages: Array.isArray(event.messages) ? event.messages : undefined,
      });
    },
  });

  logger.info(
    "task-memory",
    `Registered task memory hooks (dedupGuard=${taskDedupGuardEnabled}, dedupWindowMinutes=${taskDedupWindowMinutes}, ${summarizeToolDedupPolicy({
      globalMode: taskDedupGlobalMode,
      policy: taskDedupPolicy,
    })})`,
  );
}

// M-N3: 注册 agent_end hook 用于会话记忆自动提取
if (evolutionEnabled) {
  hookRegistry.register({
    source: "memory-evolution",
    hookName: "agent_end",
    priority: 100, // 低于 plugin-bridge (200)，让插件先执行
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;
      if (!event.success) return; // 失败的会话不提取
      const scheduleExtraction = requestMemoryEvolutionExtraction;
      if (!scheduleExtraction) {
        logger.warn("memory-evolution", `Skipped scheduling durable extraction for session ${sessionKey}: scheduler unavailable`);
        return;
      }

      // 延迟 5s 仅保留为节流窗口，真正的提取调度统一交给 server/runtime。
      setTimeout(() => {
        scheduleExtraction({
          conversationId: sessionKey,
          source: "memory_evolution",
        }).catch(err => {
          logger.error("memory-evolution", `Durable extraction scheduling failed for session ${sessionKey}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, 5000);
    },
  });
  logger.info("memory-evolution", "Registered agent_end hook for unified durable extraction scheduling");
}

// ========== 扩展 C：自动任务边界检测 ==========
// 通过 hook 系统自动识别任务边界：
// - after_tool_call: 检测到 sessions_spawn / delegate_task / delegate_parallel 时自动 start 计数器
// - agent_end: 自动 stop 所有自动启动的计数器并广播结果
const AUTO_BOUNDARY_TOOLS = new Set(["sessions_spawn", "delegate_task", "delegate_parallel"]);
const AUTO_COUNTER_PREFIX = "auto:";

if (toolsEnabled) {
  // after_tool_call: 检测任务派发工具，自动启动 token 计数器
  hookRegistry.register({
    source: "auto-boundary",
    hookName: "after_tool_call",
    priority: 150,
    handler: async (event, ctx) => {
      const toolName = ctx.toolName;
      if (!toolName || !AUTO_BOUNDARY_TOOLS.has(toolName)) return;

      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const counter = toolExecutor.getTokenCounter(sessionKey);
      if (!counter) return;

      const counterName = `${AUTO_COUNTER_PREFIX}${toolName}_${Date.now()}`;

      try {
        counter.start(counterName);
        logger.debug("auto-boundary", `Auto-started counter "${counterName}" after ${toolName} (session: ${sessionKey})`);
      } catch (err) {
        logger.warn("auto-boundary", `Failed to auto-start counter: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // agent_end: 自动停止所有 auto: 前缀的计数器并广播结果
  hookRegistry.register({
    source: "auto-boundary",
    hookName: "agent_end",
    priority: 90, // agent_end 为并行 void hook，执行顺序不由 priority 决定；token counter 可用性由 tool-agent.ts finally 块排序保证
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const counter = toolExecutor.getTokenCounter(sessionKey);
      if (!counter) return;

      const activeCounters = counter.list();
      const autoCounters = activeCounters.filter(name => name.startsWith(AUTO_COUNTER_PREFIX));
      if (autoCounters.length === 0) return;

      for (const name of autoCounters) {
        try {
          const result = counter.stop(name);
          // 广播结果到前端
          serverBroadcast?.({
            type: "event",
            event: "token.counter.result",
            payload: {
              conversationId: sessionKey,
              auto: true,
              ...result,
            },
          });
          logger.info("auto-boundary", `Auto-stopped counter "${name}": input=${result.inputTokens}, output=${result.outputTokens}, total=${result.totalTokens}, duration=${result.durationMs}ms`);
        } catch (err) {
          logger.warn("auto-boundary", `Failed to auto-stop counter "${name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    },
  });

  logger.info("auto-boundary", "Registered auto task boundary detection hooks (Extension C)");
}

// Load Webhook configuration
const webhookConfig = loadWebhookConfig(webhookConfigPath, {
  info: (m, d) => logger.info("webhook", m, d),
  warn: (m, d) => logger.warn("webhook", m, d),
  error: (m, d) => logger.error("webhook", m, d),
});

const webhookIdempotency = new IdempotencyManager(webhookIdempotencyWindowMs);

function normalizeCapabilityHint(value: string): string {
  return value.trim().toLowerCase();
}

function buildCapabilityQueryHints(goal: { title: string; objective?: string }, node: { title: string; description?: string; phase?: string }, extraHints?: string[]): string[] {
  const values = [
    node.title,
    node.phase,
    goal.title,
    goal.objective,
    node.description,
    ...(extraHints ?? []),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) continue;
    const key = normalizeCapabilityHint(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result.slice(0, 8);
}

function countCapabilityHits(source: string, hints: string[]): number {
  const lower = source.toLowerCase();
  return hints.reduce((score, hint) => {
    const normalized = normalizeCapabilityHint(hint);
    if (!normalized) return score;
    if (lower.includes(normalized)) return score + 10;
    const parts = normalized.split(/\s+/).filter(Boolean);
    const matchedParts = parts.filter((part) => lower.includes(part)).length;
    return score + matchedParts * 3;
  }, 0);
}

function searchCapabilityMethods(hints: string[]) {
  if (!fs.existsSync(methodsDir)) return [];
  const mdFiles = fs.readdirSync(methodsDir).filter((file) => file.endsWith(".md"));
  const matches: Array<{ file: string; title?: string; score: number; reason: string }> = [];
  for (const file of mdFiles) {
      const fullPath = path.join(methodsDir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const score = countCapabilityHits(`${file}\n${content}`, hints);
      if (score <= 0) continue;
      const titleMatch = /^#\s+(.+)$/m.exec(content);
      matches.push({
        file,
        title: titleMatch?.[1]?.trim(),
        score,
        reason: `匹配 query hints: ${hints.slice(0, 3).join(" / ")}`,
      });
  }
  return matches.sort((left, right) => right.score - left.score).slice(0, 4);
}

function searchCapabilitySkills(hints: string[]) {
  const scoreByName = new Map<string, number>();
  const skillByName = new Map<string, NonNullable<ReturnType<typeof skillRegistry.getSkill>>>();
  for (const hint of hints) {
    for (const skill of searchEnabledSkills({
      skillRegistry,
      toolsConfigManager,
    }, hint)) {
      scoreByName.set(skill.name, (scoreByName.get(skill.name) ?? 0) + 10);
      if (!skillByName.has(skill.name)) {
        const resolved = skillRegistry.getSkill(skill.name);
        if (resolved) {
          skillByName.set(skill.name, resolved);
        }
      }
    }
  }
  const matches: Array<{ name: string; description?: string; priority?: string; source?: string; score: number; reason: string }> = [];
  for (const [name, score] of scoreByName.entries()) {
    const skill = skillByName.get(name);
    if (!skill) continue;
    matches.push({
        name,
        description: skill.description,
        priority: skill.priority,
        source: skill.source.type,
        score,
        reason: `匹配 query hints: ${hints.slice(0, 3).join(" / ")}`,
      });
  }
  return matches.sort((left, right) => right.score - left.score).slice(0, 5);
}

function searchCapabilityMcpServers(hints: string[]) {
  const diag = getMCPDiagnostics();
  if (!diag) return [];
  const joinedHints = hints.join(" ").toLowerCase();
  const prefersExternal = /(网页|browser|api|文档|research|调研|外部|抓取|搜索|file|filesystem|database)/i.test(joinedHints);
  return diag.servers
    .filter((server) => server.status === "connected")
    .filter((server) => !toolsConfigManager.getConfig().disabled.mcp_servers.includes(server.id))
    .map((server) => {
      const score = prefersExternal
        ? countCapabilityHits(`${server.id} ${server.name}`, hints) + 5
        : countCapabilityHits(`${server.id} ${server.name}`, hints);
      return {
        serverId: server.id,
        status: server.status === "connected" ? "connected" as const : "unknown" as const,
        toolCount: server.toolCount,
        reason: prefersExternal
          ? "节点含外部上下文/远程能力信号，建议优先检查 MCP 入口。"
          : "当前可用的 MCP 能力候选。",
        score,
      };
    })
    .filter((item) => prefersExternal || item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ score, ...item }) => item);
}

async function generateCapabilityPlanForNode(
  goalId: string,
  nodeId: string,
  input: {
    runId?: string;
    objective?: string;
    queryHints?: string[];
    forceMode?: "single_agent" | "multi_agent";
  } = {},
) {
  const goal = await goalManager.getGoal(goalId);
  if (!goal) {
    throw new Error(`Goal not found: ${goalId}`);
  }
  const graph = await goalManager.readTaskGraph(goalId);
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) {
    throw new Error(`Task node not found: ${nodeId}`);
  }

  const queryHints = buildCapabilityQueryHints(goal, node, input.queryHints);
  const methods = searchCapabilityMethods(queryHints);
  const skills = searchCapabilitySkills(queryHints);
  const mcpServers = searchCapabilityMcpServers(queryHints);
  const availableAgentProfiles = agentRegistry?.list() ?? [buildDefaultProfile()];
  const availableAgentIds = availableAgentProfiles.map((profile) => profile.id);
  const planInput = buildGoalCapabilityPlan({
    goalTitle: goal.title,
    goalObjective: input.objective?.trim() || goal.objective,
    nodeId: node.id,
    nodeTitle: node.title,
    nodeDescription: node.description,
    nodePhase: node.phase,
    nodeOwner: node.owner,
    queryHints,
    methods,
    skills,
    mcpServers,
    availableAgentIds,
    availableAgents: availableAgentProfiles.map((profile) => ({
      id: profile.id,
      kind: resolveAgentProfileMetadata(profile).kind,
      catalog: resolveAgentProfileMetadata(profile).catalog,
    })),
    forceMode: input.forceMode,
    runId: input.runId ?? node.lastRunId,
  });
  const plan = await goalManager.saveCapabilityPlan(goalId, nodeId, planInput);
  return { goal, node, plan };
}

const goalManager = new GoalManager(stateDir);

toolExecutor.setGoalCapabilities({
  createGoal: (input) => goalManager.createGoal(input),
  listGoals: () => goalManager.listGoals(),
  getGoal: (goalId) => goalManager.getGoal(goalId),
  resumeGoal: (goalId, nodeId) => goalManager.resumeGoal(goalId, nodeId),
  pauseGoal: (goalId) => goalManager.pauseGoal(goalId),
  generateHandoff: (goalId) => goalManager.generateHandoff(goalId),
  generateRetrospective: (goalId) => goalManager.generateRetrospective(goalId),
  generateExperienceSuggestions: (goalId) => goalManager.generateExperienceSuggestions(goalId),
  generateMethodCandidates: (goalId) => goalManager.generateMethodCandidates(goalId),
  generateSkillCandidates: (goalId) => goalManager.generateSkillCandidates(goalId),
  generateFlowPatterns: (goalId) => goalManager.generateFlowPatterns(goalId),
  generateCrossGoalFlowPatterns: () => goalManager.generateCrossGoalFlowPatterns(),
  getReviewGovernanceSummary: (goalId) => goalManager.getReviewGovernanceSummary(goalId),
  scanApprovalWorkflows: (goalId, input) => goalManager.scanApprovalWorkflows(goalId, input),
  listSuggestionReviews: (goalId) => goalManager.listSuggestionReviews(goalId),
  configureSuggestionReviewWorkflow: (goalId, input) => goalManager.configureSuggestionReviewWorkflow(goalId, input),
  decideSuggestionReview: (goalId, input) => goalManager.decideSuggestionReview(goalId, input),
  escalateSuggestionReview: (goalId, input) => goalManager.escalateSuggestionReview(goalId, input),
  scanSuggestionReviewWorkflows: (goalId, input) => goalManager.scanSuggestionReviewWorkflows(goalId, input),
  publishSuggestion: (goalId, input) => goalManager.publishSuggestion(goalId, input),
  listCheckpoints: (goalId) => goalManager.listCheckpoints(goalId),
  requestCheckpoint: (goalId, nodeId, input) => goalManager.requestCheckpoint(goalId, nodeId, input),
  approveCheckpoint: (goalId, nodeId, input) => goalManager.approveCheckpoint(goalId, nodeId, input),
  rejectCheckpoint: (goalId, nodeId, input) => goalManager.rejectCheckpoint(goalId, nodeId, input),
  expireCheckpoint: (goalId, nodeId, input) => goalManager.expireCheckpoint(goalId, nodeId, input),
  reopenCheckpoint: (goalId, nodeId, input) => goalManager.reopenCheckpoint(goalId, nodeId, input),
  escalateCheckpoint: (goalId, nodeId, input) => goalManager.escalateCheckpoint(goalId, nodeId, input),
  listCapabilityPlans: (goalId) => goalManager.listCapabilityPlans(goalId),
  getCapabilityPlan: (goalId, nodeId) => goalManager.getCapabilityPlan(goalId, nodeId),
  saveCapabilityPlan: (goalId, nodeId, input) => goalManager.saveCapabilityPlan(goalId, nodeId, input),
  generateCapabilityPlan: (goalId, nodeId, input) => generateCapabilityPlanForNode(goalId, nodeId, input),
  readTaskGraph: (goalId) => goalManager.readTaskGraph(goalId),
  createTaskNode: (goalId, input) => goalManager.createTaskNode(goalId, input),
  updateTaskNode: (goalId, nodeId, input) => goalManager.updateTaskNode(goalId, nodeId, input),
  claimTaskNode: (goalId, nodeId, input) => goalManager.claimTaskNode(goalId, nodeId, input),
  markTaskNodePendingReview: (goalId, nodeId, input) => goalManager.markTaskNodePendingReview(goalId, nodeId, input),
  markTaskNodeValidating: (goalId, nodeId, input) => goalManager.markTaskNodeValidating(goalId, nodeId, input),
  completeTaskNode: (goalId, nodeId, input) => goalManager.completeTaskNode(goalId, nodeId, input),
  blockTaskNode: (goalId, nodeId, input) => goalManager.blockTaskNode(goalId, nodeId, input),
  failTaskNode: (goalId, nodeId, input) => goalManager.failTaskNode(goalId, nodeId, input),
  skipTaskNode: (goalId, nodeId, input) => goalManager.skipTaskNode(goalId, nodeId, input),
});

if (webhookConfig.webhooks.length > 0) {
  logger.info("webhook", `Loaded ${webhookConfig.webhooks.length} webhook(s) from ${webhookConfigPath}`);
} else {
  logger.info("webhook", `No webhooks configured (create ${DEFAULT_STATE_DIR_DISPLAY}/webhooks.json to enable)`);
}

const server = await startGatewayServer({
  port,
  host,
  auth: { mode: authMode, token: authToken, password: authPassword },
  webRoot,
  envDir: runtimePaths.envDir,
  stateDir,
  additionalWorkspaceRoots: extraWorkspaceRoots,
  agentFactory: createAgent,
  agentRegistry: agentRegistry,
  primaryModelConfig,
  modelFallbacks,
  residentMemoryManagers: scopedMemoryManagers.records,
  conversationStore: conversationStore, // Pass shared instance
  getCompactionRuntimeReport: () => compactionRuntimeTracker.getReport(),
  onActivity,
  logger,
  toolsConfigManager,
  toolExecutor: toolsEnabled ? toolExecutor : undefined,
  toolControlConfirmationStore,
  getAgentToolControlMode: () => agentToolControlMode,
  getAgentToolControlConfirmPassword: () => agentToolControlConfirmPassword,
  pluginRegistry,
  skillRegistry,
  inspectAgentPrompt: async ({ agentId, conversationId, runId }) => {
    const resolvedConversationId = typeof conversationId === "string" && conversationId.trim()
      ? conversationId.trim()
      : undefined;
    const resolvedRunId = typeof runId === "string" && runId.trim()
      ? runId.trim()
      : undefined;
    const resolvedAgentId = typeof agentId === "string" && agentId.trim()
      ? agentId.trim()
      : undefined;

    if (resolvedConversationId || resolvedRunId) {
      let snapshot = promptSnapshotStore.get({
        conversationId: resolvedConversationId,
        runId: resolvedRunId,
        agentId: resolvedAgentId,
      });
      if (!snapshot && resolvedConversationId) {
        const persisted = await loadConversationPromptSnapshotArtifact({
          stateDir,
          conversationId: resolvedConversationId,
          runId: resolvedRunId,
        });
        if (persisted) {
          snapshot = {
            agentId: persisted.manifest.agentId,
            conversationId: persisted.manifest.conversationId,
            runId: persisted.manifest.runId,
            createdAt: persisted.manifest.createdAt,
            systemPrompt: persisted.snapshot.systemPrompt,
            messages: persisted.snapshot.messages,
            deltas: persisted.snapshot.deltas,
            providerNativeSystemBlocks: persisted.snapshot.providerNativeSystemBlocks,
            inputMeta: persisted.snapshot.inputMeta,
            hookSystemPromptUsed: persisted.snapshot.hookSystemPromptUsed,
            prependContext: persisted.snapshot.prependContext,
          };
        }
      }
      if (!snapshot) {
        throw new Error(
          `Prompt snapshot not found for conversationId="${resolvedConversationId ?? ""}" runId="${resolvedRunId ?? ""}"`,
        );
      }
      const snapshotProfile = agentRegistry?.getProfile(snapshot.agentId ?? resolvedAgentId ?? "default");
      return buildRunPromptInspection(snapshot, snapshotProfile);
    }

    const fallbackAgentId = resolvedAgentId ?? "default";
    const profile = agentRegistry?.getProfile(fallbackAgentId);
    if (!profile) {
      throw new Error(`AgentProfile not found: "${fallbackAgentId}"`);
    }
    return buildEffectiveAgentPromptInspection(profile);
  },
  getConversationPromptSnapshot: async ({ conversationId, runId }) => loadConversationPromptSnapshotArtifact({
    stateDir,
    conversationId,
    runId,
  }),
  extensionHost,
  goalManager,
  subTaskRuntimeStore,
  stopSubTask: async (taskId, reason) => {
    if (!subTaskRuntimeStore) return undefined;
    const current = await subTaskRuntimeStore.getTask(taskId);
    if (!current) return undefined;
    const normalizedReason = typeof reason === "string" && reason.trim()
      ? reason.trim()
      : "Task stopped by user.";

    if (current.status === "pending" && !current.sessionId) {
      return subTaskRuntimeStore.markStopped(taskId, { reason: normalizedReason });
    }

    const requested = await subTaskRuntimeStore.requestStop(taskId, normalizedReason);
    if (current.sessionId && subAgentOrchestrator) {
      const stopped = await subAgentOrchestrator.stopSession(current.sessionId, normalizedReason);
      if (stopped) {
        return subTaskRuntimeStore.getTask(taskId);
      }
    }
    return requested;
  },
  ttsEnabled: isTtsEnabledFn,
  ttsSynthesize: async (text: string) => {
    const result = await synthesizeSpeech({ text, stateDir });
    if (result) {
      logger.info("tts-auto", `Audio generated: ${result.webPath}`);
    }
    return result;
  },
  sttTranscribe: async (opts) => {
    const result = await transcribeSpeech(opts);
    if (result) {
      logger.info("stt", `Transcribed audio (${result.durationSec?.toFixed(1) ?? "?"}s) via ${result.provider}: "${result.text.slice(0, 50)}${result.text.length > 50 ? "..." : ""}"`);
    }
    return result;
  },
  // 告知前端当前 AI 模型是否已配置好，未配置时前端自动弹出设置引导
  isConfigured: () => agentProvider === "openai" && !!openaiApiKey,
  webhookConfig,
  webhookIdempotency,
});
requestMemoryEvolutionExtraction = server.requestDurableExtractionFromDigest;

goalManager.setEventSink((payload) => {
  server.broadcast({
    type: "event",
    event: "goal.update",
    payload,
  });
});

// 绑定 broadcast 给 service_restart 工具使用
serverBroadcast = (msg) => server.broadcast(msg as any);

logger.info("gateway", `Belldandy Gateway running: http://${server.host}:${server.port}`);
logger.info("gateway", `Belldandy Version: v${BELLDANDY_VERSION}`);
logger.info("gateway", `WebChat: http://${server.host}:${server.port}/`);
logger.info("gateway", `WS: ws://${server.host}:${server.port}`);
void checkForUpdates({
  currentVersion: BELLDANDY_VERSION,
  logger,
  enabled: updateCheckEnabled,
  timeoutMs: updateCheckTimeoutMs,
  releasesApiUrl: updateCheckApiUrl,
});

if (server.host === "0.0.0.0" || server.host === "::") {
  // Print LAN IPs for easier access from other machines
  const nets = os.networkInterfaces();
  logger.info("gateway", "Network Interfaces (Public Access):");
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        logger.info("gateway", `  -> http://${net.address}:${server.port}/`);
      }
    }
  }
} else {
  logger.info("gateway", `Access restricted to local machine (${server.host}).`);
  logger.info("gateway", "To allow remote access, set BELLDANDY_HOST=0.0.0.0 in .env");
}
logger.info("gateway", `State Dir: ${stateDir}`);
logger.info("gateway", `Memory DBs: unique=${new Set(scopedMemoryManagers.records.map((item) => path.join(item.stateDir, "memory.sqlite"))).size}, bindings=${scopedMemoryManagers.records.length}`);
logger.info("gateway", `Tools Enabled: ${toolsEnabled}`);

// 8.5 Auto Open Browser (Magic Link)
if (autoOpenBrowser) {
  const targetUrl = buildAutoOpenTargetUrl({
    host: server.host,
    port: server.port,
    authMode,
    setupToken,
  });

  logger.info("launcher", `Opening browser at ${targetUrl}...`);
  // Dynamic import to avoid issues if 'open' is optional or ESM
  try {
    const { default: open } = await import("open");
    await open(targetUrl);
  } catch (err) {
    logger.error("launcher", "Failed to auto-open browser", err);
    logger.info("launcher", `Please open manually: ${targetUrl}`);
  }
}

const channelRouter = createChannelRouter({
  enabled: channelRouterEnabled,
  configPath: channelRouterConfigPath,
  defaultAgentId: channelRouterDefaultAgentId,
  logger: {
    debug: (message, data) => logger.debug("channel-router", message, data),
    info: (message, data) => logger.info("channel-router", message, data),
    warn: (message, data) => logger.warn("channel-router", message, data),
  },
});

if (channelRouterEnabled) {
  logger.info("channel-router", `enabled (config: ${channelRouterConfigPath}, defaultAgent: ${channelRouterDefaultAgentId})`);
} else {
  logger.info("channel-router", "disabled");
}

const resolveChannelAgent = (requestedAgentId?: string): BelldandyAgent => {
  if (agentRegistry) {
    try {
      return agentRegistry.create(requestedAgentId);
    } catch (error) {
      logger.warn("channel-router", `Failed to resolve agent "${requestedAgentId ?? "default"}", fallback to default`, error);
      return agentRegistry.create("default");
    }
  }
  if (createAgent) {
    return createAgent();
  }
  throw new Error("No agent available for channel routing");
};

// 9. Start Feishu Channel (if configured)
let feishuChannel: FeishuChannel | undefined;
if (feishuAppId && feishuAppSecret && createAgent) {
  try {
    // 优先使用 agentRegistry + feishuAgentId，fallback 到 createAgent()
    const agent = (agentRegistry && feishuAgentId)
      ? agentRegistry.create(feishuAgentId)
      : createAgent();
    feishuChannel = new FeishuChannel({
      appId: feishuAppId,
      appSecret: feishuAppSecret,
      agent: agent,
      agentId: feishuAgentId,
      defaultAgentId: channelRouterDefaultAgentId,
      router: channelRouter,
      agentResolver: resolveChannelAgent,
      conversationStore: conversationStore, // [PERSISTENCE] Inject store
      initialChatId: (() => {
        try {
          const statePath = path.join(stateDir, "feishu-state.json");
          if (fs.existsSync(statePath)) {
            const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
            if (data.lastChatId) {
              logger.info("feishu", `Loaded persisted chat ID: ${data.lastChatId}`);
              return data.lastChatId;
            }
          }
        } catch (e) {
          logger.error("feishu", "Failed to load state", e);
        }
        return undefined;
      })(),
      onChatIdUpdate: (chatId: string) => {
        try {
          const statePath = path.join(stateDir, "feishu-state.json");
          const data = { lastChatId: chatId, updatedAt: Date.now() };
          fs.writeFileSync(statePath, JSON.stringify(data, null, 2), "utf-8");
          logger.info("feishu", `Persisted chat ID: ${chatId}`);
        } catch (e) {
          logger.error("feishu", "Failed to save state", e);
        }
      },
      sttTranscribe: async (opts) => {
        const result = await transcribeSpeech(opts);
        if (result) logger.info("feishu", `Transcribed audio (${result.durationSec?.toFixed(1) ?? "?"}s) from ${result.provider}`);
        return result;
      },
    });
    // Do not await, start in background
    feishuChannel.start().catch((err: unknown) => {
      logger.error("feishu", "Channel Error", err);
    });
  } catch (e) {
    logger.warn("feishu", "Agent creation failed (likely missing config), skipping Feishu startup.");
  }
} else if ((feishuAppId || feishuAppSecret) && !createAgent) {
  logger.warn("feishu", "Credentials present but no Agent configured (provider not openai?), skipping.");
}

// 9.5 Start QQ Channel (if configured)
let qqChannel: QqChannel | undefined;
if (qqAppId && qqAppSecret && createAgent) {
  try {
    const agent = (agentRegistry && qqAgentId)
      ? agentRegistry.create(qqAgentId)
      : createAgent();
    qqChannel = new QqChannel({
      appId: qqAppId,
      appSecret: qqAppSecret,
      sandbox: qqSandbox,
      agent: agent,
      agentId: qqAgentId,
      defaultAgentId: channelRouterDefaultAgentId,
      router: channelRouter,
      agentResolver: resolveChannelAgent,
      conversationStore: conversationStore,
    });
    // Do not await, start in background
    qqChannel.start().catch((err: unknown) => {
      logger.error("qq", "Channel Error", err);
    });
  } catch (e) {
    logger.warn("qq", "Agent creation failed (likely missing config), skipping QQ startup.");
  }
} else if ((qqAppId || qqAppSecret) && !createAgent) {
  logger.warn("qq", "Credentials present but no Agent configured, skipping.");
}

// 9.5.5 Start Discord Channel (if configured)
let discordChannel: DiscordChannel | undefined;
if (discordEnabled && discordBotToken && createAgent) {
  try {
    const agent = createAgent();
    discordChannel = new DiscordChannel({
      agent: agent,
      botToken: discordBotToken,
      defaultChannelId: discordDefaultChannelId,
      defaultAgentId: channelRouterDefaultAgentId,
      router: channelRouter,
      agentResolver: resolveChannelAgent,
      stateFilePath: path.join(stateDir, "discord-state.json"),
    });
    // Do not await, start in background
    discordChannel.start().catch((err: unknown) => {
      logger.error("discord", "Channel Error", err);
    });
    logger.info("discord", "Discord channel initialized");
  } catch (e) {
    logger.warn("discord", "Failed to initialize Discord channel", e);
  }
} else if (discordEnabled && !discordBotToken) {
  logger.warn("discord", "Discord enabled but BELLDANDY_DISCORD_BOT_TOKEN not set, skipping.");
} else if (discordEnabled && !createAgent) {
  logger.warn("discord", "Discord enabled but no Agent configured, skipping.");
}

// 9.6 Start Community Channel (if configured)
// 只要 community.json 存在且有 endpoint，就创建 CommunityChannel，
// 即使 agents 为空也初始化，这样 join_room 工具可以在运行时动态加入房间。
let communityChannel: CommunityChannel | undefined;
try {
  const communityConfigPath = getCommunityConfigPath();
  if (fs.existsSync(communityConfigPath) && createAgent) {
    const communityConfig = loadCommunityConfig();
    const communityOwnerUserUuid = await extractOwnerUuid(stateDir);
    const communityTokenUsageStrictUuid = String(process.env.BELLDANDY_TOKEN_USAGE_STRICT_UUID ?? "false").toLowerCase() === "true";
    const communityTokenUsageUploadConfig: TokenUsageUploadConfig = {
      enabled: String(process.env.BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED ?? "false").toLowerCase() === "true",
      url: readEnv("BELLDANDY_TOKEN_USAGE_UPLOAD_URL")?.trim() || undefined,
      token:
        readEnv("BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY")?.trim()
        || readEnv("BELLDANDY_TOKEN_USAGE_UPLOAD_TOKEN")?.trim()
        || undefined,
      timeoutMs: Number(readEnv("BELLDANDY_TOKEN_USAGE_UPLOAD_TIMEOUT_MS") ?? "3000") || 3000,
    };
    if (communityTokenUsageUploadConfig.enabled && communityTokenUsageStrictUuid && !communityOwnerUserUuid) {
      logger.warn("community", "Token usage upload is enabled but owner UUID was not found in root IDENTITY.md; community uploads may fail when strict UUID validation is enabled.");
    }
    // community config 的 name 是社区显示名，不是 agent profile ID，直接用默认 agent
    const agent = createAgent();

    communityChannel = new CommunityChannel({
      endpoint: communityConfig.endpoint,
      agents: communityConfig.agents,
      agent: agent,
      conversationStore: conversationStore,
      reconnect: communityConfig.reconnect,
      tokenUsageUpload: communityTokenUsageUploadConfig,
      ownerUserUuid: communityOwnerUserUuid,
    });

    // 注册 leave_room 和 join_room 工具（带 channel 实例）
    if (toolsEnabled) {
      const leaveRoomToolWithChannel = createLeaveRoomTool(communityChannel);
      toolExecutor.registerTool(leaveRoomToolWithChannel, { silentReplace: true });
      logger.info("community", "Registered leave_room tool with channel instance");

      const joinRoomToolWithChannel = createJoinRoomTool(communityChannel);
      toolExecutor.registerTool(joinRoomToolWithChannel, { silentReplace: true });
      logger.info("community", "Registered join_room tool with channel instance");
    }

    // 后台启动（有 agents 配置了 room 时才会实际连接）
    communityChannel.start().catch((err: unknown) => {
      logger.error("community", "Channel Error", err);
    });

    logger.info("community", `Started with ${communityConfig.agents.length} agent(s)`);
  }
} catch (e) {
  logger.warn("community", "Failed to load community config, skipping startup:", e);
}

// 10. Start Heartbeat Runner (if configured)
function parseIntervalMs(raw: string): number {
  const match = /^(\d+)(m|h|s)?$/.exec(raw.trim().toLowerCase());
  if (!match) return 30 * 60 * 1000; // default 30m
  const value = parseInt(match[1], 10);
  const unit = match[2] || "m";
  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    default: return value * 60 * 1000;
  }
}

function parseActiveHours(raw: string | undefined): { start: string; end: string } | undefined {
  if (!raw) return undefined;
  const match = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(raw.trim());
  if (!match) return undefined;
  return { start: match[1], end: match[2] };
}

let heartbeatRunner: HeartbeatRunnerHandle | undefined;
if (heartbeatEnabled && createAgent) {
  try {
    const heartbeatAgent = createAgent();
    const intervalMs = parseIntervalMs(heartbeatIntervalRaw);
    const activeHours = parseActiveHours(heartbeatActiveHoursRaw);

    // Helper to send message to agent and get response
    const sendMessage = async (prompt: string): Promise<string> => {
      let result = "";
      for await (const item of heartbeatAgent.run({
        conversationId: `heartbeat-${Date.now()}`,
        text: prompt,
      })) {
        if (item.type === "delta") {
          result += item.delta;
        } else if (item.type === "final") {
          result = item.text;
        }
      }
      return result;
    };

    // Helper to deliver message to user via Feishu and WebChat
    const deliverToUser = async (message: string): Promise<void> => {
      deliverAutoMessageToResidentChannel({
        conversationStore,
        broadcast: (frame) => server.broadcast(frame),
        agentId: "default",
        text: `❤️ [Heartbeat] ${message}`,
      });

      // 2. Deliver to Feishu (if configured)
      if (feishuChannel) {
        logger.info("heartbeat", "Delivering to user via Feishu...");
        const sent = await feishuChannel.sendProactiveMessage(message);
        if (!sent) {
          logger.warn("heartbeat", "Failed to deliver: No active Feishu chat session (user needs to speak first).");
        }
      } else {
        logger.info("heartbeat", "Broadcasted to local Web clients (Feishu disabled).");
      }
    };

    heartbeatRunner = startHeartbeatRunner({
      intervalMs,
      workspaceDir: stateDir,
      sendMessage,
      deliverToUser,
      activeHours,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isBusy,
      log: (msg) => logger.info("heartbeat", msg),
    });

    logger.info("heartbeat", `enabled (interval=${heartbeatIntervalRaw}, activeHours=${heartbeatActiveHoursRaw ?? "all"})`);
  } catch (e) {
    logger.warn("heartbeat", "Agent creation failed (likely missing config), skipping Heartbeat startup.");
  }
} else if (heartbeatEnabled && !createAgent) {
  logger.warn("heartbeat", "enabled but no Agent configured (provider not openai?), skipping.");
}

// 11. Start Cron Scheduler (if configured)
if (cronEnabled) {
  const activeHours = parseActiveHours(heartbeatActiveHoursRaw); // 复用 Heartbeat 活跃时段

  let cronSendMessage: ((prompt: string) => Promise<string>) | undefined;
  if (createAgent) {
    try {
      const cronAgent = createAgent();
      cronSendMessage = async (prompt: string): Promise<string> => {
        let result = "";
        for await (const item of cronAgent.run({
          conversationId: `cron-${Date.now()}`,
          text: prompt,
        })) {
          if (item.type === "delta") {
            result += item.delta;
          } else if (item.type === "final") {
            result = item.text;
          }
        }
        return result;
      };
    } catch (e) {
      logger.warn("cron", "Agent creation failed; systemEvent cron jobs will be disabled, but structured approval scan jobs remain available.");
    }
  } else {
    logger.info("cron", "No Agent configured; systemEvent cron jobs are disabled, but structured approval scan jobs remain available.");
  }

  const cronDeliverToUser = async (message: string): Promise<void> => {
    deliverAutoMessageToResidentChannel({
      conversationStore,
      broadcast: (frame) => server.broadcast(frame),
      agentId: "default",
      text: message,
    });

    // 2. 推送到飞书（如果配置了）
    if (feishuChannel) {
      logger.info("cron", "Delivering to user via Feishu...");
      const sent = await feishuChannel.sendProactiveMessage(message);
      if (!sent) {
        logger.warn("cron", "Failed to deliver: No active Feishu chat session.");
      }
    } else {
      logger.info("cron", "Broadcasted to local Web clients (Feishu disabled).");
    }
  };

  const runGoalApprovalScan = async (payload: CronGoalApprovalScanPayload): Promise<{ summary: string; notifyMessage?: string }> => {
    const requestedGoalIds = [
      payload.goalId?.trim(),
      ...(payload.goalIds ?? []).map((goalId) => goalId.trim()).filter(Boolean),
    ].filter(Boolean) as string[];
    const listedGoals = payload.allGoals ? await goalManager.listGoals() : [];
    const goalIds = Array.from(new Set([
      ...requestedGoalIds,
      ...listedGoals.map((goal) => goal.id),
    ]));
    if (goalIds.length === 0) {
      return {
        summary: "approval_scan goals=0 ok=0 failed=0 review_overdue=0 review_escalated=0 checkpoint_overdue=0 checkpoint_escalated=0 notifications=0",
      };
    }

    let reviewOverdue = 0;
    let reviewEscalated = 0;
    let checkpointOverdue = 0;
    let checkpointEscalated = 0;
    let notifications = 0;
    const failures: Array<{ goalId: string; error: string }> = [];

    for (const goalId of goalIds) {
      try {
        const result = await goalManager.scanApprovalWorkflows(goalId, {
          autoEscalate: payload.autoEscalate ?? true,
        });
        reviewOverdue += result.reviewResult.overdueCount;
        reviewEscalated += result.reviewResult.escalatedCount;
        checkpointOverdue += result.checkpointItems.filter((item) => item.overdue).length;
        checkpointEscalated += result.checkpointItems.filter((item) => item.escalated).length;
        notifications += result.notifications.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ goalId, error: message });
        logger.warn("cron", `Approval scan failed for goal "${goalId}": ${message}`);
      }
    }

    const summary = [
      `approval_scan goals=${goalIds.length}`,
      `ok=${goalIds.length - failures.length}`,
      `failed=${failures.length}`,
      `review_overdue=${reviewOverdue}`,
      `review_escalated=${reviewEscalated}`,
      `checkpoint_overdue=${checkpointOverdue}`,
      `checkpoint_escalated=${checkpointEscalated}`,
      `notifications=${notifications}`,
    ].join(" ");
    const shouldNotify = failures.length > 0
      || reviewOverdue > 0
      || reviewEscalated > 0
      || checkpointOverdue > 0
      || checkpointEscalated > 0
      || notifications > 0;
    const notifyMessage = shouldNotify
      ? [
        `审批扫描完成：${summary}`,
        failures.length > 0 ? `失败目标：${failures.map((item) => item.goalId).join(", ")}` : "",
      ].filter(Boolean).join("\n")
      : undefined;
    return { summary, notifyMessage };
  };

  cronSchedulerHandle = startCronScheduler({
    store: cronStore,
    sendMessage: cronSendMessage,
    runGoalApprovalScan,
    deliverToUser: cronDeliverToUser,
    activeHours,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isBusy,
    log: (msg) => logger.info("cron", msg),
  });

  logger.info(
    "cron",
    `scheduler enabled (activeHours=${heartbeatActiveHoursRaw ?? "all"}, systemEvent=${cronSendMessage ? "enabled" : "disabled"}, structured=goalApprovalScan)`
  );
} else {
  logger.info("cron", "scheduler disabled (set BELLDANDY_CRON_ENABLED=true to enable)");
}

// 12. Start Browser Relay (if configured)
const browserRelayEnabled = readEnv("BELLDANDY_BROWSER_RELAY_ENABLED") === "true";
const browserRelayPort = Number(readEnv("BELLDANDY_RELAY_PORT") ?? "28892");

if (browserRelayEnabled) {
  const relayLogger = logger.child("browser-relay");
  const relay = new RelayServer(browserRelayPort, relayLogger);
  // Do not await, start in background
  relay.start().then(() => {
    logger.info("browser-relay", `enabled (port=${browserRelayPort})`);
  }).catch((err: unknown) => {
    logger.error("browser-relay", "Relay Error", err);
  });
}

// 12. 监听 .env / .env.local 文件变更，自动触发重启
// 配合 launcher.ts 使用：exit(100) 会被 launcher 捕获并重新启动 gateway
{
  const WATCH_DIR = envFiles.envDir;
  const WATCH_FILES = new Set([
    path.basename(envFiles.envPath),
    path.basename(envFiles.envLocalPath),
  ]);
  const DEBOUNCE_MS = 1500; // 防抖间隔，避免保存时多次触发
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerRestart = (fileName: string) => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      logger.info("config-watcher", `检测到 ${fileName} 变更，正在重启服务...`);
      // 广播通知所有 WebSocket 客户端
      server.broadcast({
        type: "event",
        event: "agent.status",
        payload: { status: "restarting", reason: `${fileName} changed` },
      });
      // 延迟 300ms 让广播发出后再退出
      setTimeout(() => process.exit(100), 300);
    }, DEBOUNCE_MS);
  };

  // 监听目录而非具体文件：解决 .env.local 在启动时不存在（新建时也能被检测到）
  try {
    fs.watch(WATCH_DIR, (eventType: string, fileName: string | Buffer | null) => {
      const normalizedFileName = typeof fileName === "string" ? fileName : fileName?.toString();
      if (normalizedFileName && WATCH_FILES.has(normalizedFileName) && (eventType === "rename" || eventType === "change")) {
        triggerRestart(normalizedFileName);
      }
    });
    logger.info("config-watcher", `监听 .env 变更`);
    logger.info("config-watcher", `监听 .env.local 变更`);
  } catch {
    // 无法监听目录时降级为逐个文件监听
    for (const name of WATCH_FILES) {
      const envFile = path.join(WATCH_DIR, name);
      try {
        if (fs.existsSync(envFile)) {
          fs.watch(envFile, (eventType) => {
            if (eventType === "change") triggerRestart(name);
          });
        }
      } catch {
        // 跳过
      }
    }
  }
}

