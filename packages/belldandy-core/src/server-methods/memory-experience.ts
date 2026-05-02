import fs from "node:fs/promises";
import path from "node:path";

import type { AgentRegistry } from "@belldandy/agent";
import type { GatewayReqFrame, GatewayResFrame } from "@belldandy/protocol";
import {
  buildExperienceCandidateSlug,
  createTaskWorkSurface,
  getGlobalMemoryManager,
  readFirstMarkdownTitle,
  validateMethodCandidateDraftForPublish,
  validateSkillCandidateDraftForPublish,
} from "@belldandy/memory";
import type {
  ExperienceCandidate,
  ExperienceCandidateType,
  ExperienceSynthesisPreviewItem,
} from "@belldandy/memory";
import type { SkillRegistry } from "@belldandy/skills";
import { publishSkillCandidate } from "@belldandy/skills";

import { buildLearningReviewInput } from "../learning-review-input.js";
import { buildMindProfileSnapshot } from "../mind-profile-snapshot.js";
import type { ScopedMemoryManagerRecord } from "../resident-memory-managers.js";
import {
  attachResidentExperienceCandidateSourceView,
  attachResidentExperienceUsageSourceView,
  attachResidentMemorySourceView,
  attachResidentMemorySourceViews,
  attachResidentTaskExperienceSourceView,
  buildResidentMemoryQueryView,
} from "../resident-memory-result-view.js";
import {
  claimResidentSharedMemoryPromotion,
  getResidentMemory,
  listRecentResidentMemory,
  listResidentSharedReviewQueue,
  mergeResidentMemoryStatus,
  normalizeResidentSharedPromotionStatus,
  promoteResidentMemoryToShared,
  resolveResidentSharedMemoryManager,
  reviewResidentSharedMemoryPromotion,
  searchResidentMemory,
} from "../resident-shared-memory.js";
import {
  buildSkillFreshnessSnapshot,
  findSkillFreshnessForCandidate,
  findSkillFreshnessForUsage,
} from "../skill-freshness.js";
import { updateSkillFreshnessManualMark } from "../skill-freshness-state.js";

type MemoryExperienceMethodContext = {
  stateDir: string;
  agentRegistry?: AgentRegistry;
  skillRegistry?: SkillRegistry;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  primaryModelConfig?: {
    baseUrl: string;
    apiKey: string;
    model: string;
    thinking?: Record<string, unknown>;
    reasoningEffort?: string;
  };
  callPrimaryModel?: (input: {
    system: string;
    user: string;
    maxTokens?: number;
    model?: string;
    thinking?: Record<string, unknown>;
    reasoningEffort?: string;
  }) => Promise<string>;
  logger?: {
    debug?: (message: string, data?: unknown) => void;
    warn?: (message: string, data?: unknown) => void;
    error?: (message: string, data?: unknown) => void;
  };
};

const DEFAULT_EXPERIENCE_SYNTHESIS_MAX_SIMILAR_SOURCES = 5;
const DEFAULT_EXPERIENCE_SYNTHESIS_MAX_SOURCE_CONTENT_CHARS = 1_600;
const DEFAULT_EXPERIENCE_SYNTHESIS_TOTAL_SOURCE_CONTENT_CHAR_BUDGET = 10_000;
const EXPERIENCE_SYNTHESIS_MODEL_CALL_TIMEOUT_MS = 120_000;
const EXPERIENCE_SYNTHESIS_MAX_SIMILAR_SOURCES_ENV = "BELLDANDY_EXPERIENCE_SYNTHESIS_MAX_SIMILAR_SOURCES";
const EXPERIENCE_SYNTHESIS_MAX_SOURCE_CONTENT_CHARS_ENV = "BELLDANDY_EXPERIENCE_SYNTHESIS_MAX_SOURCE_CONTENT_CHARS";
const EXPERIENCE_SYNTHESIS_TOTAL_SOURCE_CONTENT_CHAR_BUDGET_ENV = "BELLDANDY_EXPERIENCE_SYNTHESIS_TOTAL_SOURCE_CONTENT_CHAR_BUDGET";

export async function handleMemoryExperienceMethod(
  req: GatewayReqFrame,
  ctx: MemoryExperienceMethodContext,
): Promise<GatewayResFrame | null> {
  if (!req.method.startsWith("memory.") && !req.method.startsWith("experience.")) {
    return null;
  }

  const params = isObjectRecord(req.params) ? req.params : {};
  const logDebug = (message: string, data?: unknown) => ctx.logger?.debug?.(message, data);
  const logWarn = (message: string, data?: unknown) => ctx.logger?.warn?.(message, data);
  const logError = (message: string, data?: unknown) => ctx.logger?.error?.(message, data);

  switch (req.method) {
    case "memory.search": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

      const query = readRequiredString(params, "query");
      if (!query) return invalid(req.id, "query is required");

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
      return ok(req.id, {
        items: toMemoryListPayloadItems(items, includeContent, residentPolicy),
        query,
        limit,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "memory.get": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

      const chunkId = readRequiredString(params, "chunkId");
      if (!chunkId) return invalid(req.id, "chunkId is required");

      const item = getResidentMemory({ manager, sharedManager, residentPolicy, chunkId });
      if (!item) return notFound(req.id, "Memory not found.");

      return ok(req.id, {
        item: attachResidentMemorySourceView(item, residentPolicy),
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "memory.recent": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

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
      return ok(req.id, {
        items: toMemoryListPayloadItems(items, includeContent, residentPolicy),
        limit,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "memory.stats": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

      const includeRecentTasks = params.includeRecentTasks === true;
      const sharedStatus = residentPolicy?.includeSharedMemoryReads === true && sharedManager && sharedManager !== manager
        ? sharedManager.getStatus()
        : null;
      const sharedGovernance = buildSharedGovernanceCounts(manager, residentPolicy);
      return ok(req.id, {
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
      });
    }

    case "memory.share.queue": {
      const limit = clampListLimit(params.limit, 50, 200);
      const query = readOptionalString(params, "query") ?? "";
      const filter = isObjectRecord(params.filter) ? params.filter : {};
      const reviewerAgentId = extractReviewerMemoryAgentId(params) ?? "default";
      if ((ctx.residentMemoryManagers?.length ?? 0) <= 0) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "not_available", message: "Resident memory managers are not available." },
        };
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
      return ok(req.id, {
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
      });
    }

    case "memory.share.promote": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

      const agentId = extractScopedMemoryAgentId(params) ?? residentPolicy?.agentId ?? "default";
      const chunkId = readOptionalString(params, "chunkId") ?? "";
      const sourcePath = readOptionalString(params, "sourcePath") ?? "";
      const reason = readOptionalString(params, "reason") ?? "";
      if (!chunkId && !sourcePath) return invalid(req.id, "chunkId or sourcePath is required.");

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
        return ok(req.id, {
          promoted: true,
          promotedCount: result.promotedCount,
          mode: result.mode,
          reason: result.reason,
          item: result.item ? attachResidentMemorySourceView(result.item, residentPolicy) : null,
          items: result.items.map((item) => attachResidentMemorySourceView(item, residentPolicy)),
          queryView: buildResidentMemoryQueryView(residentPolicy),
        });
      } catch (error) {
        return failure(req.id, "memory_share_promote_failed", error);
      }
    }

    case "memory.share.review": {
      const targetAgentId = extractTargetMemoryAgentId(params) ?? "default";
      const targetRecord = resolveResidentMemoryManagerRecord(targetAgentId, ctx.residentMemoryManagers);
      const manager = targetRecord?.manager ?? resolveScopedMemoryManager({ agentId: targetAgentId });
      const residentPolicy = targetRecord?.policy ?? resolveScopedResidentMemoryPolicy({ agentId: targetAgentId }, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

      const chunkId = readOptionalString(params, "chunkId") ?? "";
      const sourcePath = readOptionalString(params, "sourcePath") ?? "";
      const decision = readOptionalString(params, "decision") ?? "";
      const note = readOptionalString(params, "note") ?? "";
      if (!chunkId && !sourcePath) return invalid(req.id, "chunkId or sourcePath is required.");
      if (!["approved", "rejected", "revoked"].includes(decision)) {
        return invalid(req.id, "decision must be approved, rejected, or revoked.");
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
        return ok(req.id, {
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
        });
      } catch (error) {
        return failure(req.id, "memory_share_review_failed", error);
      }
    }

    case "memory.share.claim": {
      const targetAgentId = extractTargetMemoryAgentId(params) ?? "default";
      const targetRecord = resolveResidentMemoryManagerRecord(targetAgentId, ctx.residentMemoryManagers);
      const manager = targetRecord?.manager ?? resolveScopedMemoryManager({ agentId: targetAgentId });
      const residentPolicy = targetRecord?.policy ?? resolveScopedResidentMemoryPolicy({ agentId: targetAgentId }, ctx.residentMemoryManagers);
      const sharedManager = resolveResidentSharedMemoryManager(residentPolicy);
      if (!manager) return notAvailable(req.id);

      const chunkId = readOptionalString(params, "chunkId") ?? "";
      const sourcePath = readOptionalString(params, "sourcePath") ?? "";
      const action = readOptionalString(params, "action") ?? "";
      if (!chunkId && !sourcePath) return invalid(req.id, "chunkId or sourcePath is required.");
      if (!["claim", "release"].includes(action)) return invalid(req.id, "action must be claim or release.");
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
        return ok(req.id, {
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
        });
      } catch (error) {
        return failure(req.id, "memory_share_claim_failed", error);
      }
    }

    case "memory.task.list": {
      const manager = resolveScopedMemoryManager(params);
      if (!manager) return notAvailable(req.id);

      const query = readOptionalString(params, "query") ?? "";
      const limit = clampListLimit(params.limit, 20);
      const summaryOnly = params.summaryOnly === true;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = query
        ? manager.searchTasks(query, { limit, filter: filter as any })
        : manager.getRecentTasks(limit, filter as any);

      return ok(req.id, {
        items: toTaskListPayloadItems(items, summaryOnly),
        query,
        limit,
      });
    }

    case "memory.task.get": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const taskId = readRequiredString(params, "taskId");
      if (!taskId) return invalid(req.id, "taskId is required");

      const task = manager.getTaskDetail(taskId);
      if (!task) return notFound(req.id, "Task not found.");
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      const taskPayload = toTaskExperiencePayloadItem(manager, task, residentPolicy) as Record<string, unknown> & {
        usedSkills?: Array<Record<string, unknown>>;
      };
      taskPayload.usedSkills = (Array.isArray(taskPayload.usedSkills) ? taskPayload.usedSkills : []).map((item, index) =>
        attachSkillFreshnessToUsagePayload(item, task.usedSkills?.[index], skillFreshnessSnapshot),
      );

      return ok(req.id, {
        task: taskPayload,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "memory.recent_work": {
      const taskWorkSurface = resolveScopedTaskWorkSurface(params);
      if (!taskWorkSurface) return notAvailable(req.id);

      const query = readOptionalString(params, "query") ?? "";
      const limit = clampListLimit(params.limit, 10);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = taskWorkSurface.recentWork({
        query: query || undefined,
        limit,
        filter: filter as any,
      });

      return ok(req.id, {
        items,
        query,
        limit,
      });
    }

    case "memory.resume_context": {
      const taskWorkSurface = resolveScopedTaskWorkSurface(params);
      if (!taskWorkSurface) return notAvailable(req.id);

      const query = readOptionalString(params, "query") ?? "";
      const taskId = readOptionalString(params, "taskId") ?? "";
      const conversationId = readOptionalString(params, "conversationId") ?? "";
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const item = taskWorkSurface.resumeContext({
        taskId: taskId || undefined,
        conversationId: conversationId || undefined,
        query: query || undefined,
        filter: filter as any,
      });

      return ok(req.id, {
        item,
        query,
        taskId: taskId || undefined,
        conversationId: conversationId || undefined,
      });
    }

    case "memory.similar_past_work": {
      const taskWorkSurface = resolveScopedTaskWorkSurface(params);
      if (!taskWorkSurface) return notAvailable(req.id);

      const query = readRequiredString(params, "query");
      if (!query) return invalid(req.id, "query is required");

      const limit = clampListLimit(params.limit, 10);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = taskWorkSurface.findSimilarWork({
        query,
        limit,
        filter: filter as any,
      });

      return ok(req.id, {
        items,
        query,
        limit,
      });
    }

    case "memory.explain_sources": {
      const taskWorkSurface = resolveScopedTaskWorkSurface(params);
      if (!taskWorkSurface) return notAvailable(req.id);

      const taskId = readOptionalString(params, "taskId") ?? "";
      const conversationId = readOptionalString(params, "conversationId") ?? "";
      if (!taskId && !conversationId) {
        return invalid(req.id, "taskId or conversationId is required");
      }

      const explanation = taskWorkSurface.explainSources({
        taskId: taskId || undefined,
        conversationId: conversationId || undefined,
      });
      if (!explanation) {
        return notFound(req.id, "Task work source explanation not found.");
      }

      return ok(req.id, {
        explanation,
        taskId: explanation.taskId,
        conversationId: explanation.conversationId,
      });
    }

    case "experience.candidate.get": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const candidateId = readRequiredString(params, "candidateId");
      if (!candidateId) return invalid(req.id, "candidateId is required");

      const candidate = manager.getExperienceCandidate(candidateId);
      if (!candidate) return notFound(req.id, "Experience candidate not found.");
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);

      return ok(req.id, {
        candidate: attachSkillFreshnessToCandidatePayload({
          ...toExperienceCandidatePayloadItem(candidate, residentPolicy),
          learningReviewInput: buildLearningReviewInput({
            mindProfileSnapshot: await buildMindProfileSnapshot({
              stateDir: ctx.stateDir,
              residentMemoryManagers: ctx.residentMemoryManagers,
              agentId: readOptionalString(params, "agentId"),
            }),
            experienceCandidate: candidate,
          }),
        }, candidate, skillFreshnessSnapshot),
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.generate": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const taskId = readRequiredString(params, "taskId");
      const candidateType = readRequiredString(params, "candidateType");
      if (!taskId) return invalid(req.id, "taskId is required");
      if (candidateType !== "method" && candidateType !== "skill") {
        return invalid(req.id, "candidateType must be method or skill.");
      }
      if (isExperienceGenerationConfirmationRequired(candidateType)) {
        return confirmationRequired(req.id, `${candidateType} generation requires user confirmation.`);
      }

      const result = candidateType === "method"
        ? manager.promoteTaskToMethodCandidate(taskId)
        : manager.promoteTaskToSkillCandidate(taskId);
      if (!result?.candidate) return notFound(req.id, "Task not found.");

      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return ok(req.id, {
        candidate: attachSkillFreshnessToCandidatePayload(
          toExperienceCandidatePayloadItem(result.candidate, residentPolicy),
          result.candidate,
          skillFreshnessSnapshot,
        ),
        created: !result.reusedExisting,
        reusedExisting: result.reusedExisting,
        dedupDecision: result.dedupDecision,
        exactMatch: result.exactMatch,
        similarMatches: result.similarMatches,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.check_duplicate": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const taskId = readRequiredString(params, "taskId");
      const candidateType = readRequiredString(params, "candidateType");
      if (!taskId) return invalid(req.id, "taskId is required");
      if (candidateType !== "method" && candidateType !== "skill") {
        return invalid(req.id, "candidateType must be method or skill.");
      }

      const result = candidateType === "method"
        ? manager.checkTaskMethodCandidateDuplicate(taskId)
        : manager.checkTaskSkillCandidateDuplicate(taskId);
      if (!result) return notFound(req.id, "Task not found.");

      return ok(req.id, {
        type: result.type,
        taskId: result.taskId,
        title: result.title,
        slug: result.slug,
        summary: result.summary,
        decision: result.decision,
        exactMatch: result.exactMatch,
        similarMatches: result.similarMatches,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.list": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const limit = clampListLimit(params.limit, 50);
      const offset = readOptionalNonNegativeInteger(params, "offset") ?? 0;
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceCandidates(limit, filter as any, offset);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return ok(req.id, {
        items: items.map((item) => attachSkillFreshnessToCandidatePayload(
          toExperienceCandidatePayloadItem(item, residentPolicy),
          item,
          skillFreshnessSnapshot,
        )),
        limit,
        offset,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.stats": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      return ok(req.id, {
        stats: manager.getExperienceCandidateStats(filter as any),
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.accept": {
      const manager = resolveScopedMemoryManager(params);
      if (!manager) return notAvailable(req.id);

      const candidateId = readRequiredString(params, "candidateId");
      const confirmed = readOptionalBoolean(params, "confirmed") === true;
      if (!candidateId) return invalid(req.id, "candidateId is required");

      const existing = manager.getExperienceCandidate(candidateId);
      if (!existing) return notFound(req.id, "Experience candidate not found.");
      if (existing.status !== "draft") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_state",
            message: `Experience candidate can only be accepted from draft status. Current status: ${existing.status}.`,
          },
        };
      }
      if (isExperiencePublishConfirmationRequired(existing.type) && !confirmed) {
        return confirmationRequired(req.id, `${existing.type} publish requires user confirmation.`);
      }

      try {
        let publishedPath: string | undefined;
        if (existing.type === "skill") {
          publishedPath = await publishSkillCandidate(existing, ctx.stateDir, ctx.skillRegistry);
        }

        const candidate = manager.acceptExperienceCandidate(candidateId, publishedPath ? { publishedPath } : {});
        if (!candidate) return notFound(req.id, "Experience candidate not found.");
        return ok(req.id, { candidate });
      } catch (error) {
        return failure(req.id, "experience_candidate_publish_failed", error);
      }
    }

    case "experience.candidate.reject": {
      const manager = resolveScopedMemoryManager(params);
      if (!manager) return notAvailable(req.id);

      const candidateId = readRequiredString(params, "candidateId");
      if (!candidateId) return invalid(req.id, "candidateId is required");

      const existing = manager.getExperienceCandidate(candidateId);
      if (!existing) return notFound(req.id, "Experience candidate not found.");
      if (existing.status !== "draft") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_state",
            message: `Experience candidate can only be rejected from draft status. Current status: ${existing.status}.`,
          },
        };
      }

      const candidate = manager.rejectExperienceCandidate(candidateId);
      if (!candidate) return notFound(req.id, "Experience candidate not found.");
      return ok(req.id, { candidate });
    }

    case "experience.candidate.reject_bulk": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const filter = isObjectRecord(params.filter) ? { ...params.filter } : {};
      const rawType = typeof filter.type === "string" ? filter.type.trim().toLowerCase() : "";
      if (rawType !== "method" && rawType !== "skill") {
        return invalid(req.id, "filter.type must be 'method' or 'skill'");
      }

      const count = manager.rejectExperienceCandidates({
        ...(filter as any),
        type: rawType,
        status: "draft",
      });
      return ok(req.id, {
        count,
        filter: {
          type: rawType,
          status: "draft",
        },
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.synthesize.preview": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const candidateId = readRequiredString(params, "candidateId");
      const limit = clampListLimit(params.limit, 50, 200);
      if (!candidateId) {
        logWarn("Experience synthesis preview rejected because candidateId is missing", {
          limit,
        });
        return invalid(req.id, "candidateId is required");
      }

      const seedCandidate = manager.getExperienceCandidate(candidateId);
      if (!seedCandidate) {
        logWarn("Experience synthesis preview rejected because seed candidate was not found", {
          candidateId,
          limit,
        });
        return notFound(req.id, "Experience candidate not found.");
      }

      const preview = manager.previewExperienceCandidateSynthesis(candidateId, { limit });
      if (!preview) {
        logWarn("Experience synthesis preview rejected because preview data could not be prepared", {
          candidateId,
          candidateType: seedCandidate.type,
          limit,
        });
        return notFound(req.id, "Experience candidate not found.");
      }
      const maxSimilarSources = getExperienceSynthesisMaxSimilarSources();
      const selection = selectExperienceSynthesisPreviewItems(preview.items, maxSimilarSources);
      const selectedSourceCandidateIds = [seedCandidate.id, ...selection.selectedItems.map((item) => item.candidateId)];
      logDebug("Experience synthesis preview prepared", {
        candidateId: seedCandidate.id,
        candidateType: seedCandidate.type,
        limit,
        totalCount: preview.totalCount,
        matchedCount: preview.items.length,
        taskCount: preview.taskCount,
        sameFamilyCount: selection.sameFamilyCount,
        similarCount: selection.similarCount,
        selectedSameFamilyCount: selection.selectedSameFamilyCount,
        selectedSimilarCount: selection.selectedSimilarCount,
        maxSimilarSources,
      });

      const templateInfo = await resolveExperienceSynthesisTemplateInfo(ctx.stateDir, seedCandidate.type);
      return ok(req.id, {
        seedCandidate: toExperienceCandidatePayloadItem(seedCandidate, residentPolicy),
        candidateType: seedCandidate.type,
        totalCount: preview.totalCount,
        taskCount: preview.taskCount,
        items: preview.items,
        sourceCandidateIds: selectedSourceCandidateIds,
        selectedSourceCount: selectedSourceCandidateIds.length,
        sameFamilyCount: selection.sameFamilyCount,
        similarCount: selection.similarCount,
        selectedSameFamilyCount: selection.selectedSameFamilyCount,
        selectedSimilarCount: selection.selectedSimilarCount,
        maxSimilarSourceCount: maxSimilarSources,
        templateInfo,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.synthesize.create": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const candidateId = readRequiredString(params, "candidateId");
      if (!candidateId) {
        logWarn("Experience synthesis create rejected because candidateId is missing", {
          requestedSourceCount: readOptionalStringArray(params, "sourceCandidateIds").length,
        });
        return invalid(req.id, "candidateId is required");
      }
      const seedCandidate = manager.getExperienceCandidate(candidateId);
      if (!seedCandidate) {
        logWarn("Experience synthesis create rejected because seed candidate was not found", {
          candidateId,
          requestedSourceCount: readOptionalStringArray(params, "sourceCandidateIds").length,
        });
        return notFound(req.id, "Experience candidate not found.");
      }
      if (seedCandidate.status !== "draft") {
        logWarn("Experience synthesis create rejected because seed candidate is not draft", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
          status: seedCandidate.status,
        });
        return invalid(req.id, `Only draft candidates can be synthesized. Current status: ${seedCandidate.status}.`);
      }

      const preview = manager.previewExperienceCandidateSynthesis(candidateId, { limit: 200 });
      if (!preview) {
        logWarn("Experience synthesis create rejected because preview data could not be prepared", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
        });
        return notFound(req.id, "Experience candidate not found.");
      }
      const requestedSourceCandidateIds = readOptionalStringArray(params, "sourceCandidateIds");
      const requestedPreviewItems = requestedSourceCandidateIds.length > 0
        ? filterExperienceSynthesisPreviewItemsByCandidateIds(preview.items, requestedSourceCandidateIds)
        : preview.items;
      const maxSimilarSources = getExperienceSynthesisMaxSimilarSources();
      const selection = selectExperienceSynthesisPreviewItems(
        requestedPreviewItems,
        maxSimilarSources,
      );
      const orderedSourceCandidateIds = [
        seedCandidate.id,
        ...requestedPreviewItems.map((item) => item.candidateId),
      ];
      const limitedOrderedSourceCandidateIds = [
        seedCandidate.id,
        ...selection.selectedItems.map((item) => item.candidateId),
      ];
      if (orderedSourceCandidateIds.length > limitedOrderedSourceCandidateIds.length) {
        logWarn("Experience synthesis source candidates were truncated to the per-run limit", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
          requestedSourceCount: requestedSourceCandidateIds.length,
          orderedSourceCount: orderedSourceCandidateIds.length,
          selectedSourceCount: limitedOrderedSourceCandidateIds.length,
          selectedSameFamilyCount: selection.selectedSameFamilyCount,
          selectedSimilarCount: selection.selectedSimilarCount,
          maxSimilarSources,
        });
      }
      const sourceCandidates = limitedOrderedSourceCandidateIds
        .map((id) => manager.getExperienceCandidate(id))
        .filter((item): item is ExperienceCandidate => {
          if (!item) {
            return false;
          }
          return item.type === seedCandidate.type
            && item.status === "draft";
        });
      logDebug("Experience synthesis create requested", {
        candidateId: seedCandidate.id,
        candidateType: seedCandidate.type,
        requestedSourceCount: requestedSourceCandidateIds.length,
        orderedSourceCount: orderedSourceCandidateIds.length,
        selectedSourceCount: limitedOrderedSourceCandidateIds.length,
        selectedSameFamilyCount: selection.selectedSameFamilyCount,
        selectedSimilarCount: selection.selectedSimilarCount,
        resolvedDraftSourceCount: sourceCandidates.length,
        previewMatchedCount: preview.items.length,
      });
      if (!sourceCandidates.length) {
        logWarn("Experience synthesis create aborted because no draft source candidates were resolved", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
          requestedSourceCandidateIds,
          orderedSourceCandidateIds,
        });
        return invalid(req.id, "No draft source candidates are available for synthesis.");
      }

      try {
        const template = await resolveExperienceSynthesisTemplate(ctx.stateDir, seedCandidate.type);
        const systemPrompt = buildExperienceSynthesisSystemPrompt(template.content);
        const userPrompt = buildExperienceSynthesisUserPrompt({
          templateId: template.id,
          seedCandidate,
          sourceCandidates,
        });
        const scaleWarning = buildExperienceSynthesisScaleWarning({
          requestedSourceCount: requestedSourceCandidateIds.length > 0
            ? requestedSourceCandidateIds.length
            : preview.items.length + 1,
          orderedSourceCount: limitedOrderedSourceCandidateIds.length,
          sourceCandidates,
          systemPrompt,
          userPrompt,
        });
        if (scaleWarning) {
          logWarn("Experience synthesis source set is large; model call may become unstable", {
            candidateId: seedCandidate.id,
            candidateType: seedCandidate.type,
            templateId: template.id,
            ...scaleWarning,
          });
        }
        logDebug("Calling primary model for experience synthesis", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
          sourceCount: sourceCandidates.length,
          templateId: template.id,
          systemPromptLength: systemPrompt.length,
          userPromptLength: userPrompt.length,
        });
        const rawModelOutput = await callPrimaryModelForExperienceSynthesis({
          ctx,
          system: systemPrompt,
          user: userPrompt,
        });
        logDebug("Primary model returned experience synthesis output", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
          outputLength: rawModelOutput.length,
        });
        const parsed = parseExperienceSynthesisModelOutput(rawModelOutput);
        const title = normalizeText(parsed.title) || readFirstMarkdownTitle(parsed.content) || seedCandidate.title;
        const summary = normalizeText(parsed.summary) || readExperienceSynthesisSummary(seedCandidate.type, parsed.content) || seedCandidate.summary;
        const slug = buildExperienceCandidateSlug(seedCandidate.type, {
          title,
          slug: normalizeText(parsed.slug),
          fallback: seedCandidate.sourceTaskSnapshot?.taskId || seedCandidate.taskId,
          objective: seedCandidate.sourceTaskSnapshot?.objective,
          summary,
        });
        const validationIssues = seedCandidate.type === "method"
          ? validateMethodCandidateDraftForPublish(parsed.content)
          : validateSkillCandidateDraftForPublish(parsed.content);
        if (validationIssues.length > 0) {
          logWarn("Synthesized experience draft failed validation", {
            candidateId: seedCandidate.id,
            candidateType: seedCandidate.type,
            sourceCount: sourceCandidates.length,
            validationIssues,
          });
          return invalid(req.id, `Synthesized ${seedCandidate.type} draft failed validation: ${validationIssues.join("；")}`);
        }

        const createdCandidate = manager.createSynthesizedExperienceCandidate({
          seedCandidate,
          sourceCandidates,
          title,
          slug,
          summary,
          content: parsed.content,
          metadata: {
            draftOrigin: {
              kind: "synthesized",
            },
            synthesis: {
              seedCandidateId: seedCandidate.id,
              sourceCandidateIds: sourceCandidates.map((item) => item.id),
              sourceCount: sourceCandidates.length,
              createdBy: "main_model",
              templateId: template.id,
              templatePath: template.path ?? undefined,
            },
          },
        });
        logDebug("Experience synthesis draft created", {
          candidateId: seedCandidate.id,
          createdCandidateId: createdCandidate.id,
          candidateType: seedCandidate.type,
          sourceCount: sourceCandidates.length,
          templateId: template.id,
        });
        const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
        return ok(req.id, {
          candidate: attachSkillFreshnessToCandidatePayload(
            toExperienceCandidatePayloadItem(createdCandidate, residentPolicy),
            createdCandidate,
            skillFreshnessSnapshot,
          ),
          created: true,
          sourceCount: sourceCandidates.length,
          sourceCandidateIds: sourceCandidates.map((item) => item.id),
          templateInfo: {
            id: template.id,
            path: template.path,
          },
          queryView: buildResidentMemoryQueryView(residentPolicy),
        });
      } catch (error) {
        logError("Experience synthesis create failed", {
          candidateId: seedCandidate.id,
          candidateType: seedCandidate.type,
          sourceCount: sourceCandidates.length,
          requestedSourceCount: requestedSourceCandidateIds.length,
          error: summarizeExperienceSynthesisError(error),
        });
        throw error;
      }
    }

    case "experience.usage.get": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const usageId = readRequiredString(params, "usageId");
      if (!usageId) return invalid(req.id, "usageId is required");

      const usage = manager.getExperienceUsage(usageId);
      if (!usage) return notFound(req.id, "Experience usage not found.");
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);

      return ok(req.id, {
        usage: attachSkillFreshnessToUsagePayload(
          toExperienceUsagePayloadItem(manager, usage, residentPolicy),
          usage,
          skillFreshnessSnapshot,
        ),
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.usage.list": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsages(limit, filter as any);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return ok(req.id, {
        items: items.map((item) => attachSkillFreshnessToUsagePayload(
          toExperienceUsagePayloadItem(manager, item, residentPolicy),
          item,
          skillFreshnessSnapshot,
        )),
        limit,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.usage.stats": {
      const manager = resolveScopedMemoryManager(params);
      const residentPolicy = resolveScopedResidentMemoryPolicy(params, ctx.residentMemoryManagers);
      if (!manager) return notAvailable(req.id);

      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsageStats(limit, filter as any);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return ok(req.id, {
        items: items.map((item) => attachSkillFreshnessToUsagePayload(
          toExperienceUsagePayloadItem(manager, item, residentPolicy),
          item,
          skillFreshnessSnapshot,
        )),
        limit,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.usage.revoke": {
      const manager = resolveScopedMemoryManager(params);
      if (!manager) return notAvailable(req.id);

      const usageId = readOptionalString(params, "usageId") ?? "";
      const taskId = readOptionalString(params, "taskId") ?? "";
      const assetType = readOptionalString(params, "assetType") ?? "";
      const assetKey = readOptionalString(params, "assetKey") ?? "";
      if (!usageId && (!taskId || (assetType !== "method" && assetType !== "skill") || !assetKey)) {
        return invalid(req.id, "usageId or taskId + assetType + assetKey is required.");
      }

      const usage = manager.revokeExperienceUsage({
        usageId: usageId || undefined,
        taskId: taskId || undefined,
        assetType: assetType === "method" || assetType === "skill" ? assetType : undefined,
        assetKey: assetKey || undefined,
      });

      return ok(req.id, { usage, revoked: Boolean(usage) });
    }

    case "experience.skill.freshness.update": {
      const manager = resolveScopedMemoryManager(params);
      const sourceCandidateId = readOptionalString(params, "sourceCandidateId") ?? "";
      const stale = params.stale !== false;
      const candidate = sourceCandidateId && manager ? manager.getExperienceCandidate(sourceCandidateId) : null;
      if (candidate && candidate.type !== "skill") {
        return invalid(req.id, "sourceCandidateId must point to a skill candidate.");
      }

      const skillKey = readOptionalString(params, "skillKey")
        ?? candidate?.title
        ?? candidate?.slug
        ?? "";
      if (!skillKey && !sourceCandidateId) {
        return invalid(req.id, "skillKey or sourceCandidateId is required.");
      }

      const updated = await updateSkillFreshnessManualMark(ctx.stateDir, {
        skillKey,
        sourceCandidateId: sourceCandidateId || undefined,
        reason: readOptionalString(params, "reason"),
        markedBy: readOptionalString(params, "markedBy") ?? extractScopedMemoryAgentId(params),
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

      return ok(req.id, {
        stale,
        mark: updated.mark,
        skillFreshness,
      });
    }

    default:
      return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readRequiredString(params: Record<string, unknown>, key: string): string {
  return typeof params[key] === "string" ? params[key].trim() : "";
}

function readOptionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = readRequiredString(params, key);
  return value || undefined;
}

function readOptionalBoolean(params: Record<string, unknown>, key: string): boolean | undefined {
  const raw = params[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  }
  return undefined;
}

function readOptionalStringArray(params: Record<string, unknown>, key: string): string[] {
  const raw = params[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function readOptionalNonNegativeInteger(params: Record<string, unknown>, key: string): number | undefined {
  const raw = params[key];
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return undefined;
  return parsed;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function readPositiveIntegerEnv(name: string, fallback: number, minimum = 1): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  return normalized >= minimum ? normalized : fallback;
}

function getExperienceSynthesisMaxSimilarSources(): number {
  return readPositiveIntegerEnv(
    EXPERIENCE_SYNTHESIS_MAX_SIMILAR_SOURCES_ENV,
    DEFAULT_EXPERIENCE_SYNTHESIS_MAX_SIMILAR_SOURCES,
  );
}

function getExperienceSynthesisMaxSourceContentChars(): number {
  return readPositiveIntegerEnv(
    EXPERIENCE_SYNTHESIS_MAX_SOURCE_CONTENT_CHARS_ENV,
    DEFAULT_EXPERIENCE_SYNTHESIS_MAX_SOURCE_CONTENT_CHARS,
    200,
  );
}

function getExperienceSynthesisTotalSourceContentCharBudget(): number {
  return readPositiveIntegerEnv(
    EXPERIENCE_SYNTHESIS_TOTAL_SOURCE_CONTENT_CHAR_BUDGET_ENV,
    DEFAULT_EXPERIENCE_SYNTHESIS_TOTAL_SOURCE_CONTENT_CHAR_BUDGET,
    1_000,
  );
}

function confirmationRequired(id: string, message: string): GatewayResFrame {
  return {
    type: "res",
    id,
    ok: false,
    error: {
      code: "confirmation_required",
      message,
    },
  };
}

function readEnvBoolean(name: string): boolean {
  const normalized = String(process.env[name] ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function isExperienceGenerationConfirmationRequired(type: "method" | "skill"): boolean {
  return type === "method"
    ? readEnvBoolean("BELLDANDY_METHOD_GENERATION_CONFIRM_REQUIRED")
    : readEnvBoolean("BELLDANDY_SKILL_GENERATION_CONFIRM_REQUIRED");
}

function isExperiencePublishConfirmationRequired(type: "method" | "skill"): boolean {
  return type === "method"
    ? readEnvBoolean("BELLDANDY_METHOD_PUBLISH_CONFIRM_REQUIRED")
    : readEnvBoolean("BELLDANDY_SKILL_PUBLISH_CONFIRM_REQUIRED");
}

function clampListLimit(value: unknown, fallback: number, max = 100): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
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

function resolveScopedTaskWorkSurface(params: Record<string, unknown> = {}) {
  const manager = resolveScopedMemoryManager(params);
  return manager ? createTaskWorkSurface(manager) : null;
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
  if (!manager || residentPolicy?.writeTarget === "shared") {
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

async function resolveExperienceSynthesisTemplateInfo(
  stateDir: string,
  type: ExperienceCandidateType,
): Promise<{ id: string; path: string | null }> {
  const resolved = await resolveExperienceSynthesisTemplate(stateDir, type, { includeContent: false });
  return {
    id: resolved.id,
    path: resolved.path,
  };
}

async function resolveExperienceSynthesisTemplate(
  stateDir: string,
  type: ExperienceCandidateType,
  options: { includeContent?: boolean } = {},
): Promise<{ id: string; path: string | null; content: string }> {
  const fileName = type === "skill" ? "skill-synthesis.md" : "method-synthesis.md";
  const candidatePaths = [
    path.join(stateDir, "experience-templates", fileName),
    path.resolve(process.cwd(), "docs", "experience-templates", fileName),
  ];
  for (const candidatePath of candidatePaths) {
    const content = await fs.readFile(candidatePath, "utf-8").catch(() => "");
    if (!content.trim()) {
      continue;
    }
    return {
      id: `${type}-synthesis`,
      path: candidatePath,
      content: options.includeContent === false ? "" : content,
    };
  }
  throw new Error(`Experience synthesis template not found for ${type}. Checked: ${candidatePaths.join(" | ")}`);
}

function buildExperienceSynthesisSystemPrompt(templateContent: string): string {
  return [
    "你是经验能力合成器。",
    "你的任务是阅读多个相似的经验草稿，综合生成一个新的高质量 draft 候选。",
    "严格遵守模板中的结构、约束、章节与质量要求。",
    "不要输出解释，不要输出额外 prose，只返回一个 JSON 对象。",
    'JSON 结构必须是 {"title":"...","summary":"...","content":"完整 markdown"}。',
    "",
    "以下是合成模板：",
    templateContent.trim(),
  ].join("\n");
}

function filterExperienceSynthesisPreviewItemsByCandidateIds(
  items: ExperienceSynthesisPreviewItem[],
  candidateIds: string[],
): ExperienceSynthesisPreviewItem[] {
  const requestedIds = new Set(dedupeStrings(candidateIds));
  if (!requestedIds.size) {
    return Array.isArray(items) ? [...items] : [];
  }
  return (Array.isArray(items) ? items : []).filter((item) => requestedIds.has(String(item?.candidateId ?? "")));
}

export function selectExperienceSynthesisPreviewItems(
  items: ExperienceSynthesisPreviewItem[],
  maxCount: number,
): {
  selectedItems: ExperienceSynthesisPreviewItem[];
  sameFamilyCount: number;
  similarCount: number;
  selectedSameFamilyCount: number;
  selectedSimilarCount: number;
} {
  const normalizedMaxCount = Number.isInteger(maxCount) && maxCount > 0 ? maxCount : getExperienceSynthesisMaxSimilarSources();
  const sameFamilyItems: ExperienceSynthesisPreviewItem[] = [];
  const similarItems: ExperienceSynthesisPreviewItem[] = [];
  for (const item of Array.isArray(items) ? items : []) {
    const relation = normalizeText(item?.relation).toLowerCase();
    if (relation === "same_family") {
      sameFamilyItems.push(item);
      continue;
    }
    similarItems.push(item);
  }
  const selectedSameFamilyItems = sameFamilyItems.slice(0, normalizedMaxCount);
  const selectedSimilarItems = similarItems.slice(0, Math.max(0, normalizedMaxCount - selectedSameFamilyItems.length));
  return {
    selectedItems: [...selectedSameFamilyItems, ...selectedSimilarItems],
    sameFamilyCount: sameFamilyItems.length,
    similarCount: similarItems.length,
    selectedSameFamilyCount: selectedSameFamilyItems.length,
    selectedSimilarCount: selectedSimilarItems.length,
  };
}

function buildExperienceSynthesisUserPrompt(input: {
  templateId: string;
  seedCandidate: ExperienceCandidate;
  sourceCandidates: ExperienceCandidate[];
}): string {
  const sourcePayloadInfo = buildExperienceSynthesisSourcePayload(input.sourceCandidates);
  const sourcePayload = sourcePayloadInfo.text;

  return [
    `candidateType: ${input.seedCandidate.type}`,
    `templateId: ${input.templateId}`,
    `seedCandidateId: ${input.seedCandidate.id}`,
    `seedCandidateTitle: ${input.seedCandidate.title}`,
    `sourceCount: ${input.sourceCandidates.length}`,
    `sourceContentBudget: ${sourcePayloadInfo.totalBudget}`,
    `sourceContentCharsUsed: ${sourcePayloadInfo.usedChars}`,
    "",
    "要求：",
    "1. 生成一个新的、更完整的 draft，而不是拼接原文。",
    "2. 优先保留多个草稿反复出现的稳定共性。",
    "3. 如果不同草稿存在冲突，输出更稳妥、更通用、边界更清晰的版本。",
    "4. content 必须是完整 markdown，并满足后续 publish 校验。",
    "5. title / summary / content 三个字段都必须填写。",
    "",
    sourcePayload,
  ].join("\n");
}

function buildExperienceSynthesisSourcePayload(sourceCandidates: ExperienceCandidate[]): {
  text: string;
  usedChars: number;
  totalBudget: number;
} {
  const candidates = Array.isArray(sourceCandidates) ? sourceCandidates : [];
  if (!candidates.length) {
    return {
      text: "",
      usedChars: 0,
      totalBudget: getExperienceSynthesisTotalSourceContentCharBudget(),
    };
  }

  const totalBudget = getExperienceSynthesisTotalSourceContentCharBudget();
  const perCandidateMaxChars = getExperienceSynthesisMaxSourceContentChars();
  const perCandidateContentLimit = Math.min(
    perCandidateMaxChars,
    Math.max(600, Math.floor(totalBudget / candidates.length)),
  );
  let usedChars = 0;
  const sections = candidates.map((candidate, index) => {
    const snapshot = candidate.sourceTaskSnapshot && typeof candidate.sourceTaskSnapshot === "object"
      ? candidate.sourceTaskSnapshot as unknown as Record<string, unknown>
      : {};
    const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];
    const toolNames = toolCalls.length > 0
      ? toolCalls.map((item) => normalizeText((item as { toolName?: unknown } | null | undefined)?.toolName)).filter(Boolean)
      : [];
    const contentExcerpt = truncateText(candidate.content, perCandidateContentLimit);
    usedChars += contentExcerpt.length;
    return [
      `## Source ${index + 1}`,
      `- candidateId: ${candidate.id}`,
      `- type: ${candidate.type}`,
      `- taskId: ${candidate.taskId}`,
      `- sourceTaskId: ${normalizeText(snapshot.taskId) || candidate.taskId}`,
      `- title: ${candidate.title}`,
      `- slug: ${candidate.slug}`,
      `- summary: ${candidate.summary || "-"}`,
      `- objective: ${normalizeText(snapshot.objective) || "-"}`,
      `- taskSummary: ${normalizeText(snapshot.summary) || "-"}`,
      `- reflection: ${normalizeText(snapshot.reflection) || "-"}`,
      `- outcome: ${normalizeText(snapshot.outcome) || "-"}`,
      `- tools: ${toolNames.join(", ") || "-"}`,
      "",
      "### Draft Content",
      contentExcerpt,
    ].join("\n");
  }).join("\n\n");

  return {
    text: sections,
    usedChars,
    totalBudget,
  };
}

const EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD = 12;
const EXPERIENCE_SYNTHESIS_LARGE_PROMPT_CHAR_WARN_THRESHOLD = 28_000;

function buildExperienceSynthesisScaleWarning(input: {
  requestedSourceCount: number;
  orderedSourceCount: number;
  sourceCandidates: ExperienceCandidate[];
  systemPrompt: string;
  userPrompt: string;
}): Record<string, unknown> | null {
  const requestedSourceCount = input.requestedSourceCount;
  const orderedSourceCount = input.orderedSourceCount;
  const sourceCount = input.sourceCandidates.length;
  const systemPromptLength = input.systemPrompt.length;
  const userPromptLength = input.userPrompt.length;
  const promptLength = systemPromptLength + userPromptLength;
  const sourcePayloadInfo = buildExperienceSynthesisSourcePayload(input.sourceCandidates);
  const reasons: string[] = [];
  if (requestedSourceCount >= EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD) {
    reasons.push(`requestedSourceCount>=${EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD}`);
  }
  if (orderedSourceCount >= EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD) {
    reasons.push(`orderedSourceCount>=${EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD}`);
  }
  if (sourceCount >= EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD) {
    reasons.push(`sourceCount>=${EXPERIENCE_SYNTHESIS_LARGE_SOURCE_COUNT_WARN_THRESHOLD}`);
  }
  if (promptLength >= EXPERIENCE_SYNTHESIS_LARGE_PROMPT_CHAR_WARN_THRESHOLD) {
    reasons.push(`promptLength>=${EXPERIENCE_SYNTHESIS_LARGE_PROMPT_CHAR_WARN_THRESHOLD}`);
  }
  if (!reasons.length) {
    return null;
  }
  return {
    reason: reasons.join(", "),
    requestedSourceCount,
    orderedSourceCount,
    sourceCount,
    systemPromptLength,
    userPromptLength,
    promptLength,
    sourceContentBudget: sourcePayloadInfo.totalBudget,
    sourceContentCharsUsed: sourcePayloadInfo.usedChars,
    candidateIdsSample: input.sourceCandidates.slice(0, 8).map((candidate) => candidate.id),
  };
}

async function callPrimaryModelForExperienceSynthesis(input: {
  ctx: MemoryExperienceMethodContext;
  system: string;
  user: string;
}): Promise<string> {
  if (typeof input.ctx.callPrimaryModel === "function") {
    return await input.ctx.callPrimaryModel({
      system: input.system,
      user: input.user,
      maxTokens: 8_000,
      model: input.ctx.primaryModelConfig?.model,
      thinking: input.ctx.primaryModelConfig?.thinking,
      reasoningEffort: input.ctx.primaryModelConfig?.reasoningEffort,
    });
  }

  const config = input.ctx.primaryModelConfig;
  if (!config?.baseUrl || !config.apiKey || !config.model) {
    throw new Error("Primary model is not configured for experience synthesis.");
  }

  const payload: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    temperature: 0.2,
    max_tokens: 8_000,
  };
  if (config.thinking) {
    payload.thinking = config.thinking;
  }
  if (config.reasoningEffort) {
    payload.reasoning_effort = config.reasoningEffort;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Experience synthesis model call timed out after ${EXPERIENCE_SYNTHESIS_MODEL_CALL_TIMEOUT_MS}ms.`));
  }, EXPERIENCE_SYNTHESIS_MODEL_CALL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildOpenAIChatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Experience synthesis model call timed out after ${EXPERIENCE_SYNTHESIS_MODEL_CALL_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Experience synthesis model call failed: ${response.status} ${truncateText(text, 200)}`.trim());
  }
  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string | null; type?: string | null }> | null;
        reasoning_content?: string | null;
      };
      finish_reason?: string | null;
    }>;
  };
  const choice = data.choices?.[0];
  const content = extractExperienceSynthesisResponseText(choice?.message?.content);
  if (!content) {
    const reasoningContent = normalizeText(choice?.message?.reasoning_content);
    const finishReason = normalizeText(choice?.finish_reason);
    throw new Error(
      `Experience synthesis model returned empty content. finish_reason=${finishReason || "unknown"}, reasoning_content=${reasoningContent ? `present(${reasoningContent.length})` : "absent"}.`,
    );
  }
  return content;
}

function extractExperienceSynthesisResponseText(
  content: string | Array<{ text?: string | null; type?: string | null }> | null | undefined,
): string {
  if (typeof content === "string") {
    return normalizeText(content);
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const chunks: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    if (typeof part.text === "string" && part.text.trim()) {
      chunks.push(part.text.trim());
    }
  }
  return normalizeText(chunks.join("\n"));
}

function parseExperienceSynthesisModelOutput(raw: string): { title: string; summary: string; slug: string; content: string } {
  const extracted = normalizeJsonCandidate(raw);
  const parsed = JSON.parse(extracted) as Record<string, unknown>;
  const title = normalizeText(parsed.title);
  const summary = normalizeText(parsed.summary);
  const slug = normalizeText(parsed.slug);
  const content = normalizeText(parsed.content);
  if (!content) {
    throw new Error("Synthesized candidate content is empty.");
  }
  return {
    title,
    summary,
    slug,
    content,
  };
}

function summarizeExperienceSynthesisError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: truncateText(error.stack || "", 1200),
    };
  }
  return {
    message: String(error),
  };
}

function normalizeJsonCandidate(raw: string): string {
  const direct = stripMarkdownFence(stripReasoningArtifacts(raw));
  if (direct.startsWith("{") && direct.endsWith("}")) {
    return direct;
  }

  const extracted = extractFirstJsonObject(direct);
  if (extracted) {
    return extracted;
  }
  throw new Error(`Model did not return a valid JSON object. Preview: ${truncateText(raw, 160)}`);
}

function stripMarkdownFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function stripReasoningArtifacts(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function extractFirstJsonObject(value: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (start < 0) {
      if (char === "{") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function readExperienceSynthesisSummary(type: ExperienceCandidateType, content: string): string {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatterBody = frontmatter?.[1] || "";
  const preferredKey = type === "skill" ? "description" : "summary";
  const frontmatterValue = readFrontmatterValue(frontmatterBody, preferredKey)
    || readFrontmatterValue(frontmatterBody, "summary");
  if (frontmatterValue) {
    return frontmatterValue;
  }
  const blockquoteLine = content.match(/^>\s+(.+)$/m)?.[1]?.trim();
  if (blockquoteLine) {
    return blockquoteLine;
  }
  const paragraph = content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .split(/\r?\n\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("#"));
  return paragraph || "";
}

function readFrontmatterValue(frontmatter: string, key: string): string {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+)$`, "im");
  const match = frontmatter.match(pattern);
  if (!match) {
    return "";
  }
  return String(match[1] ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function truncateText(value: string | undefined, maxLength = 2800): string {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    : normalized;
}

function buildOpenAIChatCompletionsUrl(baseUrl: string): string {
  const trimmed = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "/v1/chat/completions";
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }
  return /\/v\d+$/.test(trimmed)
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ok(id: string, payload: Record<string, unknown>): GatewayResFrame {
  return { type: "res", id, ok: true, payload };
}

function invalid(id: string, message: string): GatewayResFrame {
  return { type: "res", id, ok: false, error: { code: "invalid_params", message } };
}

function notAvailable(id: string): GatewayResFrame {
  return { type: "res", id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
}

function notFound(id: string, message: string): GatewayResFrame {
  return { type: "res", id, ok: false, error: { code: "not_found", message } };
}

function failure(id: string, code: string, error: unknown): GatewayResFrame {
  return {
    type: "res",
    id,
    ok: false,
    error: { code, message: error instanceof Error ? error.message : String(error) },
  };
}
