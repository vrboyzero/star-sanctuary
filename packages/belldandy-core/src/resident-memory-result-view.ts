import type { AgentMemoryMode } from "@belldandy/agent";
import type {
  ExperienceCandidate,
  ExperienceTaskMemoryLink,
  ExperienceUsage,
  ExperienceUsageStats,
  ExperienceUsageSummary,
  MemorySearchResult,
  MemoryVisibility,
  TaskExperienceDetail,
} from "@belldandy/memory";

import type { ResolvedResidentMemoryPolicy, ResidentMemoryTarget } from "./resident-memory-policy.js";
import {
  getResidentSharedPromotionMetadata,
  type ResidentSharedPromotionStatus,
} from "./resident-shared-memory.js";

export type ResidentMemorySourceScope = "private" | "shared" | "hybrid";

export type ResidentMemorySourceExplainability = {
  code:
    | "private_only"
    | "shared_only"
    | "shared_pending_private"
    | "shared_pending_hidden"
    | "shared_approved_private"
    | "shared_approved_shared"
    | "shared_rejected_private"
    | "shared_rejected_hidden"
    | "shared_revoked_private"
    | "shared_revoked_hidden"
    | "aggregate_private_only"
    | "aggregate_shared_only"
    | "aggregate_mixed";
  governanceStatus?: ResidentSharedPromotionStatus | "none";
  privateCount?: number;
  sharedCount?: number;
  requestedByAgentId?: string;
  requestedAt?: string;
  reviewerAgentId?: string;
  reviewedAt?: string;
  claimedByAgentId?: string;
  claimedAt?: string;
  reason?: string;
  decisionNote?: string;
};

export type ResidentMemorySourceView = {
  mode: AgentMemoryMode;
  scope: ResidentMemorySourceScope;
  scopeLabel: ResidentMemorySourceScope;
  writeTarget: ResidentMemoryTarget;
  readTargets: ResidentMemoryTarget[];
  sharedReadsEnabled: boolean;
  privateCount?: number;
  sharedCount?: number;
  summary: string;
  explainability?: ResidentMemorySourceExplainability;
};

type MemoryLinkLike = Pick<ExperienceTaskMemoryLink, "visibility"> | null | undefined;

function buildBaseSourceView(policy?: ResolvedResidentMemoryPolicy): Omit<ResidentMemorySourceView, "scope" | "scopeLabel" | "summary"> {
  const mode = policy?.memoryMode ?? "isolated";
  const readTargets = policy?.readTargets ?? ["private"];
  const writeTarget = policy?.writeTarget ?? "private";
  return {
    mode,
    writeTarget,
    readTargets,
    sharedReadsEnabled: policy?.includeSharedMemoryReads ?? false,
  };
}

function normalizeVisibility(value: unknown): MemoryVisibility {
  return value === "shared" ? "shared" : "private";
}

function buildSummary(scope: ResidentMemorySourceScope, counts?: { privateCount?: number; sharedCount?: number }): string {
  const privateCount = counts?.privateCount ?? 0;
  const sharedCount = counts?.sharedCount ?? 0;
  if (scope === "hybrid") {
    return `hybrid 来源（private ${privateCount} / shared ${sharedCount}）`;
  }
  if (scope === "shared") {
    return sharedCount > 0 ? `shared 来源（${sharedCount} 条）` : "shared 来源";
  }
  return privateCount > 0 ? `private 来源（${privateCount} 条）` : "private 来源";
}

function buildSourceView(
  scope: ResidentMemorySourceScope,
  policy?: ResolvedResidentMemoryPolicy,
  counts?: { privateCount?: number; sharedCount?: number },
  explainability?: ResidentMemorySourceExplainability,
): ResidentMemorySourceView {
  return {
    ...buildBaseSourceView(policy),
    scope,
    scopeLabel: scope,
    privateCount: counts?.privateCount,
    sharedCount: counts?.sharedCount,
    summary: buildSummary(scope, counts),
    explainability,
  };
}

function fallbackScopeFromPolicy(policy?: ResolvedResidentMemoryPolicy): ResidentMemorySourceScope {
  if (policy?.writeTarget === "shared") {
    return "shared";
  }
  return "private";
}

export function buildResidentMemoryQueryView(policy?: ResolvedResidentMemoryPolicy): ResidentMemorySourceView {
  const scope = policy?.memoryMode === "shared"
    ? "shared"
    : policy?.memoryMode === "hybrid"
      ? "hybrid"
      : "private";
  return buildSourceView(scope, policy);
}

function buildChunkResultGroupKey(item: Pick<MemorySearchResult, "id" | "sourcePath" | "metadata">): string {
  const promotion = getResidentSharedPromotionMetadata(item);
  if (promotion) {
    return `promotion:${promotion.sourceAgentId}:${promotion.sourceChunkId}`;
  }
  const sourcePath = typeof item.sourcePath === "string" ? item.sourcePath.trim() : "";
  return sourcePath ? `source:${sourcePath}` : `id:${item.id}`;
}

function buildChunkExplainability(
  item: Pick<MemorySearchResult, "visibility" | "metadata">,
  counts?: { privateCount?: number; sharedCount?: number },
): ResidentMemorySourceExplainability {
  const visibility = normalizeVisibility(item.visibility);
  const promotion = getResidentSharedPromotionMetadata(item);
  const privateCount = counts?.privateCount ?? (visibility === "private" ? 1 : 0);
  const sharedCount = counts?.sharedCount ?? (visibility === "shared" ? 1 : 0);

  if (!promotion) {
    return {
      code: visibility === "shared" ? "shared_only" : "private_only",
      governanceStatus: "none",
      privateCount: privateCount || undefined,
      sharedCount: sharedCount || undefined,
    };
  }

  const status = promotion.status;
  const code = visibility === "shared"
    ? status === "pending"
      ? "shared_pending_hidden"
      : status === "approved" || status === "active"
        ? "shared_approved_shared"
        : status === "rejected"
          ? "shared_rejected_hidden"
          : "shared_revoked_hidden"
    : status === "pending"
      ? "shared_pending_private"
      : status === "approved" || status === "active"
        ? "shared_approved_private"
        : status === "rejected"
          ? "shared_rejected_private"
          : "shared_revoked_private";

  return {
    code,
    governanceStatus: status,
    privateCount: privateCount || undefined,
    sharedCount: sharedCount || undefined,
    requestedByAgentId: promotion.requestedByAgentId,
    requestedAt: promotion.requestedAt,
    reviewerAgentId: promotion.reviewerAgentId,
    reviewedAt: promotion.reviewedAt,
    claimedByAgentId: promotion.claimedByAgentId,
    claimedAt: promotion.claimedAt,
    reason: promotion.reason,
    decisionNote: promotion.decisionNote,
  };
}

export function buildResidentMemoryChunkSourceView(
  item: Pick<MemorySearchResult, "visibility" | "metadata">,
  policy?: ResolvedResidentMemoryPolicy,
  counts?: { privateCount?: number; sharedCount?: number },
): ResidentMemorySourceView {
  const visibility = normalizeVisibility(item.visibility);
  const normalizedCounts = counts ?? (visibility === "shared"
    ? { sharedCount: 1 }
    : { privateCount: 1 });
  return buildSourceView(
    visibility,
    policy,
    normalizedCounts,
    buildChunkExplainability(item, normalizedCounts),
  );
}

export function buildResidentAggregateSourceView(input: {
  policy?: ResolvedResidentMemoryPolicy;
  links?: MemoryLinkLike[];
  fallbackScope?: ResidentMemorySourceScope;
}): ResidentMemorySourceView {
  let privateCount = 0;
  let sharedCount = 0;

  for (const item of input.links ?? []) {
    if (!item) continue;
    if (normalizeVisibility(item.visibility) === "shared") {
      sharedCount += 1;
    } else {
      privateCount += 1;
    }
  }

  const scope = privateCount > 0 && sharedCount > 0
    ? "hybrid"
    : sharedCount > 0
      ? "shared"
      : privateCount > 0
        ? "private"
        : input.fallbackScope ?? fallbackScopeFromPolicy(input.policy);

  const explainability: ResidentMemorySourceExplainability = {
    code: scope === "hybrid"
      ? "aggregate_mixed"
      : scope === "shared"
        ? "aggregate_shared_only"
        : "aggregate_private_only",
    governanceStatus: "none",
    privateCount: privateCount || undefined,
    sharedCount: sharedCount || undefined,
  };

  return buildSourceView(scope, input.policy, {
    privateCount: privateCount || undefined,
    sharedCount: sharedCount || undefined,
  }, explainability);
}

export function attachResidentMemorySourceView<T extends MemorySearchResult>(
  item: T,
  policy?: ResolvedResidentMemoryPolicy,
): T & { sourceView: ResidentMemorySourceView } {
  return {
    ...item,
    sourceView: buildResidentMemoryChunkSourceView(item, policy),
  };
}

export function attachResidentMemorySourceViews<T extends MemorySearchResult>(
  items: T[],
  policy?: ResolvedResidentMemoryPolicy,
): Array<T & { sourceView: ResidentMemorySourceView }> {
  const countsByKey = new Map<string, { privateCount: number; sharedCount: number }>();
  for (const item of items) {
    const key = buildChunkResultGroupKey(item);
    const current = countsByKey.get(key) ?? { privateCount: 0, sharedCount: 0 };
    if (normalizeVisibility(item.visibility) === "shared") {
      current.sharedCount += 1;
    } else {
      current.privateCount += 1;
    }
    countsByKey.set(key, current);
  }

  return items.map((item) => ({
    ...item,
    sourceView: buildResidentMemoryChunkSourceView(item, policy, countsByKey.get(buildChunkResultGroupKey(item))),
  }));
}

export function attachResidentMemoryLinkSourceView<T extends ExperienceTaskMemoryLink>(
  link: T,
  policy?: ResolvedResidentMemoryPolicy,
): T & { sourceView: ResidentMemorySourceView } {
  return {
    ...link,
    sourceView: buildResidentAggregateSourceView({
      policy,
      links: [link],
    }),
  };
}

export function attachResidentExperienceCandidateSourceView<T extends ExperienceCandidate>(
  candidate: T,
  policy?: ResolvedResidentMemoryPolicy,
): T & {
  sourceView: ResidentMemorySourceView;
  sourceTaskSnapshot: ExperienceCandidate["sourceTaskSnapshot"] & {
    memoryLinks?: Array<ExperienceTaskMemoryLink & { sourceView: ResidentMemorySourceView }>;
  };
} {
  const memoryLinks = Array.isArray(candidate.sourceTaskSnapshot?.memoryLinks)
    ? candidate.sourceTaskSnapshot.memoryLinks.map((item) => attachResidentMemoryLinkSourceView(item, policy))
    : undefined;

  const sourceTaskSnapshot = {
    ...candidate.sourceTaskSnapshot,
    ...(memoryLinks ? { memoryLinks } : {}),
  } as ExperienceCandidate["sourceTaskSnapshot"] & {
    memoryLinks?: Array<ExperienceTaskMemoryLink & { sourceView: ResidentMemorySourceView }>;
  };

  return {
    ...candidate,
    sourceView: buildResidentAggregateSourceView({
      policy,
      links: memoryLinks,
    }),
    sourceTaskSnapshot,
  };
}

export function attachResidentExperienceUsageSourceView<
  T extends ExperienceUsage | ExperienceUsageStats | ExperienceUsageSummary,
>(
  item: T,
  sourceCandidate: ExperienceCandidate | null | undefined,
  policy?: ResolvedResidentMemoryPolicy,
): T & { sourceView: ResidentMemorySourceView } {
  const candidate = sourceCandidate
    ? attachResidentExperienceCandidateSourceView(sourceCandidate, policy)
    : null;

  return {
    ...item,
    sourceView: candidate?.sourceView ?? buildResidentAggregateSourceView({
      policy,
    }),
  };
}

export function attachResidentTaskExperienceSourceView(
  task: TaskExperienceDetail,
  options: {
    policy?: ResolvedResidentMemoryPolicy;
    resolveCandidate: (candidateId: string) => ExperienceCandidate | null | undefined;
  },
): TaskExperienceDetail & {
  memoryLinks: Array<ExperienceTaskMemoryLink & { sourceView: ResidentMemorySourceView }>;
  usedMethods: Array<ExperienceUsageSummary & { sourceView: ResidentMemorySourceView }>;
  usedSkills: Array<ExperienceUsageSummary & { sourceView: ResidentMemorySourceView }>;
} {
  return {
    ...task,
    memoryLinks: (task.memoryLinks ?? []).map((item) => attachResidentMemoryLinkSourceView(item, options.policy)),
    usedMethods: (task.usedMethods ?? []).map((item) => attachResidentExperienceUsageSourceView(
      item,
      item.sourceCandidateId ? options.resolveCandidate(item.sourceCandidateId) : null,
      options.policy,
    )),
    usedSkills: (task.usedSkills ?? []).map((item) => attachResidentExperienceUsageSourceView(
      item,
      item.sourceCandidateId ? options.resolveCandidate(item.sourceCandidateId) : null,
      options.policy,
    )),
  };
}
