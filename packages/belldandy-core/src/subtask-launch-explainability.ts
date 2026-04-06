import type { AgentRegistry } from "@belldandy/agent";

import { buildAgentLaunchExplainability } from "./agent-launch-explainability.js";
import type { SubTaskRecord } from "./task-runtime.js";

export function buildSubTaskLaunchExplainability(
  item: Pick<SubTaskRecord, "agentId" | "launchSpec">,
  agentRegistry?: Pick<AgentRegistry, "getProfile">,
) {
  const delegation = item.launchSpec?.delegation;
  return buildAgentLaunchExplainability({
    agentRegistry,
    agentId: item.agentId,
    profileId: item.launchSpec?.profileId,
    launchSpec: item.launchSpec,
    delegationReason: delegation,
    catalogDefaultOverride: delegation?.launchDefaults,
  });
}
