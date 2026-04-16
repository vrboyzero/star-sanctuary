import crypto from "node:crypto";
import type { Tool, ToolCallResult, ToolContext } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import { resolveBridgeSubtaskSemantics } from "./governance.js";
import { getBridgeTarget } from "./registry.js";
import { executeBridgeRun } from "./runtime-exec.js";

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

async function applyMcpFallbackGuidance(
  result: ToolCallResult,
  targetId: string,
  action: string,
  context: Pick<ToolContext, "workspaceRoot" | "launchSpec">,
): Promise<ToolCallResult> {
  const fallbackTargetId = `${targetId}_cli`;
  const fallbackTarget = await getBridgeTarget(context, fallbackTargetId);
  const bridgeSubtask = resolveBridgeSubtaskSemantics(context, targetId, action);
  const recommendation = fallbackTarget
    ? {
        nextStep: `当前 MCP 路径不可用，建议回退到 bridge target "${fallbackTargetId}"。`,
        fallbackTargetId,
      }
    : {
        nextStep: `当前 MCP 路径不可用，建议先运行 bridge_target_diagnose 检查 target "${targetId}" 的 server 与 tool 接线。`,
      };

  const errorSummary = result.error ?? "Bridge run failed.";

  return {
    ...result,
    output: JSON.stringify({
      targetId,
      action,
      ...(bridgeSubtask ? { bridgeSubtask } : {}),
      transport: "mcp",
      error: errorSummary,
      recommendation,
    }, null, 2),
    error: fallbackTarget
      ? `${errorSummary}\n建议回退 bridge target "${fallbackTargetId}"。`
      : `${errorSummary}\n建议先运行 bridge_target_diagnose 检查 MCP 路径。`,
  };
}

export const bridgeRunTool: Tool = withToolContract({
  definition: {
    name: "bridge_run",
    description: "按受控 target/action 配置调用外部 CLI 或 IDE 的一次性 exec 动作。适合长期任务在受控边界内触发 CLI / IDE 工作。",
    parameters: {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "Bridge target ID，例如 codex、cursor。",
        },
        action: {
          type: "string",
          description: "目标 action 名称，例如 exec、openProject、openFile。",
        },
        cwd: {
          type: "string",
          description: "可选工作目录。必须位于当前允许工作区内。",
        },
        args: {
          type: "object",
          description: "结构化参数对象，只允许传入 target.action 配置声明过的参数键。",
        },
        timeoutMs: {
          type: "number",
          description: "可选超时时间。若超过策略上限会被自动收紧。",
        },
      },
      required: ["targetId", "action"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const targetId = normalizeOptionalString(args.targetId);
    const action = normalizeOptionalString(args.action);

    if (!targetId) {
      return {
        id,
        name: "bridge_run",
        success: false,
        output: "",
        error: "bridge_run.targetId 是必填项。",
        durationMs: Date.now() - start,
      };
    }
    if (!action) {
      return {
        id,
        name: "bridge_run",
        success: false,
        output: "",
        error: "bridge_run.action 是必填项。",
        durationMs: Date.now() - start,
      };
    }

    try {
      const target = await getBridgeTarget(context, targetId);
      if (!target) {
        return {
          id,
          name: "bridge_run",
          success: false,
          output: "",
          error: `Bridge target 不存在: ${targetId}`,
          durationMs: Date.now() - start,
        };
      }
      const result = await executeBridgeRun(
        target,
        action,
        args.args,
        args.cwd,
        args.timeoutMs,
        context,
      );
      if (!result.success && target.transport === "mcp") {
        return applyMcpFallbackGuidance(result, target.id, action, context);
      }
      return result;
    } catch (error) {
      return {
        id,
        name: "bridge_run",
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  },
}, {
  family: "command-exec",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: true,
  riskLevel: "high",
  channels: ["gateway", "web"],
  safeScopes: ["privileged"],
  activityDescription: "Run a configured bridge target action through the controlled exec runtime",
  resultSchema: {
    kind: "text",
    description: "JSON payload containing the bridge run command preview, cwd, exit code, stdout, stderr, duration, and artifact path.",
  },
  outputPersistencePolicy: "artifact",
});
