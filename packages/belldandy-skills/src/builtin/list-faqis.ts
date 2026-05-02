import crypto from "node:crypto";
import type { JsonObject, Tool, ToolCallResult, ToolContext } from "../types.js";
import { withToolContract } from "../tool-contract.js";
import {
  getCurrentFaqiForAgent,
  loadFaqiDefinitions,
  readFaqiState,
  resolveFaqiAgentId,
} from "../faqi.js";

export const LIST_FAQIS_TOOL_NAME = "list_faqis";

export const listFaqisTool: Tool = withToolContract({
  definition: {
    name: LIST_FAQIS_TOOL_NAME,
    description: "列出 FAQI（法器）库中的可用法器，并标记当前 Agent 正在使用的 currentFaqi。",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  async execute(_args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const stateDir = context.stateDir ?? context.workspaceRoot;
    const agentId = resolveFaqiAgentId(context.agentId);

    const [{ definitions, issues }, state] = await Promise.all([
      loadFaqiDefinitions(stateDir),
      readFaqiState(stateDir),
    ]);
    const currentFaqi = getCurrentFaqiForAgent(state, agentId);

    const lines: string[] = [
      `Agent: ${agentId}`,
      `Current FAQI: ${currentFaqi ?? "(none)"}`,
    ];

    if (definitions.length === 0) {
      lines.push("FAQI 库为空。");
    } else {
      lines.push("Available FAQIs:");
      for (const definition of definitions) {
        const markers: string[] = [];
        if (definition.name === currentFaqi) {
          markers.push("current");
        }
        const suffix = markers.length > 0 ? ` [${markers.join(", ")}]` : "";
        const purpose = definition.purpose ? ` - ${definition.purpose}` : "";
        lines.push(`- ${definition.name}${suffix} (${definition.toolNames.length} tools)${purpose}`);
      }
    }

    if (currentFaqi && !definitions.some((definition) => definition.name === currentFaqi)) {
      lines.push(`Warning: currentFaqi "${currentFaqi}" 不存在或解析失败，当前运行时会回退到旧 toolWhitelist。`);
    }

    if (issues.length > 0) {
      lines.push("Ignored invalid FAQI files:");
      for (const issue of issues) {
        lines.push(`- ${issue.name}: ${issue.message}`);
      }
    }

    return {
      id,
      name: LIST_FAQIS_TOOL_NAME,
      success: true,
      output: lines.join("\n"),
      durationMs: Date.now() - start,
      metadata: {
        agentId,
        currentFaqi: currentFaqi ?? null,
        faqis: definitions.map((definition) => ({
          name: definition.name,
          toolCount: definition.toolNames.length,
          purpose: definition.purpose ?? null,
          isCurrent: definition.name === currentFaqi,
        })),
      },
    };
  },
}, {
  family: "service-admin",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["privileged"],
  activityDescription: "List available FAQI modules for the current agent",
  resultSchema: {
    kind: "text",
    description: "FAQI list output.",
  },
  outputPersistencePolicy: "none",
});
