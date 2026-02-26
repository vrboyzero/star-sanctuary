import { type CompactionOptions, type CompactionState, type SummarizerFn } from "./compaction.js";
/**
 * 对话消息
 */
export type ConversationMessage = {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    /** 产生此消息的 Agent Profile ID（多 Agent 预留） */
    agentId?: string;
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
        cachedAt: number;
        ttl: number;
    };
    /** 跨 run 持久化的活跃 token 计数器快照 */
    activeCounters?: ActiveCounterSnapshot[];
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
    onBeforeCompaction?: (event: {
        messageCount: number;
        tokenCount?: number;
        tier?: string;
        source?: string;
    }) => void;
    /** 压缩后回调（用于接入 hook 系统） */
    onAfterCompaction?: (event: {
        messageCount: number;
        tokenCount?: number;
        compactedCount: number;
        tier?: string;
        source?: string;
        originalTokenCount?: number;
    }) => void;
};
/**
 * 会话存储
 * 用于管理对话上下文历史，支持文件持久化 (JSONL)
 */
export declare class ConversationStore {
    private conversations;
    private compactionStates;
    private readonly maxHistory;
    private readonly ttlSeconds;
    private readonly dataDir?;
    private readonly compactionOpts?;
    private readonly summarizer?;
    private readonly onBeforeCompaction?;
    private readonly onAfterCompaction?;
    constructor(options?: ConversationStoreOptions);
    /**
     * 获取会话
     * 优先从内存获取，若无则尝试从文件加载
     */
    get(id: string): Conversation | undefined;
    /**
     * 从文件加载会话
     */
    private loadFromFile;
    /**
     * 添加消息到会话
     * 如果会话不存在会自动创建
     */
    addMessage(id: string, role: "user" | "assistant", content: string, opts?: {
        agentId?: string;
        channel?: string;
    }): void;
    /**
     * 追加消息到文件
     */
    private appendToFile;
    /**
     * 清除会话
     */
    clear(id: string): void;
    /**
     * 获取最近的历史消息（用于传给 LLM）
     * 不包含当前的最新消息，仅返回之前的历史
     */
    getHistory(id: string): Array<{
        role: "user" | "assistant";
        content: string;
    }>;
    /**
     * 获取历史消息，自动应用增量压缩（如果配置了 compaction）。
     * 使用三层渐进式压缩：Archival Summary → Rolling Summary → Working Memory
     */
    getHistoryCompacted(id: string, overrideOpts?: CompactionOptions): Promise<{
        history: Array<{
            role: "user" | "assistant";
            content: string;
        }>;
        compacted: boolean;
    }>;
    /**
     * 强制执行上下文压缩（跳过 needsCompaction 检查）。
     * 用于用户手动触发 /compact 命令。
     * 如果历史消息过少（≤2）或未配置 compaction，返回 compacted: false。
     */
    forceCompact(id: string): Promise<{
        history: Array<{
            role: "user" | "assistant";
            content: string;
        }>;
        compacted: boolean;
        originalTokens?: number;
        compactedTokens?: number;
        tier?: string;
    }>;
    /**
     * 获取会话的压缩状态
     */
    getCompactionState(id: string): CompactionState;
    /**
     * 更新并持久化压缩状态
     */
    setCompactionState(id: string, state: CompactionState): void;
    /**
     * 保存活跃 token 计数器快照（跨 run 持久化）
     */
    setActiveCounters(conversationId: string, snapshots: ActiveCounterSnapshot[]): void;
    /**
     * 获取活跃 token 计数器快照
     */
    getActiveCounters(conversationId: string): ActiveCounterSnapshot[];
    /**
     * 设置房间成员列表缓存
     * @param conversationId 会话ID
     * @param members 成员列表
     * @param ttl 缓存有效期（毫秒），默认5分钟
     */
    setRoomMembersCache(conversationId: string, members: Array<{
        type: "user" | "agent";
        id: string;
        name?: string;
        identity?: string;
    }>, ttl?: number): void;
    /**
     * 获取房间成员列表缓存
     * @param conversationId 会话ID
     * @returns 成员列表，如果缓存过期或不存在则返回undefined
     */
    getRoomMembersCache(conversationId: string): Array<{
        type: "user" | "agent";
        id: string;
        name?: string;
        identity?: string;
    }> | undefined;
    /**
     * 清除房间成员列表缓存
     * @param conversationId 会话ID
     */
    clearRoomMembersCache(conversationId: string): void;
}
//# sourceMappingURL=conversation.d.ts.map