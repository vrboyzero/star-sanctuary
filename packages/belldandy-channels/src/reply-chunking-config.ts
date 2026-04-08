import fs from "node:fs";
import path from "node:path";

export type OutboundChunkTarget = "discord" | "qq" | "feishu" | "community";
export type ChunkMode = "length" | "newline";

export interface ChannelReplyChunkingAccountPolicy {
  textLimit?: number;
  chunkMode?: ChunkMode;
}

export interface ChannelReplyChunkingPolicy extends ChannelReplyChunkingAccountPolicy {
  accounts?: Record<string, ChannelReplyChunkingAccountPolicy>;
}

export interface ReplyChunkingConfig {
  version: 1;
  channels: Partial<Record<OutboundChunkTarget, ChannelReplyChunkingPolicy>>;
}

const CHANNELS = ["discord", "qq", "feishu", "community"] as const satisfies readonly OutboundChunkTarget[];

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTextLimit(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : undefined;
}

function normalizeChunkMode(value: unknown): ChunkMode | undefined {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "length" || normalized === "newline") return normalized;
  return undefined;
}

function normalizeChannelReplyChunkingAccountPolicy(value: unknown): ChannelReplyChunkingAccountPolicy | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const textLimit = normalizeTextLimit(raw.textLimit);
  const chunkMode = normalizeChunkMode(raw.chunkMode);
  if (textLimit === undefined && chunkMode === undefined) return undefined;
  return {
    ...(textLimit !== undefined ? { textLimit } : {}),
    ...(chunkMode ? { chunkMode } : {}),
  };
}

function normalizeAccountPolicies(value: unknown): Record<string, ChannelReplyChunkingAccountPolicy> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const normalized: Record<string, ChannelReplyChunkingAccountPolicy> = {};
  for (const [rawAccountId, rawPolicy] of Object.entries(value as Record<string, unknown>)) {
    const accountId = normalizeString(rawAccountId);
    if (!accountId) continue;
    const policy = normalizeChannelReplyChunkingAccountPolicy(rawPolicy);
    if (policy) normalized[accountId] = policy;
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function normalizeChannelReplyChunkingPolicy(value: unknown): ChannelReplyChunkingPolicy | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const base = normalizeChannelReplyChunkingAccountPolicy(value);
  const accounts = normalizeAccountPolicies(raw.accounts);
  if (!base && !accounts) return undefined;
  return {
    ...(base ?? {}),
    ...(accounts ? { accounts } : {}),
  };
}

export function normalizeReplyChunkingConfig(raw: unknown): ReplyChunkingConfig {
  const fallback: ReplyChunkingConfig = { version: 1, channels: {} };
  if (!raw || typeof raw !== "object") return fallback;

  const rawChannels = (raw as Record<string, unknown>).channels;
  if (!rawChannels || typeof rawChannels !== "object") return fallback;

  const channels: Partial<Record<OutboundChunkTarget, ChannelReplyChunkingPolicy>> = {};
  for (const channel of CHANNELS) {
    const policy = normalizeChannelReplyChunkingPolicy((rawChannels as Record<string, unknown>)[channel]);
    if (policy) channels[channel] = policy;
  }
  return { version: 1, channels };
}

export function resolveReplyChunkingConfigPath(stateDir: string): string {
  return path.join(stateDir, "channel-reply-chunking.json");
}

export function loadReplyChunkingConfig(configPath: string | undefined): ReplyChunkingConfig {
  const fallback: ReplyChunkingConfig = { version: 1, channels: {} };
  if (!configPath || !configPath.trim()) return fallback;
  try {
    const raw = fs.readFileSync(path.resolve(configPath.trim()), "utf-8");
    return normalizeReplyChunkingConfig(JSON.parse(raw) as unknown);
  } catch {
    return fallback;
  }
}

function pickBasePolicy(policy: ChannelReplyChunkingPolicy | undefined): ChannelReplyChunkingAccountPolicy | undefined {
  if (!policy) return undefined;
  const base: ChannelReplyChunkingAccountPolicy = {
    ...(policy.textLimit !== undefined ? { textLimit: policy.textLimit } : {}),
    ...(policy.chunkMode ? { chunkMode: policy.chunkMode } : {}),
  };
  return Object.keys(base).length ? base : undefined;
}

function mergePolicy(
  base: ChannelReplyChunkingAccountPolicy | undefined,
  override: ChannelReplyChunkingAccountPolicy | undefined,
): ChannelReplyChunkingAccountPolicy | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base?.textLimit !== undefined ? { textLimit: base.textLimit } : {}),
    ...(base?.chunkMode ? { chunkMode: base.chunkMode } : {}),
    ...(override?.textLimit !== undefined ? { textLimit: override.textLimit } : {}),
    ...(override?.chunkMode ? { chunkMode: override.chunkMode } : {}),
  };
}

export function resolveChannelReplyChunkingPolicy(
  config: ReplyChunkingConfig | undefined,
  channel: OutboundChunkTarget,
  accountId?: string,
): ChannelReplyChunkingAccountPolicy | undefined {
  const policy = config?.channels[channel];
  if (!policy) return undefined;
  const base = pickBasePolicy(policy);
  const normalizedAccountId = normalizeString(accountId);
  if (!normalizedAccountId) return base;
  return mergePolicy(base, policy.accounts?.[normalizedAccountId]) ?? base;
}
