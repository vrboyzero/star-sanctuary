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
    private watchRoots: string[] = [];

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
    async indexDirectory(dirPath: string, scanRoot = dirPath): Promise<void> {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (this.shouldIgnore(fullPath, scanRoot)) {
                continue;
            }

            if (entry.isDirectory()) {
                await this.indexDirectory(fullPath, scanRoot);
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

            const baseId = crypto.createHash("md5").update(filePath).digest("hex");

            // Phase M-1: 推断元数据
            const channel = inferChannelFromPath(filePath, ext);
            const tsDate = inferTsDateFromPath(filePath, mtime);
            const agentId = this.store.getSourceAgentId(filePath) ?? undefined;
            const sourceVisibility = this.store.getSourceVisibility(filePath) ?? undefined;
            const chunks: MemoryChunk[] = [];

            for (let i = 0; i < chunksStr.length; i++) {
                const chunkContent = chunksStr[i];
                const chunkId = `${baseId}_${i}`;
                chunks.push({
                    id: chunkId,
                    sourcePath: filePath,
                    sourceType: ext === ".jsonl" ? "session" : "file",
                    memoryType: memoryType,
                    content: chunkContent,
                    channel,
                    tsDate,
                    agentId,
                    visibility: this.store.getChunkVisibility(chunkId) ?? sourceVisibility,
                    metadata: {
                        file_mtime: mtime, // 存入文件的实际修改时间
                        chunk_index: i,
                        total_chunks: chunksStr.length
                    }
                });
            }

            // 使用单事务替换同一 source 的索引内容，避免先删后写的中间态暴露给查询方。
            this.store.replaceSourceChunks(filePath, chunks);

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
        this.watchRoots = paths.map((item) => path.resolve(item));
        console.log(`[MemoryIndexer] Starting watch on: ${paths.join(", ")}`);

        this.watcher = chokidar.watch(paths, {
            ignored: (pathStr: string) => {
                return this.shouldIgnore(pathStr, this.watchRoots);
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

    private shouldIgnore(targetPath: string, roots: string | string[]): boolean {
        const candidateRoots = (Array.isArray(roots) ? roots : [roots])
            .map((item) => path.resolve(item));
        const resolvedTarget = path.resolve(targetPath);

        for (const root of candidateRoots) {
            const relative = this.toRelativePath(root, resolvedTarget);
            if (relative !== null && this.matchesIgnorePattern(relative)) {
                return true;
            }
        }

        return false;
    }

    private toRelativePath(rootPath: string, targetPath: string): string | null {
        const relative = path.relative(rootPath, targetPath);
        if (!relative) return "";
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            return null;
        }
        return relative;
    }

    private matchesIgnorePattern(targetPath: string): boolean {
        const targetSegments = normalizePathSegments(targetPath);
        if (targetSegments.length === 0) {
            return false;
        }

        return this.options.ignorePatterns.some((pattern) => {
            const patternSegments = normalizePathSegments(pattern);
            if (patternSegments.length === 0) return false;

            if (patternSegments.length === 1) {
                return targetSegments.includes(patternSegments[0]);
            }

            for (let i = 0; i <= targetSegments.length - patternSegments.length; i++) {
                let matched = true;
                for (let j = 0; j < patternSegments.length; j++) {
                    if (targetSegments[i + j] !== patternSegments[j]) {
                        matched = false;
                        break;
                    }
                }
                if (matched) return true;
            }

            return false;
        });
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

function normalizePathSegments(input: string): string[] {
    return String(input ?? "")
        .replace(/\\/g, "/")
        .split("/")
        .map((segment) => segment.trim().toLowerCase())
        .filter(Boolean);
}
