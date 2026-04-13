import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { AgentRegistry, MockAgent } from "../packages/belldandy-agent/dist/index.js";
import { startGatewayServer } from "../packages/belldandy-core/dist/server.js";
import { SubTaskRuntimeStore } from "../packages/belldandy-core/dist/task-runtime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const bddEntryPath = path.join(workspaceRoot, "packages", "belldandy-core", "dist", "bin", "bdd.js");

const WATCH_STATUS_FRAGMENT = "refresh 1s";
const WATCH_EXIT_FRAGMENT = "Ctrl+C to exit";

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset >= 0) {
    offset = haystack.indexOf(needle, offset);
    if (offset >= 0) {
      count += 1;
      offset += needle.length;
    }
  }
  return count;
}

function createSilentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function ensureBuildExists() {
  if (!fs.existsSync(bddEntryPath)) {
    throw new Error(`Built CLI entry is missing at ${bddEntryPath}. Run 'corepack pnpm --filter @belldandy/core build' first.`);
  }
}

function stopChild(child) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    child.once("exit", done);

    if (process.platform === "win32") {
      if (typeof child.pid === "number" && Number.isFinite(child.pid)) {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("exit", () => {
          setTimeout(done, 150);
        });
        killer.once("error", () => {
          try {
            child.kill("SIGKILL");
          } catch {
            // ignore
          }
          setTimeout(done, 150);
        });
      } else {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        setTimeout(done, 150);
      }
      setTimeout(done, 2_000).unref?.();
      return;
    }

    try {
      child.kill("SIGTERM");
    } catch {
      done();
      return;
    }
    setTimeout(() => {
      if (child.exitCode == null) {
        child.kill("SIGKILL");
      }
    }, 500).unref?.();
    setTimeout(done, 2_000).unref?.();
  });
}

async function run() {
  ensureBuildExists();

  const stateDir = await fsp.mkdtemp(path.join(os.tmpdir(), "belldandy-console-watch-"));
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

  const subTaskRuntimeStore = new SubTaskRuntimeStore(stateDir);
  await subTaskRuntimeStore.load();
  await subTaskRuntimeStore.createTask({
    launchSpec: {
      parentConversationId: "agent:coder:main",
      agentId: "coder",
      instruction: "Investigate console watch smoke",
      channel: "subtask",
    },
  });

  const server = await startGatewayServer({
    port: 0,
    auth: { mode: "none" },
    webRoot: path.join(workspaceRoot, "apps", "web", "public"),
    stateDir,
    agentRegistry: registry,
    subTaskRuntimeStore,
    logger: createSilentLogger(),
  });

  let child;
  try {
    child = spawn(
      process.execPath,
      [
        bddEntryPath,
        "console",
        "--watch",
        "--interval",
        "1",
        "--state-dir",
        stateDir,
      ],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || "test-placeholder-key",
          BELLDANDY_HOST: "127.0.0.1",
          BELLDANDY_PORT: String(server.port),
          BELLDANDY_AUTH_MODE: "none",
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const completed = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`console --watch smoke timed out.\n--- stdout tail ---\n${stdout.slice(-2000)}\n--- stderr tail ---\n${stderr.slice(-1200)}`));
      }, 12_000);

      const finish = async (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        try {
          await stopChild(child);
        } catch {
          // ignore cleanup noise
        }
        resolve(result);
      };

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
        const headerCount = Math.min(
          countOccurrences(stdout, WATCH_STATUS_FRAGMENT),
          countOccurrences(stdout, WATCH_EXIT_FRAGMENT),
        );
        const titleCount = countOccurrences(stdout, "Belldandy Console");
        if (headerCount >= 2 && titleCount >= 2) {
          void finish({ stdout, stderr });
        }
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf-8");
      });

      child.once("error", (error) => {
        reject(error);
      });

      child.once("exit", (code, signal) => {
        if (resolved) return;
        reject(new Error(`console --watch exited too early (code=${code}, signal=${signal}).\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`));
      });
    });

    const clearCount = countOccurrences(completed.stdout, "\u001bc");
    const requiredSnippets = [
      "Belldandy Console",
      "Gateway",
      "Agents",
      "Runtime",
      "Hints",
      "WS: ",
      "connected",
      "doctor ok",
      "roster ok",
      "subtasks ok",
      "Summary: total 2",
      "Subtasks: total 1",
      "Investigate console watch smoke",
    ];
    const missing = requiredSnippets.filter((snippet) => !completed.stdout.includes(snippet));
    if (missing.length > 0) {
      throw new Error(`console --watch smoke is missing expected output:\n${missing.join("\n")}\n--- stdout ---\n${completed.stdout}\n--- stderr ---\n${completed.stderr}`);
    }
    if (clearCount < 2) {
      throw new Error(`console --watch smoke expected at least 2 clear-screen refreshes, got ${clearCount}.\n--- stdout ---\n${completed.stdout}`);
    }

    console.log("[console-watch-smoke] bdd console --watch refreshed successfully across multiple frames.");
  } finally {
    if (child && child.exitCode == null) {
      await stopChild(child).catch(() => {});
    }
    await server.close();
    await fsp.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
