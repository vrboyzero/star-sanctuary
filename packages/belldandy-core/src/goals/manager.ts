import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "@belldandy/protocol";
import { getGlobalMemoryManager, type ExperienceCandidate } from "@belldandy/memory";
import { publishSkillCandidate, getGlobalSkillRegistry } from "@belldandy/skills";
import { getGoalUpdateAreas } from "./goal-events.js";
import { normalizeGoalId, normalizeGoalSlug, resolveGoalPaths } from "./paths.js";
import { generateGoalHandoff } from "./handoff.js";
import { generateGoalMethodCandidates } from "./method-candidates.js";
import { appendGoalProgressEntry } from "./progress.js";
import { generateGoalRetrospective } from "./retrospective.js";
import { generateGoalSkillCandidates } from "./skill-candidates.js";
import { generateGoalFlowPatterns } from "./flow-patterns.js";
import { generateCrossGoalFlowPatterns } from "./cross-goal-flow-patterns.js";
import { getGoalRegistryEntry, listGoalRegistryEntries, upsertGoalRegistryEntry } from "./registry.js";
import { scaffoldGoalFiles } from "./scaffold.js";
import { createGoalConversationId, createGoalNodeConversationId, createGoalRunId } from "./session.js";
import { analyzeGoalCapabilityPlan, getDefaultCapabilityPlanAnalysis } from "./capability-analysis.js";
import {
  getGoalFlowPatternsPath,
  getGoalMethodCandidatesPath,
  getGoalPublishRecordsPath,
  getGoalSkillCandidatesPath,
  readGoalCapabilityPlans,
  readGoalCheckpoints,
  readGoalFlowPatterns,
  readGoalMethodCandidates,
  readGoalRuntime,
  readGoalSkillCandidates,
  readGoalSuggestionReviews,
  readGoalPublishRecords,
  writeGoalCapabilityPlans,
  writeGoalCheckpoints,
  writeGoalRuntime,
  writeGoalPublishRecords,
  writeGoalSuggestionReviews,
} from "./runtime.js";
import { createGoalTaskNode, readGoalTaskGraph, transitionGoalTaskNode, updateGoalTaskNode, writeGoalTaskGraph } from "./task-graph.js";
import type {
  GoalCapabilityPlan,
  GoalExperienceSuggestResult,
  GoalReviewGovernanceSummary,
  GoalSuggestionReviewEscalateInput,
  GoalSuggestionReviewDecisionInput,
  GoalSuggestionReviewItem,
  GoalSuggestionReviewMutationResult,
  GoalSuggestionReviewState,
  GoalSuggestionReviewStatus,
  GoalSuggestionReviewWorkflow,
  GoalSuggestionReviewWorkflowConfigureInput,
  GoalSuggestionReviewWorkflowDecision,
  GoalSuggestionReviewWorkflowEscalation,
  GoalSuggestionReviewWorkflowMode,
  GoalSuggestionReviewWorkflowReviewer,
  GoalSuggestionReviewWorkflowStage,
  GoalSuggestionReviewWorkflowStageInput,
  GoalSuggestionReviewWorkflowVote,
  GoalSuggestionPublishInput,
  GoalSuggestionPublishMutationResult,
  GoalSuggestionPublishRecord,
  GoalSuggestionPublishState,
  GoalSuggestionType,
  GoalCrossFlowPatternGenerateResult,
  GoalHandoffGenerateResult,
  GoalMethodCandidateGenerateResult,
  GoalRetrospectiveGenerateResult,
  GoalSkillCandidateGenerateResult,
  GoalFlowPatternGenerateResult,
  GoalCapabilityPlanSaveInput,
  GoalCapabilityPlanState,
  GoalCheckpointPolicy,
  GoalCheckpointDecisionInput,
  GoalCheckpointHistoryEntry,
  GoalCheckpointItem,
  GoalCheckpointRequestInput,
  GoalCheckpointState,
  GoalScaffoldInput,
  GoalTaskGraph,
  GoalTaskNode,
  GoalTaskNodeCreateInput,
  GoalTaskNodeTransitionInput,
  GoalTaskNodeUpdateInput,
  GoalUpdateEvent,
  GoalUpdateReason,
  LongTermGoal,
} from "./types.js";

type GoalTaskMutationResult = {
  goal: LongTermGoal;
  graph: GoalTaskGraph;
  node: GoalTaskNode;
};

type GoalCheckpointMutationResult = GoalTaskMutationResult & {
  checkpoints: GoalCheckpointState;
  checkpoint: GoalCheckpointItem;
};

export class GoalManager {
  private eventSink?: (event: GoalUpdateEvent) => void | Promise<void>;

  constructor(private readonly stateDir = resolveStateDir(process.env)) {}

  setEventSink(sink?: (event: GoalUpdateEvent) => void | Promise<void>): void {
    this.eventSink = sink;
  }

  async createGoal(input: GoalScaffoldInput): Promise<LongTermGoal> {
    const now = new Date().toISOString();
    const slug = normalizeGoalSlug(input.slug || input.title);
    const id = `goal_${normalizeGoalId(slug || crypto.randomUUID().slice(0, 8))}`;
    const paths = resolveGoalPaths({
      stateDir: this.stateDir,
      slug,
      goalId: id,
      goalRoot: input.goalRoot,
    });

    const goal: LongTermGoal = {
      id,
      slug,
      title: input.title.trim(),
      status: "planning",
      objective: input.objective?.trim() || undefined,
      currentPhase: input.currentPhase ?? "aligning",
      goalRoot: paths.goalRoot,
      runtimeRoot: paths.runtimeRoot,
      docRoot: paths.docRoot,
      northstarPath: paths.northstarPath,
      tasksPath: paths.tasksPath,
      progressPath: paths.progressPath,
      handoffPath: paths.handoffPath,
      registryPath: paths.registryPath,
      pathSource: paths.pathSource,
      boardId: `${id}_main`,
      createdAt: now,
      updatedAt: now,
      activeConversationId: createGoalConversationId(id),
    };

    await scaffoldGoalFiles(goal);
    await upsertGoalRegistryEntry(this.stateDir, goal);
    return goal;
  }

  async listGoals(): Promise<LongTermGoal[]> {
    return listGoalRegistryEntries(this.stateDir);
  }

  async getGoal(goalId: string): Promise<LongTermGoal | null> {
    return getGoalRegistryEntry(this.stateDir, goalId);
  }

  async resumeGoal(goalId: string, nodeId?: string): Promise<{ goal: LongTermGoal; conversationId: string; runId?: string }> {
    const goal = await this.requireGoal(goalId);
    const runId = nodeId ? createGoalRunId() : undefined;
    const conversationId = nodeId
      ? createGoalNodeConversationId(goal.id, nodeId, runId)
      : createGoalConversationId(goal.id);
    const now = new Date().toISOString();
    const updatedGoal: LongTermGoal = {
      ...goal,
      status: "executing",
      activeConversationId: conversationId,
      activeNodeId: nodeId,
      lastNodeId: nodeId ?? goal.lastNodeId,
      lastRunId: runId ?? goal.lastRunId,
      lastActiveAt: now,
      pausedAt: undefined,
      updatedAt: now,
    };
    await upsertGoalRegistryEntry(this.stateDir, updatedGoal);
    await writeGoalRuntime(updatedGoal, {
      ...(await readGoalRuntime(updatedGoal)),
      goalId: updatedGoal.id,
      status: updatedGoal.status,
      activeConversationId: conversationId,
      activeNodeId: nodeId,
      lastNodeId: updatedGoal.lastNodeId,
      lastRunId: updatedGoal.lastRunId,
      resumedAt: now,
      pausedAt: undefined,
      updatedAt: now,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "goal_resumed",
      nodeId,
      runId,
    });
    return { goal: updatedGoal, conversationId, runId };
  }

  async pauseGoal(goalId: string): Promise<LongTermGoal> {
    const goal = await this.requireGoal(goalId);
    const now = new Date().toISOString();
    const updatedGoal: LongTermGoal = {
      ...goal,
      status: "paused",
      pausedAt: now,
      activeConversationId: undefined,
      activeNodeId: undefined,
      lastNodeId: goal.activeNodeId ?? goal.lastNodeId,
      updatedAt: now,
    };
    await upsertGoalRegistryEntry(this.stateDir, updatedGoal);
    await writeGoalRuntime(updatedGoal, {
      ...(await readGoalRuntime(updatedGoal)),
      goalId: updatedGoal.id,
      status: updatedGoal.status,
      activeConversationId: undefined,
      activeNodeId: undefined,
      lastNodeId: updatedGoal.lastNodeId,
      lastRunId: updatedGoal.lastRunId,
      pausedAt: now,
      updatedAt: now,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "goal_paused",
      nodeId: updatedGoal.lastNodeId,
      runId: updatedGoal.lastRunId,
    });
    return updatedGoal;
  }

  async readTaskGraph(goalId: string): Promise<GoalTaskGraph> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    if (graph.version !== 2 || graph.goalId !== goal.id) {
      return writeGoalTaskGraph(goal, graph);
    }
    return graph;
  }

  async createTaskNode(goalId: string, input: GoalTaskNodeCreateInput): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = createGoalTaskNode(graph, input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal);
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_created",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.description,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_created",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async updateTaskNode(goalId: string, nodeId: string, patch: GoalTaskNodeUpdateInput): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = updateGoalTaskNode(graph, nodeId, patch);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal);
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_updated",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary ?? result.node.description,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_updated",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async claimTaskNode(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = transitionGoalTaskNode(graph, nodeId, "in_progress", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      status: "executing",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_claimed",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_claimed",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async markTaskNodePendingReview(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = transitionGoalTaskNode(graph, nodeId, "pending_review", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      status: "reviewing",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_pending_review",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_pending_review",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async markTaskNodeValidating(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = transitionGoalTaskNode(graph, nodeId, "validating", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      status: "reviewing",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_validating",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_validating",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async completeTaskNode(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const currentNode = graph.nodes.find((node) => node.id === nodeId);
    if (!currentNode) {
      throw new Error(`Task node not found: ${nodeId}`);
    }
    if (currentNode.checkpointRequired && currentNode.checkpointStatus !== "approved") {
      throw new Error(`Task node "${nodeId}" still requires an approved checkpoint before completion.`);
    }
    const result = transitionGoalTaskNode(graph, nodeId, "done", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      status: "executing",
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_completed",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_completed",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async blockTaskNode(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = transitionGoalTaskNode(graph, nodeId, "blocked", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
      status: "blocked",
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_blocked",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      note: result.node.blockReason,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_blocked",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async failTaskNode(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = transitionGoalTaskNode(graph, nodeId, "failed", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      status: "blocked",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_failed",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      note: result.node.blockReason,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_failed",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async skipTaskNode(goalId: string, nodeId: string, input: GoalTaskNodeTransitionInput = {}): Promise<GoalTaskMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const result = transitionGoalTaskNode(graph, nodeId, "skipped", input);
    const savedGraph = await writeGoalTaskGraph(goal, result.graph);
    const updatedGoal = await this.touchGoal(goal, {
      status: "executing",
      lastNodeId: nodeId,
      lastRunId: input.runId?.trim() || goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "task_node_skipped",
      title: result.node.title,
      nodeId: result.node.id,
      status: result.node.status,
      summary: result.node.summary,
      note: result.node.blockReason,
      runId: result.node.lastRunId,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "task_node_skipped",
      nodeId: result.node.id,
      runId: result.node.lastRunId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: result.node };
  }

  async listCheckpoints(goalId: string): Promise<GoalCheckpointState> {
    const goal = await this.requireGoal(goalId);
    return readGoalCheckpoints(goal);
  }

  async listSuggestionReviews(goalId: string): Promise<GoalSuggestionReviewState> {
    const goal = await this.requireGoal(goalId);
    return this.syncSuggestionReviews(goal);
  }

  async getReviewGovernanceSummary(goalId: string): Promise<GoalReviewGovernanceSummary> {
    const goal = await this.requireGoal(goalId);
    const [reviews, publishRecords, crossGoal] = await Promise.all([
      this.syncSuggestionReviews(goal),
      readGoalPublishRecords(goal),
      this.generateCrossGoalFlowPatterns(),
    ]);
    const reviewStatusCounts = this.buildSuggestionReviewStatusCounts(reviews.items);
    const reviewTypeCounts = this.buildSuggestionReviewTypeCounts(reviews.items);
    const publishedKeys = new Set(publishRecords.items.map((item) => `${item.suggestionType}:${item.suggestionId}`));
    const actionableReviews = reviews.items
      .filter((item) =>
        item.status === "pending_review"
        || item.status === "needs_revision"
        || (item.status === "accepted" && !publishedKeys.has(`${item.suggestionType}:${item.suggestionId}`)))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const relatedCrossGoalPatterns = crossGoal.patterns
      .filter((item) => item.goalRefs.some((ref) => ref.goalId === goal.id))
      .slice(0, 5);
    const acceptedUnpublished = actionableReviews.filter((item) => item.status === "accepted");
    const pendingReviews = actionableReviews.filter((item) => item.status === "pending_review");
    const needsRevision = actionableReviews.filter((item) => item.status === "needs_revision");
    const recommendations = [
      acceptedUnpublished[0]
        ? `优先发布已通过审阅的 suggestion：${acceptedUnpublished[0].title}`
        : "",
      pendingReviews[0]
        ? `优先处理待审阅 suggestion：${pendingReviews[0].title}`
        : "",
      needsRevision[0]
        ? `存在待修订 suggestion，建议先补证据或草稿：${needsRevision[0].title}`
        : "",
      relatedCrossGoalPatterns[0]
        ? `当前 goal 已命中跨 goal 高频流程：${relatedCrossGoalPatterns[0].id}，可作为 method/skill 治理优先级依据`
        : "",
      actionableReviews.length === 0
        ? "当前没有待处理的 review / publish 项；如需继续提升，可转入 review chain / quorum / escalation workflow。"
        : "",
    ]
      .map((item) => item.trim())
      .filter(Boolean);
    return {
      goal,
      generatedAt: new Date().toISOString(),
      reviews,
      publishRecords,
      crossGoal: {
        goalsScanned: crossGoal.goalsScanned,
        markdownPath: crossGoal.markdownPath,
        jsonPath: crossGoal.jsonPath,
        items: relatedCrossGoalPatterns,
      },
      reviewStatusCounts,
      reviewTypeCounts,
      actionableReviews: actionableReviews.slice(0, 8),
      summary: [
        `reviews=${reviews.items.length}`,
        `pending=${reviewStatusCounts.pending_review}`,
        `accepted_unpublished=${acceptedUnpublished.length}`,
        `published=${publishRecords.items.length}`,
        `cross_goal_matches=${relatedCrossGoalPatterns.length}`,
      ].join(" | "),
      recommendations,
    };
  }

  async configureSuggestionReviewWorkflow(goalId: string, input: GoalSuggestionReviewWorkflowConfigureInput): Promise<GoalSuggestionReviewMutationResult> {
    const goal = await this.requireGoal(goalId);
    const reviews = await this.syncSuggestionReviews(goal);
    const review = this.resolveSuggestionReview(reviews, input.reviewId, input.suggestionType, input.suggestionId);
    const now = new Date().toISOString();
    const workflow = this.buildSuggestionReviewWorkflow(review, input, now);
    const nextReview: GoalSuggestionReviewItem = {
      ...review,
      status: "pending_review",
      decidedBy: undefined,
      decidedAt: undefined,
      note: input.note?.trim() || review.note,
      reviewer: this.getCurrentWorkflowReviewer(workflow) ?? review.reviewer,
      workflow,
      updatedAt: now,
    };
    const nextReviews: GoalSuggestionReviewState = {
      version: 1,
      syncedAt: now,
      items: reviews.items.map((item) => item.id === nextReview.id ? nextReview : item),
    };
    await writeGoalSuggestionReviews(goal, nextReviews);
    const updatedGoal = await this.touchGoal(goal);
    await appendGoalProgressEntry(updatedGoal, {
      kind: "suggestion_review_workflow_configured",
      title: nextReview.title,
      nodeId: nextReview.nodeId,
      status: `${workflow.mode}:${workflow.currentStageIndex + 1}/${workflow.stages.length}`,
      summary: `${workflow.mode} workflow configured`,
      note: nextReview.note,
      runId: nextReview.runId,
    });
    await this.emitGoalUpdate(updatedGoal, {
      reason: "suggestion_review_updated",
      nodeId: nextReview.nodeId,
      runId: nextReview.runId,
    });
    return { goal: updatedGoal, reviews: nextReviews, review: nextReview };
  }

  async decideSuggestionReview(goalId: string, input: GoalSuggestionReviewDecisionInput): Promise<GoalSuggestionReviewMutationResult> {
    const goal = await this.requireGoal(goalId);
    const reviews = await this.syncSuggestionReviews(goal);
    const review = this.resolveSuggestionReview(reviews, input.reviewId, input.suggestionType, input.suggestionId);
    const now = new Date().toISOString();
    const nextReview = review.workflow
      ? this.applySuggestionReviewWorkflowDecision(review, input, now)
      : {
        ...review,
        status: input.decision,
        reviewer: input.reviewer?.trim() || review.reviewer,
        decidedBy: input.decidedBy?.trim() || review.decidedBy,
        note: input.note?.trim() || review.note,
        decidedAt: now,
        updatedAt: now,
      };
    const nextReviews: GoalSuggestionReviewState = {
      version: 1,
      syncedAt: now,
      items: reviews.items.map((item) => item.id === nextReview.id ? nextReview : item),
    };
    await writeGoalSuggestionReviews(goal, nextReviews);
    const updatedGoal = await this.touchGoal(goal);
    await appendGoalProgressEntry(updatedGoal, {
      kind: "suggestion_review_decided",
      title: nextReview.title,
      nodeId: nextReview.nodeId,
      status: nextReview.status,
      summary: nextReview.summary,
      note: nextReview.note,
      runId: nextReview.runId,
    });
    await this.emitGoalUpdate(updatedGoal, {
      reason: "suggestion_review_updated",
      nodeId: nextReview.nodeId,
      runId: nextReview.runId,
    });
    return { goal: updatedGoal, reviews: nextReviews, review: nextReview };
  }

  async escalateSuggestionReview(goalId: string, input: GoalSuggestionReviewEscalateInput): Promise<GoalSuggestionReviewMutationResult> {
    const goal = await this.requireGoal(goalId);
    const reviews = await this.syncSuggestionReviews(goal);
    const review = this.resolveSuggestionReview(reviews, input.reviewId, input.suggestionType, input.suggestionId);
    const now = new Date().toISOString();
    const nextReview = this.applySuggestionReviewEscalation(review, input, now);
    const nextReviews: GoalSuggestionReviewState = {
      version: 1,
      syncedAt: now,
      items: reviews.items.map((item) => item.id === nextReview.id ? nextReview : item),
    };
    await writeGoalSuggestionReviews(goal, nextReviews);
    const updatedGoal = await this.touchGoal(goal);
    await appendGoalProgressEntry(updatedGoal, {
      kind: "suggestion_review_escalated",
      title: nextReview.title,
      nodeId: nextReview.nodeId,
      status: nextReview.workflow ? `${nextReview.workflow.mode}:${nextReview.workflow.currentStageIndex + 1}/${nextReview.workflow.stages.length}` : nextReview.status,
      summary: nextReview.summary,
      note: input.reason?.trim() || input.escalatedTo?.trim() || nextReview.note,
      runId: nextReview.runId,
    });
    await this.emitGoalUpdate(updatedGoal, {
      reason: "suggestion_review_updated",
      nodeId: nextReview.nodeId,
      runId: nextReview.runId,
    });
    return { goal: updatedGoal, reviews: nextReviews, review: nextReview };
  }

  async publishSuggestion(goalId: string, input: GoalSuggestionPublishInput = {}): Promise<GoalSuggestionPublishMutationResult> {
    const goal = await this.requireGoal(goalId);
    const reviews = await this.syncSuggestionReviews(goal);
    const review = this.resolveSuggestionReview(reviews, input.reviewId, input.suggestionType, input.suggestionId);
    if (review.status !== "accepted") {
      throw new Error(`Suggestion review "${review.id}" must be accepted before publishing. Current status: ${review.status}.`);
    }
    if (review.suggestionType === "flow_pattern") {
      throw new Error("Flow pattern suggestions are not publishable in Phase 6 P6-2.");
    }

    const records = await readGoalPublishRecords(goal);
    const existing = records.items.find((item) => item.reviewId === review.id);
    if (existing) {
      return { goal, review, record: existing, records };
    }

    const publishedAt = new Date().toISOString();
    const publishRecord = review.suggestionType === "method_candidate"
      ? await this.publishMethodSuggestion(goal, review, publishedAt, input)
      : await this.publishSkillSuggestion(goal, review, publishedAt, input);
    const syncedCandidate = await this.syncPublishedSuggestionToExperienceCandidate(goal, review, publishRecord);
    if (syncedCandidate) {
      publishRecord.experienceCandidateId = syncedCandidate.id;
    }
    const nextRecords: GoalSuggestionPublishState = {
      version: 1,
      items: [...records.items, publishRecord].sort((left, right) => left.publishedAt.localeCompare(right.publishedAt)),
    };
    await writeGoalPublishRecords(goal, nextRecords);
    const updatedGoal = await this.touchGoal(goal);
    await appendGoalProgressEntry(updatedGoal, {
      kind: "suggestion_published",
      title: publishRecord.title,
      nodeId: publishRecord.nodeId,
      status: publishRecord.assetType,
      summary: `${publishRecord.suggestionType} -> ${publishRecord.assetType}`,
      note: publishRecord.publishedPath,
      runId: publishRecord.runId,
    });
    await this.emitGoalUpdate(updatedGoal, {
      reason: "suggestion_published",
      nodeId: publishRecord.nodeId,
      runId: publishRecord.runId,
    });
    return { goal: updatedGoal, review, record: publishRecord, records: nextRecords };
  }

  async listCapabilityPlans(goalId: string): Promise<GoalCapabilityPlanState> {
    const goal = await this.requireGoal(goalId);
    return readGoalCapabilityPlans(goal);
  }

  async getCapabilityPlan(goalId: string, nodeId: string): Promise<GoalCapabilityPlan | null> {
    const goal = await this.requireGoal(goalId);
    const plans = await readGoalCapabilityPlans(goal);
    return this.resolveCapabilityPlanForNode(plans, nodeId);
  }

  async saveCapabilityPlan(goalId: string, nodeId: string, input: GoalCapabilityPlanSaveInput): Promise<GoalCapabilityPlan> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      throw new Error(`Task node not found: ${nodeId}`);
    }

    const plans = await readGoalCapabilityPlans(goal);
    const existing = input.id
      ? plans.items.find((item) => item.id === input.id)
      : this.resolveCapabilityPlanForNode(plans, nodeId);
    const now = new Date().toISOString();
    const nextPlanBase: GoalCapabilityPlan = {
      id: existing?.id ?? (input.id?.trim() || `plan_${crypto.randomUUID().slice(0, 8)}`),
      goalId: goal.id,
      nodeId,
      runId: input.runId?.trim() || existing?.runId || node.lastRunId,
      status: input.status ?? existing?.status ?? "planned",
      executionMode: input.executionMode,
      riskLevel: input.riskLevel ?? existing?.riskLevel ?? "low",
      objective: input.objective.trim(),
      summary: input.summary.trim(),
      queryHints: input.queryHints?.map((item) => item.trim()).filter(Boolean) ?? existing?.queryHints ?? [],
      reasoning: input.reasoning?.map((item) => item.trim()).filter(Boolean) ?? existing?.reasoning ?? [],
      methods: input.methods ?? existing?.methods ?? [],
      skills: input.skills ?? existing?.skills ?? [],
      mcpServers: input.mcpServers ?? existing?.mcpServers ?? [],
      subAgents: input.subAgents ?? existing?.subAgents ?? [],
      gaps: input.gaps?.map((item) => item.trim()).filter(Boolean) ?? existing?.gaps ?? [],
      checkpoint: input.checkpoint ?? existing?.checkpoint ?? {
        required: false,
        reasons: [],
        approvalMode: "none",
        requiredRequestFields: [],
        requiredDecisionFields: [],
        escalationMode: "none",
      },
      actualUsage: input.actualUsage ?? existing?.actualUsage ?? { methods: [], skills: [], mcpServers: [], toolNames: [] },
      analysis: existing?.analysis ?? getDefaultCapabilityPlanAnalysis(),
      generatedAt: existing?.generatedAt ?? now,
      updatedAt: now,
      orchestratedAt: input.orchestratedAt ?? existing?.orchestratedAt,
      orchestration: input.orchestration ?? existing?.orchestration,
    };
    const nextPlan: GoalCapabilityPlan = {
      ...nextPlanBase,
      analysis: analyzeGoalCapabilityPlan(nextPlanBase),
    };
    const nextPlans: GoalCapabilityPlanState = {
      version: 1,
      items: [
        ...plans.items.filter((item) => item.id !== nextPlan.id),
        nextPlan,
      ].sort((left, right) => left.nodeId.localeCompare(right.nodeId, "zh-CN") || left.generatedAt.localeCompare(right.generatedAt)),
    };
    await writeGoalCapabilityPlans(goal, nextPlans);
    await appendGoalProgressEntry(goal, {
      kind: nextPlan.status === "orchestrated" ? "node_orchestrated" : "capability_plan_generated",
      title: node.title,
      nodeId,
      status: nextPlan.status,
      summary: nextPlan.summary,
      note: nextPlan.executionMode === "multi_agent"
        ? `execution=multi_agent; subAgents=${nextPlan.subAgents.length}; gaps=${nextPlan.gaps.length}`
        : `execution=single_agent; methods=${nextPlan.methods.length}; skills=${nextPlan.skills.length}`,
      runId: nextPlan.runId,
    });
    await this.refreshHandoffAfterMutation(goal);
    await this.emitGoalUpdate(goal, {
      reason: nextPlan.status === "orchestrated" ? "capability_plan_orchestrated" : "capability_plan_saved",
      nodeId,
      runId: nextPlan.runId,
    });
    return nextPlan;
  }

  async generateHandoff(goalId: string): Promise<GoalHandoffGenerateResult> {
    const goal = await this.requireGoal(goalId);
    const result = await this.buildHandoff(goal);
    await appendGoalProgressEntry(goal, {
      kind: "handoff_generated",
      title: goal.title,
      nodeId: result.handoff.recommendedNodeId,
      status: result.handoff.resumeMode,
      summary: result.handoff.summary,
      note: result.handoff.nextAction,
      runId: result.handoff.lastRunId,
    });
    return result;
  }

  private async readProgressContent(goal: LongTermGoal): Promise<string> {
    return fs.readFile(goal.progressPath, "utf-8").catch((err: NodeJS.ErrnoException) => {
      if (err?.code === "ENOENT") return "";
      throw err;
    });
  }

  private async buildRetrospective(goal: LongTermGoal): Promise<GoalRetrospectiveGenerateResult> {
    const [runtime, graph, checkpoints, plansState, progressContent] = await Promise.all([
      readGoalRuntime(goal),
      readGoalTaskGraph(goal),
      readGoalCheckpoints(goal),
      readGoalCapabilityPlans(goal),
      this.readProgressContent(goal),
    ]);
    const handoff = await generateGoalHandoff({
      goal,
      runtime,
      graph,
      checkpoints,
      plans: plansState.items,
      progressContent,
    });
    return generateGoalRetrospective({
      goal,
      graph,
      checkpoints,
      plans: plansState.items,
      progressContent,
      handoff: handoff.handoff,
    });
  }

  private async buildMethodCandidates(
    goal: LongTermGoal,
    retrospective: GoalRetrospectiveGenerateResult["retrospective"],
  ): Promise<GoalMethodCandidateGenerateResult> {
    const [graph, plansState, progressContent] = await Promise.all([
      readGoalTaskGraph(goal),
      readGoalCapabilityPlans(goal),
      this.readProgressContent(goal),
    ]);
    return generateGoalMethodCandidates({
      goal,
      graph,
      plans: plansState.items,
      progressContent,
      retrospective,
    });
  }

  private async buildSkillCandidates(
    goal: LongTermGoal,
    retrospective: GoalRetrospectiveGenerateResult["retrospective"],
  ): Promise<GoalSkillCandidateGenerateResult> {
    const plansState = await readGoalCapabilityPlans(goal);
    return generateGoalSkillCandidates({
      goal,
      plans: plansState.items,
      retrospective,
    });
  }

  private async buildFlowPatterns(
    goal: LongTermGoal,
    retrospective: GoalRetrospectiveGenerateResult["retrospective"],
  ): Promise<GoalFlowPatternGenerateResult> {
    const [graph, plansState, progressContent] = await Promise.all([
      readGoalTaskGraph(goal),
      readGoalCapabilityPlans(goal),
      this.readProgressContent(goal),
    ]);
    return generateGoalFlowPatterns({
      goal,
      graph,
      plans: plansState.items,
      progressContent,
      retrospective,
    });
  }

  async generateRetrospective(goalId: string): Promise<GoalRetrospectiveGenerateResult> {
    const goal = await this.requireGoal(goalId);
    const result = await this.buildRetrospective(goal);
    await appendGoalProgressEntry(goal, {
      kind: "retrospective_generated",
      title: goal.title,
      nodeId: goal.activeNodeId ?? goal.lastNodeId,
      status: result.retrospective.outcome,
      summary: result.retrospective.summary,
      note: result.retrospective.nextFocus,
      runId: goal.lastRunId,
    });
    return result;
  }

  async generateMethodCandidates(goalId: string): Promise<GoalMethodCandidateGenerateResult> {
    const goal = await this.requireGoal(goalId);
    const retrospectiveResult = await this.buildRetrospective(goal);
    const result = await this.buildMethodCandidates(goal, retrospectiveResult.retrospective);
    await appendGoalProgressEntry(goal, {
      kind: "method_candidates_generated",
      title: goal.title,
      nodeId: goal.activeNodeId ?? goal.lastNodeId,
      status: String(result.candidates.length),
      summary: `生成 ${result.candidates.length} 条 method candidate 建议。`,
      note: result.markdownPath,
      runId: goal.lastRunId,
    });
    return result;
  }

  async generateSkillCandidates(goalId: string): Promise<GoalSkillCandidateGenerateResult> {
    const goal = await this.requireGoal(goalId);
    const retrospectiveResult = await this.buildRetrospective(goal);
    const result = await this.buildSkillCandidates(goal, retrospectiveResult.retrospective);
    await appendGoalProgressEntry(goal, {
      kind: "skill_candidates_generated",
      title: goal.title,
      nodeId: goal.activeNodeId ?? goal.lastNodeId,
      status: String(result.candidates.length),
      summary: `生成 ${result.candidates.length} 条 skill candidate 建议。`,
      note: result.markdownPath,
      runId: goal.lastRunId,
    });
    return result;
  }

  async generateFlowPatterns(goalId: string): Promise<GoalFlowPatternGenerateResult> {
    const goal = await this.requireGoal(goalId);
    const retrospectiveResult = await this.buildRetrospective(goal);
    const result = await this.buildFlowPatterns(goal, retrospectiveResult.retrospective);
    await appendGoalProgressEntry(goal, {
      kind: "flow_patterns_generated",
      title: goal.title,
      nodeId: goal.activeNodeId ?? goal.lastNodeId,
      status: String(result.patterns.length),
      summary: `生成 ${result.patterns.length} 条 flow pattern 摘要。`,
      note: result.markdownPath,
      runId: goal.lastRunId,
    });
    return result;
  }

  async generateCrossGoalFlowPatterns(): Promise<GoalCrossFlowPatternGenerateResult> {
    const goals = await listGoalRegistryEntries(this.stateDir);
    const goalPatterns = await Promise.all(
      goals.map(async (goal) => ({
        goal,
        patterns: (await readGoalFlowPatterns(goal)).items,
      })),
    );
    return generateCrossGoalFlowPatterns({
      stateDir: this.stateDir,
      goals: goalPatterns.filter((item) => item.patterns.length > 0),
    });
  }

  async generateExperienceSuggestions(goalId: string): Promise<GoalExperienceSuggestResult> {
    const goal = await this.requireGoal(goalId);
    const retrospectiveResult = await this.buildRetrospective(goal);
    const [methodCandidatesResult, skillCandidatesResult, flowPatternsResult] = await Promise.all([
      this.buildMethodCandidates(goal, retrospectiveResult.retrospective),
      this.buildSkillCandidates(goal, retrospectiveResult.retrospective),
      this.buildFlowPatterns(goal, retrospectiveResult.retrospective),
    ]);
    const recommendations = [
      ...retrospectiveResult.retrospective.recommendations.slice(0, 2),
      methodCandidatesResult.candidates[0] ? `优先审阅 method candidate：${methodCandidatesResult.candidates[0].title}` : "",
      skillCandidatesResult.candidates[0] ? `优先审阅 skill candidate：${skillCandidatesResult.candidates[0].title}` : "",
      flowPatternsResult.patterns[0] ? `优先观察高频流程：${flowPatternsResult.patterns[0].summary}` : "",
    ]
      .map((item) => item.trim())
      .filter(Boolean);
    const result: GoalExperienceSuggestResult = {
      goal,
      generatedAt: new Date().toISOString(),
      retrospective: retrospectiveResult.retrospective,
      methodCandidates: {
        count: methodCandidatesResult.candidates.length,
        items: methodCandidatesResult.candidates,
        markdownPath: methodCandidatesResult.markdownPath,
        jsonPath: methodCandidatesResult.jsonPath,
      },
      skillCandidates: {
        count: skillCandidatesResult.candidates.length,
        items: skillCandidatesResult.candidates,
        markdownPath: skillCandidatesResult.markdownPath,
        jsonPath: skillCandidatesResult.jsonPath,
      },
      flowPatterns: {
        count: flowPatternsResult.patterns.length,
        items: flowPatternsResult.patterns,
        markdownPath: flowPatternsResult.markdownPath,
        jsonPath: flowPatternsResult.jsonPath,
      },
      summary: [
        retrospectiveResult.retrospective.summary,
        `method=${methodCandidatesResult.candidates.length}`,
        `skill=${skillCandidatesResult.candidates.length}`,
        `flow=${flowPatternsResult.patterns.length}`,
      ].join(" | "),
      recommendations,
    };
    await appendGoalProgressEntry(goal, {
      kind: "experience_suggestions_generated",
      title: goal.title,
      nodeId: goal.activeNodeId ?? goal.lastNodeId,
      status: `method=${result.methodCandidates.count}; skill=${result.skillCandidates.count}; flow=${result.flowPatterns.count}`,
      summary: result.summary,
      note: result.recommendations[0],
      runId: goal.lastRunId,
    });
    return result;
  }

  async requestCheckpoint(goalId: string, nodeId: string, input: GoalCheckpointRequestInput = {}): Promise<GoalCheckpointMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const currentNode = graph.nodes.find((node) => node.id === nodeId);
    if (!currentNode) {
      throw new Error(`Task node not found: ${nodeId}`);
    }
    if (!currentNode.checkpointRequired) {
      throw new Error(`Task node "${nodeId}" does not require a checkpoint.`);
    }

    const checkpoints = await readGoalCheckpoints(goal);
    const plans = await readGoalCapabilityPlans(goal);
    const existingOpen = checkpoints.items.find((item) => item.nodeId === nodeId && (item.status === "required" || item.status === "waiting_user"));
    if (existingOpen) {
      throw new Error(`Task node "${nodeId}" already has a pending checkpoint: ${existingOpen.id}`);
    }
    const policy = this.resolveCheckpointPolicyForNode(plans, nodeId, currentNode.checkpointRequired);
    const context = this.resolveCheckpointContext(input);
    this.assertCheckpointRequestPolicy(policy, {
      summary: input.summary?.trim(),
      note: input.note?.trim(),
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      slaAt: context.slaAt,
    });

    const requestedNode = transitionGoalTaskNode(graph, nodeId, "pending_review", {
      summary: input.summary,
      checkpointStatus: "waiting_user",
      runId: input.runId,
    });
    const savedGraph = await writeGoalTaskGraph(goal, requestedNode.graph);
    const now = new Date().toISOString();
    const checkpoint: GoalCheckpointItem = {
      id: `checkpoint_${crypto.randomUUID().slice(0, 8)}`,
      goalId: goal.id,
      nodeId,
      runId: input.runId?.trim() || requestedNode.node.lastRunId,
      status: "waiting_user",
      title: input.title?.trim() || `${requestedNode.node.title} checkpoint`,
      summary: input.summary?.trim() || requestedNode.node.summary,
      note: input.note?.trim() || undefined,
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      decidedBy: undefined,
      slaAt: context.slaAt,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
      policy,
      history: [{
        action: "requested",
        status: "waiting_user",
        at: now,
        summary: input.summary?.trim() || requestedNode.node.summary,
        note: input.note?.trim() || undefined,
        actor: context.requestedBy,
        reviewer: context.reviewer,
        reviewerRole: context.reviewerRole,
        requestedBy: context.requestedBy,
        slaAt: context.slaAt,
        runId: input.runId?.trim() || requestedNode.node.lastRunId,
      }],
    };
    const nextCheckpoints: GoalCheckpointState = {
      version: 2,
      items: [...checkpoints.items, checkpoint],
    };
    await writeGoalCheckpoints(goal, nextCheckpoints);
    const updatedGoal = await this.touchGoal(goal, {
      status: "pending_approval",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: checkpoint.runId ?? goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "checkpoint_requested",
      title: checkpoint.title,
      nodeId,
      status: checkpoint.status,
      summary: checkpoint.summary,
      note: checkpoint.note,
      runId: checkpoint.runId,
      checkpointId: checkpoint.id,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "checkpoint_requested",
      nodeId,
      checkpointId: checkpoint.id,
      runId: checkpoint.runId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: requestedNode.node, checkpoints: nextCheckpoints, checkpoint };
  }

  async approveCheckpoint(goalId: string, nodeId: string, input: GoalCheckpointDecisionInput = {}): Promise<GoalCheckpointMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const checkpoints = await readGoalCheckpoints(goal);
    const checkpoint = this.resolveCheckpointForDecision(checkpoints, nodeId, input.checkpointId);
    if (checkpoint.status !== "required" && checkpoint.status !== "waiting_user") {
      throw new Error(`Checkpoint "${checkpoint.id}" is not awaiting approval.`);
    }

    const approvedNode = transitionGoalTaskNode(graph, nodeId, "validating", {
      summary: input.summary,
      checkpointStatus: "approved",
      runId: input.runId,
    });
    const savedGraph = await writeGoalTaskGraph(goal, approvedNode.graph);
    const now = new Date().toISOString();
    const context = this.resolveCheckpointContext(input, checkpoint);
    this.assertCheckpointDecisionPolicy(checkpoint.policy, {
      summary: input.summary?.trim() || checkpoint.summary,
      note: input.note?.trim() || checkpoint.note,
      decidedBy: context.decidedBy,
    }, "approve");
    const nextCheckpoint: GoalCheckpointItem = {
      ...checkpoint,
      status: "approved",
      summary: input.summary?.trim() || checkpoint.summary,
      note: input.note?.trim() || checkpoint.note,
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      decidedBy: context.decidedBy,
      slaAt: context.slaAt,
      decidedAt: now,
      updatedAt: now,
      runId: input.runId?.trim() || checkpoint.runId,
      history: this.appendCheckpointHistory(checkpoint, {
        action: "approved",
        status: "approved",
        at: now,
        summary: input.summary?.trim() || checkpoint.summary,
        note: input.note?.trim() || checkpoint.note,
        actor: context.decidedBy,
        reviewer: context.reviewer,
        reviewerRole: context.reviewerRole,
        requestedBy: context.requestedBy,
        decidedBy: context.decidedBy,
        slaAt: context.slaAt,
        runId: input.runId?.trim() || checkpoint.runId,
      }),
    };
    const nextCheckpoints = this.replaceCheckpoint(checkpoints, nextCheckpoint);
    await writeGoalCheckpoints(goal, nextCheckpoints);
    const updatedGoal = await this.touchGoal(goal, {
      status: "reviewing",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: nextCheckpoint.runId ?? goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "checkpoint_approved",
      title: nextCheckpoint.title,
      nodeId,
      status: nextCheckpoint.status,
      summary: nextCheckpoint.summary,
      note: nextCheckpoint.note,
      runId: nextCheckpoint.runId,
      checkpointId: nextCheckpoint.id,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "checkpoint_approved",
      nodeId,
      checkpointId: nextCheckpoint.id,
      runId: nextCheckpoint.runId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: approvedNode.node, checkpoints: nextCheckpoints, checkpoint: nextCheckpoint };
  }

  async rejectCheckpoint(goalId: string, nodeId: string, input: GoalCheckpointDecisionInput = {}): Promise<GoalCheckpointMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const checkpoints = await readGoalCheckpoints(goal);
    const checkpoint = this.resolveCheckpointForDecision(checkpoints, nodeId, input.checkpointId);
    if (checkpoint.status !== "required" && checkpoint.status !== "waiting_user") {
      throw new Error(`Checkpoint "${checkpoint.id}" is not awaiting approval.`);
    }

    const rejectNote = input.note?.trim() || "Checkpoint rejected";
    const rejectedNode = transitionGoalTaskNode(graph, nodeId, "blocked", {
      summary: input.summary,
      blockReason: rejectNote,
      checkpointStatus: "rejected",
      runId: input.runId,
    });
    const savedGraph = await writeGoalTaskGraph(goal, rejectedNode.graph);
    const now = new Date().toISOString();
    const context = this.resolveCheckpointContext(input, checkpoint);
    this.assertCheckpointDecisionPolicy(checkpoint.policy, {
      summary: input.summary?.trim() || checkpoint.summary,
      note: rejectNote,
      decidedBy: context.decidedBy,
    }, "reject");
    const nextCheckpoint: GoalCheckpointItem = {
      ...checkpoint,
      status: "rejected",
      summary: input.summary?.trim() || checkpoint.summary,
      note: rejectNote,
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      decidedBy: context.decidedBy,
      slaAt: context.slaAt,
      decidedAt: now,
      updatedAt: now,
      runId: input.runId?.trim() || checkpoint.runId,
      history: this.appendCheckpointHistory(checkpoint, {
        action: "rejected",
        status: "rejected",
        at: now,
        summary: input.summary?.trim() || checkpoint.summary,
        note: rejectNote,
        actor: context.decidedBy,
        reviewer: context.reviewer,
        reviewerRole: context.reviewerRole,
        requestedBy: context.requestedBy,
        decidedBy: context.decidedBy,
        slaAt: context.slaAt,
        runId: input.runId?.trim() || checkpoint.runId,
      }),
    };
    const nextCheckpoints = this.replaceCheckpoint(checkpoints, nextCheckpoint);
    await writeGoalCheckpoints(goal, nextCheckpoints);
    const updatedGoal = await this.touchGoal(goal, {
      status: "blocked",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: nextCheckpoint.runId ?? goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "checkpoint_rejected",
      title: nextCheckpoint.title,
      nodeId,
      status: nextCheckpoint.status,
      summary: nextCheckpoint.summary,
      note: nextCheckpoint.note,
      runId: nextCheckpoint.runId,
      checkpointId: nextCheckpoint.id,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "checkpoint_rejected",
      nodeId,
      checkpointId: nextCheckpoint.id,
      runId: nextCheckpoint.runId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: rejectedNode.node, checkpoints: nextCheckpoints, checkpoint: nextCheckpoint };
  }

  async expireCheckpoint(goalId: string, nodeId: string, input: GoalCheckpointDecisionInput = {}): Promise<GoalCheckpointMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const checkpoints = await readGoalCheckpoints(goal);
    const checkpoint = this.resolveCheckpointForDecision(checkpoints, nodeId, input.checkpointId);
    if (checkpoint.status !== "required" && checkpoint.status !== "waiting_user") {
      throw new Error(`Checkpoint "${checkpoint.id}" is not active and cannot expire.`);
    }

    const expireNote = input.note?.trim() || "Checkpoint expired";
    const expiredNode = transitionGoalTaskNode(graph, nodeId, "blocked", {
      summary: input.summary,
      blockReason: expireNote,
      checkpointStatus: "expired",
      runId: input.runId,
    });
    const savedGraph = await writeGoalTaskGraph(goal, expiredNode.graph);
    const now = new Date().toISOString();
    const context = this.resolveCheckpointContext(input, checkpoint);
    this.assertCheckpointDecisionPolicy(checkpoint.policy, {
      summary: input.summary?.trim() || checkpoint.summary,
      note: expireNote,
      decidedBy: context.decidedBy,
    }, "expire");
    const nextCheckpoint: GoalCheckpointItem = {
      ...checkpoint,
      status: "expired",
      summary: input.summary?.trim() || checkpoint.summary,
      note: expireNote,
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      decidedBy: context.decidedBy,
      slaAt: context.slaAt,
      decidedAt: now,
      updatedAt: now,
      runId: input.runId?.trim() || checkpoint.runId,
      history: this.appendCheckpointHistory(checkpoint, {
        action: "expired",
        status: "expired",
        at: now,
        summary: input.summary?.trim() || checkpoint.summary,
        note: expireNote,
        actor: context.decidedBy,
        reviewer: context.reviewer,
        reviewerRole: context.reviewerRole,
        requestedBy: context.requestedBy,
        decidedBy: context.decidedBy,
        slaAt: context.slaAt,
        runId: input.runId?.trim() || checkpoint.runId,
      }),
    };
    const nextCheckpoints = this.replaceCheckpoint(checkpoints, nextCheckpoint);
    await writeGoalCheckpoints(goal, nextCheckpoints);
    const updatedGoal = await this.touchGoal(goal, {
      status: "blocked",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: nextCheckpoint.runId ?? goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "checkpoint_expired",
      title: nextCheckpoint.title,
      nodeId,
      status: nextCheckpoint.status,
      summary: nextCheckpoint.summary,
      note: nextCheckpoint.note,
      runId: nextCheckpoint.runId,
      checkpointId: nextCheckpoint.id,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "checkpoint_expired",
      nodeId,
      checkpointId: nextCheckpoint.id,
      runId: nextCheckpoint.runId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: expiredNode.node, checkpoints: nextCheckpoints, checkpoint: nextCheckpoint };
  }

  async reopenCheckpoint(goalId: string, nodeId: string, input: GoalCheckpointDecisionInput = {}): Promise<GoalCheckpointMutationResult> {
    const goal = await this.requireGoal(goalId);
    const graph = await readGoalTaskGraph(goal);
    const checkpoints = await readGoalCheckpoints(goal);
    const checkpoint = this.resolveCheckpointForDecision(checkpoints, nodeId, input.checkpointId);
    if (checkpoint.status !== "rejected" && checkpoint.status !== "expired") {
      throw new Error(`Checkpoint "${checkpoint.id}" is not rejected/expired and cannot reopen.`);
    }

    const reopenedNode = transitionGoalTaskNode(graph, nodeId, "pending_review", {
      summary: input.summary,
      checkpointStatus: "waiting_user",
      runId: input.runId,
    });
    const savedGraph = await writeGoalTaskGraph(goal, reopenedNode.graph);
    const now = new Date().toISOString();
    const context = this.resolveCheckpointContext(input, checkpoint, { clearDecidedBy: true });
    this.assertCheckpointRequestPolicy(checkpoint.policy, {
      summary: input.summary?.trim() || checkpoint.summary,
      note: input.note?.trim() || checkpoint.note,
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      slaAt: context.slaAt,
    }, "reopen");
    const nextCheckpoint: GoalCheckpointItem = {
      ...checkpoint,
      status: "waiting_user",
      summary: input.summary?.trim() || checkpoint.summary,
      note: input.note?.trim() || checkpoint.note,
      reviewer: context.reviewer,
      reviewerRole: context.reviewerRole,
      requestedBy: context.requestedBy,
      decidedBy: undefined,
      slaAt: context.slaAt,
      requestedAt: now,
      decidedAt: undefined,
      updatedAt: now,
      runId: input.runId?.trim() || checkpoint.runId,
      history: this.appendCheckpointHistory(checkpoint, {
        action: "reopened",
        status: "waiting_user",
        at: now,
        summary: input.summary?.trim() || checkpoint.summary,
        note: input.note?.trim() || checkpoint.note,
        actor: context.requestedBy ?? context.decidedBy,
        reviewer: context.reviewer,
        reviewerRole: context.reviewerRole,
        requestedBy: context.requestedBy,
        slaAt: context.slaAt,
        runId: input.runId?.trim() || checkpoint.runId,
      }),
    };
    const nextCheckpoints = this.replaceCheckpoint(checkpoints, nextCheckpoint);
    await writeGoalCheckpoints(goal, nextCheckpoints);
    const updatedGoal = await this.touchGoal(goal, {
      status: "pending_approval",
      activeNodeId: nodeId,
      lastNodeId: nodeId,
      lastRunId: nextCheckpoint.runId ?? goal.lastRunId,
    });
    await appendGoalProgressEntry(updatedGoal, {
      kind: "checkpoint_reopened",
      title: nextCheckpoint.title,
      nodeId,
      status: nextCheckpoint.status,
      summary: nextCheckpoint.summary,
      note: nextCheckpoint.note,
      runId: nextCheckpoint.runId,
      checkpointId: nextCheckpoint.id,
    });
    await this.refreshHandoffAfterMutation(updatedGoal);
    await this.emitGoalUpdate(updatedGoal, {
      reason: "checkpoint_reopened",
      nodeId,
      checkpointId: nextCheckpoint.id,
      runId: nextCheckpoint.runId,
    });
    return { goal: updatedGoal, graph: savedGraph, node: reopenedNode.node, checkpoints: nextCheckpoints, checkpoint: nextCheckpoint };
  }

  private async requireGoal(goalId: string): Promise<LongTermGoal> {
    const goal = await this.getGoal(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }
    return goal;
  }

  private async syncSuggestionReviews(goal: LongTermGoal): Promise<GoalSuggestionReviewState> {
    const [existing, methodCandidates, skillCandidates, flowPatterns] = await Promise.all([
      readGoalSuggestionReviews(goal),
      readGoalMethodCandidates(goal),
      readGoalSkillCandidates(goal),
      readGoalFlowPatterns(goal),
    ]);
    const existingByKey = new Map(existing.items.map((item) => [`${item.suggestionType}:${item.suggestionId}`, item] as const));
    const now = new Date().toISOString();
    const nextItems: GoalSuggestionReviewItem[] = [
      ...methodCandidates.items.map((item) => this.buildSuggestionReviewItem(goal, {
        suggestionType: "method_candidate",
        suggestionId: item.id,
        title: item.title,
        summary: item.summary,
        nodeId: item.nodeId,
        runId: item.runId,
        sourcePath: getGoalMethodCandidatesPath(goal),
        evidenceRefs: item.evidence.references,
      }, existingByKey.get(`method_candidate:${item.id}`), now)),
      ...skillCandidates.items.map((item) => this.buildSuggestionReviewItem(goal, {
        suggestionType: "skill_candidate",
        suggestionId: item.id,
        title: item.title,
        summary: item.summary,
        nodeId: item.nodeId,
        runId: item.runId,
        sourcePath: getGoalSkillCandidatesPath(goal),
        evidenceRefs: item.evidence.references,
      }, existingByKey.get(`skill_candidate:${item.id}`), now)),
      ...flowPatterns.items.map((item) => this.buildSuggestionReviewItem(goal, {
        suggestionType: "flow_pattern",
        suggestionId: item.id,
        title: item.id,
        summary: item.summary,
        sourcePath: getGoalFlowPatternsPath(goal),
        evidenceRefs: item.nodeRefs.map((node) => `${goal.id}:${node.nodeId}`),
      }, existingByKey.get(`flow_pattern:${item.id}`), now)),
    ].sort((left, right) =>
      left.suggestionType.localeCompare(right.suggestionType, "zh-CN")
      || left.title.localeCompare(right.title, "zh-CN")
      || left.createdAt.localeCompare(right.createdAt));
    const nextState: GoalSuggestionReviewState = {
      version: 1,
      syncedAt: now,
      items: nextItems,
    };
    const changed = JSON.stringify(existing) !== JSON.stringify(nextState);
    if (changed) {
      await writeGoalSuggestionReviews(goal, nextState);
    }
    return nextState;
  }

  private buildSuggestionReviewStatusCounts(items: GoalSuggestionReviewItem[]): Record<GoalSuggestionReviewStatus, number> {
    const counts: Record<GoalSuggestionReviewStatus, number> = {
      pending_review: 0,
      accepted: 0,
      rejected: 0,
      deferred: 0,
      needs_revision: 0,
    };
    for (const item of items) counts[item.status] += 1;
    return counts;
  }

  private buildSuggestionReviewTypeCounts(items: GoalSuggestionReviewItem[]): Record<GoalSuggestionType, number> {
    const counts: Record<GoalSuggestionType, number> = {
      method_candidate: 0,
      skill_candidate: 0,
      flow_pattern: 0,
    };
    for (const item of items) counts[item.suggestionType] += 1;
    return counts;
  }

  private buildSuggestionReviewWorkflow(
    review: GoalSuggestionReviewItem,
    input: GoalSuggestionReviewWorkflowConfigureInput,
    now: string,
  ): GoalSuggestionReviewWorkflow {
    const mode = input.mode;
    const stages = mode === "chain"
      ? this.buildChainSuggestionReviewWorkflowStages(review, input, now)
      : [this.buildSuggestionReviewWorkflowStage(review, {
        title: mode === "quorum" ? "Quorum Review" : "Primary Review",
        reviewers: input.reviewers ?? [],
        reviewerRoles: input.reviewerRoles,
        minApprovals: input.minApprovals,
        slaHours: input.slaHours,
      }, 0, now, mode === "quorum" ? "quorum" : "single", input.escalationMode)];
    if (stages.length === 0) {
      throw new Error("Workflow stages are required.");
    }
    return {
      mode,
      status: "pending_review",
      currentStageIndex: 0,
      stages,
      configuredAt: now,
      updatedAt: now,
    };
  }

  private buildChainSuggestionReviewWorkflowStages(
    review: GoalSuggestionReviewItem,
    input: GoalSuggestionReviewWorkflowConfigureInput,
    now: string,
  ): GoalSuggestionReviewWorkflowStage[] {
    const rawStages = (input.stages && input.stages.length > 0)
      ? input.stages
      : (input.reviewers ?? []).map<GoalSuggestionReviewWorkflowStageInput>((reviewer, index) => ({
        title: `Chain Stage ${index + 1}`,
        reviewers: [reviewer],
        reviewerRoles: input.reviewerRoles?.[index] ? [input.reviewerRoles[index] as string] : undefined,
        minApprovals: 1,
        slaHours: input.slaHours,
      }));
    if (rawStages.length === 0) {
      const fallbackReviewer = review.reviewer?.trim();
      if (!fallbackReviewer) {
        throw new Error("chain workflow requires stages or reviewers.");
      }
      rawStages.push({
        title: "Chain Stage 1",
        reviewers: [fallbackReviewer],
        minApprovals: 1,
        slaHours: input.slaHours,
      });
    }
    return rawStages.map((stage, index) => this.buildSuggestionReviewWorkflowStage(
      review,
      stage,
      index,
      now,
      (stage.minApprovals ?? 1) > 1 || (stage.reviewers?.length ?? 0) > 1 ? "quorum" : "single",
      input.escalationMode,
    ));
  }

  private buildSuggestionReviewWorkflowStage(
    review: GoalSuggestionReviewItem,
    input: GoalSuggestionReviewWorkflowStageInput,
    index: number,
    now: string,
    mode: GoalSuggestionReviewWorkflowStage["mode"],
    escalationMode: GoalSuggestionReviewWorkflowEscalation["mode"] = "none",
  ): GoalSuggestionReviewWorkflowStage {
    const reviewers = this.toSuggestionReviewWorkflowReviewers(input.reviewers, input.reviewerRoles, review.reviewer);
    if (reviewers.length === 0) {
      throw new Error("workflow stage requires at least one reviewer.");
    }
    const minApprovals = mode === "quorum"
      ? Math.max(1, Math.min(reviewers.length, input.minApprovals ?? Math.ceil(reviewers.length / 2)))
      : 1;
    return {
      id: `stage_${index + 1}`,
      title: input.title?.trim() || `Stage ${index + 1}`,
      mode,
      reviewers,
      minApprovals,
      status: "pending_review",
      votes: [],
      startedAt: now,
      decidedAt: undefined,
      slaAt: this.computeSuggestionReviewStageSlaAt(input.slaHours, now),
      escalation: {
        mode: escalationMode,
        count: 0,
        history: [],
      },
    };
  }

  private toSuggestionReviewWorkflowReviewers(
    reviewers: string[] | undefined,
    reviewerRoles: string[] | undefined,
    fallbackReviewer?: string,
  ): GoalSuggestionReviewWorkflowReviewer[] {
    const items: GoalSuggestionReviewWorkflowReviewer[] = [];
    for (const [index, reviewer] of (reviewers ?? []).entries()) {
      const normalized = reviewer?.trim();
      if (!normalized) continue;
      items.push({
        reviewer: normalized,
        reviewerRole: reviewerRoles?.[index]?.trim() || undefined,
      });
    }
    if (items.length > 0) return items;
    const normalizedFallback = fallbackReviewer?.trim();
    return normalizedFallback ? [{ reviewer: normalizedFallback }] : [];
  }

  private computeSuggestionReviewStageSlaAt(slaHours: number | undefined, now: string): string | undefined {
    if (typeof slaHours !== "number" || !Number.isFinite(slaHours) || slaHours <= 0) return undefined;
    return new Date(new Date(now).getTime() + slaHours * 60 * 60 * 1000).toISOString();
  }

  private getCurrentWorkflowReviewer(workflow: GoalSuggestionReviewWorkflow): string | undefined {
    const stage = workflow.stages[workflow.currentStageIndex];
    return stage?.reviewers[0]?.reviewer;
  }

  private applySuggestionReviewWorkflowDecision(
    review: GoalSuggestionReviewItem,
    input: GoalSuggestionReviewDecisionInput,
    now: string,
  ): GoalSuggestionReviewItem {
    const workflow = review.workflow;
    if (!workflow) return review;
    const stage = workflow.stages[workflow.currentStageIndex];
    if (!stage) {
      throw new Error(`Workflow stage not found: ${workflow.currentStageIndex}`);
    }
    const actor = input.decidedBy?.trim() || input.reviewer?.trim() || review.decidedBy || review.reviewer;
    if (!actor) {
      throw new Error("Workflow decision requires decidedBy or reviewer.");
    }
    const allowedReviewers = new Set(stage.reviewers.map((item) => item.reviewer));
    if (allowedReviewers.size > 0 && !allowedReviewers.has(actor)) {
      throw new Error(`Reviewer "${actor}" is not assigned to current stage "${stage.title}".`);
    }

    const reviewerRole = stage.reviewers.find((item) => item.reviewer === actor)?.reviewerRole;
    const vote: GoalSuggestionReviewWorkflowVote = {
      reviewer: actor,
      reviewerRole,
      decision: input.decision,
      note: input.note?.trim() || undefined,
      decidedBy: input.decidedBy?.trim() || actor,
      decidedAt: now,
    };
    const votes = [...stage.votes.filter((item) => item.reviewer !== actor), vote]
      .sort((left, right) => left.reviewer.localeCompare(right.reviewer, "zh-CN"));
    const updatedStage: GoalSuggestionReviewWorkflowStage = {
      ...stage,
      votes,
      status: stage.status,
      decidedAt: stage.decidedAt,
    };
    const nextWorkflow: GoalSuggestionReviewWorkflow = {
      ...workflow,
      updatedAt: now,
      stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? updatedStage : item),
    };
    return this.finishSuggestionReviewWorkflowDecision(review, nextWorkflow, vote, now);
  }

  private finishSuggestionReviewWorkflowDecision(
    review: GoalSuggestionReviewItem,
    workflow: GoalSuggestionReviewWorkflow,
    vote: GoalSuggestionReviewWorkflowVote,
    now: string,
  ): GoalSuggestionReviewItem {
    const stage = workflow.stages[workflow.currentStageIndex];
    const approvals = stage.votes.filter((item) => item.decision === "accepted").length;
    const rejections = stage.votes.filter((item) => item.decision === "rejected").length;
    const needsRevision = stage.votes.some((item) => item.decision === "needs_revision");
    const deferred = stage.votes.some((item) => item.decision === "deferred");
    const rejectionThreshold = Math.max(1, stage.reviewers.length - stage.minApprovals + 1);

    if (needsRevision) {
      const nextStage = { ...stage, status: "needs_revision" as const, decidedAt: now };
      return this.finalizeSuggestionReviewWorkflow(review, {
        ...workflow,
        status: "needs_revision",
        updatedAt: now,
        stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? nextStage : item),
      }, "needs_revision", vote, now, review.reviewer);
    }

    if (deferred) {
      const nextStage = { ...stage, status: "deferred" as const, decidedAt: now };
      return this.finalizeSuggestionReviewWorkflow(review, {
        ...workflow,
        status: "deferred",
        updatedAt: now,
        stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? nextStage : item),
      }, "deferred", vote, now, review.reviewer);
    }

    if (stage.mode === "quorum") {
      if (approvals >= stage.minApprovals) {
        const approvedStage = { ...stage, status: "accepted" as const, decidedAt: now };
        const withApprovedStage = {
          ...workflow,
          updatedAt: now,
          stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? approvedStage : item),
        };
        if (workflow.mode === "chain" && workflow.currentStageIndex < workflow.stages.length - 1) {
          return this.advanceSuggestionReviewWorkflow(review, withApprovedStage, vote, now);
        }
        return this.finalizeSuggestionReviewWorkflow(review, {
          ...withApprovedStage,
          status: "accepted",
        }, "accepted", vote, now, review.reviewer);
      }
      if (rejections >= rejectionThreshold) {
        const rejectedStage = { ...stage, status: "rejected" as const, decidedAt: now };
        return this.finalizeSuggestionReviewWorkflow(review, {
          ...workflow,
          status: "rejected",
          updatedAt: now,
          stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? rejectedStage : item),
        }, "rejected", vote, now, review.reviewer);
      }
      const pendingStage = { ...stage, status: "pending_review" as const };
      return {
        ...review,
        status: "pending_review",
        reviewer: stage.reviewers.map((item) => item.reviewer).join(", "),
        decidedBy: vote.decidedBy,
        note: vote.note ?? review.note,
        decidedAt: undefined,
        workflow: {
          ...workflow,
          status: "pending_review",
          updatedAt: now,
          stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? pendingStage : item),
        },
        updatedAt: now,
      };
    }

    if (vote.decision === "accepted") {
      const approvedStage = { ...stage, status: "accepted" as const, decidedAt: now };
      const withApprovedStage = {
        ...workflow,
        updatedAt: now,
        stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? approvedStage : item),
      };
      if (workflow.mode === "chain" && workflow.currentStageIndex < workflow.stages.length - 1) {
        return this.advanceSuggestionReviewWorkflow(review, withApprovedStage, vote, now);
      }
      return this.finalizeSuggestionReviewWorkflow(review, {
        ...withApprovedStage,
        status: "accepted",
      }, "accepted", vote, now, review.reviewer);
    }

    const stageStatus = vote.decision;
    const decidedStage = { ...stage, status: stageStatus, decidedAt: now };
    return this.finalizeSuggestionReviewWorkflow(review, {
      ...workflow,
      status: stageStatus,
      updatedAt: now,
      stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? decidedStage : item),
    }, stageStatus, vote, now, review.reviewer);
  }

  private advanceSuggestionReviewWorkflow(
    review: GoalSuggestionReviewItem,
    workflow: GoalSuggestionReviewWorkflow,
    vote: GoalSuggestionReviewWorkflowVote,
    now: string,
  ): GoalSuggestionReviewItem {
    const nextIndex = workflow.currentStageIndex + 1;
    const nextStage = workflow.stages[nextIndex];
    if (!nextStage) {
      return this.finalizeSuggestionReviewWorkflow(review, {
        ...workflow,
        status: "accepted",
        updatedAt: now,
      }, "accepted", vote, now, review.reviewer);
    }
    const startedStage: GoalSuggestionReviewWorkflowStage = {
      ...nextStage,
      status: "pending_review",
      startedAt: nextStage.startedAt || now,
    };
    return {
      ...review,
      status: "pending_review",
      reviewer: startedStage.reviewers.map((item) => item.reviewer).join(", "),
      decidedBy: vote.decidedBy,
      note: vote.note ?? review.note,
      decidedAt: undefined,
      workflow: {
        ...workflow,
        status: "pending_review",
        currentStageIndex: nextIndex,
        updatedAt: now,
        stages: workflow.stages.map((item, index) => index === nextIndex ? startedStage : item),
      },
      updatedAt: now,
    };
  }

  private finalizeSuggestionReviewWorkflow(
    review: GoalSuggestionReviewItem,
    workflow: GoalSuggestionReviewWorkflow,
    status: GoalSuggestionReviewStatus,
    vote: GoalSuggestionReviewWorkflowVote,
    now: string,
    fallbackReviewer?: string,
  ): GoalSuggestionReviewItem {
    return {
      ...review,
      status,
      reviewer: this.getCurrentWorkflowReviewer(workflow) ?? fallbackReviewer ?? review.reviewer,
      decidedBy: vote.decidedBy,
      note: vote.note ?? review.note,
      decidedAt: now,
      workflow: {
        ...workflow,
        status,
        updatedAt: now,
      },
      updatedAt: now,
    };
  }

  private applySuggestionReviewEscalation(
    review: GoalSuggestionReviewItem,
    input: GoalSuggestionReviewEscalateInput,
    now: string,
  ): GoalSuggestionReviewItem {
    const workflow = review.workflow;
    if (!workflow) {
      throw new Error("Suggestion review workflow is not configured.");
    }
    const stage = workflow.stages[workflow.currentStageIndex];
    if (!stage) {
      throw new Error(`Workflow stage not found: ${workflow.currentStageIndex}`);
    }
    if (workflow.status !== "pending_review" || stage.status !== "pending_review") {
      throw new Error(`Current workflow stage "${stage.title}" is not pending.`);
    }
    const overdue = stage.slaAt ? new Date(now).getTime() > new Date(stage.slaAt).getTime() : false;
    if (!input.force && !overdue) {
      throw new Error(`Current workflow stage "${stage.title}" is not overdue; use force=true to escalate manually.`);
    }
    if (stage.escalation.mode === "none" && !input.force) {
      throw new Error(`Current workflow stage "${stage.title}" does not allow escalation.`);
    }
    const escalatedTo = input.escalatedTo?.trim();
    const escalationEvent = {
      at: now,
      by: input.escalatedBy?.trim(),
      to: escalatedTo,
      reason: input.reason?.trim(),
    };
    const reviewers = escalatedTo && !stage.reviewers.some((item) => item.reviewer === escalatedTo)
      ? [...stage.reviewers, { reviewer: escalatedTo }]
      : [...stage.reviewers];
    const nextStage: GoalSuggestionReviewWorkflowStage = {
      ...stage,
      reviewers,
      escalation: {
        ...stage.escalation,
        mode: stage.escalation.mode === "manual" || input.force ? "manual" : stage.escalation.mode,
        count: stage.escalation.count + 1,
        lastEscalatedAt: now,
        escalatedTo,
        escalatedBy: input.escalatedBy?.trim(),
        reason: input.reason?.trim(),
        history: [...stage.escalation.history, escalationEvent],
      },
    };
    const nextWorkflow: GoalSuggestionReviewWorkflow = {
      ...workflow,
      status: "pending_review",
      updatedAt: now,
      stages: workflow.stages.map((item, index) => index === workflow.currentStageIndex ? nextStage : item),
    };
    return {
      ...review,
      reviewer: escalatedTo ?? reviewers.map((item) => item.reviewer).join(", "),
      note: input.reason?.trim() || review.note,
      workflow: nextWorkflow,
      updatedAt: now,
    };
  }

  private async publishMethodSuggestion(
    goal: LongTermGoal,
    review: GoalSuggestionReviewItem,
    publishedAt: string,
    input: GoalSuggestionPublishInput,
  ): Promise<GoalSuggestionPublishRecord> {
    const methodCandidates = await readGoalMethodCandidates(goal);
    const candidate = methodCandidates.items.find((item) => item.id === review.suggestionId);
    if (!candidate) {
      throw new Error(`Method candidate not found: ${review.suggestionId}`);
    }
    const methodsDir = path.join(this.stateDir, "methods");
    await fs.mkdir(methodsDir, { recursive: true });
    const publishedPath = await this.resolveMethodPublishPath(methodsDir, candidate.slug, candidate.nodeId, candidate.id);
    await fs.writeFile(publishedPath, candidate.draftContent, "utf-8");
    return {
      id: `publish_${review.id}`,
      goalId: goal.id,
      reviewId: review.id,
      suggestionType: review.suggestionType,
      suggestionId: review.suggestionId,
      assetType: "method",
      title: review.title,
      publishedPath,
      assetKey: path.basename(publishedPath),
      reviewer: input.reviewer?.trim() || review.reviewer,
      decidedBy: input.decidedBy?.trim() || review.decidedBy,
      note: input.note?.trim() || review.note,
      nodeId: review.nodeId,
      runId: review.runId,
      sourcePath: getGoalMethodCandidatesPath(goal),
      publishedAt,
    };
  }

  private async publishSkillSuggestion(
    goal: LongTermGoal,
    review: GoalSuggestionReviewItem,
    publishedAt: string,
    input: GoalSuggestionPublishInput,
  ): Promise<GoalSuggestionPublishRecord> {
    const skillCandidates = await readGoalSkillCandidates(goal);
    const candidate = skillCandidates.items.find((item) => item.id === review.suggestionId);
    if (!candidate) {
      throw new Error(`Skill candidate not found: ${review.suggestionId}`);
    }
    const syntheticCandidate: ExperienceCandidate = {
      id: review.id,
      taskId: `${goal.id}:${review.nodeId ?? review.suggestionId}`,
      type: "skill",
      status: "draft",
      title: candidate.title,
      slug: candidate.slug,
      content: candidate.draftContent,
      summary: candidate.summary,
      qualityScore: candidate.qualityScore,
      sourceTaskSnapshot: {
        taskId: `${goal.id}:${review.nodeId ?? review.suggestionId}`,
        conversationId: goal.activeConversationId ?? `goal:${goal.id}`,
        source: "manual",
        status: "success",
        title: candidate.title,
        objective: candidate.evidence.objective,
        summary: candidate.summary,
        reflection: candidate.rationale.join(" | "),
        outcome: candidate.summary,
        toolCalls: candidate.evidence.toolNamesUsed.map((toolName) => ({ toolName, success: true })),
        artifactPaths: [],
        startedAt: candidate.createdAt,
        finishedAt: publishedAt,
      },
      createdAt: candidate.createdAt,
    };
    const publishedPath = await publishSkillCandidate(syntheticCandidate, this.stateDir, getGlobalSkillRegistry());
    return {
      id: `publish_${review.id}`,
      goalId: goal.id,
      reviewId: review.id,
      suggestionType: review.suggestionType,
      suggestionId: review.suggestionId,
      assetType: "skill",
      title: review.title,
      publishedPath,
      assetKey: path.basename(path.dirname(publishedPath)),
      reviewer: input.reviewer?.trim() || review.reviewer,
      decidedBy: input.decidedBy?.trim() || review.decidedBy,
      note: input.note?.trim() || review.note,
      nodeId: review.nodeId,
      runId: review.runId,
      sourcePath: getGoalSkillCandidatesPath(goal),
      publishedAt,
    };
  }

  private async syncPublishedSuggestionToExperienceCandidate(
    goal: LongTermGoal,
    review: GoalSuggestionReviewItem,
    record: GoalSuggestionPublishRecord,
  ): Promise<ExperienceCandidate | null> {
    const manager = getGlobalMemoryManager() as {
      upsertExperienceCandidate?: (candidate: ExperienceCandidate) => ExperienceCandidate;
      store?: {
        findExperienceCandidateByTaskAndType?: (taskId: string, type: ExperienceCandidate["type"]) => ExperienceCandidate | null;
        updateExperienceCandidate?: (candidateId: string, patch: Partial<ExperienceCandidate>) => ExperienceCandidate | null;
        createExperienceCandidate?: (candidate: ExperienceCandidate) => void;
        getExperienceCandidate?: (candidateId: string) => ExperienceCandidate | null;
      };
    } | null;
    if (!manager) return null;
    const syntheticTaskId = this.buildGoalSuggestionTaskId(goal.id, review.suggestionType, review.suggestionId);
    const now = record.publishedAt;
    const content = await fs.readFile(record.publishedPath, "utf-8").catch(() => "");
    const candidate = this.buildExperienceCandidateFromPublishedSuggestion(goal, review, record, syntheticTaskId, now, content);
    if (typeof manager.upsertExperienceCandidate === "function") {
      return manager.upsertExperienceCandidate(candidate);
    }
    const existing = manager.store?.findExperienceCandidateByTaskAndType?.(candidate.taskId, candidate.type) ?? null;
    if (existing && manager.store?.updateExperienceCandidate) {
      return manager.store.updateExperienceCandidate(existing.id, {
        status: candidate.status,
        title: candidate.title,
        slug: candidate.slug,
        content: candidate.content,
        summary: candidate.summary,
        qualityScore: candidate.qualityScore,
        sourceTaskSnapshot: candidate.sourceTaskSnapshot,
        publishedPath: candidate.publishedPath,
        reviewedAt: candidate.reviewedAt,
        acceptedAt: candidate.acceptedAt,
        rejectedAt: candidate.rejectedAt,
      });
    }
    if (manager.store?.createExperienceCandidate) {
      manager.store.createExperienceCandidate(candidate);
      return manager.store.getExperienceCandidate?.(candidate.id) ?? candidate;
    }
    return null;
  }

  private async buildHandoff(goal: LongTermGoal): Promise<GoalHandoffGenerateResult> {
    const [runtime, graph, checkpoints, plansState, progressContent] = await Promise.all([
      readGoalRuntime(goal),
      readGoalTaskGraph(goal),
      readGoalCheckpoints(goal),
      readGoalCapabilityPlans(goal),
      fs.readFile(goal.progressPath, "utf-8").catch((err: NodeJS.ErrnoException) => {
        if (err?.code === "ENOENT") return "";
        throw err;
      }),
    ]);
    return generateGoalHandoff({
      goal,
      runtime,
      graph,
      checkpoints,
      plans: plansState.items,
      progressContent,
    });
  }

  private async refreshHandoffAfterMutation(goal: LongTermGoal): Promise<void> {
    try {
      await this.buildHandoff(goal);
    } catch {
      // best effort auto-refresh: do not break core task/checkpoint state mutation because handoff refresh failed
    }
  }

  private async emitGoalUpdate(
    goal: LongTermGoal,
    input: {
      reason: GoalUpdateReason;
      nodeId?: string;
      checkpointId?: string;
      runId?: string;
    },
  ): Promise<void> {
    if (!this.eventSink) return;
    try {
      await this.eventSink({
        goal,
        reason: input.reason,
        areas: getGoalUpdateAreas(input.reason),
        nodeId: input.nodeId,
        checkpointId: input.checkpointId,
        runId: input.runId,
        at: new Date().toISOString(),
      });
    } catch {
      // event broadcast failure should not block core goal state mutation
    }
  }

  private async touchGoal(goal: LongTermGoal, patch: Partial<LongTermGoal> = {}): Promise<LongTermGoal> {
    const now = new Date().toISOString();
    const updatedGoal: LongTermGoal = {
      ...goal,
      ...patch,
      updatedAt: now,
      lastActiveAt: patch.lastActiveAt ?? now,
    };
    await upsertGoalRegistryEntry(this.stateDir, updatedGoal);
    await writeGoalRuntime(updatedGoal, {
      ...(await readGoalRuntime(updatedGoal)),
      goalId: updatedGoal.id,
      status: updatedGoal.status,
      activeConversationId: updatedGoal.activeConversationId,
      activeNodeId: updatedGoal.activeNodeId,
      lastNodeId: updatedGoal.lastNodeId,
      lastRunId: updatedGoal.lastRunId,
      pausedAt: updatedGoal.pausedAt,
      updatedAt: now,
    });
    return updatedGoal;
  }

  private resolveCheckpointForDecision(
    checkpoints: GoalCheckpointState,
    nodeId: string,
    checkpointId?: string,
  ): GoalCheckpointItem {
    const normalizedCheckpointId = checkpointId?.trim();
    if (normalizedCheckpointId) {
      const byId = checkpoints.items.find((item) => item.id === normalizedCheckpointId);
      if (!byId) {
        throw new Error(`Checkpoint not found: ${normalizedCheckpointId}`);
      }
      return byId;
    }
    const candidates = checkpoints.items
      .filter((item) => item.nodeId === nodeId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latest = candidates[0];
    if (!latest) {
      throw new Error(`No checkpoint found for node: ${nodeId}`);
    }
    return latest;
  }

  private resolveCapabilityPlanForNode(
    plans: GoalCapabilityPlanState,
    nodeId: string,
  ): GoalCapabilityPlan | null {
    const matched = plans.items
      .filter((item) => item.nodeId === nodeId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return matched[0] ?? null;
  }

  private buildSuggestionReviewItem(
    goal: LongTermGoal,
    input: {
      suggestionType: GoalSuggestionType;
      suggestionId: string;
      title: string;
      summary: string;
      sourcePath: string;
      nodeId?: string;
      runId?: string;
      evidenceRefs: string[];
    },
    existing?: GoalSuggestionReviewItem,
    now = new Date().toISOString(),
  ): GoalSuggestionReviewItem {
    return {
      id: existing?.id ?? `review_${input.suggestionType}_${input.suggestionId}`,
      goalId: goal.id,
      suggestionType: input.suggestionType,
      suggestionId: input.suggestionId,
      title: input.title,
      summary: input.summary,
      sourcePath: input.sourcePath,
      nodeId: input.nodeId,
      runId: input.runId,
      status: existing?.status ?? "pending_review",
      reviewer: existing?.reviewer,
      decidedBy: existing?.decidedBy,
      note: existing?.note,
      decidedAt: existing?.decidedAt,
      evidenceRefs: [...new Set(input.evidenceRefs.filter(Boolean))],
      workflow: existing?.workflow,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing?.updatedAt ?? now,
    };
  }

  private buildExperienceCandidateFromPublishedSuggestion(
    goal: LongTermGoal,
    review: GoalSuggestionReviewItem,
    record: GoalSuggestionPublishRecord,
    taskId: string,
    now: string,
    content: string,
  ): ExperienceCandidate {
    const candidateType = record.assetType;
    return {
      id: `goal_exp_${this.normalizeAsciiToken(goal.id, "goal")}_${this.normalizeAsciiToken(review.suggestionId, "suggestion")}_${candidateType}`,
      taskId,
      type: candidateType,
      status: "accepted",
      title: review.title,
      slug: this.normalizeAsciiToken(review.suggestionId, candidateType),
      content,
      summary: review.summary,
      qualityScore: undefined,
      sourceTaskSnapshot: {
        taskId,
        conversationId: goal.activeConversationId ?? `goal:${goal.id}`,
        source: "manual",
        status: "success",
        title: review.title,
        objective: review.summary,
        summary: review.summary,
        reflection: review.note,
        outcome: `${review.suggestionType} published to ${record.assetType}`,
        artifactPaths: [record.publishedPath],
        startedAt: review.createdAt,
        finishedAt: now,
      },
      publishedPath: record.publishedPath,
      createdAt: review.createdAt,
      reviewedAt: review.decidedAt ?? now,
      acceptedAt: now,
      rejectedAt: undefined,
    };
  }

  private buildGoalSuggestionTaskId(goalId: string, suggestionType: GoalSuggestionType, suggestionId: string): string {
    return `goal_suggestion:${goalId}:${suggestionType}:${suggestionId}`;
  }

  private async resolveMethodPublishPath(methodsDir: string, slug: string, nodeId: string | undefined, candidateId: string): Promise<string> {
    const baseName = this.toSafeMethodFilenameBase(slug, nodeId ?? candidateId);
    const suffixNodeId = this.normalizeAsciiToken(nodeId, "node");
    const suffixCandidateId = this.normalizeAsciiToken(candidateId, "candidate");
    const candidates = [
      `${baseName}.md`,
      `${baseName}-${suffixNodeId}.md`,
      `${baseName}-${suffixCandidateId}.md`,
    ];
    for (const filename of candidates) {
      const filePath = path.join(methodsDir, filename);
      if (!(await this.pathExists(filePath))) {
        return filePath;
      }
    }
    return path.join(methodsDir, `${baseName}-${suffixCandidateId}-${Date.now()}.md`);
  }

  private toSafeMethodFilenameBase(slug: string, fallback: string): string {
    const normalized = String(slug ?? "")
      .trim()
      .replace(/\.md$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || `method-${this.normalizeAsciiToken(fallback, "goal")}`;
  }

  private normalizeAsciiToken(value: string | undefined, fallback: string): string {
    const normalized = String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || fallback;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private resolveSuggestionReview(
    reviews: GoalSuggestionReviewState,
    reviewId?: string,
    suggestionType?: GoalSuggestionType,
    suggestionId?: string,
  ): GoalSuggestionReviewItem {
    const normalizedReviewId = reviewId?.trim();
    if (normalizedReviewId) {
      const matched = reviews.items.find((item) => item.id === normalizedReviewId);
      if (!matched) {
        throw new Error(`Suggestion review not found: ${normalizedReviewId}`);
      }
      return matched;
    }
    const normalizedSuggestionId = suggestionId?.trim();
    if (suggestionType && normalizedSuggestionId) {
      const matched = reviews.items.find((item) => item.suggestionType === suggestionType && item.suggestionId === normalizedSuggestionId);
      if (!matched) {
        throw new Error(`Suggestion review not found: ${suggestionType}/${normalizedSuggestionId}`);
      }
      return matched;
    }
    throw new Error("reviewId or suggestionType + suggestionId is required.");
  }

  private resolveCheckpointPolicyForNode(
    plans: GoalCapabilityPlanState,
    nodeId: string,
    checkpointRequired: boolean,
  ): GoalCheckpointPolicy {
    const plan = this.resolveCapabilityPlanForNode(plans, nodeId);
    if (plan) {
      return {
        riskLevel: plan.riskLevel,
        approvalMode: plan.checkpoint.approvalMode,
        requiredRequestFields: [...plan.checkpoint.requiredRequestFields],
        requiredDecisionFields: [...plan.checkpoint.requiredDecisionFields],
        suggestedReviewer: plan.checkpoint.suggestedReviewer,
        suggestedReviewerRole: plan.checkpoint.suggestedReviewerRole,
        suggestedSlaHours: plan.checkpoint.suggestedSlaHours,
        escalationMode: plan.checkpoint.escalationMode ?? "none",
        rationale: [...plan.checkpoint.reasons],
      };
    }
    return {
      approvalMode: checkpointRequired ? "single" : "none",
      requiredRequestFields: [],
      requiredDecisionFields: [],
      escalationMode: "none",
      rationale: checkpointRequired ? ["节点被显式标记为 checkpointRequired，但当前没有对应 capability plan。"] : [],
    };
  }

  private replaceCheckpoint(
    checkpoints: GoalCheckpointState,
    checkpoint: GoalCheckpointItem,
  ): GoalCheckpointState {
    return {
      version: 2,
      items: checkpoints.items.map((item) => (item.id === checkpoint.id ? checkpoint : item)),
    };
  }

  private appendCheckpointHistory(
    checkpoint: GoalCheckpointItem,
    entry: GoalCheckpointHistoryEntry,
  ): GoalCheckpointHistoryEntry[] {
    return [...checkpoint.history, entry];
  }

  private assertCheckpointRequestPolicy(
    policy: GoalCheckpointPolicy | undefined,
    value: {
      reviewer?: string;
      reviewerRole?: string;
      requestedBy?: string;
      slaAt?: string;
      summary?: string;
      note?: string;
    },
    action = "request",
  ): void {
    const effectivePolicy = policy ?? {
      approvalMode: "none" as const,
      requiredRequestFields: [],
      requiredDecisionFields: [],
      escalationMode: "none" as const,
    };
    const missing = effectivePolicy.requiredRequestFields.filter((field) => !this.readCheckpointPolicyField(field, value));
    if (missing.length === 0) return;
    throw new Error(`Checkpoint policy requires ${action} fields: ${missing.join(", ")}`);
  }

  private assertCheckpointDecisionPolicy(
    policy: GoalCheckpointPolicy | undefined,
    value: {
      summary?: string;
      note?: string;
      decidedBy?: string;
      reviewer?: string;
      reviewerRole?: string;
      requestedBy?: string;
      slaAt?: string;
    },
    action: "approve" | "reject" | "expire",
  ): void {
    const effectivePolicy = policy ?? {
      approvalMode: "none" as const,
      requiredRequestFields: [],
      requiredDecisionFields: [],
      escalationMode: "none" as const,
    };
    const missing = effectivePolicy.requiredDecisionFields.filter((field) => !this.readCheckpointPolicyField(field, value));
    if (missing.length === 0) return;
    throw new Error(`Checkpoint policy requires ${action} fields: ${missing.join(", ")}`);
  }

  private readCheckpointPolicyField(
    field: GoalCheckpointPolicy["requiredRequestFields"][number],
    value: {
      reviewer?: string;
      reviewerRole?: string;
      requestedBy?: string;
      slaAt?: string;
      summary?: string;
      note?: string;
      decidedBy?: string;
    },
  ): string | undefined {
    const raw = value[field];
    if (typeof raw !== "string") return undefined;
    const normalized = raw.trim();
    return normalized || undefined;
  }

  private resolveCheckpointContext(
    input: {
      reviewer?: string;
      reviewerRole?: string;
      requestedBy?: string;
      decidedBy?: string;
      slaAt?: string;
    },
    checkpoint?: GoalCheckpointItem,
    options: { clearDecidedBy?: boolean } = {},
  ): Pick<GoalCheckpointItem, "reviewer" | "reviewerRole" | "requestedBy" | "decidedBy" | "slaAt"> {
    const reviewer = input.reviewer?.trim() || checkpoint?.reviewer;
    const reviewerRole = input.reviewerRole?.trim() || checkpoint?.reviewerRole;
    const requestedBy = input.requestedBy?.trim() || checkpoint?.requestedBy;
    const decidedBy = options.clearDecidedBy
      ? undefined
      : input.decidedBy?.trim() || checkpoint?.decidedBy;
    const slaAt = input.slaAt?.trim() || checkpoint?.slaAt;
    return {
      reviewer: reviewer || undefined,
      reviewerRole: reviewerRole || undefined,
      requestedBy: requestedBy || undefined,
      decidedBy: decidedBy || undefined,
      slaAt: slaAt || undefined,
    };
  }
}
