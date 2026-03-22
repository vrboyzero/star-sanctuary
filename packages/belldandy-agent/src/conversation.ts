import fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import {
    needsCompaction,
    compactIncremental,
    compactMessages,
    estimateMessagesTokens,
    createEmptyCompactionState,
    type CompactionOptions,
    type CompactionState,
    type SummarizerFn,
} from "./compaction.js";

/**
 * 对话消息
 */
export type ConversationMessage = {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    /** 产生此消息的 Agent Profile ID（多 Agent 预留） */
    agentId?: string;
    /** 客户端发送上下文（用于诊断和时间回填） */
    clientContext?: {
        sentAtMs?: number;
        timezoneOffsetMinutes?: number;
        locale?: string;
    };
};

/**
 * 跨 run 持久化的 token 计数器快照
 */
export type ActiveCounterSnapshot = {
  name: string;
  startTime: number;
  baseInputTokens: number;
  baseOutputTokens: number;
  /** 快照保存时的全局累计值（用于跨 run 恢复） */
  savedGlobalInputTokens: number;
  savedGlobalOutputTokens: number;
};

export type TaskTokenRecord = {
    name: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    durationMs: number;
    createdAt: number;
    auto?: boolean;
};

/**
 * 会话对象
 */
export type Conversation = {
    id: string;
    /** 绑定的 Agent Profile ID（多 Agent 预留） */
    agentId?: string;
    /** 来源渠道（"webchat" | "feishu" | "heartbeat" | ...） */
    channel?: string;
    messages: ConversationMessage[];
    createdAt: number;
    updatedAt: number;
    /** 房间成员列表缓存（用于多人聊天场景） */
    roomMembersCache?: {
        members: Array<{
            type: "user" | "agent";
            id: string;
            name?: string;
            identity?: string;
        }>;
        cachedAt: number; // 缓存时间戳
        ttl: number; // 缓存有效期（毫秒）
    };
    /** 跨 run 持久化的活跃 token 计数器快照 */
    activeCounters?: ActiveCounterSnapshot[];
    /** 最近任务级 token 统计结果 */
    taskTokenRecords?: TaskTokenRecord[];
};

/**
 * 会话存储选项
 */
export type ConversationStoreOptions = {
    /** 最大历史消息数（默认 20） */
    maxHistory?: number;
    /** 会话过期时间（秒，默认 3600） */
    ttlSeconds?: number;
    /** 持久化存储目录 (可选) */
    dataDir?: string;
    /** 对话压缩配置（可选，设置后启用自动压缩） */
    compaction?: CompactionOptions;
    /** 模型摘要函数（可选，注入后启用模型摘要） */
    summarizer?: SummarizerFn;
    /** 压缩前回调（用于接入 hook 系统） */
    onBeforeCompaction?: (event: { messageCount: number; tokenCount?: number; tier?: string; source?: string }) => void;
    /** 压缩后回调（用于接入 hook 系统） */
    onAfterCompaction?: (event: { messageCount: number; tokenCount?: number; compactedCount: number; tier?: string; source?: string; originalTokenCount?: number }) => void;
};

type ConversationHistoryView = Array<{ role: "user" | "assistant"; content: string }>;

type ConversationMetaSnapshot = Partial<Pick<
    Conversation,
    "agentId" | "channel" | "activeCounters" | "taskTokenRecords" | "createdAt" | "updatedAt"
>>;

export const conversationAsyncFs = {
    readFile(filePath: string, encoding: BufferEncoding): Promise<string> {
        return fsp.readFile(filePath, encoding);
    },
    appendFile(filePath: string, data: string, encoding: BufferEncoding): Promise<void> {
        return fsp.appendFile(filePath, data, encoding);
    },
    writeFile(filePath: string, data: string, encoding: BufferEncoding): Promise<void> {
        return fsp.writeFile(filePath, data, encoding);
    },
    rename(sourcePath: string, destinationPath: string): Promise<void> {
        return fsp.rename(sourcePath, destinationPath);
    },
    unlink(filePath: string): Promise<void> {
        return fsp.unlink(filePath);
    },
};

const INVALID_CONVERSATION_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F%]/g;
const TRAILING_CONVERSATION_FILENAME_CHARS = /[. ]+$/;
const RESERVED_WINDOWS_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 会话存储
 * 用于管理对话上下文历史，支持文件持久化 (JSONL)
 */
export class ConversationStore {
    private conversations = new Map<string, Conversation>();
    private compactionStates = new Map<string, CompactionState>();
    private appendWriteChains = new Map<string, Promise<void>>();
    private compactionStateWriteChains = new Map<string, Promise<void>>();
    private readonly maxHistory: number;
    private readonly ttlSeconds: number;
    private readonly dataDir?: string;
    private readonly compactionOpts?: CompactionOptions;
    private readonly summarizer?: SummarizerFn;
    private readonly onBeforeCompaction?: ConversationStoreOptions["onBeforeCompaction"];
    private readonly onAfterCompaction?: ConversationStoreOptions["onAfterCompaction"];

    constructor(options: ConversationStoreOptions = {}) {
        this.maxHistory = options.maxHistory ?? 20;
        this.ttlSeconds = options.ttlSeconds ?? 3600;
        this.dataDir = options.dataDir;
        this.compactionOpts = options.compaction;
        this.summarizer = options.summarizer;
        this.onBeforeCompaction = options.onBeforeCompaction;
        this.onAfterCompaction = options.onAfterCompaction;

        if (this.dataDir) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * 获取会话
     * 优先从内存获取，若无则尝试从文件加载
     */
    get(id: string): Conversation | undefined {
        let conv = this.conversations.get(id);

        // 如果内存没有，尝试从磁盘加载
        if (!conv && this.dataDir) {
            conv = this.loadFromFile(id);
        }

        return this.cacheAndValidateConversation(id, conv);
    }

    /**
     * 从文件加载会话
     */
    private loadFromFile(id: string): Conversation | undefined {
        if (!this.dataDir) return undefined;
        const filePath = this.getExistingConversationFilePath(id, ".jsonl");
        const meta = this.loadMetaFromFile(id);
        if (!fs.existsSync(filePath)) {
            if (!meta) return undefined;
            return {
                id,
                agentId: meta.agentId,
                channel: meta.channel,
                messages: [],
                createdAt: meta.createdAt ?? Date.now(),
                updatedAt: meta.updatedAt ?? Date.now(),
                activeCounters: meta.activeCounters,
                taskTokenRecords: meta.taskTokenRecords,
            };
        }

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n").filter(line => line.trim());
            const messages: ConversationMessage[] = [];
            let createdAt = Date.now();
            let updatedAt = 0;
            let recoveredAgentId = meta?.agentId;

            for (const line of lines) {
                try {
                    const msg = JSON.parse(line) as ConversationMessage;
                    if (msg.role && msg.content) {
                        // agentId 为可选字段，旧 JSONL 中不存在时保持 undefined
                        messages.push(msg);
                        if (!recoveredAgentId && msg.agentId) recoveredAgentId = msg.agentId;
                        if (msg.timestamp > updatedAt) updatedAt = msg.timestamp;
                        if (msg.timestamp < createdAt) createdAt = msg.timestamp;
                    }
                } catch {
                    // ignore invalid lines
                }
            }

            if (messages.length === 0) {
                if (!meta?.activeCounters && !meta?.taskTokenRecords) {
                    return undefined;
                }
                return {
                    id,
                    agentId: meta?.agentId,
                    channel: meta?.channel,
                    messages: [],
                    createdAt: meta?.createdAt ?? createdAt,
                    updatedAt: meta?.updatedAt ?? Date.now(),
                    activeCounters: meta?.activeCounters,
                    taskTokenRecords: meta?.taskTokenRecords,
                };
            }

            // 应用 maxHistory 限制 (加载时也裁剪)
            const finalMessages = messages.length > this.maxHistory
                ? messages.slice(messages.length - this.maxHistory)
                : messages;

            return {
                id,
                agentId: recoveredAgentId,
                channel: meta?.channel,
                messages: finalMessages,
                createdAt: meta?.createdAt ?? createdAt,
                updatedAt: Math.max(meta?.updatedAt ?? 0, updatedAt || Date.now()),
                activeCounters: meta?.activeCounters,
                taskTokenRecords: meta?.taskTokenRecords,
            };
        } catch (err) {
            console.error(`Failed to load conversation ${id}:`, err);
            return undefined;
        }
    }

    private async getAsync(id: string): Promise<Conversation | undefined> {
        let conv = this.conversations.get(id);
        if (!conv && this.dataDir) {
            conv = await this.loadFromFileAsync(id);
        }
        return this.cacheAndValidateConversation(id, conv);
    }

    private cacheAndValidateConversation(id: string, conv: Conversation | undefined): Conversation | undefined {
        if (!conv) return undefined;

        const now = Date.now();
        if (now - conv.updatedAt > this.ttlSeconds * 1000) {
            this.conversations.delete(id);
            return undefined;
        }

        if (!this.conversations.has(id)) {
            this.conversations.set(id, conv);
        }

        return conv;
    }

    private async loadFromFileAsync(id: string): Promise<Conversation | undefined> {
        if (!this.dataDir) return undefined;
        const meta = await this.loadMetaFromFileAsync(id);
        let content: string | undefined;
        for (const filePath of this.getConversationFilePathCandidates(id, ".jsonl")) {
            try {
                content = await conversationAsyncFs.readFile(filePath, "utf-8");
                break;
            } catch (err) {
                const fsErr = err as NodeJS.ErrnoException;
                if (fsErr.code === "ENOENT") {
                    continue;
                }
                console.error(`Failed to load conversation ${id}:`, err);
                return undefined;
            }
        }

        if (typeof content === "undefined") {
            if (!meta) return undefined;
            return {
                id,
                agentId: meta.agentId,
                channel: meta.channel,
                messages: [],
                createdAt: meta.createdAt ?? Date.now(),
                updatedAt: meta.updatedAt ?? Date.now(),
                activeCounters: meta.activeCounters,
                taskTokenRecords: meta.taskTokenRecords,
            };
        }

        try {
            const lines = content.split("\n").filter(line => line.trim());
            const messages: ConversationMessage[] = [];
            let createdAt = Date.now();
            let updatedAt = 0;
            let recoveredAgentId = meta?.agentId;

            for (const line of lines) {
                try {
                    const msg = JSON.parse(line) as ConversationMessage;
                    if (msg.role && msg.content) {
                        messages.push(msg);
                        if (!recoveredAgentId && msg.agentId) recoveredAgentId = msg.agentId;
                        if (msg.timestamp > updatedAt) updatedAt = msg.timestamp;
                        if (msg.timestamp < createdAt) createdAt = msg.timestamp;
                    }
                } catch {
                    // ignore invalid lines
                }
            }

            if (messages.length === 0) {
                if (!meta?.activeCounters && !meta?.taskTokenRecords) {
                    return undefined;
                }
                return {
                    id,
                    agentId: meta?.agentId,
                    channel: meta?.channel,
                    messages: [],
                    createdAt: meta?.createdAt ?? createdAt,
                    updatedAt: meta?.updatedAt ?? Date.now(),
                    activeCounters: meta?.activeCounters,
                    taskTokenRecords: meta?.taskTokenRecords,
                };
            }

            const finalMessages = messages.length > this.maxHistory
                ? messages.slice(messages.length - this.maxHistory)
                : messages;

            return {
                id,
                agentId: recoveredAgentId,
                channel: meta?.channel,
                messages: finalMessages,
                createdAt: meta?.createdAt ?? createdAt,
                updatedAt: Math.max(meta?.updatedAt ?? 0, updatedAt || Date.now()),
                activeCounters: meta?.activeCounters,
                taskTokenRecords: meta?.taskTokenRecords,
            };
        } catch (err) {
            console.error(`Failed to load conversation ${id}:`, err);
            return undefined;
        }
    }

    private getMetaFilePath(id: string): string | undefined {
        return this.getConversationFilePath(id, ".meta.json");
    }

    private getConversationFilePath(id: string, suffix: string): string | undefined {
        if (!this.dataDir) return undefined;
        const safeId = this.toSafeConversationFileId(id);
        return path.join(this.dataDir, `${safeId}${suffix}`);
    }

    private getExistingConversationFilePath(id: string, suffix: string): string {
        const candidates = this.getConversationFilePathCandidates(id, suffix);
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        return candidates[0];
    }

    private getConversationFilePathCandidates(id: string, suffix: string): string[] {
        if (!this.dataDir) return [];
        const primary = this.getConversationFilePath(id, suffix);
        if (!primary) return [];

        const legacy = path.join(this.dataDir, `${id}${suffix}`);
        return primary === legacy ? [primary] : [primary, legacy];
    }

    private toSafeConversationFileId(id: string): string {
        const encodeChar = (char: string): string => {
            const codePoint = char.codePointAt(0);
            if (typeof codePoint !== "number") return "_";
            return `%${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
        };

        let safeId = id.replace(INVALID_CONVERSATION_FILENAME_CHARS, encodeChar);
        safeId = safeId.replace(TRAILING_CONVERSATION_FILENAME_CHARS, (match) => Array.from(match).map(encodeChar).join(""));

        if (!safeId) {
            safeId = "_";
        }

        const windowsBasename = safeId.split(".")[0] ?? safeId;
        if (RESERVED_WINDOWS_BASENAME.test(windowsBasename)) {
            safeId = `_${safeId}`;
        }

        return safeId;
    }

    private loadMetaFromFile(id: string): ConversationMetaSnapshot | undefined {
        for (const filePath of this.getConversationFilePathCandidates(id, ".meta.json")) {
            if (!fs.existsSync(filePath)) continue;

            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
                    agentId?: string;
                    channel?: string;
                    activeCounters?: ActiveCounterSnapshot[];
                    taskTokenRecords?: TaskTokenRecord[];
                    createdAt?: number;
                    updatedAt?: number;
                };
                const hasMeta =
                    typeof parsed.agentId === "string"
                    || typeof parsed.channel === "string"
                    || Array.isArray(parsed.activeCounters)
                    || Array.isArray(parsed.taskTokenRecords)
                    || typeof parsed.createdAt === "number"
                    || typeof parsed.updatedAt === "number";
                if (!hasMeta) return undefined;
                return {
                    agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined,
                    channel: typeof parsed.channel === "string" ? parsed.channel : undefined,
                    activeCounters: Array.isArray(parsed.activeCounters) ? parsed.activeCounters : undefined,
                    taskTokenRecords: Array.isArray(parsed.taskTokenRecords) ? parsed.taskTokenRecords : undefined,
                    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : undefined,
                    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
                };
            } catch {
                continue;
            }
        }

        return undefined;
    }

    private async loadMetaFromFileAsync(id: string): Promise<ConversationMetaSnapshot | undefined> {
        for (const filePath of this.getConversationFilePathCandidates(id, ".meta.json")) {
            try {
                const raw = await conversationAsyncFs.readFile(filePath, "utf-8");
                const parsed = JSON.parse(raw) as {
                    agentId?: string;
                    channel?: string;
                    activeCounters?: ActiveCounterSnapshot[];
                    taskTokenRecords?: TaskTokenRecord[];
                    createdAt?: number;
                    updatedAt?: number;
                };
                const hasMeta =
                    typeof parsed.agentId === "string"
                    || typeof parsed.channel === "string"
                    || Array.isArray(parsed.activeCounters)
                    || Array.isArray(parsed.taskTokenRecords)
                    || typeof parsed.createdAt === "number"
                    || typeof parsed.updatedAt === "number";
                if (!hasMeta) return undefined;
                return {
                    agentId: typeof parsed.agentId === "string" ? parsed.agentId : undefined,
                    channel: typeof parsed.channel === "string" ? parsed.channel : undefined,
                    activeCounters: Array.isArray(parsed.activeCounters) ? parsed.activeCounters : undefined,
                    taskTokenRecords: Array.isArray(parsed.taskTokenRecords) ? parsed.taskTokenRecords : undefined,
                    createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : undefined,
                    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : undefined,
                };
            } catch (err) {
                const fsErr = err as NodeJS.ErrnoException;
                if (fsErr.code === "ENOENT") {
                    continue;
                }
            }
        }

        return undefined;
    }

    private persistConversationMeta(id: string, conv: Conversation): void {
        const filePath = this.getMetaFilePath(id);
        if (!filePath) return;

        const payload = {
            agentId: conv.agentId,
            channel: conv.channel,
            activeCounters: conv.activeCounters,
            taskTokenRecords: conv.taskTokenRecords,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
        };
        if (!payload.agentId && !payload.channel && !payload.activeCounters && !payload.taskTokenRecords) {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    const fsErr = err as NodeJS.ErrnoException;
                    if (fsErr.code !== "ENOENT") {
                        console.error(`Failed to delete conversation meta for ${id}:`, err);
                    }
                }
            }
            return;
        }

        const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        try {
            fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf-8");
            fs.renameSync(tempPath, filePath);
        } catch (err) {
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            } catch {
                // ignore temp cleanup failure
            }
            console.error(`Failed to save conversation meta for ${id}:`, err);
        }
    }

    /**
     * 添加消息到会话
     * 如果会话不存在会自动创建
     */
    addMessage(
        id: string,
        role: "user" | "assistant",
        content: string,
        opts?: { agentId?: string; channel?: string; timestampMs?: number; clientContext?: ConversationMessage["clientContext"] },
    ): ConversationMessage {
        let conv = this.get(id); // get() now handles loadFromFile
        const now = typeof opts?.timestampMs === "number" && Number.isFinite(opts.timestampMs)
            ? Math.max(0, Math.floor(opts.timestampMs))
            : Date.now();
        let headerChanged = false;

        if (!conv) {
            conv = {
                id,
                agentId: opts?.agentId,
                channel: opts?.channel,
                messages: [],
                createdAt: now,
                updatedAt: now,
            };
            this.conversations.set(id, conv);
            headerChanged = Boolean(conv.agentId || conv.channel);
        } else {
            // 更新会话级元数据（如果首次设置）
            if (opts?.agentId && !conv.agentId) {
                conv.agentId = opts.agentId;
                headerChanged = true;
            }
            if (opts?.channel && !conv.channel) {
                conv.channel = opts.channel;
                headerChanged = true;
            }
        }

        const newMessage: ConversationMessage = { role, content, timestamp: now };
        if (opts?.agentId) newMessage.agentId = opts.agentId;
        if (opts?.clientContext) newMessage.clientContext = opts.clientContext;
        conv.messages.push(newMessage);
        conv.updatedAt = now;

        // 限制内存中的历史长度
        if (conv.messages.length > this.maxHistory) {
            const start = conv.messages.length - this.maxHistory;
            conv.messages = conv.messages.slice(start);
        }

        // 持久化追加
        if (this.dataDir) {
            if (headerChanged) {
                this.persistConversationMeta(id, conv);
            }
            this.appendToFile(id, newMessage);
        }

        return newMessage;
    }

    /**
     * 追加消息到文件
     */
    private appendToFile(id: string, message: ConversationMessage): void {
        if (!this.dataDir) return;
        const filePath = this.getExistingConversationFilePath(id, ".jsonl");
        const line = JSON.stringify(message) + "\n";

        // 同一会话串行落盘，避免快速连续 append 在磁盘上的顺序漂移。
        this.enqueueAppendWrite(id, async () => {
            try {
                await conversationAsyncFs.appendFile(filePath, line, "utf-8");
            } catch (err) {
                if (this.shouldIgnoreAppendError(filePath, err as NodeJS.ErrnoException)) {
                    return;
                }
                console.error(`Failed to append to conversation ${id}:`, err);
            }
        });
    }

    private shouldIgnoreAppendError(filePath: string, err: NodeJS.ErrnoException): boolean {
        void filePath;
        // appendFile 对不存在的目标文件本来会自动创建；
        // 因此这里出现 ENOENT，本质上就是父目录在异步回调落地前已被清理。
        // 这类情况不会影响当前请求响应和内存态上下文，直接静默，避免测试期 stderr 噪音。
        return err.code === "ENOENT";
    }

    private enqueueAppendWrite(id: string, task: () => Promise<void>): void {
        const previous = this.appendWriteChains.get(id) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(task);

        this.appendWriteChains.set(id, next);
        void next.finally(() => {
            if (this.appendWriteChains.get(id) === next) {
                this.appendWriteChains.delete(id);
            }
        });
    }

    /**
     * 清除会话
     */
    clear(id: string): void {
        this.conversations.delete(id);
        // 可选：是否删除文件？通常保留作为历史记录
        // if (this.dataDir) {
        //     const filePath = path.join(this.dataDir, `${id}.jsonl`);
        //     if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        // }
    }

    private sanitizeHistoryContent(content: string): string {
        return content
          .replace(/<audio[^>]*>.*?<\/audio>/gi, "")
          .replace(/\[Audio was generated and played\]/gi, "")
          .replace(/\[Download\]\([^)]*\/generated\/[^)]*\)/gi, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || content;
    }

    private buildHistoryView(conv?: Conversation): ConversationHistoryView {
        if (!conv) return [];
        return conv.messages.map((m) => ({
            role: m.role,
            content: this.sanitizeHistoryContent(m.content),
        }));
    }

    /**
     * 获取最近的历史消息（用于传给 LLM）
     * 不包含当前的最新消息，仅返回之前的历史
     */
    getHistory(id: string): Array<{ role: "user" | "assistant"; content: string }> {
        return this.buildHistoryView(this.get(id));
    }

    /**
     * 获取会话快照与压缩后的历史，避免调用方在同一热路径内重复读取会话对象。
     */
    async getConversationHistoryCompacted(
        id: string,
        overrideOpts?: CompactionOptions,
    ): Promise<{ conversation?: Conversation; history: ConversationHistoryView; compacted: boolean }> {
        const conversation = await this.getAsync(id);
        const history = this.buildHistoryView(conversation);
        const opts = overrideOpts ?? this.compactionOpts;

        if (!opts || opts.enabled === false || !needsCompaction(history, opts)) {
            return { conversation, history, compacted: false };
        }

        // 加载或创建压缩状态
        const state = await this.getCompactionStateAsync(id);

        // 触发 before_compaction 回调
        this.onBeforeCompaction?.({
            messageCount: history.length,
            tokenCount: estimateMessagesTokens(history),
            source: "request",
        });

        const result = await compactIncremental(history, state, {
            ...opts,
            summarizer: this.summarizer,
        });

        if (result.compacted) {
            // 持久化更新后的压缩状态
            await this.persistCompactionState(id, result.state);

            // 触发 after_compaction 回调
            this.onAfterCompaction?.({
                messageCount: result.messages.length,
                tokenCount: result.compactedTokens,
                compactedCount: history.length - result.messages.length,
                tier: result.tier,
                source: "request",
                originalTokenCount: result.originalTokens,
            });
        }

        return { conversation, history: result.messages, compacted: result.compacted };
    }

    /**
     * 获取历史消息，自动应用增量压缩（如果配置了 compaction）。
     * 使用三层渐进式压缩：Archival Summary → Rolling Summary → Working Memory
     */
    async getHistoryCompacted(
        id: string,
        overrideOpts?: CompactionOptions,
    ): Promise<{ history: Array<{ role: "user" | "assistant"; content: string }>; compacted: boolean }> {
        const { history, compacted } = await this.getConversationHistoryCompacted(id, overrideOpts);
        return { history, compacted };
    }

    /**
     * 强制执行上下文压缩（跳过 needsCompaction 检查）。
     * 用于用户手动触发 /compact 命令。
     * 如果历史消息过少（≤2）或未配置 compaction，返回 compacted: false。
     */
    async forceCompact(
        id: string,
    ): Promise<{ history: Array<{ role: "user" | "assistant"; content: string }>; compacted: boolean; originalTokens?: number; compactedTokens?: number; tier?: string }> {
        const conversation = await this.getAsync(id);
        const history = this.buildHistoryView(conversation);
        const opts = this.compactionOpts;

        // 无压缩配置或历史太短，无法压缩
        if (!opts || history.length <= 2) {
            return { history, compacted: false };
        }

        const state = await this.getCompactionStateAsync(id);
        const originalTokens = estimateMessagesTokens(history);

        this.onBeforeCompaction?.({
            messageCount: history.length,
            tokenCount: originalTokens,
            source: "manual",
        });

        const result = await compactIncremental(history, state, {
            ...opts,
            summarizer: this.summarizer,
        });

        if (result.compacted) {
            await this.persistCompactionState(id, result.state);

            this.onAfterCompaction?.({
                messageCount: result.messages.length,
                tokenCount: result.compactedTokens,
                compactedCount: history.length - result.messages.length,
                tier: result.tier,
                source: "manual",
                originalTokenCount: result.originalTokens,
            });
        }

        return {
            history: result.messages,
            compacted: result.compacted,
            originalTokens: result.originalTokens,
            compactedTokens: result.compactedTokens,
            tier: result.tier,
        };
    }

    // ─── CompactionState 持久化 ──────────────────────────────────────────

    /**
     * 获取会话的压缩状态
     */
    private getCompactionStateFilePath(id: string): string | undefined {
        return this.getConversationFilePath(id, ".compaction.json");
    }

    private async getCompactionStateAsync(id: string): Promise<CompactionState> {
        // 内存优先
        const cached = this.compactionStates.get(id);
        if (cached) return cached;

        // 尝试从磁盘加载
        for (const filePath of this.getConversationFilePathCandidates(id, ".compaction.json")) {
            try {
                const raw = await conversationAsyncFs.readFile(filePath, "utf-8");
                const data = JSON.parse(raw) as CompactionState;
                this.compactionStates.set(id, data);
                return data;
            } catch (err) {
                const fsErr = err as NodeJS.ErrnoException;
                if (fsErr.code !== "ENOENT") {
                    // 文件损坏或读取失败时，退回空状态，保持旧行为
                }
            }
        }

        const empty = createEmptyCompactionState();
        this.compactionStates.set(id, empty);
        return empty;
    }

    /**
     * 更新并持久化压缩状态
     */
    private async persistCompactionState(id: string, state: CompactionState): Promise<void> {
        this.compactionStates.set(id, state);

        const filePath = this.getCompactionStateFilePath(id);
        if (!filePath) return;

        const data = JSON.stringify(state, null, 2);
        const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

        await this.enqueueCompactionStateWrite(id, async () => {
            try {
                await conversationAsyncFs.writeFile(tempPath, data, "utf-8");
                await conversationAsyncFs.rename(tempPath, filePath);
            } catch (err) {
                try {
                    await conversationAsyncFs.unlink(tempPath);
                } catch (cleanupErr) {
                    const fsErr = cleanupErr as NodeJS.ErrnoException;
                    if (fsErr.code !== "ENOENT") {
                        // ignore temp cleanup failure
                    }
                }
                console.error(`Failed to save compaction state for ${id}:`, err);
            }
        });
    }

    private enqueueCompactionStateWrite(id: string, task: () => Promise<void>): Promise<void> {
        const previous = this.compactionStateWriteChains.get(id) ?? Promise.resolve();
        const next = previous
            .catch(() => undefined)
            .then(task);

        this.compactionStateWriteChains.set(id, next);
        void next.finally(() => {
            if (this.compactionStateWriteChains.get(id) === next) {
                this.compactionStateWriteChains.delete(id);
            }
        });
        return next;
    }

    /**
     * 保存活跃 token 计数器快照（跨 run 持久化）
     */
    setActiveCounters(conversationId: string, snapshots: ActiveCounterSnapshot[]): void {
        const conv = this.get(conversationId);
        if (!conv) return;
        conv.activeCounters = snapshots.length > 0 ? snapshots : undefined;
        conv.updatedAt = Date.now();
        this.persistConversationMeta(conversationId, conv);
    }

    /**
     * 获取活跃 token 计数器快照
     */
    getActiveCounters(conversationId: string): ActiveCounterSnapshot[] {
        const conv = this.get(conversationId);
        return conv?.activeCounters ?? [];
    }

    recordTaskTokenResult(
        conversationId: string,
        record: Omit<TaskTokenRecord, "createdAt"> & { createdAt?: number },
        limit: number = 20,
    ): void {
        let conv = this.get(conversationId);
        const now = Date.now();
        if (!conv) {
            conv = {
                id: conversationId,
                messages: [],
                createdAt: now,
                updatedAt: now,
            };
            this.conversations.set(conversationId, conv);
        }

        const nextRecord: TaskTokenRecord = {
            ...record,
            createdAt: typeof record.createdAt === "number" ? record.createdAt : now,
        };
        const existing = conv.taskTokenRecords ?? [];
        conv.taskTokenRecords = [nextRecord, ...existing].slice(0, Math.max(1, limit));
        conv.updatedAt = now;
        this.persistConversationMeta(conversationId, conv);
    }

    getTaskTokenResults(conversationId: string, limit: number = 10): TaskTokenRecord[] {
        const conv = this.get(conversationId);
        if (!conv?.taskTokenRecords?.length) return [];
        return conv.taskTokenRecords.slice(0, Math.max(1, limit));
    }

    /**
     * 设置房间成员列表缓存
     * @param conversationId 会话ID
     * @param members 成员列表
     * @param ttl 缓存有效期（毫秒），默认5分钟
     */
    setRoomMembersCache(
        conversationId: string,
        members: Array<{ type: "user" | "agent"; id: string; name?: string; identity?: string }>,
        ttl: number = 5 * 60 * 1000, // 默认5分钟
    ): void {
        const conv = this.get(conversationId);
        if (!conv) return;

        conv.roomMembersCache = {
            members,
            cachedAt: Date.now(),
            ttl,
        };
        conv.updatedAt = Date.now();
    }

    /**
     * 获取房间成员列表缓存
     * @param conversationId 会话ID
     * @returns 成员列表，如果缓存过期或不存在则返回undefined
     */
    getRoomMembersCache(
        conversationId: string,
    ): Array<{ type: "user" | "agent"; id: string; name?: string; identity?: string }> | undefined {
        const conv = this.get(conversationId);
        if (!conv || !conv.roomMembersCache) return undefined;

        const now = Date.now();
        const cache = conv.roomMembersCache;

        // 检查缓存是否过期
        if (now - cache.cachedAt > cache.ttl) {
            // 缓存过期，清除
            delete conv.roomMembersCache;
            return undefined;
        }

        return cache.members;
    }

    /**
     * 清除房间成员列表缓存
     * @param conversationId 会话ID
     */
    clearRoomMembersCache(conversationId: string): void {
        const conv = this.get(conversationId);
        if (!conv) return;

        delete conv.roomMembersCache;
        conv.updatedAt = Date.now();
    }
}
