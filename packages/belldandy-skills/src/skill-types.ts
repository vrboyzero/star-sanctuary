/**
 * Skill 系统类型定义
 *
 * Skill 是纯 prompt 注入——告诉 Agent 如何使用已有工具/MCP 服务来完成特定任务。
 * 与 Tool（代码执行）互补：Tool 是"手和脚"，Skill 是"经验和套路"。
 */

/** Skill 准入条件 */
export type SkillEligibility = {
  /** 环境变量需存在且非空 */
  env?: string[];
  /** PATH 上需存在的可执行文件 */
  bin?: string[];
  /** 需在线的 MCP 服务器名称 */
  mcp?: string[];
  /** 需已注册的 tool 名称 */
  tools?: string[];
  /** workspace 中需存在的文件（相对路径） */
  files?: string[];
};

/** Skill 注入优先级 */
export type SkillPriority = "low" | "normal" | "high" | "always";

/** Skill 来源标识 */
export type SkillSource =
  | { type: "bundled" }
  | { type: "user"; path: string }
  | { type: "plugin"; pluginId: string };

/** Skill 完整定义 */
export type SkillDefinition = {
  /** 唯一名称（同 source 内唯一） */
  name: string;
  /** 简短描述 */
  description: string;
  /** 版本号 */
  version?: string;
  /** 分类标签 */
  tags?: string[];
  /** 注入优先级（默认 normal） */
  priority: SkillPriority;
  /** 准入条件 */
  eligibility?: SkillEligibility;
  /** Markdown 指令内容（frontmatter 之后的全部内容） */
  instructions: string;
  /** 来源 */
  source: SkillSource;
};

/** Eligibility 检查上下文 */
export type EligibilityContext = {
  /** 当前已注册的 tool 名称列表 */
  registeredTools: string[];
  /** 当前已连接的 MCP 服务器名称列表 */
  activeMcpServers: string[];
  /** workspace 根目录 */
  workspaceRoot: string;
};

/** Eligibility 检查结果 */
export type EligibilityResult = {
  eligible: boolean;
  /** 不满足的原因列表（eligible=true 时为空数组） */
  reasons: string[];
};
