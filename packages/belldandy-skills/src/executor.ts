import crypto from "node:crypto";
import type { JsonObject } from "@belldandy/protocol";
import type { Tool, ToolCallRequest, ToolCallResult, ToolContext, ToolPolicy, ToolAuditLog, AgentCapabilities, ConversationStoreInterface, ITokenCounterService } from "./types.js";

/** 默认策略（最小权限） */
export const DEFAULT_POLICY: ToolPolicy = {
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
  /** 可选：运行时判断工具是否允许给指定 Agent 使用（用于 per-agent toolWhitelist） */
  isToolAllowedForAgent?: (toolName: string, agentId?: string) => boolean;
  /** 可选：会话存储（用于缓存等功能） */
  conversationStore?: ConversationStoreInterface;
  /** 可选：事件广播回调（用于工具主动推送事件到前端） */
  broadcast?: (event: string, payload: Record<string, unknown>) => void;
};

export class ToolExecutor {
  private readonly tools: Map<string, Tool>;
  private readonly workspaceRoot: string;
  private readonly extraWorkspaceRoots: string[];
  private readonly policy: ToolPolicy;
  private readonly auditLogger?: (log: ToolAuditLog) => void;
  private agentCapabilities?: AgentCapabilities;
  private readonly logger?: ToolExecutorLogger;
  private readonly isToolDisabled?: (toolName: string) => boolean;
  private readonly isToolAllowedForAgent?: (toolName: string, agentId?: string) => boolean;
  private conversationStore?: ConversationStoreInterface; // 移除 readonly，允许后期绑定
  private readonly tokenCounters = new Map<string, ITokenCounterService>(); // 每个 conversation 的 token 计数器
  private readonly broadcast?: (event: string, payload: Record<string, unknown>) => void;

  constructor(options: ToolExecutorOptions) {
    this.tools = new Map(options.tools.map(t => [t.definition.name, t]));
    this.workspaceRoot = options.workspaceRoot;
    this.extraWorkspaceRoots = options.extraWorkspaceRoots ?? [];
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.auditLogger = options.auditLogger;
    this.agentCapabilities = options.agentCapabilities;
    this.logger = options.logger;
    this.isToolDisabled = options.isToolDisabled;
    this.isToolAllowedForAgent = options.isToolAllowedForAgent;
    this.conversationStore = options.conversationStore;
    this.broadcast = options.broadcast;
  }

  /**
   * Late-bind agentCapabilities (for cases where the orchestrator is created after the executor).
   */
  setAgentCapabilities(caps: AgentCapabilities): void {
    this.agentCapabilities = caps;
  }

  /**
   * Late-bind conversationStore (for cases where the store is created after the executor).
   */
  setConversationStore(store: ConversationStoreInterface): void {
    this.conversationStore = store;
  }

  /**
   * Set token counter for a specific conversation (for task-level token tracking).
   */
  setTokenCounter(conversationId: string, counter: ITokenCounterService): void {
    this.tokenCounters.set(conversationId, counter);
  }

  /**
   * Clear token counter for a specific conversation (cleanup after run).
   */
  clearTokenCounter(conversationId: string): void {
    this.tokenCounters.delete(conversationId);
  }

  /**
   * Get token counter for a specific conversation (used by hooks for auto boundary detection).
   */
  getTokenCounter(conversationId: string): ITokenCounterService | undefined {
    return this.tokenCounters.get(conversationId);
  }

  /** 获取所有工具定义（用于发送给模型），已过滤禁用工具和 Agent 白名单 */
  getDefinitions(agentId?: string): { type: "function"; function: { name: string; description: string; parameters: object } }[] {
    const all = Array.from(this.tools.values());
    const active = all.filter((tool) => this.isToolAvailable(tool.definition.name, agentId));
    return active.map(t => ({
      type: "function" as const,
      function: {
        name: t.definition.name,
        description: t.definition.description,
        parameters: t.definition.parameters,
      },
    }));
  }

  /** 获取所有已注册工具名（不经过 disabled 过滤，用于调用设置列表） */
  getRegisteredToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 检查工具是否存在 */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /** 动态注册工具 */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.definition.name)) {
      (this.logger?.warn ?? console.warn)(`[ToolExecutor] 工具 "${tool.definition.name}" 已存在，将被覆盖`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  /** 动态注销工具 */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /** 获取已注册的工具数量 */
  getToolCount(): number {
    return this.tools.size;
  }

  /** 执行工具调用 */
  async execute(
    request: ToolCallRequest,
    conversationId: string,
    agentId?: string,
    userUuid?: string,
    senderInfo?: any,
    roomContext?: any,
  ): Promise<ToolCallResult> {
    const start = Date.now();

    const tool = this.tools.get(request.name);

    if (!tool) {
      const result: ToolCallResult = {
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

    // 防御性检查：拒绝已禁用或不在 Agent 白名单中的工具调用
    if (!this.isToolAvailable(request.name, agentId)) {
      const result: ToolCallResult = {
        id: request.id,
        name: request.name,
        success: false,
        output: "",
        error: this.buildToolUnavailableMessage(request.name, agentId),
        durationMs: Date.now() - start,
      };
      this.audit(result, conversationId, request.arguments);
      return result;
    }

    const context: ToolContext = {
      conversationId,
      workspaceRoot: this.workspaceRoot,
      extraWorkspaceRoots: this.extraWorkspaceRoots.length > 0 ? this.extraWorkspaceRoots : undefined,
      agentId,
      userUuid, // 传递UUID
      senderInfo, // 传递发送者信息
      roomContext, // 传递房间上下文
      conversationStore: this.conversationStore, // 传递会话存储（用于缓存）
      tokenCounter: this.tokenCounters.get(conversationId), // 传递 token 计数器（任务级统计）
      broadcast: this.broadcast, // 传递事件广播回调（扩展 B）
      policy: this.policy,
      agentCapabilities: this.agentCapabilities,
      logger: this.logger ? {
        info: (m) => this.logger!.info(m),
        warn: (m) => this.logger!.warn(m),
        error: (m) => this.logger!.error(m),
        debug: this.logger!.debug ? (m) => this.logger!.debug!(m) : () => {},
        trace: () => {},
      } : undefined,
    };

    try {
      const result = await tool.execute(request.arguments, context);
      // 确保 id 匹配请求
      result.id = request.id;
      result.durationMs = Date.now() - start;
      this.audit(result, conversationId, request.arguments);
      return result;
    } catch (err) {
      const result: ToolCallResult = {
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
  async executeAll(
    requests: ToolCallRequest[],
    conversationId: string,
    agentId?: string,
    userUuid?: string,
    senderInfo?: any,
    roomContext?: any,
  ): Promise<ToolCallResult[]> {
    return Promise.all(requests.map(req => this.execute(req, conversationId, agentId, userUuid, senderInfo, roomContext)));
  }

  private audit(result: ToolCallResult, conversationId: string, args: JsonObject): void {
    if (!this.auditLogger) return;

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

  private isToolAvailable(toolName: string, agentId?: string): boolean {
    if (this.isToolDisabled?.(toolName)) {
      return false;
    }

    if (this.isToolAllowedForAgent && !this.isToolAllowedForAgent(toolName, agentId)) {
      return false;
    }

    return true;
  }

  private buildToolUnavailableMessage(toolName: string, agentId?: string): string {
    if (this.isToolDisabled?.(toolName)) {
      return `工具 ${toolName} 已被禁用`;
    }

    const targetAgentId = typeof agentId === "string" && agentId.trim()
      ? agentId.trim()
      : "default";
    return `工具 ${toolName} 不允许给 Agent "${targetAgentId}" 使用`;
  }
}

/** 脱敏参数（移除可能的敏感字段） */
function sanitizeArgs(args: JsonObject): JsonObject {
  const sensitiveKeys = ["password", "token", "key", "secret", "api_key", "apikey"];
  const result: JsonObject = {};

  for (const [k, v] of Object.entries(args)) {
    if (sensitiveKeys.some(s => k.toLowerCase().includes(s))) {
      result[k] = "[REDACTED]";
    } else {
      result[k] = v;
    }
  }

  return result;
}
