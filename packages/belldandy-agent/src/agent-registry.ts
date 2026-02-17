/**
 * Agent Registry — 多 Agent 注册表
 *
 * 支持按 agentId 创建不同配置的 Agent，并缓存实例以保持 FailoverClient cooldown 状态。
 */

import type { AgentProfile } from "./agent-profile.js";
import type { BelldandyAgent } from "./index.js";

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Agent 工厂函数签名：接收 profile，返回配置好的 Agent 实例
 */
export type AgentFactoryFn = (profile: AgentProfile) => BelldandyAgent;

// ─── AgentRegistry ───────────────────────────────────────────────────────

export class AgentRegistry {
  private profiles = new Map<string, AgentProfile>();
  private instances = new Map<string, BelldandyAgent>();
  private factoryFn: AgentFactoryFn;

  constructor(factoryFn: AgentFactoryFn) {
    this.factoryFn = factoryFn;
  }

  /**
   * 注册一个 Agent Profile。如果 id 已存在则覆盖，并清除缓存实例。
   */
  register(profile: AgentProfile): void {
    this.profiles.set(profile.id, profile);
    this.instances.delete(profile.id);
  }

  /**
   * 按 agentId 获取或创建 Agent 实例（缓存复用）。
   * - 无参数或 undefined → 使用 "default" profile
   * - 找不到对应 profile → 抛出错误
   */
  create(agentId?: string): BelldandyAgent {
    const id = agentId ?? "default";
    const profile = this.profiles.get(id);
    if (!profile) {
      throw new Error(`AgentProfile not found: "${id}". Available: [${[...this.profiles.keys()].join(", ")}]`);
    }

    const cached = this.instances.get(id);
    if (cached) return cached;

    const instance = this.factoryFn(profile);
    this.instances.set(id, instance);
    return instance;
  }

  /**
   * 获取指定 profile（不创建实例）
   */
  getProfile(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  /**
   * 列出所有已注册的 profile
   */
  list(): AgentProfile[] {
    return [...this.profiles.values()];
  }

  /**
   * 是否存在指定 profile
   */
  has(agentId: string): boolean {
    return this.profiles.has(agentId);
  }

  /**
   * 清除指定 agentId 的缓存实例（下次 create 时重建）
   */
  clearInstance(agentId: string): void {
    this.instances.delete(agentId);
  }

  /**
   * 清除所有缓存实例
   */
  clearAllInstances(): void {
    this.instances.clear();
  }
}
