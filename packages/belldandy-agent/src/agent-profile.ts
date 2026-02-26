/**
 * Agent Profile 配置体系
 *
 * 为多 Agent 预备的配置层。每个 AgentProfile 描述一个 Agent 的完整配置，
 * 通过 `model` 字段引用 models.json 中的 ModelProfile（避免重复存储密钥）。
 */

import fs from "node:fs";

import type { ModelProfile } from "./failover-client.js";

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Agent Profile：描述一个可配置的 Agent 人格/能力集
 */
export type AgentProfile = {
  /** 唯一标识（如 "default", "coder", "researcher"） */
  id: string;
  /** 显示名称（用于日志和 UI） */
  displayName: string;
  /**
   * 模型引用：
   * - "primary" → 使用环境变量配置（BELLDANDY_OPENAI_*）
   * - 其他字符串 → 引用 models.json 中 ModelProfile.name 匹配的条目
   */
  model: string;
  /** 追加到系统提示词末尾的额外内容 */
  systemPromptOverride?: string;
  /** @deprecated 使用 workspaceDir 替代。指向不同的 SOUL 文件（如 "SOUL-coder.md"） */
  soulFile?: string;
  /** Agent 专属 workspace 目录名（位于 ~/.belldandy/agents/{workspaceDir}/），默认等于 id */
  workspaceDir?: string;
  /** 是否启用工具（覆盖环境变量 BELLDANDY_TOOLS_ENABLED） */
  toolsEnabled?: boolean;
  /** 可用工具白名单（仅这些工具对该 Agent 可用） */
  toolWhitelist?: string[];
  /** 最大输入 token 数覆盖 */
  maxInputTokens?: number;
  /** 单次模型调用最大输出 token 数覆盖（调大可避免长输出被截断导致工具调用 JSON 损坏） */
  maxOutputTokens?: number;
};

/**
 * agents.json 文件结构
 */
export type AgentConfigFile = {
  agents: AgentProfile[];
};

// ─── Functions ───────────────────────────────────────────────────────────

/**
 * 构建隐式的 "default" profile（始终存在，映射到环境变量配置）
 */
export function buildDefaultProfile(): AgentProfile {
  return {
    id: "default",
    displayName: "Belldandy",
    model: "primary",
  };
}

/**
 * 从 agents.json 加载 Agent Profile 列表。
 * 文件不存在或解析失败时静默返回空数组。
 */
export async function loadAgentProfiles(filePath: string): Promise<AgentProfile[]> {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;

    if (!data || typeof data !== "object") return [];

    const file = data as Record<string, unknown>;
    const agents = file.agents;
    if (!Array.isArray(agents)) return [];

    const valid: AgentProfile[] = [];
    for (const entry of agents) {
      if (!entry || typeof entry !== "object") continue;
      const obj = entry as Record<string, unknown>;

      // id 和 model 为必填
      if (typeof obj.id !== "string" || !obj.id.trim()) continue;
      if (typeof obj.model !== "string" || !obj.model.trim()) continue;

      valid.push({
        id: obj.id.trim(),
        displayName: typeof obj.displayName === "string" ? obj.displayName : obj.id.trim(),
        model: obj.model.trim(),
        systemPromptOverride: typeof obj.systemPromptOverride === "string" ? obj.systemPromptOverride : undefined,
        soulFile: typeof obj.soulFile === "string" ? obj.soulFile : undefined,
        workspaceDir: typeof obj.workspaceDir === "string" && obj.workspaceDir.trim() ? obj.workspaceDir.trim() : undefined,
        toolsEnabled: typeof obj.toolsEnabled === "boolean" ? obj.toolsEnabled : undefined,
        toolWhitelist: Array.isArray(obj.toolWhitelist) ? obj.toolWhitelist.filter((s): s is string => typeof s === "string") : undefined,
        maxInputTokens: typeof obj.maxInputTokens === "number" && obj.maxInputTokens > 0 ? obj.maxInputTokens : undefined,
        maxOutputTokens: typeof obj.maxOutputTokens === "number" && obj.maxOutputTokens > 0 ? obj.maxOutputTokens : undefined,
      });
    }

    return valid;
  } catch {
    // 文件不存在或解析失败，静默返回空数组
    return [];
  }
}

/**
 * 将 AgentProfile 的 model 引用解析为实际的模型配置。
 *
 * @param modelRef - AgentProfile.model 字段值
 * @param primaryConfig - 环境变量配置（baseUrl/apiKey/model）
 * @param fallbacks - models.json 中加载的 ModelProfile 列表
 * @returns 解析后的模型配置，找不到时 fallback 到 primary
 */
export function resolveModelConfig(
  modelRef: string,
  primaryConfig: { baseUrl: string; apiKey: string; model: string },
  fallbacks: ModelProfile[],
): { baseUrl: string; apiKey: string; model: string; protocol?: string; source: "primary" | "named" } {
  if (modelRef === "primary") {
    return { ...primaryConfig, source: "primary" };
  }

  // 在 fallbacks 中按 id 查找
  const found = fallbacks.find((f) => f.id === modelRef);
  if (found) {
    return {
      baseUrl: found.baseUrl,
      apiKey: found.apiKey,
      model: found.model,
      protocol: found.protocol,
      source: "named",
    };
  }

  // 找不到，fallback 到 primary
  return { ...primaryConfig, source: "primary" };
}
