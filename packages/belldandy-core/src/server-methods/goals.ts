import type { GatewayReqFrame, GatewayResFrame } from "@belldandy/protocol";

import { buildLearningReviewInput } from "../learning-review-input.js";
import { buildMindProfileSnapshot } from "../mind-profile-snapshot.js";
import type { GoalManager } from "../goals/manager.js";
import type { ScopedMemoryManagerRecord } from "../resident-memory-managers.js";

type GoalsMethodContext = {
  goalManager?: GoalManager;
  stateDir: string;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  parseGoalTaskCheckpointStatus: (value: unknown) => "not_required" | "required" | "waiting_user" | "approved" | "rejected" | "expired" | undefined;
  parseGoalTaskCreateStatus: (value: unknown) => "draft" | "ready" | "blocked" | "skipped" | undefined;
};

const SUGGESTION_TYPES = ["method_candidate", "skill_candidate", "flow_pattern"] as const;

export async function handleGoalMethod(
  req: GatewayReqFrame,
  ctx: GoalsMethodContext,
): Promise<GatewayResFrame | null> {
  if (!req.method.startsWith("goal.")) {
    return null;
  }

  if (!ctx.goalManager) {
    return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
  }

  const params = asRecord(req.params);

  switch (req.method) {
    case "goal.create": {
      const title = readRequiredString(params, "title");
      if (!title) return invalid(req.id, "title is required");
      try {
        const goal = await ctx.goalManager.createGoal({
          title,
          objective: readOptionalString(params, "objective"),
          slug: readOptionalString(params, "slug"),
          goalRoot: readOptionalString(params, "goalRoot"),
        });
        return { type: "res", id: req.id, ok: true, payload: { goal, conversationId: goal.activeConversationId } };
      } catch (err) {
        return failure(req.id, "goal_create_failed", err);
      }
    }

    case "goal.list": {
      const goals = await ctx.goalManager.listGoals();
      return { type: "res", id: req.id, ok: true, payload: { goals } };
    }

    case "goal.get": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      const goal = await ctx.goalManager.getGoal(goalId);
      if (!goal) return notFound(req.id, "Goal not found.");
      return { type: "res", id: req.id, ok: true, payload: { goal } };
    }

    case "goal.resume": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const result = await ctx.goalManager.resumeGoal(goalId, readOptionalString(params, "nodeId"), {
          checkpointId: readOptionalString(params, "checkpointId"),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_resume_failed", err);
      }
    }

    case "goal.pause": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const goal = await ctx.goalManager.pauseGoal(goalId);
        return { type: "res", id: req.id, ok: true, payload: { goal } };
      } catch (err) {
        return failure(req.id, "goal_pause_failed", err);
      }
    }

    case "goal.handoff.get": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.getHandoff.bind(ctx.goalManager), "goal_handoff_get_failed");
    }

    case "goal.handoff.generate": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.generateHandoff.bind(ctx.goalManager), "goal_handoff_generate_failed");
    }

    case "goal.retrospect.generate": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.generateRetrospective.bind(ctx.goalManager), "goal_retrospect_generate_failed");
    }

    case "goal.experience.suggest": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.generateExperienceSuggestions.bind(ctx.goalManager), "goal_experience_suggest_failed");
    }

    case "goal.method_candidates.generate": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.generateMethodCandidates.bind(ctx.goalManager), "goal_method_candidates_generate_failed");
    }

    case "goal.skill_candidates.generate": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.generateSkillCandidates.bind(ctx.goalManager), "goal_skill_candidates_generate_failed");
    }

    case "goal.flow_patterns.generate": {
      return callGoalOnly(req.id, params, "goalId is required", ctx.goalManager.generateFlowPatterns.bind(ctx.goalManager), "goal_flow_patterns_generate_failed");
    }

    case "goal.flow_patterns.cross_goal": {
      try {
        const result = await ctx.goalManager.generateCrossGoalFlowPatterns();
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_cross_goal_flow_patterns_generate_failed", err);
      }
    }

    case "goal.review_governance.summary": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const summary = await ctx.goalManager.getReviewGovernanceSummary(goalId);
        const mindProfileSnapshot = await buildMindProfileSnapshot({
          stateDir: ctx.stateDir,
          residentMemoryManagers: ctx.residentMemoryManagers,
          agentId: readOptionalString(params, "agentId"),
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
        return failure(req.id, "goal_review_governance_summary_failed", err);
      }
    }

    case "goal.approval.scan": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const result = await ctx.goalManager.scanApprovalWorkflows(goalId, {
          now: readOptionalString(params, "now"),
          autoEscalate: params.autoEscalate === true,
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_approval_scan_failed", err);
      }
    }

    case "goal.suggestion_review.list": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const reviews = await ctx.goalManager.listSuggestionReviews(goalId);
        return { type: "res", id: req.id, ok: true, payload: { reviews } };
      } catch (err) {
        return failure(req.id, "goal_suggestion_review_list_failed", err);
      }
    }

    case "goal.suggestion_review.workflow.set": {
      const goalId = readRequiredString(params, "goalId");
      const mode = readRequiredString(params, "mode");
      const suggestionType = readOptionalString(params, "suggestionType");
      if (!goalId || !mode) return invalid(req.id, "goalId and mode are required");
      if (!["single", "chain", "quorum"].includes(mode)) return invalid(req.id, "mode is invalid");
      if (suggestionType && !isSuggestionType(suggestionType)) return invalid(req.id, "suggestionType is invalid");
      try {
        const result = await ctx.goalManager.configureSuggestionReviewWorkflow(goalId, {
          reviewId: readOptionalString(params, "reviewId"),
          suggestionType: suggestionType as typeof SUGGESTION_TYPES[number] | undefined,
          suggestionId: readOptionalString(params, "suggestionId"),
          mode: mode as "single" | "chain" | "quorum",
          reviewers: readStringArray(params.reviewers),
          reviewerRoles: readStringArray(params.reviewerRoles),
          minApprovals: readFiniteNumber(params.minApprovals),
          stages: Array.isArray(params.stages)
            ? params.stages.map((item) => {
              const stage = asRecord(item);
              return {
                title: readOptionalString(stage, "title"),
                reviewers: readStringArray(stage.reviewers) ?? [],
                reviewerRoles: readStringArray(stage.reviewerRoles),
                minApprovals: readFiniteNumber(stage.minApprovals),
                slaHours: readFiniteNumber(stage.slaHours),
              };
            }).filter((item) => item.reviewers.length > 0)
            : undefined,
          slaHours: readFiniteNumber(params.slaHours),
          escalationMode: typeof params.escalationMode === "string" && (params.escalationMode === "none" || params.escalationMode === "manual")
            ? params.escalationMode
            : undefined,
          escalationReviewer: readOptionalString(params, "escalationReviewer"),
          note: readOptionalString(params, "note"),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_suggestion_review_workflow_set_failed", err);
      }
    }

    case "goal.suggestion_review.decide": {
      const goalId = readRequiredString(params, "goalId");
      const decision = readRequiredString(params, "decision");
      const suggestionType = readOptionalString(params, "suggestionType");
      if (!goalId || !decision) return invalid(req.id, "goalId and decision are required");
      if (!["accepted", "rejected", "deferred", "needs_revision"].includes(decision)) return invalid(req.id, "decision is invalid");
      if (suggestionType && !isSuggestionType(suggestionType)) return invalid(req.id, "suggestionType is invalid");
      try {
        const result = await ctx.goalManager.decideSuggestionReview(goalId, {
          reviewId: readOptionalString(params, "reviewId"),
          suggestionType: suggestionType as typeof SUGGESTION_TYPES[number] | undefined,
          suggestionId: readOptionalString(params, "suggestionId"),
          decision: decision as "accepted" | "rejected" | "deferred" | "needs_revision",
          reviewer: readOptionalString(params, "reviewer"),
          decidedBy: readOptionalString(params, "decidedBy"),
          note: readOptionalString(params, "note"),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_suggestion_review_decide_failed", err);
      }
    }

    case "goal.suggestion_review.escalate": {
      const goalId = readRequiredString(params, "goalId");
      const suggestionType = readOptionalString(params, "suggestionType");
      if (!goalId) return invalid(req.id, "goalId is required");
      if (suggestionType && !isSuggestionType(suggestionType)) return invalid(req.id, "suggestionType is invalid");
      try {
        const result = await ctx.goalManager.escalateSuggestionReview(goalId, {
          reviewId: readOptionalString(params, "reviewId"),
          suggestionType: suggestionType as typeof SUGGESTION_TYPES[number] | undefined,
          suggestionId: readOptionalString(params, "suggestionId"),
          escalatedBy: readOptionalString(params, "escalatedBy"),
          escalatedTo: readOptionalString(params, "escalatedTo"),
          reason: readOptionalString(params, "reason"),
          force: Boolean(params.force),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_suggestion_review_escalate_failed", err);
      }
    }

    case "goal.suggestion_review.scan": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const result = await ctx.goalManager.scanSuggestionReviewWorkflows(goalId, {
          now: readOptionalString(params, "now"),
          autoEscalate: Boolean(params.autoEscalate),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_suggestion_review_scan_failed", err);
      }
    }

    case "goal.suggestion.publish": {
      const goalId = readRequiredString(params, "goalId");
      const suggestionType = readOptionalString(params, "suggestionType");
      if (!goalId) return invalid(req.id, "goalId is required");
      if (suggestionType && !isSuggestionType(suggestionType)) return invalid(req.id, "suggestionType is invalid");
      try {
        const result = await ctx.goalManager.publishSuggestion(goalId, {
          reviewId: readOptionalString(params, "reviewId"),
          suggestionType: suggestionType as typeof SUGGESTION_TYPES[number] | undefined,
          suggestionId: readOptionalString(params, "suggestionId"),
          reviewer: readOptionalString(params, "reviewer"),
          decidedBy: readOptionalString(params, "decidedBy"),
          note: readOptionalString(params, "note"),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_suggestion_publish_failed", err);
      }
    }

    case "goal.checkpoint.list": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const checkpoints = await ctx.goalManager.listCheckpoints(goalId);
        return { type: "res", id: req.id, ok: true, payload: { checkpoints } };
      } catch (err) {
        return failure(req.id, "goal_checkpoint_list_failed", err);
      }
    }

    case "goal.checkpoint.request":
    case "goal.checkpoint.approve":
    case "goal.checkpoint.reject":
    case "goal.checkpoint.expire":
    case "goal.checkpoint.reopen":
    case "goal.checkpoint.escalate": {
      const goalId = readRequiredString(params, "goalId");
      const nodeId = readRequiredString(params, "nodeId");
      if (!goalId || !nodeId) return invalid(req.id, "goalId and nodeId are required");
      try {
        const payload = {
          checkpointId: readOptionalString(params, "checkpointId"),
          title: readOptionalString(params, "title"),
          summary: readOptionalString(params, "summary"),
          note: readOptionalString(params, "note"),
          reviewer: readOptionalString(params, "reviewer"),
          reviewerRole: readOptionalString(params, "reviewerRole"),
          requestedBy: readOptionalString(params, "requestedBy"),
          decidedBy: readOptionalString(params, "decidedBy"),
          slaAt: readOptionalString(params, "slaAt"),
          runId: readOptionalString(params, "runId"),
          escalatedBy: readOptionalString(params, "escalatedBy"),
          escalatedTo: readOptionalString(params, "escalatedTo"),
          reason: readOptionalString(params, "reason"),
          force: Boolean(params.force),
        };
        const result = req.method === "goal.checkpoint.request"
          ? await ctx.goalManager.requestCheckpoint(goalId, nodeId, payload)
          : req.method === "goal.checkpoint.approve"
            ? await ctx.goalManager.approveCheckpoint(goalId, nodeId, payload)
            : req.method === "goal.checkpoint.reject"
              ? await ctx.goalManager.rejectCheckpoint(goalId, nodeId, payload)
              : req.method === "goal.checkpoint.expire"
                ? await ctx.goalManager.expireCheckpoint(goalId, nodeId, payload)
                : req.method === "goal.checkpoint.reopen"
                  ? await ctx.goalManager.reopenCheckpoint(goalId, nodeId, payload)
                  : await ctx.goalManager.escalateCheckpoint(goalId, nodeId, payload);
        return okPayload(req.id, result);
      } catch (err) {
        const code = req.method.replace(/\./g, "_").replace("goal_", "goal_").replace("checkpoint_", "checkpoint_");
        return failure(req.id, `${code}_failed`, err);
      }
    }

    case "goal.task_graph.read": {
      const goalId = readRequiredString(params, "goalId");
      if (!goalId) return invalid(req.id, "goalId is required");
      try {
        const graph = await ctx.goalManager.readTaskGraph(goalId);
        return { type: "res", id: req.id, ok: true, payload: { graph } };
      } catch (err) {
        return failure(req.id, "goal_task_graph_read_failed", err);
      }
    }

    case "goal.task_graph.create": {
      const goalId = readRequiredString(params, "goalId");
      const title = readRequiredString(params, "title");
      if (!goalId || !title) return invalid(req.id, "goalId and title are required");
      try {
        const result = await ctx.goalManager.createTaskNode(goalId, {
          id: readOptionalString(params, "nodeId"),
          title,
          description: readOptionalString(params, "description"),
          phase: readOptionalString(params, "phase"),
          owner: readOptionalString(params, "owner"),
          dependsOn: readArrayAsStrings(params.dependsOn),
          acceptance: readArrayAsStrings(params.acceptance),
          checkpointRequired: typeof params.checkpointRequired === "boolean" ? params.checkpointRequired : undefined,
          checkpointStatus: ctx.parseGoalTaskCheckpointStatus(params.checkpointStatus),
          status: ctx.parseGoalTaskCreateStatus(params.status),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_task_graph_create_failed", err);
      }
    }

    case "goal.task_graph.update": {
      const goalId = readRequiredString(params, "goalId");
      const nodeId = readRequiredString(params, "nodeId");
      if (!goalId || !nodeId) return invalid(req.id, "goalId and nodeId are required");
      try {
        const result = await ctx.goalManager.updateTaskNode(goalId, nodeId, {
          title: readOptionalString(params, "title"),
          description: typeof params.description === "string" ? params.description : undefined,
          phase: typeof params.phase === "string" ? params.phase : undefined,
          owner: typeof params.owner === "string" ? params.owner : undefined,
          dependsOn: readArrayAsStrings(params.dependsOn),
          acceptance: readArrayAsStrings(params.acceptance),
          artifacts: readArrayAsStrings(params.artifacts),
          checkpointRequired: typeof params.checkpointRequired === "boolean" ? params.checkpointRequired : undefined,
          checkpointStatus: ctx.parseGoalTaskCheckpointStatus(params.checkpointStatus),
        });
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, "goal_task_graph_update_failed", err);
      }
    }

    case "goal.task_graph.claim":
    case "goal.task_graph.pending_review":
    case "goal.task_graph.validating":
    case "goal.task_graph.complete":
    case "goal.task_graph.block":
    case "goal.task_graph.fail":
    case "goal.task_graph.skip": {
      const goalId = readRequiredString(params, "goalId");
      const nodeId = readRequiredString(params, "nodeId");
      if (!goalId || !nodeId) return invalid(req.id, "goalId and nodeId are required");
      const blockReason = readOptionalString(params, "blockReason");
      if (req.method === "goal.task_graph.block" && !blockReason) return invalid(req.id, "goalId, nodeId and blockReason are required");
      try {
        const payload = {
          owner: readOptionalString(params, "owner"),
          summary: readOptionalString(params, "summary"),
          blockReason,
          artifacts: readArrayAsStrings(params.artifacts),
          checkpointStatus: ctx.parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: readOptionalString(params, "runId"),
        };
        const result = req.method === "goal.task_graph.claim"
          ? await ctx.goalManager.claimTaskNode(goalId, nodeId, payload)
          : req.method === "goal.task_graph.pending_review"
            ? await ctx.goalManager.markTaskNodePendingReview(goalId, nodeId, payload)
            : req.method === "goal.task_graph.validating"
              ? await ctx.goalManager.markTaskNodeValidating(goalId, nodeId, payload)
              : req.method === "goal.task_graph.complete"
                ? await ctx.goalManager.completeTaskNode(goalId, nodeId, payload)
                : req.method === "goal.task_graph.block"
                  ? await ctx.goalManager.blockTaskNode(goalId, nodeId, payload)
                  : req.method === "goal.task_graph.fail"
                    ? await ctx.goalManager.failTaskNode(goalId, nodeId, payload)
                    : await ctx.goalManager.skipTaskNode(goalId, nodeId, payload);
        return okPayload(req.id, result);
      } catch (err) {
        return failure(req.id, `${req.method.replace(/\./g, "_")}_failed`, err);
      }
    }

    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRequiredString(params: Record<string, unknown>, key: string): string {
  return typeof params[key] === "string" ? params[key].trim() : "";
}

function readOptionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = readRequiredString(params, key);
  return value || undefined;
}

function readArrayAsStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isSuggestionType(value: string): value is typeof SUGGESTION_TYPES[number] {
  return (SUGGESTION_TYPES as readonly string[]).includes(value);
}

function invalid(id: string, message: string): GatewayResFrame {
  return { type: "res", id, ok: false, error: { code: "invalid_params", message } };
}

function notFound(id: string, message: string): GatewayResFrame {
  return { type: "res", id, ok: false, error: { code: "not_found", message } };
}

function okPayload(id: string, payload: unknown): GatewayResFrame {
  return { type: "res", id, ok: true, payload: payload as Record<string, unknown> };
}

function failure(id: string, code: string, error: unknown): GatewayResFrame {
  return {
    type: "res",
    id,
    ok: false,
    error: { code, message: error instanceof Error ? error.message : String(error) },
  };
}

async function callGoalOnly(
  id: string,
  params: Record<string, unknown>,
  missingMessage: string,
  fn: (goalId: string) => Promise<any>,
  errorCode: string,
): Promise<GatewayResFrame> {
  const goalId = readRequiredString(params, "goalId");
  if (!goalId) return invalid(id, missingMessage);
  try {
    return okPayload(id, await fn(goalId));
  } catch (err) {
    return failure(id, errorCode, err);
  }
}
