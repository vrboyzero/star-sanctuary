import type { Tool } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import { methodListTool as baseMethodListTool } from "./list.js";
import { methodReadTool as baseMethodReadTool } from "./read.js";
import { methodCreateTool as baseMethodCreateTool } from "./create.js";
import { methodSearchTool as baseMethodSearchTool } from "./search.js";

function withMethodReadContract(tool: Tool, activityDescription: string): Tool {
  return withToolContract(tool, {
    family: "workspace-read",
    isReadOnly: true,
    isConcurrencySafe: true,
    needsPermission: false,
    riskLevel: "low",
    channels: ["gateway", "web"],
    safeScopes: ["local-safe", "web-safe"],
    activityDescription,
    resultSchema: {
      kind: "text",
      description: "Methodology document read result text.",
    },
    outputPersistencePolicy: "conversation",
  });
}

function withMethodWriteContract(tool: Tool, activityDescription: string): Tool {
  return withToolContract(tool, {
    family: "workspace-write",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "medium",
    channels: ["gateway", "web"],
    safeScopes: ["privileged"],
    activityDescription,
    resultSchema: {
      kind: "text",
      description: "Methodology document write result text.",
    },
    outputPersistencePolicy: "artifact",
  });
}

export const methodListTool = withMethodReadContract(
  baseMethodListTool,
  "List available methodology documents",
);
export const methodReadTool = withMethodReadContract(
  baseMethodReadTool,
  "Read a methodology document",
);
export const methodCreateTool = withMethodWriteContract(
  baseMethodCreateTool,
  "Create or update a methodology document",
);
export const methodSearchTool = withMethodReadContract(
  baseMethodSearchTool,
  "Search methodology documents by keyword",
);
