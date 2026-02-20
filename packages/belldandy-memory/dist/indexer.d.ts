import { MemoryStore } from "./store.js";
import { type ChunkOptions } from "./chunker.js";
export interface IndexerOptions {
    extensions?: string[];
    chunkOptions?: ChunkOptions;
    ignorePatterns?: string[];
    watch?: boolean;
    watchDebounceMs?: number;
}
export declare class MemoryIndexer {
    private store;
    private chunker;
    private options;
    private watcher;
    constructor(store: MemoryStore, options?: IndexerOptions);
    /** 索引指定目录（递归） */
    indexDirectory(dirPath: string): Promise<void>;
    /** 索引单个文件 */
    indexFile(filePath: string): Promise<void>;
    /** 停止监听 */
    stopWatching(): Promise<void>;
    /** 启动目录监听（支持单目录或多目录） */
    startWatching(dirPaths: string | string[]): Promise<void>;
}
//# sourceMappingURL=indexer.d.ts.map