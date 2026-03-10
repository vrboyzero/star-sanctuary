import { describe, expect, it, vi } from "vitest";
import { createLeaveRoomTool } from "./leave-room.js";

describe("createLeaveRoomTool", () => {
  it("leaves the active joined room outside community context when only one room is connected", async () => {
    const channel = {
      leaveRoom: vi.fn(async () => {}),
      sendProactiveMessage: vi.fn(async () => true),
      getJoinedRooms: vi.fn(() => [{ agentName: "贝露丹蒂", roomId: "room-remote-1", roomName: "dev-room" }]),
    };
    const tool = createLeaveRoomTool(channel);

    const result = await tool.execute({}, {
      conversationId: "conv-1",
      workspaceRoot: "/tmp/workspace",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 1000,
        maxResponseBytes: 1024,
      },
      roomContext: { environment: "local" },
    });

    expect(result.success).toBe(true);
    expect(channel.leaveRoom).toHaveBeenCalledWith("room-remote-1");
    expect(JSON.parse(result.output)).toMatchObject({
      success: true,
      roomId: "room-remote-1",
      agentName: "贝露丹蒂",
      resolvedViaChannel: true,
    });
  });

  it("requires agent_name when multiple joined rooms are active outside community context", async () => {
    const channel = {
      leaveRoom: vi.fn(async () => {}),
      sendProactiveMessage: vi.fn(async () => true),
      getJoinedRooms: vi.fn(() => [
        { agentName: "贝露丹蒂", roomId: "room-1", roomName: "alpha" },
        { agentName: "芙蕾雅", roomId: "room-2", roomName: "beta" },
      ]),
    };
    const tool = createLeaveRoomTool(channel);

    const result = await tool.execute({}, {
      conversationId: "conv-2",
      workspaceRoot: "/tmp/workspace",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 1000,
        maxResponseBytes: 1024,
      },
      roomContext: { environment: "local" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Multiple community rooms active");
    expect(channel.leaveRoom).not.toHaveBeenCalled();
    expect(JSON.parse(result.output)).toMatchObject({
      success: false,
      available_agents: ["贝露丹蒂", "芙蕾雅"],
    });
  });

  it("still prefers roomContext when invoked from a community room", async () => {
    const channel = {
      leaveRoom: vi.fn(async () => {}),
      sendProactiveMessage: vi.fn(async () => true),
      getJoinedRooms: vi.fn(() => [{ agentName: "贝露丹蒂", roomId: "room-other" }]),
    };
    const tool = createLeaveRoomTool(channel);

    const result = await tool.execute({ farewell_message: "先走了" }, {
      conversationId: "conv-3",
      workspaceRoot: "/tmp/workspace",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 1000,
        maxResponseBytes: 1024,
      },
      roomContext: { environment: "community", roomId: "room-context-1" },
    });

    expect(result.success).toBe(true);
    expect(channel.sendProactiveMessage).toHaveBeenCalledWith("先走了", "room-context-1");
    expect(channel.leaveRoom).toHaveBeenCalledWith("room-context-1");
    expect(JSON.parse(result.output)).toMatchObject({
      success: true,
      roomId: "room-context-1",
      resolvedViaChannel: false,
    });
  });
});
