import type { MemoryChunk, MemorySearchResult, MemoryIndexStatus, MemorySearchFilter } from "./types.js";
import { type EmbeddingVector } from "./embeddings/index.js";
export declare class MemoryStore {
    private db;
    private closed;
    private vecDims;
    /** 当前 SQLite 是否支持 FTS5（better-sqlite3 默认编译 FTS5） */
    private hasFts5;
    constructor(dbPath: string);
    /** 插入或更新 chunk */
    upsertChunk(chunk: MemoryChunk): void;
    /** 按来源路径删除 chunks */
    deleteBySource(sourcePath: string): number;
    /** 删除所有 chunks */
    deleteAll(): number;
    /** 关键词搜索（有 FTS5 用全文索引，否则用 LIKE 降级） */
    searchKeyword(query: string, limit?: number, filter?: MemorySearchFilter): MemorySearchResult[];
    /** 获取文件元数据（用于增量检查） */
    getFileMetadata(sourcePath: string): {
        updatedAt: string;
        metadata?: any;
    } | null;
    /** 获取最近更新的记忆块（按 updated_at 降序） */
    getRecentChunks(limit?: number): MemorySearchResult[];
    /** 获取索引状态 */
    getStatus(): MemoryIndexStatus;
    /** 更新最后索引时间 */
    updateLastIndexedAt(): void;
    /** 检查 session 是否已提取过记忆 */
    isSessionMemoryExtracted(sessionKey: string): boolean;
    /** 标记 session 已提取记忆 */
    markSessionMemoryExtracted(sessionKey: string): void;
    /** 关闭数据库连接 */
    /**
     * 按 source_path 拉取该来源的所有 chunk，按 start_line 排序。
     * @param maxPerSource 每个 source 最多返回的 chunk 数
     */
    getChunksBySource(sourcePath: string, maxPerSource?: number): MemorySearchResult[];
    close(): void;
    /**
     * 存量数据回填：从 source_path / metadata 推断 channel / ts_date。
     * 仅对 ts_date IS NULL 的行执行，幂等安全。
     */
    private backfillMetadataColumns;
    /**
     * 构建 filter 的 WHERE 子句片段和参数。
     * 返回 { clause: "AND ...", params: [...] }，clause 为空字符串表示无过滤。
     */
    private buildFilterClause;
    /**
     * 初始化/准备向量表
     */
    prepareVectorStore(dimensions: number): void;
    /**
     * 获取未向量化的 chunks
     */
    getUnembeddedChunks(limit?: number): MemoryChunk[];
    private ensureVectorTable;
    /**
     * 存储 chunk 的 embedding 向量
     */
    upsertChunkVector(chunkId: string, embedding: EmbeddingVector, model: string): void;
    /**
     * 获取 chunk 的 embedding 向量
     */
    getChunkVector(chunkId: string): EmbeddingVector | null;
    /**
     * 缓存 embedding（按内容 hash）
     */
    cacheEmbedding(contentHash: string, embedding: EmbeddingVector, model: string): void;
    /**
     * 从缓存获取 embedding
     */
    getCachedEmbedding(contentHash: string): EmbeddingVector | null;
    /**
     * 向量搜索：返回与查询向量最相似的 chunks
     * filter 通过 post-filter 实现（chunks_vec 无 metadata 列）
     */
    searchVector(queryVec: EmbeddingVector, limit?: number, filter?: MemorySearchFilter): MemorySearchResult[];
    /**
     * 混合搜索：结合关键词（BM25）和向量（语义）搜索
     */
    searchHybrid(query: string, queryVec: EmbeddingVector | null, options?: {
        limit?: number;
        vectorWeight?: number;
        textWeight?: number;
        filter?: MemorySearchFilter;
    }): MemorySearchResult[];
    /**
     * 获取向量索引状态
     */
    getVectorStatus(): {
        indexed: number;
        cached: number;
        model?: string;
    };
    /**
     * 获取需要生成摘要的 chunks（summary IS NULL 且内容足够长）
     */
    getChunksNeedingSummary(minContentLength?: number, limit?: number): Array<{
        id: string;
        content: string;
    }>;
    /**
     * 更新 chunk 的摘要
     */
    updateChunkSummary(chunkId: string, summary: string, summaryTokens?: number): void;
    /**
     * 获取摘要统计
     */
    getSummaryStatus(): {
        total: number;
        summarized: number;
        pending: number;
    };
    getMeta(key: string): string | null;
    setMeta(key: string, value: string): void;
    clearEmbeddingCache(): void;
    clearVectorIndex(): void;
    /**
     * 兼容老库：如果 chunks 与 chunks_fts 数量不一致，则执行一次 rebuild。
     * 这能修复"FTS 表后加但未 rebuild 导致的关键词检索失效"以及"部分数据未被索引"的问题。
     */
    private ensureFtsRebuiltIfNeeded;
    /** 从现有 chunks_vec 表读取维度（启动时自动恢复 vecDims） */
    private initVecDimsFromExistingTable;
    private ensureOpen;
}
//# sourceMappingURL=store.d.ts.map