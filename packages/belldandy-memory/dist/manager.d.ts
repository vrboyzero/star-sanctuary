import { type IndexerOptions } from "./indexer.js";
import type { MemorySearchResult, MemoryIndexStatus } from "./types.js";
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
    storePath?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
    provider?: "openai" | "local";
    localModel?: string;
    modelsDir?: string;
    indexerOptions?: IndexerOptions;
    embeddingBatchSize?: number;
}
export declare class MemoryManager {
    private store;
    private indexer;
    private embeddingProvider;
    private workspaceRoot;
    private embeddingBatchSize;
    constructor(options: MemoryManagerOptions);
    /**
     * Index files in the workspace
     */
    indexWorkspace(): Promise<void>;
    /**
     * Search memory (Hybrid)
     */
    search(query: string, limit?: number): Promise<MemorySearchResult[]>;
    /**
     * Get recent memory chunks (by updated_at, no embedding needed)
     */
    getRecent(limit?: number): MemorySearchResult[];
    /**
     * Process chunks that lack embeddings
     */
    private processPendingEmbeddings;
    getStatus(): MemoryIndexStatus;
    close(): void;
}
//# sourceMappingURL=manager.d.ts.map