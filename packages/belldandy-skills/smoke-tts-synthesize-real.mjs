import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { synthesizeSpeech } from "./dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const packageRoot = path.dirname(__filename);
const workspaceRoot = path.resolve(packageRoot, "..", "..");
const envPath = path.join(workspaceRoot, ".env");
const envLocalPath = path.join(workspaceRoot, ".env.local");
const smokeRoot = path.join(workspaceRoot, "tmp", "tts-synthesize-real-smoke");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const runRoot = path.join(smokeRoot, runId);
const reportPath = path.join(runRoot, "report.json");

loadEnvFileIfExists(envPath);
loadEnvFileIfExists(envLocalPath);

const options = parseArgs(process.argv.slice(2));
const providers = resolveProviders(options.provider);

await fsp.mkdir(runRoot, { recursive: true });

const report = {
  smoke: "tts-synthesize-real",
  runId,
  ranAt: new Date().toISOString(),
  providers,
  results: [],
};

for (const provider of providers) {
  const stateDir = path.join(runRoot, provider);
  await fsp.mkdir(stateDir, { recursive: true });

  const startedAt = Date.now();
  const originalConsoleError = console.error;
  let capturedFailure = "";
  try {
    console.error = (...args) => {
      capturedFailure = args.map(formatLogArgument).join(" ").trim();
      originalConsoleError(...args);
    };
    const result = await synthesizeSpeech({
      text: options.text,
      stateDir,
      provider,
      voice: resolveVoice(provider, options.voice),
      model: options.model,
    });

    if (!result) {
      throw new Error(capturedFailure || "synthesizeSpeech returned null");
    }

    const filePath = path.join(stateDir, "generated", path.basename(result.webPath));
    const stats = await fsp.stat(filePath);
    if (stats.size < 100) {
      throw new Error(`output too small (${stats.size} bytes)`);
    }

    report.results.push({
      provider,
      status: "pass",
      webPath: result.webPath,
      filePath,
      sizeBytes: stats.size,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    report.results.push({
      provider,
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
  } finally {
    console.error = originalConsoleError;
  }
}

await fsp.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

console.log(`[tts-synthesize-real-smoke] providers=${providers.join(", ")} report=${reportPath}`);
for (const item of report.results) {
  if (item.status === "pass") {
    console.log(`- ${item.provider}: ${item.sizeBytes} bytes -> ${item.webPath}`);
  } else {
    console.log(`- ${item.provider}: FAIL -> ${item.error}`);
  }
}

const failures = report.results.filter((item) => item.status === "fail");
if (failures.length > 0) {
  throw new Error(`TTS real smoke failed for provider(s): ${failures.map((item) => item.provider).join(", ")}. See ${reportPath}`);
}

function parseArgs(argv) {
  const options = {
    provider: "",
    text: "Star Sanctuary TTS real provider smoke.",
    voice: "",
    model: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--provider") {
      options.provider = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--text") {
      options.text = argv[index + 1] ?? options.text;
      index += 1;
      continue;
    }
    if (arg === "--voice") {
      options.voice = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--model") {
      options.model = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
  }

  return options;
}

function resolveProviders(providerArg) {
  const normalized = providerArg
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (normalized.length > 0) {
    return normalized;
  }

  const providers = ["edge"];
  if (readOptionalEnv("DASHSCOPE_API_KEY")) {
    providers.push("dashscope");
  }
  if (readOptionalEnv("BELLDANDY_TTS_OPENAI_API_KEY", "BELLDANDY_OPENAI_API_KEY", "OPENAI_API_KEY")) {
    providers.push("openai");
  }
  return providers;
}

function resolveVoice(provider, voiceArg) {
  if (voiceArg?.trim()) {
    return voiceArg.trim();
  }
  if (provider === "dashscope") {
    return readOptionalEnv("BELLDANDY_TTS_VOICE") ?? "Cherry";
  }
  return undefined;
}

function readOptionalEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function loadEnvFileIfExists(filePath) {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  const protectedKeys = new Set(Object.keys(process.env));
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = normalized.slice(0, separatorIndex).trim();
    if (!key || protectedKeys.has(key)) {
      continue;
    }
    let value = normalized.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function formatLogArgument(value) {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}
