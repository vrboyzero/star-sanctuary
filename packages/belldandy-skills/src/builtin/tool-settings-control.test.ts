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
    getLatestByConversation(conversationId: string) {
      let latest;
      for (const entry of entries.values()) {
        if (entry.conversationId !== conversationId) continue;
        if (!latest || entry.createdAt > latest.createdAt) latest = entry;
      }
      return latest;
    },
    getLatestApprovedByConversation(conversationId: string) {
      let latest;
      for (const entry of entries.values()) {
        if (entry.conversationId !== conversationId || !entry.passwordApprovedAt) continue;
        if (!latest || entry.passwordApprovedAt > latest.passwordApprovedAt) latest = entry;
      }
      return latest;
    },
    markPasswordApproved(requestId: string, approvedAt = Date.now()) {
      const existing = entries.get(requestId);
      if (!existing) return undefined;
      const updated = { ...existing, passwordApprovedAt: approvedAt };
      entries.set(requestId, updated);
      return updated;
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

function createControlTool(
  mode: AgentToolControlMode,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
  options: { hasConfirmPassword?: boolean; contextOverrides?: Partial<ToolContext> } = {},
) {
  const configManager = createConfigManager();
  const confirmationStore = createConfirmationStore();
  const tool = createToolSettingsControlTool({
    toolsConfigManager: configManager,
    getControlMode: () => mode,
    getHasConfirmPassword: () => options.hasConfirmPassword === true,
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
    ...options.contextOverrides,
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

  it("uses password-specific prompt when confirm password is configured", async () => {
    const { tool, context } = createControlTool("confirm", [], { hasConfirmPassword: true });
    const result = await tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("已配置的工具开关确认口令");
    expect(result.output).not.toContain("如确认，请回复：批准工具设置变更");
    expect(result.output).not.toContain("requestId=\"");
  });

  it("emits webchat confirm event and hides legacy approval prompt in local webchat mode", async () => {
    const broadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const { tool, context, confirmationStore } = createControlTool("confirm", [], {
      hasConfirmPassword: true,
      contextOverrides: {
        roomContext: { environment: "local", clientId: "client-web-1" },
        broadcast: (event, payload) => broadcasts.push({ event, payload }),
      },
    });
    const result = await tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("WebChat 页面确认窗口");
    expect(result.output).not.toContain("批准工具设置变更");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].event).toBe("tool_settings.confirm.required");
    expect(broadcasts[0].payload.targetClientId).toBe("client-web-1");
    expect(Array.isArray(broadcasts[0].payload.summary)).toBe(true);
    const requestId = String(broadcasts[0].payload.requestId ?? "");
    expect(confirmationStore.get(requestId)?.changes.disableBuiltin).toEqual(["file_write"]);
  });

  it("requires password approval marker before confirm applies changes", async () => {
    const first = createControlTool("confirm", [], { hasConfirmPassword: true });
    const applyResult = await first.tool.execute({
      action: "apply",
      disableBuiltin: ["file_write"],
    }, first.context);

    expect(applyResult.success).toBe(true);
    const requestId = first.confirmationStore.getLatestByConversation("conv-1")?.requestId;
    expect(requestId).toBeTruthy();

    const pending = first.confirmationStore.get(requestId!);
    const denied = createControlTool("confirm", [], { hasConfirmPassword: true });
    denied.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
    });
    const deniedResult = await denied.tool.execute({ action: "confirm" }, denied.context);
    expect(deniedResult.success).toBe(false);
    expect(deniedResult.error).toContain("已配置的工具开关确认口令");

    const approved = createControlTool("confirm", [], { hasConfirmPassword: true });
    approved.confirmationStore.create({
      requestId: pending.requestId,
      conversationId: pending.conversationId,
      requestedByAgentId: pending.requestedByAgentId,
      changes: pending.changes,
      passwordApprovedAt: Date.now(),
    });
    const confirmResult = await approved.tool.execute({ action: "confirm" }, approved.context);
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
