import { MemoryStore } from "./store.js";
import { MemoryIndexer, type IndexerOptions } from "./indexer.js";
import { ResultReranker, type RerankerOptions } from "./reranker.js";
import { OpenAIEmbeddingProvider } from "./embeddings/openai.js";
import { LocalEmbeddingProvider } from "./embeddings/local-provider.js";
import type { EmbeddingProvider } from "./embeddings/index.js"; // [NEW] Correct import
import type { MemorySearchResult, MemoryIndexStatus, MemorySearchOptions, MemorySearchFilter } from "./types.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";

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
    workspaceRoot: string; // Restore this
    storePath?: string;    // Restore this
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
    provider?: "openai" | "local";
    localModel?: string;
    modelsDir?: string; // [NEW] Allow configuring models directory
    indexerOptions?: IndexerOptions;
    embeddingBatchSize?: number;
    rerankerOptions?: RerankerOptions;
}

export class MemoryManager {
    private store: MemoryStore;
    private indexer: MemoryIndexer;
    private reranker: ResultReranker;
    private embeddingProvider: EmbeddingProvider; // Renamed from embeddingModel
    private workspaceRoot: string;
    private embeddingBatchSize: number;

    constructor(options: MemoryManagerOptions) {
        this.workspaceRoot = options.workspaceRoot;

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
    }

    /**
     * Index files in the workspace
     */
    async indexWorkspace(): Promise<void> {
        await this.indexer.indexDirectory(this.workspaceRoot);
        await this.processPendingEmbeddings();

        // Start watching for changes
        await this.indexer.startWatching(this.workspaceRoot);
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

        return reranked.slice(0, limit);
    }

    /**
     * Get recent memory chunks (by updated_at, no embedding needed)
     */
    getRecent(limit = 5): MemorySearchResult[] {
        return this.store.getRecentChunks(limit);
    }

    /**
     * Process chunks that lack embeddings
     */
    private async processPendingEmbeddings(): Promise<void> {
        // Fetch pending chunks
        // First, check if we have dimensions known. If not, we might need to embed one to find out.
        let dims = 1536; // Default fallback for OpenAI text-embedding-3-small
        try {
            // Probe the model to get actual dimensions
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

        // Loop until no more pending chunks
        while (true) {
            const pending = this.store.getUnembeddedChunks(this.embeddingBatchSize);
            if (pending.length === 0) break;

            console.log(`[MemoryManager] Processing ${pending.length} chunks for embedding...`);

            // Simplify content for embedding (remove excessive newlines)
            const texts = pending.map(c => c.content.replace(/\n+/g, " ").slice(0, 8000));

            try {
                const vectors = await this.embeddingProvider.embedBatch(texts);

                for (let i = 0; i < pending.length; i++) {
                    const chunk = pending[i];
                    const vec = vectors[i];
                    if (vec) {
                        this.store.upsertChunkVector(chunk.id, vec, "openai"); // TODO: Update vector source if local?
                    }
                }
            } catch (err) {
                console.error("Failed to batch embed:", err);
                break;
            }
        }
    }

    getStatus(): MemoryIndexStatus {
        const basic = this.store.getStatus();
        const vec = this.store.getVectorStatus();
        return {
            ...basic,
            vectorIndexed: vec.indexed,
            vectorCached: vec.cached
        };
    }

    close(): void {
        this.indexer.stopWatching().catch(console.error);
        this.store.close();
    }
}
