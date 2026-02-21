import fs from "node:fs";
import path from "node:path";
import { needsCompaction, compactIncremental, estimateMessagesTokens, createEmptyCompactionState, } from "./compaction.js";
/**
 * 会话存储
 * 用于管理对话上下文历史，支持文件持久化 (JSONL)
 */
export class ConversationStore {
    conversations = new Map();
    compactionStates = new Map();
    maxHistory;
    ttlSeconds;
    dataDir;
    compactionOpts;
    summarizer;
    onBeforeCompaction;
    onAfterCompaction;
    constructor(options = {}) {
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
    get(id) {
        let conv = this.conversations.get(id);
        // 如果内存没有，尝试从磁盘加载
        if (!conv && this.dataDir) {
            conv = this.loadFromFile(id);
        }
        if (!conv)
            return undefined;
        // 检查过期 (仅针对纯内存或缓存策略，持久化后可适当放宽，但保持语义一致)
        const now = Date.now();
        if (now - conv.updatedAt > this.ttlSeconds * 1000) {
            this.conversations.delete(id);
            return undefined;
        }
        // 加载后放入内存缓存
        if (!this.conversations.has(id)) {
            this.conversations.set(id, conv);
        }
        return conv;
    }
    /**
     * 从文件加载会话
     */
    loadFromFile(id) {
        if (!this.dataDir)
            return undefined;
        const filePath = path.join(this.dataDir, `${id}.jsonl`);
        if (!fs.existsSync(filePath))
            return undefined;
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n").filter(line => line.trim());
            const messages = [];
            let createdAt = Date.now();
            let updatedAt = 0;
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);
                    if (msg.role && msg.content) {
                        // agentId 为可选字段，旧 JSONL 中不存在时保持 undefined
                        messages.push(msg);
                        if (msg.timestamp > updatedAt)
                            updatedAt = msg.timestamp;
                        if (msg.timestamp < createdAt)
                            createdAt = msg.timestamp;
                    }
                }
                catch {
                    // ignore invalid lines
                }
            }
            if (messages.length === 0)
                return undefined;
            // 应用 maxHistory 限制 (加载时也裁剪)
            const finalMessages = messages.length > this.maxHistory
                ? messages.slice(messages.length - this.maxHistory)
                : messages;
            return {
                id,
                messages: finalMessages,
                createdAt,
                updatedAt: updatedAt || Date.now(),
            };
        }
        catch (err) {
            console.error(`Failed to load conversation ${id}:`, err);
            return undefined;
        }
    }
    /**
     * 添加消息到会话
     * 如果会话不存在会自动创建
     */
    addMessage(id, role, content, opts) {
        let conv = this.get(id); // get() now handles loadFromFile
        const now = Date.now();
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
        }
        else {
            // 更新会话级元数据（如果首次设置）
            if (opts?.agentId && !conv.agentId)
                conv.agentId = opts.agentId;
            if (opts?.channel && !conv.channel)
                conv.channel = opts.channel;
        }
        const newMessage = { role, content, timestamp: now };
        if (opts?.agentId)
            newMessage.agentId = opts.agentId;
        conv.messages.push(newMessage);
        conv.updatedAt = now;
        // 限制内存中的历史长度
        if (conv.messages.length > this.maxHistory) {
            const start = conv.messages.length - this.maxHistory;
            conv.messages = conv.messages.slice(start);
        }
        // 持久化追加
        if (this.dataDir) {
            this.appendToFile(id, newMessage);
        }
    }
    /**
     * 追加消息到文件
     */
    appendToFile(id, message) {
        if (!this.dataDir)
            return;
        const filePath = path.join(this.dataDir, `${id}.jsonl`);
        const line = JSON.stringify(message) + "\n";
        // 异步写入，不阻塞主线程
        fs.appendFile(filePath, line, "utf-8", (err) => {
            if (err) {
                console.error(`Failed to append to conversation ${id}:`, err);
            }
        });
    }
    /**
     * 清除会话
     */
    clear(id) {
        this.conversations.delete(id);
        // 可选：是否删除文件？通常保留作为历史记录
        // if (this.dataDir) {
        //     const filePath = path.join(this.dataDir, `${id}.jsonl`);
        //     if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        // }
    }
    /**
     * 获取最近的历史消息（用于传给 LLM）
     * 不包含当前的最新消息，仅返回之前的历史
     */
    getHistory(id) {
        const conv = this.get(id);
        if (!conv)
            return [];
        // 返回纯净的消息对象（彻底删除 <audio> 标签和下载链接，不留任何痕迹）
        return conv.messages.map(m => ({
            role: m.role,
            content: m.content
                .replace(/<audio[^>]*>.*?<\/audio>/gi, "")
                .replace(/\[Audio was generated and played\]/gi, "")
                .replace(/\[Download\]\([^)]*\/generated\/[^)]*\)/gi, "")
                .replace(/\n{3,}/g, "\n\n")
                .trim() || m.content
        }));
    }
    /**
     * 获取历史消息，自动应用增量压缩（如果配置了 compaction）。
     * 使用三层渐进式压缩：Archival Summary → Rolling Summary → Working Memory
     */
    async getHistoryCompacted(id, overrideOpts) {
        const history = this.getHistory(id);
        const opts = overrideOpts ?? this.compactionOpts;
        if (!opts || opts.enabled === false || !needsCompaction(history, opts)) {
            return { history, compacted: false };
        }
        // 加载或创建压缩状态
        const state = this.getCompactionState(id);
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
            this.setCompactionState(id, result.state);
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
        return { history: result.messages, compacted: result.compacted };
    }
    /**
     * 强制执行上下文压缩（跳过 needsCompaction 检查）。
     * 用于用户手动触发 /compact 命令。
     * 如果历史消息过少（≤2）或未配置 compaction，返回 compacted: false。
     */
    async forceCompact(id) {
        const history = this.getHistory(id);
        const opts = this.compactionOpts;
        // 无压缩配置或历史太短，无法压缩
        if (!opts || history.length <= 2) {
            return { history, compacted: false };
        }
        const state = this.getCompactionState(id);
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
            this.setCompactionState(id, result.state);
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
    getCompactionState(id) {
        // 内存优先
        const cached = this.compactionStates.get(id);
        if (cached)
            return cached;
        // 尝试从磁盘加载
        if (this.dataDir) {
            const filePath = path.join(this.dataDir, `${id}.compaction.json`);
            try {
                if (fs.existsSync(filePath)) {
                    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                    this.compactionStates.set(id, data);
                    return data;
                }
            }
            catch {
                // 文件损坏，返回空状态
            }
        }
        const empty = createEmptyCompactionState();
        this.compactionStates.set(id, empty);
        return empty;
    }
    /**
     * 更新并持久化压缩状态
     */
    setCompactionState(id, state) {
        this.compactionStates.set(id, state);
        if (this.dataDir) {
            const filePath = path.join(this.dataDir, `${id}.compaction.json`);
            const data = JSON.stringify(state, null, 2);
            fs.writeFile(filePath, data, "utf-8", (err) => {
                if (err) {
                    console.error(`Failed to save compaction state for ${id}:`, err);
                }
            });
        }
    }
    /**
     * 设置房间成员列表缓存
     * @param conversationId 会话ID
     * @param members 成员列表
     * @param ttl 缓存有效期（毫秒），默认5分钟
     */
    setRoomMembersCache(conversationId, members, ttl = 5 * 60 * 1000) {
        const conv = this.get(conversationId);
        if (!conv)
            return;
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
    getRoomMembersCache(conversationId) {
        const conv = this.get(conversationId);
        if (!conv || !conv.roomMembersCache)
            return undefined;
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
    clearRoomMembersCache(conversationId) {
        const conv = this.get(conversationId);
        if (!conv)
            return;
        delete conv.roomMembersCache;
        conv.updatedAt = Date.now();
    }
}
//# sourceMappingURL=conversation.js.map