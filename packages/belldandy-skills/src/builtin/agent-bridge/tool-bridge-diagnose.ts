import crypto from "node:crypto";
import type { Tool, ToolCallResult } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import { loadBridgeConfig, resolveBridgeConfigPath } from "./config.js";

type BridgeDiagnoseCheck = {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

function buildFallbackTargetId(targetId: string, allTargetIds: string[]): string | undefined {
  const candidate = `${targetId}_cli`;
  return allTargetIds.includes(candidate) ? candidate : undefined;
}

function normalizeStatus(checks: BridgeDiagnoseCheck[]): "ready" | "degraded" | "unavailable" {
  if (checks.some((item) => item.status === "fail")) {
    return "unavailable";
  }
  if (checks.some((item) => item.status === "warn")) {
    return "degraded";
  }
  return "ready";
}

function normalizeAvailability(status: "ready" | "degraded" | "unavailable"): boolean {
  return status !== "unavailable";
}

export const bridgeTargetDiagnoseTool: Tool = withToolContract({
  definition: {
    name: "bridge_target_diagnose",
    description: "诊断某个 Bridge target 当前为什么可用或不可用，尤其适合排查 mcp transport 的 server/tool 接线问题。",
    parameters: {
      type: "object",
      properties: {
        targetId: {
          type: "string",
          description: "要诊断的 bridge target ID，例如 codex_exec。",
        },
        action: {
          type: "string",
          description: "可选 action 名称；不传时默认取该 target 的第一个 action。",
        },
      },
      required: ["targetId"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();

    try {
      const targetId = typeof args.targetId === "string" ? args.targetId.trim() : "";
      const requestedAction = typeof args.action === "string" ? args.action.trim() : "";
      if (!targetId) {
        throw new Error("targetId 不能为空。");
      }

      const config = await loadBridgeConfig(context);
      const configPath = resolveBridgeConfigPath(context);
      const checks: BridgeDiagnoseCheck[] = [];
      const allTargetIds = config.targets.map((item) => item.id);
      const target = config.targets.find((item) => item.id === targetId);
      const fallbackTargetId = buildFallbackTargetId(targetId, allTargetIds);

      if (!target) {
        checks.push({
          id: "target",
          status: "fail",
          message: `未在 ${configPath} 中找到 target "${targetId}"。`,
        });

        return {
          id,
          name: "bridge_target_diagnose",
          success: true,
          output: JSON.stringify({
            targetId,
            configPath,
            available: false,
            status: "unavailable",
            checks,
            recommendation: {
              nextStep: `检查 ${configPath} 是否已声明 target "${targetId}"。`,
              ...(fallbackTargetId ? { fallbackTargetId } : {}),
            },
          }, null, 2),
          durationMs: Date.now() - start,
        };
      }

      checks.push({
        id: "target",
        status: "pass",
        message: `已找到 target "${target.id}"，transport=${target.transport}，sessionMode=${target.sessionMode}。`,
      });

      checks.push({
        id: "enabled",
        status: target.enabled ? "pass" : "fail",
        message: target.enabled
          ? `target "${target.id}" 当前已启用。`
          : `target "${target.id}" 当前已禁用。`,
      });

      const actionName = requestedAction || Object.keys(target.actions)[0] || "";
      const action = actionName ? target.actions[actionName] : undefined;
      checks.push({
        id: "action",
        status: action ? "pass" : "fail",
        message: action
          ? `action "${actionName}" 可用。`
          : `target "${target.id}" 不存在 action "${actionName || "<missing>"}"。`,
      });

      let nextStep = target.transport === "mcp"
        ? "优先确认 MCP runtime、server 状态和 tool 映射。"
        : `优先确认 ${target.transport} transport 的运行时命令与工作目录配置。`;

      if (target.transport === "mcp") {
        const serverId = target.entry.mcp?.serverId;
        const toolName = action?.mcpToolName ?? target.entry.mcp?.toolName;

        checks.push({
          id: "mcp-entry",
          status: serverId && toolName ? "pass" : "fail",
          message: serverId && toolName
            ? `target 已声明 mcp entry：${serverId}/${toolName}。`
            : `target "${target.id}" 缺少 entry.mcp.serverId 或 entry.mcp.toolName。`,
        });

        if (!context.mcp) {
          checks.push({
            id: "mcp-runtime",
            status: "fail",
            message: "当前运行时未注入 MCP 能力；请先确认 Gateway 已启用 MCP 并把能力注入 bridge。",
          });
          nextStep = "确认 `BELLDANDY_MCP_ENABLED=true`，并检查 Gateway 是否已初始化 MCP runtime。";
        } else {
          checks.push({
            id: "mcp-runtime",
            status: "pass",
            message: "当前 bridge 运行时已注入 MCP 能力。",
          });

          const diagnostics = context.mcp.getDiagnostics?.() ?? null;
          if (!diagnostics) {
            checks.push({
              id: "mcp-diagnostics",
              status: "warn",
              message: "当前运行时未提供 MCP 诊断快照，无法直接确认 server/tool 是否在线。",
            });
          } else {
            checks.push({
              id: "mcp-diagnostics",
              status: "pass",
              message: `MCP runtime 已初始化，当前 ${diagnostics.connectedCount}/${diagnostics.serverCount} 个 server 已连接。`,
            });

            const server = serverId
              ? diagnostics.servers.find((item) => item.id === serverId)
              : undefined;
            if (!server) {
              checks.push({
                id: "mcp-server",
                status: "fail",
                message: serverId
                  ? `未在 MCP runtime 中发现 server "${serverId}"。`
                  : "当前 target 未声明 serverId，无法检查 server 状态。",
              });
              nextStep = serverId
                ? `检查 mcp.json 中是否已注册并启用 server "${serverId}"。`
                : "先补齐 target 的 entry.mcp.serverId。";
            } else {
              const serverStatus = server.status === "connected"
                ? "pass"
                : server.status === "connecting" || server.status === "reconnecting"
                  ? "warn"
                  : "fail";
              checks.push({
                id: "mcp-server",
                status: serverStatus,
                message: server.status === "connected"
                  ? `server "${server.id}" 已连接，可用工具数 ${server.toolCount}。`
                  : `server "${server.id}" 当前状态为 ${server.status}${server.error ? `: ${server.error}` : ""}。`,
              });
              if (serverStatus !== "pass") {
                nextStep = `先修复 server "${server.id}" 的连接问题，再重试 bridge target "${target.id}"。`;
              }
            }

            const toolExists = serverId && toolName
              ? diagnostics.tools.some((item) => item.serverId === serverId && item.toolName === toolName)
              : false;
            checks.push({
              id: "mcp-tool",
              status: toolExists ? "pass" : "fail",
              message: toolExists
                ? `已在 MCP runtime 中发现 tool "${serverId}/${toolName}"。`
                : `未在 MCP runtime 中发现 tool "${serverId ?? "unknown"}/${toolName ?? "unknown"}"。`,
            });
            if (!toolExists && serverId && toolName) {
              nextStep = `检查 MCP wrapper 是否暴露了 tool "${toolName}"，以及 bridge target "${target.id}" 的 action "${actionName}" 是否声明了正确的 mcpToolName。`;
            }
          }
        }
      }

      const status = normalizeStatus(checks);
      const recommendation = status === "ready"
        ? {
            nextStep: `target "${target.id}" 当前可直接使用。`,
            ...(fallbackTargetId ? { fallbackTargetId } : {}),
          }
        : {
            nextStep,
            ...(fallbackTargetId ? { fallbackTargetId } : {}),
          };

      return {
        id,
        name: "bridge_target_diagnose",
        success: true,
        output: JSON.stringify({
          targetId: target.id,
          action: actionName || undefined,
          transport: target.transport,
          sessionMode: target.sessionMode,
          configPath,
          available: normalizeAvailability(status),
          status,
          checks,
          recommendation,
        }, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        id,
        name: "bridge_target_diagnose",
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  },
}, {
  family: "command-exec",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["local-safe", "web-safe"],
  activityDescription: "Diagnose why a bridge target is available or unavailable",
  resultSchema: {
    kind: "text",
    description: "JSON payload describing bridge target health, MCP server/tool checks, and fallback guidance.",
  },
  outputPersistencePolicy: "conversation",
});
