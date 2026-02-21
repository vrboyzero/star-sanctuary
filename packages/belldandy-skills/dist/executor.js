/** 默认策略（最小权限） */
export const DEFAULT_POLICY = {
    allowedPaths: [],
    deniedPaths: [".git", "node_modules", ".env"],
    allowedDomains: [],
    deniedDomains: [],
    maxTimeoutMs: 30_000,
    maxResponseBytes: 512_000,
    exec: {
        quickTimeoutMs: 5_000,
        longTimeoutMs: 300_000,
        nonInteractive: { enabled: true },
    },
};
export class ToolExecutor {
    tools;
    workspaceRoot;
    extraWorkspaceRoots;
    policy;
    auditLogger;
    agentCapabilities;
    logger;
    isToolDisabled;
    conversationStore; // 移除 readonly，允许后期绑定
    constructor(options) {
        this.tools = new Map(options.tools.map(t => [t.definition.name, t]));
        this.workspaceRoot = options.workspaceRoot;
        this.extraWorkspaceRoots = options.extraWorkspaceRoots ?? [];
        this.policy = { ...DEFAULT_POLICY, ...options.policy };
        this.auditLogger = options.auditLogger;
        this.agentCapabilities = options.agentCapabilities;
        this.logger = options.logger;
        this.isToolDisabled = options.isToolDisabled;
        this.conversationStore = options.conversationStore;
    }
    /**
     * Late-bind agentCapabilities (for cases where the orchestrator is created after the executor).
     */
    setAgentCapabilities(caps) {
        this.agentCapabilities = caps;
    }
    /**
     * Late-bind conversationStore (for cases where the store is created after the executor).
     */
    setConversationStore(store) {
        this.conversationStore = store;
    }
    /** 获取所有工具定义（用于发送给模型），已过滤禁用工具 */
    getDefinitions() {
        const all = Array.from(this.tools.values());
        const active = this.isToolDisabled
            ? all.filter(t => !this.isToolDisabled(t.definition.name))
            : all;
        return active.map(t => ({
            type: "function",
            function: {
                name: t.definition.name,
                description: t.definition.description,
                parameters: t.definition.parameters,
            },
        }));
    }
    /** 获取所有已注册工具名（不经过 disabled 过滤，用于调用设置列表） */
    getRegisteredToolNames() {
        return Array.from(this.tools.keys());
    }
    /** 检查工具是否存在 */
    hasTool(name) {
        return this.tools.has(name);
    }
    /** 动态注册工具 */
    registerTool(tool) {
        if (this.tools.has(tool.definition.name)) {
            (this.logger?.warn ?? console.warn)(`[ToolExecutor] 工具 "${tool.definition.name}" 已存在，将被覆盖`);
        }
        this.tools.set(tool.definition.name, tool);
    }
    /** 动态注销工具 */
    unregisterTool(name) {
        return this.tools.delete(name);
    }
    /** 获取已注册的工具数量 */
    getToolCount() {
        return this.tools.size;
    }
    /** 执行工具调用 */
    async execute(request, conversationId, agentId, userUuid, senderInfo, roomContext) {
        const start = Date.now();
        // 防御性检查：拒绝已禁用的工具调用
        if (this.isToolDisabled?.(request.name)) {
            const result = {
                id: request.id,
                name: request.name,
                success: false,
                output: "",
                error: `工具 ${request.name} 已被禁用`,
                durationMs: Date.now() - start,
            };
            this.audit(result, conversationId, request.arguments);
            return result;
        }
        const tool = this.tools.get(request.name);
        if (!tool) {
            const result = {
                id: request.id,
                name: request.name,
                success: false,
                output: "",
                error: `未知工具：${request.name}`,
                durationMs: Date.now() - start,
            };
            this.audit(result, conversationId, request.arguments);
            return result;
        }
        const context = {
            conversationId,
            workspaceRoot: this.workspaceRoot,
            extraWorkspaceRoots: this.extraWorkspaceRoots.length > 0 ? this.extraWorkspaceRoots : undefined,
            agentId,
            userUuid, // 传递UUID
            senderInfo, // 传递发送者信息
            roomContext, // 传递房间上下文
            conversationStore: this.conversationStore, // 传递会话存储（用于缓存）
            policy: this.policy,
            agentCapabilities: this.agentCapabilities,
            logger: this.logger ? {
                info: (m) => this.logger.info(m),
                warn: (m) => this.logger.warn(m),
                error: (m) => this.logger.error(m),
                debug: this.logger.debug ? (m) => this.logger.debug(m) : () => { },
                trace: () => { },
            } : undefined,
        };
        try {
            const result = await tool.execute(request.arguments, context);
            // 确保 id 匹配请求
            result.id = request.id;
            result.durationMs = Date.now() - start;
            this.audit(result, conversationId, request.arguments);
            return result;
        }
        catch (err) {
            const result = {
                id: request.id,
                name: request.name,
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
            this.audit(result, conversationId, request.arguments);
            return result;
        }
    }
    /** 批量执行（并行） */
    async executeAll(requests, conversationId, agentId, userUuid, senderInfo, roomContext) {
        return Promise.all(requests.map(req => this.execute(req, conversationId, agentId, userUuid, senderInfo, roomContext)));
    }
    audit(result, conversationId, args) {
        if (!this.auditLogger)
            return;
        // 脱敏：不记录可能包含敏感信息的完整输出
        const safeOutput = result.output.length > 200
            ? result.output.slice(0, 200) + "...(truncated)"
            : result.output;
        this.auditLogger({
            timestamp: new Date().toISOString(),
            conversationId,
            toolName: result.name,
            arguments: sanitizeArgs(args),
            success: result.success,
            output: safeOutput,
            error: result.error,
            durationMs: result.durationMs,
        });
    }
}
/** 脱敏参数（移除可能的敏感字段） */
function sanitizeArgs(args) {
    const sensitiveKeys = ["password", "token", "key", "secret", "api_key", "apikey"];
    const result = {};
    for (const [k, v] of Object.entries(args)) {
        if (sensitiveKeys.some(s => k.toLowerCase().includes(s))) {
            result[k] = "[REDACTED]";
        }
        else {
            result[k] = v;
        }
    }
    return result;
}
//# sourceMappingURL=executor.js.map