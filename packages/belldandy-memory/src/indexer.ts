import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as chokidar from "chokidar";
import { MemoryStore } from "./store.js";
import { Chunker, type ChunkOptions } from "./chunker.js";
import type { MemoryChunk } from "./types.js";
import { extractTextFromSession } from "./session-loader.js";

export interface IndexerOptions {
    extensions?: string[];
    chunkOptions?: ChunkOptions;
    ignorePatterns?: string[];
    watch?: boolean;
    watchDebounceMs?: number;
}

export class MemoryIndexer {
    private store: MemoryStore;
    private chunker: Chunker;
    private options: Required<IndexerOptions>;
    private watcher: chokidar.FSWatcher | null = null;

    constructor(store: MemoryStore, options: IndexerOptions = {}) {
        this.store = store;
        this.chunker = new Chunker(options.chunkOptions);
        this.options = {
            extensions: options.extensions ?? [".md", ".txt", ".jsonl"],
            chunkOptions: options.chunkOptions ?? {},
            ignorePatterns: options.ignorePatterns ?? ["node_modules", ".git", "dist", "build", ".star_sanctuary", ".belldandy"],
            watch: options.watch ?? false,
            watchDebounceMs: options.watchDebounceMs ?? 1000,
        };
    }

    /** 索引指定目录（递归） */
    async indexDirectory(dirPath: string): Promise<void> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (this.options.ignorePatterns.some((pattern) => fullPath.includes(pattern))) {
                continue;
            }

            if (entry.isDirectory()) {
                await this.indexDirectory(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (this.options.extensions.includes(ext)) {
                    await this.indexFile(fullPath);
                }
            }
        }
    }

    /** 索引单个文件 */
    async indexFile(filePath: string): Promise<void> {
        try {
            const stats = await fs.stat(filePath);
            const mtime = stats.mtime.toISOString();
            const ext = path.extname(filePath).toLowerCase();

            // 检查增量：对比存储中的最后更新时间与文件修改时间
            // 注意：这里我们简单地用 chunks 中最新的 updated_at（实际上是索引入库时间） vs 文件 mtime
            // 为了更严谨，我们应该在 metadata 里存原始文件的 mtime
            // 但这里我们先对比库里是否有记录。如果有，且记录的 file_mtime >= 当前文件 mtime，则跳过

            const fileMeta = this.store.getFileMetadata(filePath);

            if (fileMeta && fileMeta.metadata?.file_mtime) {
                if (new Date(fileMeta.metadata.file_mtime) >= stats.mtime) {
                    // 没变，跳过
                    return;
                }
            }

            // 读取并分块
            let content = "";
            let memoryType: "core" | "daily" | "session" | "other" = "other";

            if (ext === ".jsonl") {
                content = await extractTextFromSession(filePath);
                memoryType = "session";
            } else {
                content = await fs.readFile(filePath, "utf-8");

                // Determine memory type
                const fileName = path.basename(filePath);
                const parentDir = path.basename(path.dirname(filePath));

                if (fileName === "MEMORY.md" || fileName === "memory.md") {
                    memoryType = "core";
                } else if (parentDir === "memory" && /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName)) {
                    memoryType = "daily";
                }
            }

            if (!content.trim()) return;

            const chunksStr = this.chunker.splitText(content);

            // 事务性更新：先删旧，再插新
            // 注意：SQLite DatabaseSync 暂时没有显式 transaction API (Node 22)，
            // 但我们可以顺序执行。如果中间失败，可能导致数据不一致。
            // 对于 MVP，我们可以接受。

            this.store.deleteBySource(filePath);

            const baseId = crypto.createHash("md5").update(filePath).digest("hex");

            // Phase M-1: 推断元数据
            const channel = inferChannelFromPath(filePath, ext);
            const tsDate = inferTsDateFromPath(filePath, mtime);

            for (let i = 0; i < chunksStr.length; i++) {
                const chunkContent = chunksStr[i];
                const chunk: MemoryChunk = {
                    id: `${baseId}_${i}`,
                    sourcePath: filePath,
                    sourceType: ext === ".jsonl" ? "session" : "file",
                    memoryType: memoryType,
                    content: chunkContent,
                    channel,
                    tsDate,
                    metadata: {
                        file_mtime: mtime, // 存入文件的实际修改时间
                        chunk_index: i,
                        total_chunks: chunksStr.length
                    }
                };
                this.store.upsertChunk(chunk);
            }

            // 更新全局索引时间
            this.store.updateLastIndexedAt();

        } catch (err) {
            console.error(`Failed to index file: ${filePath}`, err);
        }
    }
    /** 停止监听 */
    async stopWatching(): Promise<void> {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
    }

    /** 启动目录监听（支持单目录或多目录） */
    async startWatching(dirPaths: string | string[]): Promise<void> {
        if (this.watcher) return;

        const paths = Array.isArray(dirPaths) ? dirPaths : [dirPaths];
        console.log(`[MemoryIndexer] Starting watch on: ${paths.join(", ")}`);

        this.watcher = chokidar.watch(paths, {
            ignored: (pathStr: string) => {
                return this.options.ignorePatterns.some(pattern => pathStr.includes(pattern));
            },
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: this.options.watchDebounceMs,
                pollInterval: 100
            }
        });

        const handleFile = async (filePath: string) => {
            const ext = path.extname(filePath).toLowerCase();
            if (this.options.extensions.includes(ext)) {
                console.log(`[FileChanged] ${filePath}`);
                await this.indexFile(filePath);
            }
        };

        const handleRemove = async (filePath: string) => {
            const ext = path.extname(filePath).toLowerCase();
            if (this.options.extensions.includes(ext)) {
                console.log(`[FileRemoved] ${filePath}`);
                this.store.deleteBySource(filePath);
            }
        };

        this.watcher
            .on("add", handleFile)
            .on("change", handleFile)
            .on("unlink", handleRemove)
            .on("error", error => console.error(`[WatcherError] ${error}`));
    }
}

// ========== Phase M-1: 元数据推断 ==========

/** 从文件路径推断来源渠道 */
function inferChannelFromPath(filePath: string, ext: string): string | undefined {
    const lower = filePath.toLowerCase().replace(/\\/g, "/");
    if (ext === ".jsonl" || lower.includes("/sessions/")) {
        if (lower.includes("feishu") || lower.includes("lark")) return "feishu";
        return "webchat";
    }
    if (lower.includes("heartbeat")) return "heartbeat";
    return undefined;
}

/** 从文件路径或 mtime 推断日期 */
function inferTsDateFromPath(filePath: string, mtime: string): string | undefined {
    // 优先从文件名提取：memory/YYYY-MM-DD.md 或 sessions/YYYY-MM-DD_xxx.jsonl
    const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) return dateMatch[1];

    // 从文件 mtime 推断
    try {
        return new Date(mtime).toISOString().slice(0, 10);
    } catch {
        return undefined;
    }
}
