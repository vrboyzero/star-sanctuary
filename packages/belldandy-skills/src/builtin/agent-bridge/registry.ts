import type { ToolContext } from "../../types.js";
import { loadBridgeConfig } from "./config.js";
import type { BridgeTargetConfig, BridgeTargetListItem } from "./types.js";

export async function listBridgeTargets(
  context: Pick<ToolContext, "workspaceRoot">,
): Promise<BridgeTargetListItem[]> {
  const config = await loadBridgeConfig(context);
  return config.targets.map((target) => ({
    id: target.id,
    category: target.category,
    transport: target.transport,
    enabled: target.enabled,
    sessionMode: target.sessionMode,
    cwdPolicy: target.cwdPolicy,
    defaultTimeoutMs: target.defaultTimeoutMs,
    maxOutputBytes: target.maxOutputBytes,
    ...(target.idleTimeoutMs ? { idleTimeoutMs: target.idleTimeoutMs } : {}),
    actions: Object.entries(target.actions).map(([name, action]) => ({
      name,
      description: action.description,
      allowStructuredArgs: action.allowStructuredArgs ?? [],
      ...(action.mcpToolName ? { mcpToolName: action.mcpToolName } : {}),
      ...(action.firstTurnStrategy ? { firstTurnStrategy: action.firstTurnStrategy } : {}),
      ...(action.firstTurnHint ? { firstTurnHint: action.firstTurnHint } : {}),
      ...(action.recommendedReadWaitMs ? { recommendedReadWaitMs: action.recommendedReadWaitMs } : {}),
    })),
  }));
}

export async function getBridgeTarget(
  context: Pick<ToolContext, "workspaceRoot">,
  targetId: string,
): Promise<BridgeTargetConfig | undefined> {
  const config = await loadBridgeConfig(context);
  return config.targets.find((target) => target.id === targetId);
}
