import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  loadChannelSecurityConfig,
  normalizeChannelSecurityConfig,
  resolveChannelSecurityPolicy,
  resolveChannelSecurityConfigPath,
  type ChannelSecurityConfig,
  type ChannelSecurityAccountPolicy,
  type ChannelSecurityPolicy,
  type SecurityBackedChannelKind,
} from "@belldandy/channels";

export interface ChannelSecurityApprovalRequest {
  id: string;
  channel: SecurityBackedChannelKind;
  accountId?: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatKind: "dm";
  messagePreview?: string;
  requestedAt: string;
  updatedAt: string;
  seenCount: number;
}

export interface ChannelSecurityApprovalStore {
  version: 1;
  pending: ChannelSecurityApprovalRequest[];
}

export interface ChannelSecurityApprovalRequestInput {
  channel: SecurityBackedChannelKind;
  accountId?: string;
  senderId: string;
  senderName?: string;
  chatId: string;
  chatKind: "dm";
  messagePreview?: string;
}

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

export async function writeChannelSecurityConfig(stateDir: string, config: ChannelSecurityConfig): Promise<void> {
  await writeJsonAtomic(resolveChannelSecurityConfigPath(stateDir), normalizeChannelSecurityConfig(config));
}

export function stringifyChannelSecurityConfig(config: ChannelSecurityConfig): string {
  return `${JSON.stringify(normalizeChannelSecurityConfig(config), null, 2)}\n`;
}

export function parseChannelSecurityConfigContent(content: string): ChannelSecurityConfig {
  const raw = content.trim() ? JSON.parse(content) as unknown : {};
  return normalizeChannelSecurityConfig(raw);
}

export function getChannelSecurityConfigContent(stateDir: string): { path: string; config: ChannelSecurityConfig; content: string } {
  const configPath = resolveChannelSecurityConfigPath(stateDir);
  const config = loadChannelSecurityConfig(configPath);
  return {
    path: configPath,
    config,
    content: stringifyChannelSecurityConfig(config),
  };
}

export function resolveChannelSecurityApprovalStorePath(stateDir: string): string {
  return path.join(stateDir, "channel-security-approvals.json");
}

export async function readChannelSecurityApprovalStore(stateDir: string): Promise<ChannelSecurityApprovalStore> {
  const filePath = resolveChannelSecurityApprovalStorePath(stateDir);
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ChannelSecurityApprovalStore> | null;
    const pending = Array.isArray(parsed?.pending)
      ? parsed.pending.filter((item): item is ChannelSecurityApprovalRequest =>
        Boolean(item)
        && typeof item?.id === "string"
        && typeof item?.channel === "string"
        && typeof item?.senderId === "string"
        && typeof item?.chatId === "string")
      : [];
    return { version: 1, pending };
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return { version: 1, pending: [] };
    }
    return { version: 1, pending: [] };
  }
}

export async function writeChannelSecurityApprovalStore(
  stateDir: string,
  store: ChannelSecurityApprovalStore,
): Promise<void> {
  await writeJsonAtomic(resolveChannelSecurityApprovalStorePath(stateDir), {
    version: 1,
    pending: Array.isArray(store.pending) ? store.pending : [],
  });
}

function normalizeMessagePreview(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 160);
}

function normalizeAccountId(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export async function upsertChannelSecurityApprovalRequest(
  stateDir: string,
  input: ChannelSecurityApprovalRequestInput,
): Promise<ChannelSecurityApprovalRequest> {
  const config = loadChannelSecurityConfig(resolveChannelSecurityConfigPath(stateDir));
  const accountId = normalizeAccountId(input.accountId);
  const allowFrom = resolveChannelSecurityPolicy(config, input.channel, accountId)?.allowFrom ?? [];
  if (allowFrom.includes(input.senderId)) {
    return {
      id: "",
      channel: input.channel,
      ...(accountId ? { accountId } : {}),
      senderId: input.senderId,
      ...(input.senderName ? { senderName: input.senderName } : {}),
      chatId: input.chatId,
      chatKind: "dm",
      ...(normalizeMessagePreview(input.messagePreview) ? { messagePreview: normalizeMessagePreview(input.messagePreview) } : {}),
      requestedAt: "",
      updatedAt: "",
      seenCount: 0,
    };
  }

  const store = await readChannelSecurityApprovalStore(stateDir);
  const existing = store.pending.find((item) =>
    item.channel === input.channel
    && normalizeAccountId(item.accountId) === accountId
    && item.senderId === input.senderId);
  const now = new Date().toISOString();
  const messagePreview = normalizeMessagePreview(input.messagePreview);

  if (existing) {
    existing.updatedAt = now;
    existing.seenCount += 1;
    existing.chatId = input.chatId;
    if (input.senderName) existing.senderName = input.senderName;
    if (messagePreview) existing.messagePreview = messagePreview;
    await writeChannelSecurityApprovalStore(stateDir, store);
    return existing;
  }

  const created: ChannelSecurityApprovalRequest = {
    id: crypto.randomUUID(),
    channel: input.channel,
    ...(accountId ? { accountId } : {}),
    senderId: input.senderId,
    ...(input.senderName ? { senderName: input.senderName } : {}),
    chatId: input.chatId,
    chatKind: "dm",
    ...(messagePreview ? { messagePreview } : {}),
    requestedAt: now,
    updatedAt: now,
    seenCount: 1,
  };
  store.pending.push(created);
  await writeChannelSecurityApprovalStore(stateDir, store);
  return created;
}

function mergeApprovedSenderIntoAccountPolicy(
  policy: ChannelSecurityAccountPolicy | undefined,
  senderId: string,
): ChannelSecurityAccountPolicy {
  const allowFrom = Array.from(new Set([...(policy?.allowFrom ?? []), senderId]));
  return {
    ...(policy ?? {}),
    dmPolicy: "allowlist",
    allowFrom,
  };
}

function mergeApprovedSenderIntoPolicy(
  policy: ChannelSecurityPolicy | undefined,
  senderId: string,
  accountId?: string,
): ChannelSecurityPolicy {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) {
    return mergeApprovedSenderIntoAccountPolicy(policy, senderId);
  }
  const nextAccounts = {
    ...(policy?.accounts ?? {}),
    [normalizedAccountId]: mergeApprovedSenderIntoAccountPolicy(policy?.accounts?.[normalizedAccountId], senderId),
  };
  return {
    ...(policy ?? {}),
    accounts: nextAccounts,
  };
}

export async function approveChannelSecurityApprovalRequest(stateDir: string, requestId: string): Promise<{
  request: ChannelSecurityApprovalRequest;
  config: ChannelSecurityConfig;
}> {
  const store = await readChannelSecurityApprovalStore(stateDir);
  const request = store.pending.find((item) => item.id === requestId);
  if (!request) {
    throw new Error("channel security approval request not found");
  }

  const current = loadChannelSecurityConfig(resolveChannelSecurityConfigPath(stateDir));
  const next: ChannelSecurityConfig = {
    version: 1,
    channels: {
      ...current.channels,
      [request.channel]: mergeApprovedSenderIntoPolicy(
        current.channels[request.channel],
        request.senderId,
        request.accountId,
      ),
    },
  };
  await writeChannelSecurityConfig(stateDir, next);

  store.pending = store.pending.filter((item) => item.id !== requestId);
  await writeChannelSecurityApprovalStore(stateDir, store);

  return {
    request,
    config: next,
  };
}

export async function rejectChannelSecurityApprovalRequest(
  stateDir: string,
  requestId: string,
): Promise<ChannelSecurityApprovalRequest> {
  const store = await readChannelSecurityApprovalStore(stateDir);
  const request = store.pending.find((item) => item.id === requestId);
  if (!request) {
    throw new Error("channel security approval request not found");
  }
  store.pending = store.pending.filter((item) => item.id !== requestId);
  await writeChannelSecurityApprovalStore(stateDir, store);
  return request;
}
