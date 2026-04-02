import type {
  GoalCapabilityExecutionMode,
  GoalCapabilityPlanCoordinationPlan,
  GoalCapabilityPlanMethod,
  GoalCapabilityPlanMcpServer,
  GoalCapabilityPlanRolePolicy,
  GoalCapabilityPlanSaveInput,
  GoalCapabilityPlanSkill,
  GoalCapabilityPlanSubAgent,
  GoalCapabilityRiskLevel,
} from "./types.js";

export type CapabilityPlannerMethodCandidate = GoalCapabilityPlanMethod;
export type CapabilityPlannerSkillCandidate = GoalCapabilityPlanSkill;
export type CapabilityPlannerMcpCandidate = GoalCapabilityPlanMcpServer;

export type CapabilityPlannerInput = {
  goalTitle: string;
  goalObjective?: string;
  nodeId: string;
  nodeTitle: string;
  nodeDescription?: string;
  nodePhase?: string;
  nodeOwner?: string;
  queryHints?: string[];
  methods?: CapabilityPlannerMethodCandidate[];
  skills?: CapabilityPlannerSkillCandidate[];
  mcpServers?: CapabilityPlannerMcpCandidate[];
  availableAgentIds?: string[];
  forceMode?: GoalCapabilityExecutionMode;
  runId?: string;
};

function compactText(parts: Array<string | undefined>): string {
  return parts
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join(" ")
    .trim();
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function pickExecutionMode(text: string, forceMode?: GoalCapabilityExecutionMode): GoalCapabilityExecutionMode {
  if (forceMode) return forceMode;
  if (/(并行|多代理|multi-agent|sub-agent|delegate|delegat|拆分|批量|大规模|跨模块|跨文件|research|调研)/i.test(text)) {
    return "multi_agent";
  }
  return "single_agent";
}

function inferRisk(text: string): {
  riskLevel: "low" | "medium" | "high";
  checkpoint: {
    required: boolean;
    reasons: string[];
    approvalMode: "none" | "single" | "strict";
    requiredRequestFields: Array<"reviewer" | "reviewerRole" | "requestedBy" | "slaAt" | "summary" | "note" | "decidedBy">;
    requiredDecisionFields: Array<"reviewer" | "reviewerRole" | "requestedBy" | "slaAt" | "summary" | "note" | "decidedBy">;
    suggestedTitle?: string;
    suggestedNote?: string;
    suggestedReviewer?: string;
    suggestedReviewerRole?: string;
    suggestedSlaHours?: number;
    escalationMode?: "none" | "manual";
  };
} {
  const reasons: string[] = [];
  const addReason = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  if (/(部署|上线|release|deploy|production|publish)/i.test(text)) addReason("涉及部署/上线/发布。");
  if (/(迁移|migration|schema|数据库|db|sql)/i.test(text)) addReason("涉及数据库或数据迁移。");
  if (/(删除|remove|rm |清理|覆盖|overwrite|replace all|大范围修改)/i.test(text)) addReason("涉及删除、覆盖或大范围修改。");
  if (/(依赖升级|major|breaking|版本升级|upgrade dependency|upgrade package)/i.test(text)) addReason("涉及依赖升级或兼容性变化。");
  if (/(外部系统|api|支付|写入|同步|webhook|browser|网页自动化)/i.test(text)) addReason("涉及外部系统调用或对外写入。");
  if (/(安全|权限|auth|token|secret|credential)/i.test(text)) addReason("涉及权限、安全或敏感配置。");

  const riskLevel = reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : "low";
  return {
    riskLevel,
    checkpoint: {
      required: riskLevel === "medium" || riskLevel === "high",
      reasons,
      approvalMode: riskLevel === "high" ? "strict" : riskLevel === "medium" ? "single" : "none",
      requiredRequestFields: riskLevel === "high"
        ? ["reviewerRole", "slaAt", "note"]
        : riskLevel === "medium"
          ? ["reviewerRole"]
          : [],
      requiredDecisionFields: riskLevel === "high"
        ? ["summary", "note", "decidedBy"]
        : riskLevel === "medium"
          ? ["summary", "decidedBy"]
          : [],
      suggestedTitle: riskLevel === "high"
        ? "High-risk execution checkpoint"
        : riskLevel === "medium"
          ? "Risk review checkpoint"
          : undefined,
      suggestedNote: riskLevel === "high"
        ? `该节点命中高风险信号：${reasons.join(" ")}执行前建议先审批影响范围、回滚方案与验证方式。`
        : riskLevel === "medium"
          ? `该节点存在风险信号：${reasons.join(" ")}执行前建议确认审批责任人与验收口径。`
          : undefined,
      suggestedReviewerRole: riskLevel === "high" ? "producer" : riskLevel === "medium" ? "reviewer" : undefined,
      suggestedReviewer: undefined,
      suggestedSlaHours: riskLevel === "high" ? 12 : riskLevel === "medium" ? 24 : undefined,
      escalationMode: riskLevel === "high" ? "manual" : "none",
    },
  };
}

function buildSubAgents(text: string, availableAgentIds: string[], executionMode: GoalCapabilityExecutionMode): GoalCapabilityPlanSubAgent[] {
  if (executionMode !== "multi_agent") return [];
  const available = new Set(availableAgentIds.map((item) => item.trim()).filter(Boolean));
  const resolveAgent = (preferred: string, fallback = "default") => (available.has(preferred) ? preferred : fallback);
  const plans: GoalCapabilityPlanSubAgent[] = [];

  const pushUnique = (
    agentId: string,
    role: GoalCapabilityPlanSubAgent["role"],
    objective: string,
    reason: string,
    deliverable: string,
  ) => {
    if (plans.some((item) => item.agentId === agentId && item.objective === objective)) return;
    plans.push({ agentId, role, objective, reason, deliverable });
  };

  if (/(实现|编码|开发|重构|修复|code|refactor|implement|build)/i.test(text)) {
    pushUnique(
      resolveAgent("coder"),
      "coder",
      "负责主实现与代码改动",
      "节点文本包含实现/重构信号，适合由编码型子代理并行处理。",
      "代码改动、实现说明与关键影响点",
    );
  }
  if (/(调研|文档|方案|research|docs|api|网页|browser|外部)/i.test(text)) {
    pushUnique(
      resolveAgent("researcher"),
      "researcher",
      "负责补充资料、接口或外部上下文",
      "节点涉及资料检索/文档/外部系统，需要信息侧分工。",
      "资料摘要、接口约束与外部上下文清单",
    );
  }
  if (/(验证|测试|回归|qa|test|review|验收)/i.test(text)) {
    pushUnique(
      resolveAgent("qa"),
      "verifier",
      "负责验证、回归或验收检查",
      "节点文本包含验证/回归信号，适合独立验证子代理。",
      "验证结论、风险清单与验收建议",
    );
  }

  if (plans.length === 0) {
    pushUnique(
      "default",
      "default",
      "拆分并推进该节点的独立子任务",
      "节点被判定为 multi_agent，但未匹配到更具体的专用子代理。",
      "子任务执行摘要与产出清单",
    );
  }

  return plans.slice(0, 3);
}

function buildRolePolicy(
  text: string,
  executionMode: GoalCapabilityExecutionMode,
  riskLevel: GoalCapabilityRiskLevel,
  subAgents: GoalCapabilityPlanSubAgent[],
): GoalCapabilityPlanRolePolicy {
  const selectedRoles: GoalCapabilityPlanRolePolicy["selectedRoles"] = [];
  const pushRole = (role: GoalCapabilityPlanSubAgent["role"]) => {
    if (!role || selectedRoles.includes(role)) return;
    selectedRoles.push(role);
  };

  if (executionMode === "multi_agent" && subAgents.length > 0) {
    for (const item of subAgents) {
      pushRole(item.role ?? "default");
    }
  } else {
    pushRole("default");
  }

  const verifierRole = selectedRoles.includes("verifier") || riskLevel !== "low" ? "verifier" : undefined;
  return {
    selectedRoles,
    selectionReasons: uniqueStrings([
      selectedRoles.includes("coder") ? "节点包含实现/重构信号，纳入 coder 负责主代码改动。" : undefined,
      selectedRoles.includes("researcher") ? "节点包含文档/API/外部上下文信号，纳入 researcher 补资料与约束。" : undefined,
      selectedRoles.includes("verifier") ? "节点包含验证/回归信号，纳入 verifier 做独立验收。" : undefined,
      selectedRoles.length === 1 && selectedRoles[0] === "default"
        ? "当前仅需要默认分工槽位，由主 Agent 或通用子代理承接。"
        : undefined,
      riskLevel === "medium" || riskLevel === "high"
        ? `节点风险为 ${riskLevel}，结果收口默认要求 verifier handoff。`
        : undefined,
      /(合并|收口|汇总|验收|review|qa|test)/i.test(text)
        ? "节点文本包含收口/验收信号，编排结果需要保留 verifier handoff 记录。"
        : undefined,
    ]),
    verifierRole,
    fanInStrategy: verifierRole ? "verifier_handoff" : "main_agent_summary",
  };
}

function applyVerifierHandoff(
  subAgents: GoalCapabilityPlanSubAgent[],
  rolePolicy: GoalCapabilityPlanRolePolicy,
): GoalCapabilityPlanSubAgent[] {
  return subAgents.map((item) => ({
    ...item,
    handoffToVerifier: rolePolicy.verifierRole === "verifier" ? item.role !== "verifier" : undefined,
  }));
}

function buildCoordinationPlan(
  executionMode: GoalCapabilityExecutionMode,
  subAgents: GoalCapabilityPlanSubAgent[],
  rolePolicy: GoalCapabilityPlanRolePolicy,
): GoalCapabilityPlanCoordinationPlan {
  return {
    summary: executionMode === "multi_agent"
      ? `按 ${subAgents.length || 1} 路分工推进，并以 ${rolePolicy.fanInStrategy} 收口。`
      : `由主 Agent 直接推进，并以 ${rolePolicy.fanInStrategy} 收口。`,
    plannedDelegationCount: executionMode === "multi_agent" ? subAgents.length : 0,
    rolePolicy,
  };
}

export function buildGoalCapabilityPlan(input: CapabilityPlannerInput): GoalCapabilityPlanSaveInput {
  const text = compactText([
    input.goalTitle,
    input.goalObjective,
    input.nodeTitle,
    input.nodeDescription,
    input.nodePhase,
    input.nodeOwner,
    ...(input.queryHints ?? []),
  ]);
  const executionMode = pickExecutionMode(text, input.forceMode);
  const risk = inferRisk(text);
  const methods = (input.methods ?? []).slice(0, 3);
  const skills = (input.skills ?? []).slice(0, 4);
  const mcpServers = (input.mcpServers ?? []).slice(0, 3);
  const draftSubAgents = buildSubAgents(text, input.availableAgentIds ?? [], executionMode);
  const rolePolicy = buildRolePolicy(text, executionMode, risk.riskLevel, draftSubAgents);
  const subAgents = applyVerifierHandoff(draftSubAgents, rolePolicy);
  const coordinationPlan = buildCoordinationPlan(executionMode, subAgents, rolePolicy);
  const reasoning = uniqueStrings([
    executionMode === "multi_agent"
      ? "节点包含并行/拆分信号，优先采用 multi_agent 规划。"
      : "节点范围较集中，优先由单主 Agent 推进。",
    methods.length > 0 ? `找到 ${methods.length} 个可复用 method，可先按既有流程执行。` : "未找到明显匹配的 method，需要边执行边沉淀。",
    skills.length > 0 ? `找到 ${skills.length} 个相关 skill，可按需加载具体操作指南。` : "未找到明显匹配的 skill，可在执行后补充沉淀。",
    mcpServers.length > 0 ? `检测到 ${mcpServers.length} 个相关 MCP 能力候选。` : "当前没有明显匹配的 MCP 候选，默认优先本地工具链。",
    subAgents.length > 0 && executionMode === "multi_agent"
      ? `建议拆成 ${subAgents.length} 个子代理分工。`
      : undefined,
  ]);

  const gaps = uniqueStrings([
    methods.length === 0 ? "缺少直接匹配的 method，建议在该节点收尾后补沉淀方法论。" : undefined,
    skills.length === 0 ? "缺少直接匹配的 skill，执行中若形成稳定流程可产出 skill 草案。" : undefined,
    /(网页|browser|api|外部|文档|research|调研)/i.test(text) && mcpServers.length === 0
      ? "节点可能需要外部上下文或远程能力，但当前未匹配到可用 MCP 入口。"
      : undefined,
    executionMode === "multi_agent" && subAgents.every((item) => item.agentId === "default")
      ? "当前缺少更专用的子代理 profile，暂时只能用 default 子代理承接分工。"
      : undefined,
  ]);

  const summary = executionMode === "multi_agent"
    ? `采用 multi_agent 规划，建议 ${subAgents.length || 1} 路并行推进；methods=${methods.length}，skills=${skills.length}，mcp=${mcpServers.length}。`
    : `采用 single_agent 规划，主 Agent 先按现有 methods/skills 推进；methods=${methods.length}，skills=${skills.length}，mcp=${mcpServers.length}。`;

  return {
    runId: input.runId,
    status: "planned",
    executionMode,
    riskLevel: risk.riskLevel,
    objective: compactText([input.nodeTitle, input.nodeDescription]) || input.nodeTitle,
    summary,
    queryHints: uniqueStrings([
      input.nodeTitle,
      input.nodePhase,
      input.goalTitle,
      input.goalObjective,
      ...(input.queryHints ?? []),
    ]).slice(0, 6),
    reasoning,
    methods,
    skills,
    mcpServers,
    subAgents,
    gaps,
    checkpoint: risk.checkpoint,
    actualUsage: {
      methods: [],
      skills: [],
      mcpServers: [],
      toolNames: [],
    },
    orchestration: {
      coordinationPlan,
    },
  };
}
