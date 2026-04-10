import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

import WebSocket from "ws";

import {
  getConversationPromptSnapshotArtifactPath,
  loadConversationPromptSnapshotArtifact,
} from "../packages/belldandy-core/dist/conversation-prompt-snapshot.js";
import { approvePairingCode } from "../packages/belldandy-core/dist/security/store.js";

const REPO_ROOT = process.cwd();
const TMP_ROOT = path.join(REPO_ROOT, ".tmp-h1-manual-test", "runtime-check");

async function main() {
  await fs.rm(TMP_ROOT, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(TMP_ROOT, { recursive: true });

  const fakeOpenAI = await startFakeOpenAIServer();
  const results = [];

  try {
    results.push(await runStrongSignalCases(fakeOpenAI.baseUrl));
    results.push(await runWeakSignalCase(fakeOpenAI.baseUrl));
  } finally {
    await fakeOpenAI.close();
  }

  const flattened = results.flatMap((item) => item.checks);
  const failed = flattened.filter((item) => item.passed !== true);

  for (const group of results) {
    console.log(`\n[${group.name}]`);
    for (const check of group.checks) {
      console.log(
        `${check.passed ? "PASS" : "FAIL"} ${check.label} | conversation=${check.conversationId} | run=${check.runId} | snapshot=${check.snapshotPath}`,
      );
      console.log(`  expectation=${check.expectation} | runtime=${check.runtimePresent} | goalContext=${check.goalContextPresent}`);
    }
  }

  console.log("\n[JSON]");
  console.log(JSON.stringify(results, null, 2));

  if (failed.length > 0) {
    process.exitCode = 1;
    return;
  }
}

async function runStrongSignalCases(openaiBaseUrl) {
  const stateDir = path.join(TMP_ROOT, "strong-state");
  await fs.mkdir(path.join(stateDir, "team-memory"), { recursive: true });
  await fs.writeFile(
    path.join(stateDir, "USER.md"),
    "# USER\n名字：小星\n偏好：先给短结论，再给验证口径。\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(stateDir, "MEMORY.md"),
    "# MEMORY\n长期偏好：文档先收口边界，不要默认扩范围。\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(stateDir, "team-memory", "MEMORY.md"),
    "# TEAM MEMORY\n共享约束：优先最小改动，先验证再扩展。\n",
    "utf-8",
  );

  const gateway = await startGatewayProcess({
    stateDir,
    openaiBaseUrl,
    extraEnv: {
      BELLDANDY_MIND_PROFILE_RUNTIME_ENABLED: "true",
      BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINES: "4",
      BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINE_LENGTH: "120",
      BELLDANDY_MIND_PROFILE_RUNTIME_MAX_CHARS: "360",
      BELLDANDY_MIND_PROFILE_RUNTIME_MIN_SIGNAL_COUNT: "2",
    },
  });
  const wsHandle = await connectGatewayWebSocket(gateway.port);

  try {
    await pairWebSocketClient(wsHandle.ws, wsHandle.frames, stateDir);
    wsHandle.frames.length = 0;

    const mainCheck = await runConversationCheck({
      wsHandle,
      stateDir,
      reqId: "h1-main-check",
      text: "H1_RUNTIME_MAIN_CHECK_20260410\n继续这个项目，先按你已知的长期偏好给我一个最小结论。",
      expectRuntime: true,
      label: "main 注入",
    });

    const goalCheck = await runConversationCheck({
      wsHandle,
      stateDir,
      reqId: "h1-goal-check",
      conversationId: "goal:goal_alpha",
      text: "H1_RUNTIME_GOAL_CHECK_20260410\n继续当前 goal，先告诉我下一步。",
      expectRuntime: false,
      label: "goal 不注入",
    });

    return {
      name: "strong-signal",
      stateDir,
      checks: [mainCheck, goalCheck],
    };
  } finally {
    await wsHandle.close();
    await stopGatewayProcess(gateway);
  }
}

async function runWeakSignalCase(openaiBaseUrl) {
  const stateDir = path.join(TMP_ROOT, "weak-state");
  await fs.mkdir(stateDir, { recursive: true });

  const gateway = await startGatewayProcess({
    stateDir,
    openaiBaseUrl,
    extraEnv: {
      BELLDANDY_MIND_PROFILE_RUNTIME_ENABLED: "true",
      BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINES: "4",
      BELLDANDY_MIND_PROFILE_RUNTIME_MAX_LINE_LENGTH: "120",
      BELLDANDY_MIND_PROFILE_RUNTIME_MAX_CHARS: "360",
      BELLDANDY_MIND_PROFILE_RUNTIME_MIN_SIGNAL_COUNT: "2",
    },
  });
  const wsHandle = await connectGatewayWebSocket(gateway.port);

  try {
    await pairWebSocketClient(wsHandle.ws, wsHandle.frames, stateDir);
    wsHandle.frames.length = 0;

    const weakCheck = await runConversationCheck({
      wsHandle,
      stateDir,
      reqId: "h1-weak-check",
      text: "H1_RUNTIME_WEAK_CHECK_20260410\n继续聊这个问题。",
      expectRuntime: false,
      label: "weak main 不注入",
    });

    return {
      name: "weak-signal",
      stateDir,
      checks: [weakCheck],
    };
  } finally {
    await wsHandle.close();
    await stopGatewayProcess(gateway);
  }
}

async function runConversationCheck(input) {
  const frames = input.wsHandle.frames;
  const beforeLength = frames.length;
  input.wsHandle.ws.send(
    JSON.stringify({
      type: "req",
      id: input.reqId,
      method: "message.send",
      params: {
        text: input.text,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      },
    }),
  );

  const response = await waitForFrame(
    frames,
    (frame) => frame.type === "res" && frame.id === input.reqId,
    30000,
  );
  if (response.ok !== true) {
    throw new Error(`message.send failed for ${input.reqId}: ${JSON.stringify(response.error)}`);
  }

  const conversationId = String(response.payload?.conversationId || input.conversationId || "");
  const runId = String(response.payload?.runId || "");
  if (!conversationId || !runId) {
    throw new Error(`Missing conversationId/runId for ${input.reqId}`);
  }

  await waitForFrame(
    frames,
    (frame) => frame.type === "event" && frame.event === "chat.final" && frame.payload?.conversationId === conversationId,
    30000,
  );

  const artifactPath = getConversationPromptSnapshotArtifactPath({
    stateDir: input.stateDir,
    conversationId,
    runId,
  });
  await waitFor(async () => {
    try {
      await fs.access(artifactPath);
      return true;
    } catch {
      return false;
    }
  }, 30000);

  const artifact = await waitFor(async () => {
    const loaded = await loadConversationPromptSnapshotArtifact({
      stateDir: input.stateDir,
      conversationId,
      runId,
    });
    return loaded;
  }, 30000);

  const serialized = JSON.stringify(artifact);
  const runtimePresent = serialized.includes("mind-profile-runtime") || serialized.includes("<mind-profile-runtime");
  const goalContextPresent = serialized.includes("goal-session-context") || serialized.includes("<goal-session-context");

  return {
    label: input.label,
    expectation: input.expectRuntime ? "runtime should exist" : "runtime should be absent",
    passed: runtimePresent === input.expectRuntime,
    runtimePresent,
    goalContextPresent,
    conversationId,
    runId,
    snapshotPath: artifactPath,
    newFrameCount: frames.length - beforeLength,
  };
}

async function startFakeOpenAIServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end("not found");
      return;
    }

    await readRequestBody(req);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-test",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "stubbed response",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind fake OpenAI server");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      if (!server.listening) return;
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function startGatewayProcess(input) {
  const port = await getAvailablePort();
  const output = [];
  const child = spawn(process.execPath, ["packages/belldandy-core/dist/bin/gateway.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      BELLDANDY_STATE_DIR: input.stateDir,
      BELLDANDY_ENV_DIR: input.stateDir,
      BELLDANDY_PORT: String(port),
      BELLDANDY_GATEWAY_PORT: String(port),
      BELLDANDY_HOST: "127.0.0.1",
      BELLDANDY_AUTH_MODE: "none",
      BELLDANDY_AGENT_PROVIDER: "openai",
      BELLDANDY_OPENAI_API_KEY: "test-openai-key",
      BELLDANDY_OPENAI_BASE_URL: `${input.openaiBaseUrl}/v1`,
      BELLDANDY_OPENAI_MODEL: "gpt-test",
      BELLDANDY_OPENAI_STREAM: "false",
      BELLDANDY_PRIMARY_WARMUP_ENABLED: "false",
      BELLDANDY_COMMUNITY_API_ENABLED: "false",
      BELLDANDY_HEARTBEAT_ENABLED: "false",
      BELLDANDY_CRON_ENABLED: "false",
      BELLDANDY_BROWSER_RELAY_ENABLED: "false",
      BELLDANDY_DISCORD_ENABLED: "false",
      AUTO_OPEN_BROWSER: "false",
      OPENAI_API_KEY: "test-openai-key",
      STAR_SANCTUARY_WEB_ROOT: path.join(REPO_ROOT, "apps", "web", "public"),
      ...input.extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.setEncoding("utf-8");
  child.stderr?.setEncoding("utf-8");
  const consumeOutput = (chunk) => {
    output.push(chunk.toString());
  };
  child.stdout?.on("data", consumeOutput);
  child.stderr?.on("data", consumeOutput);

  await waitFor(() => {
    if (child.exitCode !== null) {
      throw new Error(`Gateway exited before startup (code=${child.exitCode})\n${output.join("")}`);
    }
    return output.join("").includes(`Belldandy Gateway running: http://127.0.0.1:${port}`);
  }, 30000);

  return { child, port, output };
}

async function stopGatewayProcess(handle) {
  const child = handle.child;
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill();
  const exited = await Promise.race([
    once(child, "exit").then(() => true),
    sleep(3000).then(() => false),
  ]);
  if (exited) {
    return;
  }

  if (typeof child.pid === "number" && process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    await once(killer, "exit").catch(() => {});
    await once(child, "exit").catch(() => {});
    return;
  }

  child.kill("SIGKILL");
  await once(child, "exit").catch(() => {});
}

async function connectGatewayWebSocket(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: "http://127.0.0.1" });
  const frames = [];
  const closePromise = new Promise((resolve) => ws.once("close", resolve));
  ws.on("message", (data) => {
    frames.push(JSON.parse(data.toString("utf-8")));
  });

  await waitForFrame(frames, (frame) => frame.type === "connect.challenge", 10000);
  ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" }, clientId: "h1-manual-runtime-check" }));
  await waitForFrame(frames, (frame) => frame.type === "hello-ok", 10000);

  return {
    ws,
    frames,
    close: async () => {
      if (ws.readyState === WebSocket.CLOSED) return;
      ws.close();
      await closePromise;
    },
  };
}

async function pairWebSocketClient(ws, frames, stateDir) {
  const reqId = `pairing-${Date.now()}`;
  ws.send(JSON.stringify({ type: "req", id: reqId, method: "message.send", params: { text: "pairing-init" } }));
  const pairingEvent = await waitForFrame(
    frames,
    (frame) => frame.type === "event" && frame.event === "pairing.required",
    10000,
  );
  const code = pairingEvent?.payload?.code ? String(pairingEvent.payload.code) : "";
  if (!code) {
    throw new Error("Pairing code was not emitted");
  }
  const approved = await approvePairingCode({ code, stateDir });
  if (approved.ok !== true) {
    throw new Error(`Failed to approve pairing code: ${approved.message}`);
  }
}

async function waitForFrame(frames, predicate, timeoutMs = 5000) {
  return waitFor(() => frames.find((frame) => predicate(frame)), timeoutMs);
}

async function waitFor(predicate, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await predicate();
    if (result) {
      return result;
    }
    await sleep(25);
  }
  throw new Error(`timeout after ${timeoutMs}ms`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function getAvailablePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(() => resolve()));
    throw new Error("Failed to reserve an ephemeral port");
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return address.port;
}

await main();
