import { describe, expect, it, vi, afterEach } from "vitest";

import { MCPManager } from "./manager.js";
import { MCPClient } from "./client.js";

describe("MCPManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes concurrent connect calls for the same server", async () => {
    const manager = new MCPManager();
    (manager as unknown as { config: unknown }).config = {
      version: 1,
      servers: [
        {
          id: "server_a",
          name: "Server A",
          enabled: true,
          transport: {
            type: "sse",
            url: "http://127.0.0.1:8080/sse",
          },
        },
      ],
    };

    let connectCalls = 0;
    vi.spyOn(MCPClient.prototype, "connect").mockImplementation(async function mockConnect(this: MCPClient) {
      connectCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      (this as unknown as { status: string; tools: unknown[]; resources: unknown[] }).status = "connected";
      (this as unknown as { tools: unknown[] }).tools = [];
      (this as unknown as { resources: unknown[] }).resources = [];
    });

    await Promise.all([
      manager.connect("server_a"),
      manager.connect("server_a"),
    ]);

    expect(connectCalls).toBe(1);
    expect(manager.getServerState("server_a")?.status).toBe("connected");
  });

  it("removes failed clients from the manager after connect failure", async () => {
    const manager = new MCPManager();
    (manager as unknown as { config: unknown }).config = {
      version: 1,
      servers: [
        {
          id: "server_fail",
          name: "Server Fail",
          enabled: true,
          transport: {
            type: "sse",
            url: "http://127.0.0.1:8081/sse",
          },
        },
      ],
    };

    const removeListenerSpy = vi.spyOn(MCPClient.prototype, "removeEventListener");
    vi.spyOn(MCPClient.prototype, "connect").mockRejectedValue(new Error("connect failed"));

    await expect(manager.connect("server_fail")).rejects.toThrow("connect failed");

    expect(manager.getServerState("server_fail")).toBeUndefined();
    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
  });

  it("removes manager event listeners from clients on disconnect", async () => {
    const manager = new MCPManager();
    (manager as unknown as { config: unknown }).config = {
      version: 1,
      servers: [
        {
          id: "server_disconnect",
          name: "Server Disconnect",
          enabled: true,
          transport: {
            type: "sse",
            url: "http://127.0.0.1:8082/sse",
          },
        },
      ],
    };

    vi.spyOn(MCPClient.prototype, "connect").mockImplementation(async function mockConnect(this: MCPClient) {
      (this as unknown as { status: string; tools: unknown[]; resources: unknown[] }).status = "connected";
      (this as unknown as { tools: unknown[] }).tools = [];
      (this as unknown as { resources: unknown[] }).resources = [];
    });
    vi.spyOn(MCPClient.prototype, "disconnect").mockImplementation(async function mockDisconnect(this: MCPClient) {
      (this as unknown as { status: string }).status = "disconnected";
    });
    const removeListenerSpy = vi.spyOn(MCPClient.prototype, "removeEventListener");

    await manager.connect("server_disconnect");
    await manager.disconnect("server_disconnect");

    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
    expect(manager.getServerState("server_disconnect")).toBeUndefined();
  });
});
