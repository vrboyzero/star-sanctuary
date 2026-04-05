import type {
  AgentMemoryMode,
  AgentWorkspaceBinding,
  SessionDigestRecord,
} from "@belldandy/agent";

import type { ResolvedResidentMemoryPolicy } from "./resident-memory-policy.js";
import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";

type SharedGovernanceCounts = {
  pendingCount: number;
  claimedCount?: number;
  approvedCount: number;
  rejectedCount: number;
  revokedCount: number;
  noneCount?: number;
};

type ConversationDigestReader = {
  getSessionDigest(
    conversationId: string,
    options?: { threshold?: number },
  ): Promise<SessionDigestRecord>;
};

export type ResidentAgentObservabilitySeed = {
  id: string;
  displayName: string;
  model: string;
  kind: "resident" | "worker";
  workspaceBinding: AgentWorkspaceBinding;
  sessionNamespace: string;
  memoryMode: AgentMemoryMode;
  status?: string;
  mainConversationId?: string;
  lastConversationId?: string;
  lastActiveAt?: number;
  memoryPolicy?: ResolvedResidentMemoryPolicy;
  sharedGovernance?: SharedGovernanceCounts;
};

export type ResidentAgentObservabilityItem = {
  id: string;
  displayName: string;
  model: string;
  kind: "resident";
  workspaceBinding: AgentWorkspaceBinding;
  sessionNamespace: string;
  memoryMode: AgentMemoryMode;
  status?: string;
  mainConversationId?: string;
  lastConversationId?: string;
  lastActiveAt?: number;
  memoryPolicy: ResolvedResidentMemoryPolicy;
  sharedGovernance?: SharedGovernanceCounts;
  conversationDigest?: {
    conversationId: string;
    status: SessionDigestRecord["status"];
    messageCount: number;
    pendingMessageCount: number;
    threshold: number;
    lastDigestAt: number;
  };
  observabilityHeadline?: string;
  observabilityBadges?: string[];
  warnings?: string[];
};

export type ResidentAgentDoctorReport = {
  summary: {
    totalCount: number;
    activeCount: number;
    runningCount: number;
    idleCount: number;
    backgroundCount: number;
    errorCount: number;
    memoryModeCounts: Record<AgentMemoryMode, number>;
    workspaceBindingCounts: Record<AgentWorkspaceBinding, number>;
    writeTargetCounts: Record<"private" | "shared", number>;
    sharedReadEnabledCount: number;
    digestReadyCount: number;
    digestUpdatedCount: number;
    digestIdleCount: number;
    digestMissingCount: number;
    sharedGovernanceCounts: {
      pendingCount: number;
      claimedCount: number;
      approvedCount: number;
      rejectedCount: number;
      revokedCount: number;
    };
    headline: string;
  };
  agents: ResidentAgentObservabilityItem[];
};

function buildSharedGovernanceCounts(record?: ScopedMemoryManagerRecord): SharedGovernanceCounts {
  if (!record || record.policy.writeTarget === "shared") {
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
    pendingCount: record.manager.countChunks({ sharedPromotionStatus: "pending" }),
    claimedCount: record.manager.countChunks({ sharedPromotionStatus: "pending", sharedPromotionClaimed: true }),
    approvedCount: record.manager.countChunks({ sharedPromotionStatus: "approved" }),
    rejectedCount: record.manager.countChunks({ sharedPromotionStatus: "rejected" }),
    revokedCount: record.manager.countChunks({ sharedPromotionStatus: "revoked" }),
    noneCount: record.manager.countChunks({ sharedPromotionStatus: "none" }),
  };
}

function toConversationDigestView(digest: SessionDigestRecord | undefined) {
  if (!digest) return undefined;
  return {
    conversationId: digest.conversationId,
    status: digest.status,
    messageCount: digest.messageCount,
    pendingMessageCount: digest.pendingMessageCount,
    threshold: digest.threshold,
    lastDigestAt: digest.lastDigestAt,
  };
}

function buildAgentObservabilityBadges(
  agent: ResidentAgentObservabilitySeed,
  digest: SessionDigestRecord | undefined,
  sharedGovernance: SharedGovernanceCounts | undefined,
): string[] {
  const badges = [
    `mode:${agent.memoryMode}`,
    `write:${agent.memoryPolicy?.writeTarget ?? "unknown"}`,
  ];

  if (agent.status && agent.status !== "idle") {
    badges.unshift(`status:${agent.status}`);
  }

  if (digest) {
    badges.push(`digest:${digest.status}`);
    if (digest.pendingMessageCount > 0) {
      badges.push(`pending:${digest.pendingMessageCount}`);
    }
  }

  if ((sharedGovernance?.pendingCount ?? 0) > 0) {
    badges.push(`review:${sharedGovernance?.pendingCount ?? 0}`);
  }
  if ((sharedGovernance?.claimedCount ?? 0) > 0) {
    badges.push(`claimed:${sharedGovernance?.claimedCount ?? 0}`);
  }

  return badges;
}

function buildAgentObservabilityHeadline(
  agent: ResidentAgentObservabilitySeed,
  digest: SessionDigestRecord | undefined,
  sharedGovernance: SharedGovernanceCounts | undefined,
): string {
  const pieces = [
    agent.memoryMode,
    `write=${agent.memoryPolicy?.writeTarget ?? "unknown"}`,
    `read=${Array.isArray(agent.memoryPolicy?.readTargets) ? agent.memoryPolicy.readTargets.join("+") : "-"}`,
    `session=${agent.sessionNamespace || "-"}`,
  ];

  if (agent.status) {
    pieces.push(`status=${agent.status}`);
  }
  if (digest) {
    pieces.push(`digest=${digest.status}`);
    pieces.push(`messages=${digest.messageCount}`);
    pieces.push(`pending=${digest.pendingMessageCount}`);
  }
  if ((sharedGovernance?.pendingCount ?? 0) > 0 || (sharedGovernance?.claimedCount ?? 0) > 0) {
    pieces.push(`review=p${sharedGovernance?.pendingCount ?? 0}/c${sharedGovernance?.claimedCount ?? 0}`);
  }

  return pieces.join(", ");
}

export async function buildResidentAgentObservabilitySnapshot(input: {
  agents: ResidentAgentObservabilitySeed[];
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  conversationStore?: ConversationDigestReader;
}): Promise<ResidentAgentDoctorReport> {
  const managerByAgentId = new Map(
    (input.residentMemoryManagers ?? []).map((record) => [record.agentId, record] as const),
  );
  const conversationStoreAvailable = Boolean(input.conversationStore);

  const enriched = await Promise.all(input.agents.map(async (agent) => {
    if (agent.kind !== "resident") return undefined;
    const managerRecord = managerByAgentId.get(agent.id);
    const memoryPolicy = agent.memoryPolicy ?? managerRecord?.policy;
    if (!memoryPolicy) return undefined;

    let digest: SessionDigestRecord | undefined;
    const warnings: string[] = [];
    const digestConversationId = agent.mainConversationId || agent.lastConversationId;
    if (input.conversationStore && digestConversationId) {
      try {
        digest = await input.conversationStore.getSessionDigest(digestConversationId);
      } catch (error) {
        warnings.push(`digest-unavailable:${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (conversationStoreAvailable) {
      warnings.push("digest-unavailable:missing-conversation-id");
    }

    const sharedGovernance = agent.sharedGovernance ?? buildSharedGovernanceCounts(managerRecord);
    if ((sharedGovernance.pendingCount ?? 0) > 0) {
      warnings.push(`shared-review-pending:${sharedGovernance.pendingCount}`);
    }
    if (digest?.status === "updated") {
      warnings.push(`digest-refresh-recommended:${digest.pendingMessageCount}`);
    }
    if (agent.status === "error") {
      warnings.push("runtime-error");
    }

    return {
      ...agent,
      kind: "resident" as const,
      memoryPolicy,
      sharedGovernance,
      conversationDigest: toConversationDigestView(digest),
      observabilityHeadline: buildAgentObservabilityHeadline(
        { ...agent, memoryPolicy },
        digest,
        sharedGovernance,
      ),
      observabilityBadges: buildAgentObservabilityBadges(
        { ...agent, memoryPolicy },
        digest,
        sharedGovernance,
      ),
      warnings,
    } satisfies ResidentAgentObservabilityItem;
  }));
  const agents = enriched.filter(Boolean) as ResidentAgentObservabilityItem[];

  return buildResidentAgentDoctorReport({
    agents,
    conversationStoreAvailable,
  });
}

export function buildResidentAgentDoctorReport(input: {
  agents: ResidentAgentObservabilityItem[];
  conversationStoreAvailable?: boolean;
}): ResidentAgentDoctorReport {
  const memoryModeCounts: Record<AgentMemoryMode, number> = {
    isolated: 0,
    shared: 0,
    hybrid: 0,
  };
  const workspaceBindingCounts: Record<AgentWorkspaceBinding, number> = {
    current: 0,
    custom: 0,
  };
  const writeTargetCounts: Record<"private" | "shared", number> = {
    private: 0,
    shared: 0,
  };

  let activeCount = 0;
  let runningCount = 0;
  let idleCount = 0;
  let backgroundCount = 0;
  let errorCount = 0;
  let sharedReadEnabledCount = 0;
  let digestReadyCount = 0;
  let digestUpdatedCount = 0;
  let digestIdleCount = 0;
  let digestMissingCount = 0;
  const sharedGovernanceCounts = {
    pendingCount: 0,
    claimedCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    revokedCount: 0,
  };

  for (const agent of input.agents) {
    memoryModeCounts[agent.memoryMode] += 1;
    workspaceBindingCounts[agent.workspaceBinding] += 1;
    writeTargetCounts[agent.memoryPolicy.writeTarget] += 1;
    if (agent.status === "running") {
      activeCount += 1;
      runningCount += 1;
    } else if (agent.status === "background") {
      activeCount += 1;
      backgroundCount += 1;
    } else if (agent.status === "error") {
      errorCount += 1;
    } else {
      idleCount += 1;
    }
    if (agent.memoryPolicy.includeSharedMemoryReads) {
      sharedReadEnabledCount += 1;
    }
    if (agent.conversationDigest) {
      if (agent.conversationDigest.status === "ready") {
        digestReadyCount += 1;
      } else if (agent.conversationDigest.status === "updated") {
        digestUpdatedCount += 1;
      } else {
        digestIdleCount += 1;
      }
    } else if (input.conversationStoreAvailable) {
      digestMissingCount += 1;
    }
    sharedGovernanceCounts.pendingCount += agent.sharedGovernance?.pendingCount ?? 0;
    sharedGovernanceCounts.claimedCount += agent.sharedGovernance?.claimedCount ?? 0;
    sharedGovernanceCounts.approvedCount += agent.sharedGovernance?.approvedCount ?? 0;
    sharedGovernanceCounts.rejectedCount += agent.sharedGovernance?.rejectedCount ?? 0;
    sharedGovernanceCounts.revokedCount += agent.sharedGovernance?.revokedCount ?? 0;
  }

  const totalCount = input.agents.length;
  const headline = [
    `${totalCount} resident agent(s)`,
    `active=${activeCount}`,
    `isolated=${memoryModeCounts.isolated}`,
    `shared=${memoryModeCounts.shared}`,
    `hybrid=${memoryModeCounts.hybrid}`,
    `running=${runningCount}`,
    `background=${backgroundCount}`,
    `idle=${idleCount}`,
    `digest-ready=${digestReadyCount}`,
    `digest-updated=${digestUpdatedCount}`,
  ].join(", ");

  return {
    summary: {
      totalCount,
      activeCount,
      runningCount,
      idleCount,
      backgroundCount,
      errorCount,
      memoryModeCounts,
      workspaceBindingCounts,
      writeTargetCounts,
      sharedReadEnabledCount,
      digestReadyCount,
      digestUpdatedCount,
      digestIdleCount,
      digestMissingCount,
      sharedGovernanceCounts,
      headline,
    },
    agents: input.agents,
  };
}
