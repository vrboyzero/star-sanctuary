/**
 * bdd doctor — Health check / diagnostic command.
 * Checks Node version, state dir, env config, port availability, memory DB, MCP config.
 */
import { defineCommand } from "citty";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pc from "picocolors";
import { createCLIContext } from "../shared/context.js";
import {
  loadEnvFileIfExists,
  resolveEnvLocalPath,
  resolveStateDir,
} from "../shared/env-loader.js";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

const REQUIRED_NODE_MAJOR = 22;
const REQUIRED_NODE_MINOR = 12;
const DEFAULT_PORT = 28889;

function checkNodeVersion(): CheckResult {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major! > REQUIRED_NODE_MAJOR || (major === REQUIRED_NODE_MAJOR && minor! >= REQUIRED_NODE_MINOR)) {
    return { name: "Node.js version", status: "pass", message: `v${process.versions.node}` };
  }
  return {
    name: "Node.js version",
    status: "fail",
    message: `v${process.versions.node} (requires >= ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}.0)`,
    fix: "Install Node.js >= 22.12.0",
  };
}

async function checkPnpm(): Promise<CheckResult> {
  try {
    const { execSync } = await import("node:child_process");
    const version = execSync("pnpm --version", { encoding: "utf-8", timeout: 5000 }).trim();
    return { name: "pnpm", status: "pass", message: `v${version}` };
  } catch {
    return { name: "pnpm", status: "warn", message: "not found", fix: "Install pnpm: corepack enable && corepack prepare pnpm@latest --activate" };
  }
}

function checkStateDir(stateDir: string): CheckResult {
  try {
    fs.accessSync(stateDir, fs.constants.R_OK | fs.constants.W_OK);
    return { name: "State directory", status: "pass", message: stateDir };
  } catch {
    if (!fs.existsSync(stateDir)) {
      return { name: "State directory", status: "fail", message: `${stateDir} does not exist`, fix: `Create it: mkdir "${stateDir}"` };
    }
    return { name: "State directory", status: "fail", message: `${stateDir} is not writable`, fix: "Check directory permissions" };
  }
}

function checkEnvLocal(): CheckResult {
  const envPath = resolveEnvLocalPath();
  if (fs.existsSync(envPath)) {
    return { name: ".env.local", status: "pass", message: envPath };
  }
  return { name: ".env.local", status: "warn", message: "not found", fix: "Run 'bdd setup' to create initial configuration" };
}

function checkRequiredEnv(): CheckResult[] {
  const results: CheckResult[] = [];
  const envPath = resolveEnvLocalPath();
  loadEnvFileIfExists(envPath);
  loadEnvFileIfExists(path.join(process.cwd(), ".env"));

  const provider = process.env.BELLDANDY_AGENT_PROVIDER ?? "mock";
  results.push({
    name: "Agent provider",
    status: provider === "mock" ? "warn" : "pass",
    message: provider,
    ...(provider === "mock" ? { fix: "Set BELLDANDY_AGENT_PROVIDER=openai for real LLM" } : {}),
  });

  if (provider === "openai") {
    const baseUrl = process.env.BELLDANDY_OPENAI_BASE_URL;
    const apiKey = process.env.BELLDANDY_OPENAI_API_KEY;
    const model = process.env.BELLDANDY_OPENAI_MODEL;

    results.push({
      name: "OpenAI Base URL",
      status: baseUrl ? "pass" : "fail",
      message: baseUrl ?? "not set",
      ...(!baseUrl ? { fix: "bdd config set BELLDANDY_OPENAI_BASE_URL <url>" } : {}),
    });
    results.push({
      name: "OpenAI API Key",
      status: apiKey ? "pass" : "fail",
      message: apiKey ? "configured" : "not set",
      ...(!apiKey ? { fix: "bdd config set BELLDANDY_OPENAI_API_KEY <key>" } : {}),
    });
    results.push({
      name: "OpenAI Model",
      status: model ? "pass" : "fail",
      message: model ?? "not set",
      ...(!model ? { fix: "bdd config set BELLDANDY_OPENAI_MODEL <model>" } : {}),
    });
  }

  return results;
}

function checkPort(port: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve({ name: `Port ${port}`, status: "warn", message: "in use", fix: `Another process is using port ${port}. Change with BELLDANDY_PORT` });
      } else {
        resolve({ name: `Port ${port}`, status: "warn", message: err.message });
      }
    });
    server.once("listening", () => {
      server.close(() => {
        resolve({ name: `Port ${port}`, status: "pass", message: "available" });
      });
    });
    server.listen(port, "127.0.0.1");
  });
}

function checkMemoryDb(stateDir: string): CheckResult {
  // 新默认：memory.sqlite（Gateway 使用）
  const defaultNew = path.join(stateDir, "memory.sqlite");
  // 兼容旧默认：memory.db（历史版本）
  const legacy = path.join(stateDir, "memory.db");

  const override = process.env.BELLDANDY_MEMORY_DB;
  const dbPath = override ?? defaultNew;

  if (fs.existsSync(dbPath)) {
    try {
      fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
      return { name: "Memory DB", status: "pass", message: dbPath };
    } catch {
      return { name: "Memory DB", status: "warn", message: `${dbPath} exists but not writable` };
    }
  }

  // 没有新库但发现旧库：给出明确提示，避免“以为失效”的错觉
  if (!override && fs.existsSync(legacy)) {
    return {
      name: "Memory DB",
      status: "warn",
      message: `${defaultNew} not found (legacy DB found: ${legacy})`,
      fix: `Rename "${legacy}" -> "${defaultNew}" (or set BELLDANDY_MEMORY_DB="${legacy}")`,
    };
  }

  return { name: "Memory DB", status: "warn", message: "not created yet (will be created on first start)" };
}

function checkMcpConfig(stateDir: string): CheckResult {
  const mcpPath = path.join(stateDir, "mcp.json");
  if (!fs.existsSync(mcpPath)) {
    return { name: "MCP config", status: "pass", message: "not configured (optional)" };
  }
  try {
    const raw = fs.readFileSync(mcpPath, "utf-8");
    const parsed = JSON.parse(raw);
    const serverCount = parsed.servers?.length ?? Object.keys(parsed.mcpServers ?? {}).length ?? 0;
    return { name: "MCP config", status: "pass", message: `${serverCount} server(s) configured` };
  } catch (err) {
    return { name: "MCP config", status: "warn", message: `Parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function checkModelConnectivity(): Promise<CheckResult> {
  const baseUrl = process.env.BELLDANDY_OPENAI_BASE_URL;
  const apiKey = process.env.BELLDANDY_OPENAI_API_KEY;
  const model = process.env.BELLDANDY_OPENAI_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return { name: "Model connectivity", status: "warn", message: "skipped (missing config)" };
  }

  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return { name: "Model connectivity", status: "pass", message: `${model} reachable` };
    }
    const body = await res.text().catch(() => "");
    return { name: "Model connectivity", status: "fail", message: `HTTP ${res.status}: ${body.slice(0, 100)}` };
  } catch (err) {
    return {
      name: "Model connectivity",
      status: "fail",
      message: err instanceof Error ? err.message : String(err),
      fix: "Check BELLDANDY_OPENAI_BASE_URL and network connectivity",
    };
  }
}

export default defineCommand({
  meta: { name: "doctor", description: "Check system health and configuration" },
  args: {
    json: { type: "boolean", description: "JSON output" },
    "state-dir": { type: "string", description: "Override state directory" },
    "check-model": { type: "boolean", description: "Test model API connectivity (sends a minimal request)" },
  },
  async run({ args }) {
    const ctx = createCLIContext({ json: args.json, stateDir: args["state-dir"] });
    const stateDir = ctx.stateDir;
    const port = Number(process.env.BELLDANDY_PORT ?? DEFAULT_PORT);

    const results: CheckResult[] = [];

    // Sync checks
    results.push(checkNodeVersion());
    results.push(await checkPnpm());
    results.push(checkStateDir(stateDir));
    results.push(checkEnvLocal());
    results.push(...checkRequiredEnv());
    results.push(await checkPort(port));
    results.push(checkMemoryDb(stateDir));
    results.push(checkMcpConfig(stateDir));

    if (args["check-model"]) {
      results.push(await checkModelConnectivity());
    }

    // Output
    if (ctx.json) {
      const summary = {
        pass: results.filter((r) => r.status === "pass").length,
        warn: results.filter((r) => r.status === "warn").length,
        fail: results.filter((r) => r.status === "fail").length,
      };
      ctx.output({ checks: results, summary });
      return;
    }

    ctx.log("Belldandy Doctor\n");
    for (const r of results) {
      const icon = r.status === "pass" ? "\u2713" : r.status === "warn" ? "\u26A0" : "\u2717";
      const colorFn =
        r.status === "pass" ? pc.green : r.status === "warn" ? pc.yellow : pc.red;

      ctx.log(colorFn(`  ${icon} ${r.name}: ${r.message}`));
      if (r.fix && r.status !== "pass") {
        ctx.log(`    \u2192 ${r.fix}`);
      }
    }

    const fails = results.filter((r) => r.status === "fail").length;
    const warns = results.filter((r) => r.status === "warn").length;
    ctx.log("");
    if (fails > 0) {
      ctx.error(`${fails} issue(s) found, ${warns} warning(s)`);
      process.exit(1);
    } else if (warns > 0) {
      ctx.warn(`All checks passed with ${warns} warning(s)`);
    } else {
      ctx.success("All checks passed");
    }
  },
});
