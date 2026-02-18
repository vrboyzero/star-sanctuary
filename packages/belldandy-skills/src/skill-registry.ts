/**
 * Skill 注册表
 *
 * 汇总三个来源的 skills：bundled / user / plugin
 * 提供统一的发现、查询、eligibility 过滤 API。
 */

import type { SkillDefinition, EligibilityContext, EligibilityResult } from "./skill-types.js";
import { loadSkillsFromDir } from "./skill-loader.js";
import { checkEligibilityBatch } from "./skill-eligibility.js";

/** 内部存储键：source:name */
function makeKey(skill: SkillDefinition): string {
  return `${skill.source.type}:${skill.name}`;
}

export class SkillRegistry {
  /** 所有已加载的 skills（key = source:name） */
  private skills = new Map<string, SkillDefinition>();

  /** 最近一次 eligibility 检查结果缓存 */
  private eligibilityCache = new Map<string, EligibilityResult>();

  // ========================================================================
  // 加载
  // ========================================================================

  /** 加载内置 skills（随项目发布） */
  async loadBundledSkills(dir: string): Promise<number> {
    const loaded = await loadSkillsFromDir(dir, { type: "bundled" });
    for (const skill of loaded) {
      this.skills.set(makeKey(skill), skill);
    }
    return loaded.length;
  }

  /** 加载用户 skills（~/.belldandy/skills/） */
  async loadUserSkills(dir: string): Promise<number> {
    const loaded = await loadSkillsFromDir(dir, { type: "user", path: dir });
    for (const skill of loaded) {
      this.skills.set(makeKey(skill), skill);
    }
    return loaded.length;
  }

  /** 加载插件附带的 skills */
  async loadPluginSkills(dirs: Map<string, string>): Promise<number> {
    let count = 0;
    for (const [pluginId, dir] of dirs) {
      const loaded = await loadSkillsFromDir(dir, { type: "plugin", pluginId });
      for (const skill of loaded) {
        this.skills.set(makeKey(skill), skill);
      }
      count += loaded.length;
    }
    return count;
  }

  // ========================================================================
  // 查询
  // ========================================================================

  /** 列出所有已加载的 skills */
  listSkills(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  /**
   * 按名称获取 skill
   * 优先级：user > plugin > bundled
   */
  getSkill(name: string): SkillDefinition | undefined {
    // 按优先级查找
    for (const sourceType of ["user", "plugin", "bundled"] as const) {
      for (const skill of this.skills.values()) {
        if (skill.name === name && skill.source.type === sourceType) {
          return skill;
        }
      }
    }
    return undefined;
  }

  /** 获取已加载的 skill 数量 */
  get size(): number {
    return this.skills.size;
  }

  // ========================================================================
  // Eligibility
  // ========================================================================

  /**
   * 执行 eligibility 检查并缓存结果
   */
  async refreshEligibility(ctx: EligibilityContext): Promise<void> {
    const all = this.listSkills();
    const results = await checkEligibilityBatch(all, ctx);
    this.eligibilityCache = results;
  }

  /** 获取所有通过 eligibility 检查的 skills */
  getEligibleSkills(): SkillDefinition[] {
    return this.listSkills().filter(s => {
      const result = this.eligibilityCache.get(s.name);
      return result ? result.eligible : true; // 未检查的默认 eligible
    });
  }

  /** 获取某个 skill 的 eligibility 结果 */
  getEligibilityResult(name: string): EligibilityResult | undefined {
    return this.eligibilityCache.get(name);
  }

  /**
   * 获取需要直接注入 system prompt 的 skills
   * 规则：eligible + priority 为 always 或 high
   */
  getPromptSkills(): SkillDefinition[] {
    return this.getEligibleSkills().filter(
      s => s.priority === "always" || s.priority === "high",
    );
  }

  /**
   * 获取可通过 skills_search 按需发现的 skills（eligible 但不直接注入）
   */
  getSearchableSkills(): SkillDefinition[] {
    return this.getEligibleSkills().filter(
      s => s.priority !== "always" && s.priority !== "high",
    );
  }

  /**
   * 搜索 skills（按关键词匹配 name / description / tags / instructions）
   */
  searchSkills(query: string): SkillDefinition[] {
    const q = query.toLowerCase();
    // 空格分词（帮英文多词查询），过滤空串
    const tokens = q.split(/\s+/).filter(t => t.length > 0);
    const eligible = this.getEligibleSkills();

    /** 双向包含：field.includes(q) || q.includes(field) */
    const biMatch = (field: string, keyword: string): boolean =>
      field.includes(keyword) || keyword.includes(field);

    const scoreOne = (skill: SkillDefinition, keyword: string): number => {
      let s = 0;
      if (biMatch(skill.name.toLowerCase(), keyword)) s += 10;
      if (biMatch(skill.description.toLowerCase(), keyword)) s += 5;
      if (skill.tags?.some(t => biMatch(t.toLowerCase(), keyword))) s += 8;
      if (skill.instructions.toLowerCase().includes(keyword)) s += 2;
      return s;
    };

    return eligible
      .map(skill => {
        let score = scoreOne(skill, q);
        // 分词后每个 token 单独匹配，累加得分
        if (tokens.length > 1) {
          for (const token of tokens) {
            score += scoreOne(skill, token);
          }
        }
        return { skill, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.skill);
  }
}
