import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, beforeAll } from "vitest";
import WebSocket from "ws";

import { AgentRegistry, type BelldandyAgent, MockAgent } from "@belldandy/agent";
import { MemoryManager, registerGlobalMemoryManager } from "@belldandy/memory";
import { startGatewayServer } from "./server.js";
import { approvePairingCode } from "./security/store.js";
import { BELLDANDY_VERSION } from "./version.generated.js";

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

  const final = frames.find((f) => f.type === "event" && f.event === "chat.final");
  expect(final.payload.text).toContain("你好");

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
  registerGlobalMemoryManager(memoryManager);

  const recentChunk = memoryManager.getRecent(5).find((item) => item.sourcePath.endsWith("MEMORY.md")) ?? memoryManager.getRecent(1)[0];
  expect(recentChunk?.id).toBeTruthy();

  const startedTaskId = memoryManager.startTaskCapture({
    conversationId: "conv-memory-viewer",
    sessionKey: "session-memory-viewer",
    source: "chat",
    objective: "Implement memory viewer",
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
    ws.send(JSON.stringify({ type: "req", id: "task-list", method: "memory.task.list", params: { limit: 5 } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent", method: "memory.recent", params: { limit: 5 } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent-uncategorized", method: "memory.recent", params: { limit: 5, filter: { uncategorized: true } } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-search", method: "memory.search", params: { query: "viewer", limit: 5 } }));
    ws.send(JSON.stringify({ type: "req", id: "memory-recent-category", method: "memory.recent", params: { limit: 5, filter: { category: "decision" } } }));

    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-stats"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "task-list"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent-uncategorized"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-search"));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "memory-recent-category"));

    const taskListRes = frames.find((f) => f.type === "res" && f.id === "task-list");
    const memoryRecentRes = frames.find((f) => f.type === "res" && f.id === "memory-recent");
    const memoryRecentUncategorizedRes = frames.find((f) => f.type === "res" && f.id === "memory-recent-uncategorized");
    const memorySearchRes = frames.find((f) => f.type === "res" && f.id === "memory-search");
    const memoryRecentCategoryRes = frames.find((f) => f.type === "res" && f.id === "memory-recent-category");
    const statsRes = frames.find((f) => f.type === "res" && f.id === "memory-stats");

    expect(statsRes.ok).toBe(true);
    expect(statsRes.payload.status.chunks).toBeGreaterThan(0);
    expect(statsRes.payload.status.categorized).toBeGreaterThan(0);
    expect(statsRes.payload.status.uncategorized).toBeGreaterThan(0);
    expect(statsRes.payload.status.categoryBuckets.decision).toBeGreaterThan(0);
    expect(taskListRes.ok).toBe(true);
    expect(taskListRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentRes.ok).toBe(true);
    expect(memoryRecentRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentUncategorizedRes.ok).toBe(true);
    expect(memoryRecentUncategorizedRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentUncategorizedRes.payload.items[0].category).toBeUndefined();
    expect(memorySearchRes.ok).toBe(true);
    expect(memoryRecentCategoryRes.ok).toBe(true);
    expect(memoryRecentCategoryRes.payload.items.length).toBeGreaterThan(0);
    expect(memoryRecentCategoryRes.payload.items[0].category).toBe("decision");

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
