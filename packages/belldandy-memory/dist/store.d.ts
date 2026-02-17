import type { MemoryChunk, MemorySearchResult, MemoryIndexStatus } from "./types.js";
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
    searchKeyword(query: string, limit?: number): MemorySearchResult[];
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
    /** 关闭数据库连接 */
    close(): void;
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
     */
    searchVector(queryVec: EmbeddingVector, limit?: number): MemorySearchResult[];
    /**
     * 混合搜索：结合关键词（BM25）和向量（语义）搜索
     */
    searchHybrid(query: string, queryVec: EmbeddingVector | null, options?: {
        limit?: number;
        vectorWeight?: number;
        textWeight?: number;
    }): MemorySearchResult[];
    /**
     * 获取向量索引状态
     */
    getVectorStatus(): {
        indexed: number;
        cached: number;
        model?: string;
    };
    private ensureOpen;
}
//# sourceMappingURL=store.d.ts.map