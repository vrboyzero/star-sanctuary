import fs from "node:fs/promises";
import path from "node:path";
import { getGoalsDocsRoot, getGoalsRoot } from "./paths.js";
import type {
  GoalCrossFlowPattern,
  GoalCrossFlowPatternGenerateResult,
  GoalCrossFlowPatternRef,
  GoalFlowPattern,
  GoalFlowPatternAction,
  LongTermGoal,
} from "./types.js";

type CrossGoalFlowInput = {
  stateDir: string;
  goals: Array<{
    goal: LongTermGoal;
    patterns: GoalFlowPattern[];
  }>;
};

type CrossAccumulator = {
  signature: string;
  eventSequence: string[];
  executionMode: GoalFlowPattern["executionMode"];
  riskLevel: GoalFlowPattern["riskLevel"];
  checkpointMode: GoalFlowPattern["checkpointMode"];
  toolNames: string[];
  mcpServers: string[];
  methods: string[];
  skills: string[];
  gaps: string[];
  refs: GoalCrossFlowPatternRef[];
  occurrenceCount: number;
  confidenceTotal: number;
  actionVotes: GoalFlowPatternAction[];
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function decideRecommendedAction(goalCount: number, votes: GoalFlowPatternAction[]): GoalFlowPatternAction {
  const priority: GoalFlowPatternAction[] = ["promote_both", "promote_skill", "promote_method"];
  for (const action of priority) {
    if (votes.includes(action)) return action;
  }
  if (goalCount >= 2) return "promote_method";
  return "observe";
}

function buildRecommendations(pattern: GoalCrossFlowPattern): string[] {
  const lines: string[] = [];
  if (pattern.goalCount >= 2) {
    lines.push(`该模式已跨 ${pattern.goalCount} 个 goal 重复出现，可进入更高优先级治理。`);
  }
  if (pattern.recommendedAction === "promote_both") {
    lines.push("建议同时推进 method 与 skill 沉淀，避免重复手工编排。");
  } else if (pattern.recommendedAction === "promote_skill") {
    lines.push("建议优先沉淀为 skill，统一工具/MCP/多 Agent 编排。");
  } else if (pattern.recommendedAction === "promote_method") {
    lines.push("建议优先沉淀为 method，统一执行步骤与验收口径。");
  } else {
    lines.push("当前先持续观察，待重复目标数进一步增加后再正式沉淀。");
  }
  if (pattern.gaps.length > 0) {
    lines.push(`高频能力缺口：${pattern.gaps.join("；")}。`);
  }
  return lines;
}

function getJsonPath(stateDir: string): string {
  return path.join(getGoalsRoot(stateDir), "cross-goal-flow-patterns.json");
}

function getMarkdownPath(stateDir: string): string {
  return path.join(getGoalsDocsRoot(stateDir), "cross-goal-flow-patterns.md");
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf-8");
}

function buildMarkdown(
  result: GoalCrossFlowPatternGenerateResult,
  markdownPath: string,
  jsonPath: string,
): string {
  const lines = [
    "# 12-cross-goal-flow-patterns",
    "",
    "## Meta",
    `- Generated At: ${result.generatedAt}`,
    `- Goals Scanned: ${result.goalsScanned}`,
    `- Pattern Count: ${result.patterns.length}`,
    `- JSON Path: ${jsonPath}`,
    `- Markdown Path: ${markdownPath}`,
    "",
    "## Patterns",
  ];
  if (result.patterns.length === 0) {
    lines.push("- (none)");
  } else {
    for (const pattern of result.patterns) {
      lines.push(`- [goals=${pattern.goalCount}][occurrences=${pattern.occurrenceCount}][confidence=${pattern.confidence}] ${pattern.id} | action=${pattern.recommendedAction}`);
      lines.push(`  - Summary: ${pattern.summary}`);
      lines.push(`  - Signature: ${pattern.signature}`);
      lines.push(`  - Events: ${pattern.eventSequence.join(" -> ") || "(none)"}`);
      lines.push(`  - Goals: ${pattern.goalRefs.map((item) => item.goalId).join(", ") || "(none)"}`);
      lines.push(`  - Tools: ${pattern.toolNames.join(", ") || "(none)"}`);
      lines.push(`  - Methods: ${pattern.methods.join(", ") || "(none)"}`);
      lines.push(`  - Skills: ${pattern.skills.join(", ") || "(none)"}`);
      lines.push(`  - Gaps: ${pattern.gaps.join(", ") || "(none)"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function generateCrossGoalFlowPatterns(input: CrossGoalFlowInput): Promise<GoalCrossFlowPatternGenerateResult> {
  const bySignature = new Map<string, CrossAccumulator>();
  for (const entry of input.goals) {
    for (const pattern of entry.patterns) {
      const existing = bySignature.get(pattern.signature);
      const ref: GoalCrossFlowPatternRef = {
        goalId: entry.goal.id,
        goalTitle: entry.goal.title,
        patternId: pattern.id,
        count: pattern.count,
        confidence: pattern.confidence,
        nodeRefs: pattern.nodeRefs,
      };
      if (existing) {
        existing.refs.push(ref);
        existing.occurrenceCount += pattern.count;
        existing.confidenceTotal += pattern.confidence;
        existing.toolNames = uniqueSorted([...existing.toolNames, ...pattern.toolNames]);
        existing.mcpServers = uniqueSorted([...existing.mcpServers, ...pattern.mcpServers]);
        existing.methods = uniqueSorted([...existing.methods, ...pattern.methods]);
        existing.skills = uniqueSorted([...existing.skills, ...pattern.skills]);
        existing.gaps = uniqueSorted([...existing.gaps, ...pattern.gaps]);
        existing.actionVotes.push(pattern.action);
        continue;
      }
      bySignature.set(pattern.signature, {
        signature: pattern.signature,
        eventSequence: pattern.eventSequence,
        executionMode: pattern.executionMode,
        riskLevel: pattern.riskLevel,
        checkpointMode: pattern.checkpointMode,
        toolNames: [...pattern.toolNames],
        mcpServers: [...pattern.mcpServers],
        methods: [...pattern.methods],
        skills: [...pattern.skills],
        gaps: [...pattern.gaps],
        refs: [ref],
        occurrenceCount: pattern.count,
        confidenceTotal: pattern.confidence,
        actionVotes: [pattern.action],
      });
    }
  }

  const patterns: GoalCrossFlowPattern[] = [...bySignature.values()]
    .map((acc, index) => {
      const goalCount = new Set(acc.refs.map((item) => item.goalId)).size;
      const confidence = Math.min(100, Math.round(acc.confidenceTotal / Math.max(1, acc.refs.length) + Math.min(20, goalCount * 5)));
      const recommendedAction = decideRecommendedAction(goalCount, acc.actionVotes);
      const pattern: GoalCrossFlowPattern = {
        id: `cross_goal_flow_${index + 1}`,
        signature: acc.signature,
        summary: `该流程在 ${goalCount} 个 goal 中共出现 ${acc.occurrenceCount} 次，主要特征为 ${acc.eventSequence.join(" -> ") || "(no-events)"}。`,
        goalCount,
        occurrenceCount: acc.occurrenceCount,
        recommendedAction,
        confidence,
        eventSequence: acc.eventSequence,
        executionMode: acc.executionMode,
        riskLevel: acc.riskLevel,
        checkpointMode: acc.checkpointMode,
        toolNames: uniqueSorted(acc.toolNames),
        mcpServers: uniqueSorted(acc.mcpServers),
        methods: uniqueSorted(acc.methods),
        skills: uniqueSorted(acc.skills),
        gaps: uniqueSorted(acc.gaps),
        goalRefs: acc.refs.sort((left, right) => left.goalId.localeCompare(right.goalId, "zh-CN")),
        recommendations: [],
      };
      pattern.recommendations = buildRecommendations(pattern);
      return pattern;
    })
    .sort((left, right) =>
      right.goalCount - left.goalCount
      || right.occurrenceCount - left.occurrenceCount
      || right.confidence - left.confidence
      || left.id.localeCompare(right.id, "zh-CN"));

  const generatedAt = new Date().toISOString();
  const jsonPath = getJsonPath(input.stateDir);
  const markdownPath = getMarkdownPath(input.stateDir);
  const result: GoalCrossFlowPatternGenerateResult = {
    generatedAt,
    goalsScanned: input.goals.length,
    patterns,
    markdownPath,
    jsonPath,
    content: "",
  };
  const content = buildMarkdown(result, markdownPath, jsonPath);
  result.content = content;
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify({
    version: 1,
    items: patterns,
    generatedAt,
    goalsScanned: input.goals.length,
  }, null, 2), "utf-8");
  await atomicWriteText(markdownPath, content);
  return result;
}
