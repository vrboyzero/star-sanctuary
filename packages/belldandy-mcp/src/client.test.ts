import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MCPClient, expandFilesystemServerArgs, parseExtraWorkspaceRoots } from "./client.js";

describe("parseExtraWorkspaceRoots", () => {
  it("splits BELLDANDY_EXTRA_WORKSPACE_ROOTS and removes duplicates", () => {
    const roots = parseExtraWorkspaceRoots({
      BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary, E:/project/star-sanctuary , E:/project/docs",
    });

    expect(roots).toHaveLength(2);
    expect(roots[0].toLowerCase()).toContain("e:");
    expect(roots[0].replace(/\\/g, "/")).toContain("/project/star-sanctuary");
    expect(roots[1].replace(/\\/g, "/")).toContain("/project/docs");
  });
});

describe("expandFilesystemServerArgs", () => {
  it("uses env roots when filesystem MCP has no explicit roots", () => {
    const args = expandFilesystemServerArgs(
      "cmd",
      ["/c", "npx", "@modelcontextprotocol/server-filesystem"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary,E:/project/assets" },
    );

    expect(args).toEqual([
      "/c",
      "npx",
      "@modelcontextprotocol/server-filesystem",
      expect.stringMatching(/project[\\/]+star-sanctuary$/),
      expect.stringMatching(/project[\\/]+assets$/),
    ]);
  });

  it("appends BELLDANDY_EXTRA_WORKSPACE_ROOTS to filesystem MCP roots", () => {
    const args = expandFilesystemServerArgs(
      "cmd",
      ["/c", "npx", "@modelcontextprotocol/server-filesystem", "C:/Users/admin/.star_sanctuary"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary,E:/project/assets" },
    );

    expect(args).toEqual([
      "/c",
      "npx",
      "@modelcontextprotocol/server-filesystem",
      "C:/Users/admin/.star_sanctuary",
      expect.stringMatching(/project[\\/]+star-sanctuary$/),
      expect.stringMatching(/project[\\/]+assets$/),
    ]);
  });

  it("does not change non-filesystem MCP commands", () => {
    const args = expandFilesystemServerArgs(
      "npx",
      ["-y", "chrome-devtools-mcp@latest"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary" },
    );

    expect(args).toEqual(["-y", "chrome-devtools-mcp@latest"]);
  });

  it("does not append duplicated roots", () => {
    const args = expandFilesystemServerArgs(
      "npx",
      ["-y", "@modelcontextprotocol/server-filesystem", "E:/project/star-sanctuary"],
      { BELLDANDY_EXTRA_WORKSPACE_ROOTS: "E:/project/star-sanctuary" },
    );

    expect(args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "E:/project/star-sanctuary"]);
  });
});

describe("MCPClient reconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function createClient() {
    return new MCPClient({
      id: "test-server",
      name: "Test Server",
      transport: {
        type: "sse",
        url: "http://127.0.0.1:3000/sse",
      },
      retryCount: 3,
      retryDelay: 1000,
    });
  }

  it("cancels pending reconnect delay when disconnected", async () => {
    const client = createClient();
    const clientInternals = client as unknown as { cleanup: () => Promise<void> };
    const cleanupSpy = vi.spyOn(clientInternals, "cleanup").mockResolvedValue(undefined);
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);

    const reconnectPromise = client.reconnect();

    await vi.advanceTimersByTimeAsync(200);
    await client.disconnect();
    await vi.runAllTimersAsync();
    await reconnectPromise;

    expect(connectSpy).not.toHaveBeenCalled();
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(client.getState().status).toBe("disconnected");
  });

  it("reuses the same reconnect loop for concurrent callers", async () => {
    const client = createClient();
    const clientInternals = client as unknown as { cleanup: () => Promise<void> };
    const cleanupSpy = vi.spyOn(clientInternals, "cleanup").mockResolvedValue(undefined);
    const connectSpy = vi.spyOn(client, "connect").mockResolvedValue(undefined);

    const reconnectA = client.reconnect();
    const reconnectB = client.reconnect();

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all([reconnectA, reconnectB]);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });
});
