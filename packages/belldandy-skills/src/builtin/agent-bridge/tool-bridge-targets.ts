import crypto from "node:crypto";
import type { Tool, ToolCallResult } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import { listBridgeTargets } from "./registry.js";

export const bridgeTargetListTool: Tool = withToolContract({
  definition: {
    name: "bridge_target_list",
    description: "列出当前 Bridge 可用的外部 CLI / IDE target、transport、sessionMode 与 action 元数据。",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  async execute(_args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    try {
      const targets = await listBridgeTargets(context);
      return {
        id,
        name: "bridge_target_list",
        success: true,
        output: JSON.stringify({ targets }, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        id,
        name: "bridge_target_list",
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
  activityDescription: "List configured bridge targets and their exposed actions",
  resultSchema: {
    kind: "text",
    description: "JSON payload describing bridge targets, transports, session modes, and actions.",
  },
  outputPersistencePolicy: "conversation",
});

