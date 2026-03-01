import type { WebhookResponse } from "./types.js";

/**
 * 幂等性记录
 */
interface IdempotencyRecord {
  timestamp: number;
  response: WebhookResponse;
}

/**
 * 幂等性管理器（内存缓存）
 */
export class IdempotencyManager {
  private cache = new Map<string, IdempotencyRecord>();
  private windowMs: number;

  constructor(windowMs: number = 10 * 60 * 1000) {
    this.windowMs = windowMs;
    // 定期清理过期记录（每分钟）
    setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * 检查是否为重复请求
   */
  isDuplicate(webhookId: string, idempotencyKey: string): boolean {
    const key = this.makeKey(webhookId, idempotencyKey);
    const record = this.cache.get(key);

    if (!record) {
      return false;
    }

    // 检查是否在时间窗口内
    const age = Date.now() - record.timestamp;
    if (age > this.windowMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 获取缓存的响应
   */
  getCachedResponse(webhookId: string, idempotencyKey: string): WebhookResponse | null {
    const key = this.makeKey(webhookId, idempotencyKey);
    const record = this.cache.get(key);

    if (!record) {
      return null;
    }

    // 检查是否在时间窗口内
    const age = Date.now() - record.timestamp;
    if (age > this.windowMs) {
      this.cache.delete(key);
      return null;
    }

    return record.response;
  }

  /**
   * 缓存响应
   */
  cacheResponse(webhookId: string, idempotencyKey: string, response: WebhookResponse): void {
    const key = this.makeKey(webhookId, idempotencyKey);
    this.cache.set(key, {
      timestamp: Date.now(),
      response,
    });
  }

  /**
   * 清理过期记录
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, record] of this.cache.entries()) {
      const age = now - record.timestamp;
      if (age > this.windowMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 生成缓存键
   */
  private makeKey(webhookId: string, idempotencyKey: string): string {
    return `${webhookId}:${idempotencyKey}`;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; windowMs: number } {
    return {
      size: this.cache.size,
      windowMs: this.windowMs,
    };
  }
}
