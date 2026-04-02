import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { parseExtensionManifest, PluginRegistry } from "@belldandy/plugins";
import type { HookName, HookRegistry } from "@belldandy/agent";
import {
  createSkillGetTool,
  createSkillsListTool,
  createSkillsSearchTool,
  registerGlobalSkillRegistry,
  SkillRegistry,
  type SkillDefinition,
  type ToolExecutor,
} from "@belldandy/skills";

import {
  buildExtensionRuntimeReport,
  listEnabledPromptSkills,
  listEnabledSearchableSkills,
  type ExtensionRuntimeReport,
} from "./extension-runtime.js";
import { listInstalledExtensions } from "./extension-marketplace-state.js";
import type { ToolsConfigManager } from "./tools-config.js";

export interface ExtensionHostLogger {
  info(scope: string, message: string): void;
  warn(scope: string, message: string, detail?: unknown): void;
}

export interface InitializeExtensionHostOptions {
  stateDir: string;
  bundledSkillsDir: string;
  workspaceRoot: string;
  toolsEnabled: boolean;
  toolExecutor: ToolExecutor;
  toolsConfigManager: ToolsConfigManager;
  logger: ExtensionHostLogger;
  activeMcpServers?: string[];
  pluginRegistry?: PluginRegistry;
  skillRegistry?: SkillRegistry;
}

type LegacyPluginHookName = "beforeRun" | "afterRun" | "beforeToolCall" | "afterToolCall";

export interface ExtensionHostHookBridgeRegistration {
  legacyHookName: LegacyPluginHookName;
  hookName: HookName;
  available: boolean;
  bridged: boolean;
}

export interface ExtensionHostHookBridgeSummary {
  source: string;
  availableHookCount: number;
  bridgedHookCount: number;
  registrations: ExtensionHostHookBridgeRegistration[];
  lastBridgedAt?: Date;
}

export interface ExtensionHostLifecycleSummary {
  pluginToolsRegistered: number;
  skillManagementToolsRegistered: string[];
  bundledSkillsLoaded: number;
  userSkillsLoaded: number;
  pluginSkillsLoaded: number;
  installedMarketplaceExtensionsLoaded: number;
  installedMarketplacePluginsLoaded: number;
  installedMarketplaceSkillPacksLoaded: number;
  eligibilityRefreshed: boolean;
  loadCompletedAt?: Date;
  hookBridge: ExtensionHostHookBridgeSummary;
}

export interface ExtensionHostState {
  pluginRegistry: PluginRegistry;
  skillRegistry: SkillRegistry;
  extensionRuntime: ExtensionRuntimeReport;
  promptSkills: SkillDefinition[];
  searchableSkills: SkillDefinition[];
  lifecycle: ExtensionHostLifecycleSummary;
}

const LEGACY_PLUGIN_HOOK_BRIDGE_REGISTRATIONS: Array<{
  legacyHookName: LegacyPluginHookName;
  hookName: HookName;
  register: (
    hookRegistry: HookRegistry,
    legacyHooks: ReturnType<PluginRegistry["getAggregatedHooks"]>,
    source: string,
    priority: number,
  ) => void;
}> = [
  {
    legacyHookName: "beforeRun",
    hookName: "before_agent_start",
    register: (hookRegistry, legacyHooks, source, priority) => {
      hookRegistry.register({
        source,
        hookName: "before_agent_start",
        priority,
        handler: async (event, ctx) => {
          await legacyHooks.beforeRun!(event as never, ctx as never);
        },
      });
    },
  },
  {
    legacyHookName: "afterRun",
    hookName: "agent_end",
    register: (hookRegistry, legacyHooks, source, priority) => {
      hookRegistry.register({
        source,
        hookName: "agent_end",
        priority,
        handler: async (event, ctx) => {
          await legacyHooks.afterRun!(event as never, ctx as never);
        },
      });
    },
  },
  {
    legacyHookName: "beforeToolCall",
    hookName: "before_tool_call",
    register: (hookRegistry, legacyHooks, source, priority) => {
      hookRegistry.register({
        source,
        hookName: "before_tool_call",
        priority,
        handler: async (event, ctx) => {
          const result = await legacyHooks.beforeToolCall!(event as never, ctx as never);
          if (result === false) return { block: true, blockReason: "blocked by plugin hook" };
          if (result && typeof result === "object") {
            return { params: result as Record<string, unknown> };
          }
          return undefined;
        },
      });
    },
  },
  {
    legacyHookName: "afterToolCall",
    hookName: "after_tool_call",
    register: (hookRegistry, legacyHooks, source, priority) => {
      hookRegistry.register({
        source,
        hookName: "after_tool_call",
        priority,
        handler: async (event, ctx) => {
          await legacyHooks.afterToolCall!(event as never, ctx as never);
        },
      });
    },
  },
];

function createEmptyHookBridgeSummary(source: string): ExtensionHostHookBridgeSummary {
  return {
    source,
    availableHookCount: 0,
    bridgedHookCount: 0,
    registrations: LEGACY_PLUGIN_HOOK_BRIDGE_REGISTRATIONS.map((registration) => ({
      legacyHookName: registration.legacyHookName,
      hookName: registration.hookName,
      available: false,
      bridged: false,
    })),
  };
}

export async function initializeExtensionHost(
  input: InitializeExtensionHostOptions,
): Promise<ExtensionHostState> {
  const pluginRegistry = input.pluginRegistry ?? new PluginRegistry();
  const skillRegistry = input.skillRegistry ?? new SkillRegistry();
  const pluginsDir = path.join(input.stateDir, "plugins");
  const userSkillsDir = path.join(input.stateDir, "skills");
  const lifecycle: ExtensionHostLifecycleSummary = {
    pluginToolsRegistered: 0,
    skillManagementToolsRegistered: [],
    bundledSkillsLoaded: 0,
    userSkillsLoaded: 0,
    pluginSkillsLoaded: 0,
    installedMarketplaceExtensionsLoaded: 0,
    installedMarketplacePluginsLoaded: 0,
    installedMarketplaceSkillPacksLoaded: 0,
    eligibilityRefreshed: false,
    hookBridge: createEmptyHookBridgeSummary("plugin-bridge"),
  };
  const marketplaceSkillDirs = new Map<string, string[]>();

  if (fs.existsSync(pluginsDir)) {
    try {
      await pluginRegistry.loadPluginDirectory(pluginsDir);
    } catch (error) {
      input.logger.warn("plugins", `插件加载失败: ${String(error)}`, error);
    }
  }

  const installedMarketplaceExtensions = (await listInstalledExtensions(input.stateDir))
    .filter((extension) => extension.enabled && extension.status === "installed");
  for (const extension of installedMarketplaceExtensions) {
    const manifestRelativePath = extension.manifestPath?.trim() || "belldandy-extension.json";
    const manifestPath = path.join(extension.installPath, manifestRelativePath);
    try {
      const rawManifest = await fsp.readFile(manifestPath, "utf-8");
      const manifest = parseExtensionManifest(JSON.parse(rawManifest) as unknown);

      if (manifest.kind === "plugin" && manifest.entry.pluginModule) {
        await pluginRegistry.loadPlugin(path.join(extension.installPath, manifest.entry.pluginModule));
        lifecycle.installedMarketplacePluginsLoaded += 1;
      }

      if (manifest.entry.skillDirs && manifest.entry.skillDirs.length > 0) {
        marketplaceSkillDirs.set(
          extension.id,
          manifest.entry.skillDirs.map((dir) => path.join(extension.installPath, dir)),
        );
      }

      lifecycle.installedMarketplaceExtensionsLoaded += 1;
      if (manifest.kind === "skill-pack") {
        lifecycle.installedMarketplaceSkillPacksLoaded += 1;
      }
    } catch (error) {
      input.logger.warn(
        "marketplace",
        `installed extension load skipped: ${extension.id}: ${String(error)}`,
        error,
      );
    }
  }

  const pluginTools = pluginRegistry.getAllTools();
  if (pluginTools.length > 0) {
    for (const tool of pluginTools) {
      input.toolExecutor.registerTool(tool);
    }
    lifecycle.pluginToolsRegistered = pluginTools.length;
    input.logger.info("plugins", `注册了 ${pluginTools.length} 个插件工具`);
  }

  let extensionRuntime = buildExtensionRuntimeReport({
    pluginRegistry,
    toolsConfigManager: input.toolsConfigManager,
  });
  for (const registration of extensionRuntime.registry.pluginToolRegistrations) {
    input.toolsConfigManager.registerPluginTools(registration.pluginId, registration.toolNames);
  }
  if (extensionRuntime.summary.pluginCount > 0) {
    input.logger.info(
      "plugins",
      `已加载 ${extensionRuntime.summary.pluginCount} 个插件 (${extensionRuntime.summary.disabledPluginCount} disabled): ${extensionRuntime.plugins.map((plugin) => plugin.id).join(", ")}`,
    );
  }

  try {
    const bundledCount = await skillRegistry.loadBundledSkills(input.bundledSkillsDir);
    lifecycle.bundledSkillsLoaded = bundledCount;
    if (bundledCount > 0) input.logger.info("skills", `loaded ${bundledCount} bundled skills`);

    const userCount = await skillRegistry.loadUserSkills(userSkillsDir);
    lifecycle.userSkillsLoaded = userCount;
    if (userCount > 0) input.logger.info("skills", `loaded ${userCount} user skills`);

    const pluginSkillDirs = new Map(pluginRegistry.getPluginSkillDirs());
    for (const [pluginId, dirs] of marketplaceSkillDirs) {
      const existing = pluginSkillDirs.get(pluginId) ?? [];
      for (const dir of dirs) {
        if (!existing.includes(dir)) {
          existing.push(dir);
        }
      }
      pluginSkillDirs.set(pluginId, existing);
    }
    if (pluginSkillDirs.size > 0) {
      const pluginCount = await skillRegistry.loadPluginSkills(pluginSkillDirs);
      lifecycle.pluginSkillsLoaded = pluginCount;
      if (pluginCount > 0) input.logger.info("skills", `loaded ${pluginCount} plugin skills`);
    }

    input.logger.info("skills", `total: ${skillRegistry.size} skills loaded`);
    registerGlobalSkillRegistry(skillRegistry);
  } catch (error) {
    input.logger.warn("skills", `技能加载失败: ${String(error)}`, error);
  }

  extensionRuntime = buildExtensionRuntimeReport({
    pluginRegistry,
    skillRegistry,
    toolsConfigManager: input.toolsConfigManager,
  });
  const skillManagementToolsRegistered = extensionRuntime.registry.skillManagementTools
    .filter((item) => item.shouldRegister)
    .map((item) => item.name);
  if (input.toolsEnabled && skillManagementToolsRegistered.length > 0) {
    input.toolExecutor.registerTool(createSkillsListTool(skillRegistry));
    input.toolExecutor.registerTool(createSkillsSearchTool(skillRegistry));
    input.toolExecutor.registerTool(createSkillGetTool(skillRegistry));
    lifecycle.skillManagementToolsRegistered = [...skillManagementToolsRegistered];
    input.logger.info(
      "skills",
      `registered ${extensionRuntime.registry.skillManagementTools.map((item) => item.name).join(" + ")}`,
    );
  }

  await skillRegistry.refreshEligibility({
    registeredTools: input.toolExecutor.getDefinitions().map((definition) => definition.function.name),
    activeMcpServers: input.activeMcpServers ?? [],
    workspaceRoot: input.workspaceRoot,
  });
  lifecycle.eligibilityRefreshed = true;

  extensionRuntime = buildExtensionRuntimeReport({
    pluginRegistry,
    skillRegistry,
    toolsConfigManager: input.toolsConfigManager,
  });
  const promptSkills = listEnabledPromptSkills({
    skillRegistry,
    toolsConfigManager: input.toolsConfigManager,
  });
  const searchableSkills = listEnabledSearchableSkills({
    skillRegistry,
    toolsConfigManager: input.toolsConfigManager,
  });

  if (promptSkills.length > 0 || searchableSkills.length > 0) {
    input.logger.info("skills", `eligible: ${promptSkills.length} prompt-injected, ${searchableSkills.length} searchable`);
  }

  lifecycle.loadCompletedAt = new Date();

  return {
    pluginRegistry,
    skillRegistry,
    extensionRuntime,
    promptSkills,
    searchableSkills,
    lifecycle,
  };
}

export function bridgeLegacyPluginHooks(input: {
  extensionHost: ExtensionHostState;
  hookRegistry: HookRegistry;
  logger?: ExtensionHostLogger;
  source?: string;
  priority?: number;
}): ExtensionHostHookBridgeSummary {
  const source = input.source ?? "plugin-bridge";
  const priority = input.priority ?? 200;
  const legacyHooks = input.extensionHost.pluginRegistry.getAggregatedHooks();
  const hookAvailability = input.extensionHost.pluginRegistry.getLegacyHookAvailability();
  const summary = createEmptyHookBridgeSummary(source);

  for (const registration of LEGACY_PLUGIN_HOOK_BRIDGE_REGISTRATIONS) {
    const entry = summary.registrations.find((item) => item.legacyHookName === registration.legacyHookName);
    const available = hookAvailability[registration.legacyHookName];
    if (!entry) continue;

    entry.available = available;
    if (!available) continue;

    registration.register(input.hookRegistry, legacyHooks, source, priority);
    entry.bridged = true;
    summary.availableHookCount += 1;
    summary.bridgedHookCount += 1;
  }

  if (summary.bridgedHookCount > 0) {
    summary.lastBridgedAt = new Date();
  }

  input.extensionHost.lifecycle.hookBridge = summary;
  if (input.logger && input.extensionHost.pluginRegistry.getPluginIds().length > 0) {
    input.logger.info(
      "plugins",
      summary.bridgedHookCount > 0
        ? `legacy hooks bridged to HookRegistry (${summary.bridgedHookCount}/${summary.availableHookCount})`
        : "no legacy hooks to bridge",
    );
  }
  return summary;
}
