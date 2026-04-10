/**
 * bdd doctor — Health check / diagnostic command.
 * Checks Node version, state dir, env config, port availability, memory DB, MCP config.
 */
import { defineCommand } from "citty";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pc from "picocolors";
import {
  buildDefaultProfile,
  isResidentAgentProfile,
  loadAgentProfiles,
  resolveAgentProfileMetadata,
} from "@belldandy/agent";
import { createCLIContext } from "../shared/context.js";
import {
  loadProjectEnvFiles,
  resolveEnvPath,
  resolveEnvLocalPath,
} from "../shared/env-loader.js";
import {
  buildToolBehaviorObservability,
  readConfiguredPromptExperimentToolContracts,
} from "../../tool-behavior-observability.js";
import {
  buildToolContractV2Summary,
  listToolContractsV2,
} from "@belldandy/skills";
import { buildResidentAgentObservabilitySnapshot } from "../../resident-agent-observability.js";
import { resolveResidentMemoryPolicy } from "../../resident-memory-policy.js";
import { buildDeploymentBackendsDoctorReport } from "../../deployment-backends.js";
import { readRuntimeResilienceDoctorReport } from "../../runtime-resilience.js";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: string;
}

type OpenAIWireApi = "chat_completions" | "responses";

const REQUIRED_NODE_MAJOR = 22;
const REQUIRED_NODE_MINOR = 12;
const DEFAULT_PORT = 28889;

function resolveExecutableOnPath(candidates: string[]): string | null {
  const rawPath = process.env.PATH ?? "";
  if (!rawPath.trim()) return null;

  const pathEntries = rawPath.split(path.delimiter).filter(Boolean);
  const executableNames = process.platform === "win32"
    ? candidates.flatMap((candidate) => {
      const ext = path.extname(candidate).toLowerCase();
      if (ext) {
        return [candidate];
      }
      const pathext = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
        .split(";")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      return [...new Set([candidate, ...pathext.map((suffix) => `${candidate}${suffix}`)])];
    })
    : candidates;

  for (const dir of pathEntries) {
    for (const executableName of executableNames) {
      const targetPath = path.join(dir, executableName);
      try {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
          return targetPath;
        }
      } catch {
        // ignore invalid PATH entries
      }
    }
  }
  return null;
}

function resolveOpenAIWireApi(): OpenAIWireApi {
  const raw = (process.env.BELLDANDY_OPENAI_WIRE_API ?? "chat_completions").trim().toLowerCase();
  return raw === "responses" ? "responses" : "chat_completions";
}

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
    const { execFileSync } = await import("node:child_process");
    const commandCandidates = [
      {
        file: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        args: ["--version"],
        via: "",
      },
      {
        file: process.platform === "win32" ? "corepack.cmd" : "corepack",
        args: ["pnpm", "--version"],
        via: " (via corepack)",
      },
    ];
    for (const candidate of commandCandidates) {
      try {
        const version = execFileSync(candidate.file, candidate.args, { encoding: "utf-8", timeout: 5000 }).trim();
        if (version) {
          return { name: "pnpm", status: "pass", message: `v${version}${candidate.via}` };
        }
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through to warning below
  }
  const corepackPath = resolveExecutableOnPath(["corepack", "corepack.cmd"]);
  if (corepackPath) {
    return {
      name: "pnpm",
      status: "pass",
      message: `available via corepack (${corepackPath})`,
    };
  }
  return { name: "pnpm", status: "warn", message: "not found", fix: "Install pnpm: corepack enable && corepack prepare pnpm@latest --activate" };
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

function checkEnvLocal(envDir: string): CheckResult {
  const envPath = resolveEnvLocalPath(envDir);
  if (fs.existsSync(envPath)) {
    return { name: ".env.local", status: "pass", message: envPath };
  }
  return { name: ".env.local", status: "warn", message: "not found", fix: "Run 'bdd setup' to create initial configuration" };
}

function checkRequiredEnv(envDir: string): CheckResult[] {
  const results: CheckResult[] = [];
  const envPath = resolveEnvLocalPath(envDir);
  loadProjectEnvFiles({
    envPath: resolveEnvPath(envDir),
    envLocalPath: envPath,
  });

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
    const wireApi = resolveOpenAIWireApi();

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
    results.push({
      name: "OpenAI Wire API",
      status: "pass",
      message: wireApi,
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
  const wireApi = resolveOpenAIWireApi();

  if (!baseUrl || !apiKey || !model) {
    return { name: "Model connectivity", status: "warn", message: "skipped (missing config)" };
  }

  try {
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const base = /\/v\d+$/.test(trimmedBase) ? trimmedBase : `${trimmedBase}/v1`;
    const url = wireApi === "responses" ? `${base}/responses` : `${base}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const requestBody = wireApi === "responses"
      ? {
        model,
        input: "hi",
        max_output_tokens: 1,
      }
      : {
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      return { name: "Model connectivity", status: "pass", message: `${model} reachable` };
    }
    const responseText = await res.text().catch(() => "");
    return { name: "Model connectivity", status: "fail", message: `HTTP ${res.status}: ${responseText.slice(0, 100)}` };
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
    results.push({ name: "Environment directory", status: "pass", message: ctx.envDir });
    if (ctx.envSource === "legacy_root") {
      results.push({
        name: "Legacy root env mode",
        status: "warn",
        message: `Using project-root env files; state-dir config at ${ctx.stateDir} is currently inactive`,
        fix: "Run 'bdd config migrate-to-state-dir' to switch to state-dir config",
      });
    }
    results.push(checkEnvLocal(ctx.envDir));
    results.push(...checkRequiredEnv(ctx.envDir));
    results.push(await checkPort(port));
    results.push(checkMemoryDb(stateDir));
    results.push(checkMcpConfig(stateDir));

    if (args["check-model"]) {
      results.push(await checkModelConnectivity());
    }

    const toolBehaviorObservability = buildToolBehaviorObservability({
      disabledContractNamesConfigured: readConfiguredPromptExperimentToolContracts(),
    });
    const toolContractV2Observability = {
      summary: buildToolContractV2Summary(listToolContractsV2()),
    };
    const configuredProfiles = await loadAgentProfiles(path.join(stateDir, "agents.json"));
    const residentProfiles = [
      buildDefaultProfile(),
      ...configuredProfiles.filter((profile) => profile.id !== "default" && isResidentAgentProfile(profile)),
    ];
    const residentAgents = await buildResidentAgentObservabilitySnapshot({
      agents: residentProfiles.map((profile) => {
        const metadata = resolveAgentProfileMetadata(profile);
        return {
          id: profile.id,
          displayName: profile.displayName,
          model: profile.model,
          kind: "resident" as const,
          workspaceBinding: metadata.workspaceBinding,
          sessionNamespace: metadata.sessionNamespace,
          memoryMode: metadata.memoryMode,
          status: "configured",
          memoryPolicy: resolveResidentMemoryPolicy(stateDir, profile),
        };
      }),
    });
    results.push({
      name: "Resident agents",
      status: residentAgents.summary.totalCount > 0 ? "pass" : "warn",
      message: residentAgents.summary.headline,
    });
    const deploymentBackends = buildDeploymentBackendsDoctorReport({ stateDir });
    results.push({
      name: "Deployment Backends",
      status: deploymentBackends.summary.warningCount > 0 || deploymentBackends.summary.selectedResolved === false
        ? "warn"
        : "pass",
      message: deploymentBackends.headline,
      fix: !deploymentBackends.configExists
        ? `Create ${deploymentBackends.configPath} or start gateway once to materialize the default profile`
        : deploymentBackends.summary.selectedResolved === false
          ? `Update selectedProfileId in ${deploymentBackends.configPath}`
          : undefined,
    });
    const runtimeResilience = await readRuntimeResilienceDoctorReport(stateDir);
    if (runtimeResilience) {
      results.push({
        name: "Runtime Resilience",
        status: runtimeResilience.latest && runtimeResilience.latest.finalStatus !== "success"
          ? "warn"
          : runtimeResilience.latest?.degraded
            ? "warn"
            : "pass",
        message: runtimeResilience.summary.headline,
      });
    }

    // Output
    if (ctx.json) {
      const summary = {
        pass: results.filter((r) => r.status === "pass").length,
        warn: results.filter((r) => r.status === "warn").length,
        fail: results.filter((r) => r.status === "fail").length,
      };
      ctx.output({
        checks: results,
        summary,
        toolBehaviorObservability,
        toolContractV2Observability,
        residentAgents,
        deploymentBackends,
        ...(runtimeResilience ? { runtimeResilience } : {}),
      });
      return;
    }

    ctx.log("Star Sanctuary Doctor\n");
    for (const r of results) {
      const icon = r.status === "pass" ? "\u2713" : r.status === "warn" ? "\u26A0" : "\u2717";
      const colorFn =
        r.status === "pass" ? pc.green : r.status === "warn" ? pc.yellow : pc.red;

      ctx.log(colorFn(`  ${icon} ${r.name}: ${r.message}`));
      if (r.fix && r.status !== "pass") {
        ctx.log(`    \u2192 ${r.fix}`);
      }
    }

    ctx.log("");
    ctx.log("Tool Behavior Observability");
    ctx.log(`  included contracts: ${toolBehaviorObservability.counts.includedContractCount}`);
    ctx.log(`  included: ${toolBehaviorObservability.included.join(", ") || "(none)"}`);
    ctx.log(
      `  disabled by experiment: ${toolBehaviorObservability.experiment?.disabledContractNamesConfigured.join(", ") || "(none)"}`,
    );
    ctx.log("");
    ctx.log("Resident Agents");
    ctx.log(`  total: ${residentAgents.summary.totalCount}`);
    ctx.log(
      `  runtime: running ${residentAgents.summary.runningCount}, background ${residentAgents.summary.backgroundCount}, idle ${residentAgents.summary.idleCount}, error ${residentAgents.summary.errorCount}`,
    );
    ctx.log(
      `  digest: ready ${residentAgents.summary.digestReadyCount}, updated ${residentAgents.summary.digestUpdatedCount}, idle ${residentAgents.summary.digestIdleCount}, missing ${residentAgents.summary.digestMissingCount}`,
    );
    for (const agent of residentAgents.agents.slice(0, 3)) {
      ctx.log(`  - ${agent.displayName}: ${agent.observabilityHeadline ?? agent.memoryMode}`);
    }
    ctx.log("");
    ctx.log("Deployment Backends");
    ctx.log(`  config: ${deploymentBackends.configPath}`);
    ctx.log(`  profiles: ${deploymentBackends.summary.enabledCount}/${deploymentBackends.summary.profileCount} enabled`);
    ctx.log(
      `  selected: ${deploymentBackends.summary.selectedProfileId ?? "-"} (${deploymentBackends.summary.selectedBackend ?? "-"})`,
    );
    ctx.log(
      `  kinds: local ${deploymentBackends.summary.backendCounts.local}, docker ${deploymentBackends.summary.backendCounts.docker}, ssh ${deploymentBackends.summary.backendCounts.ssh}`,
    );
    for (const item of deploymentBackends.items.slice(0, 3)) {
      ctx.log(`  - ${item.label}: ${item.message}`);
    }
    if (runtimeResilience) {
      ctx.log("");
      ctx.log("Runtime Resilience");
      ctx.log(`  routing: primary ${runtimeResilience.routing.primary.provider}/${runtimeResilience.routing.primary.model}`);
      ctx.log(`  fallbacks: ${runtimeResilience.routing.fallbacks.length}`);
      if (runtimeResilience.routing.compaction?.configured) {
        ctx.log(`  compaction: ${runtimeResilience.routing.compaction.route?.provider ?? "-"} / ${runtimeResilience.routing.compaction.route?.model ?? "-"}`);
      }
      ctx.log(`  headline: ${runtimeResilience.summary.headline}`);
    }

    ctx.log("");
    ctx.log("Tool Contract V2");
    ctx.log(`  total governed tools: ${toolContractV2Observability.summary.totalCount}`);
    ctx.log(`  high risk tools: ${toolContractV2Observability.summary.highRiskCount}`);
    ctx.log(`  confirm required tools: ${toolContractV2Observability.summary.confirmRequiredCount}`);
    ctx.log(`  missing V2 tools: ${toolContractV2Observability.summary.missingV2Tools.join(", ") || "(none)"}`);

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

