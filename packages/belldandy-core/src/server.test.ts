import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, beforeAll, vi } from "vitest";
import WebSocket from "ws";

import { AgentRegistry, type BelldandyAgent, ConversationStore, MockAgent, normalizeAgentLaunchSpec } from "@belldandy/agent";
import { CompactionRuntimeTracker as SourceCompactionRuntimeTracker } from "../../belldandy-agent/src/compaction-runtime.js";
import { MemoryManager, getGlobalMemoryManager, registerGlobalMemoryManager } from "@belldandy/memory";
import {
  SkillRegistry,
  ToolExecutor,
  createToolSettingsControlTool,
  type Tool,
  TOOL_SETTINGS_CONTROL_NAME,
  withToolContract,
} from "@belldandy/skills";
import { PluginRegistry } from "@belldandy/plugins";
import { upsertInstalledExtension, upsertKnownMarketplace } from "./extension-marketplace-state.js";
import type { ExtensionHostState } from "./extension-host.js";
import { buildExtensionRuntimeReport } from "./extension-runtime.js";
import { recordConversationArtifactExport } from "./conversation-export-index.js";
import { createScopedMemoryManagers } from "./resident-memory-managers.js";
import { resolveResidentSharedStateDir } from "./resident-memory-policy.js";
import { startGatewayServer } from "./server.js";
import { approvePairingCode } from "./security/store.js";
import { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import { SubTaskRuntimeStore } from "./task-runtime.js";
import { ToolsConfigManager } from "./tools-config.js";
import { BELLDANDY_VERSION } from "./version.generated.js";
import { IdempotencyManager } from "./webhook/index.js";

// MemoryManager 内部会初始化 OpenAIEmbeddingProvider，需要 OPENAI_API_KEY
// 测试环境中设置一个占位值，避免构造函数抛错（不会实际调用 API）
beforeAll(() => {
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "test-placeholder-key";
  }
});

function resolveWebRoot() {
  return path.join(process.cwd(), "apps", "web", "public");
}

test("gateway handshake and message.send streams chat", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];

  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => {
    frames.push(JSON.parse(data.toString("utf-8")));
  });

  await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));

  await waitFor(() => frames.some((f) => f.type === "hello-ok"));
  const hello = frames.find((f) => f.type === "hello-ok");
  expect(hello?.version).toBe(BELLDANDY_VERSION);

  const reqId = "req-1";
  ws.send(JSON.stringify({ type: "req", id: reqId, method: "message.send", params: { text: "你好" } }));

  await waitFor(() => frames.some((f) => f.type === "event" && f.event === "pairing.required"));
  const pairing = frames.find((f) => f.type === "event" && f.event === "pairing.required");
  const code = pairing?.payload?.code ? String(pairing.payload.code) : "";
  expect(code.length).toBeGreaterThan(0);

  const approved = await approvePairingCode({ code, stateDir });
  expect(approved.ok).toBe(true);

  const reqId2 = "req-2";
  ws.send(JSON.stringify({ type: "req", id: reqId2, method: "message.send", params: { text: "你好" } }));

  await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId2 && f.ok === true));
  await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));

  const sendRes = frames.find((f) => f.type === "res" && f.id === reqId2);
  expect(sendRes.payload.messageMeta).toMatchObject({
    isLatest: true,
  });
  const final = frames.find((f) => f.type === "event" && f.event === "chat.final");
  expect(final.payload.text).toContain("你好");
  expect(final.payload.messageMeta).toMatchObject({
    isLatest: true,
  });
  expect(typeof final.payload.messageMeta?.timestampMs).toBe("number");

  ws.close();
  await closeP;
  await server.close();
  // Windows: SQLite 文件可能仍被锁定，忽略清理错误（由 OS 最终回收）
  await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("message.send persists accepted user transcript before assistant finalizes", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  let releaseAssistant!: () => void;
  const assistantGate = new Promise<void>((resolve) => {
    releaseAssistant = resolve;
  });
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
    agentFactory: () => ({
      async *run(input) {
        yield { type: "status" as const, status: "running" };
        await assistantGate;
        yield { type: "final" as const, text: `echo:${input.text}` };
        yield { type: "status" as const, status: "done" };
      },
    }),
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
      id: "message-send-transcript-user-first",
      method: "message.send",
      params: {
        conversationId: "conv-transcript-user-first",
        text: "先记住我刚才说的话。",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "message-send-transcript-user-first" && f.ok === true));
    await conversationStore.waitForPendingPersistence("conv-transcript-user-first");
    const beforeAssistant = await conversationStore.getSessionTranscriptEvents("conv-transcript-user-first");

    expect(beforeAssistant).toHaveLength(1);
    expect(beforeAssistant[0]).toMatchObject({
      conversationId: "conv-transcript-user-first",
      type: "user_message_accepted",
      payload: {
        message: {
          role: "user",
          content: "先记住我刚才说的话。",
        },
      },
    });

    releaseAssistant();
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final" && f.payload?.conversationId === "conv-transcript-user-first"));
    await conversationStore.waitForPendingPersistence("conv-transcript-user-first");
    const afterAssistant = await conversationStore.getSessionTranscriptEvents("conv-transcript-user-first");

    expect(afterAssistant).toHaveLength(2);
    expect(afterAssistant[1]).toMatchObject({
      conversationId: "conv-transcript-user-first",
      type: "assistant_message_finalized",
      payload: {
        message: {
          role: "assistant",
          content: "echo:先记住我刚才说的话。",
        },
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("/health includes version", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    const payload = await res.json() as { status?: string; version?: string };
    expect(res.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.version).toBe(BELLDANDY_VERSION);
  } finally {
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("/api/avatar/upload writes avatar file and updates USER.md in stateDir", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  await fs.promises.writeFile(
    path.join(stateDir, "USER.md"),
    "- **名字：** Test User\n- **头像：** 👤\n",
    "utf-8",
  );
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
    "base64",
  );

  try {
    const formData = new FormData();
    formData.append("role", "user");
    formData.append("file", new Blob([pngBuffer], { type: "image/png" }), "avatar.png");

    const res = await fetch(`http://127.0.0.1:${server.port}/api/avatar/upload`, {
      method: "POST",
      body: formData,
    });
    const payload = await res.json() as { ok?: boolean; role?: string; avatarPath?: string; mdPath?: string };

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.role).toBe("user");
    expect(payload.avatarPath).toMatch(/^\/avatar\/avatar-user-\d+-[0-9a-f]{8}\.png$/);
    expect(payload.mdPath).toBe(path.join(stateDir, "USER.md"));

    const userMd = await fs.promises.readFile(path.join(stateDir, "USER.md"), "utf-8");
    expect(userMd).toContain(`- **头像：** ${payload.avatarPath}`);

    const avatarFiles = await fs.promises.readdir(path.join(stateDir, "avatar"));
    expect(avatarFiles).toHaveLength(1);

    const assetRes = await fetch(`http://127.0.0.1:${server.port}${payload.avatarPath}`);
    expect(assetRes.status).toBe(200);
    expect(Buffer.from(await assetRes.arrayBuffer()).equals(pngBuffer)).toBe(true);
  } finally {
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("/api/avatar/upload writes avatar file into selected agent IDENTITY.md when agentId is provided", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    workspaceDir: "coder",
  });

  const agentDir = path.join(stateDir, "agents", "coder");
  await fs.promises.mkdir(agentDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(agentDir, "IDENTITY.md"),
    "- **名字：** 小码 (Coder)\n- **头像：** 👨‍💻\n",
    "utf-8",
  );

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
  });

  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=",
    "base64",
  );

  try {
    const formData = new FormData();
    formData.append("role", "agent");
    formData.append("agentId", "coder");
    formData.append("file", new Blob([pngBuffer], { type: "image/png" }), "coder-avatar.png");

    const res = await fetch(`http://127.0.0.1:${server.port}/api/avatar/upload`, {
      method: "POST",
      body: formData,
    });
    const payload = await res.json() as {
      ok?: boolean;
      role?: string;
      agentId?: string;
      avatarPath?: string;
      mdPath?: string;
    };

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.role).toBe("agent");
    expect(payload.agentId).toBe("coder");
    expect(payload.avatarPath).toMatch(/^\/avatar\/avatar-agent-\d+-[0-9a-f]{8}\.png$/);
    expect(payload.mdPath).toBe(path.join(agentDir, "IDENTITY.md"));

    const identityContent = await fs.promises.readFile(path.join(agentDir, "IDENTITY.md"), "utf-8");
    expect(identityContent).toContain(`- **头像：** ${payload.avatarPath}`);
  } finally {
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("models.list returns sanitized model list with current default model ref", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const registry = new AgentRegistry(() => new MockAgent());
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "kimi-k2.5",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    primaryModelConfig: {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-primary",
      model: "gpt-5",
    },
    modelFallbacks: [
      {
        id: "kimi-k2.5",
        displayName: "Kimi K2.5",
        baseUrl: "https://api.moonshot.cn/v1",
        apiKey: "sk-kimi",
        model: "kimi-k2.5",
      },
      {
        id: "claude-opus",
        displayName: "Claude Opus 4.5",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-claude",
        model: "claude-opus-4-5",
        protocol: "anthropic",
      },
    ],
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
    ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
    await waitFor(() => frames.some((f) => f.type === "hello-ok"));

    const reqId = "models-list";
    ws.send(JSON.stringify({ type: "req", id: reqId, method: "models.list" }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId));

    const res = frames.find((f) => f.type === "res" && f.id === reqId);
    expect(res.ok).toBe(true);
    expect(res.payload.currentDefault).toBe("kimi-k2.5");
    expect(res.payload.models).toEqual([
      { id: "primary", displayName: "gpt-5", model: "gpt-5" },
      { id: "kimi-k2.5", displayName: "Kimi K2.5（默认）", model: "kimi-k2.5" },
      { id: "claude-opus", displayName: "Claude Opus 4.5", model: "claude-opus-4-5" },
    ]);
    expect(res.payload.models[0].apiKey).toBeUndefined();
    expect(res.payload.models[0].baseUrl).toBeUndefined();
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => { });
  }
});

test("agents.list exposes agent name and avatar from per-agent IDENTITY.md", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    workspaceDir: "coder",
  });

  const agentDir = path.join(stateDir, "agents", "coder");
  await fs.promises.mkdir(agentDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(agentDir, "IDENTITY.md"),
    "- **名字：** 小码 (Coder)\n- **头像：** /avatar/coder_avatar.png\n",
    "utf-8",
  );

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
    ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
    await waitFor(() => frames.some((f) => f.type === "hello-ok"));

    ws.send(JSON.stringify({ type: "req", id: "agents-list", method: "agents.list" }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "agents-list"));

    const agentsRes = frames.find((f) => f.type === "res" && f.id === "agents-list");
    expect(agentsRes.ok).toBe(true);
    expect(agentsRes.payload?.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "coder",
        displayName: "Coder",
        name: "小码 (Coder)",
        avatar: "/avatar/coder_avatar.png",
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("agents.roster.get exposes resident runtime status and main conversation ids", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    memoryMode: "isolated",
    sessionNamespace: "coder-main",
    workspaceBinding: "current",
    workspaceDir: "coder",
  });
  registry.register({
    id: "verifier",
    displayName: "Verifier",
    model: "primary",
    kind: "worker",
    workspaceDir: "verifier",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
    ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
    await waitFor(() => frames.some((f) => f.type === "hello-ok"));

    ws.send(JSON.stringify({ type: "req", id: "agents-roster", method: "agents.roster.get" }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "agents-roster"));

    const rosterRes = frames.find((f) => f.type === "res" && f.id === "agents-roster");
    expect(rosterRes.ok).toBe(true);
    expect(rosterRes.payload?.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "default",
        kind: "resident",
        workspaceBinding: "current",
        sessionNamespace: "default",
        memoryMode: "hybrid",
        status: "idle",
        mainConversationId: "agent:default:main",
        lastConversationId: "agent:default:main",
      }),
      expect.objectContaining({
        id: "coder",
        kind: "resident",
        workspaceBinding: "current",
        sessionNamespace: "coder-main",
        memoryMode: "isolated",
        status: "idle",
        mainConversationId: "agent:coder:main",
        lastConversationId: "agent:coder:main",
      }),
    ]));
    expect(rosterRes.payload?.agents.some((item: { id?: string }) => item.id === "verifier")).toBe(false);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("message.send without conversationId reuses resident agent main conversation", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    memoryMode: "isolated",
    sessionNamespace: "coder-main",
    workspaceBinding: "current",
    workspaceDir: "coder",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    agentFactory: () => ({
      async *run(input) {
        yield { type: "status" as const, status: "running" };
        yield { type: "final" as const, text: `echo:${input.text}` };
        yield { type: "status" as const, status: "done" };
      },
    }),
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
      id: "resident-main-1",
      method: "message.send",
      params: {
        text: "你好 coder",
        agentId: "coder",
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "resident-main-1" && f.ok === true));
    const firstRes = frames.find((f) => f.type === "res" && f.id === "resident-main-1");
    expect(firstRes.payload?.conversationId).toBe("agent:coder:main");

    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final" && f.payload?.conversationId === "agent:coder:main"));

    ws.send(JSON.stringify({
      type: "req",
      id: "resident-main-2",
      method: "message.send",
      params: {
        text: "第二轮 coder",
        agentId: "coder",
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "resident-main-2" && f.ok === true));
    const secondRes = frames.find((f) => f.type === "res" && f.id === "resident-main-2");
    expect(secondRes.payload?.conversationId).toBe("agent:coder:main");

    ws.send(JSON.stringify({
      type: "req",
      id: "resident-main-default",
      method: "message.send",
      params: {
        text: "你好 default",
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "resident-main-default" && f.ok === true));
    const defaultRes = frames.find((f) => f.type === "res" && f.id === "resident-main-default");
    expect(defaultRes.payload?.conversationId).toBe("agent:default:main");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("resident agent main conversation persists inside agent workspace sessions", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    memoryMode: "isolated",
    sessionNamespace: "coder-main",
    workspaceBinding: "current",
    workspaceDir: "coder",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    agentFactory: () => ({
      async *run(input) {
        yield { type: "status" as const, status: "running" };
        yield { type: "final" as const, text: `echo:${input.text}` };
        yield { type: "status" as const, status: "done" };
      },
    }),
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
      id: "resident-storage-coder",
      method: "message.send",
      params: {
        text: "写到 coder 私有 sessions",
        agentId: "coder",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "resident-storage-coder" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final" && f.payload?.conversationId === "agent:coder:main"));

    const conversationId = "agent:coder:main";
    const safeConversationId = toSafeConversationFileIdForTest(conversationId);
    const residentFilePath = path.join(stateDir, "agents", "coder", "sessions", `${safeConversationId}.jsonl`);
    const globalFilePath = path.join(stateDir, "sessions", `${safeConversationId}.jsonl`);

    await waitFor(() => fs.existsSync(residentFilePath));
    expect(fs.existsSync(residentFilePath)).toBe(true);
    expect(fs.existsSync(globalFilePath)).toBe(false);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("resident agent session migrates legacy global session files into agent workspace sessions", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    memoryMode: "isolated",
    sessionNamespace: "coder-main",
    workspaceBinding: "current",
    workspaceDir: "coder",
  });

  const conversationId = "agent:coder:main";
  const safeConversationId = toSafeConversationFileIdForTest(conversationId);
  const legacyStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  legacyStore.addMessage(conversationId, "user", "legacy coder history", {
    agentId: "coder",
    channel: "webchat",
  });
  await legacyStore.waitForPendingPersistence(conversationId);

  const globalFilePath = path.join(stateDir, "sessions", `${safeConversationId}.jsonl`);
  expect(fs.existsSync(globalFilePath)).toBe(true);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
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
      id: "resident-session-ensure-migration",
      method: "agent.session.ensure",
      params: {
        agentId: "coder",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "resident-session-ensure-migration" && f.ok === true));
    const ensureRes = frames.find((f) => f.type === "res" && f.id === "resident-session-ensure-migration");
    expect(ensureRes.payload).toMatchObject({
      agentId: "coder",
      kind: "resident",
      workspaceBinding: "current",
      sessionNamespace: "coder-main",
      memoryMode: "isolated",
      conversationId,
      exists: true,
    });

    const residentFilePath = path.join(stateDir, "agents", "coder", "sessions", `${safeConversationId}.jsonl`);
    await waitFor(() => fs.existsSync(residentFilePath));
    expect(fs.existsSync(residentFilePath)).toBe(true);
    expect(fs.existsSync(globalFilePath)).toBe(false);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("resident agent memory managers use isolated sqlite files", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    workspaceDir: "coder",
  });

  try {
    createScopedMemoryManagers({
      stateDir,
      agentRegistry: registry,
      modelsDir: path.join(stateDir, "models"),
      conversationStore: new ConversationStore({
        dataDir: path.join(stateDir, "sessions"),
      }),
      indexerOptions: {
        ignorePatterns: ["node_modules", ".git"],
        extensions: [".md", ".txt", ".jsonl"],
        watch: false,
      },
    });

    const defaultManager = getGlobalMemoryManager();
    const coderManager = getGlobalMemoryManager({ agentId: "coder" });
    const sharedManager = getGlobalMemoryManager({ workspaceRoot: resolveResidentSharedStateDir(stateDir) });

    expect(defaultManager).toBeTruthy();
    expect(coderManager).toBeTruthy();
    expect(sharedManager).toBeTruthy();
    expect(coderManager).not.toBe(defaultManager);
    expect(sharedManager).not.toBe(defaultManager);
    expect(sharedManager).not.toBe(coderManager);

    const defaultDbPath = path.join(stateDir, "memory.sqlite");
    const coderDbPath = path.join(stateDir, "agents", "coder", "memory.sqlite");
    await waitFor(() => fs.existsSync(defaultDbPath) && fs.existsSync(coderDbPath));
    expect(fs.existsSync(defaultDbPath)).toBe(true);
    expect(fs.existsSync(coderDbPath)).toBe(true);
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("resident agent durable memories write into agent workspace memory directory", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
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
    workspaceDir: "coder",
  });

  try {
    createScopedMemoryManagers({
      stateDir,
      agentRegistry: registry,
      modelsDir: path.join(stateDir, "models"),
      conversationStore: new ConversationStore({
        dataDir: path.join(stateDir, "sessions"),
      }),
      indexerOptions: {
        ignorePatterns: ["node_modules", ".git"],
        extensions: [".md", ".txt", ".jsonl"],
        watch: false,
      },
    });

    const coderManager = getGlobalMemoryManager({ agentId: "coder" }) as any;
    expect(coderManager).toBeTruthy();

    coderManager.evolutionEnabled = true;
    coderManager.evolutionMinMessages = 1;
    coderManager.callLLMForExtraction = vi.fn(async () => [
      {
        type: "fact",
        content: "Coder prefers precise patches",
        category: "preference",
      },
    ]);

    const result = await coderManager.extractMemoriesFromConversation("agent:coder:main", [
      { role: "user", content: "记住 coder 的长期偏好。" },
      { role: "assistant", content: "好的，我来提取长期记忆。" },
    ], {
      sourceConversationId: "agent:coder:main",
    });

    expect(result.count).toBe(1);
    const today = formatLocalDateForTest(new Date());
    const coderMemoryFile = path.join(stateDir, "agents", "coder", "memory", `${today}.md`);
    const rootMemoryFile = path.join(stateDir, "memory", `${today}.md`);

    await waitFor(() => fs.existsSync(coderMemoryFile));
    expect(fs.existsSync(coderMemoryFile)).toBe(true);
    expect(fs.existsSync(rootMemoryFile)).toBe(false);
    const content = await fs.promises.readFile(coderMemoryFile, "utf-8");
    expect(content).toContain("Coder prefers precise patches");
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("agents.prompt.inspect returns prompt text and section metadata", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const registry = new AgentRegistry(() => new MockAgent());
  const inspectAgentPrompt = vi.fn(async ({ agentId, conversationId, runId }: {
    agentId?: string;
    conversationId?: string;
    runId?: string;
  }) => ({
    scope: "run" as const,
    agentId: agentId ?? "default",
    conversationId,
    runId,
    createdAt: 123,
    displayName: "Belldandy",
    model: "primary",
    text: "system prompt body",
    truncated: false,
    totalChars: 18,
    finalChars: 18,
    sections: [
      {
        id: "core",
        label: "core",
        source: "core" as const,
        priority: 0,
        text: "system prompt body",
        charLength: 18,
        estimatedChars: 18,
        estimatedTokens: 5,
      },
    ],
    droppedSections: [],
    messages: [
      {
        role: "system",
        content: "system prompt body",
      },
    ],
    metadata: {
      includesHookSystemPrompt: true,
    },
  }));
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "primary",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    inspectAgentPrompt,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
    ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
    await waitFor(() => frames.some((f) => f.type === "hello-ok"));
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "agents-prompt-inspect",
      method: "agents.prompt.inspect",
      params: { agentId: "default", conversationId: "conv-1", runId: "run-1" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "agents-prompt-inspect"));

    const res = frames.find((f) => f.type === "res" && f.id === "agents-prompt-inspect");
    expect(res.ok).toBe(true);
    expect(res.payload).toMatchObject({
      scope: "run",
      agentId: "default",
      conversationId: "conv-1",
      runId: "run-1",
      text: "system prompt body",
      truncated: false,
      sections: [
        expect.objectContaining({
          id: "core",
          source: "core",
          charLength: 18,
          estimatedChars: 18,
          estimatedTokens: 5,
        }),
      ],
      droppedSections: [],
      messages: [
        expect.objectContaining({
          role: "system",
          content: "system prompt body",
        }),
      ],
      metadata: {
        includesHookSystemPrompt: true,
      },
    });
    expect(inspectAgentPrompt).toHaveBeenCalledWith({
      agentId: "default",
      conversationId: "conv-1",
      runId: "run-1",
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.prompt_snapshot.get returns persisted snapshot artifact", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    getConversationPromptSnapshot: async ({ conversationId, runId }) => ({
      schemaVersion: 1,
      manifest: {
        conversationId,
        runId: runId ?? "run-1",
        agentId: "default",
        createdAt: 123,
        persistedAt: 456,
        source: "runtime.prompt_snapshot",
      },
      summary: {
        messageCount: 2,
        systemPromptChars: 18,
        includesHookSystemPrompt: true,
        hasPrependContext: false,
        deltaCount: 0,
        deltaChars: 0,
        systemPromptEstimatedTokens: 5,
        deltaEstimatedTokens: 0,
        providerNativeSystemBlockCount: 0,
        providerNativeSystemBlockChars: 0,
        providerNativeSystemBlockEstimatedTokens: 0,
        tokenBreakdown: {
          systemPromptEstimatedChars: 18,
          systemPromptEstimatedTokens: 5,
          sectionEstimatedChars: 0,
          sectionEstimatedTokens: 0,
          droppedSectionEstimatedChars: 0,
          droppedSectionEstimatedTokens: 0,
          deltaEstimatedChars: 0,
          deltaEstimatedTokens: 0,
          providerNativeSystemBlockEstimatedChars: 0,
          providerNativeSystemBlockEstimatedTokens: 0,
        },
      },
      snapshot: {
        systemPrompt: "system prompt body",
        messages: [
          { role: "system", content: "system prompt body" },
          { role: "user", content: "hello" },
        ],
        hookSystemPromptUsed: true,
      },
    }),
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
      id: "conversation-prompt-snapshot-get",
      method: "conversation.prompt_snapshot.get",
      params: { conversationId: "conv-1", runId: "run-1" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "conversation-prompt-snapshot-get"));

    const res = frames.find((f) => f.type === "res" && f.id === "conversation-prompt-snapshot-get");
    expect(res.ok).toBe(true);
    expect(res.payload?.snapshot).toMatchObject({
      manifest: {
        conversationId: "conv-1",
        runId: "run-1",
        agentId: "default",
      },
      summary: {
        messageCount: 2,
        includesHookSystemPrompt: true,
      },
      snapshot: {
        systemPrompt: "system prompt body",
      },
    });

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-prompt-snapshot", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-prompt-snapshot" && f.ok === true));

    const doctorRes = frames.find((f) => f.type === "res" && f.id === "system-doctor-prompt-snapshot");
    const traces = doctorRes.payload?.queryRuntime?.traces ?? [];
    const trace = traces.find((item: any) => item.method === "conversation.prompt_snapshot.get" && item.conversationId === "conv-1");

    expect(trace).toMatchObject({
      method: "conversation.prompt_snapshot.get",
      status: "completed",
      conversationId: "conv-1",
    });
    expect(trace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "request_validated",
      "prompt_snapshot_loaded",
      "completed",
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes tool behavior observability summary", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("run_command"),
      createContractedTestTool("apply_patch"),
      createContractedTestTool("delegate_task"),
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

    ws.send(JSON.stringify({
      type: "req",
      id: "system-doctor-tool-behavior",
      method: "system.doctor",
      params: {
        toolAgentId: "default",
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-tool-behavior" && f.ok === true));

    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-tool-behavior");
    expect(response.payload?.toolBehaviorObservability).toMatchObject({
      requested: {
        agentId: "default",
      },
      visibilityContext: {
        agentId: "default",
        conversationId: null,
      },
      counts: {
        visibleToolContractCount: 3,
        includedContractCount: 3,
        behaviorContractCount: 3,
      },
      included: ["run_command", "apply_patch", "delegate_task"],
    });
    expect(response.payload?.toolBehaviorObservability?.contracts?.run_command).toMatchObject({
      useWhen: expect.any(Array),
      fallbackStrategy: expect.any(Array),
    });
    expect(response.payload?.toolBehaviorObservability?.summary).toContain("## run_command");
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "tool_behavior_observability",
        status: "pass",
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("message.send forwards modelId to AgentRegistry.create as modelOverride", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const capturedOverrides: Array<string | undefined> = [];
  const registry = new AgentRegistry((_profile, opts): BelldandyAgent => {
    capturedOverrides.push(opts?.modelOverride);
    return new MockAgent();
  });
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "primary",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    const reqId = "model-override";
    ws.send(JSON.stringify({
      type: "req",
      id: reqId,
      method: "message.send",
      params: {
        text: "hello",
        modelId: "kimi-k2.5",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId && f.ok === true));
    expect(capturedOverrides).toContain("kimi-k2.5");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => { });
  }
});

test("message.send reuses conversation snapshot to avoid one extra conversationStore.get on hot path", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "conv-hot-path";
  conversationStore.addMessage(conversationId, "assistant", "previous", {
    agentId: "default",
  });

  const getSpy = vi.spyOn(conversationStore, "get");
  const agent: BelldandyAgent = {
    async *run(input) {
      yield { type: "final" as const, text: `reply:${input.text}` };
      yield { type: "status", status: "done" as const };
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
    agentFactory: () => agent,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "message-send-hot-path",
      method: "message.send",
      params: {
        conversationId,
        text: "hello",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "message-send-hot-path" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));
    // The request path should reuse the loaded conversation snapshot; a post-final digest refresh may add one async read.
    expect(getSpy.mock.calls.length).toBeLessThanOrEqual(3);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => { });
  }
});

test("message.send emits auto run token result and conversation.meta returns persisted records", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const agent: BelldandyAgent = {
    async *run(input) {
      yield { type: "status", status: "running" as const };
      yield {
        type: "usage" as const,
        systemPromptTokens: 3,
        contextTokens: 7,
        inputTokens: 12,
        outputTokens: 8,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        modelCalls: 1,
      };
      yield { type: "final" as const, text: `echo:${input.text}` };
      yield { type: "status" as const, status: "done" };
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentFactory: () => agent,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    const conversationId = "conv-token-auto";
    const reqId = "token-auto";
    ws.send(JSON.stringify({
      type: "req",
      id: reqId,
      method: "message.send",
      params: { text: "统计一下", conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "token.counter.result"));

    const taskEvent = frames.find((f) => f.type === "event" && f.event === "token.counter.result");
    expect(taskEvent.payload).toMatchObject({
      conversationId,
      name: "run",
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      auto: true,
    });

    const metaReqId = "conversation-meta";
    ws.send(JSON.stringify({
      type: "req",
      id: metaReqId,
      method: "conversation.meta",
      params: { conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === metaReqId && f.ok === true));
    const metaRes = frames.find((f) => f.type === "res" && f.id === metaReqId);
    expect(metaRes.payload.taskTokenResults).toHaveLength(1);
    expect(metaRes.payload.taskTokenResults[0]).toMatchObject({
      name: "run",
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      auto: true,
    });
    expect(metaRes.payload.messages).toHaveLength(2);
    expect(metaRes.payload.messages[0]).toMatchObject({
      role: "user",
      content: "统计一下",
    });
    expect(metaRes.payload.messages[1]).toMatchObject({
      role: "assistant",
      content: "echo:统计一下",
      isLatest: true,
    });
    expect(typeof metaRes.payload.messages[0].timestampMs).toBe("number");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.meta keeps time metadata on every message and marks only the newest message as latest", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const agent: BelldandyAgent = {
    async *run(input) {
      yield { type: "final" as const, text: `echo:${input.text}` };
      yield { type: "status" as const, status: "done" };
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentFactory: () => agent,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    const conversationId = "conv-meta-latest";

    ws.send(JSON.stringify({
      type: "req",
      id: "message-meta-1",
      method: "message.send",
      params: { text: "第一轮", conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "message-meta-1" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final" && f.payload?.text === "echo:第一轮"));

    const firstSendRes = frames.find((f) => f.type === "res" && f.id === "message-meta-1");
    const firstFinal = frames.find((f) => f.type === "event" && f.event === "chat.final" && f.payload?.text === "echo:第一轮");
    expect(firstSendRes.payload.messageMeta).toMatchObject({
      isLatest: true,
    });
    expect(firstFinal.payload.messageMeta).toMatchObject({
      isLatest: true,
    });
    expect(typeof firstSendRes.payload.messageMeta?.timestampMs).toBe("number");
    expect(typeof firstFinal.payload.messageMeta?.timestampMs).toBe("number");
    expect(String(firstSendRes.payload.messageMeta?.displayTimeText ?? "").length).toBeGreaterThan(0);
    expect(String(firstFinal.payload.messageMeta?.displayTimeText ?? "").length).toBeGreaterThan(0);

    frames.length = 0;

    ws.send(JSON.stringify({
      type: "req",
      id: "message-meta-2",
      method: "message.send",
      params: { text: "第二轮", conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "message-meta-2" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final" && f.payload?.text === "echo:第二轮"));

    const metaReqId = "conversation-meta-latest";
    ws.send(JSON.stringify({
      type: "req",
      id: metaReqId,
      method: "conversation.meta",
      params: { conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === metaReqId && f.ok === true));
    const metaRes = frames.find((f) => f.type === "res" && f.id === metaReqId);
    const messages = metaRes.payload.messages;

    expect(messages).toHaveLength(4);
    for (const message of messages) {
      expect(typeof message.timestampMs).toBe("number");
      expect(String(message.displayTimeText ?? "").length).toBeGreaterThan(0);
    }

    expect(messages).toMatchObject([
      { role: "user", content: "第一轮", isLatest: false },
      { role: "assistant", content: "echo:第一轮", isLatest: false },
      { role: "user", content: "第二轮", isLatest: false },
      { role: "assistant", content: "echo:第二轮", isLatest: true },
    ]);
    expect(messages.filter((message: { isLatest: boolean }) => message.isLatest)).toHaveLength(1);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.restore returns transcript-based restore view after meta is missing", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-restore",
  });
  const conversationId = "conv-restore-rpc";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
  await conversationStore.forceCompact(conversationId);
  await fs.promises.rm(path.join(stateDir, "sessions", `${conversationId}.meta.json`), { force: true }).catch(() => {});

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "conversation-restore",
      method: "conversation.restore",
      params: { conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "conversation-restore" && f.ok === true));
    const restoreRes = frames.find((f) => f.type === "res" && f.id === "conversation-restore");

    expect(restoreRes.payload.restore).toMatchObject({
      conversationId,
      diagnostics: {
        source: "transcript",
        transcriptUsed: true,
        relinkApplied: true,
      },
      canonicalExtractionView: [
        { role: "user", content: "A".repeat(80) },
        { role: "assistant", content: "B".repeat(80) },
        { role: "user", content: "C".repeat(80) },
        { role: "assistant", content: "D".repeat(80) },
      ],
    });
    expect(restoreRes.payload.restore.compactedView[0].content).toContain("rolling-summary-restore");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.transcript.export returns redacted transcript bundle after meta is missing", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-export",
  });
  const conversationId = "conv-transcript-export-rpc";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80), {
    agentId: "belldandy",
    channel: "webchat",
    clientContext: {
      sentAtMs: 1712000000002,
      locale: "zh-CN",
    },
  });
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80), {
    agentId: "belldandy",
  });
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
  await conversationStore.forceCompact(conversationId);
  await fs.promises.rm(path.join(stateDir, "sessions", `${conversationId}.meta.json`), { force: true }).catch(() => {});

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "conversation-transcript-export",
      method: "conversation.transcript.export",
      params: { conversationId, mode: "shareable" },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "conversation-transcript-export" && f.ok === true));
    const exportRes = frames.find((f) => f.type === "res" && f.id === "conversation-transcript-export");

    expect(exportRes.payload.export).toMatchObject({
      manifest: {
        conversationId,
        source: "conversation.transcript.export",
        redactionMode: "shareable",
      },
      summary: {
        eventCount: 5,
        messageEventCount: 4,
        compactBoundaryCount: 1,
        partialCompactionViewCount: 0,
        restore: {
          source: "transcript",
          relinkApplied: true,
          fallbackToRaw: false,
        },
      },
      redaction: {
        mode: "shareable",
        contentRedacted: true,
      },
    });
    expect(exportRes.payload.export.restore.canonicalExtractionView).toEqual([
      {
        role: "user",
        contentPreview: "A".repeat(80),
        contentLength: 80,
        contentTruncated: false,
      },
      {
        role: "assistant",
        contentPreview: "B".repeat(80),
        contentLength: 80,
        contentTruncated: false,
      },
      {
        role: "user",
        contentPreview: "C".repeat(80),
        contentLength: 80,
        contentTruncated: false,
      },
      {
        role: "assistant",
        contentPreview: "D".repeat(80),
        contentLength: 80,
        contentTruncated: false,
      },
    ]);
    expect(exportRes.payload.export.restore.compactedView[0].contentPreview).toContain("rolling-summary-export");
    expect(exportRes.payload.export.events[0].payload.message.clientContext).toBeUndefined();
    expect(exportRes.payload.export.events[0].payload.conversation).toBeUndefined();

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-transcript-export", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-transcript-export" && f.ok === true));
    const doctorRes = frames.find((f) => f.type === "res" && f.id === "system-doctor-transcript-export");
    const traces = doctorRes.payload?.queryRuntime?.traces ?? [];
    const exportTrace = traces.find((item: any) => item.method === "conversation.transcript.export" && item.conversationId === conversationId);

    expect(exportTrace).toMatchObject({
      method: "conversation.transcript.export",
      status: "completed",
      conversationId,
    });
    expect(exportTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "request_validated",
      "transcript_export_built",
      "completed",
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.timeline.get returns readable projection for transcript partial compaction", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "timeline-summary-partial",
  });
  const conversationId = "conv-timeline-rpc";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
  conversationStore.addMessage(conversationId, "user", "E".repeat(80));
  const messageIds = conversationStore.get(conversationId)?.messages.map((message) => message.id) ?? [];
  await conversationStore.forcePartialCompact(conversationId, {
    direction: "from",
    pivotMessageId: messageIds[1],
  });
  await fs.promises.rm(path.join(stateDir, "sessions", `${conversationId}.meta.json`), { force: true }).catch(() => {});

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "conversation-timeline-get",
      method: "conversation.timeline.get",
      params: { conversationId, previewChars: 48 },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "conversation-timeline-get" && f.ok === true));
    const timelineRes = frames.find((f) => f.type === "res" && f.id === "conversation-timeline-get");

    expect(timelineRes.payload.timeline).toMatchObject({
      manifest: {
        conversationId,
        source: "conversation.timeline.get",
      },
      summary: {
        eventCount: 7,
        itemCount: 8,
        messageCount: 5,
        compactBoundaryCount: 1,
        partialCompactionCount: 1,
        restore: {
          source: "transcript",
          relinkApplied: true,
          fallbackToRaw: false,
        },
      },
      warnings: [],
    });
    expect(timelineRes.payload.timeline.items.some((item: any) => item.kind === "partial_compaction" && item.direction === "from")).toBe(true);
    expect(timelineRes.payload.timeline.items.some((item: any) => item.kind === "compact_boundary" && item.trigger === "partial_from")).toBe(true);
    expect(timelineRes.payload.timeline.items[timelineRes.payload.timeline.items.length - 1]).toMatchObject({
      kind: "restore_result",
      source: "transcript",
      relinkApplied: true,
      partialViewId: expect.any(String),
    });

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-timeline", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-timeline" && f.ok === true));
    const doctorRes = frames.find((f) => f.type === "res" && f.id === "system-doctor-timeline");
    const traces = doctorRes.payload?.queryRuntime?.traces ?? [];
    const timelineTrace = traces.find((item: any) => item.method === "conversation.timeline.get" && item.conversationId === conversationId);

    expect(timelineTrace).toMatchObject({
      method: "conversation.timeline.get",
      status: "completed",
      conversationId,
    });
    expect(timelineTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "request_validated",
      "timeline_built",
      "completed",
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor can include on-demand conversation transcript export and timeline", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "conv-doctor-conversation-debug";
  conversationStore.addMessage(conversationId, "user", "doctor timeline user");
  conversationStore.addMessage(conversationId, "assistant", "doctor timeline assistant");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "system-doctor-conversation-debug",
      method: "system.doctor",
      params: {
        conversationId,
        includeTranscript: true,
        includeTimeline: true,
        timelinePreviewChars: 32,
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-conversation-debug" && f.ok === true));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-conversation-debug");

    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "conversation_debug",
        status: "pass",
        message: expect.stringContaining(conversationId),
      }),
    ]));
    expect(response.payload?.conversationDebug).toMatchObject({
      conversationId,
      available: true,
      messageCount: 2,
      requested: {
        includeTranscript: true,
        includeTimeline: true,
        timelinePreviewChars: 32,
      },
      transcriptExport: {
        manifest: {
          conversationId,
          redactionMode: "internal",
        },
      },
      timeline: {
        manifest: {
          conversationId,
          source: "conversation.timeline.get",
        },
      },
    });
    expect(response.payload?.conversationDebug?.timeline?.summary?.messageCount).toBe(2);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor applies lightweight conversation debug filters", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "conv-doctor-conversation-filter";
  conversationStore.addMessage(conversationId, "user", "doctor filter user");
  conversationStore.addMessage(conversationId, "assistant", "doctor filter assistant");
  await conversationStore.waitForPendingPersistence(conversationId);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "system-doctor-conversation-filter",
      method: "system.doctor",
      params: {
        conversationId,
        includeTranscript: true,
        includeTimeline: true,
        transcriptEventTypes: ["assistant_message_finalized"],
        transcriptRestoreView: "canonical",
        timelineKinds: ["restore_result"],
        timelineLimit: 1,
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-conversation-filter" && f.ok === true));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-conversation-filter");

    expect(response.payload?.conversationDebug).toMatchObject({
      conversationId,
      requested: {
        includeTranscript: true,
        includeTimeline: true,
        transcriptEventTypes: ["assistant_message_finalized"],
        transcriptRestoreView: "canonical",
        timelineKinds: ["restore_result"],
        timelineLimit: 1,
      },
    });
    expect(response.payload?.conversationDebug?.transcriptExport?.events).toHaveLength(1);
    expect(response.payload?.conversationDebug?.transcriptExport?.projectionSummary).toMatchObject({
      visibleEventCount: 1,
      visibleRawMessageCount: 0,
      visibleCanonicalExtractionCount: 2,
    });
    expect(response.payload?.conversationDebug?.timeline?.items).toHaveLength(1);
    expect(response.payload?.conversationDebug?.timeline?.items[0]?.kind).toBe("restore_result");
    expect(response.payload?.conversationDebug?.timeline?.projectionSummary).toMatchObject({
      visibleItemCount: 1,
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor can expose conversation catalog and recent export index", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "conv-doctor-catalog-alpha";
  conversationStore.addMessage(conversationId, "user", "doctor catalog user");
  await conversationStore.waitForPendingPersistence(conversationId);
  await recordConversationArtifactExport({
    stateDir,
    conversationId,
    artifact: "transcript",
    format: "json",
    outputPath: path.join(stateDir, "artifacts", "conversation-alpha.transcript.json"),
    mode: "internal",
    projectionFilter: { restoreView: "all" },
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "system-doctor-conversation-catalog",
      method: "system.doctor",
      params: {
        includeConversationCatalog: true,
        includeRecentExports: true,
        conversationIdPrefix: "conv-doctor-catalog-",
        conversationListLimit: 10,
        recentExportLimit: 10,
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-conversation-catalog" && f.ok === true));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-conversation-catalog");

    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "conversation_catalog", status: "pass" }),
      expect.objectContaining({ id: "conversation_export_index", status: "pass" }),
    ]));
    expect(response.payload?.conversationCatalog?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationId,
        hasTranscript: true,
      }),
    ]));
    expect(response.payload?.recentConversationExports?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationId,
        artifact: "transcript",
        format: "json",
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("context.compact returns boundary metadata and conversation.meta exposes persisted compact boundaries", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-v1",
  });
  const conversationId = "conv-meta-boundary";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "context-compact-boundary",
      method: "context.compact",
      params: { conversationId },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "context-compact-boundary" && f.ok === true));
    const compactRes = frames.find((f) => f.type === "res" && f.id === "context-compact-boundary");

    expect(compactRes.payload).toMatchObject({
      compacted: true,
      tier: "rolling",
      boundary: {
        trigger: "manual",
        summaryStateVersion: 1,
        compactedMessageCount: 3,
        preservedSegment: {
          preservedMessageCount: 1,
        },
      },
    });
    expect(typeof compactRes.payload?.boundary?.preservedSegment?.anchorId).toBe("string");
    expect(typeof compactRes.payload?.boundary?.preservedSegment?.headMessageId).toBe("string");
    expect(typeof compactRes.payload?.boundary?.preservedSegment?.tailMessageId).toBe("string");

    ws.send(JSON.stringify({
      type: "req",
      id: "conversation-meta-boundary",
      method: "conversation.meta",
      params: { conversationId },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "conversation-meta-boundary" && f.ok === true));
    const metaRes = frames.find((f) => f.type === "res" && f.id === "conversation-meta-boundary");

    expect(metaRes.payload?.messages).toHaveLength(4);
    expect(metaRes.payload?.messages.every((message: { id?: string }) => typeof message.id === "string" && message.id.length > 0)).toBe(true);
    expect(metaRes.payload?.compactBoundaries?.[0]).toMatchObject({
      id: compactRes.payload?.boundary?.id,
      trigger: "manual",
      compactedMessageCount: 3,
      preservedSegment: {
        anchorId: compactRes.payload?.boundary?.preservedSegment?.anchorId,
        headMessageId: compactRes.payload?.boundary?.preservedSegment?.headMessageId,
        tailMessageId: compactRes.payload?.boundary?.preservedSegment?.tailMessageId,
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("context.compact.partial persists partial from boundary metadata", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "partial-from-summary",
  });
  const conversationId = "conv-meta-partial-boundary";

  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
  conversationStore.addMessage(conversationId, "user", "E".repeat(80));
  const messageIds = conversationStore.get(conversationId)?.messages.map((message) => message.id) ?? [];

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "context-compact-partial-boundary",
      method: "context.compact.partial",
      params: {
        conversationId,
        direction: "from",
        pivotMessageId: messageIds[1],
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "context-compact-partial-boundary"));
    const compactRes = frames.find((f) => f.type === "res" && f.id === "context-compact-partial-boundary");

    expect(compactRes?.ok).toBe(true);
    expect(compactRes.payload).toMatchObject({
      compacted: true,
      direction: "from",
      tier: "rolling",
      boundary: {
        trigger: "partial_from",
        compactedMessageCount: 3,
        preservedSegment: {
          anchorId: messageIds[1],
          headMessageId: messageIds[0],
          tailMessageId: messageIds[1],
          preservedMessageCount: 2,
        },
      },
    });
    expect(conversationStore.getPartialCompactionView(conversationId)).toMatchObject({
      direction: "from",
      pivotMessageId: messageIds[1],
      compactedMessageCount: 5,
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "conversation-meta-partial-boundary",
      method: "conversation.meta",
      params: { conversationId },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "conversation-meta-partial-boundary" && f.ok === true));
    const metaRes = frames.find((f) => f.type === "res" && f.id === "conversation-meta-partial-boundary");

    expect(metaRes.payload?.messages).toHaveLength(5);
    expect(metaRes.payload?.compactBoundaries?.[0]).toMatchObject({
      id: compactRes.payload?.boundary?.id,
      trigger: "partial_from",
      compactedMessageCount: 3,
      preservedSegment: {
        anchorId: messageIds[1],
        headMessageId: messageIds[0],
        tailMessageId: messageIds[1],
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.digest.get and conversation.digest.refresh expose session digest runtime", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-v1",
  });
  const conversationId = "conv-session-digest";

  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
    agentFactory: () => ({
      async *run(input) {
        yield { type: "final" as const, text: `echo:${input.text}` };
        yield { type: "status" as const, status: "done" };
      },
    }),
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    const getReqId = "conversation-digest-get";
    ws.send(JSON.stringify({
      type: "req",
      id: getReqId,
      method: "conversation.digest.get",
      params: { conversationId, threshold: 2 },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === getReqId && f.ok === true));
    const getRes = frames.find((f) => f.type === "res" && f.id === getReqId);
    expect(getRes.payload.digest).toMatchObject({
      conversationId,
      status: "updated",
      messageCount: 3,
      digestedMessageCount: 0,
      pendingMessageCount: 3,
      threshold: 2,
      rollingSummary: "",
      archivalSummary: "",
      lastDigestAt: 0,
    });

    const refreshReqId = "conversation-digest-refresh";
    ws.send(JSON.stringify({
      type: "req",
      id: refreshReqId,
      method: "conversation.digest.refresh",
      params: { conversationId, threshold: 2 },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === refreshReqId && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "conversation.digest.updated" && f.payload?.conversationId === conversationId));
    const refreshRes = frames.find((f) => f.type === "res" && f.id === refreshReqId);
    const refreshEvent = frames.find((f) => f.type === "event" && f.event === "conversation.digest.updated" && f.payload?.conversationId === conversationId);
    expect(refreshRes.payload).toMatchObject({
      updated: true,
      compacted: false,
      digest: {
        conversationId,
        status: "ready",
        messageCount: 3,
        digestedMessageCount: 3,
        pendingMessageCount: 0,
        threshold: 2,
        rollingSummary: "rolling-summary-v1",
        archivalSummary: "",
      },
    });
    expect(typeof refreshRes.payload.digest.lastDigestAt).toBe("number");
    expect(refreshRes.payload.digest.lastDigestAt).toBeGreaterThan(0);
    expect(refreshEvent.payload).toMatchObject({
      source: "manual",
      updated: true,
      compacted: false,
      digest: {
        conversationId,
        status: "ready",
        threshold: 2,
      },
    });

    frames.length = 0;
    const sendReqId = "conversation-digest-auto";
    ws.send(JSON.stringify({
      type: "req",
      id: sendReqId,
      method: "message.send",
      params: { text: "继续", conversationId },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === sendReqId && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final" && f.payload?.conversationId === conversationId));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "conversation.digest.updated" && f.payload?.conversationId === conversationId));

    const autoDigestEvent = frames.find((f) => f.type === "event" && f.event === "conversation.digest.updated" && f.payload?.conversationId === conversationId);
    expect(autoDigestEvent.payload).toMatchObject({
      source: "message.send",
      digest: {
        conversationId,
        threshold: 2,
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.memory.extraction.get and conversation.memory.extract expose durable extraction runtime", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-extraction-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-v2",
  });
  const conversationId = "conv-durable-extraction";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));

  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    evolutionEnabled: true,
    evolutionModel: "test-evolution-model",
    evolutionBaseUrl: "https://example.invalid/v1",
    evolutionApiKey: "test-evolution-key",
    evolutionMinMessages: 3,
  });
  (memoryManager as any).embeddingProvider = {
    modelName: "test-durable-extraction",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };
  const extractionSpy = vi.spyOn(memoryManager as any, "callLLMForExtraction").mockResolvedValue([
    {
      type: "事实",
      category: "fact",
      content: "Week 8 durable extraction 已经进入独立运行时。",
    },
  ]);
  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "durable-extraction-get-idle",
      method: "conversation.memory.extraction.get",
      params: { conversationId, threshold: 2 },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-extraction-get-idle"));
    const idleRes = frames.find((f) => f.type === "res" && f.id === "durable-extraction-get-idle");
    expect(idleRes.ok).toBe(true);
    expect(idleRes.payload.extraction).toMatchObject({
      conversationId,
      status: "idle",
      runCount: 0,
      pending: false,
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "durable-extraction-refresh",
      method: "conversation.digest.refresh",
      params: { conversationId, threshold: 2 },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-extraction-refresh" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "conversation.memory.extraction.updated" && f.payload?.conversationId === conversationId && f.payload?.extraction?.status === "completed"));

    const completedEvent = frames.find((f) => f.type === "event" && f.event === "conversation.memory.extraction.updated" && f.payload?.conversationId === conversationId && f.payload?.extraction?.status === "completed");
    expect(completedEvent.payload.extraction).toMatchObject({
      conversationId,
      status: "completed",
      runCount: 1,
      lastExtractedMemoryCount: 1,
    });
    expect(extractionSpy).toHaveBeenCalledTimes(1);

    ws.send(JSON.stringify({
      type: "req",
      id: "durable-extraction-get-completed",
      method: "conversation.memory.extraction.get",
      params: { conversationId, threshold: 2 },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-extraction-get-completed"));
    const completedRes = frames.find((f) => f.type === "res" && f.id === "durable-extraction-get-completed");
    expect(completedRes.ok).toBe(true);
    expect(completedRes.payload.extraction).toMatchObject({
      conversationId,
      status: "completed",
      runCount: 1,
      lastExtractedMemoryCount: 1,
      lastRunSource: "manual",
    });
    expect(completedRes.payload.extraction.lastExtractedDigestAt).toBeGreaterThan(0);

    ws.send(JSON.stringify({
      type: "req",
      id: "durable-extraction-manual",
      method: "conversation.memory.extract",
      params: { conversationId, threshold: 2 },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-extraction-manual"));
    const manualRes = frames.find((f) => f.type === "res" && f.id === "durable-extraction-manual");
    expect(manualRes.ok).toBe(true);
    expect(manualRes.payload.extraction).toMatchObject({
      conversationId,
      status: "completed",
      lastSkipReason: "up_to_date",
      runCount: 1,
    });
    expect(extractionSpy).toHaveBeenCalledTimes(1);
  } finally {
    ws.close();
    await closeP;
    extractionSpy.mockRestore();
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.memory.extract uses canonical extraction view from transcript restore when meta is missing", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-extraction-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-canonical",
  });
  const conversationId = "conv-durable-canonical";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
  await conversationStore.forceCompact(conversationId);
  await fs.promises.rm(path.join(stateDir, "sessions", `${conversationId}.meta.json`), { force: true }).catch(() => {});

  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    evolutionEnabled: true,
    evolutionModel: "test-evolution-model",
    evolutionBaseUrl: "https://example.invalid/v1",
    evolutionApiKey: "test-evolution-key",
    evolutionMinMessages: 3,
  });
  (memoryManager as any).embeddingProvider = {
    modelName: "test-durable-extraction",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };
  const extractSpy = vi.spyOn(memoryManager, "extractMemoriesFromConversation");
  const llmSpy = vi.spyOn(memoryManager as any, "callLLMForExtraction").mockResolvedValue([
    {
      type: "事实",
      category: "fact",
      content: "恢复视图已经成为 durable extraction 的输入。",
    },
  ]);
  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
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
      id: "durable-canonical-extract",
      method: "conversation.memory.extract",
      params: { conversationId, threshold: 2, refreshDigest: true },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-canonical-extract" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "conversation.memory.extraction.updated" && f.payload?.conversationId === conversationId && f.payload?.extraction?.status === "completed"));

    expect(extractSpy).toHaveBeenCalled();
    const extractionMessages = extractSpy.mock.calls[0]?.[1];
    expect(extractionMessages).toEqual([
      { role: "user", content: "A".repeat(80) },
      { role: "assistant", content: "B".repeat(80) },
      { role: "user", content: "C".repeat(80) },
      { role: "assistant", content: "D".repeat(80) },
    ]);
    expect(llmSpy).toHaveBeenCalled();
    expect(String(llmSpy.mock.calls[0]?.[0] ?? "")).not.toContain("Understood. I have the context from our previous conversation.");
    expect(String(llmSpy.mock.calls[0]?.[0] ?? "")).not.toContain("rolling-summary-canonical");
  } finally {
    ws.close();
    await closeP;
    extractSpy.mockRestore();
    llmSpy.mockRestore();
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("gateway durable extraction scheduler reuses canonical extraction view instead of direct memory evolution extraction", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-evolution-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-evolution",
  });
  const conversationId = "conv-durable-evolution";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
  await conversationStore.forceCompact(conversationId);
  await fs.promises.rm(path.join(stateDir, "sessions", `${conversationId}.meta.json`), { force: true }).catch(() => {});

  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    evolutionEnabled: true,
    evolutionModel: "test-evolution-model",
    evolutionBaseUrl: "https://example.invalid/v1",
    evolutionApiKey: "test-evolution-key",
    evolutionMinMessages: 3,
  });
  (memoryManager as any).embeddingProvider = {
    modelName: "test-memory-evolution",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };
  const extractSpy = vi.spyOn(memoryManager, "extractMemoriesFromConversation");
  const llmSpy = vi.spyOn(memoryManager as any, "callLLMForExtraction").mockResolvedValue([
    {
      type: "事实",
      category: "fact",
      content: "统一调度已接管 memory evolution。",
    },
  ]);
  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
  });

  try {
    await server.requestDurableExtractionFromDigest({
      conversationId,
      source: "memory_evolution",
      threshold: 2,
      force: true,
    });

    await waitFor(() => extractSpy.mock.calls.length === 1);

    const extractionMessages = extractSpy.mock.calls[0]?.[1];
    expect(extractionMessages).toEqual([
      { role: "user", content: "A".repeat(80) },
      { role: "assistant", content: "B".repeat(80) },
      { role: "user", content: "C".repeat(80) },
      { role: "assistant", content: "D".repeat(80) },
    ]);
    expect(llmSpy).toHaveBeenCalled();
    expect(String(llmSpy.mock.calls[0]?.[0] ?? "")).not.toContain("Understood. I have the context from our previous conversation.");
    expect(String(llmSpy.mock.calls[0]?.[0] ?? "")).not.toContain("rolling-summary-evolution");
    const extractionRun = extractSpy.mock.results[0]?.value;
    if (extractionRun && typeof (extractionRun as Promise<unknown>).then === "function") {
      await extractionRun;
    }
  } finally {
    extractSpy.mockRestore();
    llmSpy.mockRestore();
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("conversation.digest.refresh records usage accounting and enforces session digest budget", async () => {
  await withEnv({
    BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS: "1",
    BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS: "60000",
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS: undefined,
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS: undefined,
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-digest-budget-"));
    const conversationStore = new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
      compaction: {
        enabled: true,
        tokenThreshold: 10,
        keepRecentCount: 1,
      },
      summarizer: async () => "rolling-summary-budget",
    });
    const conversationId = "conv-digest-budget";
    conversationStore.addMessage(conversationId, "user", "A".repeat(80));
    conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
    conversationStore.addMessage(conversationId, "user", "C".repeat(80));

    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      conversationStore,
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
        id: "digest-budget-first",
        method: "conversation.digest.refresh",
        params: { conversationId, threshold: 2 },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "digest-budget-first"));
      const firstRes = frames.find((f) => f.type === "res" && f.id === "digest-budget-first");
      expect(firstRes.ok).toBe(true);

      ws.send(JSON.stringify({
        type: "req",
        id: "digest-budget-second",
        method: "conversation.digest.refresh",
        params: { conversationId, threshold: 2, force: true },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "digest-budget-second"));
      const secondRes = frames.find((f) => f.type === "res" && f.id === "digest-budget-second");
      expect(secondRes.ok).toBe(false);
      expect(secondRes.error).toMatchObject({
        code: "session_digest_refresh_budget_exceeded",
      });

      const usageRaw = await fs.promises.readFile(path.join(stateDir, "memory-runtime", "usage-accounting.json"), "utf-8");
      const usageState = JSON.parse(usageRaw) as { events?: Array<{ consumer?: string; outcome?: string; metadata?: Record<string, unknown> }> };
      const digestEvents = (usageState.events ?? []).filter((item) => item.consumer === "session_digest_refresh");
      expect(digestEvents).toHaveLength(2);
      expect(digestEvents[0]).toMatchObject({
        consumer: "session_digest_refresh",
        outcome: "completed",
      });
      expect(digestEvents[1]).toMatchObject({
        consumer: "session_digest_refresh",
        outcome: "blocked",
        metadata: {
          reasonCode: "session_digest_refresh_budget_exceeded",
        },
      });
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("requestDurableExtractionFromDigest reuses current digest when session digest budget is exceeded", async () => {
  await withEnv({
    BELLDANDY_MEMORY_EVOLUTION_ENABLED: "true",
    BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS: "1",
    BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS: "60000",
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS: undefined,
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS: undefined,
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-durable-from-digest-budget-"));
    const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-durable-from-digest-workspace-"));
    const conversationStore = new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
      compaction: {
        enabled: true,
        tokenThreshold: 10,
        keepRecentCount: 1,
      },
      summarizer: async () => "rolling-summary-durable-from-digest",
    });
    const conversationId = "conv-durable-from-digest-budget";
    conversationStore.addMessage(conversationId, "user", "A".repeat(80));
    conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
    conversationStore.addMessage(conversationId, "user", "C".repeat(80));
    conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));

    const memoryManager = new MemoryManager({
      workspaceRoot,
      stateDir,
      evolutionEnabled: true,
      evolutionModel: "test-evolution-budget-fallback",
      evolutionBaseUrl: "https://example.invalid/v1",
      evolutionApiKey: "test-evolution-key",
      evolutionMinMessages: 3,
    });
    (memoryManager as any).embeddingProvider = {
      modelName: "test-evolution-budget-fallback",
      embed: async () => [0.1],
      embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
      embedQuery: async () => [0.1],
    };
    const extractSpy = vi.spyOn(memoryManager, "extractMemoriesFromConversation");
    const llmSpy = vi.spyOn(memoryManager as any, "callLLMForExtraction").mockResolvedValue([
      {
        type: "事实",
        category: "fact",
        content: "fallback digest snapshot still allows durable extraction scheduling",
      },
    ]);
    registerGlobalMemoryManager(memoryManager);

    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      conversationStore,
    });

    try {
      await conversationStore.refreshSessionDigest(conversationId, { threshold: 2 });

      await server.requestDurableExtractionFromDigest({
        conversationId,
        source: "memory_evolution",
        threshold: 2,
      });

      await waitFor(() => extractSpy.mock.calls.length === 1);
      expect(extractSpy).toHaveBeenCalledTimes(1);
      expect(llmSpy).toHaveBeenCalled();
    } finally {
      extractSpy.mockRestore();
      llmSpy.mockRestore();
      await server.close();
      memoryManager.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("durable extraction request limiter records blocked request usage and keeps prior extraction state", async () => {
  await withEnv({
    BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS: undefined,
    BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS: undefined,
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS: "1",
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS: "60000",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-durable-budget-"));
    const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-durable-budget-workspace-"));
    const conversationStore = new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
      compaction: {
        enabled: true,
        tokenThreshold: 10,
        keepRecentCount: 1,
      },
      summarizer: async () => "rolling-summary-durable-budget",
    });
    const conversationId = "conv-durable-budget";
    conversationStore.addMessage(conversationId, "user", "A".repeat(80));
    conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
    conversationStore.addMessage(conversationId, "user", "C".repeat(80));

    const memoryManager = new MemoryManager({
      workspaceRoot,
      stateDir,
      evolutionEnabled: true,
      evolutionModel: "test-evolution-model",
      evolutionBaseUrl: "https://example.invalid/v1",
      evolutionApiKey: "test-evolution-key",
      evolutionMinMessages: 3,
    });
    (memoryManager as any).embeddingProvider = {
      modelName: "test-durable-budget",
      embed: async () => [0.1],
      embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
      embedQuery: async () => [0.1],
    };
    const extractionSpy = vi.spyOn(memoryManager as any, "callLLMForExtraction").mockResolvedValue([
      {
        type: "事实",
        category: "fact",
        content: "Week 9 已经给 durable extraction 接入 budget guard。",
      },
    ]);
    registerGlobalMemoryManager(memoryManager);

    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      conversationStore,
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
        id: "durable-budget-first",
        method: "conversation.digest.refresh",
        params: { conversationId, threshold: 2 },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-budget-first" && f.ok === true));
      await waitFor(() => frames.some((f) => f.type === "event" && f.event === "conversation.memory.extraction.updated" && f.payload?.conversationId === conversationId && f.payload?.extraction?.status === "completed"));
      expect(extractionSpy).toHaveBeenCalledTimes(1);

      conversationStore.addMessage(conversationId, "assistant", "D".repeat(80));
      frames.length = 0;

      ws.send(JSON.stringify({
        type: "req",
        id: "durable-budget-second",
        method: "conversation.digest.refresh",
        params: { conversationId, threshold: 2 },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-budget-second" && f.ok === true));
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(extractionSpy).toHaveBeenCalledTimes(1);

      ws.send(JSON.stringify({
        type: "req",
        id: "durable-budget-get",
        method: "conversation.memory.extraction.get",
        params: { conversationId, threshold: 2 },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "durable-budget-get" && f.ok === true));
      const getRes = frames.find((f) => f.type === "res" && f.id === "durable-budget-get");
      expect(getRes.payload.extraction).toMatchObject({
        conversationId,
        status: "completed",
        runCount: 1,
      });

      const usageRaw = await fs.promises.readFile(path.join(stateDir, "memory-runtime", "usage-accounting.json"), "utf-8");
      const usageState = JSON.parse(usageRaw) as { events?: Array<{ consumer?: string; outcome?: string; metadata?: Record<string, unknown> }> };
      const requestEvents = (usageState.events ?? []).filter((item) => item.consumer === "durable_extraction_request");
      const runEvents = (usageState.events ?? []).filter((item) => item.consumer === "durable_extraction_run");

      expect(requestEvents.map((item) => item.outcome)).toEqual(["queued"]);
      expect(runEvents.some((item) => item.outcome === "blocked")).toBe(false);
    } finally {
      ws.close();
      await closeP;
      extractionSpy.mockRestore();
      await server.close();
      memoryManager.close();
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("message.send userUuid overrides handshake userUuid for agent input and token upload", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const seenUserUuids: Array<string | undefined> = [];
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
  const agent: BelldandyAgent = {
    async *run(input) {
      seenUserUuids.push(input.userUuid);
      yield {
        type: "usage" as const,
        systemPromptTokens: 0,
        contextTokens: 0,
        inputTokens: 5,
        outputTokens: 4,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        modelCalls: 1,
      };
      yield { type: "final" as const, text: "ok" };
    },
  };

  try {
    await withEnv({
      BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED: "true",
      BELLDANDY_TOKEN_USAGE_UPLOAD_URL: "http://token-upload.local/api/internal/token-usage",
      BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY: "gro_test_upload_key",
    }, async () => {
      const server = await startGatewayServer({
        port: 0,
        auth: { mode: "none" },
        webRoot: resolveWebRoot(),
        stateDir,
        agentFactory: () => agent,
      });

      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
      const frames: any[] = [];
      const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
      ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

      try {
        await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
        ws.send(JSON.stringify({
          type: "connect",
          role: "web",
          auth: { mode: "none" },
          userUuid: "connect-uuid",
        }));
        await waitFor(() => frames.some((f) => f.type === "hello-ok"));

        ws.send(JSON.stringify({
          type: "req",
          id: "pairing-message-uuid",
          method: "message.send",
          params: { text: "pairing-init" },
        }));
        await waitFor(() => frames.some((f) => f.type === "event" && f.event === "pairing.required"));
        const pairingEvents = frames.filter((f) => f.type === "event" && f.event === "pairing.required");
        const pairing = pairingEvents[pairingEvents.length - 1];
        const code = pairing?.payload?.code ? String(pairing.payload.code) : "";
        expect(code.length).toBeGreaterThan(0);
        const approved = await approvePairingCode({ code, stateDir });
        expect(approved.ok).toBe(true);

        const reqId = "message-uuid-override";
        ws.send(JSON.stringify({
          type: "req",
          id: reqId,
          method: "message.send",
          params: {
            text: "覆盖 uuid",
            userUuid: "message-uuid",
          },
        }));

        await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId && f.ok === true));
        await waitFor(() => fetchSpy.mock.calls.length > 0);

        expect(seenUserUuids).toEqual(["message-uuid"]);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(String(url)).toBe("http://token-upload.local/api/internal/token-usage");
        expect(init && typeof init === "object" ? (init as RequestInit).headers : undefined).toMatchObject({
          Authorization: "Bearer gro_test_upload_key",
        });
        expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
          userUuid: "message-uuid",
          deltaTokens: 9,
        });
      } finally {
        ws.close();
        await closeP;
        await server.close();
      }
    });
  } finally {
    fetchSpy.mockRestore();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("gateway rejects invalid token", async () => {
  const stateDir2 = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "token", token: "t" },
    webRoot: resolveWebRoot(),
    stateDir: stateDir2,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];

  // 捕获连接错误，避免未处理异常
  ws.on("error", () => {});
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));
  const closeP = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString("utf-8") }));
  });

  await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "token", token: "wrong" } }));

  const closeInfo = await closeP;
  expect(closeInfo.code).toBe(4403);

  await server.close();
  await fs.promises.rm(stateDir2, { recursive: true, force: true }).catch(() => {});
});

test("gateway accepts browser same-origin websocket with explicit port", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: `http://127.0.0.1:${server.port}` });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
  await waitFor(() => frames.some((f) => f.type === "hello-ok"));

  ws.close();
  await closeP;
  await server.close();
  await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("secure methods require pairing for config raw and tools update", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
  await waitFor(() => frames.some((f) => f.type === "hello-ok"));

  ws.send(JSON.stringify({ type: "req", id: "raw-read", method: "config.readRaw", params: {} }));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "raw-read"));
  const rawReadRes = frames.find((f) => f.type === "res" && f.id === "raw-read");
  expect(rawReadRes.ok).toBe(false);
  expect(rawReadRes.error?.code).toBe("pairing_required");

  // 使用非法参数防止历史缺陷导致真实写入 .env
  ws.send(JSON.stringify({ type: "req", id: "raw-write", method: "config.writeRaw", params: { content: 1 } }));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "raw-write"));
  const rawWriteRes = frames.find((f) => f.type === "res" && f.id === "raw-write");
  expect(rawWriteRes.ok).toBe(false);
  expect(rawWriteRes.error?.code).toBe("pairing_required");

  ws.send(JSON.stringify({ type: "req", id: "tools-update", method: "tools.update", params: { disabled: { builtin: [] } } }));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-update"));
  const toolsUpdateRes = frames.find((f) => f.type === "res" && f.id === "tools-update");
  expect(toolsUpdateRes.ok).toBe(false);
  expect(toolsUpdateRes.error?.code).toBe("pairing_required");

  ws.close();
  await closeP;
  await server.close();
  await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("config.update persists tool control mode and redacts confirm password in config.read", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const envDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-env-"));
  await fs.promises.writeFile(path.join(envDir, ".env"), 'BELLDANDY_AGENT_TOOL_CONTROL_MODE="disabled"\n', "utf-8");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    envDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "config-update-agent-tool-control",
      method: "config.update",
      params: {
        updates: {
          BELLDANDY_AGENT_TOOL_CONTROL_MODE: "confirm",
          BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD: "星河123",
        },
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-update-agent-tool-control"));
    const updateRes = frames.find((f) => f.type === "res" && f.id === "config-update-agent-tool-control");
    expect(updateRes.ok).toBe(true);

    ws.send(JSON.stringify({ type: "req", id: "config-read-agent-tool-control", method: "config.read", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-read-agent-tool-control"));
    const readRes = frames.find((f) => f.type === "res" && f.id === "config-read-agent-tool-control");
    expect(readRes.ok).toBe(true);
    expect(readRes.payload?.config?.BELLDANDY_AGENT_TOOL_CONTROL_MODE).toBe("confirm");
    expect(readRes.payload?.config?.BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD).toBe("[REDACTED]");

    const envLocalContent = await fs.promises.readFile(path.join(envDir, ".env.local"), "utf-8");
    expect(envLocalContent).toContain('BELLDANDY_AGENT_TOOL_CONTROL_MODE="confirm"');
    expect(envLocalContent).toContain('BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD="星河123"');
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(envDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("config.update accepts channel settings and config.read redacts channel secrets", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const envDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-env-"));
  await fs.promises.writeFile(path.join(envDir, ".env"), 'BELLDANDY_AUTH_MODE="token"\n', "utf-8");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    envDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "config-update-channels",
      method: "config.update",
      params: {
        updates: {
          BELLDANDY_COMMUNITY_API_ENABLED: "false",
          BELLDANDY_COMMUNITY_API_TOKEN: "community-secret",
          BELLDANDY_FEISHU_APP_ID: "cli_test_app",
          BELLDANDY_FEISHU_APP_SECRET: "feishu-secret",
          BELLDANDY_FEISHU_AGENT_ID: "coder",
          BELLDANDY_QQ_APP_ID: "qq-app-id",
          BELLDANDY_QQ_APP_SECRET: "qq-secret",
          BELLDANDY_QQ_AGENT_ID: "researcher",
          BELLDANDY_QQ_SANDBOX: "false",
          BELLDANDY_DISCORD_ENABLED: "true",
          BELLDANDY_DISCORD_BOT_TOKEN: "discord-secret",
          BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID: "1234567890",
        },
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-update-channels"));

    const updateRes = frames.find((f) => f.type === "res" && f.id === "config-update-channels");
    expect(updateRes.ok).toBe(true);

    ws.send(JSON.stringify({ type: "req", id: "config-read-channels", method: "config.read", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-read-channels"));

    const readRes = frames.find((f) => f.type === "res" && f.id === "config-read-channels");
    expect(readRes.ok).toBe(true);
    expect(readRes.payload?.config?.BELLDANDY_FEISHU_APP_ID).toBe("cli_test_app");
    expect(readRes.payload?.config?.BELLDANDY_FEISHU_AGENT_ID).toBe("coder");
    expect(readRes.payload?.config?.BELLDANDY_QQ_APP_ID).toBe("qq-app-id");
    expect(readRes.payload?.config?.BELLDANDY_QQ_SANDBOX).toBe("false");
    expect(readRes.payload?.config?.BELLDANDY_DISCORD_ENABLED).toBe("true");
    expect(readRes.payload?.config?.BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID).toBe("1234567890");
    expect(readRes.payload?.config?.BELLDANDY_COMMUNITY_API_TOKEN).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_FEISHU_APP_SECRET).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_QQ_APP_SECRET).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_DISCORD_BOT_TOKEN).toBe("[REDACTED]");

    const envLocalContent = await fs.promises.readFile(path.join(envDir, ".env.local"), "utf-8");
    expect(envLocalContent).toContain('BELLDANDY_COMMUNITY_API_TOKEN="community-secret"');
    expect(envLocalContent).toContain('BELLDANDY_FEISHU_APP_SECRET="feishu-secret"');
    expect(envLocalContent).toContain('BELLDANDY_QQ_APP_SECRET="qq-secret"');
    expect(envLocalContent).toContain('BELLDANDY_DISCORD_BOT_TOKEN="discord-secret"');
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(envDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("config.update rejects enabling community api when auth mode is none", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const envDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-env-"));
  await fs.promises.writeFile(path.join(envDir, ".env"), 'BELLDANDY_AUTH_MODE="none"\n', "utf-8");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    envDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "config-update-community-auth-guard",
      method: "config.update",
      params: {
        updates: {
          BELLDANDY_COMMUNITY_API_ENABLED: "true",
          BELLDANDY_COMMUNITY_API_TOKEN: "community-secret",
        },
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-update-community-auth-guard"));

    const updateRes = frames.find((f) => f.type === "res" && f.id === "config-update-community-auth-guard");
    expect(updateRes.ok).toBe(false);
    expect(updateRes.error?.code).toBe("community_api_requires_auth");

    const envLocalPath = path.join(envDir, ".env.local");
    const envLocalStat = await fs.promises.stat(envLocalPath).catch(() => null);
    if (envLocalStat?.isFile()) {
      const envLocalContent = await fs.promises.readFile(envLocalPath, "utf-8");
      expect(envLocalContent).not.toContain("BELLDANDY_COMMUNITY_API_ENABLED");
    }
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(envDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor reads memory db status without blocking sync fs path", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  await fs.promises.writeFile(path.join(stateDir, "memory.sqlite"), Buffer.alloc(2048, 1));

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({ type: "req", id: "system-doctor", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor");
    expect(response.ok).toBe(true);
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "memory_db",
        status: "pass",
        message: expect.stringContaining("Size: 2.0 KB"),
      }),
      expect.objectContaining({
        id: "mcp_runtime",
        status: "pass",
        message: "Disabled",
      }),
    ]));
    expect(response.payload?.mcpRuntime).toEqual({
      enabled: false,
      diagnostics: null,
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor includes MCP recovery and persisted-result summary when MCP diagnostics are available", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const previousMcpEnabled = process.env.BELLDANDY_MCP_ENABLED;
  process.env.BELLDANDY_MCP_ENABLED = "true";

  const mcpModule = await import("./mcp/index.js");
  const getMCPDiagnosticsSpy = vi.spyOn(mcpModule, "getMCPDiagnostics").mockReturnValue({
    initialized: true,
    toolCount: 5,
    serverCount: 2,
    connectedCount: 1,
    summary: {
      recentErrorServers: 1,
      recoveryAttemptedServers: 1,
      recoverySucceededServers: 1,
      persistedResultServers: 1,
      truncatedResultServers: 1,
    },
    servers: [
      {
        id: "mcp_a",
        name: "MCP A",
        status: "connected",
        toolCount: 5,
        resourceCount: 2,
        diagnostics: {
          connectionAttempts: 1,
          reconnectAttempts: 1,
          lastRecoveryAt: new Date("2026-04-02T10:00:00.000Z"),
          lastRecoverySucceeded: true,
          lastResult: {
            at: new Date("2026-04-02T10:01:00.000Z"),
            source: "call_tool",
            strategy: "persisted",
            estimatedChars: 4096,
            truncatedItems: 1,
            persistedItems: 1,
            persistedWebPath: "/generated/mcp-doctor.txt",
          },
        },
      },
      {
        id: "mcp_b",
        name: "MCP B",
        status: "error",
        error: "session expired",
        toolCount: 0,
        resourceCount: 0,
        diagnostics: {
          connectionAttempts: 2,
          reconnectAttempts: 1,
          lastErrorAt: new Date("2026-04-02T09:59:00.000Z"),
          lastErrorKind: "session_expired",
          lastErrorMessage: "session expired",
        },
      },
    ],
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({ type: "req", id: "system-doctor-mcp-runtime", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-mcp-runtime"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-mcp-runtime");

    expect(getMCPDiagnosticsSpy).toHaveBeenCalled();
    expect(response.ok).toBe(true);
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "mcp_runtime",
        status: "pass",
        message: "1/2 connected, 5 tools, recovery 1/1, persisted refs 1",
      }),
    ]));
    expect(response.payload?.mcpRuntime?.diagnostics?.summary).toEqual({
      recentErrorServers: 1,
      recoveryAttemptedServers: 1,
      recoverySucceededServers: 1,
      persistedResultServers: 1,
      truncatedResultServers: 1,
    });
    expect(response.payload?.mcpRuntime?.diagnostics?.servers[0]?.diagnostics?.lastResult).toEqual(expect.objectContaining({
      strategy: "persisted",
      persistedWebPath: "/generated/mcp-doctor.txt",
    }));
  } finally {
    getMCPDiagnosticsSpy.mockRestore();
    if (previousMcpEnabled === undefined) {
      delete process.env.BELLDANDY_MCP_ENABLED;
    } else {
      process.env.BELLDANDY_MCP_ENABLED = previousMcpEnabled;
    }
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes unified extension runtime diagnostics for plugins and skills", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();
  await toolsConfigManager.updateConfig({
    plugins: ["demo-plugin"],
    skills: ["disabled-skill"],
  });

  const pluginRegistry = new PluginRegistry();
  ((pluginRegistry as any).plugins).set("demo-plugin", {
    id: "demo-plugin",
    name: "Demo Plugin",
    version: "1.0.0",
    description: "demo",
    activate: async () => {},
  });
  ((pluginRegistry as any).pluginToolMap).set("demo-plugin", ["plugin_demo_tool"]);
  ((pluginRegistry as any).loadErrors).push({
    at: new Date("2026-04-02T12:00:00.000Z"),
    phase: "load_plugin",
    target: "broken-plugin.mjs",
    message: "missing activate function",
  });

  const skillRegistry = new SkillRegistry();
  ((skillRegistry as any).skills).set("bundled:available-skill", {
    name: "available-skill",
    description: "available skill",
    instructions: "available",
    source: { type: "bundled" },
    priority: "normal",
    tags: ["ops"],
  });
  ((skillRegistry as any).skills).set("bundled:disabled-skill", {
    name: "disabled-skill",
    description: "disabled skill",
    instructions: "disabled",
    source: { type: "bundled" },
    priority: "high",
    tags: ["blocked"],
  });
  ((skillRegistry as any).eligibilityCache).set("available-skill", { eligible: true, reasons: [] });
  ((skillRegistry as any).eligibilityCache).set("disabled-skill", { eligible: true, reasons: [] });
  const extensionHost: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle"> = {
    extensionRuntime: buildExtensionRuntimeReport({
      pluginRegistry,
      skillRegistry,
      toolsConfigManager,
    }),
    lifecycle: {
      pluginToolsRegistered: 1,
      skillManagementToolsRegistered: ["skills_list", "skills_search", "skill_get"],
      bundledSkillsLoaded: 2,
      userSkillsLoaded: 0,
      pluginSkillsLoaded: 0,
      installedMarketplaceExtensionsLoaded: 0,
      installedMarketplacePluginsLoaded: 0,
      installedMarketplaceSkillPacksLoaded: 0,
      eligibilityRefreshed: true,
      loadCompletedAt: new Date("2026-04-02T12:05:00.000Z"),
      hookBridge: {
        source: "plugin-bridge",
        availableHookCount: 2,
        bridgedHookCount: 2,
        registrations: [
          {
            legacyHookName: "beforeRun",
            hookName: "before_agent_start",
            available: true,
            bridged: true,
          },
          {
            legacyHookName: "afterRun",
            hookName: "agent_end",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "beforeToolCall",
            hookName: "before_tool_call",
            available: true,
            bridged: true,
          },
          {
            legacyHookName: "afterToolCall",
            hookName: "after_tool_call",
            available: false,
            bridged: false,
          },
        ],
        lastBridgedAt: new Date("2026-04-02T12:06:00.000Z"),
      },
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolsConfigManager,
    pluginRegistry,
    extensionHost,
    skillRegistry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({ type: "req", id: "system-doctor-extension-runtime", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-extension-runtime"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-extension-runtime");

    expect(response.ok).toBe(true);
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "extension_runtime",
        status: "warn",
        message: "plugins 1 (1 disabled, 1 load errors), skills 2 (1 disabled, 0 ineligible), legacy hooks 2/2 bridged",
      }),
    ]));
    expect(response.payload?.extensionRuntime?.summary).toEqual({
      pluginCount: 1,
      disabledPluginCount: 1,
      pluginToolCount: 1,
      pluginLoadErrorCount: 1,
      skillCount: 2,
      disabledSkillCount: 1,
      ineligibleSkillCount: 0,
      promptSkillCount: 0,
      searchableSkillCount: 1,
    });
    expect(response.payload?.extensionRuntime?.diagnostics?.pluginLoadErrors).toEqual([
      expect.objectContaining({
        phase: "load_plugin",
        target: "broken-plugin.mjs",
        message: "missing activate function",
      }),
    ]);
    expect(response.payload?.extensionRuntime?.registry).toEqual({
      pluginToolRegistrations: [
        {
          pluginId: "demo-plugin",
          toolNames: ["plugin_demo_tool"],
          disabled: true,
        },
      ],
      skillManagementTools: [
        { name: "skills_list", shouldRegister: true, reasonCode: "available" },
        { name: "skills_search", shouldRegister: true, reasonCode: "available" },
        { name: "skill_get", shouldRegister: true, reasonCode: "available" },
      ],
      promptSkillNames: [],
      searchableSkillNames: ["available-skill"],
    });
    expect(response.payload?.extensionRuntime?.host?.lifecycle).toMatchObject({
      pluginToolsRegistered: 1,
      skillManagementToolsRegistered: ["skills_list", "skills_search", "skill_get"],
      bundledSkillsLoaded: 2,
      userSkillsLoaded: 0,
      pluginSkillsLoaded: 0,
      installedMarketplaceExtensionsLoaded: 0,
      installedMarketplacePluginsLoaded: 0,
      installedMarketplaceSkillPacksLoaded: 0,
      eligibilityRefreshed: true,
      loadCompletedAt: "2026-04-02T12:05:00.000Z",
      hookBridge: {
        source: "plugin-bridge",
        availableHookCount: 2,
        bridgedHookCount: 2,
        lastBridgedAt: "2026-04-02T12:06:00.000Z",
        registrations: extensionHost.lifecycle.hookBridge.registrations,
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor reports extension marketplace summary from installed ledgers", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();
  await toolsConfigManager.updateConfig({
    plugins: ["demo-plugin"],
    skills: ["disabled-skill"],
  });
  await upsertKnownMarketplace(stateDir, {
    name: "official-market",
    source: {
      source: "github",
      repo: "star-sanctuary/official-market",
      ref: "main",
    },
    installLocation: path.join(stateDir, "extensions", "cache", "official-market"),
    autoUpdate: true,
    lastUpdated: "2026-04-02T12:30:00.000Z",
  });
  await upsertInstalledExtension(stateDir, {
    name: "demo-plugin",
    kind: "plugin",
    marketplace: "official-market",
    version: "1.2.3",
    manifestPath: "belldandy-extension.json",
    installPath: path.join(stateDir, "extensions", "installed", "official-market", "demo-plugin"),
    status: "installed",
    enabled: true,
    lastUpdated: "2026-04-02T12:31:00.000Z",
  });
  await upsertInstalledExtension(stateDir, {
    name: "ops-skills",
    kind: "skill-pack",
    marketplace: "official-market",
    version: "0.4.0",
    installPath: path.join(stateDir, "extensions", "installed", "official-market", "ops-skills"),
    status: "broken",
    enabled: false,
  });
  const pluginRegistry = new PluginRegistry();
  ((pluginRegistry as any).plugins).set("demo-plugin", {
    id: "demo-plugin",
    name: "Demo Plugin",
    activate: async () => {},
  });
  ((pluginRegistry as any).pluginToolMap).set("demo-plugin", ["plugin_demo_tool"]);
  const skillRegistry = new SkillRegistry();
  ((skillRegistry as any).skills).set("bundled:available-skill", {
    name: "available-skill",
    description: "available skill",
    instructions: "available",
    source: { type: "bundled" },
    priority: "normal",
    tags: ["ops"],
  });
  ((skillRegistry as any).skills).set("bundled:disabled-skill", {
    name: "disabled-skill",
    description: "disabled skill",
    instructions: "disabled",
    source: { type: "bundled" },
    priority: "high",
    tags: ["blocked"],
  });
  ((skillRegistry as any).eligibilityCache).set("available-skill", { eligible: true, reasons: [] });
  ((skillRegistry as any).eligibilityCache).set("disabled-skill", { eligible: true, reasons: [] });
  const extensionHost: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle"> = {
    extensionRuntime: buildExtensionRuntimeReport({
      pluginRegistry,
      skillRegistry,
      toolsConfigManager,
    }),
    lifecycle: {
      pluginToolsRegistered: 1,
      skillManagementToolsRegistered: ["skills_list", "skills_search", "skill_get"],
      bundledSkillsLoaded: 2,
      userSkillsLoaded: 0,
      pluginSkillsLoaded: 0,
      installedMarketplaceExtensionsLoaded: 1,
      installedMarketplacePluginsLoaded: 1,
      installedMarketplaceSkillPacksLoaded: 0,
      eligibilityRefreshed: true,
      loadCompletedAt: new Date("2026-04-02T12:35:00.000Z"),
      hookBridge: {
        source: "plugin-bridge",
        availableHookCount: 0,
        bridgedHookCount: 0,
        registrations: [
          {
            legacyHookName: "beforeRun",
            hookName: "before_agent_start",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "afterRun",
            hookName: "agent_end",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "beforeToolCall",
            hookName: "before_tool_call",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "afterToolCall",
            hookName: "after_tool_call",
            available: false,
            bridged: false,
          },
        ],
      },
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolsConfigManager,
    pluginRegistry,
    extensionHost,
    skillRegistry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({ type: "req", id: "system-doctor-extension-marketplace", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-extension-marketplace"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-extension-marketplace");

    expect(response.ok).toBe(true);
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "extension_marketplace",
        status: "warn",
        message: "marketplaces 1 (1 auto-update), installed 2 (1 plugins, 1 skill-packs, 1 broken, 1 disabled)",
      }),
      expect.objectContaining({
        id: "extension_governance",
        status: "warn",
        message: "ledger enabled 1/2, host loaded 1 (1 plugins, 0 skill-packs), runtime policy disabled 1 plugins / 1 skills",
      }),
    ]));
    expect(response.payload?.extensionMarketplace?.summary).toEqual({
      knownMarketplaceCount: 1,
      autoUpdateMarketplaceCount: 1,
      installedExtensionCount: 2,
      installedPluginCount: 1,
      installedSkillPackCount: 1,
      pendingExtensionCount: 0,
      brokenExtensionCount: 1,
      disabledExtensionCount: 1,
    });
    expect(response.payload?.extensionMarketplace?.knownMarketplaces?.marketplaces?.["official-market"]).toMatchObject({
      name: "official-market",
      autoUpdate: true,
    });
    expect(response.payload?.extensionMarketplace?.installedExtensions?.extensions?.["demo-plugin@official-market"]).toMatchObject({
      name: "demo-plugin",
      marketplace: "official-market",
      status: "installed",
    });
    expect(response.payload?.extensionGovernance?.summary).toEqual({
      installedExtensionCount: 2,
      installedEnabledExtensionCount: 1,
      installedDisabledExtensionCount: 1,
      installedBrokenExtensionCount: 1,
      loadedMarketplaceExtensionCount: 1,
      loadedMarketplacePluginCount: 1,
      loadedMarketplaceSkillPackCount: 0,
      runtimePolicyDisabledPluginCount: 1,
      runtimePolicyDisabledSkillCount: 1,
    });
    expect(response.payload?.extensionGovernance?.layers).toMatchObject({
      installedLedger: {
        extensionIds: ["demo-plugin@official-market", "ops-skills@official-market"],
        enabledExtensionIds: ["demo-plugin@official-market"],
        disabledExtensionIds: ["ops-skills@official-market"],
        brokenExtensionIds: ["ops-skills@official-market"],
      },
      hostLoad: {
        lifecycleAvailable: true,
        loadedMarketplaceExtensionCount: 1,
        loadedMarketplacePluginCount: 1,
        loadedMarketplaceSkillPackCount: 0,
      },
      runtimePolicy: {
        disabledPluginIds: ["demo-plugin"],
        disabledSkillNames: ["disabled-skill"],
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor reports durable extraction gating reasons and restricted memory surfaces", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-doctor-"));
  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    evolutionEnabled: true,
    evolutionModel: "test-evolution-model",
    evolutionBaseUrl: "https://example.invalid/v1",
    evolutionApiKey: "",
    evolutionMinMessages: 4,
  });
  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({ type: "req", id: "system-doctor-memory", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-memory"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-memory");
    expect(response.ok).toBe(true);
    expect(response.payload?.memoryRuntime?.mainThreadToolSurface?.mode).toBe("tool-executor");
    expect(response.payload?.memoryRuntime?.durableExtraction?.permissionSurface?.mode).toBe("internal-restricted");
    expect(response.payload?.memoryRuntime?.durableExtraction?.availability).toMatchObject({
      available: false,
      enabled: true,
      reasonCodes: expect.arrayContaining(["api_key_missing"]),
      model: "test-evolution-model",
      hasBaseUrl: true,
      hasApiKey: false,
    });
    expect(response.payload?.memoryRuntime?.durableExtraction?.guidance?.policyVersion).toBe("week9-v1");
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "durable_extraction_runtime",
        status: "fail",
      }),
      expect.objectContaining({
        id: "durable_extraction_policy",
        status: "pass",
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    memoryManager.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes team shared memory readiness and deferred sync policy", async () => {
  await withEnv({
    BELLDANDY_TEAM_SHARED_MEMORY_ENABLED: "true",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    await fs.promises.mkdir(path.join(stateDir, "team-memory", "memory"), { recursive: true });
    await fs.promises.writeFile(path.join(stateDir, "team-memory", "MEMORY.md"), "# Shared Memory\n", "utf-8");
    await fs.promises.writeFile(path.join(stateDir, "team-memory", "memory", "2026-04-02.md"), "# 2026-04-02\n", "utf-8");

    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);
      ws.send(JSON.stringify({ type: "req", id: "system-doctor-team-memory", method: "system.doctor", params: {} }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-team-memory"));
      const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-team-memory");

      expect(response.ok).toBe(true);
      expect(response.payload?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "team_shared_memory",
          status: "pass",
          message: "enabled at team-memory (2 files), secret guard ready, sync plan planned",
        }),
      ]));
      expect(response.payload?.memoryRuntime?.sharedMemory).toMatchObject({
        enabled: true,
        available: true,
        reasonCodes: [],
        scope: {
          relativeRoot: "team-memory",
          fileCount: 2,
          hasMainMemory: true,
          dailyCount: 1,
        },
        secretGuard: {
          enabled: true,
          scanner: "curated-high-confidence",
        },
        syncPolicy: {
          status: "planned",
          deltaSync: {
            enabled: true,
            mode: "checksum-delta",
          },
          conflictPolicy: {
            mode: "local-write-wins-per-entry",
            maxConflictRetries: 2,
          },
          deletionPolicy: {
            propagatesDeletes: false,
          },
          suppressionPolicy: {
            enabled: true,
          },
        },
      });
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("conversation.memory.extraction.get exposes runtime surfaces and rate-limit state", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-runtime-"));
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
    compaction: {
      enabled: true,
      tokenThreshold: 10,
      keepRecentCount: 1,
    },
    summarizer: async () => "rolling-summary-runtime",
  });
  const conversationId = "conv-memory-runtime";
  conversationStore.addMessage(conversationId, "user", "A".repeat(80));
  conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
  conversationStore.addMessage(conversationId, "user", "C".repeat(80));

  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    evolutionEnabled: true,
    evolutionModel: "test-evolution-model",
    evolutionBaseUrl: "https://example.invalid/v1",
    evolutionApiKey: "test-evolution-key",
    evolutionMinMessages: 3,
  });
  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({
      type: "req",
      id: "memory-runtime-get",
      method: "conversation.memory.extraction.get",
      params: { conversationId, threshold: 2 },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-runtime-get"));
    const response = frames.find((f) => f.type === "res" && f.id === "memory-runtime-get");
    expect(response.ok).toBe(true);
    expect(response.payload?.runtime?.mainThreadToolSurface?.mode).toBe("tool-executor");
    expect(response.payload?.runtime?.durableExtraction?.permissionSurface?.mode).toBe("internal-restricted");
    expect(response.payload?.runtime?.durableExtraction?.availability).toMatchObject({
      available: true,
      enabled: true,
      model: "test-evolution-model",
      hasBaseUrl: true,
      hasApiKey: true,
    });
    expect(response.payload?.runtime?.durableExtraction?.guidance).toMatchObject({
      policyVersion: "week9-v1",
      acceptedCandidateTypes: ["user", "feedback", "project", "reference"],
    });
    expect(response.payload?.runtime?.durableExtraction?.rateLimit?.request?.status).toBe("unlimited");
    expect(response.payload?.runtime?.durableExtraction?.rateLimit?.run?.status).toBe("unlimited");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    memoryManager.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor reports session digest rate-limit state after budget is exceeded", async () => {
  await withEnv({
    BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS: "1",
    BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS: "60000",
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS: undefined,
    BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS: undefined,
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const conversationStore = new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
      compaction: {
        enabled: true,
        tokenThreshold: 10,
        keepRecentCount: 1,
      },
      summarizer: async () => "rolling-summary-rate-limit",
    });
    const conversationId = "conv-rate-limit-state";
    conversationStore.addMessage(conversationId, "user", "A".repeat(80));
    conversationStore.addMessage(conversationId, "assistant", "B".repeat(80));
    conversationStore.addMessage(conversationId, "user", "C".repeat(80));

    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      conversationStore,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);
      ws.send(JSON.stringify({
        type: "req",
        id: "digest-rate-limit-first",
        method: "conversation.digest.refresh",
        params: { conversationId, threshold: 2 },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "digest-rate-limit-first" && f.ok === true));

      ws.send(JSON.stringify({
        type: "req",
        id: "digest-rate-limit-second",
        method: "conversation.digest.refresh",
        params: { conversationId, threshold: 2, force: true },
      }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "digest-rate-limit-second"));

      ws.send(JSON.stringify({ type: "req", id: "system-doctor-rate-limit", method: "system.doctor", params: {} }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-rate-limit"));
      const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-rate-limit");
      expect(response.ok).toBe(true);
      expect(response.payload?.memoryRuntime?.sessionDigest?.rateLimit).toMatchObject({
        status: "limited",
        configured: true,
        maxRuns: 1,
      });
      expect(response.payload?.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "session_digest_runtime",
          status: "warn",
        }),
      ]));
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("system.doctor exposes compaction runtime circuit and retry stats", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const tracker = new SourceCompactionRuntimeTracker({
    maxConsecutiveCompactionFailures: 1,
  });
  tracker.recordResult({
    messages: [],
    compacted: true,
    originalTokens: 120,
    compactedTokens: 48,
    state: {
      rollingSummary: "fallback summary",
      archivalSummary: "",
      compactedMessageCount: 2,
      lastCompactedMessageCount: 2,
      lastCompactedMessageFingerprint: "2:test",
      rollingSummaryMergeCount: 1,
      lastCompactedAt: Date.now(),
    },
    tier: "rolling",
    deltaMessageCount: 2,
    fallbackUsed: true,
    rebuildTriggered: false,
    promptTooLongRetries: 0,
    warningTriggered: false,
    blockingTriggered: false,
    failureReason: "compaction backend unavailable",
  }, {
    source: "request",
    participatesInCircuitBreaker: true,
  });
  tracker.shouldSkip("request");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    getCompactionRuntimeReport: () => tracker.getReport(),
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    ws.send(JSON.stringify({ type: "req", id: "system-doctor-compaction-runtime", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-compaction-runtime"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-compaction-runtime");

    expect(response.ok).toBe(true);
    expect(response.payload?.memoryRuntime?.compactionRuntime).toMatchObject({
      totals: {
        attempts: expect.any(Number),
        failures: 1,
        skippedByCircuitBreaker: expect.any(Number),
      },
      circuitBreaker: {
        open: expect.any(Boolean),
        lastFailureReason: "compaction backend unavailable",
      },
    });
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "compaction_runtime",
        status: "warn",
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes recent query runtime lifecycle traces", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "query-runtime-message-send",
      method: "message.send",
      params: { text: "追踪这一轮 runtime" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "query-runtime-message-send" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-query-runtime", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-query-runtime"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-query-runtime");

    expect(response.ok).toBe(true);
    expect(response.payload?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "query_runtime_trace",
        status: "pass",
      }),
    ]));
    expect(response.payload?.queryRuntime?.observerEnabled).toBe(true);
    expect(response.payload?.queryRuntime?.totalObservedEvents).toBeGreaterThan(0);
    expect(response.payload?.queryRuntime?.traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        traceId: "query-runtime-message-send",
        method: "message.send",
        status: "completed",
        latestStage: "completed",
      }),
    ]));

    const trace = response.payload?.queryRuntime?.traces?.find((item: any) => item.traceId === "query-runtime-message-send");
    const stages = trace?.stages ?? [];
    expect(trace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "request_validated",
      "conversation_loaded",
      "agent_running",
      "assistant_persisted",
      "completed",
    ]));
    expect(stages[stages.length - 1]?.stage).toBe("completed");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("message.send hides tool control confirm password from agent input and applies confirmed change", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const confirmationStore = new ToolControlConfirmationStore();
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  let toolExecutor!: ToolExecutor;
  let server!: Awaited<ReturnType<typeof startGatewayServer>>;
  const seenInputs: Array<{ text: string; userInput?: string; history: Array<{ role: string; content: string }> }> = [];

  toolExecutor = new ToolExecutor({
    tools: [
      createTestTool("alpha_builtin"),
      createToolSettingsControlTool({
        toolsConfigManager,
        getControlMode: () => "confirm",
        getHasConfirmPassword: () => true,
        listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
        confirmationStore,
      }),
    ],
    workspaceRoot: process.cwd(),
    alwaysEnabledTools: [TOOL_SETTINGS_CONTROL_NAME],
    broadcast: (event, payload) => {
      server?.broadcast({ type: "event", event, payload });
    },
  });

  const conversationId = "conv-tool-confirm-password";
  confirmationStore.create({
    requestId: "PW123",
    conversationId,
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

  const agent: BelldandyAgent = {
    async *run(input) {
      seenInputs.push({
        text: input.text,
        userInput: input.userInput,
        history: (input.history ?? []).map((item) => ({
          role: item.role,
          content: typeof item.content === "string" ? item.content : JSON.stringify(item.content),
        })),
      });
      yield { type: "status", status: "running" as const };
      const request = {
        id: "tool-call-confirm-password",
        name: TOOL_SETTINGS_CONTROL_NAME,
        arguments: {
          action: "confirm",
          requestId: "PW123",
        },
      };
      yield {
        type: "tool_call" as const,
        id: request.id,
        name: request.name,
        arguments: request.arguments,
      };
      const result = await toolExecutor.execute(request, input.conversationId, input.agentId, input.userUuid, input.senderInfo, input.roomContext);
      yield {
        type: "tool_result" as const,
        id: result.id,
        name: result.name,
        success: result.success,
        output: result.output,
        error: result.error,
      };
      yield { type: "final" as const, text: input.text };
      yield { type: "status", status: "done" as const };
    },
  };

  server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
    toolsConfigManager,
    toolExecutor,
    toolControlConfirmationStore: confirmationStore,
    getAgentToolControlMode: () => "confirm",
    getAgentToolControlConfirmPassword: () => "星河123",
    agentFactory: () => agent,
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
      id: "confirm-password-message",
      method: "message.send",
      params: {
        text: "星河123",
        conversationId,
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "confirm-password-message" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tool_result"));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));

    const toolResultEvent = frames.find((f) => f.type === "event" && f.event === "tool_result");
    expect(toolResultEvent?.payload?.success).toBe(true);
    expect(String(toolResultEvent?.payload?.output ?? "")).not.toContain("星河123");
    expect(seenInputs).toHaveLength(1);
    expect(seenInputs[0].text).toBe("【已提交工具开关确认口令】");
    expect(seenInputs[0].userInput).toBe("【已提交工具开关确认口令】");
    expect(seenInputs[0].history.some((item) => item.content.includes("星河123"))).toBe(false);
    expect(toolsConfigManager.getConfig().disabled.builtin).toEqual(["alpha_builtin"]);

    const storedHistory = conversationStore.getHistory(conversationId);
    expect(storedHistory.some((item) => item.content === "星河123")).toBe(false);
    expect(storedHistory.some((item) => item.content === "【已提交工具开关确认口令】")).toBe(true);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("message.send emits webchat confirm event and tool_settings.confirm approves without chat prompt noise", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const confirmationStore = new ToolControlConfirmationStore();
  const conversationStore = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  let toolExecutor!: ToolExecutor;
  let server!: Awaited<ReturnType<typeof startGatewayServer>>;

  toolExecutor = new ToolExecutor({
    tools: [
      createTestTool("alpha_builtin"),
      createToolSettingsControlTool({
        toolsConfigManager,
        getControlMode: () => "confirm",
        getHasConfirmPassword: () => true,
        listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
        confirmationStore,
      }),
    ],
    workspaceRoot: process.cwd(),
    alwaysEnabledTools: [TOOL_SETTINGS_CONTROL_NAME],
    broadcast: (event, payload) => {
      server?.broadcast({ type: "event", event, payload });
    },
  });

  const agent: BelldandyAgent = {
    async *run(input) {
      yield { type: "status", status: "running" as const };
      const request = {
        id: "tool-call-webchat-confirm",
        name: TOOL_SETTINGS_CONTROL_NAME,
        arguments: {
          action: "apply",
          disableBuiltin: ["alpha_builtin"],
        },
      };
      yield {
        type: "tool_call" as const,
        id: request.id,
        name: request.name,
        arguments: request.arguments,
      };
      const result = await toolExecutor.execute(request, input.conversationId, input.agentId, input.userUuid, input.senderInfo, input.roomContext);
      yield {
        type: "tool_result" as const,
        id: result.id,
        name: result.name,
        success: result.success,
        output: result.output,
        error: result.error,
      };
      yield { type: "final" as const, text: "收到" };
      yield { type: "status", status: "done" as const };
    },
  };

  server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    conversationStore,
    toolsConfigManager,
    toolExecutor,
    toolControlConfirmationStore: confirmationStore,
    getAgentToolControlMode: () => "confirm",
    getAgentToolControlConfirmPassword: () => "星河123",
    agentFactory: () => agent,
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
      id: "message-send-webchat-confirm",
      method: "message.send",
      params: {
        text: "请关闭 alpha_builtin",
        conversationId: "conv-webchat-confirm",
        from: "web",
        roomContext: {
          environment: "local",
        },
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "message-send-webchat-confirm" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tool_result"));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tool_settings.confirm.required"));

    const toolResultEvent = frames.find((f) => f.type === "event" && f.event === "tool_result");
    expect(toolResultEvent?.payload?.success).toBe(true);
    expect(String(toolResultEvent?.payload?.output ?? "")).toContain("WebChat 页面确认窗口");
    expect(String(toolResultEvent?.payload?.output ?? "")).not.toContain("批准工具设置变更");

    const requiredEvent = frames.find((f) => f.type === "event" && f.event === "tool_settings.confirm.required");
    expect(requiredEvent?.payload?.conversationId).toBe("conv-webchat-confirm");
    expect(requiredEvent?.payload?.summary).toEqual(["关闭 builtin: alpha_builtin"]);
    expect(String(requiredEvent?.payload?.targetClientId ?? "").length).toBeGreaterThan(0);

    const requestId = String(requiredEvent?.payload?.requestId ?? "");
    ws.send(JSON.stringify({
      type: "req",
      id: "approve-webchat-confirm",
      method: "tool_settings.confirm",
      params: {
        requestId,
        conversationId: "conv-webchat-confirm",
        decision: "approve",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "approve-webchat-confirm" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tools.config.updated"));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tool_settings.confirm.resolved"));

    expect(toolsConfigManager.getConfig().disabled.builtin).toEqual(["alpha_builtin"]);
    expect(confirmationStore.get(requestId)).toBeUndefined();

    const resolvedEvent = frames.find((f) => f.type === "event" && f.event === "tool_settings.confirm.resolved");
    expect(resolvedEvent?.payload?.decision).toBe("approved");

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-tool-confirm-trace", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-tool-confirm-trace"));
    const doctorRes = frames.find((f) => f.type === "res" && f.id === "system-doctor-tool-confirm-trace");
    const traces = doctorRes.payload?.queryRuntime?.traces ?? [];
    const confirmTrace = traces.find((item: any) => item.traceId === "approve-webchat-confirm");
    expect(confirmTrace).toMatchObject({
      method: "tool_settings.confirm",
      status: "completed",
      conversationId: "conv-webchat-confirm",
    });
    expect(confirmTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "request_validated",
      "tool_settings_updated",
      "tool_event_emitted",
      "completed",
    ]));

    const storedHistory = conversationStore.getHistory("conv-webchat-confirm");
    expect(storedHistory.some((item) => item.content.includes("批准工具设置变更"))).toBe(false);
    expect(storedHistory.some((item) => item.content.includes("请在页面确认窗口中处理"))).toBe(false);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
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

test("tools.list hides tool_settings_control from builtin tools", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const confirmationStore = new ToolControlConfirmationStore();
  let toolExecutor!: ToolExecutor;
  toolExecutor = new ToolExecutor({
    tools: [
      createTestTool("alpha_builtin"),
      createTestTool("mcp_demo_ping"),
      createToolSettingsControlTool({
        toolsConfigManager,
        getControlMode: () => "auto",
        listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
        confirmationStore,
      }),
    ],
    workspaceRoot: process.cwd(),
    alwaysEnabledTools: [TOOL_SETTINGS_CONTROL_NAME],
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

    ws.send(JSON.stringify({ type: "req", id: "tools-list-hidden-control", method: "tools.list", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-hidden-control"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-hidden-control");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.builtin).toContain("alpha_builtin");
    expect(listRes.payload?.builtin).not.toContain(TOOL_SETTINGS_CONTROL_NAME);
    expect(listRes.payload?.mcp).toEqual({
      demo: {
        tools: ["mcp_demo_ping"],
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("tools.list returns contract summaries for contract-aware tools", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("alpha_builtin"),
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

    ws.send(JSON.stringify({ type: "req", id: "tools-list-contracts", method: "tools.list", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-contracts"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-contracts");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.builtin).toEqual(["alpha_builtin", "beta_builtin"]);
    expect(listRes.payload?.contracts?.alpha_builtin).toMatchObject({
      family: "other",
      riskLevel: "low",
      channels: ["gateway"],
      safeScopes: ["local-safe"],
      needsPermission: false,
      isReadOnly: true,
      isConcurrencySafe: true,
    });
    expect(listRes.payload?.visibility?.alpha_builtin).toMatchObject({
      available: true,
      reasonCode: "available",
    });
    expect(listRes.payload?.toolControl).toMatchObject({
      mode: "disabled",
      requiresConfirmation: false,
    });
    expect(listRes.payload?.contracts?.beta_builtin).toBeUndefined();
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("tools.list exposes tool behavior contract observability for visible tools", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("run_command"),
      createContractedTestTool("apply_patch"),
      createContractedTestTool("delegate_task"),
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

    ws.send(JSON.stringify({ type: "req", id: "tools-list-behavior-contracts", method: "tools.list", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-behavior-contracts"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-behavior-contracts");

    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.toolBehaviorObservability).toMatchObject({
      counts: {
        includedContractCount: 3,
      },
      included: [
        "run_command",
        "apply_patch",
        "delegate_task",
      ],
    });
    expect(listRes.payload?.toolBehaviorObservability?.contracts?.run_command).toMatchObject({
      useWhen: expect.any(Array),
      preflightChecks: expect.any(Array),
    });
    expect(listRes.payload?.toolBehaviorObservability?.summary).toContain("## run_command");
    expect(listRes.payload?.toolBehaviorObservability?.summary).toContain("## apply_patch");
    expect(listRes.payload?.toolBehaviorObservability?.summary).toContain("## delegate_task");
    expect(listRes.payload?.toolBehaviorObservability?.contracts?.beta_builtin).toBeUndefined();
    expect(listRes.payload?.toolContractV2Observability).toMatchObject({
      counts: {
        totalCount: 3,
        missingV2Count: 1,
      },
    });
    expect(listRes.payload?.toolContractV2Observability?.contracts?.run_command).toMatchObject({
      family: "other",
      recommendedWhen: expect.any(Array),
      confirmWhen: expect.any(Array),
    });
    expect(listRes.payload?.toolContractsIncluded).toBeUndefined();
    expect(listRes.payload?.toolBehaviorContracts).toBeUndefined();
    expect(listRes.payload?.toolContractSummary).toBeUndefined();
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

test("tools.list exposes visibility reasons for selected agent and conversation", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();
  await toolsConfigManager.updateConfig({
    mcp_servers: ["demo"],
    plugins: ["demo-plugin"],
    skills: ["disabled-skill"],
  });
  const confirmationStore = new ToolControlConfirmationStore();
  confirmationStore.create({
    requestId: "ABCDE",
    conversationId: "conv-visibility",
    changes: {
      enableBuiltin: [],
      disableBuiltin: ["alpha_builtin"],
      enableMcpServers: [],
      disableMcpServers: [],
      enablePlugins: [],
      disablePlugins: [],
    },
  });

  const goalTool = withToolContract(createTestTool("goal_init"), {
    family: "other",
    isReadOnly: true,
    isConcurrencySafe: true,
    needsPermission: false,
    riskLevel: "low",
    channels: ["gateway"],
    safeScopes: ["local-safe"],
    activityDescription: "goal tool",
    resultSchema: {
      kind: "text",
      description: "test tool output",
    },
    outputPersistencePolicy: "conversation",
  });

  const toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("alpha_builtin"),
      createContractedTestTool("beta_builtin"),
      goalTool,
      createTestTool("mcp_demo_ping"),
    ],
    workspaceRoot: process.cwd(),
    contractAccessPolicy: {
      channel: "gateway",
      allowedSafeScopes: ["local-safe"],
      blockedToolNames: ["beta_builtin"],
    },
    isToolAllowedForAgent: (toolName, agentId) => agentId !== "restricted" || toolName === "goal_init",
    isToolAllowedInConversation: (toolName, conversationId) => toolName !== "goal_init" || conversationId.startsWith("goal:"),
  });
  const pluginRegistry = new PluginRegistry();
  ((pluginRegistry as any).plugins).set("demo-plugin", {
    id: "demo-plugin",
    name: "Demo Plugin",
    activate: async () => {},
  });
  ((pluginRegistry as any).pluginToolMap).set("demo-plugin", ["plugin_demo_tool"]);
  const skillRegistry = new SkillRegistry();
  ((skillRegistry as any).skills).set("bundled:available-skill", {
    name: "available-skill",
    description: "available skill",
    instructions: "available",
    source: { type: "bundled" },
    priority: "normal",
    tags: ["ops"],
  });
  ((skillRegistry as any).skills).set("bundled:disabled-skill", {
    name: "disabled-skill",
    description: "disabled skill",
    instructions: "disabled",
    source: { type: "bundled" },
    priority: "high",
    tags: ["blocked"],
  });
  ((skillRegistry as any).skills).set("bundled:ineligible-skill", {
    name: "ineligible-skill",
    description: "ineligible skill",
    instructions: "ineligible",
    source: { type: "bundled" },
    priority: "low",
    tags: ["needs-env"],
  });
  ((skillRegistry as any).eligibilityCache).set("available-skill", { eligible: true, reasons: [] });
  ((skillRegistry as any).eligibilityCache).set("disabled-skill", { eligible: true, reasons: [] });
  ((skillRegistry as any).eligibilityCache).set("ineligible-skill", { eligible: false, reasons: ["missing env: DEMO_TOKEN"] });
  await upsertInstalledExtension(stateDir, {
    name: "demo-plugin",
    kind: "plugin",
    marketplace: "official-market",
    installPath: path.join(stateDir, "extensions", "installed", "official-market", "demo-plugin"),
    status: "installed",
    enabled: true,
  });
  await upsertInstalledExtension(stateDir, {
    name: "ops-skills",
    kind: "skill-pack",
    marketplace: "official-market",
    installPath: path.join(stateDir, "extensions", "installed", "official-market", "ops-skills"),
    status: "pending",
    enabled: false,
  });
  const extensionHost: Pick<ExtensionHostState, "extensionRuntime" | "lifecycle"> = {
    extensionRuntime: buildExtensionRuntimeReport({
      pluginRegistry,
      skillRegistry,
      toolsConfigManager,
    }),
    lifecycle: {
      pluginToolsRegistered: 1,
      skillManagementToolsRegistered: ["skills_list", "skills_search", "skill_get"],
      bundledSkillsLoaded: 3,
      userSkillsLoaded: 0,
      pluginSkillsLoaded: 0,
      installedMarketplaceExtensionsLoaded: 1,
      installedMarketplacePluginsLoaded: 1,
      installedMarketplaceSkillPacksLoaded: 0,
      eligibilityRefreshed: true,
      loadCompletedAt: new Date("2026-04-02T13:10:00.000Z"),
      hookBridge: {
        source: "plugin-bridge",
        availableHookCount: 0,
        bridgedHookCount: 0,
        registrations: [
          {
            legacyHookName: "beforeRun",
            hookName: "before_agent_start",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "afterRun",
            hookName: "agent_end",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "beforeToolCall",
            hookName: "before_tool_call",
            available: false,
            bridged: false,
          },
          {
            legacyHookName: "afterToolCall",
            hookName: "after_tool_call",
            available: false,
            bridged: false,
          },
        ],
      },
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolsConfigManager,
    toolExecutor,
    toolControlConfirmationStore: confirmationStore,
    getAgentToolControlMode: () => "confirm",
    getAgentToolControlConfirmPassword: () => "",
    pluginRegistry,
    extensionHost,
    skillRegistry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "tools-list-visibility",
      method: "tools.list",
      params: {
        agentId: "restricted",
        conversationId: "conv-visibility",
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-visibility"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-visibility");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.visibilityContext).toEqual({
      agentId: "restricted",
      conversationId: "conv-visibility",
    });
    expect(listRes.payload?.visibility?.alpha_builtin).toMatchObject({
      available: false,
      reasonCode: "not-in-agent-whitelist",
    });
    expect(listRes.payload?.visibility?.beta_builtin).toMatchObject({
      available: false,
      reasonCode: "blocked-by-security-matrix",
      contractReason: "blocked",
    });
    expect(listRes.payload?.visibility?.goal_init).toMatchObject({
      available: false,
      reasonCode: "conversation-restricted",
    });
    expect(listRes.payload?.mcpVisibility?.demo).toMatchObject({
      available: false,
      reasonCode: "disabled-by-settings",
    });
    expect(listRes.payload?.pluginVisibility?.["demo-plugin"]).toMatchObject({
      available: false,
      reasonCode: "disabled-by-settings",
    });
    expect(listRes.payload?.skillVisibility?.["available-skill"]).toMatchObject({
      available: true,
      reasonCode: "available",
      eligible: true,
    });
    expect(listRes.payload?.skillVisibility?.["disabled-skill"]).toMatchObject({
      available: false,
      reasonCode: "disabled-by-settings",
      eligible: true,
    });
    expect(listRes.payload?.skillVisibility?.["ineligible-skill"]).toMatchObject({
      available: false,
      reasonCode: "not-eligible",
      eligible: false,
      eligibilityReasons: ["missing env: DEMO_TOKEN"],
    });
    expect(listRes.payload?.extensions?.summary).toEqual({
      pluginCount: 1,
      disabledPluginCount: 1,
      pluginToolCount: 1,
      pluginLoadErrorCount: 0,
      skillCount: 3,
      disabledSkillCount: 1,
      ineligibleSkillCount: 1,
      promptSkillCount: 0,
      searchableSkillCount: 1,
    });
    expect(listRes.payload?.extensions?.plugins).toEqual([
      expect.objectContaining({
        id: "demo-plugin",
        disabled: true,
        toolNames: ["plugin_demo_tool"],
      }),
    ]);
    expect(listRes.payload?.extensions?.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "available-skill",
        source: "bundled",
        disabled: false,
        eligible: true,
      }),
      expect.objectContaining({
        name: "disabled-skill",
        disabled: true,
        eligible: true,
      }),
      expect.objectContaining({
        name: "ineligible-skill",
        disabled: false,
        eligible: false,
        eligibilityReasons: ["missing env: DEMO_TOKEN"],
      }),
    ]));
    expect(listRes.payload?.extensions?.registry).toEqual({
      pluginToolRegistrations: [
        {
          pluginId: "demo-plugin",
          toolNames: ["plugin_demo_tool"],
          disabled: true,
        },
      ],
      skillManagementTools: [
        { name: "skills_list", shouldRegister: true, reasonCode: "available" },
        { name: "skills_search", shouldRegister: true, reasonCode: "available" },
        { name: "skill_get", shouldRegister: true, reasonCode: "available" },
      ],
      promptSkillNames: [],
      searchableSkillNames: ["available-skill"],
    });
    expect(listRes.payload?.extensionGovernance?.summary).toEqual({
      installedExtensionCount: 2,
      installedEnabledExtensionCount: 1,
      installedDisabledExtensionCount: 1,
      installedBrokenExtensionCount: 0,
      loadedMarketplaceExtensionCount: 1,
      loadedMarketplacePluginCount: 1,
      loadedMarketplaceSkillPackCount: 0,
      runtimePolicyDisabledPluginCount: 1,
      runtimePolicyDisabledSkillCount: 1,
    });
    expect(listRes.payload?.extensionGovernance?.layers).toMatchObject({
      installedLedger: {
        enabledExtensionIds: ["demo-plugin@official-market"],
        disabledExtensionIds: ["ops-skills@official-market"],
      },
      hostLoad: {
        lifecycleAvailable: true,
        loadedMarketplaceExtensionCount: 1,
      },
      runtimePolicy: {
        disabledPluginIds: ["demo-plugin"],
        disabledSkillNames: ["disabled-skill"],
      },
    });
    expect(listRes.payload?.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "available-skill",
        eligible: true,
      }),
      expect.objectContaining({
        name: "disabled-skill",
        eligible: true,
      }),
      expect.objectContaining({
        name: "ineligible-skill",
        eligible: false,
        eligibilityReasons: ["missing env: DEMO_TOKEN"],
      }),
    ]));
    expect(listRes.payload?.toolControl).toMatchObject({
      mode: "confirm",
      requiresConfirmation: true,
      hasConfirmPassword: false,
    });
    expect(listRes.payload?.toolControl?.pendingRequest).toMatchObject({
      requestId: "ABCDE",
      conversationId: "conv-visibility",
      summary: ["关闭 builtin: alpha_builtin"],
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("tools.list resolves launch runtime visibility from subtask taskId", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir);
  await subTaskRuntimeStore.load();
  const repoRoot = path.join(stateDir, "demo-repo");
  const requestedCwd = path.join(repoRoot, "src");
  const worktreeRoot = path.join(stateDir, "virtual-worktree", "demo-repo");
  const resolvedCwd = path.join(worktreeRoot, "src");

  const task = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-runtime",
      agentId: "coder",
      instruction: "Inspect launch runtime visibility",
      cwd: requestedCwd,
      toolSet: ["goal_init", "write_tool"],
      permissionMode: "plan",
      isolationMode: "worktree",
    },
  });
  await subTaskRuntimeStore.updateTaskLaunchSpec(task.id, {
    launchSpec: normalizeAgentLaunchSpec({
      parentConversationId: "conv-runtime",
      agentId: "coder",
      instruction: "Inspect launch runtime visibility",
      cwd: resolvedCwd,
      toolSet: ["goal_init", "write_tool"],
      permissionMode: "plan",
      isolationMode: "worktree",
    }),
    runtimeSummary: {
      requestedCwd,
      resolvedCwd,
      worktreePath: worktreeRoot,
      worktreeRepoRoot: repoRoot,
      worktreeBranch: "belldandy-task_runtime",
      worktreeStatus: "created",
    },
  });

  const toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("goal_init"),
      createContractedTestTool("alpha_builtin"),
      createWriteContractedTestTool("write_tool"),
      createContractedTestTool("plugin_demo_tool"),
      createContractedTestTool("mcp_demo_ping"),
    ],
    workspaceRoot: process.cwd(),
  });
  const pluginRegistry = new PluginRegistry();
  ((pluginRegistry as any).plugins).set("demo-plugin", {
    id: "demo-plugin",
    name: "Demo Plugin",
    activate: async () => {},
  });
  ((pluginRegistry as any).pluginToolMap).set("demo-plugin", ["plugin_demo_tool"]);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolExecutor,
    toolsConfigManager: await (async () => {
      const manager = new ToolsConfigManager(stateDir);
      await manager.load();
      return manager;
    })(),
    subTaskRuntimeStore,
    pluginRegistry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "tools-list-task-runtime",
      method: "tools.list",
      params: {
        taskId: task.id,
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-task-runtime"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-task-runtime");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.visibilityContext).toMatchObject({
      agentId: "coder",
      conversationId: "conv-runtime",
      taskId: task.id,
      launchSpec: {
        permissionMode: "plan",
        isolationMode: "worktree",
        cwd: requestedCwd,
        resolvedCwd,
        worktreePath: worktreeRoot,
        worktreeStatus: "created",
      },
    });
    expect(listRes.payload?.visibility?.goal_init).toMatchObject({
      available: true,
      reasonCode: "available",
    });
    expect(listRes.payload?.visibility?.alpha_builtin).toMatchObject({
      available: false,
      reasonCode: "excluded-by-launch-toolset",
    });
    expect(listRes.payload?.visibility?.write_tool).toMatchObject({
      available: false,
      reasonCode: "blocked-by-launch-permission-mode",
    });
    expect(listRes.payload?.mcpVisibility?.demo).toMatchObject({
      available: false,
      reasonCode: "excluded-by-launch-toolset",
    });
    expect(listRes.payload?.pluginVisibility?.["demo-plugin"]).toMatchObject({
      available: false,
      reasonCode: "excluded-by-launch-toolset",
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

  const targetTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-subtask",
      agentId: "coder",
      instruction: "Implement structured task runtime",
      timeoutMs: 90_000,
      channel: "goal",
      toolSet: ["read", "edit"],
    },
  });
  await subTaskRuntimeStore.markQueued(targetTask.id, 1);
  await subTaskRuntimeStore.attachSession(targetTask.id, "sub_task_1");
  await subTaskRuntimeStore.completeTask(targetTask.id, {
    status: "done",
    sessionId: "sub_task_1",
    output: "structured runtime finished",
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
      }),
    });
    expect(getRes.payload?.outputContent).toBe("structured runtime finished");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("subtask.stop and subtask.archive manage task runtime visibility", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir);
  await subTaskRuntimeStore.load();

  const runningTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-stop",
      agentId: "coder",
      instruction: "Need manual stop",
      channel: "subtask",
    },
  });
  await subTaskRuntimeStore.attachSession(runningTask.id, "sub_stop_1");

  const doneTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-stop",
      agentId: "reviewer",
      instruction: "Can be archived",
    },
  });
  await subTaskRuntimeStore.completeTask(doneTask.id, {
    status: "done",
    output: "finished already",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    subTaskRuntimeStore,
    stopSubTask: async (taskId, reason) => subTaskRuntimeStore.markStopped(taskId, {
      reason: reason ?? "Stopped from RPC.",
      sessionId: "sub_stop_1",
    }),
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-stop",
      method: "subtask.stop",
      params: { taskId: runningTask.id, reason: "User requested stop" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-stop"));

    const stopRes = frames.find((f) => f.type === "res" && f.id === "subtask-stop");
    expect(stopRes.ok).toBe(true);
    expect(stopRes.payload?.item).toMatchObject({
      id: runningTask.id,
      status: "stopped",
      stopReason: "User requested stop",
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-archive",
      method: "subtask.archive",
      params: { taskId: doneTask.id, reason: "Clean up finished task" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-archive"));

    const archiveRes = frames.find((f) => f.type === "res" && f.id === "subtask-archive");
    expect(archiveRes.ok).toBe(true);
    expect(archiveRes.payload?.item).toMatchObject({
      id: doneTask.id,
      archiveReason: "Clean up finished task",
      archivedAt: expect.any(Number),
    });

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-list-default",
      method: "subtask.list",
      params: { conversationId: "conv-stop" },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-list-default"));

    const defaultListRes = frames.find((f) => f.type === "res" && f.id === "subtask-list-default");
    expect(defaultListRes.ok).toBe(true);
    expect(defaultListRes.payload?.items).toEqual([
      expect.objectContaining({
        id: runningTask.id,
        status: "stopped",
      }),
    ]);

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-list-archived",
      method: "subtask.list",
      params: { conversationId: "conv-stop", includeArchived: true },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-list-archived"));

    const archivedListRes = frames.find((f) => f.type === "res" && f.id === "subtask-list-archived");
    expect(archivedListRes.ok).toBe(true);
    expect(archivedListRes.payload?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: runningTask.id, status: "stopped" }),
      expect.objectContaining({ id: doneTask.id, archivedAt: expect.any(Number) }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes recent subtask query runtime lifecycle traces", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir);
  await subTaskRuntimeStore.load();

  const runningTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-subtask-trace",
      agentId: "coder",
      instruction: "Need runtime trace",
      channel: "subtask",
    },
  });
  await subTaskRuntimeStore.attachSession(runningTask.id, "sub_trace_1");

  const doneTask = await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "conv-subtask-trace",
      agentId: "reviewer",
      instruction: "Archive me",
    },
  });
  await subTaskRuntimeStore.completeTask(doneTask.id, {
    status: "done",
    output: "archivable output",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    subTaskRuntimeStore,
    stopSubTask: async (taskId, reason) => subTaskRuntimeStore.markStopped(taskId, {
      reason: reason ?? "Stopped from trace test.",
      sessionId: "sub_trace_1",
    }),
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-trace-list",
      method: "subtask.list",
      params: { conversationId: "conv-subtask-trace", includeArchived: true },
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-trace-get",
      method: "subtask.get",
      params: { taskId: doneTask.id },
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-trace-stop",
      method: "subtask.stop",
      params: { taskId: runningTask.id, reason: "Stop for trace" },
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "subtask-trace-archive",
      method: "subtask.archive",
      params: { taskId: doneTask.id, reason: "Archive for trace" },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-trace-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-trace-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-trace-stop"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "subtask-trace-archive"));

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-subtask-trace", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-subtask-trace"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-subtask-trace");

    expect(response.ok).toBe(true);
    const traces = response.payload?.queryRuntime?.traces ?? [];
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        traceId: "subtask-trace-list",
        method: "subtask.list",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "subtask-trace-get",
        method: "subtask.get",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "subtask-trace-stop",
        method: "subtask.stop",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "subtask-trace-archive",
        method: "subtask.archive",
        status: "completed",
      }),
    ]));

    const stopTrace = traces.find((item: any) => item.traceId === "subtask-trace-stop");
    const archiveTrace = traces.find((item: any) => item.traceId === "subtask-trace-archive");
    expect(stopTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "task_loaded",
      "task_stopped",
      "completed",
    ]));
    expect(archiveTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "task_loaded",
      "task_archived",
      "completed",
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("tools.update ignores tool_settings_control in disabled builtin list", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const confirmationStore = new ToolControlConfirmationStore();
  let toolExecutor!: ToolExecutor;
  toolExecutor = new ToolExecutor({
    tools: [
      createTestTool("alpha_builtin"),
      createToolSettingsControlTool({
        toolsConfigManager,
        getControlMode: () => "auto",
        listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
        confirmationStore,
      }),
    ],
    workspaceRoot: process.cwd(),
    alwaysEnabledTools: [TOOL_SETTINGS_CONTROL_NAME],
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

    ws.send(JSON.stringify({
      type: "req",
      id: "tools-update-filter-control",
      method: "tools.update",
      params: {
        disabled: {
          builtin: [TOOL_SETTINGS_CONTROL_NAME, "alpha_builtin"],
        },
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-update-filter-control"));
    const updateRes = frames.find((f) => f.type === "res" && f.id === "tools-update-filter-control");
    expect(updateRes.ok).toBe(true);
    expect(toolsConfigManager.getConfig().disabled.builtin).toEqual(["alpha_builtin"]);

    ws.send(JSON.stringify({ type: "req", id: "tools-list-filter-control", method: "tools.list", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-filter-control"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-filter-control");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.disabled?.builtin).toEqual(["alpha_builtin"]);
    expect(listRes.payload?.disabled?.builtin).not.toContain(TOOL_SETTINGS_CONTROL_NAME);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("message.send emits tools.config.updated when agent changes tool settings", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();

  const confirmationStore = new ToolControlConfirmationStore();
  let toolExecutor!: ToolExecutor;
  let gatewayServer!: Awaited<ReturnType<typeof startGatewayServer>>;

  toolExecutor = new ToolExecutor({
    tools: [
      createTestTool("alpha_builtin"),
      createToolSettingsControlTool({
        toolsConfigManager,
        getControlMode: () => "auto",
        listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
        confirmationStore,
      }),
    ],
    workspaceRoot: process.cwd(),
    alwaysEnabledTools: [TOOL_SETTINGS_CONTROL_NAME],
  });

  const agent: BelldandyAgent = {
    async *run(input) {
      yield { type: "status", status: "running" as const };
      const request = {
        id: "tool-call-1",
        name: TOOL_SETTINGS_CONTROL_NAME,
        arguments: {
          action: "apply",
          disableBuiltin: ["alpha_builtin"],
        },
      };
      yield {
        type: "tool_call" as const,
        id: request.id,
        name: request.name,
        arguments: request.arguments,
      };
      const result = await toolExecutor.execute(request, input.conversationId, input.agentId, input.userUuid, input.senderInfo, input.roomContext);
      yield {
        type: "tool_result" as const,
        id: result.id,
        name: result.name,
        success: result.success,
        output: result.output,
        error: result.error,
      };
      yield {
        type: "usage" as const,
        systemPromptTokens: 1,
        contextTokens: 2,
        inputTokens: 3,
        outputTokens: 4,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        modelCalls: 1,
      };
      yield { type: "final", text: "tool settings updated" };
      yield { type: "status", status: "done" as const };
    },
  };

  gatewayServer = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    toolsConfigManager,
    toolExecutor,
    agentFactory: () => agent,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${gatewayServer.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "message-send-tool-settings-update",
      method: "message.send",
      params: {
        text: "please update tool settings",
        conversationId: "conv-tool-settings-update",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "message-send-tool-settings-update" && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "tool_result"));
    const toolResultEvent = frames.find((f) => f.type === "event" && f.event === "tool_result");
    expect(toolResultEvent?.payload?.success).toBe(true);
    expect(toolsConfigManager.getConfig().disabled.builtin).toEqual(["alpha_builtin"]);
    await waitFor(
      () => frames.some((f) => f.type === "event" && f.event === "tools.config.updated"),
      1000,
    );
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));

    const configUpdatedEvent = frames.find((f) => f.type === "event" && f.event === "tools.config.updated");
    expect(configUpdatedEvent?.payload).toEqual({
      source: "agent",
      mode: "auto",
      disabled: {
        builtin: ["alpha_builtin"],
        mcp_servers: [],
        plugins: [],
        skills: [],
      },
    });

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-tool-side-effects", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-tool-side-effects"));
    const doctorRes = frames.find((f) => f.type === "res" && f.id === "system-doctor-tool-side-effects");
    const traces = doctorRes.payload?.queryRuntime?.traces ?? [];
    const runtimeTrace = traces.find((item: any) => item.traceId === "message-send-tool-settings-update");
    expect(runtimeTrace).toMatchObject({
      method: "message.send",
      status: "completed",
      conversationId: "conv-tool-settings-update",
    });
    expect(runtimeTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "tool_result_emitted",
      "tool_event_emitted",
      "task_result_recorded",
      "completed",
    ]));

    ws.send(JSON.stringify({ type: "req", id: "tools-list-after-agent-update", method: "tools.list", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-list-after-agent-update"));
    const listRes = frames.find((f) => f.type === "res" && f.id === "tools-list-after-agent-update");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload?.disabled?.builtin).toEqual(["alpha_builtin"]);
  } finally {
    ws.close();
    await closeP;
    await gatewayServer.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("memory viewer rpc returns task and memory data", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-workspace-"));
  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    taskMemoryEnabled: true,
  });
  (memoryManager as any).embeddingProvider = {
    modelName: "test-memory-viewer",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };

  await fs.promises.writeFile(path.join(workspaceRoot, "MEMORY.md"), "# Belldandy\nMemory viewer test content.\n", "utf-8");
  await memoryManager.indexWorkspace();
  (memoryManager as any).store.upsertChunk({
    id: "chunk-category-decision",
    sourcePath: "memory/category-decision.md",
    sourceType: "manual",
    memoryType: "other",
    content: "phase4decision marker: complete category minimum loop first.",
    category: "decision",
  });
  (memoryManager as any).store.upsertChunk({
    id: "chunk-topic-viewer",
    sourcePath: "memory/topic-viewer.md",
    sourceType: "manual",
    memoryType: "other",
    content: "viewer topic marker: topic filtered memory for rpc viewer.",
    topic: "viewer-audit",
    visibility: "shared",
  });
  registerGlobalMemoryManager(memoryManager);

  const recentChunk = memoryManager.getRecent(5).find((item) => item.sourcePath.endsWith("MEMORY.md")) ?? memoryManager.getRecent(1)[0];
  expect(recentChunk?.id).toBeTruthy();

  const startedTaskId = memoryManager.startTaskCapture({
    conversationId: "conv-memory-viewer",
    sessionKey: "session-memory-viewer",
    source: "chat",
    objective: "Implement memory viewer",
    metadata: {
      goalId: "goal_memory_viewer",
      goalSession: true,
    },
  });
  expect(startedTaskId).toBeTruthy();
  if (recentChunk?.id) {
    memoryManager.linkTaskMemories("conv-memory-viewer", [recentChunk.id, "chunk-topic-viewer"], "used");
  }
  memoryManager.recordTaskToolCall("conv-memory-viewer", {
    toolName: "memory_search",
    success: true,
    durationMs: 120,
  });
  const completedTaskId = memoryManager.completeTaskCapture({
    conversationId: "conv-memory-viewer",
    success: true,
    durationMs: 1200,
    messages: [{ type: "usage", inputTokens: 12, outputTokens: 8 }],
  });
  expect(completedTaskId).toBeTruthy();
  const methodCandidate = memoryManager.promoteTaskToMethodCandidate(completedTaskId!);
  expect(methodCandidate?.candidate.id).toBeTruthy();
  const acceptedMethodCandidate = memoryManager.acceptExperienceCandidate(methodCandidate!.candidate.id);
  expect(acceptedMethodCandidate?.publishedPath).toBeTruthy();
  (memoryManager as any).store.createTask({
    id: "task-non-goal-viewer",
    conversationId: "conv-memory-viewer-other",
    sessionKey: "session-memory-viewer-other",
    source: "manual",
    status: "success",
    title: "Unrelated maintenance task",
    objective: "should not appear in goal-filtered task list",
    startedAt: "2026-03-16T00:05:00.000Z",
    finishedAt: "2026-03-16T00:05:10.000Z",
    createdAt: "2026-03-16T00:05:00.000Z",
    updatedAt: "2026-03-16T00:05:10.000Z",
  });
  (memoryManager as any).store.createExperienceUsage({
    id: "usage-viewer-method",
    taskId: completedTaskId!,
    assetType: "method",
    assetKey: path.basename(acceptedMethodCandidate!.publishedPath!),
    sourceCandidateId: methodCandidate!.candidate.id,
    usedVia: "tool",
    createdAt: "2026-03-16T00:00:01.000Z",
  });
  (memoryManager as any).store.createExperienceUsage({
    id: "usage-viewer-skill",
    taskId: completedTaskId!,
    assetType: "skill",
    assetKey: "Viewer Skill",
    usedVia: "search",
    createdAt: "2026-03-16T00:00:02.000Z",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    additionalWorkspaceRoots: [workspaceRoot],
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({ type: "req", id: "memory-stats", method: "memory.stats" }));
    ws.send(JSON.stringify({ type: "req", id: "memory-stats-with-recent", method: "memory.stats", params: { includeRecentTasks: true } }));
    ws.send(JSON.stringify({ type: "req", id: "task-list", method: "memory.task.list", params: { limit: 5, summaryOnly: true } }));
    ws.send(JSON.stringify({ type: "req", id: "task-list-goal", method: "memory.task.list", params: { limit: 5, summaryOnly: true, filter: { goalId: "goal_memory_viewer" } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent", method: "memory.recent", params: { limit: 5, includeContent: false } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent-uncategorized", method: "memory.recent", params: { limit: 5, includeContent: false, filter: { uncategorized: true } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-search", method: "memory.search", params: { query: "viewer", limit: 5, includeContent: false } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-search-topic", method: "memory.search", params: { query: "viewer topic", limit: 5, includeContent: false, filter: { topic: "viewer-audit" } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent-category", method: "memory.recent", params: { limit: 5, includeContent: false, filter: { category: "decision" } } }));
    ws.send(JSON.stringify({ type: "req", id: "usage-list", method: "experience.usage.list", params: { limit: 10, filter: { taskId: completedTaskId } } }));
    ws.send(JSON.stringify({ type: "req", id: "usage-stats", method: "experience.usage.stats", params: { limit: 10, filter: { assetType: "method" } } }));
    ws.send(JSON.stringify({ type: "req", id: "usage-get", method: "experience.usage.get", params: { usageId: "usage-viewer-method" } }));
    ws.send(JSON.stringify({ type: "req", id: "candidate-get", method: "experience.candidate.get", params: { candidateId: methodCandidate!.candidate.id } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-stats"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-stats-with-recent"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-list-goal"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent-uncategorized"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-search"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-search-topic"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent-category"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-stats"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-get"));

    const taskListRes = frames.find((f) => f.type === "res" && f.id === "task-list");
    const taskListGoalRes = frames.find((f) => f.type === "res" && f.id === "task-list-goal");
    const memoryRecentRes = frames.find((f) => f.type === "res" && f.id === "memory-recent");
    const memoryRecentUncategorizedRes = frames.find((f) => f.type === "res" && f.id === "memory-recent-uncategorized");
    const memorySearchRes = frames.find((f) => f.type === "res" && f.id === "memory-search");
    const memorySearchTopicRes = frames.find((f) => f.type === "res" && f.id === "memory-search-topic");
    const memoryRecentCategoryRes = frames.find((f) => f.type === "res" && f.id === "memory-recent-category");
    const statsRes = frames.find((f) => f.type === "res" && f.id === "memory-stats");
    const statsWithRecentRes = frames.find((f) => f.type === "res" && f.id === "memory-stats-with-recent");
    const usageListRes = frames.find((f) => f.type === "res" && f.id === "usage-list");
    const usageStatsRes = frames.find((f) => f.type === "res" && f.id === "usage-stats");
    const usageGetRes = frames.find((f) => f.type === "res" && f.id === "usage-get");
    const candidateGetRes = frames.find((f) => f.type === "res" && f.id === "candidate-get");

    expect(statsRes.ok).toBe(true);
    expect(statsRes.payload.status.chunks).toBeGreaterThan(0);
    expect(statsRes.payload.status.categorized).toBeGreaterThan(0);
    expect(statsRes.payload.status.uncategorized).toBeGreaterThan(0);
    expect(statsRes.payload.status.categoryBuckets.decision).toBeGreaterThan(0);
    expect(statsRes.payload.recentTasks).toBeUndefined();
    expect(statsRes.payload.queryView.scope).toBe("private");
    expect(statsWithRecentRes.ok).toBe(true);
    expect(Array.isArray(statsWithRecentRes.payload.recentTasks)).toBe(true);
    expect(statsWithRecentRes.payload.recentTasks.length).toBeGreaterThan(0);
    expect(taskListRes.ok).toBe(true);
    expect(taskListRes.payload.items.length).toBeGreaterThan(0);
    expect(taskListRes.payload.items[0].toolCalls).toBeUndefined();
    expect(taskListRes.payload.items[0].artifactPaths).toBeUndefined();
    expect(taskListGoalRes.ok).toBe(true);
    expect(taskListGoalRes.payload.items.length).toBeGreaterThan(0);
    expect(taskListGoalRes.payload.items.every((item: any) => item?.metadata?.goalId === "goal_memory_viewer")).toBe(true);
    expect(taskListGoalRes.payload.items.some((item: any) => item?.id === "task-non-goal-viewer")).toBe(false);
    expect(memoryRecentRes.ok).toBe(true);
    expect(memoryRecentRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentRes.payload.items[0].content).toBeUndefined();
    expect(memoryRecentRes.payload.items[0].sourceView.scope).toBeTruthy();
    expect(memoryRecentUncategorizedRes.ok).toBe(true);
    expect(memoryRecentUncategorizedRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentUncategorizedRes.payload.items[0].category).toBeUndefined();
    expect(memoryRecentUncategorizedRes.payload.items[0].content).toBeUndefined();
    expect(memorySearchRes.ok).toBe(true);
    expect(Array.isArray(memorySearchRes.payload.items)).toBe(true);
    expect(memorySearchRes.payload.items.every((item: any) => item.content === undefined)).toBe(true);
    expect(memorySearchTopicRes.ok).toBe(true);
    expect(memorySearchTopicRes.payload.items.length).toBeGreaterThan(0);
    expect(memorySearchTopicRes.payload.items.every((item: any) => item.sourcePath === "memory/topic-viewer.md")).toBe(true);
    expect(memorySearchTopicRes.payload.items[0].content).toBeUndefined();
    expect(memorySearchTopicRes.payload.items[0].sourceView.scope).toBe("shared");
    expect(memoryRecentCategoryRes.ok).toBe(true);
    expect(memoryRecentCategoryRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentCategoryRes.payload.items[0].category).toBe("decision");
    expect(memoryRecentCategoryRes.payload.items[0].content).toBeUndefined();
    expect(memoryRecentCategoryRes.payload.items[0].sourceView.scope).toBe("private");
    expect(usageListRes.ok).toBe(true);
    expect(usageListRes.payload.items.length).toBe(2);
    const methodUsageItem = usageListRes.payload.items.find((item: any) => item.sourceCandidateId === methodCandidate!.candidate.id);
    expect(methodUsageItem?.sourceView.scope).toBe("hybrid");
    expect(usageStatsRes.ok).toBe(true);
    expect(usageStatsRes.payload.items[0].assetKey).toBe(path.basename(acceptedMethodCandidate!.publishedPath!));
    expect(usageStatsRes.payload.items[0].usageCount).toBeGreaterThan(0);
    expect(usageStatsRes.payload.items[0].sourceCandidateId).toBe(methodCandidate!.candidate.id);
    expect(usageStatsRes.payload.items[0].sourceCandidatePublishedPath).toBe(acceptedMethodCandidate!.publishedPath);
    expect(usageStatsRes.payload.items[0].sourceView.scope).toBe("hybrid");
    expect(usageGetRes.ok).toBe(true);
    expect(usageGetRes.payload.usage.id).toBe("usage-viewer-method");
    expect(usageGetRes.payload.usage.sourceCandidateId).toBe(methodCandidate!.candidate.id);
    expect(usageGetRes.payload.usage.sourceView.scope).toBe("hybrid");
    expect(candidateGetRes.ok).toBe(true);
    expect(candidateGetRes.payload.candidate.id).toBe(methodCandidate!.candidate.id);
    expect(candidateGetRes.payload.candidate.publishedPath).toBe(acceptedMethodCandidate!.publishedPath);
    expect(candidateGetRes.payload.candidate.sourceView.scope).toBe("hybrid");
    expect(candidateGetRes.payload.candidate.sourceTaskSnapshot.memoryLinks.some((item: any) => item.sourceView.scope === "shared")).toBe(true);

    const usageIdToRevoke = usageListRes.payload.items[0].id;
    ws.send(JSON.stringify({ type: "req", id: "usage-revoke", method: "experience.usage.revoke", params: { usageId: usageIdToRevoke } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-revoke"));
    const usageRevokeRes = frames.find((f) => f.type === "res" && f.id === "usage-revoke");
    ws.send(JSON.stringify({ type: "req", id: "usage-list-after-revoke", method: "experience.usage.list", params: { limit: 10, filter: { taskId: completedTaskId } } }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "usage-list-after-revoke"));
    const usageListAfterRevokeRes = frames.find((f) => f.type === "res" && f.id === "usage-list-after-revoke");
    expect(usageRevokeRes.ok).toBe(true);
    expect(usageRevokeRes.payload.revoked).toBe(true);
    expect(usageRevokeRes.payload.usage.id).toBe(usageIdToRevoke);
    expect(usageListAfterRevokeRes.ok).toBe(true);
    expect(usageListAfterRevokeRes.payload.items.length).toBe(1);
    const revokedAssetType = usageRevokeRes.payload.usage.assetType;

    const taskId = taskListRes.payload.items[0].id;
    const chunkId = memoryRecentCategoryRes.payload.items[0].id;

    ws.send(JSON.stringify({ type: "req", id: "task-get", method: "memory.task.get", params: { taskId } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-get", method: "memory.get", params: { chunkId } }));
    ws.send(JSON.stringify({ type: "req", id: "source-read", method: "workspace.readSource", params: { path: recentChunk.sourcePath } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-get"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "source-read"));

    const taskGetRes = frames.find((f) => f.type === "res" && f.id === "task-get");
    const memoryGetRes = frames.find((f) => f.type === "res" && f.id === "memory-get");
    const sourceReadRes = frames.find((f) => f.type === "res" && f.id === "source-read");

    expect(taskGetRes.ok).toBe(true);
    expect(taskGetRes.payload.task.memoryLinks.length).toBeGreaterThan(0);
    expect(taskGetRes.payload.task.memoryLinks.some((item: any) => item.sourceView.scope === "shared")).toBe(true);
    expect(taskGetRes.payload.task.usedMethods.length + taskGetRes.payload.task.usedSkills.length).toBe(1);
    if (revokedAssetType === "method") {
      expect(taskGetRes.payload.task.usedMethods.length).toBe(0);
      expect(taskGetRes.payload.task.usedSkills.length).toBe(1);
      expect(taskGetRes.payload.task.usedSkills[0].assetKey).toBe("Viewer Skill");
    } else {
      expect(taskGetRes.payload.task.usedMethods.length).toBe(1);
      expect(taskGetRes.payload.task.usedMethods[0].assetKey).toBe(path.basename(acceptedMethodCandidate!.publishedPath!));
      expect(taskGetRes.payload.task.usedMethods[0].sourceCandidateId).toBe(methodCandidate!.candidate.id);
      expect(taskGetRes.payload.task.usedMethods[0].sourceCandidatePublishedPath).toBe(acceptedMethodCandidate!.publishedPath);
      expect(taskGetRes.payload.task.usedSkills.length).toBe(0);
    }
    expect(memoryGetRes.ok).toBe(true);
    expect(memoryGetRes.payload.item.category).toBe("decision");
    expect(memoryGetRes.payload.item.content).toContain("phase4decision");
    expect(memoryGetRes.payload.item.sourceView.scope).toBe("private");
    expect(sourceReadRes.ok).toBe(true);
    expect(sourceReadRes.payload.readOnly).toBe(true);
    expect(sourceReadRes.payload.content).toContain("Memory viewer test content");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("experience candidate rpc lists and updates candidate status", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-experience-workspace-"));
  const skillRegistry = new SkillRegistry();
  const memoryManager = new MemoryManager({
    workspaceRoot,
    stateDir,
    taskMemoryEnabled: true,
  });

  const now = "2026-03-15T00:00:00.000Z";
  (memoryManager as any).store.createTask({
    id: "task-experience-1",
    conversationId: "conv-experience-1",
    sessionKey: "session-experience-1",
    source: "chat",
    status: "success",
    title: "收敛第五阶段方案",
    objective: "为第五阶段生成候选层闭环",
    summary: "已经梳理出候选层数据结构与接口边界。",
    reflection: "先做候选层，再做发布链路，能避免污染正式资产。",
    toolCalls: [{ toolName: "memory_search", success: true, durationMs: 90 }],
    artifactPaths: ["MemOS对比分析.md"],
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const methodCandidate = memoryManager.promoteTaskToMethodCandidate("task-experience-1");
  const skillCandidate = memoryManager.promoteTaskToSkillCandidate("task-experience-1");
  expect(methodCandidate?.candidate.id).toBeTruthy();
  expect(skillCandidate?.candidate.id).toBeTruthy();

  registerGlobalMemoryManager(memoryManager);

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    additionalWorkspaceRoots: [workspaceRoot],
    skillRegistry,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-list",
      method: "experience.candidate.list",
      params: { limit: 10, filter: { status: "draft" } },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-list"));

    const listRes = frames.find((f) => f.type === "res" && f.id === "candidate-list");
    expect(listRes.ok).toBe(true);
    expect(listRes.payload.items.length).toBe(2);

    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-accept",
      method: "experience.candidate.accept",
      params: { candidateId: methodCandidate!.candidate.id },
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-skill-accept",
      method: "experience.candidate.accept",
      params: { candidateId: skillCandidate!.candidate.id },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-accept"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-skill-accept"));

    const acceptRes = frames.find((f) => f.type === "res" && f.id === "candidate-accept");
    const skillAcceptRes = frames.find((f) => f.type === "res" && f.id === "candidate-skill-accept");
    expect(acceptRes.ok).toBe(true);
    expect(acceptRes.payload.candidate.status).toBe("accepted");
    const acceptedCandidate = memoryManager.getExperienceCandidate(methodCandidate!.candidate.id);
    expect(acceptedCandidate?.publishedPath).toContain(path.join(stateDir, "methods"));
    const publishedContent = await fs.promises.readFile(acceptedCandidate!.publishedPath!, "utf-8");
    expect(publishedContent).toContain("# 收敛第五阶段方案 方法候选");

    expect(skillAcceptRes.ok).toBe(true);
    expect(skillAcceptRes.payload.candidate.status).toBe("accepted");
    const acceptedSkillCandidate = memoryManager.getExperienceCandidate(skillCandidate!.candidate.id);
    expect(acceptedSkillCandidate?.publishedPath).toContain(path.join(stateDir, "skills"));
    const publishedSkillContent = await fs.promises.readFile(acceptedSkillCandidate!.publishedPath!, "utf-8");
    expect(publishedSkillContent).toContain("name:");
    expect(skillRegistry.getSkill("收敛第五阶段方案 技能草稿")).toBeTruthy();

    ws.send(JSON.stringify({
      type: "req",
      id: "candidate-accept-again",
      method: "experience.candidate.accept",
      params: { candidateId: methodCandidate!.candidate.id },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "candidate-accept-again"));

    const invalidAcceptRes = frames.find((f) => f.type === "res" && f.id === "candidate-accept-again");
    expect(invalidAcceptRes.ok).toBe(false);
    expect(invalidAcceptRes.error.code).toBe("invalid_state");
    expect(invalidAcceptRes.error.message).toContain("Current status: accepted");
  } finally {
    ws.close();
    await closeP;
    await server.close();
    memoryManager.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => { });
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => { });
  }
});

test("gateway rejects origin prefix spoofing", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://localhost.attacker.tld" });
  ws.on("error", () => {});
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  await closeP;
  expect(ws.readyState).toBe(WebSocket.CLOSED);

  await server.close();
  await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("workspace methods reject sibling-prefix path traversal", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-state-"));
  const parentDir = path.dirname(stateDir);
  const siblingDir = path.join(parentDir, `${path.basename(stateDir)}_evil`);
  await fs.promises.mkdir(siblingDir, { recursive: true });
  await fs.promises.writeFile(path.join(siblingDir, "leak.md"), "secret", "utf-8");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
  await waitFor(() => frames.some((f) => f.type === "hello-ok"));

  // 先触发 pairing challenge 并批准
  ws.send(JSON.stringify({ type: "req", id: "pairing-init", method: "message.send", params: { text: "ping" } }));
  await waitFor(() => frames.some((f) => f.type === "event" && f.event === "pairing.required"));
  const pairing = frames.find((f) => f.type === "event" && f.event === "pairing.required");
  const code = pairing?.payload?.code ? String(pairing.payload.code) : "";
  expect(code.length).toBeGreaterThan(0);
  const approved = await approvePairingCode({ code, stateDir });
  expect(approved.ok).toBe(true);

  const siblingName = path.basename(siblingDir);
  const listPath = `../${siblingName}`;
  const readPath = `../${siblingName}/leak.md`;
  const writePath = `../${siblingName}/write.md`;

  ws.send(JSON.stringify({ type: "req", id: "ws-list", method: "workspace.list", params: { path: listPath } }));
  ws.send(JSON.stringify({ type: "req", id: "ws-read", method: "workspace.read", params: { path: readPath } }));
  ws.send(JSON.stringify({ type: "req", id: "ws-write", method: "workspace.write", params: { path: writePath, content: "x" } }));

  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "ws-list"));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "ws-read"));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "ws-write"));

  const listRes = frames.find((f) => f.type === "res" && f.id === "ws-list");
  const readRes = frames.find((f) => f.type === "res" && f.id === "ws-read");
  const writeRes = frames.find((f) => f.type === "res" && f.id === "ws-write");

  expect(listRes.ok).toBe(false);
  expect(listRes.error?.code).toBe("invalid_path");
  expect(readRes.ok).toBe(false);
  expect(readRes.error?.code).toBe("invalid_path");
  expect(writeRes.ok).toBe(false);
  expect(writeRes.error?.code).toBe("invalid_path");

  ws.close();
  await closeP;
  await server.close();
  await fs.promises.rm(siblingDir, { recursive: true, force: true }).catch(() => {});
  await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("workspace methods keep list/read/write behavior after async fs refactor", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  await fs.promises.mkdir(path.join(stateDir, "docs"), { recursive: true });
  await fs.promises.writeFile(path.join(stateDir, "docs", "note.md"), "# hello", "utf-8");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  await pairWebSocketClient(ws, frames, stateDir);

  ws.send(JSON.stringify({ type: "req", id: "workspace-list-ok", method: "workspace.list", params: { path: "docs" } }));
  ws.send(JSON.stringify({ type: "req", id: "workspace-read-ok", method: "workspace.read", params: { path: "docs/note.md" } }));
  ws.send(JSON.stringify({ type: "req", id: "workspace-write-ok", method: "workspace.write", params: { path: "docs/generated.md", content: "generated" } }));

  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-list-ok"));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-read-ok"));
  await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-write-ok"));

  const listRes = frames.find((f) => f.type === "res" && f.id === "workspace-list-ok");
  const readRes = frames.find((f) => f.type === "res" && f.id === "workspace-read-ok");
  const writeRes = frames.find((f) => f.type === "res" && f.id === "workspace-write-ok");

  expect(listRes.ok).toBe(true);
  expect(listRes.payload?.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "note.md", type: "file", path: "docs/note.md" }),
  ]));
  expect(readRes.ok).toBe(true);
  expect(readRes.payload?.content).toBe("# hello");
  expect(writeRes.ok).toBe(true);
  await expect(fs.promises.readFile(path.join(stateDir, "docs", "generated.md"), "utf-8")).resolves.toBe("generated");

  ws.close();
  await closeP;
  await server.close();
  await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
});

test("workspace.write blocks secret-like content under team shared memory paths", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "workspace-write-team-memory-secret",
      method: "workspace.write",
      params: {
        path: "team-memory/MEMORY.md",
        content: "共享记忆里不要存 token: ghp_123456789012345678901234567890123456",
      },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-write-team-memory-secret"));
    const response = frames.find((f) => f.type === "res" && f.id === "workspace-write-team-memory-secret");

    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe("secret_detected");
    expect(response.error?.message).toContain("GitHub PAT");
    await expect(fs.promises.readFile(path.join(stateDir, "team-memory", "MEMORY.md"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes recent workspace query runtime lifecycle traces", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  await fs.promises.mkdir(path.join(stateDir, "docs"), { recursive: true });
  await fs.promises.writeFile(path.join(stateDir, "docs", "note.md"), "# hello", "utf-8");

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({ type: "req", id: "workspace-trace-list", method: "workspace.list", params: { path: "docs" } }));
    ws.send(JSON.stringify({ type: "req", id: "workspace-trace-read", method: "workspace.read", params: { path: "docs/note.md" } }));
    ws.send(JSON.stringify({ type: "req", id: "workspace-trace-write", method: "workspace.write", params: { path: "docs/generated.md", content: "generated" } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-trace-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-trace-read"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-trace-write"));

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-workspace-trace", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-workspace-trace"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-workspace-trace");

    expect(response.ok).toBe(true);
    const traces = response.payload?.queryRuntime?.traces ?? [];
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        traceId: "workspace-trace-list",
        method: "workspace.list",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "workspace-trace-read",
        method: "workspace.read",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "workspace-trace-write",
        method: "workspace.write",
        status: "completed",
      }),
    ]));

    const listTrace = traces.find((item: any) => item.traceId === "workspace-trace-list");
    const readTrace = traces.find((item: any) => item.traceId === "workspace-trace-read");
    const writeTrace = traces.find((item: any) => item.traceId === "workspace-trace-write");
    expect(listTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "workspace_target_resolved",
      "workspace_listed",
      "completed",
    ]));
    expect(readTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "workspace_target_resolved",
      "workspace_read",
      "completed",
    ]));
    expect(writeTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "workspace_target_resolved",
      "workspace_written",
      "completed",
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes workspace.readSource and tools query runtime lifecycle traces", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-tools-workspace-"));
  await fs.promises.writeFile(path.join(workspaceRoot, "source.ts"), "export const value = 1;\n", "utf-8");

  const toolsConfigManager = new ToolsConfigManager(stateDir);
  await toolsConfigManager.load();
  const confirmationStore = new ToolControlConfirmationStore();
  let toolExecutor!: ToolExecutor;
  toolExecutor = new ToolExecutor({
    tools: [
      createContractedTestTool("alpha_builtin"),
      createContractedTestTool("beta_builtin"),
      createToolSettingsControlTool({
        toolsConfigManager,
        getControlMode: () => "auto",
        listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
        confirmationStore,
      }),
    ],
    workspaceRoot: process.cwd(),
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    additionalWorkspaceRoots: [workspaceRoot],
    toolsConfigManager,
    toolExecutor,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);

    ws.send(JSON.stringify({
      type: "req",
      id: "workspace-trace-read-source",
      method: "workspace.readSource",
      params: { path: path.join(workspaceRoot, "source.ts") },
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "tools-trace-list",
      method: "tools.list",
      params: {},
    }));
    ws.send(JSON.stringify({
      type: "req",
      id: "tools-trace-update",
      method: "tools.update",
      params: { disabled: { builtin: ["alpha_builtin"] } },
    }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "workspace-trace-read-source"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-trace-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "tools-trace-update"));

    ws.send(JSON.stringify({ type: "req", id: "system-doctor-tools-workspace-trace", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-tools-workspace-trace"));
    const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-tools-workspace-trace");

    expect(response.ok).toBe(true);
    const traces = response.payload?.queryRuntime?.traces ?? [];
    expect(traces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        traceId: "workspace-trace-read-source",
        method: "workspace.readSource",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "tools-trace-list",
        method: "tools.list",
        status: "completed",
      }),
      expect.objectContaining({
        traceId: "tools-trace-update",
        method: "tools.update",
        status: "completed",
      }),
    ]));

    const sourceTrace = traces.find((item: any) => item.traceId === "workspace-trace-read-source");
    const toolsListTrace = traces.find((item: any) => item.traceId === "tools-trace-list");
    const toolsUpdateTrace = traces.find((item: any) => item.traceId === "tools-trace-update");
    expect(sourceTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "workspace_target_resolved",
      "workspace_source_read",
      "completed",
    ]));
    expect(toolsListTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "tool_inventory_loaded",
      "tool_visibility_built",
      "completed",
    ]));
    expect(toolsUpdateTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
      "request_validated",
      "tool_settings_updated",
      "completed",
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("message.send rejects attachment larger than configured per-file limit", async () => {
  await withEnv({
    BELLDANDY_ATTACHMENT_MAX_FILE_BYTES: "8",
    BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES: "64",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);

      const reqId = "att-file-limit";
      ws.send(JSON.stringify({
        type: "req",
        id: reqId,
        method: "message.send",
        params: {
          text: "",
          attachments: [
            { name: "big.txt", type: "text/plain", base64: toBase64("123456789") },
          ],
        },
      }));

      await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId));
      const res = frames.find((f) => f.type === "res" && f.id === reqId);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe("invalid_params");
      expect(String(res.error?.message ?? "")).toContain("max file size");
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("message.send rejects attachments exceeding configured total limit", async () => {
  await withEnv({
    BELLDANDY_ATTACHMENT_MAX_FILE_BYTES: "16",
    BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES: "12",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);

      const reqId = "att-total-limit";
      ws.send(JSON.stringify({
        type: "req",
        id: reqId,
        method: "message.send",
        params: {
          text: "limit test",
          attachments: [
            { name: "a.txt", type: "text/plain", base64: toBase64("12345678") },
            { name: "b.txt", type: "text/plain", base64: toBase64("ABCDEFGH") },
          ],
        },
      }));

      await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId));
      const res = frames.find((f) => f.type === "res" && f.id === reqId);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe("invalid_params");
      expect(String(res.error?.message ?? "")).toContain("total size");
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("message.send accepts multiple attachments within configured limits", async () => {
  await withEnv({
    BELLDANDY_ATTACHMENT_MAX_FILE_BYTES: "32",
    BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES: "64",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);

      const reqId = "att-ok";
      ws.send(JSON.stringify({
        type: "req",
        id: reqId,
        method: "message.send",
        params: {
          text: "with attachments",
          attachments: [
            { name: "a.txt", type: "text/plain", base64: toBase64("hello-a") },
            { name: "b.txt", type: "text/plain", base64: toBase64("hello-b") },
          ],
        },
      }));

      await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId && f.ok === true));
      await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));
      const res = frames.find((f) => f.type === "res" && f.id === reqId);
      const conversationId = String(res?.payload?.conversationId ?? "");
      expect(conversationId.length).toBeGreaterThan(0);

      const attachmentDir = path.join(
        stateDir,
        "storage",
        "attachments",
        encodeURIComponent(conversationId).replace(/\./g, "%2E"),
      );
      const fileA = await fs.promises.readFile(path.join(attachmentDir, "a.txt"), "utf-8");
      const fileB = await fs.promises.readFile(path.join(attachmentDir, "b.txt"), "utf-8");
      expect(fileA).toBe("hello-a");
      expect(fileB).toBe("hello-b");
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("message.send caps total injected text attachment chars across files", async () => {
  await withEnv({
    BELLDANDY_ATTACHMENT_TEXT_CHAR_LIMIT: "50",
    BELLDANDY_ATTACHMENT_TEXT_TOTAL_CHAR_LIMIT: "70",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const seenInputs: any[] = [];
    const agent: BelldandyAgent = {
      async *run(input) {
        seenInputs.push(input);
        yield { type: "final" as const, text: "ok" };
        yield { type: "status", status: "done" as const };
      },
    };
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      agentFactory: () => agent,
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);

      ws.send(JSON.stringify({
        type: "req",
        id: "att-char-budget",
        method: "message.send",
        params: {
          text: "attachments budget",
          attachments: [
            { name: "a.txt", type: "text/plain", base64: toBase64("A".repeat(60)) },
            { name: "b.txt", type: "text/plain", base64: toBase64("B".repeat(60)) },
          ],
        },
      }));

      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "att-char-budget" && f.ok === true));
      await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));

      expect(seenInputs).toHaveLength(1);
      expect(seenInputs[0].meta?.attachmentStats).toMatchObject({
        textAttachmentCount: 2,
        textAttachmentChars: 70,
        promptAugmentationChars: 70,
        textAttachmentTruncatedCharLimit: 50,
        textAttachmentTotalCharLimit: 70,
      });
      expect(seenInputs[0].meta?.promptDeltas).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deltaType: "attachment",
          role: "attachment",
        }),
      ]));
      expect(String(seenInputs[0].text)).toContain("A".repeat(35));
      expect(String(seenInputs[0].text)).toContain("B".repeat(5));
      expect(String(seenInputs[0].text)).not.toContain("B".repeat(6));
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("message.send caps appended audio transcript chars when user text already exists", async () => {
  await withEnv({
    BELLDANDY_ATTACHMENT_TEXT_TOTAL_CHAR_LIMIT: "30",
    BELLDANDY_AUDIO_TRANSCRIPT_APPEND_CHAR_LIMIT: "20",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const seenInputs: any[] = [];
    const agent: BelldandyAgent = {
      async *run(input) {
        seenInputs.push(input);
        yield { type: "final" as const, text: "ok" };
        yield { type: "status", status: "done" as const };
      },
    };
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      agentFactory: () => agent,
      sttTranscribe: async () => ({
        text: "ABCDEFGHIJABCDEFGHIJABCDEFGHIJ",
        provider: "test",
        model: "mock-stt",
      }),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      await pairWebSocketClient(ws, frames, stateDir);

      ws.send(JSON.stringify({
        type: "req",
        id: "audio-transcript-budget",
        method: "message.send",
        params: {
          text: "summarize this audio",
          attachments: [
            { name: "voice.webm", type: "audio/webm", base64: toBase64("fake-audio") },
          ],
        },
      }));

      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "audio-transcript-budget" && f.ok === true));
      await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));

      expect(seenInputs).toHaveLength(1);
      expect(seenInputs[0].meta?.attachmentStats).toMatchObject({
        textAttachmentCount: 0,
        textAttachmentChars: 0,
        audioTranscriptChars: 20,
        promptAugmentationChars: 20,
        textAttachmentTotalCharLimit: 30,
        audioTranscriptAppendCharLimit: 20,
      });
      expect(seenInputs[0].meta?.promptDeltas).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deltaType: "audio-transcript",
          role: "attachment",
        }),
      ]));
      expect(String(seenInputs[0].text)).toContain('语音转录: "ABCDE');
      expect(String(seenInputs[0].text)).toContain("ABCDEFGHIJABCDEFGHIJ");
      expect(String(seenInputs[0].text)).not.toContain("ABCDEFGHIJABCDEFGHIJABCDEFGHIJ");
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("/api/message is disabled by default", async () => {
  await withEnv({
    BELLDANDY_COMMUNITY_API_ENABLED: undefined,
    BELLDANDY_COMMUNITY_API_TOKEN: undefined,
    BELLDANDY_AUTH_TOKEN: undefined,
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      agentFactory: () => new MockAgent(),
    });

    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello", conversationId: "conv-1" }),
      });
      const payload = await res.json();
      expect(res.status).toBe(404);
      expect(payload.ok).toBe(false);
      expect(payload.error?.code).toBe("API_DISABLED");
    } finally {
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("/api/message rejects missing bearer token", async () => {
  await withEnv({
    BELLDANDY_COMMUNITY_API_ENABLED: "true",
    BELLDANDY_COMMUNITY_API_TOKEN: "community-test-token",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      agentFactory: () => new MockAgent(),
    });

    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "hello", conversationId: "conv-2" }),
      });
      const payload = await res.json();
      expect(res.status).toBe(401);
      expect(payload.ok).toBe(false);
      expect(payload.error?.code).toBe("UNAUTHORIZED");
    } finally {
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("/api/message rejects wrong bearer token", async () => {
  await withEnv({
    BELLDANDY_COMMUNITY_API_ENABLED: "true",
    BELLDANDY_COMMUNITY_API_TOKEN: "community-test-token",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      agentFactory: () => new MockAgent(),
    });

    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ text: "hello", conversationId: "conv-3" }),
      });
      const payload = await res.json();
      expect(res.status).toBe(401);
      expect(payload.ok).toBe(false);
      expect(payload.error?.code).toBe("UNAUTHORIZED");
    } finally {
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("/api/message accepts valid bearer token", async () => {
  await withEnv({
    BELLDANDY_COMMUNITY_API_ENABLED: "true",
    BELLDANDY_COMMUNITY_API_TOKEN: "community-test-token",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      agentFactory: () => new MockAgent(),
    });

    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer community-test-token",
        },
        body: JSON.stringify({
          text: "hello from community",
          conversationId: "conv-4",
          from: "office.goddess.ai",
          senderInfo: { id: "u-1", name: "tester", type: "user" },
          roomContext: { environment: "community", roomId: "room-1", members: [] },
        }),
      });
      const payload = await res.json();
      expect(res.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.payload?.conversationId).toBe("conv-4");
      expect(String(payload.payload?.response ?? "")).toContain("hello from community");
    } finally {
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

test("/api/webhook reuses in-flight response for concurrent idempotency key", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  let runCount = 0;
  const agent: BelldandyAgent = {
    async *run(input) {
      runCount += 1;
      await sleep(25);
      yield { type: "final", text: `webhook:${input.text}` };
    },
  };

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentFactory: () => agent,
    webhookConfig: {
      version: 1,
      webhooks: [
        {
          id: "audit",
          enabled: true,
          token: "webhook-test-token",
        },
      ],
    },
    webhookIdempotency: new IdempotencyManager(60_000),
  });

  try {
    const request = () =>
      fetch(`http://127.0.0.1:${server.port}/api/webhook/audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer webhook-test-token",
          "x-idempotency-key": "dup-1",
        },
        body: JSON.stringify({ text: "hello from webhook" }),
      });

    const [first, second] = await Promise.all([request(), request()]);
    const payloads = await Promise.all([first.json(), second.json()]) as Array<{ ok?: boolean; duplicate?: boolean; payload?: { response?: string } }>;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(runCount).toBe(1);
    expect(payloads.every((item) => item.ok === true)).toBe(true);
    expect(payloads.every((item) => item.payload?.response === "webhook:hello from webhook")).toBe(true);
    expect(payloads.filter((item) => item.duplicate === true)).toHaveLength(1);
  } finally {
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("system.doctor exposes api.message and webhook query runtime lifecycle traces", async () => {
  await withEnv({
    BELLDANDY_COMMUNITY_API_ENABLED: "true",
    BELLDANDY_COMMUNITY_API_TOKEN: "community-trace-token",
  }, async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const toolsConfigManager = new ToolsConfigManager(stateDir);
    await toolsConfigManager.load();
    const confirmationStore = new ToolControlConfirmationStore();
    let toolExecutor!: ToolExecutor;
    const agent: BelldandyAgent = {
      async *run(input) {
        const request = {
          id: `tool-call-${input.conversationId}`,
          name: TOOL_SETTINGS_CONTROL_NAME,
          arguments: {
            action: "apply",
            disableBuiltin: ["alpha_builtin"],
          },
        };
        yield {
          type: "tool_call" as const,
          id: request.id,
          name: request.name,
          arguments: request.arguments,
        };
        const result = await toolExecutor.execute(
          request,
          input.conversationId,
          input.agentId,
          input.userUuid,
          input.senderInfo,
          input.roomContext,
        );
        yield {
          type: "tool_result" as const,
          id: result.id,
          name: result.name,
          success: result.success,
          output: result.output,
          error: result.error,
        };
        yield {
          type: "usage" as const,
          systemPromptTokens: 1,
          contextTokens: 2,
          inputTokens: 3,
          outputTokens: 4,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelCalls: 1,
        };
        yield { type: "final", text: `http:${input.text}` };
      },
    };
    toolExecutor = new ToolExecutor({
      tools: [
        createTestTool("alpha_builtin"),
        createToolSettingsControlTool({
          toolsConfigManager,
          getControlMode: () => "auto",
          listRegisteredTools: () => toolExecutor.getRegisteredToolNames(),
          confirmationStore,
        }),
      ],
      workspaceRoot: process.cwd(),
      alwaysEnabledTools: [TOOL_SETTINGS_CONTROL_NAME],
    });

    const server = await startGatewayServer({
      port: 0,
      auth: { mode: "none" },
      webRoot: resolveWebRoot(),
      stateDir,
      toolsConfigManager,
      toolExecutor,
      agentFactory: () => agent,
      webhookConfig: {
        version: 1,
        webhooks: [
          {
            id: "audit",
            enabled: true,
            token: "webhook-trace-token",
          },
        ],
      },
      webhookIdempotency: new IdempotencyManager(60_000),
    });

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
    const frames: any[] = [];
    const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

    try {
      const communityRes = await fetch(`http://127.0.0.1:${server.port}/api/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer community-trace-token",
        },
        body: JSON.stringify({
          text: "hello runtime api",
          conversationId: "conv-http-trace",
          from: "office.goddess.ai",
        }),
      });
      expect(communityRes.status).toBe(200);

      const webhookRes = await fetch(`http://127.0.0.1:${server.port}/api/webhook/audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer webhook-trace-token",
        },
        body: JSON.stringify({
          text: "hello runtime webhook",
          conversationId: "conv-webhook-trace",
        }),
      });
      expect(webhookRes.status).toBe(200);

      await pairWebSocketClient(ws, frames, stateDir);

      ws.send(JSON.stringify({ type: "req", id: "system-doctor-http-trace", method: "system.doctor", params: {} }));
      await waitFor(() => frames.some((f) => f.type === "res" && f.id === "system-doctor-http-trace"));
      const response = frames.find((f) => f.type === "res" && f.id === "system-doctor-http-trace");

      expect(response.ok).toBe(true);
      const traces = response.payload?.queryRuntime?.traces ?? [];
      const apiTrace = traces.find((item: any) => item.method === "api.message" && item.conversationId === "conv-http-trace");
      const webhookTrace = traces.find((item: any) => item.method === "webhook.receive" && item.conversationId === "conv-webhook-trace");

      expect(apiTrace).toMatchObject({
        method: "api.message",
        status: "completed",
        conversationId: "conv-http-trace",
      });
      expect(webhookTrace).toMatchObject({
        method: "webhook.receive",
        status: "completed",
        conversationId: "conv-webhook-trace",
      });

      expect(apiTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
        "auth_checked",
        "request_validated",
        "agent_created",
        "agent_running",
        "tool_call_emitted",
        "tool_result_emitted",
        "tool_event_emitted",
        "task_result_recorded",
        "response_built",
        "completed",
      ]));
      expect(webhookTrace?.stages.map((item: any) => item.stage)).toEqual(expect.arrayContaining([
        "webhook_rule_loaded",
        "auth_checked",
        "idempotency_checked",
        "prompt_built",
        "request_validated",
        "agent_created",
        "agent_running",
        "tool_call_emitted",
        "tool_result_emitted",
        "tool_event_emitted",
        "task_result_recorded",
        "response_built",
        "completed",
      ]));
      expect(toolsConfigManager.getConfig().disabled.builtin).toEqual(["alpha_builtin"]);
    } finally {
      ws.close();
      await closeP;
      await server.close();
      await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

async function pairWebSocketClient(ws: WebSocket, frames: any[], stateDir: string): Promise<void> {
  await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
  await waitFor(() => frames.some((f) => f.type === "hello-ok"));

  const reqId = `pairing-${Date.now()}`;
  ws.send(JSON.stringify({ type: "req", id: reqId, method: "message.send", params: { text: "pairing-init" } }));
  await waitFor(() => frames.some((f) => f.type === "event" && f.event === "pairing.required"));
  const pairingEvents = frames.filter((f) => f.type === "event" && f.event === "pairing.required");
  const pairing = pairingEvents[pairingEvents.length - 1];
  const code = pairing?.payload?.code ? String(pairing.payload.code) : "";
  expect(code.length).toBeGreaterThan(0);
  const approved = await approvePairingCode({ code, stateDir });
  expect(approved.ok).toBe(true);
}

function toSafeConversationFileIdForTest(id: string): string {
  const encodeChar = (char: string): string => {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== "number") return "_";
    return `%${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
  };

  let safeId = id.replace(/[<>:"/\\|?*\u0000-\u001F%]/g, encodeChar);
  safeId = safeId.replace(/[. ]+$/g, (match) => Array.from(match).map(encodeChar).join(""));
  if (!safeId) {
    safeId = "_";
  }

  const windowsBasename = safeId.split(".")[0] ?? safeId;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(windowsBasename)) {
    safeId = `_${safeId}`;
  }

  return safeId;
}

function formatLocalDateForTest(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createTestTool(name: string): Tool {
  return {
    definition: {
      name,
      description: `test tool ${name}`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    async execute() {
      return {
        id: "",
        name,
        success: true,
        output: name,
        durationMs: 0,
      };
    },
  };
}

function createContractedTestTool(name: string): Tool {
  return withToolContract(createTestTool(name), {
    family: "other",
    isReadOnly: true,
    isConcurrencySafe: true,
    needsPermission: false,
    riskLevel: "low",
    channels: ["gateway"],
    safeScopes: ["local-safe"],
    activityDescription: `contracted tool ${name}`,
    resultSchema: {
      kind: "text",
      description: "test tool output",
    },
    outputPersistencePolicy: "conversation",
  });
}

function createWriteContractedTestTool(name: string): Tool {
  return withToolContract(createTestTool(name), {
    family: "workspace-write",
    isReadOnly: false,
    isConcurrencySafe: false,
    needsPermission: true,
    riskLevel: "high",
    channels: ["gateway"],
    safeScopes: ["privileged"],
    activityDescription: `write tool ${name}`,
    resultSchema: {
      kind: "text",
      description: "test tool output",
    },
    outputPersistencePolicy: "artifact",
  });
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64");
}

async function withEnv(
  changes: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(changes)) {
    prev[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("timeout");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
