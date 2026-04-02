import { withToolContract } from "../../tool-contract.js";
import { createLeaveRoomTool as createLeaveRoomToolBase } from "./leave-room.js";
import { createJoinRoomTool as createJoinRoomToolBase } from "./join-room.js";

export function createLeaveRoomTool(...args: Parameters<typeof createLeaveRoomToolBase>) {
  return withToolContract(createLeaveRoomToolBase(...args), {
    family: "service-admin",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "medium",
    channels: ["gateway", "web"],
    safeScopes: ["remote-safe"],
    activityDescription: "Leave a community room and persist the disconnected state",
    resultSchema: {
      kind: "text",
      description: "Community leave-room result text.",
    },
    outputPersistencePolicy: "external-state",
  });
}

export function createJoinRoomTool(...args: Parameters<typeof createJoinRoomToolBase>) {
  return withToolContract(createJoinRoomToolBase(...args), {
    family: "service-admin",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "medium",
    channels: ["gateway", "web"],
    safeScopes: ["remote-safe"],
    activityDescription: "Join a community room and persist the connection state",
    resultSchema: {
      kind: "text",
      description: "Community join-room result text.",
    },
    outputPersistencePolicy: "external-state",
  });
}
