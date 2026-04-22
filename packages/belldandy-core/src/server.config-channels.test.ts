import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, expect, test } from "vitest";
import WebSocket from "ws";

import { startGatewayServer } from "./server.js";
import {
  cleanupGlobalMemoryManagersForTest,
  pairWebSocketClient,
  resolveWebRoot,
  waitFor,
} from "./server-testkit.js";

beforeAll(() => {
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "test-placeholder-key";
  }
});

afterEach(() => {
  cleanupGlobalMemoryManagersForTest();
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

test("config.update accepts unified Aliyun API key targets and redacts them in config.read", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const envDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-env-"));
  await fs.promises.writeFile(path.join(envDir, ".env"), "", "utf-8");

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
      id: "config-update-aliyun-keys",
      method: "config.update",
      params: {
        updates: {
          DASHSCOPE_API_KEY: "aliyun-shared-key",
          BELLDANDY_COMPACTION_API_KEY: "aliyun-shared-key",
          BELLDANDY_MEMORY_EVOLUTION_API_KEY: "aliyun-shared-key",
          BELLDANDY_MEMORY_SUMMARY_API_KEY: "aliyun-shared-key",
          BELLDANDY_EMBEDDING_OPENAI_API_KEY: "aliyun-shared-key",
        },
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-update-aliyun-keys"));
    const updateRes = frames.find((f) => f.type === "res" && f.id === "config-update-aliyun-keys");
    expect(updateRes.ok).toBe(true);

    ws.send(JSON.stringify({ type: "req", id: "config-read-aliyun-keys", method: "config.read", params: {} }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-read-aliyun-keys"));
    const readRes = frames.find((f) => f.type === "res" && f.id === "config-read-aliyun-keys");
    expect(readRes.ok).toBe(true);
    expect(readRes.payload?.config?.DASHSCOPE_API_KEY).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_COMPACTION_API_KEY).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_MEMORY_EVOLUTION_API_KEY).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_MEMORY_SUMMARY_API_KEY).toBe("[REDACTED]");
    expect(readRes.payload?.config?.BELLDANDY_EMBEDDING_OPENAI_API_KEY).toBe("[REDACTED]");

    const envLocalContent = await fs.promises.readFile(path.join(envDir, ".env.local"), "utf-8");
    expect(envLocalContent).toContain('DASHSCOPE_API_KEY="aliyun-shared-key"');
    expect(envLocalContent).toContain('BELLDANDY_COMPACTION_API_KEY="aliyun-shared-key"');
    expect(envLocalContent).toContain('BELLDANDY_MEMORY_EVOLUTION_API_KEY="aliyun-shared-key"');
    expect(envLocalContent).toContain('BELLDANDY_MEMORY_SUMMARY_API_KEY="aliyun-shared-key"');
    expect(envLocalContent).toContain('BELLDANDY_EMBEDDING_OPENAI_API_KEY="aliyun-shared-key"');
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

test("config.update persists assistant external delivery preference", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
  const envDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-env-"));
  await fs.promises.writeFile(path.join(envDir, ".env"), 'BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE="feishu,qq"\n', "utf-8");

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
      id: "config-update-assistant-delivery-preference",
      method: "config.update",
      params: {
        updates: {
          BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE: "community,discord",
        },
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-update-assistant-delivery-preference"));
    const updateRes = frames.find((f) => f.type === "res" && f.id === "config-update-assistant-delivery-preference");
    expect(updateRes.ok).toBe(true);

    ws.send(JSON.stringify({
      type: "req",
      id: "config-read-assistant-delivery-preference",
      method: "config.read",
      params: {},
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "config-read-assistant-delivery-preference"));
    const readRes = frames.find((f) => f.type === "res" && f.id === "config-read-assistant-delivery-preference");
    expect(readRes.ok).toBe(true);
    expect(readRes.payload?.config?.BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE).toBe("community,discord");

    const envLocalContent = await fs.promises.readFile(path.join(envDir, ".env.local"), "utf-8");
    expect(envLocalContent).toContain('BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE="community,discord"');
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(envDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("channel.reply_chunking.get and update persist runtime chunk strategy config", async () => {
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
      id: "channel-reply-chunking-update",
      method: "channel.reply_chunking.update",
      params: {
        content: JSON.stringify({
          channels: {
            discord: {
              textLimit: 1800,
              chunkMode: "newline",
            },
            community: {
              accounts: {
                alpha: {
                  textLimit: 900,
                  chunkMode: "length",
                },
              },
            },
          },
        }),
      },
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "channel-reply-chunking-update"));
    const updateRes = frames.find((f) => f.type === "res" && f.id === "channel-reply-chunking-update");
    expect(updateRes.ok).toBe(true);

    ws.send(JSON.stringify({
      type: "req",
      id: "channel-reply-chunking-get",
      method: "channel.reply_chunking.get",
      params: {},
    }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === "channel-reply-chunking-get"));
    const getRes = frames.find((f) => f.type === "res" && f.id === "channel-reply-chunking-get");
    expect(getRes.ok).toBe(true);
    expect(getRes.payload?.config).toEqual({
      version: 1,
      channels: {
        discord: {
          textLimit: 1800,
          chunkMode: "newline",
        },
        community: {
          accounts: {
            alpha: {
              textLimit: 900,
              chunkMode: "length",
            },
          },
        },
      },
    });

    const stored = JSON.parse(
      await fs.promises.readFile(path.join(stateDir, "channel-reply-chunking.json"), "utf-8"),
    );
    expect(stored).toEqual(getRes.payload?.config);
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
