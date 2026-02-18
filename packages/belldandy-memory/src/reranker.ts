/**
 * Phase M-3: 规则重排序 (Rule-based Reranker)
 *
 * 零成本纯计算重排，基于以下信号：
 * - memory_type 权重（core > daily > session > other）
 * - 时间衰减（越新越相关）
 * - 来源多样性惩罚（同一文件的多个 chunk 降权）
 */

import type { MemorySearchResult, MemoryType } from "./types.js";

export interface RerankerOptions {
  /** core/daily/session/other 的权重乘数 */
  memoryTypeWeights?: Partial<Record<MemoryType, number>>;
  /** 时间衰减半衰期（天数），0 表示不衰减 */
  recencyHalfLifeDays?: number;
  /** 同源惩罚系数（0-1），0 表示不惩罚 */
  diversityPenalty?: number;
}

const DEFAULT_TYPE_WEIGHTS: Record<MemoryType, number> = {
  core: 1.3,
  daily: 1.0,
  session: 0.9,
  other: 0.8,
};

const DEFAULT_HALF_LIFE_DAYS = 30;
const DEFAULT_DIVERSITY_PENALTY = 0.15;

export class ResultReranker {
  private typeWeights: Record<MemoryType, number>;
  private halfLifeDays: number;
  private diversityPenalty: number;

  constructor(options: RerankerOptions = {}) {
    this.typeWeights = { ...DEFAULT_TYPE_WEIGHTS, ...options.memoryTypeWeights };
    this.halfLifeDays = options.recencyHalfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
    this.diversityPenalty = options.diversityPenalty ?? DEFAULT_DIVERSITY_PENALTY;
  }

  /**
   * 对搜索结果进行规则重排序。
   * 不修改原数组，返回新的排序后数组。
   */
  rerank(results: MemorySearchResult[]): MemorySearchResult[] {
    if (results.length <= 1) return results;

    const now = Date.now();
    const sourceCount = new Map<string, number>();

    // 先按原始 score 降序排列，确保 diversity penalty 按排名顺序应用
    const sorted = [...results].sort((a, b) => b.score - a.score);

    const reranked = sorted.map((result) => {
      let adjustedScore = result.score;

      // 1. Memory type boost
      const mt = result.memoryType ?? "other";
      adjustedScore *= this.typeWeights[mt] ?? 1.0;

      // 2. Recency decay（指数衰减）
      if (this.halfLifeDays > 0) {
        adjustedScore *= this.computeRecencyFactor(result, now);
      }

      // 3. Diversity penalty（同源降权）
      const source = result.sourcePath;
      const seen = sourceCount.get(source) ?? 0;
      if (seen > 0) {
        // 每多出现一次，额外乘以 (1 - penalty)
        adjustedScore *= Math.pow(1 - this.diversityPenalty, seen);
      }
      sourceCount.set(source, seen + 1);

      return { ...result, score: adjustedScore };
    });

    return reranked.sort((a, b) => b.score - a.score);
  }

  private computeRecencyFactor(result: MemorySearchResult, now: number): number {
    // 尝试从 metadata 中获取日期
    const dateStr = (result.metadata as any)?.ts_date
      || (result.metadata as any)?.file_mtime;

    if (!dateStr) return 1.0; // 无日期信息，不衰减

    try {
      const date = new Date(dateStr);
      const ageDays = (now - date.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays <= 0) return 1.0;

      // 指数衰减：score * 0.5^(age / halfLife)
      // 但不低于 0.3，避免旧记忆被完全压制
      return Math.max(0.3, Math.pow(0.5, ageDays / this.halfLifeDays));
    } catch {
      return 1.0;
    }
  }
}
