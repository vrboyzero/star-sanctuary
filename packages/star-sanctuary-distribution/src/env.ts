import fs from "node:fs";
import { resolveEnvFilePaths } from "./runtime-paths.js";

function loadEnvFileInto(targetEnv: NodeJS.ProcessEnv, filePath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eq = normalized.indexOf("=");
    if (eq <= 0) continue;

    const key = normalized.slice(0, eq).trim();
    if (!key) continue;

    let value = normalized.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    targetEnv[key] = value;
  }
}

export function loadRuntimeEnvFiles(baseEnv: NodeJS.ProcessEnv, envDir: string): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const envFiles = resolveEnvFilePaths({ envDir });
  loadEnvFileInto(env, envFiles.envPath);
  loadEnvFileInto(env, envFiles.envLocalPath);
  return env;
}

export function readTrimmedEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  return value && value.trim() ? value.trim() : undefined;
}

export function resolveRuntimeEnvDir(params: {
  baseEnv: NodeJS.ProcessEnv;
  fallbackEnvDir: string;
}): string {
  return readTrimmedEnv(params.baseEnv, "STAR_SANCTUARY_ENV_DIR")
    ?? readTrimmedEnv(params.baseEnv, "BELLDANDY_ENV_DIR")
    ?? params.fallbackEnvDir;
}
