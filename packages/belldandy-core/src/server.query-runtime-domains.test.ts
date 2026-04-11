import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, expect, test } from "vitest";
import WebSocket from "ws";

import { AgentRegistry, ConversationStore, MockAgent } from "@belldandy/agent";
import { ToolExecutor } from "@belldandy/skills";

import { persistConversationPromptSnapshot } from "./conversation-prompt-snapshot.js";
import { startGatewayServer } from "./server.js";
import {
  cleanupGlobalMemoryManagersForTest,
  createContractedTestTool,
  createTestTool,
  pairWebSocketClient,
  resolveWebRoot,
  waitFor,
} from "./server-testkit.js";
import { SubTaskRuntimeStore } from "./task-runtime.js";
import { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import { ToolsConfigManager } from "./tools-config.js";

// MemoryManager 内部会初始化 OpenAIEmbeddingProvider，需要 OPENAI_API_KEY
// 测试环境中设置一个占位值，避免构造函数抛错（不会实际调用 API）
beforeAll(() => {
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "test-placeholder-key";
  }
});

afterEach(() => {
  cleanupGlobalMemoryManagersForTest();
});

test("tool_settings.confirm rejects pending request without applying config change", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const confirmationStore = new ToolControlConfirmationStore();
  confirmationStore.create({
    requestId: "UI001",
    conversationId: "conv-webchat-reject",
    requestedByAgentId: "default",
    changes: {
      enableBuiltin: [],
      disableBuiltin: ["alpha_builtin"],
      enableMcpServers: [],
      disableMcpServers: [],
      enablePlugins: [],
      disablePlugins: [],
    },
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolsConfigManager,
    toolControlConfirmationStore: confirmationStore,
    getAgentToolControlMode: () => "confirm",
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    ws.send(JSON.stringify({
      type: "req",
      id: "reject-webchat-confirm",
      method: "tool_settings.confirm",
      params: {
        requestId: "UI001",
        conversationId: "conv-webchat-reject",
        decision: "reject",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "reject-webchat-confirm" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tool_settings.confirm.resolved"));

    expect(toolsConfigManager.getConfig().disabled.builtin).toEqual([]);
    expect(confirmationStore.get("UI001")).toBeUndefined();

    const resolvedEvent = frames.find((f) => f.type === "event" && f.event === "tool_settings.confirm.resolved");
    expect(resolvedEvent?.payload?.decision).toBe("rejected");
    expect(frames.some((f) => f.type === "event" && f.event === "tools.config.updated")).toBe(false);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("agent.contracts.get exposes tool contract v2 summary", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("run_command"),
      createContractedTestTool("apply_patch"),
      createTestTool("beta_builtin"),
    ],
    workspaceRoot: process.cwd(),
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolsConfigManager,
    toolExecutor,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({ type: "req", id: "agent-contracts-get", method: "agent.contracts.get", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "agent-contracts-get"));
    const res = frames.find((f) => f.type === "res" && f.id === "agent-contracts-get");

    expect(res.ok).toBe(true);
    expect(res.payload?.summary).toMatchObject({
      totalCount: 2,
      missingV2Count: 1,
      governedTools: ["apply_patch", "run_command"],
      missingV2Tools: ["beta_builtin"],
    });
    expect(res.payload?.contracts?.run_command).toMatchObject({
      recommendedWhen: expect.any(Array),
      preflightChecks: expect.any(Array),
      hasGovernanceContract: true,
      hasBehaviorContract: true,
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("subtask.list and subtask.get expose persisted task runtime records", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir);
  await subTaskRuntimeStore.load();
  const registry = new AgentRegistry(() => new MockAgent());
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "primary",
  });
  registry.register({
    id: "coder",
    displayName: "Coder",
    model: "primary",
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: "coder",
  });

  const targetTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-subtask",
      agentId: "coder",
      instruction: "Implement structured task runtime",
      timeoutMs: 90_000,
      channel: "goal",
      toolSet: ["read", "edit"],
      delegationProtocol: {
        source: "delegate_task",
        intent: {
          kind: "ad_hoc",
          summary: "Implement structured task runtime",
          role: "coder",
        },
        contextPolicy: {
          includeParentConversation: true,
          includeStructuredContext: true,
          contextKeys: ["taskId", "workspace"],
        },
        expectedDeliverable: {
          format: "patch",
          summary: "Return the patch summary",
        },
        aggregationPolicy: {
          mode: "single",
          summarizeFailures: true,
          sourceAgentIds: ["planner", "reviewer"],
        },
        launchDefaults: {
          permissionMode: "workspace_write",
          allowedToolFamilies: ["workspace-read", "workspace-write"],
          maxToolRiskLevel: "medium",
        },
      },
    },
  });
  await subTaskRuntimeStore.markQueued(targetTask.id, 1);
  await subTaskRuntimeStore.attachSession(targetTask.id, "sub_task_1");
  await subTaskRuntimeStore.completeTask(targetTask.id, {
    status: "done",
    sessionId: "sub_task_1",
    output: "structured runtime finished",
  });
  await persistConversationPromptSnapshot({
    stateDir,
    snapshot: {
      agentId: "coder",
      conversationId: "sub_task_1",
      runId: "run-subtask-1",
      createdAt: 1712000000100,
      systemPrompt: "Ship the patch and keep the diff small.",
      messages: [
        { role: "system", content: "Ship the patch and keep the diff small." },
        { role: "user", content: "Implement structured task runtime" },
      ],
      hookSystemPromptUsed: false,
    },
  });

  const otherTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-other",
      agentId: "researcher",
      instruction: "Should not appear in filtered results",
    },
  });
  await subTaskRuntimeStore.completeTask(otherTask.id, {
    status: "error",
    output: "",
    error: "other task failed",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    subTaskRuntimeStore,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-list",
      method: "subtask.list",
      params: { conversationId: "conv-subtask" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-list"));

    const listRes = frames.find((f) => f.type === "res" && f.id === "subtask-list");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.conversationId).toBe("conv-subtask");
    expect(listRes.payload?.items).toEqual([
      expect.objectContaining({
        id: targetTask.id,
        parentConversationId: "conv-subtask",
        sessionId: "sub_task_1",
        agentId: "coder",
        status: "done",
        outputPreview: "structured runtime finished",
        launchSpec: expect.objectContaining({
          profileId: "coder",
          channel: "goal",
          timeoutMs: 90_000,
          toolSet: ["read", "edit"],
          delegation: expect.objectContaining({
            source: "delegate_task",
            intentKind: "ad_hoc",
            expectedDeliverableFormat: "patch",
            aggregationMode: "single",
            sourceAgentIds: ["planner", "reviewer"],
          }),
        }),
      }),
    ]);

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-get",
      method: "subtask.get",
      params: { taskId: targetTask.id },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-get"));

    const getRes = frames.find((f) => f.type === "res" && f.id === "subtask-get");
    expect(getRes.ok).toBe(true);
    expect(getRes.payload?.item).toMatchObject({
      id: targetTask.id,
      sessionId: "sub_task_1",
      status: "done",
      outputPath: expect.any(String),
      launchSpec: expect.objectContaining({
        profileId: "coder",
        channel: "goal",
        delegation: expect.objectContaining({
          source: "delegate_task",
          intentSummary: "Implement structured task runtime",
          expectedDeliverableSummary: "Return the patch summary",
          contextKeys: ["taskId", "workspace"],
        }),
      }),
    });
    expect(getRes.payload?.continuationState).toMatchObject({
      version: 1,
      scope: "subtask",
      targetId: targetTask.id,
      recommendedTargetId: "sub_task_1",
      targetType: "session",
      resumeMode: "rerun",
    });
    expect(getRes.payload?.launchExplainability).toMatchObject({
      catalogDefault: {
        permissionMode: "workspace_write",
        allowedToolFamilies: ["workspace-read", "workspace-write"],
        maxToolRiskLevel: "medium",
      },
      effectiveLaunch: {
        source: "runtime_launch_spec",
        agentId: "coder",
        profileId: "coder",
        permissionMode: "workspace_write",
        allowedToolFamilies: ["workspace-read", "workspace-write"],
        maxToolRiskLevel: "medium",
      },
      delegationReason: {
        source: "delegate_task",
        intentKind: "ad_hoc",
        intentSummary: "Implement structured task runtime",
        expectedDeliverableSummary: "Return the patch summary",
        aggregationMode: "single",
        contextKeys: ["taskId", "workspace"],
        sourceAgentIds: ["planner", "reviewer"],
      },
    });
    expect(getRes.payload?.promptSnapshotView).toMatchObject({
      snapshot: {
        manifest: {
          conversationId: "sub_task_1",
          runId: "run-subtask-1",
          agentId: "coder",
        },
        summary: {
          messageCount: 2,
        },
        snapshot: {
          systemPrompt: "Ship the patch and keep the diff small.",
        },
      },
      residentStateBinding: {
        agentId: "coder",
      },
      launchExplainability: {
        effectiveLaunch: {
          source: "runtime_launch_spec",
          agentId: "coder",
          profileId: "coder",
        },
      },
    });
    expect(getRes.payload?.resultEnvelope).toMatchObject({
      taskId: targetTask.id,
      sessionId: "sub_task_1",
      agentId: "coder",
      status: "done",
      summary: "structured runtime finished",
      outputPath: expect.any(String),
      outputPreview: "structured runtime finished",
    });
    expect(getRes.payload?.outputContent).toBe("structured runtime finished");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("delegation.inspect.get exposes persisted delegation snapshot", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir);
  await subTaskRuntimeStore.load();

  const task = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-delegation",
      agentId: "researcher",
      instruction: "Collect delegation context",
      delegationProtocol: {
        source: "delegate_parallel",
        intent: {
          kind: "parallel_subtasks",
          summary: "Collect delegation context",
          role: "researcher",
          goalId: "goal-1",
          nodeId: "node-1",
          planId: "plan-1",
        },
        contextPolicy: {
          includeParentConversation: true,
          includeStructuredContext: true,
          contextKeys: ["goalId", "topic"],
        },
        expectedDeliverable: {
          format: "research_notes",
          summary: "Return research notes",
        },
        aggregationPolicy: {
          mode: "parallel_collect",
          summarizeFailures: true,
          sourceAgentIds: ["planner", "resident-a"],
        },
        launchDefaults: {},
      },
    },
  });
  await subTaskRuntimeStore.attachSession(task.id, "sub_research_1");
  await subTaskRuntimeStore.completeTask(task.id, {
    status: "done",
    sessionId: "sub_research_1",
    output: "delegation context collected",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    subTaskRuntimeStore,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "delegation-inspect",
      method: "delegation.inspect.get",
      params: { taskId: task.id },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "delegation-inspect"));

    const res = frames.find((f) => f.type === "res" && f.id === "delegation-inspect");
    expect(res.ok).toBe(true);
    expect(res.payload?.task).toMatchObject({
      id: task.id,
      parentConversationId: "conv-delegation",
      agentId: "researcher",
      status: "done",
    });
    expect(res.payload?.delegation).toMatchObject({
      source: "delegate_parallel",
      intentKind: "parallel_subtasks",
      intentSummary: "Collect delegation context",
      role: "researcher",
      expectedDeliverableFormat: "research_notes",
      expectedDeliverableSummary: "Return research notes",
      aggregationMode: "parallel_collect",
      sourceAgentIds: ["planner", "resident-a"],
      goalId: "goal-1",
      nodeId: "node-1",
      planId: "plan-1",
      launchDefaults: {},
    });
    expect(res.payload?.launchExplainability).toMatchObject({
      catalogDefault: {},
      effectiveLaunch: {
        agentId: "researcher",
        role: null,
        permissionMode: null,
        allowedToolFamilies: [],
        maxToolRiskLevel: null,
      },
      delegationReason: {
        source: "delegate_parallel",
        intentKind: "parallel_subtasks",
        expectedDeliverableSummary: "Return research notes",
        aggregationMode: "parallel_collect",
        sourceAgentIds: ["planner", "resident-a"],
      },
    });
    expect(res.payload?.explainability).toMatchObject({
      effectiveLaunch: {
        agentId: "researcher",
      },
      delegationReason: {
        source: "delegate_parallel",
      },
    });
    expect(res.payload?.resultEnvelope).toMatchObject({
      taskId: task.id,
      sessionId: "sub_research_1",
      status: "done",
      summary: "delegation context collected",
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("external_outbound.audit.list returns recent audit records via websocket rpc", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    externalOutboundAuditStore: {
      async append() {},
      async listRecent(limit: number) {
        expect(limit).toBe(2);
        return [
          {
            timestamp: 1710000002000,
            sourceConversationId: "conv-2",
            sourceChannel: "webchat" as const,
            targetChannel: "qq" as const,
            requestedSessionKey: "channel=qq:chat=chat-2",
            resolution: "explicit_session_key" as const,
            decision: "auto_approved" as const,
            delivery: "failed" as const,
            contentPreview: "resolve fail",
            errorCode: "binding_not_found",
            error: "not found",
          },
          {
            timestamp: 1710000004000,
            sourceConversationId: "conv-3",
            sourceChannel: "webchat" as const,
            targetChannel: "discord" as const,
            targetSessionKey: "channel=discord:chat=room-1",
            resolution: "latest_binding" as const,
            decision: "confirmed" as const,
            delivery: "failed" as const,
            contentPreview: "send fail",
            errorCode: "send_failed",
            error: "send failed",
          },
        ];
      },
    },
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "external-outbound-audit-list",
      method: "external_outbound.audit.list",
      params: { limit: 2 },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "external-outbound-audit-list"));

    const res = frames.find((f) => f.type === "res" && f.id === "external-outbound-audit-list");
    expect(res.ok).toBe(true);
    expect(res.payload).toMatchObject({
      limit: 2,
      items: [
        expect.objectContaining({
          sourceConversationId: "conv-2",
          targetChannel: "qq",
          errorCode: "binding_not_found",
        }),
        expect.objectContaining({
          sourceConversationId: "conv-3",
          targetChannel: "discord",
          errorCode: "send_failed",
        }),
      ],
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
