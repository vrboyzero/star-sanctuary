import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { EnvDirSource } from "@star-sanctuary/distribution";

import type {
  AgentRegistry,
  CompactionRuntimeReport,
  ConversationStore,
  SessionTimelineProjection,
  SessionTranscriptExportBundle,
} from "@belldandy/agent";
import type { GatewayReqFrame, GatewayResFrame } from "@belldandy/protocol";
import {
  DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
  DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
  getGlobalMemoryManager,
  type DreamRuntime,
  type DurableExtractionRuntime,
} from "@belldandy/memory";
import type {
  ToolExecutionRuntimeContext,
  ToolExecutor,
  SkillRegistry,
} from "@belldandy/skills";
import {
  buildCameraRuntimeDoctorReport,
  listToolContractsV2,
  TOOL_SETTINGS_CONTROL_NAME,
} from "@belldandy/skills";
import type { PluginRegistry } from "@belldandy/plugins";

import type { BackgroundContinuationRuntimeDoctorReport } from "../background-continuation-runtime.js";
import {
  buildAssistantModeRuntimeReport,
  type AssistantModeRuntimeReport,
  DEFAULT_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE,
  parseAssistantExternalDeliveryPreference,
} from "../assistant-mode-runtime.js";
import { buildChannelSecurityDoctorReport } from "../channel-security-doctor.js";
import {
  applyTimelineProjectionFilter,
  applyTranscriptExportProjection,
  normalizeConversationIdPrefix,
  normalizeTimelineKinds,
  normalizeTranscriptEventTypes,
  normalizeTranscriptRestoreView,
  parsePositiveInteger,
} from "../conversation-debug-projection.js";
import { listRecentConversationExports } from "../conversation-export-index.js";
import type { CronRuntimeDoctorReport } from "../cron/observability.js";
import { buildAssistantModeGoalRuntimeSummary } from "../assistant-mode-goals.js";
import { buildBridgeRecoveryDiagnostics } from "../bridge-recovery-diagnostics.js";
import { buildDeploymentBackendsDoctorReport } from "../deployment-backends.js";
import { buildExtensionGovernanceReport } from "../extension-governance.js";
import { loadExtensionMarketplaceState } from "../extension-marketplace-state.js";
import type { ExtensionHostState } from "../extension-host.js";
import { buildExtensionRuntimeReport } from "../extension-runtime.js";
import {
  buildExternalOutboundDoctorReport,
  type ExternalOutboundDoctorReport,
} from "../external-outbound-doctor.js";
import type { ExternalOutboundAuditStore } from "../external-outbound-audit-store.js";
import type { ExternalOutboundConfirmationStore } from "../external-outbound-confirmation-store.js";
import {
  buildEmailOutboundDoctorReport,
  type EmailOutboundDoctorReport,
} from "../email-outbound-doctor.js";
import type { EmailOutboundAuditStore } from "../email-outbound-audit-store.js";
import {
  buildEmailInboundDoctorReport,
  type EmailInboundDoctorReport,
} from "../email-inbound-doctor.js";
import type { EmailInboundAuditStore } from "../email-inbound-audit-store.js";
import type { EmailFollowUpReminderStore } from "../email-follow-up-reminder-store.js";
import { buildLearningReviewInput } from "../learning-review-input.js";
import { buildLearningReviewNudgeRuntimeReport } from "../learning-review-nudge-runtime.js";
import type {
  MemoryRuntimeBudgetGuard,
  RateLimitState,
  SlidingWindowRateLimiter,
} from "../memory-runtime-budget.js";
import { buildMemoryRuntimeDoctorReport } from "../memory-runtime-introspection.js";
import { buildMindProfileSnapshot } from "../mind-profile-snapshot.js";
import { buildPromptObservabilitySummary, formatPromptObservabilityHeadline, toPromptObservabilityView } from "../prompt-observability.js";
import { buildAgentRoster } from "../query-runtime-agent-roster.js";
import type { QueryRuntimeTraceStore } from "../query-runtime-trace.js";
import type { ScopedMemoryManagerRecord } from "../resident-memory-managers.js";
import { buildResidentAgentObservabilitySnapshot } from "../resident-agent-observability.js";
import { ResidentAgentRuntimeRegistry } from "../resident-agent-runtime.js";
import { resolveResidentStateBindingViewForAgent } from "../resident-state-binding.js";
import { buildOptionalCapabilitiesDoctorReport } from "../optional-capabilities-doctor.js";
import type { RuntimeResilienceDoctorReport } from "../runtime-resilience.js";
import { buildRuntimeResilienceDiagnosticSummary } from "../runtime-resilience-diagnostics.js";
import {
  buildSkillFreshnessSnapshot,
} from "../skill-freshness.js";
import { buildDelegationObservabilitySnapshot } from "../subtask-result-envelope.js";
import type { SubTaskRuntimeStore } from "../task-runtime.js";
import { buildToolBehaviorObservability, readConfiguredPromptExperimentToolContracts } from "../tool-behavior-observability.js";
import { buildToolContractV2Observability } from "../tool-contract-v2-observability.js";
import type { ToolsConfigManager } from "../tools-config.js";
import { buildAgentLaunchExplainability } from "../agent-launch-explainability.js";
import type { GoalManager } from "../goals/manager.js";
import type { ObsidianCommonsRuntime } from "../obsidian-commons-runtime.js";

type SystemDoctorMethodContext = {
  stateDir: string;
  envDir?: string;
  envSource?: EnvDirSource;
  agentFactory: () => unknown;
  agentRegistry?: AgentRegistry;
  conversationStore: ConversationStore;
  durableExtractionRuntime?: DurableExtractionRuntime;
  memoryBudgetGuard: MemoryRuntimeBudgetGuard;
  durableExtractionRequestRateLimiter: SlidingWindowRateLimiter;
  toolsConfigManager?: ToolsConfigManager;
  toolExecutor?: ToolExecutor;
  externalOutboundAuditStore?: ExternalOutboundAuditStore;
  externalOutboundConfirmationStore?: ExternalOutboundConfirmationStore;
  emailOutboundAuditStore?: EmailOutboundAuditStore;
  emailInboundAuditStore?: EmailInboundAuditStore;
  emailFollowUpReminderStore?: EmailFollowUpReminderStore;
  pluginRegistry?: PluginRegistry;
  extensionHost?: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle">;
  skillRegistry?: SkillRegistry;
  getCompactionRuntimeReport?: () => CompactionRuntimeReport | undefined;
  getRuntimeResilienceReport?: () => RuntimeResilienceDoctorReport | undefined;
  queryRuntimeTraceStore: QueryRuntimeTraceStore;
  residentAgentRuntime: ResidentAgentRuntimeRegistry;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  getCronRuntimeDoctorReport?: () => Promise<CronRuntimeDoctorReport | undefined>;
  getBackgroundContinuationRuntimeDoctorReport?: () => Promise<BackgroundContinuationRuntimeDoctorReport | undefined>;
  resolveDreamRuntime?: (agentId?: string) => DreamRuntime | null;
  resolveDreamDefaultConversationId?: (agentId?: string) => string;
  resolveCommonsExportRuntime?: () => ObsidianCommonsRuntime | null;
  inspectAgentPrompt?: (input: {
    agentId?: string;
    conversationId?: string;
    runId?: string;
  }) => Promise<any>;
  subTaskRuntimeStore?: SubTaskRuntimeStore;
  goalManager?: GoalManager;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function resolveDoctorEnvSource(
  envDir: string,
  stateDir: string,
  envSource?: EnvDirSource,
): EnvDirSource {
  if (
    envSource === "explicit"
    || envSource === "installed_source"
    || envSource === "legacy_root"
    || envSource === "state_dir"
  ) {
    return envSource;
  }
  return path.resolve(envDir) === path.resolve(stateDir) ? "state_dir" : "legacy_root";
}

function buildConfigSourceDoctorReport(ctx: Pick<SystemDoctorMethodContext, "envDir" | "envSource" | "stateDir">) {
  const envDir = path.resolve(ctx.envDir ?? ctx.stateDir);
  const stateDir = path.resolve(ctx.stateDir);
  const source = resolveDoctorEnvSource(envDir, stateDir, ctx.envSource);
  const stateDirActive = source === "state_dir";
  const projectRootWins = source === "legacy_root";
  const sourceLabel = (() => {
    switch (source) {
      case "explicit":
        return "explicit env dir";
      case "installed_source":
        return "installed runtime env";
      case "legacy_root":
        return "legacy project-root env";
      case "state_dir":
      default:
        return "state-dir config";
    }
  })();
  const headline = (() => {
    switch (source) {
      case "explicit":
        return `Using explicit env dir ${envDir}; it overrides both project-root and state-dir config.`;
      case "installed_source":
        return `Using installed runtime env dir ${envDir}; this packaged runtime config takes precedence over project-root and state-dir defaults.`;
      case "legacy_root":
        return `Using legacy project-root env files from ${envDir}; state-dir config at ${stateDir} is currently inactive.`;
      case "state_dir":
      default:
        return `Using state-dir config from ${stateDir}; no higher-priority env dir is currently active.`;
    }
  })();

  return {
    envDir,
    stateDir,
    source,
    sourceLabel,
    stateDirActive,
    projectRootWins,
    resolutionOrder: [
      "explicit env dir (STAR_SANCTUARY_ENV_DIR / BELLDANDY_ENV_DIR)",
      "installed runtime env dir from install-info.json",
      "legacy project-root .env / .env.local",
      "state-dir config",
    ],
    headline,
    migrationHint: source === "legacy_root"
      ? "Run 'bdd config migrate-to-state-dir' when you are ready to switch away from project-root env files."
      : undefined,
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

function extractDreamAgentId(params: Record<string, unknown>): string {
  if (typeof params.dreamAgentId === "string" && params.dreamAgentId.trim()) {
    return params.dreamAgentId.trim();
  }
  return extractScopedMemoryAgentId(params) ?? "default";
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

async function buildScopedSkillFreshnessSnapshot(
  stateDir: string,
  manager: ReturnType<typeof resolveScopedMemoryManager>,
) {
  return buildSkillFreshnessSnapshot({
    manager,
    stateDir,
  });
}

async function buildDreamRuntimeDoctorReport(
  ctx: Pick<SystemDoctorMethodContext, "resolveDreamRuntime" | "resolveDreamDefaultConversationId">,
  params: Record<string, unknown>,
) {
  if (typeof ctx.resolveDreamRuntime !== "function") {
    return undefined;
  }
  const agentId = extractDreamAgentId(params);
  const defaultConversationId = typeof ctx.resolveDreamDefaultConversationId === "function"
    ? ctx.resolveDreamDefaultConversationId(agentId)
    : undefined;
  const runtime = ctx.resolveDreamRuntime(agentId);
  if (!runtime) {
    return {
      requested: {
        agentId,
        defaultConversationId: defaultConversationId ?? null,
      },
      availability: {
        enabled: false,
        available: false,
        reason: "dream runtime unavailable",
      },
      state: null,
      latestRun: null,
      autoSummary: null,
      headline: `Dream runtime is unavailable for agent ${agentId}.`,
    };
  }

  const state = await runtime.getState();
  const latestRun = state.recentRuns[0] ?? null;
  const availability = runtime.getAvailability();
  const autoSummary = state.lastAutoTrigger
    ? {
        triggerMode: state.lastAutoTrigger.triggerMode,
        attemptedAt: state.lastAutoTrigger.attemptedAt,
        executed: state.lastAutoTrigger.executed,
        ...(state.lastAutoTrigger.runId ? { runId: state.lastAutoTrigger.runId } : {}),
        ...(state.lastAutoTrigger.status ? { status: state.lastAutoTrigger.status } : {}),
        ...(state.lastAutoTrigger.skipCode ? { skipCode: state.lastAutoTrigger.skipCode } : {}),
        ...(state.lastAutoTrigger.signalGateCode ? { signalGateCode: state.lastAutoTrigger.signalGateCode } : {}),
        ...(state.lastAutoTrigger.skipReason ? { skipReason: state.lastAutoTrigger.skipReason } : {}),
        ...(state.lastAutoTrigger.signal ? { signal: { ...state.lastAutoTrigger.signal } } : {}),
        ...(state.cooldownUntil ? { cooldownUntil: state.cooldownUntil } : {}),
        ...(state.failureBackoffUntil ? { failureBackoffUntil: state.failureBackoffUntil } : {}),
      }
    : null;
  const headline = !availability.available
    ? `Dream runtime is blocked: ${availability.reason ?? "unknown reason"}.`
    : latestRun?.status === "failed"
      ? `Latest dream failed at ${latestRun.finishedAt ?? latestRun.requestedAt ?? "-"}.`
      : latestRun
        ? `Latest dream ${latestRun.status} at ${latestRun.finishedAt ?? latestRun.requestedAt ?? "-"}.`
        : "Dream runtime is ready and has no runs yet.";

  return {
    requested: {
      agentId,
      defaultConversationId: defaultConversationId ?? null,
    },
    availability,
    state,
    latestRun,
    autoSummary,
    headline,
  };
}

async function buildDreamCommonsDoctorReport(
  ctx: Pick<SystemDoctorMethodContext, "resolveCommonsExportRuntime">,
) {
  if (typeof ctx.resolveCommonsExportRuntime !== "function") {
    return undefined;
  }
  const runtime = ctx.resolveCommonsExportRuntime();
  if (!runtime) {
    return {
      availability: {
        enabled: false,
        available: false,
        reason: "commons export runtime unavailable",
      },
      state: null,
      headline: "Commons export runtime is unavailable.",
    };
  }
  const availability = runtime.getAvailability();
  const state = await runtime.getState();
  const headline = !availability.available
    ? `Commons export is blocked: ${availability.reason ?? "unknown reason"}.`
    : state.status === "failed"
      ? `Commons export failed at ${state.lastFailureAt ?? state.updatedAt}.`
      : state.lastSuccessAt
        ? `Commons export last completed at ${state.lastSuccessAt}.`
        : "Commons export is ready and has no runs yet.";
  return {
    availability,
    state,
    headline,
  };
}

export async function handleSystemDoctorMethod(
  req: GatewayReqFrame,
  ctx: SystemDoctorMethodContext,
): Promise<GatewayResFrame | null> {
  if (req.method !== "system.doctor") return null;

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
  type MCPDoctorDiagnostics = NonNullable<Awaited<ReturnType<typeof import("../mcp/index.js")["getMCPDiagnostics"]>>> & {
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

  const configSource = buildConfigSourceDoctorReport(ctx);
  checks.push({
    id: "config_source",
    name: "Config Source",
    status: configSource.source === "legacy_root" ? "warn" : "pass",
    message: configSource.headline,
  });

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
  const optionalCapabilities = await buildOptionalCapabilitiesDoctorReport();
  const cameraRuntime = await buildCameraRuntimeDoctorReport({
    context: {
      conversationId: "system.doctor",
      workspaceRoot: process.cwd(),
      stateDir: ctx.stateDir,
    },
  });
  const runtimeResilience = ctx.getRuntimeResilienceReport?.();
  const runtimeResilienceDiagnostics = runtimeResilience
    ? buildRuntimeResilienceDiagnosticSummary(runtimeResilience)
    : undefined;
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
  let emailOutboundRuntime: EmailOutboundDoctorReport | undefined;
  let emailInboundRuntime: EmailInboundDoctorReport | undefined;
  let assistantModeRuntime: AssistantModeRuntimeReport | undefined;
  let goalRuntimeSummary: Awaited<ReturnType<typeof buildAssistantModeGoalRuntimeSummary>> | undefined;
  const dreamRuntime = await buildDreamRuntimeDoctorReport(ctx, params);
  const dreamCommons = await buildDreamCommonsDoctorReport(ctx);
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
          confirmationStore: ctx.externalOutboundConfirmationStore,
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
  try {
    if (ctx.emailOutboundAuditStore) {
      emailOutboundRuntime = await buildEmailOutboundDoctorReport({
        auditStore: ctx.emailOutboundAuditStore,
        requireConfirmation: String(process.env.BELLDANDY_EMAIL_OUTBOUND_REQUIRE_CONFIRMATION ?? "true").trim().toLowerCase() !== "false",
      });
    }
  } catch (error) {
    checks.push({
      id: "email_outbound_runtime",
      name: "Email Outbound Runtime",
      status: "warn",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    if (ctx.emailInboundAuditStore) {
      emailInboundRuntime = await buildEmailInboundDoctorReport({
        auditStore: ctx.emailInboundAuditStore,
        enabled: String(process.env.BELLDANDY_EMAIL_IMAP_ENABLED ?? "false").trim().toLowerCase() === "true",
        host: process.env.BELLDANDY_EMAIL_IMAP_HOST,
        username: process.env.BELLDANDY_EMAIL_IMAP_USER,
        password: process.env.BELLDANDY_EMAIL_IMAP_PASS,
        accountId: process.env.BELLDANDY_EMAIL_IMAP_ACCOUNT_ID,
        mailbox: process.env.BELLDANDY_EMAIL_IMAP_MAILBOX,
        requestedAgentId: process.env.BELLDANDY_EMAIL_INBOUND_AGENT_ID,
        port: Number(process.env.BELLDANDY_EMAIL_IMAP_PORT ?? "993"),
        secure: String(process.env.BELLDANDY_EMAIL_IMAP_SECURE ?? "true").trim().toLowerCase() !== "false",
        pollIntervalMs: Number(process.env.BELLDANDY_EMAIL_IMAP_POLL_INTERVAL_MS ?? "60000"),
        connectTimeoutMs: Number(process.env.BELLDANDY_EMAIL_IMAP_CONNECT_TIMEOUT_MS ?? "10000"),
        socketTimeoutMs: Number(process.env.BELLDANDY_EMAIL_IMAP_SOCKET_TIMEOUT_MS ?? "20000"),
        bootstrapMode: String(process.env.BELLDANDY_EMAIL_IMAP_BOOTSTRAP_MODE ?? "latest").trim().toLowerCase() === "all"
          ? "all"
          : "latest",
        recentWindowLimit: Number(process.env.BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT ?? "0"),
      });
    }
  } catch (error) {
    checks.push({
      id: "email_inbound_runtime",
      name: "Email Inbound Runtime",
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
      const mcpModule = await import("../mcp/index.js");
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
  checks.push({
    id: "optional_capabilities",
    name: "Optional Capabilities",
    status: optionalCapabilities.summary.warnCount > 0 ? "warn" : "pass",
    message: optionalCapabilities.summary.headline,
  });
  if (cameraRuntime) {
    checks.push({
      id: "camera_runtime",
      name: "Camera Runtime",
      status: cameraRuntime.summary.errorCount > 0
        ? "warn"
        : cameraRuntime.summary.warningCount > 0
          ? "warn"
          : "pass",
      message: cameraRuntime.summary.headline,
    });
  }
  if (runtimeResilienceDiagnostics) {
    checks.push({
      id: "runtime_resilience",
      name: "Runtime Resilience",
      status: runtimeResilienceDiagnostics.alertLevel,
      message: `${runtimeResilienceDiagnostics.alertCode}: ${runtimeResilienceDiagnostics.alertMessage}`,
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
  if (emailOutboundRuntime) {
    checks.push({
      id: "email_outbound_runtime",
      name: "Email Outbound Runtime",
      status: emailOutboundRuntime.totals.failedCount > 0 || !emailOutboundRuntime.requireConfirmation
        ? "warn"
        : "pass",
      message: emailOutboundRuntime.headline,
    });
  }
  if (emailInboundRuntime) {
    checks.push({
      id: "email_inbound_runtime",
      name: "Email Inbound Runtime",
      status: emailInboundRuntime.totals.failedCount > 0 || !emailInboundRuntime.setup.runtimeExpected
        ? "warn"
        : "pass",
      message: emailInboundRuntime.headline,
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

  let conversationDebug: Record<string, unknown> | undefined;
  let conversationCatalog: Record<string, unknown> | undefined;
  let recentConversationExports: Record<string, unknown> | undefined;
  let promptObservability: Record<string, unknown> | undefined;
  let toolBehaviorObservability: Record<string, unknown> | undefined;
  let toolContractV2Observability: Record<string, unknown> | undefined;
  let residentAgents: any;
  let mindProfileSnapshot: any;
  let learningReviewInput: any;
  let learningReviewNudgeRuntime: any;
  let skillFreshness: any;
  let delegationObservability: any;
  let bridgeRecoveryDiagnostics: any;

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

  if (ctx.subTaskRuntimeStore) {
    const subtaskItems = await ctx.subTaskRuntimeStore.listTasks(undefined, { includeArchived: true });
    delegationObservability = buildDelegationObservabilitySnapshot(subtaskItems);
  }
  goalRuntimeSummary = await buildAssistantModeGoalRuntimeSummary({
    goalReader: ctx.goalManager,
  });

  assistantModeRuntime = buildAssistantModeRuntimeReport({
    assistantModeEnabled: (() => {
      const raw = process.env.BELLDANDY_ASSISTANT_MODE_ENABLED;
      if (typeof raw !== "string" || !raw.trim()) return undefined;
      return raw.trim().toLowerCase() === "true";
    })(),
    assistantModeConfigured: typeof process.env.BELLDANDY_ASSISTANT_MODE_ENABLED === "string"
      && Boolean(process.env.BELLDANDY_ASSISTANT_MODE_ENABLED.trim()),
    heartbeatEnabled: String(process.env.BELLDANDY_HEARTBEAT_ENABLED ?? "false").trim().toLowerCase() === "true",
    heartbeatInterval: process.env.BELLDANDY_HEARTBEAT_INTERVAL,
    heartbeatActiveHours: process.env.BELLDANDY_HEARTBEAT_ACTIVE_HOURS,
    cronEnabled: String(process.env.BELLDANDY_CRON_ENABLED ?? "false").trim().toLowerCase() === "true",
    cronRuntime,
    backgroundContinuationRuntime,
    externalOutboundRuntime,
    residentAgents,
    delegationObservability,
    goals: goalRuntimeSummary,
    externalOutboundRequireConfirmation: String(process.env.BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION ?? "true").trim().toLowerCase() !== "false",
    externalDeliveryPreference: parseAssistantExternalDeliveryPreference(
      process.env.BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE
        ?? DEFAULT_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE,
    ),
  });
  if (assistantModeRuntime) {
    checks.push({
      id: "assistant_mode",
      name: "Assistant Mode",
      status: assistantModeRuntime.status === "attention" || assistantModeRuntime.status === "disabled"
        ? "warn"
        : "pass",
      message: assistantModeRuntime.headline,
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

  if (delegationObservability) {
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
    bridgeRecoveryDiagnostics = visibilityTask
      ? buildBridgeRecoveryDiagnostics({
          toolExecutor: ctx.toolExecutor,
          task: visibilityTask,
          agentId: visibilityAgentId,
          conversationId: visibilityConversationId,
        })
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
    if (bridgeRecoveryDiagnostics) {
      checks.push({
        id: "bridge_recovery_diagnostics",
        name: "Bridge Recovery",
        status: bridgeRecoveryDiagnostics.status === "allowed" ? "pass" : "warn",
        message: bridgeRecoveryDiagnostics.headline,
      });
    }
    toolBehaviorObservability = {
      requested: {
        ...(toolAgentId ? { agentId: toolAgentId } : {}),
        ...(toolConversationId ? { conversationId: toolConversationId } : {}),
        ...(toolTaskId ? { taskId: toolTaskId } : {}),
      },
      visibilityContext: {
        agentId: visibilityAgentId ?? "default",
        conversationId: visibilityConversationId ?? null,
        ...(bridgeRecoveryDiagnostics ? { bridgeRecoveryDiagnostics } : {}),
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
        ...(bridgeRecoveryDiagnostics ? { bridgeRecoveryDiagnostics } : {}),
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
      configSource,
      memoryRuntime,
      deploymentBackends,
      optionalCapabilities,
      ...(cameraRuntime ? { cameraRuntime } : {}),
      ...(runtimeResilience ? { runtimeResilience } : {}),
      ...(runtimeResilienceDiagnostics ? { runtimeResilienceDiagnostics } : {}),
      extensionRuntime,
      extensionMarketplace,
      extensionGovernance,
      queryRuntime,
      ...(cronRuntime ? { cronRuntime } : {}),
      ...(backgroundContinuationRuntime ? { backgroundContinuationRuntime } : {}),
      ...(externalOutboundRuntime ? { externalOutboundRuntime } : {}),
      ...(emailOutboundRuntime ? { emailOutboundRuntime } : {}),
      ...(emailInboundRuntime ? { emailInboundRuntime } : {}),
      ...(assistantModeRuntime ? { assistantModeRuntime } : {}),
      mcpRuntime,
      ...(channelSecurity.items.length ? { channelSecurity } : {}),
      ...(promptObservability ? { promptObservability } : {}),
      ...(toolBehaviorObservability ? { toolBehaviorObservability } : {}),
      ...(toolContractV2Observability ? { toolContractV2Observability } : {}),
      ...(bridgeRecoveryDiagnostics ? { bridgeRecoveryDiagnostics } : {}),
      ...(residentAgents ? { residentAgents } : {}),
        ...(mindProfileSnapshot ? { mindProfileSnapshot } : {}),
        ...(learningReviewInput ? { learningReviewInput } : {}),
        ...(dreamRuntime ? { dreamRuntime } : {}),
        ...(dreamCommons ? { dreamCommons } : {}),
        ...(learningReviewNudgeRuntime ? { learningReviewNudgeRuntime } : {}),
      ...(skillFreshness ? { skillFreshness } : {}),
      ...(delegationObservability ? { delegationObservability } : {}),
      ...(conversationDebug ? { conversationDebug } : {}),
      ...(conversationCatalog ? { conversationCatalog } : {}),
      ...(recentConversationExports ? { recentConversationExports } : {}),
    },
  };
}
