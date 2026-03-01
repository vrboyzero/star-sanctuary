import type { WebhookRule } from "./types.js";

/**
 * 验证 Bearer token
 */
export function verifyWebhookToken(rule: WebhookRule, authHeader: string | undefined): boolean {
  if (!authHeader || typeof authHeader !== "string") {
    return false;
  }

  if (!authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return false;
  }

  // 使用恒定时间比较防止时序攻击
  return timingSafeEqual(token, rule.token);
}

/**
 * 恒定时间字符串比较（防止时序攻击）
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
