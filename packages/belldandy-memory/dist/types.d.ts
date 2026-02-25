/** 记忆块 */
export type MemoryType = "core" | "daily" | "session" | "other";
/** 内容语义分类（P1-6） */
export type MemoryCategory = "preference" | "fact" | "decision" | "entity" | "experience" | "other";
export interface MemoryChunk {
    id: string;
    sourcePath: string;
    sourceType: "file" | "session" | "manual";
    memoryType: MemoryType;
    content: string;
    startLine?: number;
    endLine?: number;
    channel?: string;
    topic?: string;
    tsDate?: string;
    category?: MemoryCategory;
    metadata?: Record<string, any>;
}
/** 检索过滤条件 */
export interface MemorySearchFilter {
    memoryType?: MemoryType | MemoryType[];
    channel?: string;
    topic?: string;
    dateFrom?: string;
    dateTo?: string;
    category?: MemoryCategory | MemoryCategory[];
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
    summary?: string;
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
export declare class AuthenticationError extends Error {
}
export declare class RateLimitError extends Error {
}
//# sourceMappingURL=types.d.ts.map