import type { TaskMemoryRelation, TaskRecord, TaskSource, TaskStatus, TaskToolCallSummary } from "./task-types.js";

export type ExperienceCandidateType = "method" | "skill";
export type ExperienceCandidateStatus = "draft" | "reviewed" | "accepted" | "rejected";
export type ExperienceAssetType = "method" | "skill";
export type ExperienceUsageVia = "manual" | "search" | "tool" | "auto_suggest";

export interface ExperienceTaskMemoryLink {
  chunkId: string;
  relation: TaskMemoryRelation;
  sourcePath?: string;
  memoryType?: string;
  snippet?: string;
}

export interface ExperienceSourceTaskSnapshot {
  taskId: string;
  conversationId: string;
  agentId?: string;
  source: TaskSource;
  status: TaskStatus;
  title?: string;
  objective?: string;
  summary?: string;
  reflection?: string;
  outcome?: string;
  toolCalls?: TaskToolCallSummary[];
  artifactPaths?: string[];
  memoryLinks?: ExperienceTaskMemoryLink[];
  startedAt: string;
  finishedAt?: string;
}

export interface ExperienceCandidate {
  id: string;
  taskId: string;
  type: ExperienceCandidateType;
  status: ExperienceCandidateStatus;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  qualityScore?: number;
  sourceTaskSnapshot: ExperienceSourceTaskSnapshot;
  publishedPath?: string;
  createdAt: string;
  reviewedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;
}

export interface ExperienceCandidateListFilter {
  taskId?: string;
  type?: ExperienceCandidateType | ExperienceCandidateType[];
  status?: ExperienceCandidateStatus | ExperienceCandidateStatus[];
  agentId?: string;
}

export interface ExperienceUsage {
  id: string;
  taskId: string;
  assetType: ExperienceAssetType;
  assetKey: string;
  sourceCandidateId?: string;
  usedVia: ExperienceUsageVia;
  createdAt: string;
}

export interface ExperienceUsageListFilter {
  taskId?: string;
  assetType?: ExperienceAssetType | ExperienceAssetType[];
  assetKey?: string;
  sourceCandidateId?: string;
}

export interface ExperienceUsageStats {
  assetType: ExperienceAssetType;
  assetKey: string;
  sourceCandidateId?: string;
  sourceCandidateType?: ExperienceCandidateType;
  sourceCandidateTitle?: string;
  sourceCandidateStatus?: ExperienceCandidateStatus;
  sourceCandidateTaskId?: string;
  sourceCandidatePublishedPath?: string;
  usageCount: number;
  lastUsedAt?: string;
  lastUsedTaskId?: string;
}

export interface ExperienceUsageSummary extends ExperienceUsageStats {
  usageId: string;
  taskId: string;
  usedVia: ExperienceUsageVia;
  createdAt: string;
}

export interface ExperiencePromoteResult {
  candidate: ExperienceCandidate;
  reusedExisting: boolean;
}

export interface ExperienceUsageRecordResult {
  usage: ExperienceUsage;
  reusedExisting: boolean;
}

export interface ExperienceUsageRevokeResult {
  usage: ExperienceUsage;
}

export interface ExperienceSourceTaskDetail extends TaskRecord {
  memoryLinks?: ExperienceTaskMemoryLink[];
}

export interface TaskExperienceDetail extends TaskRecord {
  memoryLinks: ExperienceTaskMemoryLink[];
  usedMethods: ExperienceUsageSummary[];
  usedSkills: ExperienceUsageSummary[];
}
