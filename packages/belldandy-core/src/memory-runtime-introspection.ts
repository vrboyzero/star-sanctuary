import type { ConversationStore } from "@belldandy/agent";
import {
  buildTeamSharedMemoryReadinessReport,
  type TeamSharedMemoryReadinessReport,
  ConversationMemoryExtractionSupport,
  ConversationMemoryExtractionSupportReasonCode,
  DurableMemoryGuidance,
  DurableExtractionRuntime,
  getDurableExtractionSurfacePolicy,
} from "@belldandy/memory";

import type { RateLimitState } from "./memory-runtime-budget.js";

export type MemoryRuntimePermissionSurface = {
  id: "main_thread" | "session_digest" | "durable_extraction";
  runtime: "main-thread" | "background-runtime";
  mode: "tool-executor" | "internal-restricted";
  summary: string;
  allowedCapabilities: string[];
  blockedCapabilities: string[];
};

export type MemoryRuntimeAvailability = {
  enabled: boolean;
  available: boolean;
  reasonCodes: ConversationMemoryExtractionSupportReasonCode[];
  reasonMessages: string[];
  model?: string;
  minMessages?: number;
  hasBaseUrl?: boolean;
  hasApiKey?: boolean;
};

export type MemoryRuntimeDoctorReport = {
  sharedMemory: TeamSharedMemoryReadinessReport;
  sessionDigest: {
    availability: MemoryRuntimeAvailability;
    permissionSurface: MemoryRuntimePermissionSurface;
    rateLimit: RateLimitState;
  };
  durableExtraction: {
    availability: MemoryRuntimeAvailability;
    permissionSurface: MemoryRuntimePermissionSurface;
    guidance?: DurableMemoryGuidance;
    rateLimit: {
      request: RateLimitState;
      run: RateLimitState;
    };
  };
  mainThreadToolSurface: MemoryRuntimePermissionSurface;
};

export function buildMainThreadToolSurface(): MemoryRuntimePermissionSurface {
  return {
    id: "main_thread",
    runtime: "main-thread",
    mode: "tool-executor",
    summary: "Main conversation requests run through ToolExecutor, ToolContract, security matrix, launch role policy, and permissionMode.",
    allowedCapabilities: [
      "Registered builtin / MCP / plugin / skill tools after ToolContract and security checks",
      "Launch policy enforcement via toolSet -> role policy -> permissionMode",
      "Tool visibility and approval flow through tool settings policy",
    ],
    blockedCapabilities: [
      "No implicit bypass into memory runtime internals",
      "Background durable extraction does not inherit the main-thread tool surface",
    ],
  };
}

export function buildSessionDigestPermissionSurface(): MemoryRuntimePermissionSurface {
  return {
    id: "session_digest",
    runtime: "main-thread",
    mode: "internal-restricted",
    summary: "Session digest refresh is an internal runtime path, not a free-form tool execution surface.",
    allowedCapabilities: [
      "Read conversation history and compaction state",
      "Refresh digest state via ConversationStore",
      "Broadcast digest updates to clients",
    ],
    blockedCapabilities: [
      "No ToolExecutor builtin / MCP / plugin / skill invocation",
      "No arbitrary workspace or shell side effects outside session state",
    ],
  };
}

export function buildDurableExtractionPermissionSurface(): MemoryRuntimePermissionSurface {
  const surface = getDurableExtractionSurfacePolicy();
  return {
    id: "durable_extraction",
    runtime: "background-runtime",
    mode: "internal-restricted",
    summary: surface.summary,
    allowedCapabilities: surface.allowedCapabilities,
    blockedCapabilities: surface.blockedCapabilities,
  };
}

export function getSessionDigestAvailability(conversationStore?: ConversationStore): MemoryRuntimeAvailability {
  if (!conversationStore) {
    return {
      enabled: false,
      available: false,
      reasonCodes: ["manager_unavailable"],
      reasonMessages: ["Conversation store is not available."],
    };
  }
  return {
    enabled: true,
    available: true,
    reasonCodes: [],
    reasonMessages: [],
  };
}

export function getDurableExtractionAvailability(
  durableExtractionRuntime?: DurableExtractionRuntime,
): MemoryRuntimeAvailability {
  const support = durableExtractionRuntime?.getAvailability();
  if (!support) {
    return {
      enabled: false,
      available: false,
      reasonCodes: ["manager_unavailable"],
      reasonMessages: ["Durable extraction runtime is not initialized because the memory manager is unavailable."],
    };
  }
  return toAvailability(support);
}

export async function buildMemoryRuntimeDoctorReport(input: {
  conversationStore?: ConversationStore;
  durableExtractionRuntime?: DurableExtractionRuntime;
  stateDir?: string;
  teamSharedMemoryEnabled?: boolean;
  sessionDigestRateLimit: Promise<RateLimitState> | RateLimitState;
  durableExtractionRequestRateLimit: Promise<RateLimitState> | RateLimitState;
  durableExtractionRunRateLimit: Promise<RateLimitState> | RateLimitState;
}): Promise<MemoryRuntimeDoctorReport> {
  const [
    sessionDigestRateLimit,
    durableExtractionRequestRateLimit,
    durableExtractionRunRateLimit,
    sharedMemory,
  ] = await Promise.all([
    input.sessionDigestRateLimit,
    input.durableExtractionRequestRateLimit,
    input.durableExtractionRunRateLimit,
    input.stateDir
      ? buildTeamSharedMemoryReadinessReport({
        stateDir: input.stateDir,
        enabled: input.teamSharedMemoryEnabled,
      })
      : Promise.resolve({
        enabled: false,
        available: false,
        reasonCodes: ["state_dir_unavailable"],
        reasonMessages: ["State directory is not available for team shared memory readiness."],
        scope: {
          relativeRoot: "team-memory",
          rootPath: "",
          mainMemoryPath: "",
          dailyMemoryDirPath: "",
          fileCount: 0,
          hasMainMemory: false,
          dailyCount: 0,
        },
        secretGuard: {
          enabled: true as const,
          scanner: "curated-high-confidence" as const,
          ruleCount: 0,
          summary: "Team shared memory readiness is unavailable because stateDir is missing.",
        },
        syncPolicy: {
          status: "planned" as const,
          scope: "repo-local-shared-memory" as const,
          deltaSync: {
            enabled: true as const,
            mode: "checksum-delta" as const,
            summary: "Unavailable because stateDir is missing.",
          },
          conflictPolicy: {
            mode: "local-write-wins-per-entry" as const,
            maxConflictRetries: 2,
            summary: "Unavailable because stateDir is missing.",
          },
          deletionPolicy: {
            propagatesDeletes: false as const,
            summary: "Unavailable because stateDir is missing.",
          },
          suppressionPolicy: {
            enabled: true as const,
            summary: "Unavailable because stateDir is missing.",
          },
        },
      }),
  ]);

  return {
    sharedMemory,
    sessionDigest: {
      availability: getSessionDigestAvailability(input.conversationStore),
      permissionSurface: buildSessionDigestPermissionSurface(),
      rateLimit: sessionDigestRateLimit,
    },
    durableExtraction: {
      availability: getDurableExtractionAvailability(input.durableExtractionRuntime),
      permissionSurface: buildDurableExtractionPermissionSurface(),
      guidance: input.durableExtractionRuntime?.getPolicySummary(),
      rateLimit: {
        request: durableExtractionRequestRateLimit,
        run: durableExtractionRunRateLimit,
      },
    },
    mainThreadToolSurface: buildMainThreadToolSurface(),
  };
}

function toAvailability(support: ConversationMemoryExtractionSupport): MemoryRuntimeAvailability {
  return {
    enabled: support.enabled,
    available: support.available,
    reasonCodes: support.reasons.map((item) => item.code),
    reasonMessages: support.reasons.map((item) => item.message),
    model: support.model,
    minMessages: support.minMessages,
    hasBaseUrl: support.hasBaseUrl,
    hasApiKey: support.hasApiKey,
  };
}
