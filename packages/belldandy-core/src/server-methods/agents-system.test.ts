import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleAgentsSystemMethod } from "./agents-system.js";

describe("handleAgentsSystemMethod", () => {
  let stateDir: string;
  let writeTextFileAtomic: (filePath: string, content: string, options?: { ensureParent?: boolean; mode?: number }) => Promise<void>;

  beforeEach(async () => {
    vi.useFakeTimers();
    stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-agents-system-"));
    writeTextFileAtomic = async (filePath, content, options = {}) => {
      if (options.ensureParent) {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: options.mode });
      }
      await fs.promises.writeFile(filePath, content, "utf-8");
    };
  });

  afterEach(async () => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("broadcasts a countdown before exiting on system.restart", async () => {
    const broadcast = vi.fn();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number | string | null) => {
      return undefined as never;
    }) as typeof process.exit);

    const res = await handleAgentsSystemMethod(
      {
        type: "req",
        id: "restart-1",
        method: "system.restart",
        params: { reason: "settings updated" },
      },
      {
        stateDir,
        clientId: "client-1",
        log: { warn: vi.fn() },
        broadcast,
        agentRegistry: undefined,
        residentAgentRuntime: {} as any,
        residentMemoryManagers: [],
        conversationStore: {} as any,
        subTaskRuntimeStore: undefined,
        writeTextFileAtomic,
        inspectAgentPrompt: undefined,
      },
    );

    expect(res).toMatchObject({ type: "res", id: "restart-1", ok: true });
    expect(broadcast).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(0);
    expect(broadcast).toHaveBeenNthCalledWith(1, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 3 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenNthCalledWith(2, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 2 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenNthCalledWith(3, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 1 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenNthCalledWith(4, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 0 },
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(exitSpy).toHaveBeenCalledWith(100);
  });

  it("creates a new agent profile and minimal workspace files", async () => {
    const res = await handleAgentsSystemMethod(
      {
        type: "req",
        id: "agent-create-1",
        method: "agent.create",
        params: {
          id: "coder-lite",
          displayName: "代码助手",
          model: "primary",
          systemPromptOverride: "你是一名严谨的代码助手。",
        },
      },
      {
        stateDir,
        clientId: "client-1",
        log: { warn: vi.fn() },
        broadcast: vi.fn(),
        agentRegistry: undefined,
        residentAgentRuntime: {} as any,
        residentMemoryManagers: [],
        conversationStore: {} as any,
        subTaskRuntimeStore: undefined,
        writeTextFileAtomic,
        inspectAgentPrompt: undefined,
      },
    );

    expect(res).toMatchObject({
      type: "res",
      id: "agent-create-1",
      ok: true,
      payload: {
        agentId: "coder-lite",
        configWritten: true,
        requiresRestart: true,
      },
    });

    const agentsConfig = JSON.parse(await fs.promises.readFile(path.join(stateDir, "agents.json"), "utf-8"));
    expect(agentsConfig.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "coder-lite",
        displayName: "代码助手",
        model: "primary",
        workspaceDir: "coder-lite",
      }),
    ]));

    const agentDir = path.join(stateDir, "agents", "coder-lite");
    await expect(fs.promises.stat(agentDir)).resolves.toBeTruthy();
    await expect(fs.promises.stat(path.join(agentDir, "facets"))).resolves.toBeTruthy();
    await expect(fs.promises.readFile(path.join(agentDir, "IDENTITY.md"), "utf-8")).resolves.toContain("代码助手");
    await expect(fs.promises.readFile(path.join(agentDir, "SOUL.md"), "utf-8")).resolves.toContain("你是一名严谨的代码助手。");
  });

  it("prefers stateDir experience templates for quick-created agent files", async () => {
    const templatesDir = path.join(stateDir, "experience-templates");
    await fs.promises.mkdir(templatesDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(templatesDir, "agent-identity.md"),
      [
        "# 自定义 IDENTITY",
        "",
        "- **名字：** {{displayName}}",
        "- **职责：** {{systemPromptOverride}}",
        "- **模型：** {{model}}",
        "",
      ].join("\n"),
      "utf-8",
    );
    await fs.promises.writeFile(
      path.join(templatesDir, "agent-soul.md"),
      [
        "# {{displayName}}",
        "",
        "## 自定义灵魂",
        "",
        "{{systemPromptOverride}}",
        "",
        "- model: {{model}}",
        "",
      ].join("\n"),
      "utf-8",
    );

    const res = await handleAgentsSystemMethod(
      {
        type: "req",
        id: "agent-create-template-1",
        method: "agent.create",
        params: {
          id: "custom-template-agent",
          displayName: "自定义模板助手",
          model: "gemma4-e4b",
          systemPromptOverride: "按自定义模板生成。",
        },
      },
      {
        stateDir,
        clientId: "client-1",
        log: { warn: vi.fn() },
        broadcast: vi.fn(),
        agentRegistry: undefined,
        residentAgentRuntime: {} as any,
        residentMemoryManagers: [],
        conversationStore: {} as any,
        subTaskRuntimeStore: undefined,
        writeTextFileAtomic,
        inspectAgentPrompt: undefined,
      },
    );

    expect(res).toMatchObject({
      type: "res",
      id: "agent-create-template-1",
      ok: true,
      payload: {
        agentId: "custom-template-agent",
      },
    });

    const agentDir = path.join(stateDir, "agents", "custom-template-agent");
    await expect(fs.promises.readFile(path.join(agentDir, "IDENTITY.md"), "utf-8")).resolves.toContain("自定义 IDENTITY");
    await expect(fs.promises.readFile(path.join(agentDir, "IDENTITY.md"), "utf-8")).resolves.toContain("gemma4-e4b");
    await expect(fs.promises.readFile(path.join(agentDir, "SOUL.md"), "utf-8")).resolves.toContain("自定义灵魂");
    await expect(fs.promises.readFile(path.join(agentDir, "SOUL.md"), "utf-8")).resolves.toContain("按自定义模板生成。");
  });

  it("rejects invalid agent id during creation", async () => {
    const res = await handleAgentsSystemMethod(
      {
        type: "req",
        id: "agent-create-invalid",
        method: "agent.create",
        params: {
          id: "Coder Lite",
          displayName: "代码助手",
          model: "primary",
          systemPromptOverride: "你是一名严谨的代码助手。",
        },
      },
      {
        stateDir,
        clientId: "client-1",
        log: { warn: vi.fn() },
        broadcast: vi.fn(),
        agentRegistry: undefined,
        residentAgentRuntime: {} as any,
        residentMemoryManagers: [],
        conversationStore: {} as any,
        subTaskRuntimeStore: undefined,
        writeTextFileAtomic,
        inspectAgentPrompt: undefined,
      },
    );

    expect(res).toMatchObject({
      type: "res",
      id: "agent-create-invalid",
      ok: false,
      error: {
        code: "invalid_agent_id",
      },
    });
  });
});
