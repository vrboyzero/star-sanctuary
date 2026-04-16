import type { BridgeSubtaskKind, BridgeSubtaskSemantics, ToolContext } from "../../types.js";

export function inferBridgeSubtaskKind(actionName: string): BridgeSubtaskKind | undefined {
  if (actionName === "analyze" || actionName === "review" || actionName === "patch") {
    return actionName;
  }
  return undefined;
}

export function resolveBridgeSubtaskSemantics(
  context: Pick<ToolContext, "launchSpec">,
  targetId: string,
  actionName: string,
): BridgeSubtaskSemantics | undefined {
  const declared = context.launchSpec?.bridgeSubtask;
  const inferredKind = inferBridgeSubtaskKind(actionName);
  if (!declared && !inferredKind) {
    return undefined;
  }
  return {
    ...(declared ? { ...declared } : {}),
    kind: inferredKind ?? declared!.kind,
    targetId,
    action: actionName,
  };
}
