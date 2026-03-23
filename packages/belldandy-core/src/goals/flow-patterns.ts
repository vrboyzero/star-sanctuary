import fs from "node:fs/promises";
import path from "node:path";
import { parseGoalProgressEntries } from "./progress.js";
import { writeGoalFlowPatterns } from "./runtime.js";
import type {
  GoalCapabilityPlan,
  GoalFlowPattern,
  GoalFlowPatternAction,
  GoalFlowPatternGenerateResult,
  GoalFlowPatternState,
  GoalRetrospectiveSnapshot,
  GoalTaskGraph,
  LongTermGoal,
} from "./types.js";

type GoalFlowPatternInput = {
  goal: LongTermGoal;
  graph: GoalTaskGraph;
  plans: GoalCapabilityPlan[];
  progressContent: string;
  retrospective: GoalRetrospectiveSnapshot;
};

type PatternAccumulator = {
  signature: string;
  eventSequence: string[];
  executionMode: GoalCapabilityPlan["executionMode"];
  riskLevel: GoalCapabilityPlan["riskLevel"];
  checkpointMode: GoalCapabilityPlan["checkpoint"]["approvalMode"];
  toolNames: string[];
  mcpServers: string[];
  methods: string[];
  skills: string[];
  gaps: string[];
  nodeRefs: GoalFlowPattern["nodeRefs"];
};

function getMarkdownPath(goal: Pick<LongTermGoal, "docRoot">): string {
  return path.join(goal.docRoot, "09-flow-patterns.md");
}

function getJsonPath(goal: Pick<LongTermGoal, "runtimeRoot">): string {
  return path.join(goal.runtimeRoot, "flow-patterns.json");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function buildSignature(input: {
  events: string[];
  executionMode: GoalCapabilityPlan["executionMode"];
  checkpointMode: GoalCapabilityPlan["checkpoint"]["approvalMode"];
  toolNames: string[];
  mcpServers: string[];
  riskLevel: GoalCapabilityPlan["riskLevel"];
}): string {
  const eventPart = input.events.join(">");
  const toolPart = uniqueSorted(input.toolNames).join(",");
  const mcpPart = uniqueSorted(input.mcpServers).join(",");
  return `events=${eventPart}|mode=${input.executionMode}|checkpoint=${input.checkpointMode}|risk=${input.riskLevel}|tools=${toolPart}|mcp=${mcpPart}`;
}

function decideAction(acc: PatternAccumulator): GoalFlowPatternAction {
  const repeated = acc.nodeRefs.length >= 2;
  const hasTooling = acc.toolNames.length >= 2 || acc.mcpServers.length > 0 || acc.executionMode === "multi_agent";
  const hasStableFlow = acc.eventSequence.includes("task_node_completed") || acc.nodeRefs.some((node) => node.status === "done");
  if (repeated && hasStableFlow && hasTooling) return "promote_both";
  if (repeated && hasStableFlow) return "promote_method";
  if (hasTooling || acc.gaps.length > 0 || acc.executionMode === "multi_agent") return "promote_skill";
  return "observe";
}

function buildRecommendations(acc: PatternAccumulator, action: GoalFlowPatternAction): string[] {
  const lines: string[] = [];
  if (action === "promote_both") {
    lines.push("该流程已具备重复性与能力编排特征，建议同时推进 method 与 skill 沉淀。");
  } else if (action === "promote_method") {
    lines.push("该流程已具备重复执行特征，建议优先沉淀为 method。");
  } else if (action === "promote_skill") {
    lines.push("该流程更依赖工具编排/MCP/多 Agent，建议优先沉淀为 skill。");
  } else {
    lines.push("当前先持续观察，待重复次数或证据密度提升后再沉淀。");
  }
  if (acc.gaps.length > 0) {
    lines.push(`关注高频能力缺口：${acc.gaps.join("；")}。`);
  }
  if (acc.toolNames.length > 0) {
    lines.push(`核心工具链：${acc.toolNames.join(", ")}。`);
  }
  return lines;
}

function computeConfidence(acc: PatternAccumulator, action: GoalFlowPatternAction): number {
  let score = 30;
  score += Math.min(25, acc.nodeRefs.length * 15);
  score += Math.min(15, acc.eventSequence.length * 3);
  if (acc.executionMode === "multi_agent") score += 10;
  if (acc.toolNames.length >= 2) score += 10;
  if (acc.mcpServers.length > 0) score += 5;
  if (action === "promote_both" || action === "promote_method" || action === "promote_skill") score += 10;
  return Math.min(100, score);
}

function buildSummary(acc: PatternAccumulator): string {
  return `该流程在 ${acc.nodeRefs.length} 个节点上出现，主要特征为 ${acc.eventSequence.join(" -> ") || "(no-events)"}，执行模式 ${acc.executionMode}，checkpoint=${acc.checkpointMode}。`;
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf-8");
}

function buildMarkdown(goal: LongTermGoal, patterns: GoalFlowPattern[], retrospective: GoalRetrospectiveSnapshot, markdownPath: string, jsonPath: string): string {
  const lines = [
    "# 09-flow-patterns",
    "",
    "## Meta",
    `- Goal ID: ${goal.id}`,
    `- Goal Title: ${goal.title}`,
    `- Generated At: ${new Date().toISOString()}`,
    `- Retrospective: ${retrospective.markdownPath}`,
    `- JSON Path: ${jsonPath}`,
    `- Markdown Path: ${markdownPath}`,
    "",
    "## Summary",
    `- Pattern Count: ${patterns.length}`,
    `- Goal Status: ${goal.status}`,
    `- Current Phase: ${goal.currentPhase ?? "(none)"}`,
    "",
    "## Patterns",
  ];
  if (patterns.length === 0) {
    lines.push("- (none)");
  } else {
    for (const pattern of patterns) {
      lines.push(`- [count=${pattern.count}][confidence=${pattern.confidence}] ${pattern.id} | action=${pattern.action}`);
      lines.push(`  - Summary: ${pattern.summary}`);
      lines.push(`  - Signature: ${pattern.signature}`);
      lines.push(`  - Events: ${pattern.eventSequence.join(" -> ") || "(none)"}`);
      lines.push(`  - Tools: ${pattern.toolNames.join(", ") || "(none)"}`);
      lines.push(`  - MCP: ${pattern.mcpServers.join(", ") || "(none)"}`);
      lines.push(`  - Methods: ${pattern.methods.join(", ") || "(none)"}`);
      lines.push(`  - Skills: ${pattern.skills.join(", ") || "(none)"}`);
      lines.push(`  - Gaps: ${pattern.gaps.join(", ") || "(none)"}`);
      lines.push(`  - Nodes: ${pattern.nodeRefs.map((item) => item.nodeId).join(", ") || "(none)"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function generateGoalFlowPatterns(input: GoalFlowPatternInput): Promise<GoalFlowPatternGenerateResult> {
  const { goal, graph, plans, progressContent, retrospective } = input;
  const progressEntries = parseGoalProgressEntries(progressContent);
  const byNode = new Map<string, PatternAccumulator>();
  for (const node of graph.nodes) {
    const plan = plans
      .filter((item) => item.nodeId === node.id)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0];
    const events = progressEntries
      .filter((entry) => entry.nodeId === node.id)
      .map((entry) => entry.event)
      .filter(Boolean);
    if (!plan && events.length === 0) continue;
    const executionMode = plan?.executionMode ?? "single_agent";
    const riskLevel = plan?.riskLevel ?? "low";
    const checkpointMode = plan?.checkpoint.approvalMode ?? "none";
    const toolNames = uniqueSorted(plan?.actualUsage.toolNames ?? []);
    const mcpServers = uniqueSorted(plan?.actualUsage.mcpServers ?? []);
    const signature = buildSignature({
      events,
      executionMode,
      checkpointMode,
      toolNames,
      mcpServers,
      riskLevel,
    });
    const existing = byNode.get(signature);
    if (existing) {
      existing.nodeRefs.push({
        nodeId: node.id,
        runId: node.lastRunId,
        status: node.status,
        checkpointStatus: node.checkpointStatus,
        phase: node.phase,
      });
      existing.methods = uniqueSorted([...existing.methods, ...(plan?.actualUsage.methods ?? [])]);
      existing.skills = uniqueSorted([...existing.skills, ...(plan?.actualUsage.skills ?? [])]);
      existing.gaps = uniqueSorted([...existing.gaps, ...(plan?.gaps ?? [])]);
      continue;
    }
    byNode.set(signature, {
      signature,
      eventSequence: events,
      executionMode,
      riskLevel,
      checkpointMode,
      toolNames,
      mcpServers,
      methods: uniqueSorted(plan?.actualUsage.methods ?? []),
      skills: uniqueSorted(plan?.actualUsage.skills ?? []),
      gaps: uniqueSorted(plan?.gaps ?? []),
      nodeRefs: [{
        nodeId: node.id,
        runId: node.lastRunId,
        status: node.status,
        checkpointStatus: node.checkpointStatus,
        phase: node.phase,
      }],
    });
  }

  const patterns: GoalFlowPattern[] = [...byNode.values()]
    .map((acc, index) => {
      const action = decideAction(acc);
      const recommendations = buildRecommendations(acc, action);
      return {
        id: `flow_pattern_${index + 1}`,
        goalId: goal.id,
        signature: acc.signature,
        summary: buildSummary(acc),
        count: acc.nodeRefs.length,
        action,
        confidence: computeConfidence(acc, action),
        eventSequence: acc.eventSequence,
        executionMode: acc.executionMode,
        riskLevel: acc.riskLevel,
        checkpointMode: acc.checkpointMode,
        toolNames: acc.toolNames,
        mcpServers: acc.mcpServers,
        methods: acc.methods,
        skills: acc.skills,
        gaps: acc.gaps,
        nodeRefs: acc.nodeRefs,
        recommendations,
      };
    })
    .sort((left, right) =>
      right.count - left.count
      || right.confidence - left.confidence
      || left.id.localeCompare(right.id),
    );

  const state: GoalFlowPatternState = {
    version: 1,
    items: patterns,
    generatedAt: new Date().toISOString(),
  };
  await writeGoalFlowPatterns(goal, state);
  const markdownPath = getMarkdownPath(goal);
  const jsonPath = getJsonPath(goal);
  const content = buildMarkdown(goal, patterns, retrospective, markdownPath, jsonPath);
  await atomicWriteText(markdownPath, content);
  return {
    goal,
    patterns,
    markdownPath,
    jsonPath,
    content,
  };
}
