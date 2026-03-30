import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, beforeAll, vi } from "vitest";
import WebSocket from "ws";

import { AgentRegistry, type BelldandyAgent, ConversationStore, MockAgent } from "@belldandy/agent";
import { MemoryManager, registerGlobalMemoryManager } from "@belldandy/memory";
import {
  SkillRegistry,
  ToolExecutor,
  createToolSettingsControlTool,
  type Tool,
  TOOL_SETTINGS_CONTROL_NAME,
} from "@belldandy/skills";
import { startGatewayServer } from "./server.js";
import { approvePairingCode } from "./security/store.js";
import { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
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
    expect(getSpy).toHaveBeenCalledTimes(2);
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
    ]));
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

  const server = await startGatewayServer({
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
      if (result.success) {
        const disabled = toolsConfigManager.getConfig().disabled;
        gatewayServer.broadcast({
          type: "event",
          event: "tools.config.updated",
          payload: {
            source: "agent",
            mode: "auto",
            disabled: {
              builtin: disabled.builtin,
              mcp_servers: disabled.mcp_servers,
              plugins: disabled.plugins,
              skills: disabled.skills,
            },
          },
        });
      }
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
    memoryManager.linkTaskMemories("conv-memory-viewer", [recentChunk.id], "used");
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
    expect(memoryRecentCategoryRes.ok).toBe(true);
    expect(memoryRecentCategoryRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentCategoryRes.payload.items[0].category).toBe("decision");
    expect(memoryRecentCategoryRes.payload.items[0].content).toBeUndefined();
    expect(usageListRes.ok).toBe(true);
    expect(usageListRes.payload.items.length).toBe(2);
    expect(usageStatsRes.ok).toBe(true);
    expect(usageStatsRes.payload.items[0].assetKey).toBe(path.basename(acceptedMethodCandidate!.publishedPath!));
    expect(usageStatsRes.payload.items[0].usageCount).toBeGreaterThan(0);
    expect(usageStatsRes.payload.items[0].sourceCandidateId).toBe(methodCandidate!.candidate.id);
    expect(usageStatsRes.payload.items[0].sourceCandidatePublishedPath).toBe(acceptedMethodCandidate!.publishedPath);
    expect(usageGetRes.ok).toBe(true);
    expect(usageGetRes.payload.usage.id).toBe("usage-viewer-method");
    expect(usageGetRes.payload.usage.sourceCandidateId).toBe(methodCandidate!.candidate.id);
    expect(candidateGetRes.ok).toBe(true);
    expect(candidateGetRes.payload.candidate.id).toBe(methodCandidate!.candidate.id);
    expect(candidateGetRes.payload.candidate.publishedPath).toBe(acceptedMethodCandidate!.publishedPath);

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

      const attachmentDir = path.join(stateDir, "storage", "attachments", conversationId);
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
