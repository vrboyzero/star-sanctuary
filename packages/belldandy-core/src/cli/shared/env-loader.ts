/**
 * Env file loader — extracted from gateway.ts for CLI reuse.
 * Re-exports resolveStateDir from security/store.ts (single source of truth).
 */
import fs from "node:fs";
import nodePath from "node:path";

import { resolveEnvFilePaths } from "@star-sanctuary/distribution";

export { resolveStateDir } from "../../security/store.js";

/** A parsed key-value entry from an .env file. */
export interface EnvEntry {
  key: string;
  value: string;
}

/**
 * Load a `.env` / `.env.local` file into `process.env`.
 * - Skips blank lines and `#` comments
 * - Strips optional `export ` prefix
 * - Strips surrounding quotes (`"` or `'`)
 * - Always uses the file value for the same key
 */
export function loadEnvFileIfExists(filePath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return; // ENOENT or other — silently skip
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
    // 始终以文件中的值为准（覆盖 shell/启动脚本传入的同名变量）
    // 这样可以避免启动脚本（如 start.bat）把带引号的值 KEY="val" 直接存入进程环境后无法被纠正。

    let value = normalized.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

/**
 * Apply project env files in the standard priority order:
 * `.env` first, then `.env.local`.
 * Later files override earlier files and any pre-set shell values.
 */
export function loadProjectEnvFiles(paths: {
  envPath: string;
  envLocalPath: string;
}): void {
  loadEnvFileIfExists(paths.envPath);
  loadEnvFileIfExists(paths.envLocalPath);
}

/**
 * Parse an .env file and return all key-value entries.
 * Returns empty array if file does not exist.
 */
export function parseEnvFile(filePath: string): EnvEntry[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const entries: EnvEntry[] = [];
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
    entries.push({ key, value });
  }
  return entries;
}

/**
 * Update or append a key=value in an .env file.
 * Preserves comments, blank lines, and ordering.
 * If the key exists, its value is replaced in-place.
 * If the key does not exist, a new line is appended.
 */
export function updateEnvValue(
  filePath: string,
  key: string,
  value: string,
): void {
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
  } catch {
    // File doesn't exist — create with single entry
    fs.mkdirSync(nodePath.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${key}=${value}\n`, "utf-8");
    return;
  }

  const needsQuote = value.includes(" ") || value.includes("#");
  const formatted = needsQuote ? `"${value}"` : value;

  let found = false;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eq = normalized.indexOf("=");
    if (eq <= 0) return line;

    const lineKey = normalized.slice(0, eq).trim();
    if (lineKey === key) {
      found = true;
      const prefix = trimmed.startsWith("export ") ? "export " : "";
      return `${prefix}${key}=${formatted}`;
    }
    return line;
  });

  if (!found) {
    updated.push(`${key}=${formatted}`);
  }

  // Ensure trailing newline
  const content = updated.join("\n").replace(/\n*$/, "\n");
  fs.writeFileSync(filePath, content, "utf-8");
}

/** Resolve the .env.local path for a given env dir or cwd. */
export function resolveEnvLocalPath(envDir?: string): string {
  return resolveEnvFilePaths({ envDir }).envLocalPath;
}

/** Resolve the .env path for a given env dir or cwd. */
export function resolveEnvPath(envDir?: string): string {
  return resolveEnvFilePaths({ envDir }).envPath;
}
