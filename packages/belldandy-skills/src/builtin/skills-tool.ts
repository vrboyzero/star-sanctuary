/**
 * Skills 管理工具 — 供 Agent 在对话中发现和查询可用技能
 *
 * skills_list: 列出所有 skills（含 eligibility 状态）
 * skills_search: 按关键词搜索，返回匹配 skill 的完整 instructions
 * skill_get: 按精确名称读取单个 skill，并在当前 task 存在时自动记录 usage
 */

import crypto from "node:crypto";
import { getGlobalMemoryManager } from "@belldandy/memory";
import type { Tool, ToolCallResult, JsonObject, ToolContext } from "../types.js";
import type { SkillRegistry } from "../skill-registry.js";

function findSkillByName(registry: SkillRegistry, name: string) {
  const direct = registry.getSkill(name);
  if (direct) return direct;

  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  return registry.listSkills().find((skill) => skill.name.trim().toLowerCase() === normalized);
}

function tryRecordSkillUsage(skillName: string, context: ToolContext) {
  try {
    const manager = getGlobalMemoryManager();
    const task = manager?.getTaskByConversation(context.conversationId);
    if (manager && task) {
      manager.recordSkillUsage(task.id, skillName, { usedVia: "tool" });
    }
  } catch {
    // usage 记录失败不影响 skill 正常读取
  }
}

/**
 * 创建 skills_list 工具（需要 SkillRegistry 实例）
 */
export function createSkillsListTool(registry: SkillRegistry): Tool {
  return {
    definition: {
      name: "skills_list",
      description: "列出所有可用的技能（Skills）。技能是预定义的操作指南，教你如何使用工具完成特定任务。可按 filter 和 tag 过滤。",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "过滤条件：all=全部, eligible=仅可用, ineligible=仅不可用",
            enum: ["all", "eligible", "ineligible"],
          },
          tag: {
            type: "string",
            description: "按标签过滤（如 typescript, devops）",
          },
        },
      },
    },
    async execute(args: JsonObject): Promise<ToolCallResult> {
      const start = Date.now();
      const id = crypto.randomUUID();
      const name = "skills_list";

      const filter = (args.filter as string) || "all";
      const tag = args.tag as string | undefined;

      let skills = registry.listSkills();

      // 按 eligibility 过滤
      if (filter === "eligible") {
        skills = skills.filter(s => {
          const r = registry.getEligibilityResult(s.name);
          return r ? r.eligible : true;
        });
      } else if (filter === "ineligible") {
        skills = skills.filter(s => {
          const r = registry.getEligibilityResult(s.name);
          return r ? !r.eligible : false;
        });
      }

      // 按 tag 过滤
      if (tag) {
        const t = tag.toLowerCase();
        skills = skills.filter(s => s.tags?.some(st => st.toLowerCase() === t));
      }

      if (skills.length === 0) {
        return {
          id, name, success: true,
          output: "没有找到匹配的技能。",
          durationMs: Date.now() - start,
        };
      }

      const lines = skills.map(s => {
        const eligResult = registry.getEligibilityResult(s.name);
        const eligible = eligResult ? eligResult.eligible : true;
        const status = eligible ? "✓" : "✗";
        const reasons = (!eligible && eligResult?.reasons.length)
          ? ` (${eligResult.reasons.join(", ")})`
          : "";
        const tags = s.tags?.length ? ` [${s.tags.join(", ")}]` : "";
        const src = s.source.type;
        return `${status} ${s.name} (${src})${tags} — ${s.description}${reasons}`;
      });

      return {
        id, name, success: true,
        output: `共 ${skills.length} 个技能:\n\n${lines.join("\n")}`,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * 创建 skills_search 工具（需要 SkillRegistry 实例）
 */
export function createSkillsSearchTool(registry: SkillRegistry): Tool {
  return {
    definition: {
      name: "skills_search",
      description: "搜索技能库，按关键词匹配技能名称、描述、标签和指令内容。返回匹配技能的完整操作指南。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词",
          },
        },
        required: ["query"],
      },
    },
    async execute(args: JsonObject): Promise<ToolCallResult> {
      const start = Date.now();
      const id = crypto.randomUUID();
      const name = "skills_search";

      const query = args.query as string;
      if (!query) {
        return {
          id, name, success: false,
          output: "", error: "缺少 query 参数",
          durationMs: Date.now() - start,
        };
      }

      const results = registry.searchSkills(query);

      if (results.length === 0) {
        return {
          id, name, success: true,
          output: `未找到与 "${query}" 相关的技能。`,
          durationMs: Date.now() - start,
        };
      }

      // 最多返回 3 个完整结果，避免输出过长
      const MAX_RESULTS = 3;
      const shown = results.slice(0, MAX_RESULTS);
      const lines: string[] = [];

      for (const skill of shown) {
        const tags = skill.tags?.length ? ` [${skill.tags.join(", ")}]` : "";
        lines.push(`## ${skill.name}${tags}`);
        lines.push(`> ${skill.description}`);
        lines.push("");
        lines.push(skill.instructions);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      if (results.length > MAX_RESULTS) {
        lines.push(`（还有 ${results.length - MAX_RESULTS} 个匹配结果未显示，请缩小搜索范围）`);
      }

      lines.push("");
      lines.push("如果你决定采用其中某个 skill，优先调用 `skill_get` 精确打开该技能；该入口会在当前 task 存在时自动记录 usage。");
      lines.push("若是通过其他非标准入口实际采用了 skill，再调用 `experience_usage_record` 补记 usage；仅搜索不应记录为已使用。");

      return {
        id, name, success: true,
        output: lines.join("\n"),
        durationMs: Date.now() - start,
      };
    },
  };
}

export function createSkillGetTool(registry: SkillRegistry): Tool {
  return {
    definition: {
      name: "skill_get",
      description: "按精确名称读取单个 skill 的完整操作指南。适合在已经决定采用某个 skill 后调用；当前对话存在 task 时会自动记录 usage。",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "技能名称（建议直接使用 skills_search / skills_list 返回的原始名称）",
          },
        },
        required: ["name"],
      },
    },
    async execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
      const start = Date.now();
      const id = crypto.randomUUID();
      const name = "skill_get";

      const requestedName = String(args.name ?? "").trim();
      if (!requestedName) {
        return {
          id, name, success: false,
          output: "", error: "缺少 name 参数",
          durationMs: Date.now() - start,
        };
      }

      const skill = findSkillByName(registry, requestedName);
      if (!skill) {
        return {
          id, name, success: true,
          output: `未找到技能 "${requestedName}"。请先用 skills_search 或 skills_list 确认名称。`,
          durationMs: Date.now() - start,
        };
      }

      tryRecordSkillUsage(skill.name, context);

      const tags = skill.tags?.length ? ` [${skill.tags.join(", ")}]` : "";
      const lines = [
        `## ${skill.name}${tags}`,
        `> ${skill.description}`,
        "",
        `- source: ${skill.source.type}`,
        `- priority: ${skill.priority}`,
        "",
        skill.instructions,
      ];

      return {
        id, name, success: true,
        output: lines.join("\n"),
        durationMs: Date.now() - start,
      };
    },
  };
}
