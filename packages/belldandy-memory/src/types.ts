/** 记忆块 */
export type MemoryType = "core" | "daily" | "session" | "other";

export interface MemoryChunk {
  id: string;
  sourcePath: string;
  sourceType: "file" | "session" | "manual"; // 来源类型
  memoryType: MemoryType; // 记忆类型：长期/短期/其他
  content: string;
  startLine?: number;
  endLine?: number;
  channel?: string;   // 来源渠道: webchat/feishu/heartbeat/cron/...
  topic?: string;     // 话题标签（可选）
  tsDate?: string;    // 日期 YYYY-MM-DD
  metadata?: Record<string, any>;
}

/** 检索过滤条件 */
export interface MemorySearchFilter {
  memoryType?: MemoryType | MemoryType[];
  channel?: string;
  topic?: string;
  dateFrom?: string;  // YYYY-MM-DD
  dateTo?: string;    // YYYY-MM-DD
}

/** 检索选项（传给 MemoryManager.search） */
export interface MemorySearchOptions {
  limit?: number;
  filter?: MemorySearchFilter;
}

/** 检索结果 */
export interface MemorySearchResult {
  id: string;
  sourcePath: string;
  sourceType: string;
  memoryType?: MemoryType;
  content?: string;
  snippet: string;
  summary?: string;       // L0 摘要（由 LLM 生成的单句概括）
  score: number;
  metadata?: Record<string, any>;
  startLine?: number;
  endLine?: number;
}

/** 索引状态 */
export type MemoryIndexStatus = {
  files: number;
  chunks: number;
  lastIndexedAt?: string;
  vectorIndexed?: number;
  vectorCached?: number;
  summarized?: number;
  summaryPending?: number;
};

export class AuthenticationError extends Error { }
export class RateLimitError extends Error { }
