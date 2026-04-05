import type { AgentMemoryMode, AgentWorkspaceBinding } from "@belldandy/agent";

import type { ResolvedResidentMemoryPolicy } from "./resident-memory-policy.js";

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
  sharedGovernance?: {
    pendingCount: number;
    claimedCount?: number;
    approvedCount: number;
    rejectedCount: number;
    revokedCount: number;
    noneCount?: number;
  };
};

export type ResidentAgentDoctorReport = {
  summary: {
    totalCount: number;
    activeCount: number;
    memoryModeCounts: Record<AgentMemoryMode, number>;
    workspaceBindingCounts: Record<AgentWorkspaceBinding, number>;
    writeTargetCounts: Record<"private" | "shared", number>;
    sharedReadEnabledCount: number;
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

export function buildResidentAgentDoctorReport(input: {
  agents: ResidentAgentObservabilityItem[];
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
  let sharedReadEnabledCount = 0;
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
    }
    if (agent.memoryPolicy.includeSharedMemoryReads) {
      sharedReadEnabledCount += 1;
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
  ].join(", ");

  return {
    summary: {
      totalCount,
      activeCount,
      memoryModeCounts,
      workspaceBindingCounts,
      writeTargetCounts,
      sharedReadEnabledCount,
      sharedGovernanceCounts,
      headline,
    },
    agents: input.agents,
  };
}
