import fs from "node:fs";
import path from "node:path";
import type { WebhookConfig, WebhookRule, WebhookLogger } from "./types.js";

/**
 * 加载 Webhook 配置文件
 */
export function loadWebhookConfig(configPath: string, logger?: WebhookLogger): WebhookConfig {
  const fallback: WebhookConfig = { version: 1, webhooks: [] };

  try {
    if (!fs.existsSync(configPath)) {
      logger?.info(`Webhook config not found: ${configPath}, using empty config`);
      return fallback;
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      logger?.warn(`Invalid webhook config format: ${configPath}`);
      return fallback;
    }

    const obj = parsed as Record<string, unknown>;
    const webhooksRaw = Array.isArray(obj.webhooks) ? obj.webhooks : [];
    const webhooks: WebhookRule[] = [];

    for (const item of webhooksRaw) {
      if (!item || typeof item !== "object") continue;
      const ruleObj = item as Record<string, unknown>;

      const id = typeof ruleObj.id === "string" ? ruleObj.id.trim() : "";
      if (!id) {
        logger?.warn("Skipping webhook rule with missing id");
        continue;
      }

      const token = typeof ruleObj.token === "string" ? ruleObj.token.trim() : "";
      if (!token) {
        logger?.warn(`Skipping webhook rule "${id}" with missing token`);
        continue;
      }

      webhooks.push({
        id,
        enabled: typeof ruleObj.enabled === "boolean" ? ruleObj.enabled : true,
        token,
        defaultAgentId: typeof ruleObj.defaultAgentId === "string" ? ruleObj.defaultAgentId.trim() || undefined : undefined,
        conversationIdPrefix: typeof ruleObj.conversationIdPrefix === "string" ? ruleObj.conversationIdPrefix.trim() || undefined : undefined,
        promptTemplate: typeof ruleObj.promptTemplate === "string" ? ruleObj.promptTemplate.trim() || undefined : undefined,
      });
    }

    logger?.info(`Loaded ${webhooks.length} webhook rule(s) from ${configPath}`);
    return { version: 1, webhooks };
  } catch (err) {
    logger?.error(`Failed to load webhook config: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

/**
 * 根据 ID 查找 Webhook 规则
 */
export function findWebhookRule(config: WebhookConfig, webhookId: string): WebhookRule | null {
  return config.webhooks.find(w => w.id === webhookId) ?? null;
}

/**
 * 生成会话 ID
 */
export function generateConversationId(rule: WebhookRule): string {
  const prefix = rule.conversationIdPrefix ?? `webhook:${rule.id}`;
  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `${prefix}:${timestamp}`;
}

/**
 * 根据 payload 生成 prompt 文本
 */
export function generatePromptFromPayload(rule: WebhookRule, payload?: Record<string, unknown>): string {
  if (!payload) return "";

  // 如果有自定义模板，使用模板（简单的变量替换）
  if (rule.promptTemplate) {
    let result = rule.promptTemplate;
    for (const [key, value] of Object.entries(payload)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
    }
    return result;
  }

  // 默认：格式化 JSON
  return JSON.stringify(payload, null, 2);
}
