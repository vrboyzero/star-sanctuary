import type { AgentCapabilities, GoalCapabilityPlanRecord, JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatCapabilityPlan, formatTaskNode, inferGoalId, ok } from "./shared.js";
import { buildCapabilityPlanSaveInput, collectCapabilityPlanActualUsage } from "./capability-plan-utils.js";

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function buildCheckpointSlaAt(hours: number | undefined): string | undefined {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return undefined;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function buildDelegationInstruction(plan: GoalCapabilityPlanRecord, nodeTitle: string, subAgent: GoalCapabilityPlanRecord["subAgents"][number]): string {
  const lines = [
    `长期任务节点: ${nodeTitle} (${plan.nodeId})`,
    `分工目标: ${subAgent.objective}`,
    `执行摘要: ${plan.summary}`,
  ];
  if (plan.methods.length > 0) {
    lines.push(`参考 Methods: ${plan.methods.map((item) => item.file).join(", ")}`);
  }
  if (plan.skills.length > 0) {
    lines.push(`参考 Skills: ${plan.skills.map((item) => item.name).join(", ")}`);
  }
  if (plan.mcpServers.length > 0) {
    lines.push(`优先检查 MCP: ${plan.mcpServers.map((item) => item.serverId).join(", ")}`);
  }
  if (subAgent.reason) {
    lines.push(`分工原因: ${subAgent.reason}`);
  }
  if (plan.gaps.length > 0) {
    lines.push(`已知能力缺口: ${plan.gaps.join(" | ")}`);
  }
  return lines.join("\n");
}

async function delegatePlanSubAgents(
  agentCapabilities: AgentCapabilities | undefined,
  conversationId: string,
  plan: GoalCapabilityPlanRecord,
  nodeTitle: string,
): Promise<{ delegated: boolean; outputs: string[]; delegationCount: number }> {
  if (!agentCapabilities) {
    return { delegated: false, outputs: ["未提供 agentCapabilities，跳过子代理委托。"], delegationCount: 0 };
  }
  if (plan.subAgents.length === 0) {
    return { delegated: false, outputs: ["plan 中未定义子代理分工。"], delegationCount: 0 };
  }

  if (agentCapabilities.spawnParallel) {
    const results = await agentCapabilities.spawnParallel(
      plan.subAgents.map((item) => ({
        agentId: item.agentId === "default" ? undefined : item.agentId,
        instruction: buildDelegationInstruction(plan, nodeTitle, item),
        context: {
          goalId: plan.goalId,
          nodeId: plan.nodeId,
          planId: plan.id,
          objective: item.objective,
        },
        parentConversationId: conversationId,
      })),
    );
    return {
      delegated: true,
      delegationCount: results.length,
      outputs: results.map((result, index) => {
        const subAgent = plan.subAgents[index];
        return result.success
          ? `- ${subAgent.agentId}: success`
          : `- ${subAgent.agentId}: failed (${result.error ?? "unknown error"})`;
      }),
    };
  }

  if (agentCapabilities.spawnSubAgent) {
    const outputs: string[] = [];
    let delegationCount = 0;
    for (const item of plan.subAgents) {
      const result = await agentCapabilities.spawnSubAgent({
        agentId: item.agentId === "default" ? undefined : item.agentId,
        instruction: buildDelegationInstruction(plan, nodeTitle, item),
        context: {
          goalId: plan.goalId,
          nodeId: plan.nodeId,
          planId: plan.id,
          objective: item.objective,
        },
        parentConversationId: conversationId,
      });
      delegationCount += 1;
      outputs.push(result.success ? `- ${item.agentId}: success` : `- ${item.agentId}: failed (${result.error ?? "unknown error"})`);
    }
    return { delegated: true, outputs, delegationCount };
  }

  return { delegated: false, outputs: ["当前运行时不支持子代理编排。"], delegationCount: 0 };
}

async function ensureRiskCheckpoint(
  goalId: string,
  nodeId: string,
  nodeTitle: string,
  plan: GoalCapabilityPlanRecord,
  runId: string | undefined,
  context: ToolContext,
): Promise<{ requested: boolean; notes: string[]; latestNodeStatus?: string }> {
  if (!plan.checkpoint.required) {
    return { requested: false, notes: ["当前 plan 未要求自动 checkpoint。"] };
  }
  if (!context.goalCapabilities?.listCheckpoints || !context.goalCapabilities?.requestCheckpoint || !context.goalCapabilities?.updateTaskNode) {
    return {
      requested: false,
      notes: ["plan 判断该节点为高风险，但当前运行时缺少 checkpoint/update 能力，无法自动创建断点。"],
    };
  }

  const checkpoints = await context.goalCapabilities.listCheckpoints(goalId);
  const existing = checkpoints.items.find((item) => item.nodeId === nodeId && (item.status === "required" || item.status === "waiting_user"));
  if (existing) {
    return {
      requested: true,
      latestNodeStatus: existing.status,
      notes: [`已存在待处理 checkpoint: ${existing.id}`],
    };
  }

  await context.goalCapabilities.updateTaskNode(goalId, nodeId, {
    checkpointRequired: true,
    checkpointStatus: "required",
  });
  const requested = await context.goalCapabilities.requestCheckpoint(goalId, nodeId, {
    title: plan.checkpoint.suggestedTitle || `${nodeTitle} checkpoint`,
    summary: `Auto checkpoint before executing ${plan.riskLevel}-risk node`,
    note: plan.checkpoint.suggestedNote || plan.checkpoint.reasons.join(" "),
    reviewer: plan.checkpoint.suggestedReviewer,
    reviewerRole: plan.checkpoint.suggestedReviewerRole,
    requestedBy: context.agentId || "main-agent",
    slaAt: buildCheckpointSlaAt(plan.checkpoint.suggestedSlaHours),
    runId,
  });
  return {
    requested: true,
    latestNodeStatus: requested.node.status,
    notes: [`已自动发起高风险 checkpoint: ${requested.checkpoint.id}`],
  };
}

export const goalOrchestrateTool: Tool = {
  definition: {
    name: "goal_orchestrate",
    description: "在长期任务节点执行前生成 capabilityPlan，并将计划落到 claim / 最小子代理编排。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        objective: { type: "string", description: "可选，覆盖/补充该节点 objective。" },
        query_hints: { type: "array", description: "可选，额外检索 hints。", items: { type: "string" } },
        force_mode: {
          type: "string",
          description: "可选，强制规划模式。",
          enum: ["single_agent", "multi_agent"],
        },
        owner: { type: "string", description: "可选，claim 节点时写入的 owner。" },
        auto_delegate: { type: "boolean", description: "可选，若 plan 判断为 multi_agent，则自动触发最小子代理委托。" },
        force_regenerate: { type: "boolean", description: "可选，忽略已有 plan，重新生成。" },
        run_id: { type: "string", description: "可选，绑定 runId。" },
      },
      required: ["node_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_orchestrate";
    if (!context.goalCapabilities?.readTaskGraph || !context.goalCapabilities?.claimTaskNode) {
      return fail(name, "Goal orchestration capabilities are not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      let plan = args.force_regenerate === true || !context.goalCapabilities?.getCapabilityPlan
        ? null
        : await context.goalCapabilities.getCapabilityPlan(goalId, nodeId);

      if (!plan) {
        if (!context.goalCapabilities?.generateCapabilityPlan) {
          return fail(name, "缺少 capabilityPlan 生成能力，且当前没有现成 plan。");
        }
        const generated = await context.goalCapabilities.generateCapabilityPlan(goalId, nodeId, {
          objective: String(args.objective ?? "").trim() || undefined,
          queryHints: parseStringArray(args.query_hints),
          forceMode: args.force_mode === "multi_agent" ? "multi_agent" : args.force_mode === "single_agent" ? "single_agent" : undefined,
          runId: String(args.run_id ?? "").trim() || undefined,
        });
        plan = generated.plan;
      }

      const graph = await context.goalCapabilities.readTaskGraph(goalId);
      const node = graph.nodes.find((item) => item.id === nodeId);
      if (!node) {
        return fail(name, `节点不存在: ${nodeId}`);
      }

      let claimed = false;
      let latestNode = node;
      const owner = String(args.owner ?? "").trim() || context.agentId || "main-agent";
      const runId = String(args.run_id ?? "").trim() || plan.runId || node.lastRunId;
      if (node.status === "ready") {
        const claimedResult = await context.goalCapabilities.claimTaskNode(goalId, nodeId, {
          owner,
          summary: `Capability plan ready. ${plan.summary}`,
          runId: runId || undefined,
        });
        claimed = true;
        latestNode = claimedResult.node;
      } else if (!["in_progress", "pending_review", "validating"].includes(node.status)) {
        return fail(name, `当前节点状态不适合 orchestration: ${node.status}`);
      }

      const checkpointOutcome = await ensureRiskCheckpoint(goalId, nodeId, latestNode.title, plan, runId || undefined, context);
      if (checkpointOutcome.latestNodeStatus) {
        latestNode = {
          ...latestNode,
          status: checkpointOutcome.latestNodeStatus as typeof latestNode.status,
        };
      }

      const autoDelegate = args.auto_delegate === true;
      const delegation = autoDelegate && plan.executionMode === "multi_agent" && !checkpointOutcome.requested
        ? await delegatePlanSubAgents(context.agentCapabilities, context.conversationId, plan, latestNode.title)
        : {
          delegated: false,
          outputs: checkpointOutcome.requested
            ? ["已进入 checkpoint 审批阶段，暂不触发子代理委托。"]
            : [autoDelegate ? "当前 plan 未进入 multi_agent 或无子代理分工，跳过委托。" : "未启用 auto_delegate，跳过子代理委托。"],
          delegationCount: 0,
        };

      const actualUsage = collectCapabilityPlanActualUsage(context);

      if (context.goalCapabilities.saveCapabilityPlan) {
        plan = await context.goalCapabilities.saveCapabilityPlan(goalId, nodeId, {
          ...buildCapabilityPlanSaveInput(plan, {
            runId: runId || plan.runId,
            status: "orchestrated",
            actualUsage,
          }),
          orchestratedAt: new Date().toISOString(),
          orchestration: {
            claimed,
            delegated: delegation.delegated,
            delegationCount: delegation.delegationCount,
            notes: [...checkpointOutcome.notes, ...delegation.outputs],
          },
        });
      }

      const lines = [
        claimed ? "节点已 claim 并进入执行态。" : `节点保持当前状态: ${latestNode.status}`,
        ...checkpointOutcome.notes,
        ...delegation.outputs,
        "",
        formatCapabilityPlan(plan),
        "",
        formatTaskNode(latestNode),
      ];
      return ok(name, lines.join("\n"));
    } catch (err) {
      return fail(name, `goal orchestration 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
