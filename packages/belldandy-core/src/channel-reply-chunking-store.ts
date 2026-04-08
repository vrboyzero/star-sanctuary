import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  loadReplyChunkingConfig,
  normalizeReplyChunkingConfig,
  resolveReplyChunkingConfigPath,
  type ReplyChunkingConfig,
} from "@belldandy/channels";

const RENAME_RETRIES = 3;
const RENAME_RETRY_DELAY_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpFile = path.join(path.dirname(filePath), `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await fs.promises.writeFile(tmpFile, content, "utf-8");
  try {
    await fs.promises.chmod(tmpFile, 0o600);
  } catch {
    // ignore on unsupported platforms
  }

  let lastErr: NodeJS.ErrnoException | null = null;
  for (let attempt = 0; attempt < RENAME_RETRIES; attempt += 1) {
    try {
      await fs.promises.rename(tmpFile, filePath);
      return;
    } catch (error) {
      lastErr = error as NodeJS.ErrnoException;
      if (attempt < RENAME_RETRIES - 1) await delay(RENAME_RETRY_DELAY_MS);
    }
  }

  if (process.platform === "win32" && lastErr && (lastErr.code === "EPERM" || lastErr.code === "EBUSY")) {
    await fs.promises.writeFile(filePath, content, "utf-8");
    await fs.promises.unlink(tmpFile).catch(() => {});
    return;
  }

  await fs.promises.unlink(tmpFile).catch(() => {});
  throw lastErr;
}

export async function writeChannelReplyChunkingConfig(stateDir: string, config: ReplyChunkingConfig): Promise<void> {
  await writeJsonAtomic(resolveReplyChunkingConfigPath(stateDir), normalizeReplyChunkingConfig(config));
}

export function stringifyChannelReplyChunkingConfig(config: ReplyChunkingConfig): string {
  return `${JSON.stringify(normalizeReplyChunkingConfig(config), null, 2)}\n`;
}

export function parseChannelReplyChunkingConfigContent(content: string): ReplyChunkingConfig {
  const raw = content.trim() ? JSON.parse(content) as unknown : {};
  return normalizeReplyChunkingConfig(raw);
}

export function getChannelReplyChunkingConfigContent(
  stateDir: string,
): { path: string; config: ReplyChunkingConfig; content: string } {
  const configPath = resolveReplyChunkingConfigPath(stateDir);
  const config = loadReplyChunkingConfig(configPath);
  return {
    path: configPath,
    config,
    content: stringifyChannelReplyChunkingConfig(config),
  };
}
