import fsp from "node:fs/promises";

import { resolveEnvFilePaths } from "@star-sanctuary/distribution";
import type { GatewayReqFrame, GatewayResFrame } from "@belldandy/protocol";

import { normalizePreferredProviderIds } from "../provider-model-catalog.js";
import {
  getChannelReplyChunkingConfigContent,
  parseChannelReplyChunkingConfigContent,
  writeChannelReplyChunkingConfig,
} from "../channel-reply-chunking-store.js";
import {
  approveChannelSecurityApprovalRequest,
  getChannelSecurityConfigContent,
  parseChannelSecurityConfigContent,
  readChannelSecurityApprovalStore,
  rejectChannelSecurityApprovalRequest,
  writeChannelSecurityConfig,
} from "../channel-security-store.js";
import type { GatewayWebSocketRequestContext } from "../server-websocket-dispatch.js";

type ConfigChannelMethodContext = Pick<
  GatewayWebSocketRequestContext,
  "envDir" | "auth" | "stateDir" | "preferredProviderIds"
> & {
  statIfExists: (targetPath: string) => Promise<{ isFile: () => boolean } | null>;
  readEnvFileIntoConfig: (filePath: string, config: Record<string, string>) => Promise<void>;
  updateEnvFile: (filePath: string, changes: Record<string, string>) => Promise<boolean>;
  writeTextFileAtomic: (
    filePath: string,
    content: string,
    options?: { ensureParent?: boolean; mode?: number },
  ) => Promise<void>;
};

const REDACT_PATTERNS = [/KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i];
const SAFE_UPDATE_KEYS = new Set([
  "BELLDANDY_OPENAI_BASE_URL", "BELLDANDY_OPENAI_MODEL",
  "BELLDANDY_MODEL_PREFERRED_PROVIDERS",
  "BELLDANDY_ASSISTANT_MODE_ENABLED",
  "BELLDANDY_HEARTBEAT_ENABLED", "BELLDANDY_HEARTBEAT_INTERVAL",
  "BELLDANDY_HEARTBEAT_ACTIVE_HOURS", "BELLDANDY_AGENT_TIMEOUT_MS",
  "BELLDANDY_OPENAI_STREAM", "BELLDANDY_MEMORY_ENABLED",
  "BELLDANDY_EXTRA_WORKSPACE_ROOTS",
  "BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED",
  "BELLDANDY_OPENAI_API_KEY", "BELLDANDY_AGENT_PROVIDER",
  "BELLDANDY_BROWSER_RELAY_ENABLED", "BELLDANDY_RELAY_PORT",
  "BELLDANDY_MCP_ENABLED", "BELLDANDY_CRON_ENABLED",
  "BELLDANDY_TOOLS_ENABLED",
  "BELLDANDY_AGENT_TOOL_CONTROL_MODE",
  "BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD",
  "BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION",
  "BELLDANDY_ASSISTANT_EXTERNAL_DELIVERY_PREFERENCE",
  "BELLDANDY_EMBEDDING_ENABLED",
  "BELLDANDY_EMBEDDING_OPENAI_API_KEY", "BELLDANDY_EMBEDDING_OPENAI_BASE_URL",
  "BELLDANDY_EMBEDDING_MODEL",
  "BELLDANDY_TTS_ENABLED", "BELLDANDY_TTS_PROVIDER", "BELLDANDY_TTS_VOICE",
  "BELLDANDY_TTS_OPENAI_API_KEY", "BELLDANDY_TTS_OPENAI_BASE_URL",
  "DASHSCOPE_API_KEY",
  "BELLDANDY_FACET_ANCHOR",
  "BELLDANDY_INJECT_AGENTS", "BELLDANDY_INJECT_SOUL", "BELLDANDY_INJECT_MEMORY",
  "BELLDANDY_MAX_SYSTEM_PROMPT_CHARS", "BELLDANDY_MAX_HISTORY", "BELLDANDY_CONVERSATION_ALLOWED_KINDS",
  "BELLDANDY_TASK_DEDUP_GUARD_ENABLED", "BELLDANDY_TASK_DEDUP_WINDOW_MINUTES",
  "BELLDANDY_TASK_DEDUP_MODE", "BELLDANDY_TASK_DEDUP_POLICY",
  "BELLDANDY_COMMUNITY_API_ENABLED", "BELLDANDY_COMMUNITY_API_TOKEN",
  "BELLDANDY_FEISHU_APP_ID", "BELLDANDY_FEISHU_APP_SECRET", "BELLDANDY_FEISHU_AGENT_ID",
  "BELLDANDY_QQ_APP_ID", "BELLDANDY_QQ_APP_SECRET", "BELLDANDY_QQ_AGENT_ID", "BELLDANDY_QQ_SANDBOX",
  "BELLDANDY_DISCORD_ENABLED", "BELLDANDY_DISCORD_BOT_TOKEN",
]);

export async function handleConfigChannelMethod(
  req: GatewayReqFrame,
  ctx: ConfigChannelMethodContext,
): Promise<GatewayResFrame | null> {
  switch (req.method) {
    case "config.read": {
      const { envPath, envLocalPath: localEnvPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      const config: Record<string, string> = {};
      await ctx.readEnvFileIntoConfig(envPath, config);
      await ctx.readEnvFileIntoConfig(localEnvPath, config);
      for (const key of Object.keys(config)) {
        if (REDACT_PATTERNS.some((pattern) => pattern.test(key))) {
          config[key] = "[REDACTED]";
        }
      }
      return { type: "res", id: req.id, ok: true, payload: { config } };
    }

    case "config.update": {
      const params = req.params as { updates: Record<string, string> } | undefined;
      const updates = params?.updates;
      if (!updates || typeof updates !== "object") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing updates" } };
      }
      for (const key of Object.keys(updates)) {
        if (!SAFE_UPDATE_KEYS.has(key)) {
          return { type: "res", id: req.id, ok: false, error: { code: "forbidden", message: `不允许修改配置项: ${key}` } };
        }
      }

      const { envPath, envLocalPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      const currentConfig: Record<string, string> = {};
      await ctx.readEnvFileIntoConfig(envPath, currentConfig);
      await ctx.readEnvFileIntoConfig(envLocalPath, currentConfig);

      const mergedConfig = { ...currentConfig, ...updates };
      const effectiveAuthMode = String(
        mergedConfig.BELLDANDY_AUTH_MODE
        ?? (ctx.auth.mode === "token" ? "token" : ctx.auth.mode === "password" ? "password" : "none"),
      ).trim().toLowerCase();
      const communityApiEnabled = String(mergedConfig.BELLDANDY_COMMUNITY_API_ENABLED ?? "false").trim().toLowerCase() === "true";
      if (communityApiEnabled && effectiveAuthMode === "none") {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "community_api_requires_auth",
            message: "BELLDANDY_COMMUNITY_API_ENABLED=true cannot be used with BELLDANDY_AUTH_MODE=none",
          },
        };
      }

      const envUpdates: Record<string, string> = {};
      const localUpdates: Record<string, string> = {};
      for (const key of Object.keys(updates)) {
        if (key === "BELLDANDY_EXTRA_WORKSPACE_ROOTS") {
          envUpdates[key] = updates[key];
        } else {
          localUpdates[key] = updates[key];
        }
      }

      const envOk = await ctx.updateEnvFile(envPath, envUpdates);
      const localOk = await ctx.updateEnvFile(envLocalPath, localUpdates);
      if (!envOk || !localOk) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: "Failed to write config files" } };
      }

      if (Object.prototype.hasOwnProperty.call(updates, "BELLDANDY_MODEL_PREFERRED_PROVIDERS")) {
        const preferredProviderIds = normalizePreferredProviderIds(updates.BELLDANDY_MODEL_PREFERRED_PROVIDERS);
        ctx.preferredProviderIds.splice(0, ctx.preferredProviderIds.length, ...preferredProviderIds);
      }

      return { type: "res", id: req.id, ok: true };
    }

    case "channel.reply_chunking.get": {
      return { type: "res", id: req.id, ok: true, payload: getChannelReplyChunkingConfigContent(ctx.stateDir) };
    }

    case "channel.reply_chunking.update": {
      const params = asRecord(req.params);
      const content = typeof params.content === "string" ? params.content : "";
      try {
        const config = parseChannelReplyChunkingConfigContent(content);
        await writeChannelReplyChunkingConfig(ctx.stateDir, config);
        return { type: "res", id: req.id, ok: true, payload: getChannelReplyChunkingConfigContent(ctx.stateDir) };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_channel_reply_chunking_config",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "channel.security.get": {
      return { type: "res", id: req.id, ok: true, payload: getChannelSecurityConfigContent(ctx.stateDir) };
    }

    case "channel.security.update": {
      const params = asRecord(req.params);
      const content = typeof params.content === "string" ? params.content : "";
      try {
        const config = parseChannelSecurityConfigContent(content);
        await writeChannelSecurityConfig(ctx.stateDir, config);
        return { type: "res", id: req.id, ok: true, payload: getChannelSecurityConfigContent(ctx.stateDir) };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "invalid_channel_security_config",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "channel.security.pending.list": {
      const store = await readChannelSecurityApprovalStore(ctx.stateDir);
      return { type: "res", id: req.id, ok: true, payload: { pending: store.pending } };
    }

    case "channel.security.approve": {
      const params = asRecord(req.params);
      const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
      if (!requestId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "requestId is required" } };
      }
      try {
        const approved = await approveChannelSecurityApprovalRequest(ctx.stateDir, requestId);
        return {
          type: "res",
          id: req.id,
          ok: true,
          payload: {
            request: approved.request,
            config: approved.config,
            content: getChannelSecurityConfigContent(ctx.stateDir).content,
          },
        };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "channel_security_approve_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "channel.security.reject": {
      const params = asRecord(req.params);
      const requestId = typeof params.requestId === "string" ? params.requestId.trim() : "";
      if (!requestId) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "requestId is required" } };
      }
      try {
        const rejected = await rejectChannelSecurityApprovalRequest(ctx.stateDir, requestId);
        return { type: "res", id: req.id, ok: true, payload: { request: rejected } };
      } catch (error) {
        return {
          type: "res",
          id: req.id,
          ok: false,
          error: {
            code: "channel_security_reject_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    case "config.readRaw": {
      const { envPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      try {
        const stat = await ctx.statIfExists(envPath);
        if (!stat?.isFile()) {
          return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: ".env 文件不存在" } };
        }
        const content = await fsp.readFile(envPath, "utf-8");
        return { type: "res", id: req.id, ok: true, payload: { content } };
      } catch (error) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(error) } };
      }
    }

    case "config.writeRaw": {
      const content = (req.params as { content?: unknown } | undefined)?.content;
      if (typeof content !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing content" } };
      }
      const { envPath } = resolveEnvFilePaths({ envDir: ctx.envDir });
      try {
        await ctx.writeTextFileAtomic(envPath, content, { ensureParent: true });
        return { type: "res", id: req.id, ok: true };
      } catch (error) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: String(error) } };
      }
    }

    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
