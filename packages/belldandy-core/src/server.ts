import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveEnvFilePaths } from "@star-sanctuary/distribution";

import { getGlobalMemoryManager } from "@belldandy/memory";
import { DEFAULT_STATE_DIR_DISPLAY, type TokenUsageUploadConfig, uploadTokenUsage } from "@belldandy/protocol";
import { MockAgent, type BelldandyAgent, ConversationStore, type AgentRegistry, extractIdentityInfo, type ModelProfile } from "@belldandy/agent";
import type {
  GatewayFrame,
  GatewayReqFrame,
  GatewayResFrame,
  GatewayEventFrame,
  MessageSendParams,
  ConnectRequestFrame,
  BelldandyRole,
  GatewayAuth,
} from "@belldandy/protocol";
import { ensurePairingCode, isClientAllowed, resolveStateDir } from "./security/store.js";
import type { BelldandyLogger } from "./logger/index.js";
import type { ToolsConfigManager } from "./tools-config.js";
import type { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import type { ToolExecutor, TranscribeOptions, TranscribeResult, SkillRegistry } from "@belldandy/skills";
import {
  checkAndConsumeRestartCooldown,
  formatRestartCooldownMessage,
  publishSkillCandidate,
  TOOL_SETTINGS_CONTROL_NAME,
} from "@belldandy/skills";
import type { PluginRegistry } from "@belldandy/plugins";
import type { WebhookConfig, WebhookRequestParams, IdempotencyManager } from "./webhook/index.js";
import { findWebhookRule, generateConversationId, generatePromptFromPayload, verifyWebhookToken } from "./webhook/index.js";
import { BELLDANDY_VERSION } from "./version.generated.js";
import type { GoalManager } from "./goals/manager.js";

export type GatewayServerOptions = {
  port: number;
  host?: string; // [NEW] Allow binding to specific host
  auth: {
    mode: "none" | "token" | "password";
    token?: string;
    password?: string;
  };
  webRoot: string;
  envDir?: string;
  stateDir?: string;
  additionalWorkspaceRoots?: string[];
  agentFactory?: () => BelldandyAgent;
  /** Multi-Agent registry (takes precedence over agentFactory when agentId is specified) */
  agentRegistry?: AgentRegistry;
  /** 主模型配置（用于 models.list 返回默认模型） */
  primaryModelConfig?: { baseUrl: string; apiKey: string; model: string };
  /** 备用模型配置（来自 models.json） */
  modelFallbacks?: ModelProfile[];
  conversationStoreOptions?: { maxHistory?: number; ttlSeconds?: number };
  conversationStore?: ConversationStore; // [NEW] Allow passing shared instance
  onActivity?: () => void;
  /** 可选：统一 Logger，未提供时使用 console */
  logger?: BelldandyLogger;
  /** Server-side auto TTS: check if TTS mode is enabled */
  ttsEnabled?: () => boolean;
  /** Server-side auto TTS: synthesize speech from text */
  ttsSynthesize?: (text: string) => Promise<{ webPath: string; htmlAudio: string } | null>;
  /** 调用设置管理器 */
  toolsConfigManager?: ToolsConfigManager;
  /** 工具执行器（用于获取已注册工具列表） */
  toolExecutor?: ToolExecutor;
  /** 工具调用设置确认存储 */
  toolControlConfirmationStore?: ToolControlConfirmationStore;
  /** 获取 Agent 工具控制模式 */
  getAgentToolControlMode?: () => "disabled" | "confirm" | "auto";
  /** 获取 Agent 工具控制确认密码 */
  getAgentToolControlConfirmPassword?: () => string | undefined;
  /** STT implementation: transcribe speech from audio buffer */
  sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
  /** 插件注册表（用于获取已加载插件列表） */
  pluginRegistry?: PluginRegistry;
  /** 可选：检查当前是否已配置好 AI 模型（用于 hello-ok 中告知前端是否需要引导配置）*/
  isConfigured?: () => boolean;
  /** 技能注册表（用于获取已加载技能列表） */
  skillRegistry?: SkillRegistry;
  /** 长期任务管理器 */
  goalManager?: GoalManager;
  /** Webhook 配置 */
  webhookConfig?: WebhookConfig;
  /** Webhook 幂等性管理器 */
  webhookIdempotency?: IdempotencyManager;
};

export type GatewayServer = {
  port: number;
  host: string;
  close: () => Promise<void>;
  broadcast: (frame: GatewayEventFrame) => void;
};

type GatewayLog = {
  debug: (module: string, message: string, data?: unknown) => void;
  info: (module: string, message: string, data?: unknown) => void;
  warn: (module: string, message: string, data?: unknown) => void;
  error: (module: string, message: string, data?: unknown) => void;
};

const DEFAULT_METHODS = [
  "message.send",
  "tool_settings.confirm",
  "models.list",
  "config.read",
  "config.update",
  "system.doctor",
  "system.restart",
  "workspace.list",
  "workspace.read",
  "workspace.readSource",
  "workspace.write",
  "context.compact",
  "conversation.meta",
  "tools.list",
  "tools.update",
  "agents.list",
  "memory.search",
  "memory.get",
  "memory.recent",
  "memory.stats",
  "memory.task.list",
  "memory.task.get",
  "experience.candidate.get",
  "experience.candidate.list",
  "experience.candidate.accept",
  "experience.candidate.reject",
  "experience.usage.get",
  "experience.usage.list",
  "experience.usage.stats",
  "experience.usage.revoke",
  "goal.create",
  "goal.list",
  "goal.get",
  "goal.resume",
  "goal.pause",
  "goal.handoff.generate",
  "goal.retrospect.generate",
  "goal.experience.suggest",
  "goal.method_candidates.generate",
  "goal.skill_candidates.generate",
  "goal.flow_patterns.generate",
  "goal.flow_patterns.cross_goal",
  "goal.review_governance.summary",
  "goal.suggestion_review.list",
  "goal.suggestion_review.workflow.set",
  "goal.suggestion_review.decide",
  "goal.suggestion_review.escalate",
  "goal.suggestion.publish",
  "goal.checkpoint.list",
  "goal.checkpoint.request",
  "goal.checkpoint.approve",
  "goal.checkpoint.reject",
  "goal.checkpoint.expire",
  "goal.checkpoint.reopen",
  "goal.task_graph.read",
  "goal.task_graph.create",
  "goal.task_graph.update",
  "goal.task_graph.claim",
  "goal.task_graph.pending_review",
  "goal.task_graph.validating",
  "goal.task_graph.complete",
  "goal.task_graph.block",
  "goal.task_graph.fail",
  "goal.task_graph.skip",
];
const DEFAULT_EVENTS = [
  "chat.delta",
  "chat.final",
  "agent.status",
  "token.usage",
  "token.counter.result",
  "goal.update",
  "pairing.required",
  "tools.config.updated",
  "tool_settings.confirm.required",
  "tool_settings.confirm.resolved",
];
const DEFAULT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

type AttachmentLimits = {
  maxFileBytes: number;
  maxTotalBytes: number;
};

function isUnderRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const rel = path.relative(resolvedRoot, path.resolve(target));
  return !(rel.startsWith("..") || path.isAbsolute(rel));
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function parsePositiveIntEnv(varName: string, fallback: number): number {
  const raw = process.env[varName];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readEnvTrimmed(varName: string): string | undefined {
  const raw = process.env[varName];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function getAttachmentLimits(): AttachmentLimits {
  return {
    maxFileBytes: parsePositiveIntEnv("BELLDANDY_ATTACHMENT_MAX_FILE_BYTES", DEFAULT_ATTACHMENT_MAX_FILE_BYTES),
    maxTotalBytes: parsePositiveIntEnv("BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES", DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES),
  };
}

function estimateBase64DecodedBytes(base64: string): number | null {
  const normalized = base64.trim().replace(/\s+/g, "");
  if (!normalized) return 0;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  if (normalized.length % 4 !== 0) return null;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, (normalized.length / 4) * 3 - padding);
}

type ToolControlChangesLike = {
  enableBuiltin: string[];
  disableBuiltin: string[];
  enableMcpServers: string[];
  disableMcpServers: string[];
  enablePlugins: string[];
  disablePlugins: string[];
};

function sortStringList(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function applyToolControlChangesLocally(
  disabled: {
    builtin: string[];
    mcp_servers: string[];
    plugins: string[];
  },
  changes: ToolControlChangesLike,
): {
  builtin: string[];
  mcp_servers: string[];
  plugins: string[];
} {
  const builtin = new Set(disabled.builtin);
  const mcpServers = new Set(disabled.mcp_servers);
  const plugins = new Set(disabled.plugins);

  for (const name of changes.enableBuiltin) builtin.delete(name);
  for (const name of changes.disableBuiltin) builtin.add(name);
  builtin.delete(TOOL_SETTINGS_CONTROL_NAME);

  for (const name of changes.enableMcpServers) mcpServers.delete(name);
  for (const name of changes.disableMcpServers) mcpServers.add(name);

  for (const name of changes.enablePlugins) plugins.delete(name);
  for (const name of changes.disablePlugins) plugins.add(name);

  return {
    builtin: sortStringList(builtin),
    mcp_servers: sortStringList(mcpServers),
    plugins: sortStringList(plugins),
  };
}

function summarizeToolControlChangesLocally(changes: ToolControlChangesLike): string[] {
  const lines: string[] = [];
  if (changes.enableBuiltin.length > 0) lines.push(`启用 builtin: ${changes.enableBuiltin.join(", ")}`);
  if (changes.disableBuiltin.length > 0) lines.push(`关闭 builtin: ${changes.disableBuiltin.join(", ")}`);
  if (changes.enableMcpServers.length > 0) lines.push(`启用 MCP: ${changes.enableMcpServers.join(", ")}`);
  if (changes.disableMcpServers.length > 0) lines.push(`关闭 MCP: ${changes.disableMcpServers.join(", ")}`);
  if (changes.enablePlugins.length > 0) lines.push(`启用插件: ${changes.enablePlugins.join(", ")}`);
  if (changes.disablePlugins.length > 0) lines.push(`关闭插件: ${changes.disablePlugins.join(", ")}`);
  return lines;
}

function buildToolControlDisabledPayloadLocally(disabled: {
  builtin: string[];
  mcp_servers: string[];
  plugins: string[];
  skills: string[];
}) {
  return {
    builtin: sortStringList(disabled.builtin.filter((name) => name !== TOOL_SETTINGS_CONTROL_NAME)),
    mcp_servers: sortStringList(disabled.mcp_servers),
    plugins: sortStringList(disabled.plugins),
    skills: sortStringList(disabled.skills),
  };
}

export async function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer> {
  ensureWebRoot(opts.webRoot);

  const log: GatewayLog = opts.logger
    ? {
      debug: (m: string, msg: string, d?: unknown) => opts.logger!.debug(m, msg, d),
      info: (m: string, msg: string, d?: unknown) => opts.logger!.info(m, msg, d),
      warn: (m: string, msg: string, d?: unknown) => opts.logger!.warn(m, msg, d),
      error: (m: string, msg: string, d?: unknown) => opts.logger!.error(m, msg, d),
    }
    : {
      debug: () => { },
      info: (m: string, msg: string) => console.log(`[${m}] ${msg}`),
      warn: (m: string, msg: string, d?: unknown) => console.warn(`[${m}] ${msg}`, d ?? ""),
      error: (m: string, msg: string, d?: unknown) => console.error(`[${m}] ${msg}`, d ?? ""),
    };

  const app = express();
  if (opts.stateDir) {
    const generatedDir = path.join(opts.stateDir, "generated");
    try {
      fs.mkdirSync(generatedDir, { recursive: true });
    } catch {
      // ignore
    }
    app.use("/generated", express.static(generatedDir));
    log.info("gateway", `Static: serving /generated -> ${generatedDir}`);
  }

  app.use(express.static(opts.webRoot));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(opts.webRoot, "index.html"));
  });

  // Health check endpoint for Docker/K8s
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: BELLDANDY_VERSION,
    });
  });

  // Community message endpoint (for office.goddess.ai integration)
  const communityApiEnabled = String(process.env.BELLDANDY_COMMUNITY_API_ENABLED ?? "false").toLowerCase() === "true";
  const communityApiToken =
    process.env.BELLDANDY_COMMUNITY_API_TOKEN
    ?? process.env.BELLDANDY_AUTH_TOKEN
    ?? (opts.auth.mode === "token" ? opts.auth.token : undefined);
  const tokenUsageUploadConfig: TokenUsageUploadConfig = {
    enabled: String(process.env.BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED ?? "false").toLowerCase() === "true",
    url: readEnvTrimmed("BELLDANDY_TOKEN_USAGE_UPLOAD_URL"),
    token:
      readEnvTrimmed("BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY")
      ?? readEnvTrimmed("BELLDANDY_TOKEN_USAGE_UPLOAD_TOKEN"), // backward compatible
    timeoutMs: parsePositiveIntEnv("BELLDANDY_TOKEN_USAGE_UPLOAD_TIMEOUT_MS", 3000),
  };

  app.use(express.json());
  if (!communityApiEnabled) {
    app.post("/api/message", (_req, res) => {
      res.status(404).json({
        ok: false,
        error: {
          code: "API_DISABLED",
          message: "Community API is disabled. Set BELLDANDY_COMMUNITY_API_ENABLED=true to enable.",
        },
      });
    });
  } else {
    app.post("/api/message", async (req, res) => {
      try {
        if (!communityApiToken) {
          log.error("api", "Community API enabled but no token configured");
          return res.status(503).json({
            ok: false,
            error: { code: "API_MISCONFIGURED", message: "Community API token is not configured." },
          });
        }

        const authorization = req.headers.authorization;
        if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
          res.setHeader("WWW-Authenticate", 'Bearer realm="belldandy-community"');
          return res.status(401).json({
            ok: false,
            error: { code: "UNAUTHORIZED", message: "Missing or invalid bearer token." },
          });
        }

        const token = authorization.slice("Bearer ".length).trim();
        if (!token || token !== communityApiToken) {
          res.setHeader("WWW-Authenticate", 'Bearer realm="belldandy-community"');
          return res.status(401).json({
            ok: false,
            error: { code: "UNAUTHORIZED", message: "Missing or invalid bearer token." },
          });
        }

        const { text, conversationId, from, senderInfo, roomContext, agentId } = req.body;

        // Validate required fields
        if (!text || typeof text !== "string") {
          return res.status(400).json({
            ok: false,
            error: { code: "INVALID_REQUEST", message: "Missing or invalid 'text' field" },
          });
        }

        if (!conversationId || typeof conversationId !== "string") {
          return res.status(400).json({
            ok: false,
            error: { code: "INVALID_REQUEST", message: "Missing or invalid 'conversationId' field" },
          });
        }

        // Get agent instance
        const agent = agentId && opts.agentRegistry
          ? opts.agentRegistry.create(agentId)
          : opts.agentFactory?.();

        if (!agent) {
          return res.status(503).json({
            ok: false,
            error: { code: "AGENT_UNAVAILABLE", message: "No agent configured" },
          });
        }

        // Process message through agent
        log.info("api", `Processing community message: conversationId=${conversationId}, from=${from || "unknown"}`);

        const stream = agent.run({
          conversationId,
          text,
          userInput: text,
          agentId,
          roomContext,
          senderInfo,
        });

        const runStartedAt = Date.now();
        let finalText = "";
        let latestUsage:
          | {
            inputTokens: number;
            outputTokens: number;
          }
          | undefined;
        for await (const item of stream) {
          if (item.type === "final") {
            finalText = item.text;
          }
          if (item.type === "usage") {
            latestUsage = {
              inputTokens: Number(item.inputTokens ?? 0),
              outputTokens: Number(item.outputTokens ?? 0),
            };
          }
        }
        if (latestUsage) {
          emitAutoRunTaskTokenResult(conversationStore, {
            conversationId,
            inputTokens: latestUsage.inputTokens,
            outputTokens: latestUsage.outputTokens,
            durationMs: Date.now() - runStartedAt,
          });
        }

        // Return success response
        res.json({
          ok: true,
          payload: {
            conversationId,
            response: finalText,
          },
        });

        log.info("api", `Community message processed successfully: ${finalText.substring(0, 50)}...`);
      } catch (error) {
        log.error("api", "Failed to process community message", error);
        res.status(500).json({
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    });
  }

  // Webhook endpoint (for external system integration)
  const webhookEnabled = opts.webhookConfig && opts.webhookConfig.webhooks.length > 0;
  if (!webhookEnabled) {
    app.post("/api/webhook/:id", (_req, res) => {
      res.status(404).json({
        ok: false,
        error: {
          code: "WEBHOOK_DISABLED",
          message: `Webhook API is disabled. Configure webhooks in ${DEFAULT_STATE_DIR_DISPLAY}/webhooks.json to enable.`,
        },
      });
    });
  } else {
    app.post("/api/webhook/:id", async (req, res) => {
      try {
        const webhookId = req.params.id;
        if (!webhookId || typeof webhookId !== "string") {
          return res.status(400).json({
            ok: false,
            error: { code: "INVALID_REQUEST", message: "Missing webhook ID" },
          });
        }

        // Find webhook rule
        const rule = findWebhookRule(opts.webhookConfig!, webhookId);
        if (!rule) {
          return res.status(404).json({
            ok: false,
            error: { code: "WEBHOOK_NOT_FOUND", message: `Webhook "${webhookId}" not found` },
          });
        }

        // Check if webhook is enabled
        if (!rule.enabled) {
          return res.status(403).json({
            ok: false,
            error: { code: "WEBHOOK_DISABLED", message: `Webhook "${webhookId}" is disabled` },
          });
        }

        // Verify Bearer token
        const authHeader = req.headers.authorization;
        if (!verifyWebhookToken(rule, authHeader)) {
          res.setHeader("WWW-Authenticate", 'Bearer realm="belldandy-webhook"');
          return res.status(401).json({
            ok: false,
            error: { code: "UNAUTHORIZED", message: "Missing or invalid bearer token" },
          });
        }

        // Check idempotency
        const idempotencyKey = req.headers["x-idempotency-key"];
        if (idempotencyKey && typeof idempotencyKey === "string" && opts.webhookIdempotency) {
          const cached = opts.webhookIdempotency.getCachedResponse(webhookId, idempotencyKey);
          if (cached) {
            log.info("webhook", `Duplicate request detected: ${webhookId} / ${idempotencyKey}`);
            return res.json({ ...cached, duplicate: true });
          }
        }

        // Parse request body
        const params = req.body as WebhookRequestParams;
        const requestedAgentId = params.agentId ?? rule.defaultAgentId;
        const conversationId = params.conversationId ?? generateConversationId(rule);

        // Generate prompt text
        let promptText = params.text ?? "";
        if (!promptText && params.payload) {
          promptText = generatePromptFromPayload(rule, params.payload);
        }

        if (!promptText.trim()) {
          return res.status(400).json({
            ok: false,
            error: { code: "INVALID_REQUEST", message: "Missing text or payload" },
          });
        }

        // Get agent instance
        const agent = requestedAgentId && opts.agentRegistry
          ? opts.agentRegistry.create(requestedAgentId)
          : opts.agentFactory?.();

        if (!agent) {
          return res.status(503).json({
            ok: false,
            error: { code: "AGENT_UNAVAILABLE", message: "No agent configured" },
          });
        }

        // Process message through agent
        log.info("webhook", `Processing webhook: id=${webhookId}, conversationId=${conversationId}, agentId=${requestedAgentId ?? "default"}`);

        const stream = agent.run({
          conversationId,
          text: promptText,
          userInput: promptText,
          agentId: requestedAgentId,
        });

        const runStartedAt = Date.now();
        let finalText = "";
        let latestUsage:
          | {
            inputTokens: number;
            outputTokens: number;
          }
          | undefined;
        for await (const item of stream) {
          if (item.type === "final") {
            finalText = item.text;
          }
          if (item.type === "usage") {
            latestUsage = {
              inputTokens: Number(item.inputTokens ?? 0),
              outputTokens: Number(item.outputTokens ?? 0),
            };
          }
        }
        if (latestUsage) {
          emitAutoRunTaskTokenResult(conversationStore, {
            conversationId,
            inputTokens: latestUsage.inputTokens,
            outputTokens: latestUsage.outputTokens,
            durationMs: Date.now() - runStartedAt,
          });
        }

        // Build response
        const response = {
          ok: true,
          payload: {
            webhookId,
            conversationId,
            response: finalText,
          },
        };

        // Cache response for idempotency
        if (idempotencyKey && typeof idempotencyKey === "string" && opts.webhookIdempotency) {
          opts.webhookIdempotency.cacheResponse(webhookId, idempotencyKey, response);
        }

        // Return success response
        res.json(response);

        log.info("webhook", `Webhook processed successfully: ${finalText.substring(0, 50)}...`);
      } catch (error) {
        log.error("webhook", "Failed to process webhook", error);
        res.status(500).json({
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    });
  }

  const server = http.createServer(app);

  // [SECURITY] Origin Header 白名单校验（防 CSWSH）
  const allowedOriginsRaw = process.env.BELLDANDY_ALLOWED_ORIGINS;
  const hostVal = opts.host ?? "127.0.0.1";
  const isLocalBinding = hostVal === "127.0.0.1" || hostVal === "localhost";
  const allowedOriginsSource = allowedOriginsRaw
    ? allowedOriginsRaw.split(",").map((o) => o.trim()).filter(Boolean)
    : []; // 公网绑定时默认拒绝所有跨域（需显式配置）
  const allowedOrigins = allowedOriginsSource
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  const wss = new WebSocketServer({
    server,
    verifyClient: (info: { origin?: string; req: http.IncomingMessage; secure: boolean }) => {
      const rawOrigin = info.origin || "";

      // 若未配置白名单（空数组），则仅对公网绑定生效（拒绝所有）
      if (allowedOrigins.length === 0 && isLocalBinding) {
        if (!rawOrigin) {
          return true; // 本地开发下允许无 Origin 的客户端
        }
        const allowed = isLocalLoopbackOrigin(rawOrigin);
        if (!allowed) {
          log.info("ws", `Rejected origin: ${rawOrigin}`);
        }
        return allowed;
      }
      if (allowedOrigins.length === 0) {
        log.error("ws", `Rejected connection: no allowed origins configured for ${hostVal}`);
        return false;
      }
      const origin = normalizeOrigin(rawOrigin);
      if (!origin) {
        log.info("ws", `Rejected origin: ${rawOrigin}`);
        return false;
      }
      const allowed = allowedOrigins.includes(origin);
      if (!allowed) {
        log.info("ws", `Rejected origin: ${rawOrigin}`);
      }
      return allowed;
    },
  });
  const broadcastEvent = (frame: GatewayEventFrame) => {
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify(frame));
      }
    }
  };

  // 初始化会话存储
  const stateDir = opts.stateDir ?? resolveStateDir();
  const sessionsDir = path.join(stateDir, "sessions");

  // Ensure sessions dir exists
  fs.mkdirSync(sessionsDir, { recursive: true });

  const conversationStore = opts.conversationStore ?? new ConversationStore({
    ...opts.conversationStoreOptions,
    dataDir: sessionsDir,
  });

  // MemoryManager is now created and registered globally by gateway.ts (unified instance)
  // No need to create a separate instance here.

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    log.info("ws", `New connection from ${ip}`);

    ws.on("error", (err) => {
      log.error("ws", `Error (${ip}): ${err.message}`);
    });

    ws.on("close", (code, reason) => {
      log.info("ws", `Closed (${ip}): ${code} ${reason}`);
    });

    const state: ConnectionState = {
      connected: false,
      nonce: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      role: "web",
      challengeSentAt: Date.now(),
    };

    sendFrame(ws, { type: "connect.challenge", nonce: state.nonce });

    const challengeTimer = setTimeout(() => {
      if (!state.connected) {
        safeClose(ws, 4401, "connect timeout");
      }
    }, 10_000);

    ws.on("message", async (data) => {
      // Activity Tracking
      opts.onActivity?.();

      const raw = typeof data === "string" ? data : data.toString("utf-8");
      const frame = safeParseFrame(raw);
      if (!frame) {
        safeClose(ws, 4400, "invalid frame");
        return;
      }

      if (!state.connected) {
        if (frame.type !== "connect") {
          sendRes(ws, {
            type: "res",
            id: crypto.randomUUID(),
            ok: false,
            error: { code: "not_connected", message: "Handshake required." },
          });
          return;
        }
        const accepted = acceptConnect(frame, opts.auth);
        if (!accepted.ok) {
          safeClose(ws, 4403, accepted.message);
          return;
        }
        clearTimeout(challengeTimer);
        state.connected = true;
        state.role = accepted.role;
        state.clientId = normalizeClientId(frame.clientId) ?? state.sessionId;
        state.userUuid = frame.userUuid; // 保存用户UUID
        log.debug("ws", "WebSocket connected", {
          clientId: state.clientId,
          hasUserUuid: Boolean(state.userUuid),
        });

        // 提取身份信息（异步）
        const identityInfo = await extractIdentityInfo(opts.stateDir ?? resolveStateDir());

        sendFrame(ws, {
          type: "hello-ok",
          sessionId: state.sessionId,
          role: state.role,
          methods: DEFAULT_METHODS,
          events: DEFAULT_EVENTS,
          version: BELLDANDY_VERSION,
          agentName: identityInfo.agentName,
          agentAvatar: identityInfo.agentAvatar,
          userName: identityInfo.userName,
          userAvatar: identityInfo.userAvatar,
          supportsUuid: true,
          // configOk=false 时，前端应自动打开设置面板引导用户配置 API Key
          configOk: opts.isConfigured ? opts.isConfigured() : true,
        });
        return;
      }

      if (frame.type !== "req") {
        return;
      }

      const res = await handleReq(ws, frame, {
        clientId: state.clientId ?? state.sessionId,
        userUuid: state.userUuid, // 传递UUID
        stateDir: opts.stateDir ?? resolveStateDir(),
        additionalWorkspaceRoots: opts.additionalWorkspaceRoots ?? [],
        envDir: opts.envDir,
        agentFactory: opts.agentFactory ?? (() => new MockAgent()),
        agentRegistry: opts.agentRegistry,
        primaryModelConfig: opts.primaryModelConfig,
        modelFallbacks: opts.modelFallbacks,
        conversationStore,
        ttsEnabled: opts.ttsEnabled,
        ttsSynthesize: opts.ttsSynthesize,
        toolsConfigManager: opts.toolsConfigManager,
        toolExecutor: opts.toolExecutor,
        toolControlConfirmationStore: opts.toolControlConfirmationStore,
        getAgentToolControlMode: opts.getAgentToolControlMode,
        getAgentToolControlConfirmPassword: opts.getAgentToolControlConfirmPassword,
        sttTranscribe: opts.sttTranscribe,
        pluginRegistry: opts.pluginRegistry,
        skillRegistry: opts.skillRegistry,
        goalManager: opts.goalManager,
        tokenUsageUploadConfig,
        broadcastEvent,
        log,
      });
      if (res) sendRes(ws, res);
    });

    ws.on("close", () => {
      clearTimeout(challengeTimer);
    });
  });

  const host = opts.host ?? "127.0.0.1"; // Default to localhost for security
  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));

  const address = server.address();
  const port =
    typeof address === "object" && address && "port" in address ? Number(address.port) : opts.port;

  return {
    port,
    host,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
    broadcast: broadcastEvent,
  };
}

type ConnectionState = {
  connected: boolean;
  nonce: string;
  sessionId: string;
  role: BelldandyRole;
  challengeSentAt: number;
  clientId?: string;
  /** 用户UUID（从连接握手中获取） */
  userUuid?: string;
};

function acceptConnect(
  frame: ConnectRequestFrame,
  authCfg: GatewayServerOptions["auth"],
): { ok: true; role: BelldandyRole } | { ok: false; message: string } {
  const auth = frame.auth ?? { mode: "none" };
  const role = frame.role ?? "web";
  if (!isRole(role)) return { ok: false, message: "invalid role" };

  if (authCfg.mode === "none") return { ok: true, role };

  if (authCfg.mode === "token") {
    if (!authCfg.token) return { ok: false, message: "server auth misconfigured" };
    if (auth.mode !== "token") return { ok: false, message: "token required" };
    if (auth.token !== authCfg.token) return { ok: false, message: "invalid token" };
    return { ok: true, role };
  }

  if (authCfg.mode === "password") {
    if (!authCfg.password) return { ok: false, message: "server auth misconfigured" };
    if (auth.mode !== "password") return { ok: false, message: "password required" };
    if (auth.password !== authCfg.password) return { ok: false, message: "invalid password" };
    return { ok: true, role };
  }

  return { ok: false, message: "invalid auth mode" };
}

function emitAutoRunTaskTokenResult(
  conversationStore: ConversationStore,
  payload: {
    conversationId: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  },
  ws?: WebSocket,
): void {
  const result = {
    name: "run",
    inputTokens: Math.max(0, Number(payload.inputTokens ?? 0)),
    outputTokens: Math.max(0, Number(payload.outputTokens ?? 0)),
    totalTokens: Math.max(0, Number(payload.inputTokens ?? 0) + Number(payload.outputTokens ?? 0)),
    durationMs: Math.max(0, Number(payload.durationMs ?? 0)),
    auto: true,
  };
  conversationStore.recordTaskTokenResult(payload.conversationId, result);
  if (!ws) return;
  sendEvent(ws, {
    type: "event",
    event: "token.counter.result",
    payload: {
      conversationId: payload.conversationId,
      ...result,
    },
  });
}

async function handleReq(
  ws: WebSocket,
  req: GatewayReqFrame,
  ctx: {
    clientId: string;
    userUuid?: string; // 添加UUID字段
    stateDir: string;
    additionalWorkspaceRoots: string[];
    envDir?: string;
    log: GatewayLog;
    agentFactory: () => BelldandyAgent;
    agentRegistry?: AgentRegistry;
    primaryModelConfig?: { baseUrl: string; apiKey: string; model: string };
    modelFallbacks?: ModelProfile[];
    conversationStore: ConversationStore;
    ttsEnabled?: () => boolean;
    ttsSynthesize?: (text: string) => Promise<{ webPath: string; htmlAudio: string } | null>;
    toolsConfigManager?: ToolsConfigManager;
    toolExecutor?: ToolExecutor;
    toolControlConfirmationStore?: ToolControlConfirmationStore;
    getAgentToolControlMode?: () => "disabled" | "confirm" | "auto";
    getAgentToolControlConfirmPassword?: () => string | undefined;
    sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
    pluginRegistry?: PluginRegistry;
    skillRegistry?: SkillRegistry;
    goalManager?: GoalManager;
    tokenUsageUploadConfig: TokenUsageUploadConfig;
    broadcastEvent?: (frame: GatewayEventFrame) => void;
  },
): Promise<GatewayResFrame | null> {
  const secureMethods = [
    "message.send",
    "tool_settings.confirm",
    "config.read",
    "config.readRaw",
    "config.update",
    "config.writeRaw",
    "system.restart",
    "system.doctor",
    "workspace.write",
    "workspace.read",
    "workspace.readSource",
    "workspace.list",
    "context.compact",
    "conversation.meta",
    "tools.update",
    "memory.search",
    "memory.get",
    "memory.recent",
      "memory.stats",
      "memory.task.list",
      "memory.task.get",
      "experience.candidate.get",
      "experience.candidate.list",
      "experience.candidate.accept",
      "experience.candidate.reject",
      "experience.usage.get",
      "experience.usage.list",
      "experience.usage.stats",
      "experience.usage.revoke",
      "goal.create",
      "goal.list",
      "goal.get",
      "goal.resume",
      "goal.pause",
      "goal.handoff.generate",
      "goal.retrospect.generate",
      "goal.experience.suggest",
      "goal.method_candidates.generate",
      "goal.skill_candidates.generate",
      "goal.flow_patterns.generate",
      "goal.flow_patterns.cross_goal",
      "goal.review_governance.summary",
      "goal.suggestion_review.list",
      "goal.suggestion_review.workflow.set",
      "goal.suggestion_review.decide",
      "goal.suggestion_review.escalate",
      "goal.suggestion.publish",
  ];
  if (secureMethods.includes(req.method)) {
    const allowed = await isClientAllowed({ clientId: ctx.clientId, stateDir: ctx.stateDir });
    if (!allowed) {
      const pairing = await ensurePairingCode({ clientId: ctx.clientId, stateDir: ctx.stateDir });
      sendEvent(ws, {
        type: "event",
        event: "pairing.required",
        payload: {
          clientId: ctx.clientId,
          code: pairing.code,
          message: "pairing required: approve this code to allow messages",
        },
      });
      return {
        type: "res",
        id: req.id,
        ok: false,
        error: { code: "pairing_required", message: `Pairing required. Code: ${pairing.code}` },
      };
    }
  }

  switch (req.method) {
    case "models.list": {
      const models: Array<{ id: string; displayName: string; model: string }> = [];
      const defaultModelRef = ctx.agentRegistry?.getProfile("default")?.model ?? "primary";

      if (ctx.primaryModelConfig?.model) {
        const defaultTag = defaultModelRef === "primary" ? "（默认）" : "";
        models.push({
          id: "primary",
          displayName: `${ctx.primaryModelConfig.model}${defaultTag}`,
          model: ctx.primaryModelConfig.model,
        });
      }

      for (const fb of ctx.modelFallbacks ?? []) {
        const fallbackId = fb.id ?? fb.model;
        const defaultTag = fallbackId === defaultModelRef ? "（默认）" : "";
        models.push({
          id: fallbackId,
          displayName: `${fb.displayName ?? fb.model}${defaultTag}`,
          model: fb.model,
        });
      }

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          models,
          currentDefault: defaultModelRef,
        },
      };
    }

    case "message.send": {
      const parsed = parseMessageSendParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }

      let agent: BelldandyAgent;
      const requestedAgentId = parsed.value.agentId;
      const requestedModelId = parsed.value.modelId;
      const createOpts = requestedModelId ? { modelOverride: requestedModelId } : undefined;
      try {
        // Prefer AgentRegistry when available and agentId is specified
        if (ctx.agentRegistry && requestedAgentId) {
          agent = ctx.agentRegistry.create(requestedAgentId, createOpts);
        } else if (ctx.agentRegistry) {
          agent = ctx.agentRegistry.create("default", createOpts);
        } else {
          agent = ctx.agentFactory();
        }
      } catch (err: any) {
        if (err.message === "CONFIG_REQUIRED") {
          return {
            type: "res",
            id: req.id,
            ok: false,
            error: { code: "config_required", message: "API Key or configuration missing." },
          };
        }
        throw err;
      }

      const conversationId = parsed.value.conversationId ?? crypto.randomUUID();
      const effectiveUserUuid = parsed.value.userUuid ?? ctx.userUuid;
      let userText = parsed.value.text;
      const normalizedRoomContext = parsed.value.roomContext
        ? { ...parsed.value.roomContext, clientId: ctx.clientId }
        : parsed.value.from === "web"
          ? { environment: "local" as const, clientId: ctx.clientId }
          : undefined;
      const confirmPassword = String(ctx.getAgentToolControlConfirmPassword?.() ?? "").trim();
      if (
        ctx.getAgentToolControlMode?.() === "confirm"
        && confirmPassword
        && ctx.toolControlConfirmationStore
        && userText.trim() === confirmPassword
      ) {
        const pending = ctx.toolControlConfirmationStore.getLatestByConversation(conversationId);
        if (pending) {
          ctx.toolControlConfirmationStore.markPasswordApproved(pending.requestId);
          userText = "【已提交工具开关确认口令】";
        }
      }
      const { history } = await ctx.conversationStore.getHistoryCompacted(conversationId);

      // Agent-会话绑定校验：防止不同 Agent 共享同一会话导致上下文污染
      const existingConv = ctx.conversationStore.get(conversationId);
      if (existingConv?.agentId && requestedAgentId && existingConv.agentId !== requestedAgentId) {
        return {
          type: "res", id: req.id, ok: false,
          error: { code: "agent_mismatch", message: `会话已绑定 Agent "${existingConv.agentId}"，不能使用 "${requestedAgentId}"。请新建会话。` },
        };
      }

      ctx.conversationStore.addMessage(conversationId, "user", userText, {
        agentId: requestedAgentId,
        channel: "webchat",
      });

      ctx.log.debug("message", "Processing message.send", {
        conversationId,
        hasUserUuid: Boolean(effectiveUserUuid),
        userUuidSource: parsed.value.userUuid ? "message.send" : (ctx.userUuid ? "connect" : "none"),
        payloadKeys: Object.keys(parsed.value),
      });
      if ('attachments' in parsed.value) {
        const atts = (parsed.value as any).attachments;
        ctx.log.debug("message", "Attachments field detected", {
          isArray: Array.isArray(atts),
          count: Array.isArray(atts) ? atts.length : undefined,
        });
      } else {
        ctx.log.debug("message", "No attachments field in payload");
      }

      // Handle Attachments
      let promptText = userText;
      const attachments = parsed.value.attachments;
      const contentParts: Array<any> = []; // Changed from strictly typed imageParts to allow flexible content
      const TEXT_ATTACHMENT_CHAR_LIMIT = 200_000;
      let textAttachmentCount = 0;
      let textAttachmentChars = 0;

      if (attachments && attachments.length > 0) {
        ctx.log.debug("message", "Processing attachments", { count: attachments.length, conversationId });
        const attachmentDir = path.join(ctx.stateDir, "storage", "attachments", conversationId);
        await fs.promises.mkdir(attachmentDir, { recursive: true });

        const attachmentPrompts: string[] = [];
        for (const att of attachments) {
          const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const savePath = path.join(attachmentDir, safeName);

          try {
            const buffer = Buffer.from(att.base64, "base64");
            await fs.promises.writeFile(savePath, buffer);

            if (att.type.startsWith("image/")) {
              // Image logic: Add to contentParts for vision model
              contentParts.push({
                type: "image_url",
                image_url: { url: `data:${att.type};base64,${att.base64}` },
              });
              // Also add a note in text
              attachmentPrompts.push(`\n[用户上传了图片: ${att.name}]`);
            } else if (att.type.startsWith("video/")) {
              // Video logic: Add to contentParts (by local file path)
              // Kimi API requires upload, so we pass the local path to the Agent
              // The Agent implementation (e.g. OpenAIChatAgent) will handle the upload.
              const absPath = path.resolve(savePath);
              contentParts.push({
                type: "video_url",
                video_url: { url: `file://${absPath}` },
              });
              attachmentPrompts.push(`\n[用户上传了视频: ${att.name}] (System Note: Video content has been injected via multimodal channel. Please analyze it directly.)`);
            } else if (att.type.startsWith("audio/")) {
              // Audio logic: Transcribe via STT
              if (ctx.sttTranscribe) {
                ctx.log.debug("stt", "Transcribing audio attachment", { name: att.name });
                try {
                  const sttResult = await ctx.sttTranscribe({
                    buffer,
                    fileName: att.name,
                    mime: att.type,
                  });
                  if (sttResult?.text) {
                    ctx.log.debug("stt", "Audio transcribed", { name: att.name, textLength: sttResult.text.length });
                    if (!promptText?.trim()) {
                      // If user didn't type anything, treat audio as the main prompt
                      promptText = sttResult.text;
                    } else {
                      // Otherwise append as context
                      attachmentPrompts.push(`\n[语音转录: "${sttResult.text}"]`);
                    }
                  } else {
                    attachmentPrompts.push(`\n[用户上传了音频: ${att.name}（转录失败）]`);
                  }
                } catch (err) {
                  ctx.log.error("stt", `STT failed for ${att.name}`, err);
                  attachmentPrompts.push(`\n[用户上传了音频: ${att.name}（转录出错）]`);
                }
              } else {
                attachmentPrompts.push(`\n[用户上传了音频: ${att.name}（STT未配置）]`);
              }
            } else {
              // Text/File logic
              const isText = att.type.startsWith("text/") ||
                att.name.endsWith(".md") ||
                att.name.endsWith(".json") ||
                att.name.endsWith(".js") ||
                att.name.endsWith(".ts") ||
                att.name.endsWith(".txt") ||
                att.name.endsWith(".log");

              if (isText) {
                const content = buffer.toString("utf-8");
                const wasTruncated = content.length > TEXT_ATTACHMENT_CHAR_LIMIT;
                const truncated = wasTruncated
                  ? content.slice(0, TEXT_ATTACHMENT_CHAR_LIMIT) + "\n...[Truncated]"
                  : content;
                textAttachmentCount += 1;
                textAttachmentChars += truncated.length;
                if (wasTruncated) {
                  ctx.log.debug("message", "Text attachment truncated by char limit", {
                    name: att.name,
                    originalChars: content.length,
                    keptChars: truncated.length,
                    charLimit: TEXT_ATTACHMENT_CHAR_LIMIT,
                  });
                }
                attachmentPrompts.push(`\n\n--- Attachment: ${att.name} ---\n${truncated}\n--- End of Attachment ---\n`);
              } else {
                attachmentPrompts.push(`\n[User uploaded a file: ${att.name} (type: ${att.type}), saved at: ${savePath}]`);
              }
            }
          } catch (e) {
            ctx.log.error("message", `Failed to save attachment ${att.name}`, e);
            attachmentPrompts.push(`\n[Failed to upload file: ${att.name}]`);
          }
        }

        if (attachmentPrompts.length > 0) {
          promptText += "\n" + attachmentPrompts.join("\n");
        }
      }

      void (async () => {
        const runStartedAt = Date.now();
        let latestUsage:
          | {
            inputTokens: number;
            outputTokens: number;
          }
          | undefined;
        let didEmitAutoRunTaskResult = false;
        const maybeEmitAutoRunTaskResult = () => {
          if (didEmitAutoRunTaskResult || !latestUsage) return;
          emitAutoRunTaskTokenResult(ctx.conversationStore, {
            conversationId,
            inputTokens: latestUsage.inputTokens,
            outputTokens: latestUsage.outputTokens,
            durationMs: Date.now() - runStartedAt,
          }, ws);
          didEmitAutoRunTaskResult = true;
        };
        try {
          let lastUploadedUsageTotal = 0;
          const runInput: any = {
            conversationId,
            text: promptText,
            userInput: userText,
            history,
            agentId: requestedAgentId,
            userUuid: effectiveUserUuid, // 优先使用 message.send 的 userUuid
            senderInfo: parsed.value.senderInfo, // 传递发送者信息
            roomContext: normalizedRoomContext, // 传递房间上下文
          };
          if (textAttachmentCount > 0) {
            runInput.meta = {
              attachmentStats: {
                textAttachmentCount,
                textAttachmentChars,
                textAttachmentTruncatedCharLimit: TEXT_ATTACHMENT_CHAR_LIMIT,
              },
            };
          }
          if (contentParts.length > 0) {
            // Construct multimodal content
            runInput.content = [
              { type: "text", text: promptText },
              ...contentParts
            ];
          }

          const isTts = ctx.ttsEnabled?.() ?? false;
          let fullResponse = "";

          for await (const item of agent.run(runInput)) {
            if (item.type === "status") {
              sendEvent(ws, { type: "event", event: "agent.status", payload: { conversationId, status: item.status } });
            }
            if (item.type === "tool_call") {
              sendEvent(ws, { type: "event", event: "tool_call", payload: { conversationId, id: item.id, name: item.name, arguments: item.arguments } });
            }
            if (item.type === "tool_result") {
              sendEvent(ws, { type: "event", event: "tool_result", payload: { conversationId, id: item.id, name: item.name, success: item.success, output: typeof item.output === "string" && item.output.length > 500 ? item.output.slice(0, 500) + "\u2026" : item.output } });
            }
            if (item.type === "delta") {
              fullResponse += item.delta;
              // TTS mode: suppress deltas (text + audio sent together after TTS completes)
              if (!isTts) {
                sendEvent(ws, { type: "event", event: "chat.delta", payload: { conversationId, delta: item.delta } });
              }
            }
            if (item.type === "final") {
              fullResponse = item.text;
              // TTS mode: defer chat.final until after TTS generation
              if (!isTts) {
                sendEvent(ws, { type: "event", event: "chat.final", payload: { conversationId, text: item.text } });
              }
            }
            if (item.type === "usage") {
              latestUsage = {
                inputTokens: Number(item.inputTokens ?? 0),
                outputTokens: Number(item.outputTokens ?? 0),
              };
              sendEvent(ws, {
                type: "event", event: "token.usage", payload: {
                  conversationId,
                  systemPromptTokens: item.systemPromptTokens,
                  contextTokens: item.contextTokens,
                  inputTokens: item.inputTokens,
                  outputTokens: item.outputTokens,
                  cacheCreationTokens: item.cacheCreationTokens,
                  cacheReadTokens: item.cacheReadTokens,
                  modelCalls: item.modelCalls,
                }
              });

              if (ctx.tokenUsageUploadConfig.enabled && effectiveUserUuid) {
                const usageTotal = Math.max(0, Number(item.inputTokens ?? 0) + Number(item.outputTokens ?? 0));
                const deltaTokens = Math.max(0, usageTotal - lastUploadedUsageTotal);
                if (usageTotal > lastUploadedUsageTotal) {
                  lastUploadedUsageTotal = usageTotal;
                }
                if (deltaTokens > 0) {
                  void uploadTokenUsage({
                    config: ctx.tokenUsageUploadConfig,
                    userUuid: effectiveUserUuid,
                    conversationId,
                    source: parsed.value.from ?? "webchat",
                    deltaTokens,
                    log: ctx.log,
                  });
                }
              }
            }
          }

          maybeEmitAutoRunTaskResult();

          // Server-side auto TTS: generate audio and send combined response
          if (isTts && fullResponse && ctx.ttsSynthesize) {
            sendEvent(ws, { type: "event", event: "agent.status", payload: { conversationId, status: "generating_audio" } });
            const ttsResult = await ctx.ttsSynthesize(fullResponse);
            if (ttsResult) {
              const finalWithAudio = ttsResult.htmlAudio + "\n\n" + fullResponse;
              sendEvent(ws, { type: "event", event: "chat.final", payload: { conversationId, text: finalWithAudio } });
            } else {
              // TTS failed, fallback to text-only
              sendEvent(ws, { type: "event", event: "chat.final", payload: { conversationId, text: fullResponse } });
            }
          } else if (isTts && fullResponse) {
            // TTS enabled but no synthesize function — send text-only
            sendEvent(ws, { type: "event", event: "chat.final", payload: { conversationId, text: fullResponse } });
          }

          if (fullResponse) {
            // Strip <audio> tags and download links before persisting — leave no trace for LLM to copy
            const sanitized = fullResponse
              .replace(/<audio[^>]*>.*?<\/audio>/gi, "")
              .replace(/\[Download\]\([^)]*\/generated\/[^)]*\)/gi, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            ctx.conversationStore.addMessage(conversationId, "assistant", sanitized || fullResponse, {
              agentId: requestedAgentId,
            });
          }
        } catch (err) {
          maybeEmitAutoRunTaskResult();
          ctx.log.error("agent", "Agent run failed", err);
          sendEvent(ws, { type: "event", event: "agent.status", payload: { conversationId, status: "error" } });
          sendEvent(ws, { type: "event", event: "chat.final", payload: { conversationId, text: `Error: ${String(err)}` } });
        }
      })();

      return { type: "res", id: req.id, ok: true, payload: { conversationId } };
    }

    case "tool_settings.confirm": {
      const parsed = parseToolSettingsConfirmParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }
      if (ctx.getAgentToolControlMode?.() !== "confirm") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_state", message: "当前工具开关控制模式不是 confirm。" },
        };
      }
      if (!ctx.toolControlConfirmationStore || !ctx.toolsConfigManager) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "unsupported", message: "当前服务未启用工具开关确认处理。" },
        };
      }

      const pending = ctx.toolControlConfirmationStore.get(parsed.value.requestId);
      if (!pending) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "not_found", message: `未找到待确认请求: ${parsed.value.requestId}` },
        };
      }
      if (parsed.value.conversationId && parsed.value.conversationId !== pending.conversationId) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "conversation_mismatch", message: "待确认请求不属于当前会话。" },
        };
      }

      const summary = summarizeToolControlChangesLocally(pending.changes);
      const emitEvent = (frame: GatewayEventFrame) => {
        if (ctx.broadcastEvent) {
          ctx.broadcastEvent(frame);
        } else {
          sendEvent(ws, frame);
        }
      };

      if (parsed.value.decision === "reject") {
        ctx.toolControlConfirmationStore.delete(pending.requestId);
        emitEvent({
          type: "event",
          event: "tool_settings.confirm.resolved",
          payload: {
            source: "webchat_ui",
            conversationId: pending.conversationId,
            requestId: pending.requestId,
            decision: "rejected",
            summary,
            resolvedAt: Date.now(),
            targetClientId: ctx.clientId,
          },
        });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            conversationId: pending.conversationId,
            requestId: pending.requestId,
            decision: "rejected",
          },
        };
      }

      const nextDisabled = applyToolControlChangesLocally(ctx.toolsConfigManager.getConfig().disabled, pending.changes);
      await ctx.toolsConfigManager.updateConfig(nextDisabled);
      const latestDisabled = ctx.toolsConfigManager.getConfig().disabled;
      ctx.toolControlConfirmationStore.delete(pending.requestId);

      emitEvent({
        type: "event",
        event: "tools.config.updated",
        payload: {
          source: "webchat_ui",
          mode: "confirm",
          disabled: buildToolControlDisabledPayloadLocally(latestDisabled),
        },
      });
      emitEvent({
        type: "event",
        event: "tool_settings.confirm.resolved",
        payload: {
          source: "webchat_ui",
          conversationId: pending.conversationId,
          requestId: pending.requestId,
          decision: "approved",
          summary,
          resolvedAt: Date.now(),
          targetClientId: ctx.clientId,
        },
      });

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          conversationId: pending.conversationId,
          requestId: pending.requestId,
          decision: "approved",
        },
      };
    }

    case "config.read": {
      const { envPath, envLocalPath: localEnvPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      const config: Record<string, string> = {};

      const readEnvFile = (p: string) => {
        try {
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8");
            raw.split(/\r?\n/).forEach(line => {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith("#")) {
                const eq = trimmed.indexOf("=");
                if (eq > 0) {
                  const key = trimmed.slice(0, eq).trim();
                  let val = trimmed.slice(eq + 1).trim();
                  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                  }
                  config[key] = val;
                }
              }
            });
          }
        } catch { }
      };

      // 1. Read .env (Base)
      readEnvFile(envPath);
      // 2. Read .env.local (Override)
      readEnvFile(localEnvPath);

      // [SECURITY] 对敏感字段进行脱敏处理
      const REDACT_PATTERNS = [/KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i];
      for (const key of Object.keys(config)) {
        if (REDACT_PATTERNS.some(p => p.test(key))) {
          config[key] = "[REDACTED]";
        }
      }

      return { type: "res", id: req.id, ok: true, payload: { config } };
    }

    case "config.update": {
      const params = req.params as unknown as { updates: Record<string, string> } | undefined;
      const updates = params?.updates;
      if (!updates || typeof updates !== "object") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing updates" } };
      }

      // [SECURITY] 仅允许修改白名单内的配置项
      const SAFE_UPDATE_KEYS = new Set([
        "BELLDANDY_OPENAI_BASE_URL", "BELLDANDY_OPENAI_MODEL",
        "BELLDANDY_HEARTBEAT_ENABLED", "BELLDANDY_HEARTBEAT_INTERVAL",
        "BELLDANDY_HEARTBEAT_ACTIVE_HOURS", "BELLDANDY_AGENT_TIMEOUT_MS",
        "BELLDANDY_OPENAI_STREAM", "BELLDANDY_MEMORY_ENABLED",
        "BELLDANDY_EXTRA_WORKSPACE_ROOTS",
        "BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED",
        // Extended whitelist for settings panel
        "BELLDANDY_OPENAI_API_KEY", "BELLDANDY_AGENT_PROVIDER",
        "BELLDANDY_BROWSER_RELAY_ENABLED", "BELLDANDY_RELAY_PORT",
        "BELLDANDY_MCP_ENABLED", "BELLDANDY_CRON_ENABLED",
        "BELLDANDY_TOOLS_ENABLED",
        "BELLDANDY_AGENT_TOOL_CONTROL_MODE",
        "BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD",
        "BELLDANDY_EMBEDDING_ENABLED",
        "BELLDANDY_EMBEDDING_OPENAI_API_KEY", "BELLDANDY_EMBEDDING_OPENAI_BASE_URL",
        "BELLDANDY_EMBEDDING_MODEL",
        // TTS & DashScope
        "BELLDANDY_TTS_ENABLED", "BELLDANDY_TTS_PROVIDER", "BELLDANDY_TTS_VOICE", "DASHSCOPE_API_KEY",
        "BELLDANDY_FACET_ANCHOR",
        "BELLDANDY_INJECT_AGENTS", "BELLDANDY_INJECT_SOUL", "BELLDANDY_INJECT_MEMORY",
        "BELLDANDY_MAX_SYSTEM_PROMPT_CHARS", "BELLDANDY_MAX_HISTORY",
        "BELLDANDY_TASK_DEDUP_GUARD_ENABLED", "BELLDANDY_TASK_DEDUP_WINDOW_MINUTES",
        "BELLDANDY_TASK_DEDUP_MODE", "BELLDANDY_TASK_DEDUP_POLICY"
      ]);
      for (const key of Object.keys(updates)) {
        if (!SAFE_UPDATE_KEYS.has(key)) {
          return { type: "res", id: req.id, ok: false, error: { code: "forbidden", message: `不允许修改配置项: ${key}` } };
        }
      }

      // Split updates
      const envUpdates: Record<string, string> = {};
      const localUpdates: Record<string, string> = {};

      for (const key of Object.keys(updates)) {
        if (key === "BELLDANDY_EXTRA_WORKSPACE_ROOTS") {
          envUpdates[key] = updates[key];
        } else {
          localUpdates[key] = updates[key];
        }
      }

      const updateEnvFile = (filePath: string, changes: Record<string, string>) => {
        if (Object.keys(changes).length === 0) return true;

        let lines: string[] = [];
        try {
          if (fs.existsSync(filePath)) {
            lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
          }
        } catch { }

        const newKeys = new Set(Object.keys(changes));
        const nextLines: string[] = [];
        const handledKeys = new Set<string>();

        for (const line of lines) {
          const trimmed = line.trim();
          let matched = false;
          if (trimmed && !trimmed.startsWith("#")) {
            const eq = trimmed.indexOf("=");
            if (eq > 0) {
              const key = trimmed.slice(0, eq).trim();
              if (newKeys.has(key)) {
                const val = changes[key];
                nextLines.push(`${key}="${val}"`);
                handledKeys.add(key);
                matched = true;
              }
            }
          }
          if (!matched) nextLines.push(line);
        }

        for (const key of newKeys) {
          if (!handledKeys.has(key)) {
            if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
            nextLines.push(`${key}="${changes[key]}"`);
          }
        }

        if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");

        try {
          fs.writeFileSync(filePath, nextLines.join("\n"), "utf-8");
          return true;
        } catch (e) {
          return false;
        }
      };

      const { envPath, envLocalPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      const envOk = updateEnvFile(envPath, envUpdates);
      const localOk = updateEnvFile(envLocalPath, localUpdates);

      if (!envOk || !localOk) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: "Failed to write config files" } };
      }

      return { type: "res", id: req.id, ok: true };
    }

    // [NEW] 读取 .env 文件原始内容（用于编辑器）
    case "config.readRaw": {
      const { envPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      try {
        if (!fs.existsSync(envPath)) {
          return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: ".env 文件不存在" } };
        }
        const content = fs.readFileSync(envPath, "utf-8");
        return { type: "res", id: req.id, ok: true, payload: { content } };
      } catch (e) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(e) } };
      }
    }

    // [NEW] 写入 .env 文件原始内容（用于编辑器）
    case "config.writeRaw": {
      const content = req.params?.content;
      if (typeof content !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing content" } };
      }
      const { envPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      try {
        fs.writeFileSync(envPath, content, "utf-8");
        return { type: "res", id: req.id, ok: true };
      } catch (e) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: String(e) } };
      }
    }

    case "tools.list": {
      if (!ctx.toolExecutor || !ctx.toolsConfigManager) {
        return { type: "res", id: req.id, ok: true, payload: { builtin: [], mcp: {}, plugins: [], skills: [], disabled: { builtin: [], mcp_servers: [], plugins: [], skills: [] } } };
      }
      const allNames = ctx.toolExecutor.getRegisteredToolNames().filter((name) => name !== TOOL_SETTINGS_CONTROL_NAME);
      const config = ctx.toolsConfigManager.getConfig();
      const visibleDisabled = {
        ...config.disabled,
        builtin: config.disabled.builtin.filter((name) => name !== TOOL_SETTINGS_CONTROL_NAME),
      };

      // 分类工具
      const builtin: string[] = [];
      const mcp: Record<string, { tools: string[] }> = {};

      for (const name of allNames) {
        if (name.startsWith("mcp_")) {
          // 提取 serverId: mcp_{serverId}_{toolName}
          const rest = name.slice(4);
          const idx = rest.indexOf("_");
          const serverId = idx > 0 ? rest.slice(0, idx) : rest;
          if (!mcp[serverId]) mcp[serverId] = { tools: [] };
          mcp[serverId].tools.push(name);
        } else {
          builtin.push(name);
        }
      }

      // Skills 列表
      const skills = (ctx.skillRegistry?.getEligibleSkills() ?? []).map(s => ({
        name: s.name,
        description: s.description,
        source: s.source.type,
        priority: s.priority,
        tags: s.tags ?? [],
      }));

      return { type: "res", id: req.id, ok: true, payload: { builtin, mcp, plugins: ctx.pluginRegistry?.getPluginIds() ?? [], skills, disabled: visibleDisabled } };
    }

    case "tools.update": {
      if (!ctx.toolsConfigManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Tools config not available" } };
      }
      const params = req.params as unknown as { disabled?: { builtin?: string[]; mcp_servers?: string[]; plugins?: string[] } } | undefined;
      if (!params?.disabled) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing disabled" } };
      }
      try {
        const sanitizedDisabled = {
          ...params.disabled,
          builtin: Array.isArray(params.disabled.builtin)
            ? params.disabled.builtin.filter((name) => name !== TOOL_SETTINGS_CONTROL_NAME)
            : params.disabled.builtin,
        };
        await ctx.toolsConfigManager.updateConfig(sanitizedDisabled);
        return { type: "res", id: req.id, ok: true };
      } catch (e) {
        return { type: "res", id: req.id, ok: false, error: { code: "save_failed", message: String(e) } };
      }
    }

    case "system.restart": {
      const cooldownCheck = checkAndConsumeRestartCooldown({ stateDir: ctx.stateDir });
      if (!cooldownCheck.allowed) {
        const message = formatRestartCooldownMessage(cooldownCheck.remainingSeconds);
        ctx.log.warn("system", "system.restart blocked by cooldown", {
          clientId: ctx.clientId,
          remainingSeconds: cooldownCheck.remainingSeconds,
        });
        return { type: "res", id: req.id, ok: false, error: { code: "restart_cooldown", message } };
      }
      setTimeout(() => {
        process.exit(100);
      }, 500);
      return { type: "res", id: req.id, ok: true };
    }

    case "system.doctor": {
      const checks: any[] = [
        { id: "node", name: "Node.js Environment", status: "pass", message: process.version },
        { id: "memory_db", name: "Vector Database", status: "pass", message: "OK" },
      ];

      const dbPath = path.join(ctx.stateDir, "memory.sqlite");
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        checks[1].message = `Size: ${(stat.size / 1024).toFixed(1)} KB`;
      } else {
        checks[1].status = "warn";
        checks[1].message = "Not created yet";
      }

      try {
        ctx.agentFactory();
        checks.push({ id: "agent_config", name: "Agent Configuration", status: "pass", message: "Valid" });
      } catch {
        checks.push({ id: "agent_config", name: "Agent Configuration", status: "fail", message: "Missing API Keys" });
      }

      return { type: "res", id: req.id, ok: true, payload: { checks } };
    }

    case "agents.list": {
      const profiles = ctx.agentRegistry?.list() ?? [];
      const agents = profiles.map(p => ({
        id: p.id,
        displayName: p.displayName,
        model: p.model,
      }));
      return { type: "res", id: req.id, ok: true, payload: { agents } };
    }

    case "goal.create": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const title = typeof params.title === "string" ? params.title.trim() : "";
      const objective = typeof params.objective === "string" ? params.objective.trim() : undefined;
      const slug = typeof params.slug === "string" ? params.slug.trim() : undefined;
      const goalRoot = typeof params.goalRoot === "string" ? params.goalRoot.trim() : undefined;
      if (!title) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "title is required" } };
      }
      try {
        const goal = await ctx.goalManager.createGoal({ title, objective, slug, goalRoot });
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            goal,
            conversationId: goal.activeConversationId,
          },
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_create_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.list": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const goals = await ctx.goalManager.listGoals();
      return { type: "res", id: req.id, ok: true, payload: { goals } };
    }

    case "goal.get": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      const goal = await ctx.goalManager.getGoal(goalId);
      if (!goal) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Goal not found." } };
      }
      return { type: "res", id: req.id, ok: true, payload: { goal } };
    }

    case "goal.resume": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : undefined;
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.resumeGoal(goalId, nodeId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_resume_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.pause": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const goal = await ctx.goalManager.pauseGoal(goalId);
        return { type: "res", id: req.id, ok: true, payload: { goal } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_pause_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.handoff.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateHandoff(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_handoff_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.retrospect.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateRetrospective(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_retrospect_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.experience.suggest": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateExperienceSuggestions(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_experience_suggest_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.method_candidates.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateMethodCandidates(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_method_candidates_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.skill_candidates.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateSkillCandidates(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_skill_candidates_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.flow_patterns.generate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const result = await ctx.goalManager.generateFlowPatterns(goalId);
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_flow_patterns_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.flow_patterns.cross_goal": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      try {
        const result = await ctx.goalManager.generateCrossGoalFlowPatterns();
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_cross_goal_flow_patterns_generate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.review_governance.summary": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const summary = await ctx.goalManager.getReviewGovernanceSummary(goalId);
        return { type: "res", id: req.id, ok: true, payload: { summary } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_review_governance_summary_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.list": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const reviews = await ctx.goalManager.listSuggestionReviews(goalId);
        return { type: "res", id: req.id, ok: true, payload: { reviews } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_list_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.workflow.set": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const mode = typeof params.mode === "string" ? params.mode.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId || !mode) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and mode are required" } };
      }
      if (!["single", "chain", "quorum"].includes(mode)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "mode is invalid" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.configureSuggestionReviewWorkflow(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          mode: mode as "single" | "chain" | "quorum",
          reviewers: Array.isArray(params.reviewers)
            ? params.reviewers.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
            : undefined,
          reviewerRoles: Array.isArray(params.reviewerRoles)
            ? params.reviewerRoles.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
            : undefined,
          minApprovals: typeof params.minApprovals === "number" && Number.isFinite(params.minApprovals) ? params.minApprovals : undefined,
          stages: Array.isArray(params.stages)
            ? params.stages.map((item) => {
              const stage = isObjectRecord(item) ? item : {};
              return {
                title: typeof stage.title === "string" ? stage.title.trim() || undefined : undefined,
                reviewers: Array.isArray(stage.reviewers)
                  ? stage.reviewers.map((reviewer) => typeof reviewer === "string" ? reviewer.trim() : "").filter(Boolean)
                  : [],
                reviewerRoles: Array.isArray(stage.reviewerRoles)
                  ? stage.reviewerRoles.map((role) => typeof role === "string" ? role.trim() : "").filter(Boolean)
                  : undefined,
                minApprovals: typeof stage.minApprovals === "number" && Number.isFinite(stage.minApprovals) ? stage.minApprovals : undefined,
                slaHours: typeof stage.slaHours === "number" && Number.isFinite(stage.slaHours) ? stage.slaHours : undefined,
              };
            }).filter((item) => item.reviewers.length > 0)
            : undefined,
          slaHours: typeof params.slaHours === "number" && Number.isFinite(params.slaHours) ? params.slaHours : undefined,
          escalationMode: typeof params.escalationMode === "string" && (params.escalationMode === "none" || params.escalationMode === "manual")
            ? params.escalationMode
            : undefined,
          escalationReviewer: typeof params.escalationReviewer === "string" ? params.escalationReviewer.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_workflow_set_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.decide": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const decision = typeof params.decision === "string" ? params.decision.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId || !decision) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and decision are required" } };
      }
      if (!["accepted", "rejected", "deferred", "needs_revision"].includes(decision)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "decision is invalid" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.decideSuggestionReview(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          decision: decision as "accepted" | "rejected" | "deferred" | "needs_revision",
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_decide_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion_review.escalate": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.escalateSuggestionReview(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          escalatedBy: typeof params.escalatedBy === "string" ? params.escalatedBy.trim() || undefined : undefined,
          escalatedTo: typeof params.escalatedTo === "string" ? params.escalatedTo.trim() || undefined : undefined,
          reason: typeof params.reason === "string" ? params.reason.trim() || undefined : undefined,
          force: Boolean(params.force),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_review_escalate_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.suggestion.publish": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const suggestionType = typeof params.suggestionType === "string" ? params.suggestionType.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      if (suggestionType && !["method_candidate", "skill_candidate", "flow_pattern"].includes(suggestionType)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "suggestionType is invalid" } };
      }
      try {
        const result = await ctx.goalManager.publishSuggestion(goalId, {
          reviewId: typeof params.reviewId === "string" ? params.reviewId.trim() || undefined : undefined,
          suggestionType: suggestionType ? suggestionType as "method_candidate" | "skill_candidate" | "flow_pattern" : undefined,
          suggestionId: typeof params.suggestionId === "string" ? params.suggestionId.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_suggestion_publish_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.list": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const checkpoints = await ctx.goalManager.listCheckpoints(goalId);
        return { type: "res", id: req.id, ok: true, payload: { checkpoints } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_list_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.request": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.requestCheckpoint(goalId, nodeId, {
          title: typeof params.title === "string" ? params.title.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_request_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.approve": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.approveCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_approve_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.reject": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.rejectCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_reject_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.expire": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.expireCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_expire_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.checkpoint.reopen": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.reopenCheckpoint(goalId, nodeId, {
          checkpointId: typeof params.checkpointId === "string" ? params.checkpointId.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          note: typeof params.note === "string" ? params.note.trim() || undefined : undefined,
          reviewer: typeof params.reviewer === "string" ? params.reviewer.trim() || undefined : undefined,
          reviewerRole: typeof params.reviewerRole === "string" ? params.reviewerRole.trim() || undefined : undefined,
          requestedBy: typeof params.requestedBy === "string" ? params.requestedBy.trim() || undefined : undefined,
          decidedBy: typeof params.decidedBy === "string" ? params.decidedBy.trim() || undefined : undefined,
          slaAt: typeof params.slaAt === "string" ? params.slaAt.trim() || undefined : undefined,
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_checkpoint_reopen_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.read": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      if (!goalId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId is required" } };
      }
      try {
        const graph = await ctx.goalManager.readTaskGraph(goalId);
        return { type: "res", id: req.id, ok: true, payload: { graph } };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_read_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.create": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const title = typeof params.title === "string" ? params.title.trim() : "";
      if (!goalId || !title) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and title are required" } };
      }
      try {
        const result = await ctx.goalManager.createTaskNode(goalId, {
          id: typeof params.nodeId === "string" ? params.nodeId.trim() || undefined : undefined,
          title,
          description: typeof params.description === "string" ? params.description.trim() || undefined : undefined,
          phase: typeof params.phase === "string" ? params.phase.trim() || undefined : undefined,
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          dependsOn: Array.isArray(params.dependsOn) ? params.dependsOn.map((item) => String(item)) : undefined,
          acceptance: Array.isArray(params.acceptance) ? params.acceptance.map((item) => String(item)) : undefined,
          checkpointRequired: typeof params.checkpointRequired === "boolean" ? params.checkpointRequired : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          status: parseGoalTaskCreateStatus(params.status),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_create_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.update": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.updateTaskNode(goalId, nodeId, {
          title: typeof params.title === "string" ? params.title.trim() || undefined : undefined,
          description: typeof params.description === "string" ? params.description : undefined,
          phase: typeof params.phase === "string" ? params.phase : undefined,
          owner: typeof params.owner === "string" ? params.owner : undefined,
          dependsOn: Array.isArray(params.dependsOn) ? params.dependsOn.map((item) => String(item)) : undefined,
          acceptance: Array.isArray(params.acceptance) ? params.acceptance.map((item) => String(item)) : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointRequired: typeof params.checkpointRequired === "boolean" ? params.checkpointRequired : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_update_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.claim": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.claimTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_claim_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.pending_review": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.markTaskNodePendingReview(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_pending_review_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.validating": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.markTaskNodeValidating(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_validating_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.complete": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.completeTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_complete_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.block": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      const blockReason = typeof params.blockReason === "string" ? params.blockReason.trim() : "";
      if (!goalId || !nodeId || !blockReason) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId, nodeId and blockReason are required" } };
      }
      try {
        const result = await ctx.goalManager.blockTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_block_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.fail": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.failTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_fail_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "goal.task_graph.skip": {
      if (!ctx.goalManager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Goal manager is not available." } };
      }
      const params = isObjectRecord(req.params) ? req.params : {};
      const goalId = typeof params.goalId === "string" ? params.goalId.trim() : "";
      const nodeId = typeof params.nodeId === "string" ? params.nodeId.trim() : "";
      if (!goalId || !nodeId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "goalId and nodeId are required" } };
      }
      try {
        const result = await ctx.goalManager.skipTaskNode(goalId, nodeId, {
          owner: typeof params.owner === "string" ? params.owner.trim() || undefined : undefined,
          summary: typeof params.summary === "string" ? params.summary.trim() || undefined : undefined,
          blockReason: typeof params.blockReason === "string" ? params.blockReason.trim() || undefined : undefined,
          artifacts: Array.isArray(params.artifacts) ? params.artifacts.map((item) => String(item)) : undefined,
          checkpointStatus: parseGoalTaskCheckpointStatus(params.checkpointStatus),
          runId: typeof params.runId === "string" ? params.runId.trim() || undefined : undefined,
        });
        return { type: "res", id: req.id, ok: true, payload: result as unknown as Record<string, unknown> };
      } catch (err) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "goal_task_graph_skip_failed", message: err instanceof Error ? err.message : String(err) },
        };
      }
    }

    case "memory.search": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const query = typeof params.query === "string" ? params.query.trim() : "";
      if (!query) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "query is required" } };
      }

      const limit = clampListLimit(params.limit, 20);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = await manager.search(query, { limit, filter: filter as any });
      return { type: "res", id: req.id, ok: true, payload: { items, query, limit } };
    }

    case "memory.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const chunkId = typeof params.chunkId === "string" ? params.chunkId.trim() : "";
      if (!chunkId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "chunkId is required" } };
      }

      const item = manager.getMemory(chunkId);
      if (!item) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Memory not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { item } };
    }

    case "memory.recent": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 20);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.getRecent(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "memory.stats": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          status: manager.getStatus(),
          recentTasks: manager.getRecentTasks(5),
        },
      };
    }

    case "memory.task.list": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const query = typeof params.query === "string" ? params.query.trim() : "";
      const limit = clampListLimit(params.limit, 20);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = query
        ? manager.searchTasks(query, { limit, filter: filter as any })
        : manager.getRecentTasks(limit, filter as any);

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          items,
          query,
          limit,
        },
      };
    }

    case "memory.task.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      if (!taskId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "taskId is required" } };
      }

      const task = manager.getTaskDetail(taskId);
      if (!task) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Task not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { task } };
    }

    case "experience.candidate.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }

      const candidate = manager.getExperienceCandidate(candidateId);
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { candidate } };
    }

    case "experience.candidate.list": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceCandidates(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "experience.candidate.accept": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }

      const existing = manager.getExperienceCandidate(candidateId);
      if (!existing) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }
      if (existing.status !== "draft") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_state", message: `Experience candidate can only be accepted from draft status. Current status: ${existing.status}.` },
        };
      }

      let publishedPath: string | undefined;
      if (existing.type === "skill") {
        publishedPath = await publishSkillCandidate(existing, ctx.stateDir, ctx.skillRegistry);
      }

      const candidate = manager.acceptExperienceCandidate(candidateId, publishedPath ? { publishedPath } : {});
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { candidate } };
    }

    case "experience.candidate.reject": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const candidateId = typeof params.candidateId === "string" ? params.candidateId.trim() : "";
      if (!candidateId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "candidateId is required" } };
      }
      const existing = manager.getExperienceCandidate(candidateId);
      if (!existing) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }
      if (existing.status !== "draft") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_state", message: `Experience candidate can only be rejected from draft status. Current status: ${existing.status}.` },
        };
      }

      const candidate = manager.rejectExperienceCandidate(candidateId);
      if (!candidate) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience candidate not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { candidate } };
    }

    case "experience.usage.get": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const usageId = typeof params.usageId === "string" ? params.usageId.trim() : "";
      if (!usageId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "usageId is required" } };
      }

      const usage = manager.getExperienceUsage(usageId);
      if (!usage) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Experience usage not found." } };
      }

      return { type: "res", id: req.id, ok: true, payload: { usage } };
    }

    case "experience.usage.list": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsages(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "experience.usage.stats": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const limit = clampListLimit(params.limit, 50);
      const filter = isObjectRecord(params.filter) ? params.filter : undefined;
      const items = manager.listExperienceUsageStats(limit, filter as any);
      return { type: "res", id: req.id, ok: true, payload: { items, limit } };
    }

    case "experience.usage.revoke": {
      const manager = getGlobalMemoryManager();
      if (!manager) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_available", message: "Memory manager is not available." } };
      }

      const params = isObjectRecord(req.params) ? req.params : {};
      const usageId = typeof params.usageId === "string" ? params.usageId.trim() : "";
      const taskId = typeof params.taskId === "string" ? params.taskId.trim() : "";
      const assetType = typeof params.assetType === "string" ? params.assetType.trim() : "";
      const assetKey = typeof params.assetKey === "string" ? params.assetKey.trim() : "";

      if (!usageId && (!taskId || (assetType !== "method" && assetType !== "skill") || !assetKey)) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: { code: "invalid_params", message: "usageId or taskId + assetType + assetKey is required." },
        };
      }

      const usage = manager.revokeExperienceUsage({
        usageId: usageId || undefined,
        taskId: taskId || undefined,
        assetType: assetType === "method" || assetType === "skill" ? assetType : undefined,
        assetKey: assetKey || undefined,
      });

      return { type: "res", id: req.id, ok: true, payload: { usage, revoked: Boolean(usage) } };
    }

    case "workspace.list": {
      const params = req.params as { path?: string } | undefined;
      const relativePath = params?.path ?? "";

      // 验证路径安全性
      const targetDir = path.resolve(ctx.stateDir, relativePath);
      if (!isUnderRoot(ctx.stateDir, targetDir)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      // 检查目录是否存在
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "目录不存在" } };
      }

      // 允许的文件扩展名
      const ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
      // 忽略的目录和文件
      const IGNORED_NAMES = ["generated", "memory.db", ".DS_Store", "node_modules"];

      try {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        const items: Array<{ name: string; type: "file" | "directory"; path: string }> = [];

        for (const entry of entries) {
          // 忽略隐藏文件（以.开头，但排除状态目录自身）
          if (entry.name.startsWith(".") && relativePath !== "") continue;
          // 忽略特定名称
          if (IGNORED_NAMES.includes(entry.name)) continue;

          const itemRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            items.push({ name: entry.name, type: "directory", path: itemRelPath });
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ALLOWED_EXTENSIONS.includes(ext)) {
              items.push({ name: entry.name, type: "file", path: itemRelPath });
            }
          }
        }

        // 排序：文件夹在前，然后按名称排序
        items.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        return { type: "res", id: req.id, ok: true, payload: { items } };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(err) } };
      }
    }

    case "workspace.read": {
      const params = req.params as { path?: string } | undefined;
      const relativePath = params?.path;

      if (!relativePath || typeof relativePath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }

      // 验证路径安全性
      const targetFile = path.resolve(ctx.stateDir, relativePath);
      if (!isUnderRoot(ctx.stateDir, targetFile)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      // 检查文件扩展名
      const ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
      const ext = path.extname(targetFile).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_type", message: "不支持的文件类型" } };
      }

      // [SECURITY] 禁止访问内部状态文件
      const SENSITIVE_FILES = ["allowlist.json", "pairing.json", "mcp.json", "feishu-state.json"];
      if (SENSITIVE_FILES.includes(path.basename(relativePath).toLowerCase())) {
        return { type: "res", id: req.id, ok: false, error: { code: "forbidden", message: "禁止访问内部状态文件" } };
      }

      // 检查文件是否存在
      if (!fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "文件不存在" } };
      }

      try {
        const content = fs.readFileSync(targetFile, "utf-8");
        return { type: "res", id: req.id, ok: true, payload: { content, path: relativePath } };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(err) } };
      }
    }

    case "workspace.readSource": {
      const params = req.params as { path?: string } | undefined;
      const requestedPath = params?.path;

      if (!requestedPath || typeof requestedPath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }

      const targetFile = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(ctx.stateDir, requestedPath);
      const allowedRoots = [ctx.stateDir, ...ctx.additionalWorkspaceRoots];

      if (!allowedRoots.some((root) => isUnderRoot(root, targetFile))) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      const READABLE_TEXT_EXTENSIONS = [
        ".md", ".txt", ".json", ".jsonl", ".log", ".csv",
        ".js", ".jsx", ".ts", ".tsx", ".mts", ".cts",
        ".css", ".scss", ".less", ".html", ".xml",
        ".yml", ".yaml", ".toml", ".ini",
        ".py", ".rb", ".go", ".rs", ".java", ".kt", ".cs",
        ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd",
      ];
      const ext = path.extname(targetFile).toLowerCase();
      if (!READABLE_TEXT_EXTENSIONS.includes(ext)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_type", message: "不支持的源文件类型" } };
      }

      if (!fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "文件不存在" } };
      }

      try {
        const content = fs.readFileSync(targetFile, "utf-8");
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            content,
            path: targetFile,
            readOnly: true,
          },
        };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(err) } };
      }
    }

    case "workspace.write": {
      const params = req.params as { path?: string; content?: string } | undefined;
      const relativePath = params?.path;
      const content = params?.content;

      if (!relativePath || typeof relativePath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }
      if (typeof content !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "content is required" } };
      }

      // 验证路径安全性
      const targetFile = path.resolve(ctx.stateDir, relativePath);
      if (!isUnderRoot(ctx.stateDir, targetFile)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      // 检查文件扩展名
      const ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
      const ext = path.extname(targetFile).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_type", message: "不支持的文件类型" } };
      }

      try {
        // 确保父目录存在
        const parentDir = path.dirname(targetFile);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
        }

        // 原子写入：先写临时文件再 rename
        const tmpFile = `${targetFile}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(tmpFile, content, "utf-8");
        fs.renameSync(tmpFile, targetFile);

        return { type: "res", id: req.id, ok: true, payload: { path: relativePath } };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: String(err) } };
      }
    }

    case "context.compact": {
      const params = req.params as { conversationId?: string } | undefined;
      const conversationId = params?.conversationId;

      if (!conversationId || typeof conversationId !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      try {
        const result = await ctx.conversationStore.forceCompact(conversationId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            compacted: result.compacted,
            originalTokens: result.originalTokens,
            compactedTokens: result.compactedTokens,
            tier: result.tier,
          },
        };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "compact_failed", message: String(err) } };
      }
    }

    case "conversation.meta": {
      const params = req.params as { conversationId?: string; limit?: number } | undefined;
      const conversationId = typeof params?.conversationId === "string" ? params.conversationId.trim() : "";
      const limit = typeof params?.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(50, Math.floor(params.limit)))
        : 10;

      if (!conversationId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "conversationId is required" } };
      }

      return {
        type: "res",
        id: req.id,
        ok: true,
        payload: {
          conversationId,
          taskTokenResults: ctx.conversationStore.getTaskTokenResults(conversationId, limit),
        },
      };
    }
  }

  return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Unknown method." } };
}

function parseMessageSendParams(value: unknown): { ok: true; value: MessageSendParams } | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "params must be an object" };
  const obj = value as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text : "";
  const limits = getAttachmentLimits();

  let attachments: MessageSendParams["attachments"];
  if (obj.attachments !== undefined) {
    if (!Array.isArray(obj.attachments)) return { ok: false, message: "attachments must be an array" };
    attachments = [];
    let totalBytes = 0;
    for (let i = 0; i < obj.attachments.length; i += 1) {
      const raw = obj.attachments[i];
      if (!raw || typeof raw !== "object") {
        return { ok: false, message: `attachments[${i}] must be an object` };
      }
      const att = raw as Record<string, unknown>;
      const name = typeof att.name === "string" ? att.name.trim() : "";
      const type = typeof att.type === "string" ? att.type.trim() : "";
      const base64 = typeof att.base64 === "string" ? att.base64.trim() : "";
      if (!name || !type || !base64) {
        return { ok: false, message: `attachments[${i}] requires name/type/base64` };
      }
      const estimatedBytes = estimateBase64DecodedBytes(base64);
      if (estimatedBytes === null) {
        return { ok: false, message: `attachments[${i}].base64 is invalid` };
      }
      if (estimatedBytes > limits.maxFileBytes) {
        return { ok: false, message: `attachment "${name}" exceeds max file size (${limits.maxFileBytes} bytes)` };
      }
      totalBytes += estimatedBytes;
      if (totalBytes > limits.maxTotalBytes) {
        return { ok: false, message: `attachments total size exceeds limit (${limits.maxTotalBytes} bytes)` };
      }
      attachments.push({ name, type, base64 });
    }
  }

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!text.trim() && !hasAttachments) return { ok: false, message: "text or attachments required" };
  const conversationId =
    typeof obj.conversationId === "string" && obj.conversationId.trim() ? obj.conversationId.trim() : undefined;
  const from = typeof obj.from === "string" && obj.from.trim() ? obj.from.trim() : undefined;
  const agentId = typeof obj.agentId === "string" && obj.agentId.trim() ? obj.agentId.trim() : undefined;
  const modelId = typeof obj.modelId === "string" && obj.modelId.trim() ? obj.modelId.trim() : undefined;
  const userUuid = typeof obj.userUuid === "string" && obj.userUuid.trim() ? obj.userUuid.trim() : undefined;

  // 解析 senderInfo 和 roomContext（用于 office.goddess.ai 社区）
  const senderInfo = obj.senderInfo && typeof obj.senderInfo === "object" ? obj.senderInfo as any : undefined;
  const roomContext = obj.roomContext && typeof obj.roomContext === "object" ? obj.roomContext as any : undefined;

  return { ok: true, value: { text, conversationId, from, agentId, modelId, userUuid, attachments, senderInfo, roomContext } };
}

function parseToolSettingsConfirmParams(
  value: unknown,
): { ok: true; value: { requestId: string; decision: "approve" | "reject"; conversationId?: string } } | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "params must be an object" };
  const obj = value as Record<string, unknown>;
  const requestId = typeof obj.requestId === "string" ? obj.requestId.trim().toUpperCase() : "";
  const decision = typeof obj.decision === "string" ? obj.decision.trim().toLowerCase() : "";
  const conversationId =
    typeof obj.conversationId === "string" && obj.conversationId.trim() ? obj.conversationId.trim() : undefined;
  if (!requestId) return { ok: false, message: "requestId is required" };
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, message: 'decision must be "approve" or "reject"' };
  }
  return { ok: true, value: { requestId, decision, conversationId } };
}

function safeParseFrame(raw: string): GatewayFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const type = obj.type;
  if (type === "connect") {
    const role = typeof obj.role === "string" ? obj.role : "web";
    const auth = parseAuth(obj.auth);
    const clientId = typeof obj.clientId === "string" ? obj.clientId : undefined;
    const userUuid = typeof obj.userUuid === "string" && obj.userUuid.trim() ? obj.userUuid.trim() : undefined; // 解析 userUuid
    return {
      type: "connect",
      role: isRole(role) ? role : "web",
      clientId,
      auth,
      clientName: typeof obj.clientName === "string" ? obj.clientName : undefined,
      clientVersion: typeof obj.clientVersion === "string" ? obj.clientVersion : undefined,
      userUuid, // 添加 userUuid 字段
    };
  }
  if (type === "req") {
    const id = typeof obj.id === "string" ? obj.id : "";
    const method = typeof obj.method === "string" ? obj.method : "";
    if (!id || !method) return null;
    return { type: "req", id, method, params: (obj.params ?? undefined) as any };
  }
  return null;
}

function parseAuth(value: unknown): GatewayAuth {
  if (!value || typeof value !== "object") return { mode: "none" };
  const obj = value as Record<string, unknown>;
  const mode = obj.mode;
  if (mode === "token") {
    const token = typeof obj.token === "string" ? obj.token : "";
    return { mode: "token", token };
  }
  if (mode === "password") {
    const password = typeof obj.password === "string" ? obj.password : "";
    return { mode: "password", password };
  }
  return { mode: "none" };
}

function isRole(value: string): value is BelldandyRole {
  return value === "web" || value === "cli" || value === "node";
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampListLimit(value: unknown, fallback: number, max = 100): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseGoalTaskCheckpointStatus(value: unknown): "not_required" | "required" | "waiting_user" | "approved" | "rejected" | "expired" | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  switch (normalized) {
    case "not_required":
    case "required":
    case "waiting_user":
    case "approved":
    case "rejected":
    case "expired":
      return normalized;
    default:
      return undefined;
  }
}

function parseGoalTaskCreateStatus(value: unknown): "draft" | "ready" | "blocked" | "skipped" | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  switch (normalized) {
    case "draft":
    case "ready":
    case "blocked":
    case "skipped":
      return normalized;
    default:
      return undefined;
  }
}

function sendRes(ws: WebSocket, frame: GatewayResFrame) {
  sendFrame(ws, frame);
}

function sendEvent(ws: WebSocket, frame: GatewayEventFrame) {
  sendFrame(ws, frame);
}

function sendFrame(ws: WebSocket, frame: GatewayFrame) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(frame));
}

function safeClose(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // ignore
  }
}

function ensureWebRoot(webRoot: string) {
  const stat = (() => {
    try {
      return fs.statSync(webRoot);
    } catch {
      return null;
    }
  })();
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Invalid webRoot: ${webRoot}`);
  }
}
