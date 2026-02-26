/** 记忆块 */
export type MemoryType = "core" | "daily" | "session" | "other";

/** 内容语义分类（P1-6） */
export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "experience" | "other";

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
  category?: MemoryCategory; // 内容语义分类
  agentId?: string;   // Agent ID（用于多 Agent 记忆隔离）
  metadata?: Record<string, any>;
}

/** 检索过滤条件 */
export interface MemorySearchFilter {
  memoryType?: MemoryType | MemoryType[];
  channel?: string;
  topic?: string;
  dateFrom?: string;  // YYYY-MM-DD
  dateTo?: string;    // YYYY-MM-DD
  category?: MemoryCategory | MemoryCategory[];
  agentId?: string | null;  // Agent ID 过滤（null 表示查询全局记忆）
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
