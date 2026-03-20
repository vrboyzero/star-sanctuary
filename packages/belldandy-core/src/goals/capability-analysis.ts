import type {
  GoalCapabilityPlan,
  GoalCapabilityPlanActualUsage,
  GoalCapabilityPlanAnalysis,
  GoalCapabilityPlanDeviation,
  GoalCapabilityPlanOrchestration,
} from "./types.js";

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function buildUnusedDeviation(
  area: GoalCapabilityPlanDeviation["area"],
  label: string,
  planned: string[],
): GoalCapabilityPlanDeviation | null {
  if (planned.length === 0) return null;
  return {
    kind: "planned_but_unused",
    area,
    severity: "medium",
    summary: `计划中的 ${label} 未在本轮实际使用: ${planned.join(", ")}`,
    planned,
  };
}

function buildUnexpectedDeviation(
  area: GoalCapabilityPlanDeviation["area"],
  label: string,
  actual: string[],
): GoalCapabilityPlanDeviation | null {
  if (actual.length === 0) return null;
  return {
    kind: "unplanned_but_used",
    area,
    severity: area === "mcp" ? "medium" : "low",
    summary: `本轮实际使用了未纳入计划的 ${label}: ${actual.join(", ")}`,
    actual,
  };
}

export function getDefaultCapabilityPlanAnalysis(updatedAt?: string): GoalCapabilityPlanAnalysis {
  return {
    status: "pending",
    summary: "尚未记录实际 usage，待执行后再比较计划与实际偏差。",
    deviations: [],
    recommendations: [],
    updatedAt,
  };
}

export function analyzeGoalCapabilityPlan(plan: Pick<
  GoalCapabilityPlan,
  "status" | "executionMode" | "methods" | "skills" | "mcpServers" | "subAgents" | "actualUsage" | "orchestration"
> & {
  actualUsage?: GoalCapabilityPlanActualUsage;
  orchestration?: GoalCapabilityPlanOrchestration;
}): GoalCapabilityPlanAnalysis {
  const actualUsage = plan.actualUsage ?? { methods: [], skills: [], mcpServers: [], toolNames: [] };
  const orchestration = plan.orchestration;
  const plannedMethods = uniqueStrings(plan.methods.map((item) => item.file));
  const plannedSkills = uniqueStrings(plan.skills.map((item) => item.name));
  const plannedMcpServers = uniqueStrings(plan.mcpServers.map((item) => item.serverId));
  const actualMethods = uniqueStrings(actualUsage.methods);
  const actualSkills = uniqueStrings(actualUsage.skills);
  const actualMcpServers = uniqueStrings(actualUsage.mcpServers);
  const actualToolNames = uniqueStrings(actualUsage.toolNames);
  const hasActualUsage = actualMethods.length > 0 || actualSkills.length > 0 || actualMcpServers.length > 0 || actualToolNames.length > 0;

  if (!hasActualUsage && plan.status !== "orchestrated") {
    return getDefaultCapabilityPlanAnalysis(actualUsage.updatedAt);
  }

  const deviations: GoalCapabilityPlanDeviation[] = [];
  const plannedButUnusedMethods = difference(plannedMethods, actualMethods);
  const plannedButUnusedSkills = difference(plannedSkills, actualSkills);
  const plannedButUnusedMcpServers = difference(plannedMcpServers, actualMcpServers);
  const unexpectedMethods = difference(actualMethods, plannedMethods);
  const unexpectedSkills = difference(actualSkills, plannedSkills);
  const unexpectedMcpServers = difference(actualMcpServers, plannedMcpServers);

  const methodUnusedDeviation = buildUnusedDeviation("method", "method", plannedButUnusedMethods);
  if (methodUnusedDeviation) deviations.push(methodUnusedDeviation);
  const skillUnusedDeviation = buildUnusedDeviation("skill", "skill", plannedButUnusedSkills);
  if (skillUnusedDeviation) deviations.push(skillUnusedDeviation);
  const mcpUnusedDeviation = buildUnusedDeviation("mcp", "MCP", plannedButUnusedMcpServers);
  if (mcpUnusedDeviation) deviations.push(mcpUnusedDeviation);

  const methodUnexpectedDeviation = buildUnexpectedDeviation("method", "method", unexpectedMethods);
  if (methodUnexpectedDeviation) deviations.push(methodUnexpectedDeviation);
  const skillUnexpectedDeviation = buildUnexpectedDeviation("skill", "skill", unexpectedSkills);
  if (skillUnexpectedDeviation) deviations.push(skillUnexpectedDeviation);
  const mcpUnexpectedDeviation = buildUnexpectedDeviation("mcp", "MCP", unexpectedMcpServers);
  if (mcpUnexpectedDeviation) deviations.push(mcpUnexpectedDeviation);

  if (!hasActualUsage && plan.status === "orchestrated") {
    deviations.push({
      kind: "usage_untracked",
      area: "tooling",
      severity: "medium",
      summary: "节点已经编排执行，但还没有采集到 actual usage，需确认记录链路是否完整。",
      actual: [],
    });
  }

  if (
    plan.executionMode === "multi_agent"
    && plan.subAgents.length > 0
    && plan.status === "orchestrated"
    && !orchestration?.delegated
  ) {
    deviations.push({
      kind: "delegation_gap",
      area: "sub_agent",
      severity: "medium",
      summary: `计划要求 multi_agent 分工，但本轮未发生子代理委托: ${plan.subAgents.map((item) => item.agentId).join(", ")}`,
      planned: uniqueStrings(plan.subAgents.map((item) => item.agentId)),
    });
  }

  const recommendations = uniqueStrings([
    plannedButUnusedMethods.length > 0
      ? `若该类节点持续未使用 method ${plannedButUnusedMethods.join(", ")}，应下调其默认优先级，或替换为更贴近实际执行路径的方法。`
      : undefined,
    unexpectedMethods.length > 0
      ? `将实际使用的 method ${unexpectedMethods.join(", ")} 纳入该类节点的 capabilityPlan 候选，减少执行前规划偏差。`
      : undefined,
    plannedButUnusedSkills.length > 0
      ? `复核计划中的 skill ${plannedButUnusedSkills.join(", ")} 是否仍适用，避免 capabilityPlan 继续推荐无效技能。`
      : undefined,
    unexpectedSkills.length > 0
      ? `将实际触发的 skill ${unexpectedSkills.join(", ")} 回收进默认规划模板，提升后续节点命中率。`
      : undefined,
    unexpectedMcpServers.length > 0
      ? `将实际使用的 MCP ${unexpectedMcpServers.join(", ")} 纳入默认候选，并补充适用场景说明。`
      : undefined,
    plannedButUnusedMcpServers.length > 0
      ? `若 MCP ${plannedButUnusedMcpServers.join(", ")} 连续未命中，应调整 capabilityPlan 的外部能力推荐顺序。`
      : undefined,
    plan.executionMode === "multi_agent" && plan.subAgents.length > 0 && plan.status === "orchestrated" && !orchestration?.delegated
      ? "当前 multi_agent 计划未真正发生委托；若后续仍由主 Agent 独立完成，应改回 single_agent，或补齐专用子代理 profile。"
      : undefined,
    !hasActualUsage && plan.status === "orchestrated"
      ? "补检查 actual usage 采集链路，确保 methods / skills / MCP 的实际使用能稳定回写。"
      : undefined,
  ]);

  if (deviations.length === 0) {
    return {
      status: "aligned",
      summary: hasActualUsage
        ? "计划与实际执行基本对齐，当前未发现明显 capability 偏差。"
        : "当前未发现明显偏差，但仍缺少实际 usage 记录。",
      deviations: [],
      recommendations,
      updatedAt: actualUsage.updatedAt,
    };
  }

  const hasHighSeverity = deviations.some((item) => item.severity === "high");
  const status = hasHighSeverity || deviations.length >= 3 ? "diverged" : "partial";
  return {
    status,
    summary: status === "diverged"
      ? `检测到 ${deviations.length} 项明显偏差，需回调 capabilityPlan 候选与执行策略。`
      : `检测到 ${deviations.length} 项计划/实际偏差，建议在节点收尾时做轻量修正。`,
    deviations,
    recommendations,
    updatedAt: actualUsage.updatedAt,
  };
}
