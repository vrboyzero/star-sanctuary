import type { ModelConfigFile, ModelProfile } from "@belldandy/agent";
import type { WebhookConfig, WebhookRule } from "../../webhook/types.js";

export type AdvancedModule = "community" | "models" | "webhook" | "cron";

const WEBHOOK_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const HEARTBEAT_INTERVAL_PATTERN = /^(\d+)(m|h|s)?$/i;

export function upsertModelFallbackProfile(
  config: ModelConfigFile,
  profile: ModelProfile,
): ModelConfigFile {
  const fallbacks = [...config.fallbacks];
  const index = fallbacks.findIndex((item) => item.id === profile.id);
  if (index >= 0) {
    fallbacks[index] = { ...fallbacks[index], ...profile };
  } else {
    fallbacks.push(profile);
  }
  return { fallbacks };
}

export function removeModelFallbackProfile(
  config: ModelConfigFile,
  id: string,
): ModelConfigFile {
  return {
    fallbacks: config.fallbacks.filter((item) => item.id !== id),
  };
}

export function upsertWebhookRule(
  config: WebhookConfig,
  rule: WebhookRule,
): WebhookConfig {
  const webhooks = [...config.webhooks];
  const index = webhooks.findIndex((item) => item.id === rule.id);
  if (index >= 0) {
    webhooks[index] = { ...webhooks[index], ...rule };
  } else {
    webhooks.push(rule);
  }
  return {
    version: 1,
    webhooks,
  };
}

export function removeWebhookRule(
  config: WebhookConfig,
  id: string,
): WebhookConfig {
  return {
    version: 1,
    webhooks: config.webhooks.filter((item) => item.id !== id),
  };
}

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

export function validateHttpUrl(
  value: string,
  label: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label} is required`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return `${label} must be a valid http(s) URL`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${label} must use http or https`;
  }
  return undefined;
}

export function validateWebhookId(
  value: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Webhook id is required";
  }
  if (!WEBHOOK_ID_PATTERN.test(trimmed)) {
    return "Webhook id may only contain letters, numbers, dot, underscore, or dash";
  }
  return undefined;
}

export function validateHeartbeatInterval(
  value: string,
): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "Heartbeat interval is required";
  }
  const match = HEARTBEAT_INTERVAL_PATTERN.exec(trimmed);
  if (!match) {
    return "Heartbeat interval must be like 30m, 1h, or 45s";
  }
  if (Number.parseInt(match[1], 10) < 1) {
    return "Heartbeat interval must be greater than 0";
  }
  return undefined;
}
