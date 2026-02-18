/**
 * Skills 管理工具 — 供 Agent 在对话中发现和查询可用技能
 *
 * skills_list: 列出所有 skills（含 eligibility 状态）
 * skills_search: 按关键词搜索，返回匹配 skill 的完整 instructions
 */

import crypto from "node:crypto";
import type { Tool, ToolCallResult, JsonObject } from "../types.js";
import type { SkillRegistry } from "../skill-registry.js";

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

      return {
        id, name, success: true,
        output: lines.join("\n"),
        durationMs: Date.now() - start,
      };
    },
  };
}
