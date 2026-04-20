import type { AgentRegistry } from "@belldandy/agent";
import type { GatewayReqFrame, GatewayResFrame } from "@belldandy/protocol";
import { createTaskWorkSurface, getGlobalMemoryManager } from "@belldandy/memory";
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
};

export async function handleMemoryExperienceMethod(
  req: GatewayReqFrame,
  ctx: MemoryExperienceMethodContext,
): Promise<GatewayResFrame | null> {
  if (!req.method.startsWith("memory.") && !req.method.startsWith("experience.")) {
    return null;
  }

  const params = isObjectRecord(req.params) ? req.params : {};

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
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceCandidates(limit, filter as any);
      const skillFreshnessSnapshot = await buildScopedSkillFreshnessSnapshot(ctx.stateDir, manager);
      return ok(req.id, {
        items: items.map((item) => attachSkillFreshnessToCandidatePayload(
          toExperienceCandidatePayloadItem(item, residentPolicy),
          item,
          skillFreshnessSnapshot,
        )),
        limit,
        queryView: buildResidentMemoryQueryView(residentPolicy),
      });
    }

    case "experience.candidate.accept": {
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
            message: `Experience candidate can only be accepted from draft status. Current status: ${existing.status}.`,
          },
        };
      }
      if (isExperiencePublishConfirmationRequired(existing.type)) {
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
