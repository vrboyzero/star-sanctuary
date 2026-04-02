import type { Tool } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import {
  officeWorkshopSearchTool as baseOfficeWorkshopSearchTool,
  officeWorkshopGetItemTool as baseOfficeWorkshopGetItemTool,
  officeWorkshopDownloadTool as baseOfficeWorkshopDownloadTool,
  officeWorkshopPublishTool as baseOfficeWorkshopPublishTool,
  officeWorkshopMineTool as baseOfficeWorkshopMineTool,
  officeWorkshopUpdateTool as baseOfficeWorkshopUpdateTool,
  officeWorkshopDeleteTool as baseOfficeWorkshopDeleteTool,
} from "./workshop.js";
import {
  officeHomesteadGetTool as baseOfficeHomesteadGetTool,
  officeHomesteadInventoryTool as baseOfficeHomesteadInventoryTool,
  officeHomesteadClaimTool as baseOfficeHomesteadClaimTool,
  officeHomesteadPlaceTool as baseOfficeHomesteadPlaceTool,
  officeHomesteadRecallTool as baseOfficeHomesteadRecallTool,
  officeHomesteadMountTool as baseOfficeHomesteadMountTool,
  officeHomesteadUnmountTool as baseOfficeHomesteadUnmountTool,
  officeHomesteadOpenBlindBoxTool as baseOfficeHomesteadOpenBlindBoxTool,
} from "./homestead.js";

function withOfficeReadContract(tool: Tool, activityDescription: string): Tool {
  return withToolContract(tool, {
    family: "network-read",
    isReadOnly: true,
    isConcurrencySafe: true,
    needsPermission: false,
    riskLevel: "low",
    channels: ["gateway", "web"],
    safeScopes: ["remote-safe"],
    activityDescription,
    resultSchema: {
      kind: "text",
      description: "Office service read result text.",
    },
    outputPersistencePolicy: "conversation",
  });
}

function withOfficeWriteContract(
  tool: Tool,
  activityDescription: string,
  options: {
    outputPersistencePolicy?: "artifact" | "external-state";
    riskLevel?: "medium" | "high";
  } = {},
): Tool {
  return withToolContract(tool, {
    family: "service-admin",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: options.riskLevel ?? "medium",
    channels: ["gateway", "web"],
    safeScopes: ["remote-safe", "privileged"],
    activityDescription,
    resultSchema: {
      kind: "text",
      description: "Office service write result text.",
    },
    outputPersistencePolicy: options.outputPersistencePolicy ?? "external-state",
  });
}

export const officeWorkshopSearchTool = withOfficeReadContract(
  baseOfficeWorkshopSearchTool,
  "Search office workshop items",
);
export const officeWorkshopGetItemTool = withOfficeReadContract(
  baseOfficeWorkshopGetItemTool,
  "Read office workshop item details",
);
export const officeWorkshopDownloadTool = withOfficeWriteContract(
  baseOfficeWorkshopDownloadTool,
  "Download an office workshop item to the local workspace",
  { outputPersistencePolicy: "artifact" },
);
export const officeWorkshopPublishTool = withOfficeWriteContract(
  baseOfficeWorkshopPublishTool,
  "Publish a package to the office workshop",
  { riskLevel: "high" },
);
export const officeWorkshopMineTool = withOfficeReadContract(
  baseOfficeWorkshopMineTool,
  "List workshop items owned by the current agent",
);
export const officeWorkshopUpdateTool = withOfficeWriteContract(
  baseOfficeWorkshopUpdateTool,
  "Update an existing office workshop item",
  { riskLevel: "high" },
);
export const officeWorkshopDeleteTool = withOfficeWriteContract(
  baseOfficeWorkshopDeleteTool,
  "Delete an office workshop item",
  { riskLevel: "high" },
);

export const officeHomesteadGetTool = withOfficeReadContract(
  baseOfficeHomesteadGetTool,
  "Read homestead profile and placement state",
);
export const officeHomesteadInventoryTool = withOfficeReadContract(
  baseOfficeHomesteadInventoryTool,
  "Read homestead inventory items",
);
export const officeHomesteadClaimTool = withOfficeWriteContract(
  baseOfficeHomesteadClaimTool,
  "Claim a homestead reward or item",
);
export const officeHomesteadPlaceTool = withOfficeWriteContract(
  baseOfficeHomesteadPlaceTool,
  "Place an item into the homestead scene",
);
export const officeHomesteadRecallTool = withOfficeWriteContract(
  baseOfficeHomesteadRecallTool,
  "Recall an item from the homestead scene",
);
export const officeHomesteadMountTool = withOfficeWriteContract(
  baseOfficeHomesteadMountTool,
  "Mount an item in the homestead",
);
export const officeHomesteadUnmountTool = withOfficeWriteContract(
  baseOfficeHomesteadUnmountTool,
  "Unmount an item in the homestead",
);
export const officeHomesteadOpenBlindBoxTool = withOfficeWriteContract(
  baseOfficeHomesteadOpenBlindBoxTool,
  "Open a homestead blind box reward",
);
