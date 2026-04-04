import type { JsonObject } from "@belldandy/protocol";

/**
 * Webhook 规则配置
 */
export interface WebhookRule {
  /** Webhook ID（唯一标识） */
  id: string;
  /** 是否启用 */
  enabled: boolean;
  /** Bearer token（用于鉴权） */
  token: string;
  /** 默认使用的 Agent ID */
  defaultAgentId?: string;
  /** 会话 ID 前缀（默认: webhook:<id>） */
  conversationIdPrefix?: string;
  /** Prompt 模板（用于将 payload 转换为文本，默认: JSON.stringify） */
  promptTemplate?: string;
}

/**
 * Webhook 配置文件结构
 */
export interface WebhookConfig {
  version: number;
  webhooks: WebhookRule[];
}

/**
 * Webhook 请求参数
 */
export interface WebhookRequestParams {
  /** 消息文本（可选，为空时由 payload 模板生成） */
  text?: string;
  /** Agent ID（可选，不传则使用 webhook 默认 agent） */
  agentId?: string;
  /** 会话 ID（可选，不传则自动生成） */
  conversationId?: string;
  /** 任意 JSON payload */
  payload?: JsonObject;
}

/**
 * Webhook 响应结果
 */
export interface WebhookResponse {
  ok: boolean;
  payload?: {
    webhookId: string;
    conversationId: string;
    runId?: string;
    response: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Webhook Logger 接口
 */
export interface WebhookLogger {
  debug?: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}
