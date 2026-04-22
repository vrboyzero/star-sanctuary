import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeGoalSlug } from "./paths.js";
import type {
  GoalCapabilityPlan,
  GoalRetrospectiveSnapshot,
  GoalSkillCandidate,
  GoalSkillCandidateGenerateResult,
  GoalSkillCandidateState,
  LongTermGoal,
} from "./types.js";

type GoalSkillCandidateInput = {
  goal: LongTermGoal;
  plans: GoalCapabilityPlan[];
  retrospective: GoalRetrospectiveSnapshot;
};

function getMarkdownPath(goal: Pick<LongTermGoal, "docRoot">): string {
  return path.join(goal.docRoot, "08-skill-candidates.md");
}

function getJsonPath(goal: Pick<LongTermGoal, "runtimeRoot">): string {
  return path.join(goal.runtimeRoot, "skill-candidates.json");
}

function slugify(input: string): string {
  return normalizeGoalSlug(input).replace(/^-+|-+$/g, "") || "skill-candidate";
}

function scoreCandidate(plan: GoalCapabilityPlan): number {
  let score = 20;
  score += Math.min(20, plan.gaps.length * 10);
  score += Math.min(15, plan.actualUsage.toolNames.length * 3);
  score += Math.min(10, plan.actualUsage.mcpServers.length * 5);
  score += Math.min(10, plan.subAgents.length * 5);
  if (plan.executionMode === "multi_agent") score += 10;
  if (plan.riskLevel === "high") score += 10;
  if (plan.analysis.status === "diverged") score += 15;
  if (plan.analysis.status === "partial") score += 8;
  return Math.min(100, score);
}

function buildSummary(plan: GoalCapabilityPlan): string {
  if (plan.gaps.length > 0) {
    return `节点 ${plan.nodeId} 暴露出能力缺口：${plan.gaps.join("；")}，已具备沉淀 skill 候选的价值。`;
  }
  if (plan.analysis.deviations.length > 0) {
    return `节点 ${plan.nodeId} 出现计划/实际偏差，说明现有能力封装不足，适合收敛为 skill 候选。`;
  }
  return `节点 ${plan.nodeId} 已形成一组可复用的工具编排与执行约束，适合沉淀为 skill 草稿。`;
}

function buildRationale(plan: GoalCapabilityPlan): string[] {
  const reasons: string[] = [];
  if (plan.gaps.length > 0) reasons.push(`存在能力缺口：${plan.gaps.join(" | ")}。`);
  if (plan.executionMode === "multi_agent") reasons.push("节点需要 multi-agent 编排，说明已超出单步 method 的表达能力。");
  if (plan.actualUsage.toolNames.length >= 2) reasons.push("节点已形成多工具组合使用路径，适合作为 skill 封装。");
  if (plan.actualUsage.mcpServers.length > 0) reasons.push("节点依赖 MCP server 协同，适合沉淀为可复用 skill。");
  if (plan.analysis.deviations.length > 0) reasons.push("节点存在 capability 偏差，当前更需要能力封装而不是只补 method。");
  if (plan.riskLevel === "high") reasons.push("节点为高风险执行场景，skill 化有助于稳定执行约束。");
  return reasons.length > 0 ? reasons : ["当前节点已形成一组可复用执行模式，值得作为 skill 候选进入人工审阅。"];
}

function buildDraftContent(goal: LongTermGoal, plan: GoalCapabilityPlan, summary: string): string {
  const toolNames = plan.actualUsage.toolNames.length > 0
    ? plan.actualUsage.toolNames
    : [];
  const title = `${plan.nodeId} skill 候选`;
  const escapedName = `${plan.nodeId} skill draft`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedDescription = summary.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const objective = plan.objective?.trim() || goal.objective?.trim() || title;
  const constraintSummary = plan.analysis.summary.trim() || plan.summary.trim() || "待补充";
  const expectedOutput = plan.summary.trim() || "至少形成一个可检查的执行结果。";
  const lines = [
    "---",
    `name: "${escapedName}"`,
    `description: "${escapedDescription}"`,
    'version: "0.1.0-draft"',
    `tags: ["goal-derived", "${goal.id}", "${plan.nodeId}"]`,
    `priority: ${plan.riskLevel === "high" ? "high" : "normal"}`,
    ...(toolNames.length > 0 ? [
      "eligibility:",
      "  tools:",
      ...toolNames.map((toolName) => `    - "${toolName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`),
    ] : []),
    "---",
    "",
    `# ${title}`,
    "",
    `> ${summary}`,
    "",
    "## 快速开始",
    "1. 先确认当前节点目标、约束和验收标准。",
    plan.actualUsage.toolNames.length > 0
      ? `2. 优先按这些工具顺序执行：${plan.actualUsage.toolNames.join(", ")}。`
      : "2. 优先按当前 goal 已验证的最小闭环执行。",
    "3. 如果当前输入或目标产物偏离来源节点，先停在 candidate 层人工审阅。",
    "",
    "## 决策路由",
    `- 任务仍属于“${objective}”这一类问题时，优先复用本 skill candidate，而不是重新从零组织流程。`,
    toolNames.length > 0
      ? `- 当主路径仍依赖 ${plan.actualUsage.toolNames.join(" / ")} 这组工具时，优先沿用已验证顺序。`
      : "- 当任务仍能沿用当前 goal 的最小闭环时，优先复用本 candidate。",
    "- 如果输入约束、目标产物或边界条件明显变化，先人工审阅 candidate，不要直接发布。",
    "- 如果现有 method / skill 已经覆盖问题，优先复用现有资产，避免重复沉淀。",
    "",
    "## 输入",
    `- 任务目标：${objective}`,
    `- 关键约束：${constraintSummary}`,
    toolNames.length > 0
      ? `- 可用工具：${plan.actualUsage.toolNames.join(" / ")}`
      : "- 可用工具：沿用当前 goal 已验证的最小执行路径",
    "",
    "## 输出",
    `- 预期产物：${expectedOutput}`,
    "- 执行结果应包含：关键步骤、验证点、异常分支处理。",
    "- 如果结果不足以复用，应停留在 candidate 层，不要冒进发布。",
    "",
    "## 参考指引",
    `- Goal ID: ${goal.id}`,
    `- Node ID: ${plan.nodeId}`,
    `- Plan ID: ${plan.id}`,
    `- Plan Status: ${plan.status}`,
    plan.runId ? `- Run ID: ${plan.runId}` : "",
    `- 偏差摘要：${constraintSummary}`,
    plan.actualUsage.mcpServers.length > 0
      ? `- MCP 依赖：${plan.actualUsage.mcpServers.join(" / ")}`
      : "- MCP 依赖：无",
    "",
    "## NEVER",
    "- 不要把一次性的临时 workaround 直接写成通用规则。",
    "- 不要绕过人工审阅直接覆盖正式 skill 资产。",
    "- 不要忽略现有 method / skill，重复制造同类资产。",
    "- 如果出现新约束或新工具组合，不要假装本 candidate 仍然适用。",
    "",
    "## 适用场景",
    objective,
    "",
    "## 风险与约束",
    `- Execution Mode: ${plan.executionMode}`,
    `- Risk Level: ${plan.riskLevel}`,
    `- Checkpoint Mode: ${plan.checkpoint.approvalMode}`,
    `- Gaps: ${plan.gaps.join(" | ") || "(none)"}`,
    "",
    "## 偏差与建议",
    plan.analysis.summary,
    "",
  ].filter(Boolean);
  return lines.join("\n");
}

async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, targetPath);
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, targetPath);
}

function buildMarkdown(goal: LongTermGoal, candidates: GoalSkillCandidate[], retrospective: GoalRetrospectiveSnapshot, markdownPath: string, jsonPath: string): string {
  const lines = [
    "# 08-skill-candidates",
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
    `- Candidate Count: ${candidates.length}`,
    `- Goal Status: ${goal.status}`,
    `- Current Phase: ${goal.currentPhase ?? "(none)"}`,
    "",
    "## Candidates",
  ];
  if (candidates.length === 0) {
    lines.push("- (none)");
  } else {
    for (const candidate of candidates) {
      lines.push(`- [score=${candidate.qualityScore}] ${candidate.id} | ${candidate.nodeId} | ${candidate.title}`);
      lines.push(`  - Summary: ${candidate.summary}`);
      lines.push(`  - Rationale: ${candidate.rationale.join(" | ")}`);
      lines.push(`  - Evidence: gaps=${candidate.evidence.gaps.join(", ") || "(none)"} | tools=${candidate.evidence.toolNamesUsed.join(", ") || "(none)"} | mcp=${candidate.evidence.mcpServersUsed.join(", ") || "(none)"}`);
      lines.push(`  - References: ${candidate.evidence.references.join(" | ") || "(none)"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function generateGoalSkillCandidates(input: GoalSkillCandidateInput): Promise<GoalSkillCandidateGenerateResult> {
  const { goal, plans, retrospective } = input;
  const candidates: GoalSkillCandidate[] = plans
    .filter((plan) =>
      plan.gaps.length > 0
      || plan.executionMode === "multi_agent"
      || plan.actualUsage.toolNames.length >= 2
      || plan.analysis.status === "diverged"
      || plan.analysis.status === "partial",
    )
    .map((plan) => {
      const summary = buildSummary(plan);
      const qualityScore = scoreCandidate(plan);
      const references = [
        goal.northstarPath,
        goal.tasksPath,
        goal.progressPath,
        retrospective.markdownPath,
      ];
      return {
        id: `skill_candidate_${plan.nodeId}`,
        goalId: goal.id,
        nodeId: plan.nodeId,
        runId: plan.runId,
        title: `${plan.nodeId} skill 候选`,
        slug: slugify(`${goal.slug}-${plan.nodeId}-skill`),
        status: "suggested" as const,
        summary,
        rationale: buildRationale(plan),
        qualityScore,
        evidence: {
          nodeId: plan.nodeId,
          runId: plan.runId,
          executionMode: plan.executionMode,
          riskLevel: plan.riskLevel,
          planStatus: plan.status,
          objective: plan.objective,
          summary: plan.summary,
          gaps: [...plan.gaps],
          methodsUsed: [...plan.actualUsage.methods],
          skillsUsed: [...plan.actualUsage.skills],
          mcpServersUsed: [...plan.actualUsage.mcpServers],
          toolNamesUsed: [...plan.actualUsage.toolNames],
          deviations: plan.analysis.deviations.map((item) => `[${item.area}] ${item.summary}`),
          references,
        },
        draftContent: buildDraftContent(goal, plan, summary),
        createdAt: new Date().toISOString(),
      };
    })
    .filter((candidate) => candidate.qualityScore >= 45)
    .sort((left, right) => right.qualityScore - left.qualityScore || left.nodeId.localeCompare(right.nodeId));

  const state: GoalSkillCandidateState = {
    version: 1,
    items: candidates,
  };
  const jsonPath = getJsonPath(goal);
  const markdownPath = getMarkdownPath(goal);
  const content = buildMarkdown(goal, candidates, retrospective, markdownPath, jsonPath);
  await atomicWriteJson(jsonPath, state);
  await atomicWriteText(markdownPath, content);
  return {
    goal,
    candidates,
    markdownPath,
    jsonPath,
    content,
  };
}
