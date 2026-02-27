import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  OpenAIChatAgent,
  ToolEnabledAgent,
  type BelldandyAgent,
  ensureWorkspace,
  loadWorkspaceFiles,
  ensureAgentWorkspace,
  loadAgentWorkspaceFiles,
  buildSystemPrompt,
  ConversationStore,
  loadModelFallbacks,
  type ModelProfile,
  type VideoUploadConfig,
  FailoverClient,
  type SummarizerFn,
  AgentRegistry,
  SubAgentOrchestrator,
  loadAgentProfiles,
  buildDefaultProfile,
  resolveModelConfig,
  type AgentProfile,
  HookRegistry,
  createHookRunner,
  type HookRunner,
} from "@belldandy/agent";
import {
  ToolExecutor,
  DEFAULT_POLICY,
  type ToolPolicy,
  fetchTool,
  applyPatchTool,
  fileReadTool,
  fileWriteTool,
  fileDeleteTool,
  listFilesTool,
  createMemorySearchTool,

  createMemoryGetTool,
  browserOpenTool,
  browserNavigateTool,
  browserClickTool,
  browserTypeTool,
  browserScreenshotTool,
  browserGetContentTool,
  cameraSnapTool,
  imageGenerateTool,
  textToSpeechTool,
  synthesizeSpeech,
  transcribeSpeech,
  runCommandTool,
  methodListTool,
  methodReadTool,
  methodCreateTool,
  methodSearchTool,
  logReadTool,
  logSearchTool,
  createCronTool,
  createServiceRestartTool,
  switchFacetTool,
  sessionsSpawnTool,
  sessionsHistoryTool,
  delegateTaskTool,
  delegateParallelTool,
  SkillRegistry,
  createSkillsListTool,
  createSkillsSearchTool,
  createCanvasTools,
  getUserUuidTool,
  getMessageSenderInfoTool,
  getRoomMembersTool,
  createLeaveRoomTool,
  createJoinRoomTool,
  timerTool,
  tokenCounterStartTool,
  tokenCounterStopTool,
} from "@belldandy/skills";
import { MemoryManager, registerGlobalMemoryManager, listMemoryFiles, ensureMemoryDir, getGlobalMemoryManager } from "@belldandy/memory";
import { RelayServer } from "@belldandy/browser";
import { FeishuChannel, QqChannel, CommunityChannel, DiscordChannel, loadCommunityConfig, getCommunityConfigPath } from "@belldandy/channels";

import { startGatewayServer } from "../server.js";
import { startHeartbeatRunner, type HeartbeatRunnerHandle } from "../heartbeat/index.js";
import { CronStore, startCronScheduler, type CronSchedulerHandle } from "../cron/index.js";
import {
  initMCPIntegration,
  shutdownMCPIntegration,
  registerMCPToolsToExecutor,
  printMCPStatus,
} from "../mcp/index.js";
import { createLoggerFromEnv } from "../logger/index.js";
import { ToolsConfigManager } from "../tools-config.js";
import { PluginRegistry } from "@belldandy/plugins";

// --- Env Loading ---
loadEnvFileIfExists(path.join(process.cwd(), ".env.local"));
loadEnvFileIfExists(path.join(process.cwd(), ".env"));

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function loadEnvFileIfExists(filePath: string) {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") return;
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const eq = normalized.indexOf("=");
    if (eq <= 0) continue;

    const key = normalized.slice(0, eq).trim();
    if (!key) continue;
    if (process.env[key] && process.env[key]!.trim()) continue;

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

// --- Configuration ---
const port = Number(readEnv("BELLDANDY_PORT") ?? "28889");
const host = readEnv("BELLDANDY_HOST") ?? "127.0.0.1"; // Security: Default to localhost
const authMode = (readEnv("BELLDANDY_AUTH_MODE") ?? "none") as "none" | "token" | "password";
const authToken = readEnv("BELLDANDY_AUTH_TOKEN");
const authPassword = readEnv("BELLDANDY_AUTH_PASSWORD");
const communityApiEnabled = readEnv("BELLDANDY_COMMUNITY_API_ENABLED") === "true";
const webRoot = readEnv("BELLDANDY_WEB_ROOT") ?? path.join(process.cwd(), "apps", "web", "public");

// Channels
const feishuAppId = readEnv("BELLDANDY_FEISHU_APP_ID");
const feishuAppSecret = readEnv("BELLDANDY_FEISHU_APP_SECRET");
const feishuAgentId = readEnv("BELLDANDY_FEISHU_AGENT_ID");

// Channels - QQ
const qqAppId = readEnv("BELLDANDY_QQ_APP_ID");
const qqAppSecret = readEnv("BELLDANDY_QQ_APP_SECRET");
const qqAgentId = readEnv("BELLDANDY_QQ_AGENT_ID");
const qqSandbox = readEnv("BELLDANDY_QQ_SANDBOX") !== "false";

// Channels - Discord
const discordEnabled = readEnv("BELLDANDY_DISCORD_ENABLED") === "true";
const discordBotToken = readEnv("BELLDANDY_DISCORD_BOT_TOKEN");
const discordDefaultChannelId = readEnv("BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID");

// Heartbeat
const heartbeatEnabled = readEnv("BELLDANDY_HEARTBEAT_ENABLED") === "true";
const heartbeatIntervalRaw = readEnv("BELLDANDY_HEARTBEAT_INTERVAL") ?? "30m";
const heartbeatActiveHoursRaw = readEnv("BELLDANDY_HEARTBEAT_ACTIVE_HOURS"); // e.g. "08:00-23:00"

// Cron 定时任务
const cronEnabled = readEnv("BELLDANDY_CRON_ENABLED") === "true";

// State & Memory
const defaultStateDir = path.join(os.homedir(), ".belldandy");
const stateDir = readEnv("BELLDANDY_STATE_DIR") ?? defaultStateDir;
const extraWorkspaceRootsRaw = readEnv("BELLDANDY_EXTRA_WORKSPACE_ROOTS");
const extraWorkspaceRoots = extraWorkspaceRootsRaw
  ? extraWorkspaceRootsRaw
    .split(",")
    .map((p) => path.resolve(p.trim()))
    .filter((p) => p.length > 0)
  : undefined;

// Logger（尽早初始化，后续所有输出走统一日志）
const logger = createLoggerFromEnv(stateDir);

function normalizeStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.map(v => String(v)).map(v => v.trim()).filter(Boolean);
}

function normalizeExecPolicy(input: unknown): ToolPolicy["exec"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    quickTimeoutMs: typeof obj.quickTimeoutMs === "number" ? obj.quickTimeoutMs : undefined,
    longTimeoutMs: typeof obj.longTimeoutMs === "number" ? obj.longTimeoutMs : undefined,
    quickCommands: normalizeStringArray(obj.quickCommands),
    longCommands: normalizeStringArray(obj.longCommands),
    extraSafelist: normalizeStringArray(obj.extraSafelist),
    extraBlocklist: normalizeStringArray(obj.extraBlocklist),
    nonInteractive: obj.nonInteractive && typeof obj.nonInteractive === "object"
      ? {
        enabled: typeof (obj.nonInteractive as any).enabled === "boolean" ? (obj.nonInteractive as any).enabled : undefined,
        additionalFlags: normalizeStringArray((obj.nonInteractive as any).additionalFlags),
        defaultFlags: normalizeStringArray((obj.nonInteractive as any).defaultFlags),
        rules: (obj.nonInteractive as any).rules && typeof (obj.nonInteractive as any).rules === "object"
          ? (obj.nonInteractive as any).rules as Record<string, string[] | string>
          : undefined,
      }
      : undefined,
  };
}

function normalizeFileWritePolicy(input: unknown): ToolPolicy["fileWrite"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    allowedExtensions: normalizeStringArray(obj.allowedExtensions),
    allowDotFiles: typeof obj.allowDotFiles === "boolean" ? obj.allowDotFiles : undefined,
    allowBinary: typeof obj.allowBinary === "boolean" ? obj.allowBinary : undefined,
  };
}

function normalizeToolsPolicy(input: unknown): Partial<ToolPolicy> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    allowedPaths: normalizeStringArray(obj.allowedPaths),
    deniedPaths: normalizeStringArray(obj.deniedPaths),
    allowedDomains: normalizeStringArray(obj.allowedDomains),
    deniedDomains: normalizeStringArray(obj.deniedDomains),
    maxTimeoutMs: typeof obj.maxTimeoutMs === "number" ? obj.maxTimeoutMs : undefined,
    maxResponseBytes: typeof obj.maxResponseBytes === "number" ? obj.maxResponseBytes : undefined,
    exec: normalizeExecPolicy(obj.exec),
    fileWrite: normalizeFileWritePolicy(obj.fileWrite),
  };
}


function mergePolicy(base: ToolPolicy, override?: Partial<ToolPolicy>): ToolPolicy {
  if (!override) return base;
  return {
    ...base,
    ...override,
    exec: {
      ...(base.exec ?? {}),
      ...(override.exec ?? {}),
      nonInteractive: {
        ...(base.exec?.nonInteractive ?? {}),
        ...(override.exec?.nonInteractive ?? {}),
      },
    },
    fileWrite: {
      ...(base.fileWrite ?? {}),
      ...(override.fileWrite ?? {}),
    },
  };
}


function loadToolsPolicy(filePath: string, log: typeof logger): Partial<ToolPolicy> | undefined {
  try {
    const resolved = path.resolve(filePath);
    const raw = fs.readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeToolsPolicy(parsed);
    if (!normalized) {
      log.warn("tools", `BELLDANDY_TOOLS_POLICY_FILE is not a valid object: ${resolved}`);
      return undefined;
    }
    log.info("tools", `Loaded tools policy from ${resolved}`);
    return normalized;
  } catch (err) {
    log.warn("tools", `Failed to load tools policy: ${String(err)}`);
    return undefined;
  }
}

const toolsPolicyFile = readEnv("BELLDANDY_TOOLS_POLICY_FILE");
const toolsPolicyFromFile = toolsPolicyFile ? loadToolsPolicy(toolsPolicyFile, logger) : undefined;
const toolsPolicy = mergePolicy(DEFAULT_POLICY, toolsPolicyFromFile);



// Agent & Tools
const agentProvider = (readEnv("BELLDANDY_AGENT_PROVIDER") ?? "mock") as "mock" | "openai";
const openaiBaseUrl = readEnv("BELLDANDY_OPENAI_BASE_URL");
const openaiApiKey = readEnv("BELLDANDY_OPENAI_API_KEY");
const openaiModel = readEnv("BELLDANDY_OPENAI_MODEL");
const openaiStream = (readEnv("BELLDANDY_OPENAI_STREAM") ?? "true") !== "false";
const openaiSystemPrompt = readEnv("BELLDANDY_OPENAI_SYSTEM_PROMPT");
const agentProtocol = readEnv("BELLDANDY_AGENT_PROTOCOL") as "openai" | "anthropic" | undefined;
const injectAgents = (readEnv("BELLDANDY_INJECT_AGENTS") ?? "true") !== "false";
const injectSoul = (readEnv("BELLDANDY_INJECT_SOUL") ?? "true") !== "false";
const injectMemory = (readEnv("BELLDANDY_INJECT_MEMORY") ?? "true") !== "false";
const maxSystemPromptCharsRaw = readEnv("BELLDANDY_MAX_SYSTEM_PROMPT_CHARS");
const maxSystemPromptChars = maxSystemPromptCharsRaw ? parseInt(maxSystemPromptCharsRaw, 10) || 0 : 0;


const toolsEnabled = (readEnv("BELLDANDY_TOOLS_ENABLED") ?? "false") === "true";
const toolGroups = new Set(
  (readEnv("BELLDANDY_TOOL_GROUPS") ?? "all").split(",").map(s => s.trim().toLowerCase()),
);
const hasToolGroup = (group: string) => toolGroups.has("all") || toolGroups.has(group);
const agentTimeoutMsRaw = readEnv("BELLDANDY_AGENT_TIMEOUT_MS");
const agentTimeoutMs = agentTimeoutMsRaw ? Math.max(5000, parseInt(agentTimeoutMsRaw, 10) || 120_000) : undefined;
const maxInputTokensRaw = readEnv("BELLDANDY_MAX_INPUT_TOKENS");
const maxInputTokens = maxInputTokensRaw ? parseInt(maxInputTokensRaw, 10) || 0 : 0;
const maxOutputTokensRaw = readEnv("BELLDANDY_MAX_OUTPUT_TOKENS");
// 默认 4096，与硬编码默认值保持一致；用户可调大以避免长输出被截断
const maxOutputTokens = maxOutputTokensRaw ? parseInt(maxOutputTokensRaw, 10) || 4096 : 4096;

// Compaction 配置
const compactionEnabled = readEnv("BELLDANDY_COMPACTION_ENABLED") !== "false";
const compactionTriggerFraction = parseFloat(readEnv("BELLDANDY_COMPACTION_TRIGGER_FRACTION") || "0.75") || 0.75;
const compactionArchivalThreshold = parseInt(readEnv("BELLDANDY_COMPACTION_ARCHIVAL_THRESHOLD") || "2000", 10);
const compactionModel = readEnv("BELLDANDY_COMPACTION_MODEL");
const compactionBaseUrl = readEnv("BELLDANDY_COMPACTION_BASE_URL");
const compactionApiKey = readEnv("BELLDANDY_COMPACTION_API_KEY");

// Video File Upload (dedicated endpoint when chat proxy doesn't support /files)
const videoFileApiUrl = readEnv("BELLDANDY_VIDEO_FILE_API_URL");
const videoFileApiKey = readEnv("BELLDANDY_VIDEO_FILE_API_KEY");
const videoUploadConfig: VideoUploadConfig | undefined =
  videoFileApiUrl ? { apiUrl: videoFileApiUrl, apiKey: videoFileApiKey || openaiApiKey || "" } : undefined;

// Model Failover
const modelConfigFile = readEnv("BELLDANDY_MODEL_CONFIG_FILE")
  ?? path.join(stateDir, "models.json");
let modelFallbacks: ModelProfile[] = [];
try {
  modelFallbacks = await loadModelFallbacks(modelConfigFile);
  if (modelFallbacks.length > 0) {
    logger.info("failover", `加载了 ${modelFallbacks.length} 个备用模型 Profile (from ${modelConfigFile})`);
  }
} catch (err) {
  logger.warn("failover", `加载备用模型配置失败: ${String(err)}`);
}

// Agent Profiles (Multi-Agent 预备)
const agentsConfigFile = path.join(stateDir, "agents.json");
const agentProfiles = await loadAgentProfiles(agentsConfigFile);
if (agentProfiles.length > 0) {
  logger.info("agent-profile", `加载了 ${agentProfiles.length} 个 Agent Profile (from ${agentsConfigFile})`);
}

// MCP
const mcpEnabled = (readEnv("BELLDANDY_MCP_ENABLED") ?? "false") === "true";


// --- Activity Tracking ---

let lastActiveTime = 0;
const onActivity = () => {
  lastActiveTime = Date.now();
};
const isBusy = () => {
  // Busy if active in last 2 minutes
  return Date.now() - lastActiveTime < 2 * 60 * 1000;
};

// --- Validation ---
if (!Number.isFinite(port) || port <= 0) {
  throw new Error("Invalid BELLDANDY_PORT");
}

if (authMode === "token" && !authToken) {
  throw new Error("BELLDANDY_AUTH_MODE=token requires BELLDANDY_AUTH_TOKEN");
}

if (authMode === "password" && !authPassword) {
  throw new Error("BELLDANDY_AUTH_MODE=password requires BELLDANDY_AUTH_PASSWORD");
}

// [MODIFIED] Lenient Mode: Removed strict check for OpenAI keys here.
// Validation happens lazily in createAgent.
/*
if (agentProvider === "openai") {
  if (!openaiBaseUrl) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_BASE_URL");
  if (!openaiApiKey) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_API_KEY");
  if (!openaiModel) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_MODEL");
}
*/

// Security Check: Reject unsafe configuration
if ((host === "0.0.0.0" || host === "::") && authMode === "none") {
  logger.error("gateway", "FATAL: Cannot bind to 0.0.0.0 with AUTH_MODE=none");
  logger.error("gateway", "Set BELLDANDY_AUTH_MODE=token and BELLDANDY_AUTH_TOKEN in .env to enable public access");
  process.exit(1);
}

// Security Check: Community API should never run with AUTH_MODE=none
if (communityApiEnabled && authMode === "none") {
  logger.error("gateway", "FATAL: BELLDANDY_COMMUNITY_API_ENABLED=true cannot be used with BELLDANDY_AUTH_MODE=none");
  logger.error("gateway", "Set BELLDANDY_AUTH_MODE=token (recommended) or password before enabling /api/message");
  process.exit(1);
}

// --- Initialization ---

// 1. Ensure state dir exists
if (!fs.existsSync(stateDir)) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch {
    // ignore
  }
}

// 1.5 Ensure methods and facets dir exists
const methodsDir = path.join(stateDir, "methods");
if (!fs.existsSync(methodsDir)) {
  try {
    fs.mkdirSync(methodsDir, { recursive: true });
  } catch {
    // ignore
  }
}

const facetsDir = path.join(stateDir, "facets");
if (!fs.existsSync(facetsDir)) {
  try {
    fs.mkdirSync(facetsDir, { recursive: true });
  } catch {
    // ignore
  }
}

// 1.6 Ensure agents dir exists
const agentsDir = path.join(stateDir, "agents");
if (!fs.existsSync(agentsDir)) {
  try {
    fs.mkdirSync(agentsDir, { recursive: true });
  } catch {
    // ignore
  }
}

// 2. Memory: unified MemoryManager created after sessionsDir init (see section 7.5b)

// 2.5 Init Embedding Provider (configured via env for MemoryManager)
const embeddingEnabled = readEnv("BELLDANDY_EMBEDDING_ENABLED") === "true";
if (embeddingEnabled && !openaiApiKey) {
  logger.warn("memory", "BELLDANDY_EMBEDDING_ENABLED=true but no OpenAI API key, skipping");
}

// [SECURITY] 危险工具需显式启用
const dangerousToolsEnabled = readEnv("BELLDANDY_DANGEROUS_TOOLS_ENABLED") === "true";

// Cron Store（无论是否启用调度器，工具都可以管理任务）
const cronStore = new CronStore(stateDir);
let cronSchedulerHandle: CronSchedulerHandle | undefined;

// 延迟绑定 broadcast：工具注册时 server 尚未创建，执行时才调用
let serverBroadcast: ((msg: unknown) => void) | undefined;

// 2.5 Init ToolsConfigManager (调用设置)
const toolsConfigManager = new ToolsConfigManager(stateDir, {
  info: (m) => logger.info("tools-config", m),
  warn: (m) => logger.warn("tools-config", m),
});
await toolsConfigManager.load();

// 3. Init Executor (conditional)
// Inject browser logger before registering tools
if (toolsEnabled) {
  const { setBrowserLogger } = await import("@belldandy/skills");
  setBrowserLogger(logger.child("browser"));
}

const toolsToRegister = toolsEnabled
  ? [
    // ── core 组：文件、网络、记忆（始终加载） ──
    fetchTool,
    applyPatchTool,
    fileReadTool,
    fileWriteTool,
    fileDeleteTool,
    listFilesTool,
    ...(dangerousToolsEnabled ? [runCommandTool] : []),
    createMemorySearchTool(),
    createMemoryGetTool(),
    getUserUuidTool, // UUID获取工具（始终加载）
    getMessageSenderInfoTool, // 发送者信息工具（始终加载）
    getRoomMembersTool, // 房间成员工具（始终加载）
    createLeaveRoomTool(undefined), // 离开社区房间工具（CommunityChannel 初始化后才可用）
    createJoinRoomTool(undefined), // 加入社区房间工具（CommunityChannel 初始化后才可用）
    timerTool, // 计时器工具（始终加载）
    tokenCounterStartTool, // 任务级 token 计数器（始终加载）
    tokenCounterStopTool,

    // ── browser 组 ──
    ...(hasToolGroup("browser") ? [
      browserOpenTool,
      browserNavigateTool,
      browserClickTool,
      browserTypeTool,
      browserScreenshotTool,
      browserGetContentTool,
    ] : []),

    // ── multimedia 组 ──
    ...(hasToolGroup("multimedia") ? [
      cameraSnapTool,
      imageGenerateTool,
      textToSpeechTool,
    ] : []),

    // ── methodology 组 ──
    ...(hasToolGroup("methodology") ? [
      methodListTool,
      methodReadTool,
      methodCreateTool,
      methodSearchTool,
    ] : []),

    // ── system 组 ──
    ...(hasToolGroup("system") ? [
      logReadTool,
      logSearchTool,
      createCronTool({ store: cronStore, scheduler: { status: () => cronSchedulerHandle?.status() ?? { running: false, activeRuns: 0 } } }),
      createServiceRestartTool((msg) => serverBroadcast?.(msg)),
      switchFacetTool,
    ] : []),

    // ── session 组（子 Agent 编排） ──
    sessionsSpawnTool,
    sessionsHistoryTool,
    delegateTaskTool,
    delegateParallelTool,

    // ── canvas 组（可视化工作区） ──
    ...(hasToolGroup("canvas") ? createCanvasTools((msg) => serverBroadcast?.(msg)) : []),
  ]
  : [];

const toolExecutor = new ToolExecutor({
  tools: toolsToRegister,
  workspaceRoot: stateDir, // Use ~/.belldandy as the workspace root for file operations
  extraWorkspaceRoots, // 额外允许 file_read/file_write/file_delete 的根目录（如其他盘符）
  policy: toolsPolicy,
  isToolDisabled: (name) => toolsConfigManager.isToolDisabled(name),
  broadcast: (event, payload) => {
    serverBroadcast?.({ type: "event", event, payload });
  },
  auditLogger: (log) => {
    const msg = log.success
      ? `${log.toolName} completed in ${log.durationMs}ms`
      : `${log.toolName} failed in ${log.durationMs}ms: ${log.error ?? "unknown"}`;
    logger.info("tools", msg, { toolName: log.toolName, success: log.success, durationMs: log.durationMs });
  },
  logger: {
    info: (m) => logger.info("tools", m),
    warn: (m) => logger.warn("tools", m),
    error: (m) => logger.error("tools", m),
    debug: (m) => logger.debug("tools", m),
  },
});

// 4. Log enabled tools
if (toolsEnabled) {
  const safeTools = "web_fetch, apply_patch, file_read, file_write, file_delete, list_files, memory_search, memory_get, browser_*, log_read, log_search";
  if (dangerousToolsEnabled) {
    logger.warn("tools", "⚠️ DANGEROUS_TOOLS_ENABLED=true: run_command is active");
    logger.info("tools", `Tools enabled: ${safeTools}, run_command`);
  } else {
    logger.info("tools", `Tools enabled: ${safeTools}`);
  }
}

// 4.1 Initialize MCP and register MCP tools
if (mcpEnabled && toolsEnabled) {
  try {
    logger.info("mcp", "正在初始化 MCP 支持...");
    await initMCPIntegration(logger);
    const registeredCount = registerMCPToolsToExecutor(toolExecutor);
    if (registeredCount > 0) {
      logger.info("mcp", `已启用，注册了 ${registeredCount} 个 MCP 工具`);
    }
    printMCPStatus(logger);
  } catch (err) {
    logger.warn("mcp", "初始化失败，MCP 工具将不可用", err);
  }
} else if (mcpEnabled && !toolsEnabled) {
  logger.warn("mcp", "BELLDANDY_MCP_ENABLED=true 但 BELLDANDY_TOOLS_ENABLED=false，MCP 需要启用工具系统");
}

// 4.2 Load Plugins (~/.belldandy/plugins/)
const pluginRegistry = new PluginRegistry();
const pluginsDir = path.join(stateDir, "plugins");
try {
  if (fs.existsSync(pluginsDir)) {
    await pluginRegistry.loadPluginDirectory(pluginsDir);
    const pluginTools = pluginRegistry.getAllTools();
    if (pluginTools.length > 0) {
      for (const tool of pluginTools) {
        toolExecutor.registerTool(tool);
      }
      logger.info("plugins", `注册了 ${pluginTools.length} 个插件工具`);
    }
    // 注册插件工具映射到 toolsConfigManager
    for (const [pluginId, toolNames] of pluginRegistry.getPluginToolMap()) {
      toolsConfigManager.registerPluginTools(pluginId, toolNames);
    }
    const pluginIds = pluginRegistry.getPluginIds();
    if (pluginIds.length > 0) {
      logger.info("plugins", `已加载 ${pluginIds.length} 个插件: ${pluginIds.join(", ")}`);
    }
  }
} catch (err) {
  logger.warn("plugins", `插件加载失败: ${String(err)}`);
}

// 4.3 Init SkillRegistry
const skillRegistry = new SkillRegistry();
const bundledSkillsDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "../../belldandy-skills/src/bundled-skills",
);
const userSkillsDir = path.join(stateDir, "skills");

try {
  const bundledCount = await skillRegistry.loadBundledSkills(bundledSkillsDir);
  if (bundledCount > 0) logger.info("skills", `loaded ${bundledCount} bundled skills`);

  const userCount = await skillRegistry.loadUserSkills(userSkillsDir);
  if (userCount > 0) logger.info("skills", `loaded ${userCount} user skills`);

  const pluginSkillDirs = pluginRegistry.getPluginSkillDirs();
  if (pluginSkillDirs.size > 0) {
    const pluginCount = await skillRegistry.loadPluginSkills(pluginSkillDirs);
    if (pluginCount > 0) logger.info("skills", `loaded ${pluginCount} plugin skills`);
  }

  logger.info("skills", `total: ${skillRegistry.size} skills loaded`);
} catch (err) {
  logger.warn("skills", `技能加载失败: ${String(err)}`);
}

// Register skills_list / skills_search tools
if (toolsEnabled) {
  toolExecutor.registerTool(createSkillsListTool(skillRegistry));
  toolExecutor.registerTool(createSkillsSearchTool(skillRegistry));
  logger.info("skills", "registered skills_list + skills_search tools");
}

// 4.4 Bridge plugin hooks → HookRegistry (deferred to after hookRegistry init, see section 7.5)

// 4.5 Ensure memory directory exists (actual indexing deferred to unified MemoryManager)
await ensureMemoryDir(stateDir);
const memoryFilesResult = await listMemoryFiles(stateDir);
if (memoryFilesResult.files.length > 0) {
  logger.info("memory", `found ${memoryFilesResult.files.length} files (MEMORY.md=${memoryFilesResult.hasMainMemory}, daily=${memoryFilesResult.dailyCount})`);
} else {
  logger.info("memory", "no files found (run 'echo \"# Memory\" > ~/.belldandy/MEMORY.md' to create)");
}

// 5. Init Workspace (SOUL/Persona)
const workspaceResult = await ensureWorkspace({ dir: stateDir, createMissing: true });
if (workspaceResult.created.length > 0) {
  logger.info("workspace", `created ${workspaceResult.created.join(", ")}`);
}

// 6. Load Workspace files for system prompt
const workspace = await loadWorkspaceFiles(stateDir);
logger.info("workspace", `SOUL=${workspace.hasSoul}, IDENTITY=${workspace.hasIdentity}, USER=${workspace.hasUser}, BOOTSTRAP=${workspace.hasBootstrap}`);

// 7. Skill eligibility check + Build dynamic system prompt
// Collect MCP server names for eligibility check
const activeMcpServers: string[] = [];
try {
  const mcpModule = await import("../mcp/index.js");
  const diag = mcpModule.getMCPDiagnostics();
  if (diag) {
    for (const s of diag.servers) {
      if (s.status === "connected") activeMcpServers.push(s.name);
    }
  }
} catch { /* MCP not available */ }

const registeredToolNames = toolExecutor.getDefinitions().map(d => d.function.name);
await skillRegistry.refreshEligibility({
  registeredTools: registeredToolNames,
  activeMcpServers,
  workspaceRoot: stateDir,
});

const promptSkills = skillRegistry.getPromptSkills().filter(s => !toolsConfigManager.isSkillDisabled(s.name));
const searchableSkills = skillRegistry.getSearchableSkills().filter(s => !toolsConfigManager.isSkillDisabled(s.name));
const skillInstructions = promptSkills.map(s => ({ name: s.name, instructions: s.instructions }));
const hasSearchableSkills = searchableSkills.length > 0;

if (promptSkills.length > 0 || searchableSkills.length > 0) {
  logger.info("skills", `eligible: ${promptSkills.length} prompt-injected, ${searchableSkills.length} searchable`);
}

const dynamicSystemPrompt = buildSystemPrompt({
  workspace,
  extraSystemPrompt: openaiSystemPrompt,
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  currentTime: new Date().toISOString(),
  injectAgents,
  injectSoul,
  injectMemory,
  maxChars: maxSystemPromptChars,
  skillInstructions,
  hasSearchableSkills,
});
logger.info("system-prompt", `length=${dynamicSystemPrompt.length} chars${maxSystemPromptChars ? `, limit=${maxSystemPromptChars}` : ""}`);

// 7.5 Hook System: HookRegistry + Context Injection
const hookRegistry = new HookRegistry();

// Context Injection: 对话开始时自动注入最近记忆摘要
const contextInjectionEnabled = readEnv("BELLDANDY_CONTEXT_INJECTION") !== "false"; // 默认启用
const contextInjectionLimit = Math.max(1, parseInt(readEnv("BELLDANDY_CONTEXT_INJECTION_LIMIT") || "5", 10));

if (contextInjectionEnabled) {
  hookRegistry.register({
    source: "context-injection",
    hookName: "before_agent_start",
    priority: 100,
    handler: async (_event, _ctx) => {
      const mm = getGlobalMemoryManager();
      if (!mm) return undefined;

      try {
        const recent = mm.getRecent(contextInjectionLimit);
        if (recent.length === 0) return undefined;

        const lines = recent.map((r) => {
          const src = r.sourcePath.split(/[/\\]/).pop() ?? r.sourcePath;
          return `- [${src}] ${r.snippet}`;
        });
        const block = `<recent-memory>\n${lines.join("\n")}\n</recent-memory>`;
        return { prependContext: block };
      } catch (err) {
        logger.warn("context-injection", `Failed to fetch recent memory: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
    },
  });
  logger.info("context-injection", `enabled (limit=${contextInjectionLimit})`);
}

// 7.6 Bridge legacy plugin hooks → HookRegistry
const legacyHooks = pluginRegistry.getAggregatedHooks();
if (legacyHooks.beforeRun) {
  hookRegistry.register({
    source: "plugin-bridge",
    hookName: "before_agent_start",
    priority: 200,
    handler: async (event, ctx) => {
      await legacyHooks.beforeRun!(event as any, ctx as any);
    },
  });
}
if (legacyHooks.afterRun) {
  hookRegistry.register({
    source: "plugin-bridge",
    hookName: "agent_end",
    priority: 200,
    handler: async (event, ctx) => {
      await legacyHooks.afterRun!(event as any, ctx as any);
    },
  });
}
if (legacyHooks.beforeToolCall) {
  hookRegistry.register({
    source: "plugin-bridge",
    hookName: "before_tool_call",
    priority: 200,
    handler: async (event, ctx) => {
      const result = await legacyHooks.beforeToolCall!(event as any, ctx as any);
      if (result === false) return { block: true, blockReason: "blocked by plugin hook" };
      if (result && typeof result === "object") return { params: result as Record<string, unknown> };
    },
  });
}
if (legacyHooks.afterToolCall) {
  hookRegistry.register({
    source: "plugin-bridge",
    hookName: "after_tool_call",
    priority: 200,
    handler: async (event, ctx) => {
      await legacyHooks.afterToolCall!(event as any, ctx as any);
    },
  });
}
if (pluginRegistry.getPluginIds().length > 0) {
  logger.info("plugins", "legacy hooks bridged to HookRegistry");
}

const hookRunner: HookRunner = createHookRunner(hookRegistry, {
  logger: {
    debug: (m) => logger.debug("hooks", m),
    warn: (m) => logger.warn("hooks", m),
    error: (m) => logger.error("hooks", m),
  },
  catchErrors: true,
});

// 8. Agent Registry (replaces single agentFactory closure)
const primaryModelConfig = {
  baseUrl: openaiBaseUrl ?? "",
  apiKey: openaiApiKey ?? "",
  model: openaiModel ?? "",
};

// 8.1 Pre-load per-agent workspaces (async, before sync factory)
const agentWorkspaceCache = new Map<string, { systemPrompt: string }>();

// Default agent uses the root workspace (already loaded above)
agentWorkspaceCache.set("default", { systemPrompt: dynamicSystemPrompt });

// Non-default agents: ensure workspace dir + load + build system prompt
for (const profile of agentProfiles) {
  if (profile.id === "default") continue;
  const wsDir = profile.workspaceDir ?? profile.id;
  try {
    await ensureAgentWorkspace({ rootDir: stateDir, agentId: wsDir });
    const agentWs = await loadAgentWorkspaceFiles(stateDir, wsDir);
    const agentPrompt = buildSystemPrompt({
      workspace: agentWs,
      extraSystemPrompt: openaiSystemPrompt,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      currentTime: new Date().toISOString(),
      injectAgents,
      injectSoul,
      injectMemory,
      maxChars: maxSystemPromptChars,
      skillInstructions,
      hasSearchableSkills,
    });
    agentWorkspaceCache.set(profile.id, { systemPrompt: agentPrompt });
    logger.info("agent-workspace", `Loaded workspace for agent "${profile.id}" (dir: agents/${wsDir}/), prompt=${agentPrompt.length} chars`);
  } catch (err) {
    // Fallback to default workspace if agent workspace fails
    logger.warn("agent-workspace", `Failed to load workspace for agent "${profile.id}", falling back to default: ${err instanceof Error ? err.message : String(err)}`);
    agentWorkspaceCache.set(profile.id, { systemPrompt: dynamicSystemPrompt });
  }
}

const agentRegistry = agentProvider === "openai"
  ? new AgentRegistry((profile: AgentProfile): BelldandyAgent => {
    // Resolve model config: "primary" → env vars, named → models.json lookup
    const resolved = resolveModelConfig(profile.model, primaryModelConfig, modelFallbacks);
    if (profile.model !== "primary" && resolved.source === "primary") {
      logger.warn("agent-registry", `Model "${profile.model}" not found in models.json, falling back to primary config (agent: ${profile.id})`);
    }

    if (!resolved.apiKey) {
      throw new Error("CONFIG_REQUIRED");
    }

    // Dynamic TTS Check: env explicit "false" wins; otherwise env "true" or signal file
    const ttsEnv = process.env.BELLDANDY_TTS_ENABLED;
    const isTtsEnabled = ttsEnv === "false"
      ? false
      : ttsEnv === "true" || fs.existsSync(path.join(stateDir, "TTS_ENABLED"));

    // Use per-agent system prompt (pre-loaded), fallback to default
    let currentSystemPrompt = agentWorkspaceCache.get(profile.id)?.systemPrompt ?? dynamicSystemPrompt;
    if (isTtsEnabled) {
      currentSystemPrompt += `

## [SYSTEM MODE: VOICE/TTS ENABLED]
The user has enabled text-to-speech. Audio will be generated automatically by the system.
You do NOT need to call any TTS tool — just respond with text as usual.
Do NOT include any <audio> HTML tags or [Download] links in your response.
Keep responses concise and natural for spoken delivery.`;
    }

    // Per-profile system prompt override
    if (profile.systemPromptOverride) {
      currentSystemPrompt += "\n\n" + profile.systemPromptOverride;
    }

    // Determine tools enabled: profile override > env
    const profileToolsEnabled = profile.toolsEnabled ?? toolsEnabled;
    // Determine max input tokens: profile override > env
    const profileMaxInputTokens = profile.maxInputTokens ?? maxInputTokens;
    // Determine max output tokens: profile override > env（默认 4096，调大可避免长输出截断工具调用 JSON）
    const profileMaxOutputTokens = profile.maxOutputTokens ?? maxOutputTokens;

    // Resolve protocol: per-model override > global env
    const resolvedProtocol = (resolved.protocol ?? agentProtocol) as "openai" | "anthropic" | undefined;

    if (profileToolsEnabled) {
      return new ToolEnabledAgent({
        baseUrl: resolved.baseUrl,
        apiKey: resolved.apiKey,
        model: resolved.model,
        systemPrompt: currentSystemPrompt,
        toolExecutor: toolExecutor,
        logger,
        hookRunner,
        ...(agentTimeoutMs !== undefined && { timeoutMs: agentTimeoutMs }),
        fallbacks: modelFallbacks.length > 0 ? modelFallbacks : undefined,
        failoverLogger: logger,
        videoUploadConfig,
        protocol: resolvedProtocol,
        ...(profileMaxInputTokens > 0 && { maxInputTokens: profileMaxInputTokens }),
        ...(profileMaxOutputTokens > 0 && { maxOutputTokens: profileMaxOutputTokens }),
        compaction: compactionOpts,
        summarizer: compactionSummarizer,
        conversationStore: conversationStore, // 扩展 A：传入 conversationStore 支持跨 run 持久化
      });
    }
    return new OpenAIChatAgent({
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey,
      model: resolved.model,
      stream: openaiStream,
      systemPrompt: currentSystemPrompt,
      fallbacks: modelFallbacks.length > 0 ? modelFallbacks : undefined,
      failoverLogger: logger,
      videoUploadConfig,
      protocol: resolvedProtocol,
      ...(profileMaxOutputTokens > 0 && { maxOutputTokens: profileMaxOutputTokens }),
    });
  })
  : undefined;

// Register agent profiles
if (agentRegistry) {
  // Always register the default profile
  const defaultProfile = buildDefaultProfile();
  // Check if agents.json has a custom "default" override
  const customDefault = agentProfiles.find(p => p.id === "default");
  agentRegistry.register(customDefault ?? defaultProfile);

  // Register additional profiles from agents.json
  for (const profile of agentProfiles) {
    if (profile.id !== "default") {
      agentRegistry.register(profile);
    }
  }

  const profileIds = agentRegistry.list().map(p => p.id);
  logger.info("agent-registry", `Registered ${profileIds.length} agent profile(s): [${profileIds.join(", ")}]`);
}

// Backward-compatible agentFactory wrapper (for existing code paths)
const createAgent = agentRegistry
  ? () => agentRegistry.create("default")
  : undefined;

// 7.5 Init Conversation Store (Shared)
const sessionsDir = path.join(stateDir, "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });

// 创建 summarizer 函数（基于 FailoverClient，用便宜模型生成摘要）
let compactionSummarizer: SummarizerFn | undefined;
if (compactionEnabled) {
  // 优先使用专用压缩配置，回退到主模型配置
  const summarizerBaseUrl = compactionBaseUrl || openaiBaseUrl;
  const summarizerApiKey = compactionApiKey || openaiApiKey;
  const summarizerModel = compactionModel || openaiModel;
  if (summarizerBaseUrl && summarizerApiKey && summarizerModel) {
    const summarizerClient = new FailoverClient({
      primary: { id: "compaction", baseUrl: summarizerBaseUrl, apiKey: summarizerApiKey, model: summarizerModel },
      logger,
    });
    compactionSummarizer = async (prompt: string): Promise<string> => {
      const { response } = await summarizerClient.fetchWithFailover({
        timeoutMs: 30_000,
        buildRequest: (profile) => {
          const url = `${profile.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
          return {
            url,
            init: {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${profile.apiKey}`,
              },
              body: JSON.stringify({
                model: profile.model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1024,
                temperature: 0.3,
              }),
            },
          };
        },
      });
      const json = await response.json() as any;
      return json.choices?.[0]?.message?.content ?? "";
    };
    logger.info("compaction", `Summarizer initialized (model: ${summarizerModel}, baseUrl: ${summarizerBaseUrl})`);
  }
}

const compactionOpts = {
  tokenThreshold: parseInt(readEnv("BELLDANDY_COMPACTION_THRESHOLD") || "12000", 10),
  keepRecentCount: parseInt(readEnv("BELLDANDY_COMPACTION_KEEP_RECENT") || "10", 10),
  triggerFraction: compactionTriggerFraction,
  archivalThreshold: compactionArchivalThreshold,
  enabled: compactionEnabled,
};

const conversationStore = new ConversationStore({
  dataDir: sessionsDir,
  maxHistory: parseInt(readEnv("BELLDANDY_MAX_HISTORY") || "50", 10),
  compaction: compactionOpts,
  summarizer: compactionSummarizer,
});

// Wire conversationStore into ToolExecutor (for caching support)
toolExecutor.setConversationStore(conversationStore);

// 7.6 Init Sub-Agent Orchestrator (wire agentCapabilities into ToolExecutor)
if (agentRegistry && toolsEnabled) {
  const subAgentMaxConcurrent = parseInt(readEnv("BELLDANDY_SUB_AGENT_MAX_CONCURRENT") || "3", 10);
  const subAgentTimeoutMs = parseInt(readEnv("BELLDANDY_SUB_AGENT_TIMEOUT_MS") || "120000", 10);
  const subAgentMaxDepth = parseInt(readEnv("BELLDANDY_SUB_AGENT_MAX_DEPTH") || "2", 10);
  const subAgentMaxQueueSize = parseInt(readEnv("BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE") || "10", 10);

  const orchestrator = new SubAgentOrchestrator({
    agentRegistry,
    conversationStore,
    maxConcurrent: subAgentMaxConcurrent,
    maxQueueSize: subAgentMaxQueueSize,
    sessionTimeoutMs: subAgentTimeoutMs,
    maxDepth: subAgentMaxDepth,
    logger: {
      info: (m, d) => logger.info("orchestrator", m, d),
      warn: (m, d) => logger.warn("orchestrator", m, d),
      error: (m, d) => logger.error("orchestrator", m, d),
      debug: (m, d) => logger.debug("orchestrator", m, d),
    },
  });

  toolExecutor.setAgentCapabilities({
    spawnSubAgent: (opts) => orchestrator.spawn({
      parentConversationId: opts.parentConversationId ?? "system",
      agentId: opts.agentId,
      instruction: opts.instruction,
      context: opts.context as Record<string, unknown> | undefined,
    }),
    spawnParallel: (tasks) => orchestrator.spawnParallel(
      tasks.map((t) => ({
        parentConversationId: t.parentConversationId ?? "system",
        agentId: t.agentId,
        instruction: t.instruction,
        context: t.context as Record<string, unknown> | undefined,
      })),
    ),
    listSessions: (parentConversationId?) =>
      Promise.resolve(orchestrator.listSessions(parentConversationId)),
  });

  logger.info("orchestrator", `Sub-agent orchestrator initialized (maxConcurrent=${subAgentMaxConcurrent}, queue=${subAgentMaxQueueSize}, timeout=${subAgentTimeoutMs}ms, maxDepth=${subAgentMaxDepth})`);
}

const ttsEnabledPath = path.join(stateDir, "TTS_ENABLED");
const isTtsEnabledFn = () => {
  const ttsEnv = process.env.BELLDANDY_TTS_ENABLED;
  if (ttsEnv === "false") return false;
  return ttsEnv === "true" || fs.existsSync(ttsEnabledPath);
};

// 7.7 Init unified MemoryManager (indexes both sessions and workspace memory files)
const memoryDir = path.join(stateDir, "memory");
const memoryAdditionalRoots: string[] = [memoryDir];
// Also index MEMORY.md at stateDir root — add stateDir itself but with .md-only scope
// We handle this by adding the stateDir as an additional root; the indexer will only pick up
// files matching the configured extensions (.md, .txt, .jsonl). Subdirs like logs/, models/
// are excluded by ignorePatterns.
const embeddingApiKey = readEnv("BELLDANDY_EMBEDDING_OPENAI_API_KEY") ?? openaiApiKey;
const embeddingBaseUrl = readEnv("BELLDANDY_EMBEDDING_OPENAI_BASE_URL") ?? openaiBaseUrl;
const embeddingModel = readEnv("BELLDANDY_EMBEDDING_MODEL");
const embeddingProvider = (readEnv("BELLDANDY_EMBEDDING_PROVIDER") as "openai" | "local") || "openai";
const localEmbeddingModel = readEnv("BELLDANDY_LOCAL_EMBEDDING_MODEL");
const embeddingBatchSize = Number(readEnv("BELLDANDY_EMBEDDING_BATCH_SIZE")) || 2;

// 若 embedding 需要 API Key 但 key 为空，则自动降级为不启用向量检索。
// MemoryManager 会使用 NullEmbeddingProvider，Gateway 可以正常启动。
// 用户通过 WebChat 设置面板配置 Key 后重启即可恢复向量检索。
const resolvedEmbeddingEnabled = embeddingEnabled && !(embeddingProvider === "openai" && !embeddingApiKey);
if (embeddingEnabled && !resolvedEmbeddingEnabled) {
  logger.warn("memory", "BELLDANDY_EMBEDDING_ENABLED=true but no API key found — embedding disabled. Configure API Key via WebChat settings and restart.");
}


// L0 摘要层配置
const summaryEnabled = readEnv("BELLDANDY_MEMORY_SUMMARY_ENABLED") === "true";
const summaryModel = readEnv("BELLDANDY_MEMORY_SUMMARY_MODEL") || openaiModel;
const summaryBaseUrl = readEnv("BELLDANDY_MEMORY_SUMMARY_BASE_URL") || openaiBaseUrl;
const summaryApiKey = readEnv("BELLDANDY_MEMORY_SUMMARY_API_KEY") || openaiApiKey;

// M-N3: 会话记忆自动提取配置
const evolutionEnabled = readEnv("BELLDANDY_MEMORY_EVOLUTION_ENABLED") === "true";
const evolutionModel = readEnv("BELLDANDY_MEMORY_EVOLUTION_MODEL") || openaiModel;
const evolutionBaseUrl = readEnv("BELLDANDY_MEMORY_EVOLUTION_BASE_URL") || openaiBaseUrl;
const evolutionApiKey = readEnv("BELLDANDY_MEMORY_EVOLUTION_API_KEY") || openaiApiKey;
const evolutionMinMessages = Number(readEnv("BELLDANDY_MEMORY_EVOLUTION_MIN_MESSAGES")) || 4;

// M-N4: 源路径聚合检索配置
const deepRetrievalEnabled = readEnv("BELLDANDY_MEMORY_DEEP_RETRIEVAL") === "true";

// P1-4: Task-aware Embedding 前缀（用于 Jina/BGE 等支持 task 参数的模型）
const embeddingQueryPrefix = readEnv("BELLDANDY_EMBEDDING_QUERY_PREFIX") || undefined;
const embeddingPassagePrefix = readEnv("BELLDANDY_EMBEDDING_PASSAGE_PREFIX") || undefined;

// P1-5 & P0-2: Reranker 配置
const rerankerMinScore = Number(readEnv("BELLDANDY_RERANKER_MIN_SCORE")) || undefined;
const rerankerLengthNormAnchor = Number(readEnv("BELLDANDY_RERANKER_LENGTH_NORM_ANCHOR")) || undefined;

const unifiedMemoryManager = new MemoryManager({
  workspaceRoot: sessionsDir,
  additionalRoots: memoryAdditionalRoots,
  storePath: path.join(stateDir, "memory.sqlite"),
  modelsDir: path.join(stateDir, "models"),
  stateDir,
  openaiApiKey: embeddingApiKey,
  openaiBaseUrl: embeddingBaseUrl,
  openaiModel: embeddingModel,
  provider: embeddingProvider,
  localModel: localEmbeddingModel,
  embeddingBatchSize,
  embeddingQueryPrefix,
  embeddingPassagePrefix,
  summaryEnabled,
  summaryModel,
  summaryBaseUrl,
  summaryApiKey,
  evolutionEnabled,
  evolutionModel,
  evolutionBaseUrl,
  evolutionApiKey,
  evolutionMinMessages,
  deepRetrievalEnabled,
  rerankerOptions: {
    ...(rerankerMinScore != null ? { minScore: rerankerMinScore } : {}),
    ...(rerankerLengthNormAnchor != null ? { lengthNormAnchor: rerankerLengthNormAnchor } : {}),
  },
  indexerOptions: {
    ignorePatterns: ["node_modules", ".git", "logs", "models", "plugins", "skills", "methods"],
    extensions: [".md", ".txt", ".jsonl"],
    watch: true,
  },
});
registerGlobalMemoryManager(unifiedMemoryManager);

// Start async indexing (non-blocking)
unifiedMemoryManager.indexWorkspace().catch(err => {
  logger.error("memory", `Failed to start unified memory indexing: ${err instanceof Error ? err.message : String(err)}`);
});
logger.info("memory", `Unified MemoryManager initialized (sessions + ${memoryAdditionalRoots.length} additional roots, summary=${summaryEnabled}, evolution=${evolutionEnabled})`);

// ========== 后台任务调度：pause/resume + 空闲摘要 ==========

// 活跃 Agent 计数器（支持并发会话）
let activeAgentCount = 0;
let idleSummaryTimer: ReturnType<typeof setInterval> | null = null;
const IDLE_SUMMARY_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

// before_agent_start: 暂停后台 LLM 任务
hookRegistry.register({
  source: "memory-throttle",
  hookName: "before_agent_start",
  priority: 50, // 高优先级，尽早暂停
  handler: async () => {
    activeAgentCount++;
    const mm = getGlobalMemoryManager();
    if (mm && !mm.isPaused) {
      mm.pause();
      logger.debug("memory-throttle", "Paused background LLM tasks (agent active)");
    }
  },
});

// agent_end: 恢复后台 LLM 任务
hookRegistry.register({
  source: "memory-throttle",
  hookName: "agent_end",
  priority: 50, // 高优先级，在 evolution hook 之前恢复
  handler: async () => {
    activeAgentCount = Math.max(0, activeAgentCount - 1);
    if (activeAgentCount === 0) {
      const mm = getGlobalMemoryManager();
      if (mm) {
        // 延迟 3s 恢复，给 evolution 提取留出窗口
        setTimeout(() => {
          if (activeAgentCount === 0) {
            mm.resume();
            logger.debug("memory-throttle", "Resumed background LLM tasks (agent idle)");
          }
        }, 3000);
      }
    }
  },
});

// 空闲定时器：定期触发摘要生成（仅在无活跃 Agent 时）
if (summaryEnabled) {
  idleSummaryTimer = setInterval(() => {
    if (activeAgentCount > 0) return;
    const mm = getGlobalMemoryManager();
    if (!mm) return;
    mm.runIdleSummaries().then(count => {
      if (count > 0) {
        logger.info("memory-summary", `Idle summary run: generated ${count} summaries`);
      }
    }).catch(err => {
      logger.error("memory-summary", `Idle summary failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, IDLE_SUMMARY_INTERVAL_MS);
  // 不阻止进程退出
  if (idleSummaryTimer.unref) idleSummaryTimer.unref();
  logger.info("memory-summary", `Idle summary timer started (interval=${IDLE_SUMMARY_INTERVAL_MS / 1000}s)`);
}

// M-N3: 注册 agent_end hook 用于会话记忆自动提取
if (evolutionEnabled) {
  hookRegistry.register({
    source: "memory-evolution",
    hookName: "agent_end",
    priority: 100, // 低于 plugin-bridge (200)，让插件先执行
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;
      if (!event.success) return; // 失败的会话不提取

      const mm = getGlobalMemoryManager();
      if (!mm) return;

      // 从 event.messages 获取消息（agent_end 事件携带的消息列表）
      const messages = (event.messages as Array<{ role: string; content: string }>)
        ?.filter(m => m && typeof m.role === "string" && typeof m.content === "string") ?? [];

      // 延迟 5s 执行提取，避免与 Agent 主请求的尾部流量冲突
      setTimeout(() => {
        mm.extractMemoriesFromConversation(sessionKey, messages).catch(err => {
          logger.error("memory-evolution", `Memory extraction failed for session ${sessionKey}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, 5000);
    },
  });
  logger.info("memory-evolution", "Registered agent_end hook for memory evolution");
}

// ========== 扩展 C：自动任务边界检测 ==========
// 通过 hook 系统自动识别任务边界：
// - after_tool_call: 检测到 sessions_spawn / delegate_task / delegate_parallel 时自动 start 计数器
// - agent_end: 自动 stop 所有自动启动的计数器并广播结果
const AUTO_BOUNDARY_TOOLS = new Set(["sessions_spawn", "delegate_task", "delegate_parallel"]);
const AUTO_COUNTER_PREFIX = "auto:";

if (toolsEnabled) {
  // after_tool_call: 检测任务派发工具，自动启动 token 计数器
  hookRegistry.register({
    source: "auto-boundary",
    hookName: "after_tool_call",
    priority: 150,
    handler: async (event, ctx) => {
      const toolName = ctx.toolName;
      if (!toolName || !AUTO_BOUNDARY_TOOLS.has(toolName)) return;

      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const counter = toolExecutor.getTokenCounter(sessionKey);
      if (!counter) return;

      const counterName = `${AUTO_COUNTER_PREFIX}${toolName}_${Date.now()}`;

      try {
        counter.start(counterName);
        logger.debug("auto-boundary", `Auto-started counter "${counterName}" after ${toolName} (session: ${sessionKey})`);
      } catch (err) {
        logger.warn("auto-boundary", `Failed to auto-start counter: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  });

  // agent_end: 自动停止所有 auto: 前缀的计数器并广播结果
  hookRegistry.register({
    source: "auto-boundary",
    hookName: "agent_end",
    priority: 90, // agent_end 为并行 void hook，执行顺序不由 priority 决定；token counter 可用性由 tool-agent.ts finally 块排序保证
    handler: async (event, ctx) => {
      const sessionKey = ctx.sessionKey;
      if (!sessionKey) return;

      const counter = toolExecutor.getTokenCounter(sessionKey);
      if (!counter) return;

      const activeCounters = counter.list();
      const autoCounters = activeCounters.filter(name => name.startsWith(AUTO_COUNTER_PREFIX));
      if (autoCounters.length === 0) return;

      for (const name of autoCounters) {
        try {
          const result = counter.stop(name);
          // 广播结果到前端
          serverBroadcast?.({
            type: "event",
            event: "token.counter.result",
            payload: {
              conversationId: sessionKey,
              auto: true,
              ...result,
            },
          });
          logger.info("auto-boundary", `Auto-stopped counter "${name}": input=${result.inputTokens}, output=${result.outputTokens}, total=${result.totalTokens}, duration=${result.durationMs}ms`);
        } catch (err) {
          logger.warn("auto-boundary", `Failed to auto-stop counter "${name}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    },
  });

  logger.info("auto-boundary", "Registered auto task boundary detection hooks (Extension C)");
}

const server = await startGatewayServer({
  port,
  host,
  auth: { mode: authMode, token: authToken, password: authPassword },
  webRoot,
  stateDir,
  agentFactory: createAgent,
  agentRegistry: agentRegistry,
  conversationStore: conversationStore, // Pass shared instance
  onActivity,
  logger,
  toolsConfigManager,
  toolExecutor: toolsEnabled ? toolExecutor : undefined,
  pluginRegistry,
  skillRegistry,
  ttsEnabled: isTtsEnabledFn,
  ttsSynthesize: async (text: string) => {
    const result = await synthesizeSpeech({ text, stateDir });
    if (result) {
      logger.info("tts-auto", `Audio generated: ${result.webPath}`);
    }
    return result;
  },
  sttTranscribe: async (opts) => {
    const result = await transcribeSpeech(opts);
    if (result) {
      logger.info("stt", `Transcribed audio (${result.durationSec?.toFixed(1) ?? "?"}s) via ${result.provider}: "${result.text.slice(0, 50)}${result.text.length > 50 ? "..." : ""}"`);
    }
    return result;
  },
  // 告知前端当前 AI 模型是否已配置好，未配置时前端自动弹出设置引导
  isConfigured: () => agentProvider === "openai" && !!openaiApiKey,
});

// 绑定 broadcast 给 service_restart 工具使用
serverBroadcast = (msg) => server.broadcast(msg as any);

logger.info("gateway", `Belldandy Gateway running: http://${server.host}:${server.port}`);
logger.info("gateway", `WebChat: http://${server.host}:${server.port}/`);
logger.info("gateway", `WS: ws://${server.host}:${server.port}`);

if (server.host === "0.0.0.0" || server.host === "::") {
  // Print LAN IPs for easier access from other machines
  const nets = os.networkInterfaces();
  logger.info("gateway", "Network Interfaces (Public Access):");
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        logger.info("gateway", `  -> http://${net.address}:${server.port}/`);
      }
    }
  }
} else {
  logger.info("gateway", `Access restricted to local machine (${server.host}).`);
  logger.info("gateway", "To allow remote access, set BELLDANDY_HOST=0.0.0.0 in .env");
}
logger.info("gateway", `State Dir: ${stateDir}`);
logger.info("gateway", `Memory DB: ${path.join(stateDir, "memory.sqlite")}`);
logger.info("gateway", `Tools Enabled: ${toolsEnabled}`);

// 8.5 Auto Open Browser (Magic Link)
const setupToken = readEnv("SETUP_TOKEN");
const autoOpenBrowser = readEnv("AUTO_OPEN_BROWSER") === "true";

if (autoOpenBrowser) {
  const openUrlHost = (server.host === "0.0.0.0" || server.host === "::") ? "localhost" : server.host;
  const targetUrl = `http://${openUrlHost}:${server.port}/${setupToken ? `?token=${setupToken}` : ""}`;

  logger.info("launcher", `Opening browser at ${targetUrl}...`);
  // Dynamic import to avoid issues if 'open' is optional or ESM
  try {
    const { default: open } = await import("open");
    await open(targetUrl);
  } catch (err) {
    logger.error("launcher", "Failed to auto-open browser", err);
    logger.info("launcher", `Please open manually: ${targetUrl}`);
  }
}

// 9. Start Feishu Channel (if configured)
let feishuChannel: FeishuChannel | undefined;
if (feishuAppId && feishuAppSecret && createAgent) {
  try {
    // 优先使用 agentRegistry + feishuAgentId，fallback 到 createAgent()
    const agent = (agentRegistry && feishuAgentId)
      ? agentRegistry.create(feishuAgentId)
      : createAgent();
    feishuChannel = new FeishuChannel({
      appId: feishuAppId,
      appSecret: feishuAppSecret,
      agent: agent,
      agentId: feishuAgentId,
      conversationStore: conversationStore, // [PERSISTENCE] Inject store
      initialChatId: (() => {
        try {
          const statePath = path.join(stateDir, "feishu-state.json");
          if (fs.existsSync(statePath)) {
            const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
            if (data.lastChatId) {
              logger.info("feishu", `Loaded persisted chat ID: ${data.lastChatId}`);
              return data.lastChatId;
            }
          }
        } catch (e) {
          logger.error("feishu", "Failed to load state", e);
        }
        return undefined;
      })(),
      onChatIdUpdate: (chatId: string) => {
        try {
          const statePath = path.join(stateDir, "feishu-state.json");
          const data = { lastChatId: chatId, updatedAt: Date.now() };
          fs.writeFileSync(statePath, JSON.stringify(data, null, 2), "utf-8");
          logger.info("feishu", `Persisted chat ID: ${chatId}`);
        } catch (e) {
          logger.error("feishu", "Failed to save state", e);
        }
      },
      sttTranscribe: async (opts) => {
        const result = await transcribeSpeech(opts);
        if (result) logger.info("feishu", `Transcribed audio (${result.durationSec?.toFixed(1) ?? "?"}s) from ${result.provider}`);
        return result;
      },
    });
    // Do not await, start in background
    feishuChannel.start().catch((err: unknown) => {
      logger.error("feishu", "Channel Error", err);
    });
  } catch (e) {
    logger.warn("feishu", "Agent creation failed (likely missing config), skipping Feishu startup.");
  }
} else if ((feishuAppId || feishuAppSecret) && !createAgent) {
  logger.warn("feishu", "Credentials present but no Agent configured (provider not openai?), skipping.");
}

// 9.5 Start QQ Channel (if configured)
let qqChannel: QqChannel | undefined;
if (qqAppId && qqAppSecret && createAgent) {
  try {
    const agent = (agentRegistry && qqAgentId)
      ? agentRegistry.create(qqAgentId)
      : createAgent();
    qqChannel = new QqChannel({
      appId: qqAppId,
      appSecret: qqAppSecret,
      sandbox: qqSandbox,
      agent: agent,
      agentId: qqAgentId,
      conversationStore: conversationStore,
    });
    // Do not await, start in background
    qqChannel.start().catch((err: unknown) => {
      logger.error("qq", "Channel Error", err);
    });
  } catch (e) {
    logger.warn("qq", "Agent creation failed (likely missing config), skipping QQ startup.");
  }
} else if ((qqAppId || qqAppSecret) && !createAgent) {
  logger.warn("qq", "Credentials present but no Agent configured, skipping.");
}

// 9.5.5 Start Discord Channel (if configured)
let discordChannel: DiscordChannel | undefined;
if (discordEnabled && discordBotToken && createAgent) {
  try {
    const agent = createAgent();
    discordChannel = new DiscordChannel({
      agent: agent,
      botToken: discordBotToken,
      defaultChannelId: discordDefaultChannelId,
      stateFilePath: path.join(stateDir, "discord-state.json"),
    });
    // Do not await, start in background
    discordChannel.start().catch((err: unknown) => {
      logger.error("discord", "Channel Error", err);
    });
    logger.info("discord", "Discord channel initialized");
  } catch (e) {
    logger.warn("discord", "Failed to initialize Discord channel", e);
  }
} else if (discordEnabled && !discordBotToken) {
  logger.warn("discord", "Discord enabled but BELLDANDY_DISCORD_BOT_TOKEN not set, skipping.");
} else if (discordEnabled && !createAgent) {
  logger.warn("discord", "Discord enabled but no Agent configured, skipping.");
}

// 9.6 Start Community Channel (if configured)
// 只要 community.json 存在且有 endpoint，就创建 CommunityChannel，
// 即使 agents 为空也初始化，这样 join_room 工具可以在运行时动态加入房间。
let communityChannel: CommunityChannel | undefined;
try {
  const communityConfigPath = getCommunityConfigPath();
  if (fs.existsSync(communityConfigPath) && createAgent) {
    const communityConfig = loadCommunityConfig();
    // community config 的 name 是社区显示名，不是 agent profile ID，直接用默认 agent
    const agent = createAgent();

    communityChannel = new CommunityChannel({
      endpoint: communityConfig.endpoint,
      agents: communityConfig.agents,
      agent: agent,
      conversationStore: conversationStore,
      reconnect: communityConfig.reconnect,
    });

    // 注册 leave_room 和 join_room 工具（带 channel 实例）
    if (toolsEnabled) {
      const leaveRoomToolWithChannel = createLeaveRoomTool(communityChannel);
      toolExecutor.registerTool(leaveRoomToolWithChannel);
      logger.info("community", "Registered leave_room tool with channel instance");

      const joinRoomToolWithChannel = createJoinRoomTool(communityChannel);
      toolExecutor.registerTool(joinRoomToolWithChannel);
      logger.info("community", "Registered join_room tool with channel instance");
    }

    // 后台启动（有 agents 配置了 room 时才会实际连接）
    communityChannel.start().catch((err: unknown) => {
      logger.error("community", "Channel Error", err);
    });

    logger.info("community", `Started with ${communityConfig.agents.length} agent(s)`);
  }
} catch (e) {
  logger.warn("community", "Failed to load community config, skipping startup:", e);
}

// 10. Start Heartbeat Runner (if configured)
function parseIntervalMs(raw: string): number {
  const match = /^(\d+)(m|h|s)?$/.exec(raw.trim().toLowerCase());
  if (!match) return 30 * 60 * 1000; // default 30m
  const value = parseInt(match[1], 10);
  const unit = match[2] || "m";
  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    default: return value * 60 * 1000;
  }
}

function parseActiveHours(raw: string | undefined): { start: string; end: string } | undefined {
  if (!raw) return undefined;
  const match = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(raw.trim());
  if (!match) return undefined;
  return { start: match[1], end: match[2] };
}

let heartbeatRunner: HeartbeatRunnerHandle | undefined;
if (heartbeatEnabled && createAgent) {
  try {
    const heartbeatAgent = createAgent();
    const intervalMs = parseIntervalMs(heartbeatIntervalRaw);
    const activeHours = parseActiveHours(heartbeatActiveHoursRaw);

    // Helper to send message to agent and get response
    const sendMessage = async (prompt: string): Promise<string> => {
      let result = "";
      for await (const item of heartbeatAgent.run({
        conversationId: `heartbeat-${Date.now()}`,
        text: prompt,
      })) {
        if (item.type === "delta") {
          result += item.delta;
        } else if (item.type === "final") {
          result = item.text;
        }
      }
      return result;
    };

    // Helper to deliver message to user via Feishu and WebChat
    const deliverToUser = async (message: string): Promise<void> => {
      // 1. Broadcast to local WebChat (for local testing)
      server.broadcast({
        type: "event",
        event: "chat.final",
        payload: {
          conversationId: "heartbeat-broadcast",
          text: `❤️ [Heartbeat] ${message}`,
        },
      });

      // 2. Deliver to Feishu (if configured)
      if (feishuChannel) {
        logger.info("heartbeat", "Delivering to user via Feishu...");
        const sent = await feishuChannel.sendProactiveMessage(message);
        if (!sent) {
          logger.warn("heartbeat", "Failed to deliver: No active Feishu chat session (user needs to speak first).");
        }
      } else {
        logger.info("heartbeat", "Broadcasted to local Web clients (Feishu disabled).");
      }
    };

    heartbeatRunner = startHeartbeatRunner({
      intervalMs,
      workspaceDir: stateDir,
      sendMessage,
      deliverToUser,
      activeHours,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isBusy,
      log: (msg) => logger.info("heartbeat", msg),
    });

    logger.info("heartbeat", `enabled (interval=${heartbeatIntervalRaw}, activeHours=${heartbeatActiveHoursRaw ?? "all"})`);
  } catch (e) {
    logger.warn("heartbeat", "Agent creation failed (likely missing config), skipping Heartbeat startup.");
  }
} else if (heartbeatEnabled && !createAgent) {
  logger.warn("heartbeat", "enabled but no Agent configured (provider not openai?), skipping.");
}

// 11. Start Cron Scheduler (if configured)
if (cronEnabled && createAgent) {
  try {
    const cronAgent = createAgent();
    const activeHours = parseActiveHours(heartbeatActiveHoursRaw); // 复用 Heartbeat 活跃时段

    // 复用 Heartbeat 的 sendMessage / deliverToUser 模式
    const cronSendMessage = async (prompt: string): Promise<string> => {
      let result = "";
      for await (const item of cronAgent.run({
        conversationId: `cron-${Date.now()}`,
        text: prompt,
      })) {
        if (item.type === "delta") {
          result += item.delta;
        } else if (item.type === "final") {
          result = item.text;
        }
      }
      return result;
    };

    const cronDeliverToUser = async (message: string): Promise<void> => {
      // 1. Broadcast 到 WebChat
      server.broadcast({
        type: "event",
        event: "chat.final",
        payload: {
          conversationId: "cron-broadcast",
          text: message,
        },
      });

      // 2. 推送到飞书（如果配置了）
      if (feishuChannel) {
        logger.info("cron", "Delivering to user via Feishu...");
        const sent = await feishuChannel.sendProactiveMessage(message);
        if (!sent) {
          logger.warn("cron", "Failed to deliver: No active Feishu chat session.");
        }
      } else {
        logger.info("cron", "Broadcasted to local Web clients (Feishu disabled).");
      }
    };

    cronSchedulerHandle = startCronScheduler({
      store: cronStore,
      sendMessage: cronSendMessage,
      deliverToUser: cronDeliverToUser,
      activeHours,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isBusy,
      log: (msg) => logger.info("cron", msg),
    });

    logger.info("cron", `scheduler enabled (activeHours=${heartbeatActiveHoursRaw ?? "all"})`);
  } catch (e) {
    logger.warn("cron", "Agent creation failed, skipping Cron scheduler startup.");
  }
} else if (cronEnabled && !createAgent) {
  logger.warn("cron", "enabled but no Agent configured, skipping.");
} else {
  logger.info("cron", "scheduler disabled (set BELLDANDY_CRON_ENABLED=true to enable)");
}

// 12. Start Browser Relay (if configured)
const browserRelayEnabled = readEnv("BELLDANDY_BROWSER_RELAY_ENABLED") === "true";
const browserRelayPort = Number(readEnv("BELLDANDY_RELAY_PORT") ?? "28892");

if (browserRelayEnabled) {
  const relayLogger = logger.child("browser-relay");
  const relay = new RelayServer(browserRelayPort, relayLogger);
  // Do not await, start in background
  relay.start().then(() => {
    logger.info("browser-relay", `enabled (port=${browserRelayPort})`);
  }).catch((err: unknown) => {
    logger.error("browser-relay", "Relay Error", err);
  });
}

// 12. 监听 .env / .env.local 文件变更，自动触发重启
// 配合 launcher.ts 使用：exit(100) 会被 launcher 捕获并重新启动 gateway
{
  const WATCH_DIR = process.cwd();
  const WATCH_FILES = new Set([".env", ".env.local"]);
  const DEBOUNCE_MS = 1500; // 防抖间隔，避免保存时多次触发
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerRestart = (fileName: string) => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      logger.info("config-watcher", `检测到 ${fileName} 变更，正在重启服务...`);
      // 广播通知所有 WebSocket 客户端
      server.broadcast({
        type: "event",
        event: "agent.status",
        payload: { status: "restarting", reason: `${fileName} changed` },
      });
      // 延迟 300ms 让广播发出后再退出
      setTimeout(() => process.exit(100), 300);
    }, DEBOUNCE_MS);
  };

  // 监听目录而非具体文件：解决 .env.local 在启动时不存在（新建时也能被检测到）
  try {
    fs.watch(WATCH_DIR, (eventType, fileName) => {
      if (fileName && WATCH_FILES.has(fileName) && (eventType === "rename" || eventType === "change")) {
        triggerRestart(fileName);
      }
    });
    logger.info("config-watcher", `监听 .env 变更`);
    logger.info("config-watcher", `监听 .env.local 变更`);
  } catch {
    // 无法监听目录时降级为逐个文件监听
    for (const name of WATCH_FILES) {
      const envFile = path.join(WATCH_DIR, name);
      try {
        if (fs.existsSync(envFile)) {
          fs.watch(envFile, (eventType) => {
            if (eventType === "change") triggerRestart(name);
          });
        }
      } catch {
        // 跳过
      }
    }
  }
}

