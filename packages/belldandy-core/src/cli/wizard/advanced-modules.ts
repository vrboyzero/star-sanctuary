import fs from "node:fs/promises";
import path from "node:path";

import * as p from "@clack/prompts";
import {
  addAgentConfig,
  loadCommunityConfig,
  removeAgentConfig,
  saveCommunityConfig,
} from "@belldandy/channels";
import type { CommunityAgentConfig } from "@belldandy/channels";
import {
  readModelFallbackConfig,
  resolveModelFallbackConfigPath,
  writeModelFallbackConfig,
} from "../../model-fallback-config.js";
import { updateEnvValue, removeEnvValue, parseEnvFile } from "../shared/env-loader.js";
import { loadWebhookConfig } from "../../webhook/config.js";
import type { WebhookConfig } from "../../webhook/types.js";
import type { SetupAuthMode } from "./onboard-shared.js";
import {
  parseBooleanEnv,
  removeModelFallbackProfile,
  removeWebhookRule,
  validateHeartbeatInterval,
  validateHttpUrl,
  validateWebhookId,
  upsertModelFallbackProfile,
  upsertWebhookRule,
} from "./advanced-modules-shared.js";
import type { AdvancedModule } from "./advanced-modules-shared.js";

export interface AdvancedModulesWizardOptions {
  envPath: string;
  stateDir: string;
  authMode: SetupAuthMode;
  modules?: AdvancedModule[];
}

export interface AdvancedModulesWizardResult {
  configuredModules: AdvancedModule[];
  notes: string[];
}

function resolvePromptValue<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}

async function promptSecret(message: string, existingValue?: string): Promise<string> {
  if (existingValue) {
    const keepExisting = resolvePromptValue(await p.confirm({
      message: `Keep existing ${message}?`,
      initialValue: true,
      active: "Keep",
      inactive: "Re-enter",
    }));
    if (keepExisting) {
      return existingValue;
    }
  }

  return resolvePromptValue(await p.password({
    message,
    validate: (value) => (!value.trim() ? `${message} is required` : undefined),
  }));
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function getEnvMap(envPath: string): Map<string, string> {
  return new Map(parseEnvFile(envPath).map((entry) => [entry.key, entry.value]));
}

async function withStateDirEnv<T>(stateDir: string, action: () => Promise<T>): Promise<T> {
  const previousStateDir = process.env.BELLDANDY_STATE_DIR;
  process.env.BELLDANDY_STATE_DIR = stateDir;
  try {
    return await action();
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.BELLDANDY_STATE_DIR;
    } else {
      process.env.BELLDANDY_STATE_DIR = previousStateDir;
    }
  }
}

function showCurrentConfigNote(title: string, lines: string[]): void {
  p.note(lines.join("\n"), title);
}

function formatCommunityAgentSummary(agent: CommunityAgentConfig): string {
  const room = agent.room?.name ? `room=${agent.room.name}` : "room=none";
  return `${agent.name} (${room})`;
}

function formatFallbackSummary(profile: {
  id?: string;
  model?: string;
  baseUrl?: string;
}): string {
  const id = profile.id?.trim() || "<missing-id>";
  const model = profile.model?.trim() || "<missing-model>";
  const baseUrl = profile.baseUrl?.trim() || "<missing-base-url>";
  return `${id} -> ${model} @ ${baseUrl}`;
}

function formatWebhookSummary(rule: {
  id: string;
  enabled?: boolean;
  defaultAgentId?: string;
}): string {
  const enabled = rule.enabled === false ? "disabled" : "enabled";
  const agent = rule.defaultAgentId?.trim() || "default";
  return `${rule.id} (${enabled}, agent=${agent})`;
}

async function runCommunityModule(options: AdvancedModulesWizardOptions): Promise<string[]> {
  const notes: string[] = [];
  const envValues = getEnvMap(options.envPath);
  const existingConfig = await withStateDirEnv(options.stateDir, async () => loadCommunityConfig());
  const communityApiEnabledBefore = parseBooleanEnv(envValues.get("BELLDANDY_COMMUNITY_API_ENABLED"), false);

  showCurrentConfigNote("Current community config", [
    `Endpoint: ${existingConfig.endpoint}`,
    `Agents: ${existingConfig.agents.length === 0 ? "none" : existingConfig.agents.map(formatCommunityAgentSummary).join(", ")}`,
    `Community API: ${options.authMode === "none" ? "disabled by auth=none" : communityApiEnabledBefore ? "enabled" : "disabled"}`,
  ]);

  const shouldConfigure = resolvePromptValue(await p.confirm({
    message: "Configure community access now?",
    initialValue: existingConfig.agents.length > 0 || communityApiEnabledBefore,
    active: "Yes",
    inactive: "Skip",
  }));
  if (!shouldConfigure) {
    return notes;
  }

  const endpoint = resolvePromptValue(await p.text({
    message: "Community endpoint",
    defaultValue: existingConfig.endpoint,
    validate: (value) => validateHttpUrl(value, "Community endpoint"),
  }));

  await withStateDirEnv(options.stateDir, async () => {
    saveCommunityConfig({
      ...existingConfig,
      endpoint,
    });
  });
  notes.push(`Community endpoint saved: ${path.join(options.stateDir, "community.json")}`);

  const agentAction = existingConfig.agents.length > 0
    ? resolvePromptValue(await p.select<"upsert" | "remove" | "skip">({
      message: "Community agent action",
      options: [
        { value: "upsert", label: "Add or update one agent", hint: `${existingConfig.agents.length} existing` },
        { value: "remove", label: "Remove one agent" },
        { value: "skip", label: "Skip agent changes" },
      ],
      initialValue: "upsert",
    }))
    : resolvePromptValue(await p.confirm({
      message: "Add one community agent now?",
      initialValue: true,
      active: "Yes",
      inactive: "Skip",
    })) ? "upsert" : "skip";

  if (agentAction === "upsert") {
    const targetAgentName = existingConfig.agents.length > 0
      ? resolvePromptValue(await p.select<string>({
        message: "Choose community agent",
        options: [
          { value: "__new__", label: "Create new agent", hint: "Keep existing agents" },
          ...existingConfig.agents.map((agent) => ({
            value: agent.name,
            label: agent.name,
            hint: agent.room?.name ? `room=${agent.room.name}` : "room not set",
          })),
        ],
        initialValue: existingConfig.agents[0]?.name ?? "__new__",
      }))
      : "__new__";
    const existingAgent = targetAgentName === "__new__"
      ? undefined
      : existingConfig.agents.find((item) => item.name === targetAgentName);
    const name = resolvePromptValue(await p.text({
      message: "Community agent name",
      defaultValue: existingAgent?.name ?? (existingConfig.agents.length === 0 ? "default" : `agent-${existingConfig.agents.length + 1}`),
      validate: (value) => (!value.trim() ? "Agent name is required" : undefined),
    }));
    const apiKey = await promptSecret("Community agent API key", existingAgent?.apiKey);
    const roomName = resolvePromptValue(await p.text({
      message: "Room name (optional)",
      defaultValue: existingAgent?.room?.name ?? "",
    }));
    const roomPassword = roomName
      ? resolvePromptValue(await p.text({
        message: "Room password (optional)",
        defaultValue: existingAgent?.room?.password ?? "",
      }))
      : "";

    const agentConfig: CommunityAgentConfig = {
      name,
      apiKey,
      office: existingAgent?.office,
      room: roomName
        ? {
          name: roomName,
          password: roomPassword.trim() || undefined,
        }
        : undefined,
    };
    await withStateDirEnv(options.stateDir, async () => {
      addAgentConfig(agentConfig);
    });
    notes.push(`Community agent updated: ${name}`);
  } else if (agentAction === "remove") {
    const agentName = resolvePromptValue(await p.select<string>({
      message: "Choose community agent to remove",
      options: existingConfig.agents.map((agent) => ({
        value: agent.name,
        label: agent.name,
        hint: agent.room?.name ? `room=${agent.room.name}` : "room not set",
      })),
      initialValue: existingConfig.agents[0]?.name,
    }));
    const confirmed = resolvePromptValue(await p.confirm({
      message: `Remove community agent "${agentName}"?`,
      initialValue: false,
      active: "Remove",
      inactive: "Keep",
    }));
    if (confirmed) {
      await withStateDirEnv(options.stateDir, async () => {
        removeAgentConfig(agentName);
      });
      notes.push(`Community agent removed: ${agentName}`);
    }
  }

  if (options.authMode === "none") {
    p.note(
      "Current auth mode is none. Community HTTP API stays disabled until token/password auth is enabled.",
      "Community API skipped",
    );
    updateEnvValue(options.envPath, "BELLDANDY_COMMUNITY_API_ENABLED", "false");
    removeEnvValue(options.envPath, "BELLDANDY_COMMUNITY_API_TOKEN");
    return notes;
  }

  const communityApiEnabled = resolvePromptValue(await p.confirm({
    message: "Enable Community HTTP API (/api/message)?",
    initialValue: parseBooleanEnv(envValues.get("BELLDANDY_COMMUNITY_API_ENABLED"), false),
    active: "Enable",
    inactive: "Disable",
  }));
  updateEnvValue(options.envPath, "BELLDANDY_COMMUNITY_API_ENABLED", communityApiEnabled ? "true" : "false");

  if (communityApiEnabled) {
    const existingToken = envValues.get("BELLDANDY_COMMUNITY_API_TOKEN");
    const useDedicatedToken = options.authMode === "password"
      ? true
      : resolvePromptValue(await p.confirm({
        message: "Use a dedicated Community API token instead of falling back to gateway auth?",
        initialValue: Boolean(existingToken),
        active: "Dedicated",
        inactive: "Reuse gateway auth",
      }));
    if (useDedicatedToken) {
      const token = await promptSecret("Community API token", existingToken);
      updateEnvValue(options.envPath, "BELLDANDY_COMMUNITY_API_TOKEN", token);
      notes.push("Community HTTP API enabled with dedicated token");
    } else {
      removeEnvValue(options.envPath, "BELLDANDY_COMMUNITY_API_TOKEN");
      notes.push("Community HTTP API enabled and will reuse gateway auth token");
    }
  } else {
    removeEnvValue(options.envPath, "BELLDANDY_COMMUNITY_API_TOKEN");
    notes.push("Community HTTP API disabled");
  }

  return notes;
}

async function runModelsModule(options: AdvancedModulesWizardOptions): Promise<string[]> {
  const notes: string[] = [];
  const configPath = resolveModelFallbackConfigPath(options.stateDir);
  const existingConfig = await readModelFallbackConfig(configPath);

  showCurrentConfigNote("Current fallback models", [
    `Count: ${existingConfig.fallbacks.length}`,
    `Entries: ${existingConfig.fallbacks.length === 0 ? "none" : existingConfig.fallbacks.map(formatFallbackSummary).join(", ")}`,
  ]);

  const shouldConfigure = resolvePromptValue(await p.confirm({
    message: "Configure fallback models now?",
    initialValue: existingConfig.fallbacks.length > 0,
    active: "Yes",
    inactive: "Skip",
  }));
  if (!shouldConfigure) {
    return notes;
  }

  const action = existingConfig.fallbacks.length > 0
    ? resolvePromptValue(await p.select<"upsert" | "remove" | "clear">({
      message: "Fallback model action",
      options: [
        { value: "upsert", label: "Add or update one fallback", hint: `${existingConfig.fallbacks.length} existing` },
        { value: "remove", label: "Remove one fallback" },
        { value: "clear", label: "Clear all fallbacks" },
      ],
      initialValue: "upsert",
    }))
    : "upsert";

  if (action === "clear") {
    await writeModelFallbackConfig(configPath, { fallbacks: [] });
    notes.push(`Cleared fallback models: ${configPath}`);
    return notes;
  }

  if (action === "remove") {
    const fallbackId = resolvePromptValue(await p.select<string>({
      message: "Choose fallback to remove",
      options: existingConfig.fallbacks.map((profile) => ({
        value: profile.id ?? "",
        label: profile.id ?? "<missing-id>",
        hint: profile.model ?? profile.baseUrl ?? "configured fallback",
      })),
      initialValue: existingConfig.fallbacks[0]?.id ?? "",
    }));
    const confirmed = resolvePromptValue(await p.confirm({
      message: `Remove fallback "${fallbackId}"?`,
      initialValue: false,
      active: "Remove",
      inactive: "Keep",
    }));
    if (!confirmed) {
      return notes;
    }
    const nextConfig = removeModelFallbackProfile(existingConfig, fallbackId);
    await writeModelFallbackConfig(configPath, nextConfig);
    notes.push(`Removed fallback model: ${fallbackId} (${nextConfig.fallbacks.length} remaining)`);
    return notes;
  }

  const selectedFallbackId = existingConfig.fallbacks.length > 0
    ? resolvePromptValue(await p.select<string>({
      message: "Choose fallback to edit",
      options: [
        { value: "__new__", label: "Create new fallback", hint: "Keep existing fallbacks" },
        ...existingConfig.fallbacks.map((profile) => ({
          value: profile.id ?? "",
          label: profile.id ?? "<missing-id>",
          hint: profile.model ?? profile.baseUrl ?? "configured fallback",
        })),
      ],
      initialValue: existingConfig.fallbacks[0]?.id ?? "__new__",
    }))
    : "__new__";
  const defaultProfile = selectedFallbackId === "__new__"
    ? undefined
    : existingConfig.fallbacks.find((item) => item.id === selectedFallbackId);
  const id = resolvePromptValue(await p.text({
    message: "Fallback id",
    defaultValue: defaultProfile?.id ?? `fallback-${existingConfig.fallbacks.length + 1}`,
    validate: (value) => (!value.trim() ? "Fallback id is required" : undefined),
  }));
  const existingProfile = existingConfig.fallbacks.find((item) => item.id === id);
  const displayName = resolvePromptValue(await p.text({
    message: "Display name (optional)",
    defaultValue: existingProfile?.displayName ?? "",
  }));
  const baseUrl = resolvePromptValue(await p.text({
    message: "Fallback API Base URL",
    defaultValue: existingProfile?.baseUrl ?? "https://api.openai.com/v1",
    validate: (value) => validateHttpUrl(value, "Fallback API Base URL"),
  }));
  const apiKey = await promptSecret("Fallback API key", existingProfile?.apiKey);
  const model = resolvePromptValue(await p.text({
    message: "Fallback model name",
    defaultValue: existingProfile?.model ?? "",
    validate: (value) => (!value.trim() ? "Model name is required" : undefined),
  }));
  const protocol = resolvePromptValue(await p.text({
    message: "Protocol (optional)",
    defaultValue: existingProfile?.protocol ?? "",
  }));
  const wireApi = resolvePromptValue(await p.text({
    message: "Wire API (optional)",
    defaultValue: existingProfile?.wireApi ?? "",
  }));

  const nextConfig = upsertModelFallbackProfile(existingConfig, {
    id,
    displayName: displayName.trim() || undefined,
    baseUrl,
    apiKey,
    model,
    protocol: protocol.trim() || undefined,
    wireApi: wireApi.trim() || undefined,
  });
  await writeModelFallbackConfig(configPath, nextConfig);
  notes.push(`Fallback models saved: ${configPath} (${nextConfig.fallbacks.length} total)`);
  return notes;
}

async function runWebhookModule(options: AdvancedModulesWizardOptions): Promise<string[]> {
  const notes: string[] = [];
  const configPath = path.join(options.stateDir, "webhooks.json");
  const existingConfig = loadWebhookConfig(configPath);

  showCurrentConfigNote("Current webhook config", [
    `Count: ${existingConfig.webhooks.length}`,
    `Entries: ${existingConfig.webhooks.length === 0 ? "none" : existingConfig.webhooks.map(formatWebhookSummary).join(", ")}`,
  ]);

  const shouldConfigure = resolvePromptValue(await p.confirm({
    message: "Configure webhook API now?",
    initialValue: existingConfig.webhooks.length > 0,
    active: "Yes",
    inactive: "Skip",
  }));
  if (!shouldConfigure) {
    return notes;
  }

  const action = existingConfig.webhooks.length > 0
    ? resolvePromptValue(await p.select<"upsert" | "remove" | "clear">({
      message: "Webhook action",
      options: [
        { value: "upsert", label: "Add or update one webhook", hint: `${existingConfig.webhooks.length} existing` },
        { value: "remove", label: "Remove one webhook" },
        { value: "clear", label: "Clear all webhooks" },
      ],
      initialValue: "upsert",
    }))
    : "upsert";

  if (action === "clear") {
    const cleared: WebhookConfig = { version: 1, webhooks: [] };
    await writeJsonFile(configPath, cleared);
    notes.push(`Cleared webhook config: ${configPath}`);
    return notes;
  }

  if (action === "remove") {
    const webhookId = resolvePromptValue(await p.select<string>({
      message: "Choose webhook to remove",
      options: existingConfig.webhooks.map((rule) => ({
        value: rule.id,
        label: rule.id,
        hint: rule.defaultAgentId ?? "default agent",
      })),
      initialValue: existingConfig.webhooks[0]?.id,
    }));
    const confirmed = resolvePromptValue(await p.confirm({
      message: `Remove webhook "${webhookId}"?`,
      initialValue: false,
      active: "Remove",
      inactive: "Keep",
    }));
    if (!confirmed) {
      return notes;
    }
    const nextConfig = removeWebhookRule(existingConfig, webhookId);
    await writeJsonFile(configPath, nextConfig);
    notes.push(`Webhook removed: ${webhookId} (${nextConfig.webhooks.length} remaining)`);
    return notes;
  }

  const selectedWebhookId = existingConfig.webhooks.length > 0
    ? resolvePromptValue(await p.select<string>({
      message: "Choose webhook to edit",
      options: [
        { value: "__new__", label: "Create new webhook", hint: "Keep existing rules" },
        ...existingConfig.webhooks.map((rule) => ({
          value: rule.id,
          label: rule.id,
          hint: rule.defaultAgentId ?? "default agent",
        })),
      ],
      initialValue: existingConfig.webhooks[0]?.id ?? "__new__",
    }))
    : "__new__";
  const defaultRule = selectedWebhookId === "__new__"
    ? undefined
    : existingConfig.webhooks.find((item) => item.id === selectedWebhookId);
  const id = resolvePromptValue(await p.text({
    message: "Webhook id",
    defaultValue: defaultRule?.id ?? "audit",
    validate: (value) => validateWebhookId(value),
  }));
  const existingRule = existingConfig.webhooks.find((item) => item.id === id);
  const enabled = resolvePromptValue(await p.confirm({
    message: "Enable this webhook rule?",
    initialValue: existingRule?.enabled ?? true,
    active: "Enable",
    inactive: "Disable",
  }));
  const token = await promptSecret("Webhook bearer token", existingRule?.token);
  const defaultAgentId = resolvePromptValue(await p.text({
    message: "Default agent id (optional)",
    defaultValue: existingRule?.defaultAgentId ?? "default",
  }));
  const conversationIdPrefix = resolvePromptValue(await p.text({
    message: "Conversation id prefix (optional)",
    defaultValue: existingRule?.conversationIdPrefix ?? "",
  }));

  const nextConfig = upsertWebhookRule(existingConfig, {
    id,
    enabled,
    token,
    defaultAgentId: defaultAgentId.trim() || undefined,
    conversationIdPrefix: conversationIdPrefix.trim() || undefined,
    promptTemplate: existingRule?.promptTemplate,
  });
  await writeJsonFile(configPath, nextConfig);
  notes.push(`Webhook config saved: ${configPath} (/api/webhook/${id})`);
  return notes;
}

async function runCronModule(options: AdvancedModulesWizardOptions): Promise<string[]> {
  const notes: string[] = [];
  const envValues = getEnvMap(options.envPath);
  const cronEnabledBefore = parseBooleanEnv(envValues.get("BELLDANDY_CRON_ENABLED"), true);
  const heartbeatEnabledBefore = parseBooleanEnv(envValues.get("BELLDANDY_HEARTBEAT_ENABLED"), true);
  const heartbeatIntervalBefore = envValues.get("BELLDANDY_HEARTBEAT_INTERVAL") ?? "30m";

  showCurrentConfigNote("Current automation switches", [
    `Cron runtime: ${cronEnabledBefore ? "enabled" : "disabled"}`,
    `Heartbeat runtime: ${heartbeatEnabledBefore ? `enabled (${heartbeatIntervalBefore})` : "disabled"}`,
    `Cron jobs file: ${path.join(options.stateDir, "cron-jobs.json")}`,
  ]);

  const shouldConfigure = resolvePromptValue(await p.confirm({
    message: "Configure automation switches now?",
    initialValue: !cronEnabledBefore || !heartbeatEnabledBefore || envValues.has("BELLDANDY_HEARTBEAT_INTERVAL"),
    active: "Yes",
    inactive: "Skip",
  }));
  if (!shouldConfigure) {
    return notes;
  }

  const cronEnabled = resolvePromptValue(await p.confirm({
    message: "Enable cron runtime?",
    initialValue: parseBooleanEnv(envValues.get("BELLDANDY_CRON_ENABLED"), true),
    active: "Enable",
    inactive: "Disable",
  }));
  const heartbeatEnabled = resolvePromptValue(await p.confirm({
    message: "Enable heartbeat runtime?",
    initialValue: parseBooleanEnv(envValues.get("BELLDANDY_HEARTBEAT_ENABLED"), true),
    active: "Enable",
    inactive: "Disable",
  }));
  let heartbeatInterval = envValues.get("BELLDANDY_HEARTBEAT_INTERVAL") ?? "30m";
  if (heartbeatEnabled) {
    heartbeatInterval = resolvePromptValue(await p.text({
      message: "Heartbeat interval",
      defaultValue: heartbeatInterval,
      validate: (value) => validateHeartbeatInterval(value),
    }));
  }

  updateEnvValue(options.envPath, "BELLDANDY_CRON_ENABLED", cronEnabled ? "true" : "false");
  updateEnvValue(options.envPath, "BELLDANDY_HEARTBEAT_ENABLED", heartbeatEnabled ? "true" : "false");
  if (heartbeatEnabled) {
    updateEnvValue(options.envPath, "BELLDANDY_HEARTBEAT_INTERVAL", heartbeatInterval);
  } else {
    removeEnvValue(options.envPath, "BELLDANDY_HEARTBEAT_INTERVAL");
  }

  notes.push(`Automation switches updated (.env.local); cron=${cronEnabled ? "enabled" : "disabled"}, heartbeat=${heartbeatEnabled ? heartbeatInterval : "disabled"}`);
  notes.push(`Cron jobs live in ${path.join(options.stateDir, "cron-jobs.json")}`);
  return notes;
}

export async function runAdvancedModulesWizard(
  options: AdvancedModulesWizardOptions,
): Promise<AdvancedModulesWizardResult> {
  const configuredModules: AdvancedModule[] = [];
  const notes: string[] = [];
  const modules = options.modules ?? ["community", "models", "webhook", "cron"];

  for (const module of modules) {
    let nextNotes: string[] = [];
    if (module === "community") {
      nextNotes = await runCommunityModule(options);
    } else if (module === "models") {
      nextNotes = await runModelsModule(options);
    } else if (module === "webhook") {
      nextNotes = await runWebhookModule(options);
    } else if (module === "cron") {
      nextNotes = await runCronModule(options);
    }

    if (nextNotes.length > 0) {
      configuredModules.push(module);
      notes.push(...nextNotes);
    }
  }

  return {
    configuredModules,
    notes,
  };
}
