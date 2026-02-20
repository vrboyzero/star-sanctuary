import { MemoryStore } from "./store.js";
import { MemoryIndexer, type IndexerOptions } from "./indexer.js";
import { ResultReranker, type RerankerOptions } from "./reranker.js";
import { OpenAIEmbeddingProvider } from "./embeddings/openai.js";
import { LocalEmbeddingProvider } from "./embeddings/local-provider.js";
import type { EmbeddingProvider } from "./embeddings/index.js";
import type { MemorySearchResult, MemoryIndexStatus, MemorySearchOptions, MemorySearchFilter } from "./types.js";
import { appendToTodayMemory } from "./memory-files.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

// ============================================================================
// Global Registry - Allows sharing MemoryManager across packages
// ============================================================================

let globalMemoryManager: MemoryManager | null = null;

/**
 * Register a MemoryManager instance as the global shared instance.
 * Called by Gateway during startup.
 */
export function registerGlobalMemoryManager(manager: MemoryManager): void {
    globalMemoryManager = manager;
    console.log("[MemoryManager] Registered as global instance");
}

/**
 * Get the globally registered MemoryManager instance.
 * Returns null if no instance has been registered.
 */
export function getGlobalMemoryManager(): MemoryManager | null {
    return globalMemoryManager;
}


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
    summaryModel?: string;       // 摘要生成用的模型（默认继承 openaiModel）
    summaryBaseUrl?: string;     // 摘要 API base URL（默认继承 openaiBaseUrl）
    summaryApiKey?: string;      // 摘要 API key（默认继承 openaiApiKey）
    summaryBatchSize?: number;   // 每批处理的 chunk 数（默认 5）
    summaryMinContentLength?: number; // 触发摘要的最小内容长度（默认 500）
    /** M-N3: 会话记忆自动提取配置 */
    evolutionEnabled?: boolean;
    evolutionModel?: string;       // 提取用的模型（默认继承 openaiModel）
    evolutionBaseUrl?: string;     // 提取 API base URL（默认继承 openaiBaseUrl）
    evolutionApiKey?: string;      // 提取 API key（默认继承 openaiApiKey）
    evolutionMinMessages?: number; // 触发提取的最少消息数（默认 4）
    /** stateDir 用于定位 memory/ 目录写入每日文件 */
    stateDir?: string;
    /** M-N4: 源路径聚合检索 */
    deepRetrievalEnabled?: boolean;
}

export class MemoryManager {
    private store: MemoryStore;
    private indexer: MemoryIndexer;
    private reranker: ResultReranker;
    private embeddingProvider: EmbeddingProvider;
    private workspaceRoot: string;
    private additionalRoots: string[];
    private embeddingBatchSize: number;
    // 后台任务暂停控制（Agent 活跃时暂停，避免抢占 API 并发）
    private _paused = false;
    private _pauseResolve: (() => void) | null = null;
    private _summaryRunning = false;
    // L0 摘要层
    private summaryEnabled: boolean;
    private summaryModel: string;
    private summaryBaseUrl: string;
    private summaryApiKey: string;
    private summaryBatchSize: number;
    private summaryMinContentLength: number;
    // M-N3: 会话记忆自动提取
    private evolutionEnabled: boolean;
    private evolutionModel: string;
    private evolutionBaseUrl: string;
    private evolutionApiKey: string;
    private evolutionMinMessages: number;
    private stateDir: string;
    // M-N4: 源路径聚合检索
    private deepRetrievalEnabled: boolean;

    constructor(options: MemoryManagerOptions) {
        this.workspaceRoot = options.workspaceRoot;
        this.additionalRoots = options.additionalRoots ?? [];

        // Default store path: .belldandy/memory.sqlite
        const defaultStorePath = path.join(options.workspaceRoot, ".belldandy", "memory.sqlite");
        const storePath = options.storePath || defaultStorePath;

        // Ensure dir exists synchronously
        try {
            const dir = path.dirname(storePath);
            mkdirSync(dir, { recursive: true });
        } catch (err) {
            console.warn("Failed to create memory directory:", err);
        }

        this.store = new MemoryStore(storePath);

        // Initialize Embedding Provider
        if (options.provider === "local") {
            const modelName = options.localModel || "BAAI/bge-m3";
            const modelsDir = options.modelsDir || path.join(this.workspaceRoot, ".belldandy", "models");
            this.embeddingProvider = new LocalEmbeddingProvider(modelName, modelsDir);
            console.log(`[MemoryManager] Using Local Embedding Provider (${modelName})`);
        } else {
            // Default to OpenAI
            this.embeddingProvider = new OpenAIEmbeddingProvider({
                apiKey: options.openaiApiKey,
                baseURL: options.openaiBaseUrl,
                model: options.openaiModel
            });
            console.log(`[MemoryManager] Using OpenAI Embedding Provider (${options.openaiModel || "text-embedding-3-small"})`);
        }

        this.indexer = new MemoryIndexer(this.store, options.indexerOptions);
        this.reranker = new ResultReranker(options.rerankerOptions);
        this.embeddingBatchSize = options.embeddingBatchSize || 10;

        // L0 摘要层配置
        this.summaryEnabled = options.summaryEnabled ?? false;
        this.summaryModel = options.summaryModel || options.openaiModel || "";
        this.summaryBaseUrl = options.summaryBaseUrl || options.openaiBaseUrl || "";
        this.summaryApiKey = options.summaryApiKey || options.openaiApiKey || "";
        this.summaryBatchSize = options.summaryBatchSize ?? 5;
        this.summaryMinContentLength = options.summaryMinContentLength ?? 500;

        // M-N3: 会话记忆自动提取配置
        this.evolutionEnabled = options.evolutionEnabled ?? false;
        this.evolutionModel = options.evolutionModel || options.openaiModel || "";
        this.evolutionBaseUrl = options.evolutionBaseUrl || options.openaiBaseUrl || "";
        this.evolutionApiKey = options.evolutionApiKey || options.openaiApiKey || "";
        this.evolutionMinMessages = options.evolutionMinMessages ?? 4;
        this.stateDir = options.stateDir || path.join(os.homedir(), ".belldandy");
        this.deepRetrievalEnabled = options.deepRetrievalEnabled ?? false;
    }

    /**
     * Index files in the workspace
     */
    async indexWorkspace(): Promise<void> {
        // Index primary workspace root
        await this.indexer.indexDirectory(this.workspaceRoot);

        // Index additional roots (e.g. workspace memory files)
        for (const root of this.additionalRoots) {
            try {
                await this.indexer.indexDirectory(root);
            } catch (err) {
                console.warn(`[MemoryManager] Failed to index additional root ${root}:`, err);
            }
        }

        await this.processPendingEmbeddings();

        // L0 摘要不再在启动时自动运行，改由 gateway 空闲定时器触发（runIdleSummaries）

        // Watch all directories for changes
        const allRoots = [this.workspaceRoot, ...this.additionalRoots];
        await this.indexer.startWatching(allRoots);
    }

    /**
     * Search memory (Hybrid)
     */
    async search(query: string, limitOrOptions?: number | MemorySearchOptions): Promise<MemorySearchResult[]> {
        // 兼容旧签名 search(query, limit) 和新签名 search(query, options)
        let limit = 5;
        let filter: MemorySearchFilter | undefined;

        if (typeof limitOrOptions === "number") {
            limit = limitOrOptions;
        } else if (limitOrOptions) {
            limit = limitOrOptions.limit ?? 5;
            filter = limitOrOptions.filter;
        }

        // 1. Embed query
        let queryVec: number[] | null = null;
        try {
            queryVec = await this.embeddingProvider.embed(query);
        } catch (err) {
            console.warn("Embedding failed, falling back to keyword search only", err);
        }

        // 2. Hybrid search with filter
        const rawResults = this.store.searchHybrid(query, queryVec, { limit: limit * 2, filter });

        // 3. Rule-based rerank
        const reranked = this.reranker.rerank(rawResults);

        // 4. M-N4: 源路径聚合二次检索（仅当启用且有重复 source 时触发）
        if (this.deepRetrievalEnabled) {
            return this.applyDeepRetrieval(reranked, limit);
        }

        return reranked.slice(0, limit);
    }

    /**
     * Get recent memory chunks (by updated_at, no embedding needed)
     */
    getRecent(limit = 5): MemorySearchResult[] {
        return this.store.getRecentChunks(limit);
    }

    /**
     * Process chunks that lack embeddings (with cache support)
     */
    private async processPendingEmbeddings(): Promise<void> {
        // Probe the model to get actual dimensions
        let dims = 1536;
        try {
            const probe = await this.embeddingProvider.embed("ping");
            if (probe && probe.length > 0) {
                dims = probe.length;
            }
        } catch (e) {
            console.warn("Failed to probe embedding model, skipping vector generation", e);
            return;
        }

        // Initialize vector table (this ensures vecDims is set in store)
        this.store.prepareVectorStore(dims);

        const providerName = this.embeddingProvider.modelName ?? "unknown";

        // Loop until no more pending chunks
        while (true) {
            const pending = this.store.getUnembeddedChunks(this.embeddingBatchSize);
            if (pending.length === 0) break;

            // Normalize content for embedding and compute content hashes
            const normalized = pending.map(c => c.content.replace(/\n+/g, " ").slice(0, 8000));
            const hashes = normalized.map(t => createHash("sha256").update(t).digest("hex"));

            // Separate cached vs uncached
            const needEmbed: { idx: number; text: string }[] = [];
            const cachedVectors: (number[] | null)[] = new Array(pending.length).fill(null);

            for (let i = 0; i < pending.length; i++) {
                const cached = this.store.getCachedEmbedding(hashes[i]);
                if (cached) {
                    cachedVectors[i] = cached;
                } else {
                    needEmbed.push({ idx: i, text: normalized[i] });
                }
            }

            const cacheHits = pending.length - needEmbed.length;
            if (cacheHits > 0) {
                console.log(`[MemoryManager] Embedding cache: ${cacheHits} hits, ${needEmbed.length} misses`);
            }

            // Store cached vectors immediately
            for (let i = 0; i < pending.length; i++) {
                if (cachedVectors[i]) {
                    this.store.upsertChunkVector(pending[i].id, cachedVectors[i]!, providerName);
                }
            }

            // Embed uncached texts via API
            if (needEmbed.length > 0) {
                console.log(`[MemoryManager] Embedding ${needEmbed.length} chunks via API...`);
                try {
                    const texts = needEmbed.map(e => e.text);
                    const vectors = await this.embeddingProvider.embedBatch(texts);

                    for (let j = 0; j < needEmbed.length; j++) {
                        const { idx } = needEmbed[j];
                        const vec = vectors[j];
                        if (vec) {
                            this.store.upsertChunkVector(pending[idx].id, vec, providerName);
                            this.store.cacheEmbedding(hashes[idx], vec, providerName);
                        }
                    }
                } catch (err) {
                    console.error("Failed to batch embed:", err);
                    break;
                }
            }
        }
    }

    /**
     * M-N4: 源路径聚合二次检索。
     * 当第一轮结果中某个 source 出现 ≥2 次时，拉取该 source 的全部 chunk 补充上下文。
     */
    private applyDeepRetrieval(firstRound: MemorySearchResult[], limit: number): MemorySearchResult[] {
        // 按 source_path 分组统计
        const sourceGroups = new Map<string, { count: number; totalScore: number }>();
        for (const r of firstRound) {
            const existing = sourceGroups.get(r.sourcePath);
            if (existing) {
                existing.count++;
                existing.totalScore += r.score;
            } else {
                sourceGroups.set(r.sourcePath, { count: 1, totalScore: r.score });
            }
        }

        // 找出出现 ≥2 次的 source（触发条件）
        const hotSources: Array<{ path: string; aggScore: number }> = [];
        for (const [sourcePath, { count, totalScore }] of sourceGroups) {
            if (count >= 2) {
                // 聚合分数：avg(score) * log(count + 1)
                const aggScore = (totalScore / count) * Math.log(count + 1);
                hotSources.push({ path: sourcePath, aggScore });
            }
        }

        // 无热点 source → 直接返回第一轮结果
        if (hotSources.length === 0) {
            return firstRound.slice(0, limit);
        }

        // 选出 Top-3 高分 source
        hotSources.sort((a, b) => b.aggScore - a.aggScore);
        const topSources = hotSources.slice(0, 3);

        // 第二轮：拉取 Top source 的全部 chunk
        const existingIds = new Set(firstRound.map(r => r.id));
        const supplementary: MemorySearchResult[] = [];

        for (const { path: sourcePath, aggScore } of topSources) {
            const chunks = this.store.getChunksBySource(sourcePath, 10);
            for (const chunk of chunks) {
                if (!existingIds.has(chunk.id)) {
                    // 赋予补充 chunk 一个基于聚合分数的衰减分数
                    supplementary.push({ ...chunk, score: aggScore * 0.5 });
                    existingIds.add(chunk.id);
                }
            }
        }

        // 合并第一轮 + 补充结果，按 score 降序排序
        const merged = [...firstRound, ...supplementary]
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        return merged;
    }

    getStatus(): MemoryIndexStatus {
        const basic = this.store.getStatus();
        const vec = this.store.getVectorStatus();
        const summary = this.store.getSummaryStatus();
        return {
            ...basic,
            vectorIndexed: vec.indexed,
            vectorCached: vec.cached,
            summarized: summary.summarized,
            summaryPending: summary.pending,
        };
    }

    /**
     * L0 摘要生成：扫描未摘要的长 chunk，批量调用 LLM 生成单句摘要。
     * 异步后台执行，不阻塞主流程。支持 pause/resume 协作式让步。
     */
    async generateSummaries(): Promise<number> {
        if (!this.summaryEnabled || !this.summaryApiKey || !this.summaryModel) {
            return 0;
        }

        let totalGenerated = 0;

        while (true) {
            // 协作式让步：Agent 活跃时暂停
            await this.waitIfPaused();

            const chunks = this.store.getChunksNeedingSummary(
                this.summaryMinContentLength,
                this.summaryBatchSize
            );
            if (chunks.length === 0) break;

            console.log(`[MemoryManager] Generating summaries for ${chunks.length} chunks...`);

            for (const chunk of chunks) {
                // 每个 chunk 前再检查一次暂停状态
                await this.waitIfPaused();

                try {
                    const summary = await this.callLLMForSummary(chunk.content);
                    if (summary) {
                        // 粗略估算 token 数（中文约 1.5 字/token，英文约 0.75 词/token）
                        const estimatedTokens = Math.ceil(summary.length / 2);
                        this.store.updateChunkSummary(chunk.id, summary, estimatedTokens);
                        totalGenerated++;
                    }
                } catch (err) {
                    console.error(`[MemoryManager] Failed to generate summary for chunk ${chunk.id}:`, err);
                    // 单个失败不中断整批
                }

                // 每次 LLM 调用后延迟 2s，避免打满 API 速率限制
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (totalGenerated > 0) {
            console.log(`[MemoryManager] Generated ${totalGenerated} summaries`);
        }
        return totalGenerated;
    }

    /**
     * 调用 LLM 生成单条 chunk 的摘要
     */
    private async callLLMForSummary(content: string): Promise<string | null> {
        const truncated = content.length > 4000 ? content.slice(0, 4000) + "..." : content;

        const response = await fetch(`${this.summaryBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.summaryApiKey}`,
            },
            body: JSON.stringify({
                model: this.summaryModel,
                messages: [
                    {
                        role: "system",
                        content: "你是一个精确的文本摘要助手。请用一到两句话概括以下内容的核心要点。摘要应保留关键信息（人名、技术术语、数字、结论），便于快速判断是否需要阅读全文。只输出摘要，不要任何前缀或解释。"
                    },
                    {
                        role: "user",
                        content: truncated
                    }
                ],
                max_tokens: 150,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Summary LLM call failed: ${response.status} ${text.slice(0, 200)}`);
        }

        const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const result = data.choices?.[0]?.message?.content?.trim();
        return result || null;
    }

    // ========== M-N3: 会话记忆自动提取 ==========

    /**
     * 从会话消息中提取长期记忆。
     * 由 agent_end hook 调用。
     * @returns 提取并写入的记忆条数
     */
    async extractMemoriesFromConversation(
        sessionKey: string,
        messages: Array<{ role: string; content: string }>,
    ): Promise<number> {
        if (!this.evolutionEnabled) return 0;
        if (messages.length < this.evolutionMinMessages) return 0;

        // 防重复：检查是否已提取过
        if (this.store.isSessionMemoryExtracted(sessionKey)) {
            return 0;
        }

        // 构建对话文本
        const conversationText = messages
            .map(m => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
            .join("\n\n");

        // 截断过长的对话（保留最近的部分）
        const maxLen = 8000;
        const truncated = conversationText.length > maxLen
            ? "...\n\n" + conversationText.slice(-maxLen)
            : conversationText;

        try {
            // 调用 LLM 提取记忆
            const extracted = await this.callLLMForExtraction(truncated);
            if (!extracted || extracted.length === 0) {
                // 无值得记住的内容，仍标记为已处理
                this.store.markSessionMemoryExtracted(sessionKey);
                return 0;
            }

            // 去重：检查每条记忆是否已存在相似内容
            const newMemories: Array<{ type: string; content: string }> = [];
            for (const item of extracted) {
                const similar = await this.search(item.content, { limit: 1 });
                if (similar.length > 0 && similar[0].score > 0.85) {
                    continue; // 已有相似记忆，跳过
                }
                newMemories.push(item);
            }

            if (newMemories.length === 0) {
                this.store.markSessionMemoryExtracted(sessionKey);
                return 0;
            }

            // 写入每日记忆文件
            const lines = newMemories.map(m =>
                `- [${m.type}] ${m.content} (来源: ${sessionKey})`
            );
            const content = lines.join("\n");
            await appendToTodayMemory(this.stateDir, content);

            // 标记已提取
            this.store.markSessionMemoryExtracted(sessionKey);

            console.log(`[MemoryManager] Extracted ${newMemories.length} memories from session ${sessionKey}`);
            return newMemories.length;
        } catch (err) {
            console.error(`[MemoryManager] Memory extraction failed for session ${sessionKey}:`, err);
            return 0;
        }
    }

    /** 检查 session 是否已提取过记忆 */
    isSessionMemoryExtracted(sessionKey: string): boolean {
        return this.store.isSessionMemoryExtracted(sessionKey);
    }

    /**
     * 调用 LLM 从对话中提取记忆
     */
    private async callLLMForExtraction(
        conversationText: string,
    ): Promise<Array<{ type: string; content: string }> | null> {
        const response = await fetch(`${this.evolutionBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.evolutionApiKey}`,
            },
            body: JSON.stringify({
                model: this.evolutionModel,
                messages: [
                    {
                        role: "system",
                        content: `分析以下对话，提取值得长期记住的信息。分为两类：
- 【偏好】：用户表达的喜好、习惯、工作方式、技术栈偏好等
- 【经验】：解决问题的有效方法、踩过的坑、有用的工具/命令等

仅提取有长期价值的信息，忽略临时性的对话内容。
每条记忆用一句话概括。
返回 JSON 数组，格式：[{"type":"偏好","content":"..."},{"type":"经验","content":"..."}]
如果没有值得记住的内容，返回空数组 []。
只输出 JSON，不要其他内容。`
                    },
                    {
                        role: "user",
                        content: conversationText
                    }
                ],
                max_tokens: 500,
                temperature: 0.3,
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Evolution LLM call failed: ${response.status} ${text.slice(0, 200)}`);
        }

        const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const raw = data.choices?.[0]?.message?.content?.trim();
        if (!raw) return null;

        try {
            // 提取 JSON（兼容 markdown code block 包裹）
            const jsonStr = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
            const parsed = JSON.parse(jsonStr);
            if (!Array.isArray(parsed)) return null;
            return parsed.filter(
                (item: any) => item && typeof item.type === "string" && typeof item.content === "string"
            );
        } catch {
            console.warn("[MemoryManager] Failed to parse extraction result:", raw.slice(0, 200));
            return null;
        }
    }

    // ========== 后台任务暂停/恢复 ==========

    /**
     * 暂停后台 LLM 任务（摘要生成等）。
     * 由 before_agent_start hook 调用，避免与 Agent 主请求争抢 API 并发。
     */
    pause(): void {
        this._paused = true;
    }

    /**
     * 恢复后台 LLM 任务。
     * 由 agent_end hook 调用。
     */
    resume(): void {
        this._paused = false;
        if (this._pauseResolve) {
            this._pauseResolve();
            this._pauseResolve = null;
        }
    }

    get isPaused(): boolean {
        return this._paused;
    }

    /**
     * 等待暂停结束。在后台循环中调用，实现协作式让步。
     */
    private waitIfPaused(): Promise<void> {
        if (!this._paused) return Promise.resolve();
        console.log("[MemoryManager] Background task paused (agent active)");
        return new Promise<void>(resolve => {
            this._pauseResolve = resolve;
        });
    }

    /**
     * 空闲时执行摘要生成。
     * 由 gateway 的空闲定时器调用，仅在无活跃 Agent 请求时运行。
     * 返回本次生成的摘要数。
     */
    async runIdleSummaries(): Promise<number> {
        if (!this.summaryEnabled || this._paused || this._summaryRunning) return 0;
        this._summaryRunning = true;
        try {
            return await this.generateSummaries();
        } finally {
            this._summaryRunning = false;
        }
    }

    close(): void {
        this.indexer.stopWatching().catch(console.error);
        this.store.close();
    }
}
