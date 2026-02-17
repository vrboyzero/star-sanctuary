import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test, beforeAll } from "vitest";
import WebSocket from "ws";

import { startGatewayServer } from "./server.js";
import { approvePairingCode } from "./security/store.js";

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
