import type { Tool, ToolCallRequest, ToolCallResult, ToolPolicy, ToolAuditLog, AgentCapabilities, ConversationStoreInterface, ITokenCounterService } from "./types.js";
/** 默认策略（最小权限） */
export declare const DEFAULT_POLICY: ToolPolicy;
/** Logger 接口，供工具在 context 中使用 */
export type ToolExecutorLogger = {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug?(message: string): void;
};
export type ToolExecutorOptions = {
    tools: Tool[];
    workspaceRoot: string;
    /** 额外允许的文件操作根目录（Agent 可读写这些目录下的文件） */
    extraWorkspaceRoots?: string[];
    policy?: Partial<ToolPolicy>;
    auditLogger?: (log: ToolAuditLog) => void;
    agentCapabilities?: AgentCapabilities;
    /** 可选：传入后注入到 ToolContext，供工具使用 */
    logger?: ToolExecutorLogger;
    /** 可选：运行时判断工具是否被禁用（用于调用设置开关） */
    isToolDisabled?: (toolName: string) => boolean;
    /** 可选：会话存储（用于缓存等功能） */
    conversationStore?: ConversationStoreInterface;
    /** 可选：事件广播回调（用于工具主动推送事件到前端） */
    broadcast?: (event: string, payload: Record<string, unknown>) => void;
};
export declare class ToolExecutor {
    private readonly tools;
    private readonly workspaceRoot;
    private readonly extraWorkspaceRoots;
    private readonly policy;
    private readonly auditLogger?;
    private agentCapabilities?;
    private readonly logger?;
    private readonly isToolDisabled?;
    private conversationStore?;
    private readonly tokenCounters;
    private readonly broadcast?;
    constructor(options: ToolExecutorOptions);
    /**
     * Late-bind agentCapabilities (for cases where the orchestrator is created after the executor).
     */
    setAgentCapabilities(caps: AgentCapabilities): void;
    /**
     * Late-bind conversationStore (for cases where the store is created after the executor).
     */
    setConversationStore(store: ConversationStoreInterface): void;
    /**
     * Set token counter for a specific conversation (for task-level token tracking).
     */
    setTokenCounter(conversationId: string, counter: ITokenCounterService): void;
    /**
     * Clear token counter for a specific conversation (cleanup after run).
     */
    clearTokenCounter(conversationId: string): void;
    /** 获取所有工具定义（用于发送给模型），已过滤禁用工具 */
    getDefinitions(): {
        type: "function";
        function: {
            name: string;
            description: string;
            parameters: object;
        };
    }[];
    /** 获取所有已注册工具名（不经过 disabled 过滤，用于调用设置列表） */
    getRegisteredToolNames(): string[];
    /** 检查工具是否存在 */
    hasTool(name: string): boolean;
    /** 动态注册工具 */
    registerTool(tool: Tool): void;
    /** 动态注销工具 */
    unregisterTool(name: string): boolean;
    /** 获取已注册的工具数量 */
    getToolCount(): number;
    /** 执行工具调用 */
    execute(request: ToolCallRequest, conversationId: string, agentId?: string, userUuid?: string, senderInfo?: any, roomContext?: any): Promise<ToolCallResult>;
    /** 批量执行（并行） */
    executeAll(requests: ToolCallRequest[], conversationId: string, agentId?: string, userUuid?: string, senderInfo?: any, roomContext?: any): Promise<ToolCallResult[]>;
    private audit;
}
//# sourceMappingURL=executor.d.ts.map