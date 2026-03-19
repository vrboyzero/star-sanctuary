import { describe, expect, it } from "vitest";
import type { ToolContext } from "../types.js";
import {
  createToolSettingsControlTool,
  TOOL_SETTINGS_CONTROL_NAME,
  type AgentToolControlMode,
} from "./tool-settings-control.js";

function createConfigManager() {
  const state = {
    version: 1,
    disabled: {
      builtin: [] as string[],
      mcp_servers: [] as string[],
      plugins: [] as string[],
      skills: [] as string[],
    },
  };
  return {
    state,
    getConfig() {
      return {
        version: state.version,
        disabled: {
          builtin: [...state.disabled.builtin],
          mcp_servers: [...state.disabled.mcp_servers],
          plugins: [...state.disabled.plugins],
          skills: [...state.disabled.skills],
        },
      };
    },
    async updateConfig(disabled: Partial<typeof state.disabled>) {
      if (disabled.builtin !== undefined) state.disabled.builtin = [...disabled.builtin];
      if (disabled.mcp_servers !== undefined) state.disabled.mcp_servers = [...disabled.mcp_servers];
      if (disabled.plugins !== undefined) state.disabled.plugins = [...disabled.plugins];
      if (disabled.skills !== undefined) state.disabled.skills = [...disabled.skills];
    },
  };
}

function createConfirmationStore() {
  const entries = new Map<string, any>();
  return {
    create(req: any) {
      const stored = { ...req, createdAt: Date.now(), expiresAt: Date.now() + 60_000 };
      entries.set(stored.requestId, stored);
      return stored;
    },
    get(requestId: string) {
      return entries.get(requestId);
    },
    delete(requestId: string) {
      entries.delete(requestId);
    },
    cleanupExpired() {},
  };
}

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-1",
    workspaceRoot: "/tmp/workspace",
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 1000,
      maxResponseBytes: 1000,
    },
    conversationStore: {
      getHistory: () => [],
      setRoomMembersCache() {},
      getRoomMembersCache() { return undefined; },
      clearRoomMembersCache() {},
      recordTaskTokenResult() {},
      getTaskTokenResults() { return []; },
    },
    ...overrides,
  };
}

function createControlTool(mode: AgentToolControlMode, history: Array<{ role: "user" | "assistant"; content: string }> = []) {
  const configManager = createConfigManager();
  const confirmationStore = createConfirmationStore();
  const tool = createToolSettingsControlTool({
    toolsConfigManager: configManager,
    getControlMode: () => mode,
    listRegisteredTools: () => [
      TOOL_SETTINGS_CONTROL_NAME,
      "file_read",
      "file_write",
      "skills_list",
      "mcp_docs_search",
    ],
    listPluginIds: () => ["plugin-alpha"],
    confirmationStore,
  });
  const context = createContext({
    conversationStore: {
      getHistory: () => history,
      setRoomMembersCache() {},
      getRoomMembersCache() { return undefined; },
      clearRoomMembersCache() {},
      recordTaskTokenResult() {},
      getTaskTokenResults() { return []; },
    },
  });
  return { tool, configManager, confirmationStore, context };
}

describe("tool_settings_control", () => {
  it("returns status output", async () => {
    const { tool, context } = createControlTool("disabled");
    const result = await tool.execute({ action: "status" }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Mode: disabled");
    expect(result.output).toContain("Builtin tools: 3");
  });

  it("rejects apply in disabled mode", async () => {
    const { tool, context } = createControlTool("disabled");
    const result = await tool.execute({ action: "apply", disableBuiltin: ["file_write"] }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain("BELLDANDY_AGENT_TOOL_CONTROL_MODE=disabled");
  });

  it("applies builtin, mcp, and plugin changes in auto mode", async () => {
    const { tool, configManager, context } = createControlTool("auto");
    const result = await tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
      disableMcpServers: ["docs"],
      disablePlugins: ["plugin-alpha"],
    }, context);

    expect(result.success).toBe(true);
    expect(configManager.state.disabled.builtin).toEqual(["file_write"]);
    expect(configManager.state.disabled.mcp_servers).toEqual(["docs"]);
    expect(configManager.state.disabled.plugins).toEqual(["plugin-alpha"]);
  });

  it("does not allow disabling the control tool itself", async () => {
    const { tool, context } = createControlTool("auto");
    const result = await tool.execute({
      action: "apply",
      disableBuiltin: [TOOL_SETTINGS_CONTROL_NAME],
    }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain("保留工具");
  });

  it("requires exact approval text before confirm applies changes", async () => {
    const first = createControlTool("confirm");
    const applyResult = await first.tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, first.context);

    expect(applyResult.success).toBe(true);
    const requestId = /批准工具设置变更 ([A-Z0-9-]+)/.exec(applyResult.output)?.[1];
    expect(requestId).toBeTruthy();

    const noApproval = createControlTool("confirm", [{ role: "user", content: "同意" }]);
    noApproval.configManager.state.disabled = first.configManager.state.disabled;
    const pending = first.confirmationStore.get(requestId!);
    noApproval.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
    });
    const denied = await noApproval.tool.execute({ action: "confirm", requestId }, noApproval.context);
    expect(denied.success).toBe(false);
    expect(denied.error).toContain("精确确认口令");

    const approved = createControlTool("confirm", [{ role: "user", content: `批准工具设置变更 ${requestId}` }]);
    approved.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
    });
    const confirmResult = await approved.tool.execute({ action: "confirm", requestId }, approved.context);
    expect(confirmResult.success).toBe(true);
    expect(approved.configManager.state.disabled.builtin).toEqual(["file_write"]);
  });

  it("accepts lowercase requestId on confirm", async () => {
    const first = createControlTool("confirm");
    const applyResult = await first.tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, first.context);

    const requestId = /批准工具设置变更 ([A-Z0-9-]+)/.exec(applyResult.output)?.[1];
    expect(requestId).toBeTruthy();

    const approved = createControlTool("confirm", [{ role: "user", content: `批准工具设置变更 ${requestId}` }]);
    const pending = first.confirmationStore.get(requestId!);
    approved.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
    });

    const confirmResult = await approved.tool.execute({ action: "confirm", requestId: requestId!.toLowerCase() }, approved.context);
    expect(confirmResult.success).toBe(true);
    expect(approved.configManager.state.disabled.builtin).toEqual(["file_write"]);
  });

  it("auto-confirms pending request when user has already approved but agent reissues apply with same changes", async () => {
    const first = createControlTool("confirm");
    const applyResult = await first.tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, first.context);

    const requestId = /批准工具设置变更 ([A-Z0-9-]+)/.exec(applyResult.output)?.[1];
    expect(requestId).toBeTruthy();
    const pending = first.confirmationStore.get(requestId!);

    const approved = createControlTool("confirm", [{ role: "user", content: `批准工具设置变更 ${requestId}` }]);
    approved.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
    });

    const result = await approved.tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, approved.context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("已直接执行待确认的全局工具设置变更");
    expect(approved.configManager.state.disabled.builtin).toEqual(["file_write"]);
  });

  it("falls back to the latest approval requestId when confirm receives requestId=unknown", async () => {
    const first = createControlTool("confirm");
    const applyResult = await first.tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, first.context);

    const requestId = /批准工具设置变更 ([A-Z0-9-]+)/.exec(applyResult.output)?.[1];
    expect(requestId).toBeTruthy();
    const pending = first.confirmationStore.get(requestId!);

    const approved = createControlTool("confirm", [{ role: "user", content: `批准工具设置变更 ${requestId}` }]);
    approved.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
    });

    const result = await approved.tool.execute({ action: "confirm", requestId: "unknown" }, approved.context);
    expect(result.success).toBe(true);
    expect(result.output).toContain("Disabled builtin");
    expect(approved.configManager.state.disabled.builtin).toEqual(["file_write"]);
  });
});
