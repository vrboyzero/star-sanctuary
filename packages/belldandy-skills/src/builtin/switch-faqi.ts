import crypto from "node:crypto";
import type { JsonObject, Tool, ToolCallResult, ToolContext } from "../types.js";
import { withToolContract } from "../tool-contract.js";
import {
  loadFaqiDefinitionByName,
  loadFaqiDefinitions,
  readFaqiState,
  resolveFaqiAgentId,
  setCurrentFaqiForAgent,
  writeFaqiState,
} from "../faqi.js";

export const SWITCH_FAQI_TOOL_NAME = "switch_faqi";

export const switchFaqiTool: Tool = withToolContract({
  definition: {
    name: SWITCH_FAQI_TOOL_NAME,
    description:
      "切换当前 Agent 自己的 currentFaqi。FAQI 文件统一位于 ~/.star_sanctuary/faqis/，切换后需要重启 Gateway 才会完全生效。",
    parameters: {
      type: "object",
      properties: {
        faqi_name: {
          type: "string",
          description: "目标 FAQI 文件名（不含 .md 后缀），例如 \"safe-dev\"",
        },
      },
      required: ["faqi_name"],
    },
  },

  async execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const agentId = resolveFaqiAgentId(context.agentId);
    const stateDir = context.stateDir ?? context.workspaceRoot;

    const makeError = (message: string): ToolCallResult => ({
      id,
      name: SWITCH_FAQI_TOOL_NAME,
      success: false,
      output: "",
      error: message,
      durationMs: Date.now() - start,
    });

    const faqiName = args.faqi_name;
    if (typeof faqiName !== "string" || !faqiName.trim()) {
      return makeError("参数 faqi_name 不能为空");
    }

    let definition;
    try {
      definition = await loadFaqiDefinitionByName(stateDir, faqiName.trim());
    } catch (err) {
      return makeError(err instanceof Error ? err.message : String(err));
    }

    if (!definition) {
      const { definitions } = await loadFaqiDefinitions(stateDir);
      const hint = definitions.length > 0
        ? `可用 FAQI: ${definitions.map((item) => item.name).join(", ")}`
        : "FAQI 库为空";
      return makeError(`FAQI 不存在: ${faqiName.trim()}。${hint}`);
    }

    const currentState = await readFaqiState(stateDir);
    const nextState = setCurrentFaqiForAgent(currentState, agentId, definition.name);
    await writeFaqiState(stateDir, nextState);

    context.logger?.info(`FAQI switched to "${definition.name}" (agent=${agentId})`);

    return {
      id,
      name: SWITCH_FAQI_TOOL_NAME,
      success: true,
      output: `Agent「${agentId}」的 currentFaqi 已切换为「${definition.name}」。该 FAQI 含 ${definition.toolNames.length} 个工具。请接下来调用 service_restart 或重启 Gateway，使新的工具边界完全生效。`,
      durationMs: Date.now() - start,
      metadata: {
        agentId,
        currentFaqi: definition.name,
        toolCount: definition.toolNames.length,
      },
    };
  },
}, {
  family: "service-admin",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: true,
  riskLevel: "high",
  channels: ["gateway", "web"],
  safeScopes: ["privileged"],
  activityDescription: "Switch the current agent FAQI module",
  resultSchema: {
    kind: "text",
    description: "FAQI switch result.",
  },
  outputPersistencePolicy: "external-state",
});
