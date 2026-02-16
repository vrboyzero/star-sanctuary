import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  OpenAIChatAgent,
  ToolEnabledAgent,
  type BelldandyAgent,
  ensureWorkspace,
  loadWorkspaceFiles,
  buildSystemPrompt,
  ConversationStore,
  loadModelFallbacks,
  type ModelProfile,
  type VideoUploadConfig,
  FailoverClient,
  type SummarizerFn,
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
} from "@belldandy/skills";
import { MemoryStore, MemoryIndexer, listMemoryFiles, ensureMemoryDir } from "@belldandy/memory";
import { RelayServer } from "@belldandy/browser";
import { FeishuChannel } from "@belldandy/channels";

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
const webRoot = readEnv("BELLDANDY_WEB_ROOT") ?? path.join(process.cwd(), "apps", "web", "public");

// Channels
const feishuAppId = readEnv("BELLDANDY_FEISHU_APP_ID");
const feishuAppSecret = readEnv("BELLDANDY_FEISHU_APP_SECRET");

// Heartbeat
const heartbeatEnabled = readEnv("BELLDANDY_HEARTBEAT_ENABLED") === "true";
const heartbeatIntervalRaw = readEnv("BELLDANDY_HEARTBEAT_INTERVAL") ?? "30m";
const heartbeatActiveHoursRaw = readEnv("BELLDANDY_HEARTBEAT_ACTIVE_HOURS"); // e.g. "08:00-23:00"

// Cron 定时任务
const cronEnabled = readEnv("BELLDANDY_CRON_ENABLED") === "true";

// State & Memory
const defaultStateDir = path.join(os.homedir(), ".belldandy");
const stateDir = readEnv("BELLDANDY_STATE_DIR") ?? defaultStateDir;
const memoryDbPath = readEnv("BELLDANDY_MEMORY_DB") ?? path.join(stateDir, "memory.db");
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

// 2. Init Memory (Singleton for server)
const memoryStore = new MemoryStore(memoryDbPath);

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
  ]
  : [];

const toolExecutor = new ToolExecutor({
  tools: toolsToRegister,
  workspaceRoot: stateDir, // Use ~/.belldandy as the workspace root for file operations
  extraWorkspaceRoots, // 额外允许 file_read/file_write/file_delete 的根目录（如其他盘符）
  policy: toolsPolicy,
  isToolDisabled: (name) => toolsConfigManager.isToolDisabled(name),

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

// 4.5 Auto-index memory files (MEMORY.md + memory/*.md)
await ensureMemoryDir(stateDir);
const memoryFilesResult = await listMemoryFiles(stateDir);
if (memoryFilesResult.files.length > 0) {
  logger.info("memory", `found ${memoryFilesResult.files.length} files (MEMORY.md=${memoryFilesResult.hasMainMemory}, daily=${memoryFilesResult.dailyCount})`);
  // Index memory files
  const indexer = new MemoryIndexer(memoryStore);
  for (const file of memoryFilesResult.files) {
    await indexer.indexFile(file.absPath);
  }
  logger.info("memory", "files indexed");
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

// 7. Build dynamic system prompt
const dynamicSystemPrompt = buildSystemPrompt({
  workspace,
  extraSystemPrompt: openaiSystemPrompt,
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  currentTime: new Date().toISOString(),
  injectAgents,
  injectSoul,
  injectMemory,
  maxChars: maxSystemPromptChars,
});
logger.info("system-prompt", `length=${dynamicSystemPrompt.length} chars${maxSystemPromptChars ? `, limit=${maxSystemPromptChars}` : ""}`);

// 8. Agent Factory (only for openai provider)
const createAgent = agentProvider === "openai"
  ? (): BelldandyAgent => {
    // [MODIFIED] Lazy Check
    if (!openaiApiKey) {
      throw new Error("CONFIG_REQUIRED");
    }

    // Dynamic TTS Check: env explicit "false" wins; otherwise env "true" or signal file
    const ttsEnv = process.env.BELLDANDY_TTS_ENABLED;
    const isTtsEnabled = ttsEnv === "false"
      ? false
      : ttsEnv === "true" || fs.existsSync(path.join(stateDir, "TTS_ENABLED"));

    let currentSystemPrompt = dynamicSystemPrompt;
    if (isTtsEnabled) {
      currentSystemPrompt += `

## [SYSTEM MODE: VOICE/TTS ENABLED]
The user has enabled text-to-speech. Audio will be generated automatically by the system.
You do NOT need to call any TTS tool — just respond with text as usual.
Do NOT include any <audio> HTML tags or [Download] links in your response.
Keep responses concise and natural for spoken delivery.`;
    }

    if (toolsEnabled) {
      return new ToolEnabledAgent({
        baseUrl: openaiBaseUrl!,
        apiKey: openaiApiKey!,
        model: openaiModel!,
        systemPrompt: currentSystemPrompt,
        toolExecutor: toolExecutor,
        logger,
        ...(agentTimeoutMs !== undefined && { timeoutMs: agentTimeoutMs }),
        fallbacks: modelFallbacks.length > 0 ? modelFallbacks : undefined,
        failoverLogger: logger,
        videoUploadConfig,
        protocol: agentProtocol,
        ...(maxInputTokens > 0 && { maxInputTokens }),
        compaction: compactionOpts,
        summarizer: compactionSummarizer,
      });
    }
    return new OpenAIChatAgent({
      baseUrl: openaiBaseUrl!,
      apiKey: openaiApiKey!,
      model: openaiModel!,
      stream: openaiStream,
      systemPrompt: currentSystemPrompt,
      fallbacks: modelFallbacks.length > 0 ? modelFallbacks : undefined,
      failoverLogger: logger,
      videoUploadConfig,
      protocol: agentProtocol,
    });
  }
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

const ttsEnabledPath = path.join(stateDir, "TTS_ENABLED");
const isTtsEnabledFn = () => {
  const ttsEnv = process.env.BELLDANDY_TTS_ENABLED;
  if (ttsEnv === "false") return false;
  return ttsEnv === "true" || fs.existsSync(ttsEnabledPath);
};

const server = await startGatewayServer({
  port,
  host,
  auth: { mode: authMode, token: authToken, password: authPassword },
  webRoot,
  stateDir,
  agentFactory: createAgent,
  conversationStore: conversationStore, // Pass shared instance
  onActivity,
  logger,
  toolsConfigManager,
  toolExecutor: toolsEnabled ? toolExecutor : undefined,
  pluginRegistry,
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
logger.info("gateway", `Memory DB: ${memoryDbPath}`);
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
    const agent = createAgent();
    feishuChannel = new FeishuChannel({
      appId: feishuAppId,
      appSecret: feishuAppSecret,
      agent: agent,
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
  const relay = new RelayServer(browserRelayPort);
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
  const ENV_FILES = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.local"),
  ];
  const DEBOUNCE_MS = 1500; // 防抖间隔，避免保存时多次触发
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerRestart = (filePath: string) => {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      const fileName = path.basename(filePath);
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

  for (const envFile of ENV_FILES) {
    try {
      if (fs.existsSync(envFile)) {
        fs.watch(envFile, (eventType) => {
          if (eventType === "change") {
            triggerRestart(envFile);
          }
        });
        logger.info("config-watcher", `监听 ${path.basename(envFile)} 变更`);
      }
    } catch {
      // 文件不存在或无权监听 → 跳过（不阻塞启动）
    }
  }
}
