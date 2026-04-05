import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, expect, test, vi } from "vitest";
import WebSocket from "ws";

import { AgentRegistry, ConversationStore, MockAgent } from "@belldandy/agent";
import { promoteResidentMemoryToShared } from "./resident-shared-memory.js";

import { createScopedMemoryManagers } from "./resident-memory-managers.js";
import { startGatewayServer } from "./server.js";
import { approvePairingCode } from "./security/store.js";

beforeAll(() => {
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = "test-placeholder-key";
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function resolveWebRoot() {
  return path.join(process.cwd(), "apps", "web", "public");
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timeout");
}

async function pairWebSocketClient(ws: WebSocket, frames: any[], stateDir: string): Promise<void> {
  await waitFor(() => frames.some((frame) => frame.type === "connect.challenge"));
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
  await waitFor(() => frames.some((frame) => frame.type === "hello-ok"));
  ws.send(JSON.stringify({ type: "req", id: "pairing-init", method: "message.send", params: { text: "pairing-init" } }));
  await waitFor(() => frames.some((frame) => frame.type === "event" && frame.event === "pairing.required"));
  const pairingEvents = frames.filter((frame) => frame.type === "event" && frame.event === "pairing.required");
  const code = String(pairingEvents[pairingEvents.length - 1]?.payload?.code ?? "");
  expect(code.length).toBeGreaterThan(0);
  const approved = await approvePairingCode({ code, stateDir });
  expect(approved.ok).toBe(true);
}

test("system.doctor exposes resident memory policy summary", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-resident-doctor-"));
  const registry = new AgentRegistry(() => new MockAgent());
  registry.register({
    id: "default",
    displayName: "Belldandy",
    model: "primary",
    memoryMode: "hybrid",
  });
  registry.register({
    id: "coder",
    displayName: "Coder",
    model: "primary",
    workspaceDir: "coder",
    sessionNamespace: "coder-main",
    memoryMode: "shared",
  });
  const residentMemoryManagers = createScopedMemoryManagers({
    stateDir,
    agentRegistry: registry,
    modelsDir: path.join(stateDir, "models"),
    conversationStore: new ConversationStore({
      dataDir: path.join(stateDir, "sessions"),
    }),
    indexerOptions: {
      watch: false,
    },
  }).records;
  const defaultRecord = residentMemoryManagers.find((record) => record.agentId === "default");
  const defaultSharedRecord = residentMemoryManagers.find((record) => record.memoryMode === "shared");
  expect(defaultRecord).toBeTruthy();
  expect(defaultSharedRecord).toBeTruthy();
  if (!defaultRecord || !defaultSharedRecord) {
    throw new Error("expected resident memory managers to be available");
  }
  defaultRecord.manager.upsertMemoryChunk({
    id: "doctor-pending-chunk",
    sourcePath: "memory/doctor-pending.md",
    sourceType: "manual",
    memoryType: "other",
    content: "doctor pending queue candidate",
    visibility: "private",
  });
  promoteResidentMemoryToShared({
    manager: defaultRecord.manager,
    sharedManager: defaultSharedRecord.manager,
    residentPolicy: defaultRecord.policy,
    agentId: "default",
    chunkId: "doctor-pending-chunk",
    reason: "doctor queue smoke",
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: resolveWebRoot(),
    stateDir,
    agentRegistry: registry,
    residentMemoryManagers,
  });
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin: "http://127.0.0.1" });
  const frames: any[] = [];
  const closeP = new Promise<void>((resolve) => ws.once("close", () => resolve()));
  ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));

  try {
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    ws.send(JSON.stringify({ type: "req", id: "doctor-resident", method: "system.doctor", params: {} }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "doctor-resident"));

    const res = frames.find((frame) => frame.type === "res" && frame.id === "doctor-resident");
    expect(res.ok).toBe(true);
    expect(res.payload?.residentAgents?.summary).toMatchObject({
      totalCount: 2,
      memoryModeCounts: {
        shared: 1,
        hybrid: 1,
      },
      sharedGovernanceCounts: {
        pendingCount: 1,
        claimedCount: 0,
      },
    });
    expect(res.payload?.residentAgents?.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "default",
        sharedGovernance: expect.objectContaining({
          pendingCount: 1,
        }),
      }),
      expect.objectContaining({
        id: "coder",
        sessionNamespace: "coder-main",
        memoryMode: "shared",
        memoryPolicy: expect.objectContaining({
          writeTarget: "shared",
          readTargets: ["shared"],
        }),
      }),
    ]));
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("agents.prompt.inspect can surface resident profile and memory policy metadata", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-resident-inspect-"));
  const registry = new AgentRegistry(() => new MockAgent());
  const inspectAgentPrompt = vi.fn(async () => ({
    scope: "run" as const,
    agentId: "coder",
    conversationId: "agent:coder:main",
    runId: "run-1",
    createdAt: 123,
    displayName: "Coder",
    model: "primary",
    text: "system prompt body",
    truncated: false,
    totalChars: 18,
    finalChars: 18,
    sections: [],
    droppedSections: [],
    messages: [],
    metadata: {
      residentProfile: {
        memoryMode: "hybrid",
        workspaceBinding: "current",
        sessionNamespace: "coder-main",
      },
      memoryPolicy: {
        writeTarget: "private",
        readTargets: ["private", "shared"],
      },
    },
  }));
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
    sessionNamespace: "coder-main",
    memoryMode: "hybrid",
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
    await pairWebSocketClient(ws, frames, stateDir);
    frames.length = 0;

    ws.send(JSON.stringify({
      type: "req",
      id: "inspect-resident",
      method: "agents.prompt.inspect",
      params: { agentId: "coder", conversationId: "agent:coder:main", runId: "run-1" },
    }));
    await waitFor(() => frames.some((frame) => frame.type === "res" && frame.id === "inspect-resident"));

    const res = frames.find((frame) => frame.type === "res" && frame.id === "inspect-resident");
    expect(res.ok).toBe(true);
    expect(res.payload?.metadata).toMatchObject({
      residentProfile: {
        memoryMode: "hybrid",
        sessionNamespace: "coder-main",
      },
      memoryPolicy: {
        writeTarget: "private",
        readTargets: ["private", "shared"],
      },
    });
  } finally {
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
