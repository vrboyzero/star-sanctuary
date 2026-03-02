import fs from "node:fs";
import path from "node:path";

const RESTART_COMMAND_COOLDOWN_SECONDS = 180;
const RESTART_COMMAND_COOLDOWN_MS = RESTART_COMMAND_COOLDOWN_SECONDS * 1000;
const RESTART_COOLDOWN_FILE_NAME = "restart-cooldown.json";

const lastRestartCache = new Map<string, number>();

export type RestartCooldownCheck =
  | { allowed: true }
  | { allowed: false; remainingMs: number; remainingSeconds: number };

type RestartCooldownOptions = {
  nowMs?: number;
  stateDir?: string;
};

function normalizeCacheKey(stateDir?: string): string {
  if (!stateDir || !stateDir.trim()) return "__global__";
  return path.resolve(stateDir);
}

function getCooldownFilePath(stateDir?: string): string | null {
  if (!stateDir || !stateDir.trim()) return null;
  return path.join(path.resolve(stateDir), RESTART_COOLDOWN_FILE_NAME);
}

function readLastRestartMs(stateDir?: string): number {
  const cacheKey = normalizeCacheKey(stateDir);
  const cached = lastRestartCache.get(cacheKey);
  if (typeof cached === "number" && Number.isFinite(cached) && cached > 0) {
    return cached;
  }

  const filePath = getCooldownFilePath(stateDir);
  if (!filePath) return 0;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { lastRestartCommandAtMs?: unknown };
    const fromFile = Number(parsed.lastRestartCommandAtMs);
    if (Number.isFinite(fromFile) && fromFile > 0) {
      lastRestartCache.set(cacheKey, fromFile);
      return fromFile;
    }
  } catch {
    // ignore invalid file and fallback to in-memory zero value
  }

  return 0;
}

function persistLastRestartMs(stateDir: string | undefined, value: number): void {
  const cacheKey = normalizeCacheKey(stateDir);
  lastRestartCache.set(cacheKey, value);

  const filePath = getCooldownFilePath(stateDir);
  if (!filePath) return;

  try {
    const payload = { lastRestartCommandAtMs: value };
    fs.writeFileSync(filePath, JSON.stringify(payload), "utf-8");
  } catch {
    // ignore write errors to avoid blocking restart flow
  }
}

export function checkAndConsumeRestartCooldown(opts: RestartCooldownOptions = {}): RestartCooldownCheck {
  const nowMs = opts.nowMs ?? Date.now();
  const lastRestartCommandAtMs = readLastRestartMs(opts.stateDir);
  if (lastRestartCommandAtMs <= 0) {
    persistLastRestartMs(opts.stateDir, nowMs);
    return { allowed: true };
  }

  const elapsedMs = nowMs - lastRestartCommandAtMs;
  const remainingMs = RESTART_COMMAND_COOLDOWN_MS - elapsedMs;
  if (remainingMs > 0) {
    return {
      allowed: false,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  persistLastRestartMs(opts.stateDir, nowMs);
  return { allowed: true };
}

export function formatRestartCooldownMessage(remainingSeconds: number): string {
  return `重启命令仍在冷却中，请在 ${remainingSeconds} 秒后重试。`;
}

export function getRestartCommandCooldownSeconds(): number {
  return RESTART_COMMAND_COOLDOWN_SECONDS;
}
