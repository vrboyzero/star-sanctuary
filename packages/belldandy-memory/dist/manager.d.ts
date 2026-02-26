import { type IndexerOptions } from "./indexer.js";
import { type RerankerOptions } from "./reranker.js";
import type { MemorySearchResult, MemoryIndexStatus, MemorySearchOptions } from "./types.js";
/**
 * Register a MemoryManager instance as the global shared instance.
 * Called by Gateway during startup.
 */
export declare function registerGlobalMemoryManager(manager: MemoryManager): void;
/**
 * Get the globally registered MemoryManager instance.
 * Returns null if no instance has been registered.
 */
export declare function getGlobalMemoryManager(): MemoryManager | null;
export interface MemoryManagerOptions {
    workspaceRoot: string;
    /** Additional directories to index alongside workspaceRoot */
    additionalRoots?: string[];
    storePath?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
    provider?: "openai" | "local";
    localModel?: string;
    modelsDir?: string;
    indexerOptions?: IndexerOptions;
    embeddingBatchSize?: number;
    rerankerOptions?: RerankerOptions;
    /** L0 摘要层配置 */
    summaryEnabled?: boolean;
    summaryModel?: string;
    summaryBaseUrl?: string;
    summaryApiKey?: string;
    summaryBatchSize?: number;
    summaryMinContentLength?: number;
    /** M-N3: 会话记忆自动提取配置 */
    evolutionEnabled?: boolean;
    evolutionModel?: string;
    evolutionBaseUrl?: string;
    evolutionApiKey?: string;
    evolutionMinMessages?: number;
    /** stateDir 用于定位 memory/ 目录写入每日文件 */
    stateDir?: string;
    /** Task-aware Embedding 前缀（用于支持 task 参数的模型如 Jina/BGE） */
    embeddingQueryPrefix?: string;
    embeddingPassagePrefix?: string;
    /** M-N4: 源路径聚合检索 */
    deepRetrievalEnabled?: boolean;
}
export declare class MemoryManager {
    private store;
    private indexer;
    private reranker;
    private embeddingProvider;
    private workspaceRoot;
    private additionalRoots;
    private embeddingBatchSize;
    private _paused;
    private _pauseResolve;
    private _summaryRunning;
    private summaryEnabled;
    private summaryModel;
    private summaryBaseUrl;
    private summaryApiKey;
    private summaryBatchSize;
    private summaryMinContentLength;
    private evolutionEnabled;
    private evolutionModel;
    private evolutionBaseUrl;
    private evolutionApiKey;
    private evolutionMinMessages;
    private stateDir;
    /** 用于 embedding 缓存 key / 签名版本化（task-aware embedding） */
    private embeddingQueryPrefix;
    private embeddingPassagePrefix;
    private deepRetrievalEnabled;
    constructor(options: MemoryManagerOptions);
    /**
     * Index files in the workspace
     */
    indexWorkspace(): Promise<void>;
    /**
     * Search memory (Hybrid)
     */
    search(query: string, limitOrOptions?: number | MemorySearchOptions): Promise<MemorySearchResult[]>;
    /**
     * Get recent memory chunks (by updated_at, no embedding needed)
     */
    getRecent(limit?: number): MemorySearchResult[];
    private computeEmbeddingSignature;
    private ensureEmbeddingSignature;
    /**
     * Process chunks that lack embeddings (with cache support)
     */
    private processPendingEmbeddings;
    /**
     * M-N4: 源路径聚合二次检索。
     * 当第一轮结果中某个 source 出现 ≥2 次时，拉取该 source 的全部 chunk 补充上下文。
     */
    private applyDeepRetrieval;
    getStatus(): MemoryIndexStatus;
    /**
     * L0 摘要生成：扫描未摘要的长 chunk，批量调用 LLM 生成单句摘要。
     * 异步后台执行，不阻塞主流程。支持 pause/resume 协作式让步。
     */
    generateSummaries(): Promise<number>;
    /**
     * 调用 LLM 生成单条 chunk 的摘要
     */
    private callLLMForSummary;
    /**
     * 从会话消息中提取长期记忆。
     * 由 agent_end hook 调用。
     * @returns 提取并写入的记忆条数
     */
    extractMemoriesFromConversation(sessionKey: string, messages: Array<{
        role: string;
        content: string;
    }>): Promise<number>;
    /** 检查 session 是否已提取过记忆 */
    isSessionMemoryExtracted(sessionKey: string): boolean;
    /**
     * 调用 LLM 从对话中提取记忆
     */
    private callLLMForExtraction;
    /**
     * 暂停后台 LLM 任务（摘要生成等）。
     * 由 before_agent_start hook 调用，避免与 Agent 主请求争抢 API 并发。
     */
    pause(): void;
    /**
     * 恢复后台 LLM 任务。
     * 由 agent_end hook 调用。
     */
    resume(): void;
    get isPaused(): boolean;
    /**
     * 等待暂停结束。在后台循环中调用，实现协作式让步。
     */
    private waitIfPaused;
    /**
     * 空闲时执行摘要生成。
     * 由 gateway 的空闲定时器调用，仅在无活跃 Agent 请求时运行。
     * 返回本次生成的摘要数。
     */
    runIdleSummaries(): Promise<number>;
    close(): void;
}
//# sourceMappingURL=manager.d.ts.map