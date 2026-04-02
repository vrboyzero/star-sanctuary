import crypto from "node:crypto";
import type { JsonObject } from "@belldandy/protocol";
import type {
  Tool,
  ToolCallRequest,
  ToolCallResult,
  ToolContext,
  ToolPolicy,
  ToolAuditLog,
  AgentCapabilities,
  GoalCapabilities,
  ConversationStoreInterface,
  ITokenCounterService,
  ToolExecutionRuntimeContext,
  ToolRuntimeLaunchSpec,
} from "./types.js";
import { getToolContract, type ToolContract } from "./tool-contract.js";
import {
  evaluateLaunchPermissionMode,
  evaluateLaunchRolePolicy,
  normalizeLaunchAllowedToolFamilies,
  normalizeLaunchMaxToolRiskLevel,
  normalizeLaunchRole,
} from "./runtime-policy.js";
import {
  evaluateToolContractAccess,
  type ToolContractDenialReason,
  type ToolContractAccessDecision,
  type ToolContractAccessPolicy,
} from "./security-matrix.js";

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
  /** 始终可用的保留工具名（不受 disabled 开关影响） */
  alwaysEnabledTools?: string[];
  policy?: Partial<ToolPolicy>;
  auditLogger?: (log: ToolAuditLog) => void;
  agentCapabilities?: AgentCapabilities;
  goalCapabilities?: GoalCapabilities;
  /** 可选：传入后注入到 ToolContext，供工具使用 */
  logger?: ToolExecutorLogger;
  /** 可选：运行时判断工具是否被禁用（用于调用设置开关） */
  isToolDisabled?: (toolName: string) => boolean;
  /** 可选：运行时判断工具是否允许给指定 Agent 使用（用于 per-agent toolWhitelist） */
  isToolAllowedForAgent?: (toolName: string, agentId?: string) => boolean;
  /** 可选：运行时判断工具是否允许在指定会话中使用（用于 goal channel 等场景） */
  isToolAllowedInConversation?: (toolName: string, conversationId: string, agentId?: string) => boolean;
  /** 可选：会话存储（用于缓存等功能） */
  conversationStore?: ConversationStoreInterface;
  /** 可选：事件广播回调（用于工具主动推送事件到前端） */
  broadcast?: (event: string, payload: Record<string, unknown>) => void;
  /** 可选：仅用于运行时观测的工具广播观察器 */
  broadcastObserver?: (event: string, payload: Record<string, unknown>, meta: {
    conversationId: string;
    agentId?: string;
    toolName: string;
  }) => void;
  /** 可选：统一 contract 安全矩阵策略 */
  contractAccessPolicy?: ToolContractAccessPolicy;
};

type RegisterToolOptions = {
  silentReplace?: boolean;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => normalizeOptionalString(item))
    .filter((item): item is string => Boolean(item));
  return items.length > 0 ? [...new Set(items)] : undefined;
}

function normalizeRuntimeLaunchSpec(value: ToolRuntimeLaunchSpec | undefined): ToolRuntimeLaunchSpec | undefined {
  if (!value) return undefined;
  const normalized: ToolRuntimeLaunchSpec = {
    profileId: normalizeOptionalString(value.profileId),
    channel: normalizeOptionalString(value.channel),
    background: typeof value.background === "boolean" ? value.background : undefined,
    timeoutMs: Number.isFinite(Number(value.timeoutMs)) && Number(value.timeoutMs) > 0 ? Number(value.timeoutMs) : undefined,
    cwd: normalizeOptionalString(value.cwd),
    toolSet: normalizeStringList(value.toolSet),
    permissionMode: normalizeOptionalString(value.permissionMode),
    isolationMode: normalizeOptionalString(value.isolationMode),
    parentTaskId: normalizeOptionalString(value.parentTaskId),
    role: normalizeLaunchRole(value.role),
    allowedToolFamilies: normalizeLaunchAllowedToolFamilies(value.allowedToolFamilies),
    maxToolRiskLevel: normalizeLaunchMaxToolRiskLevel(value.maxToolRiskLevel),
    policySummary: normalizeOptionalString(value.policySummary),
  };
  return Object.values(normalized).some((item) => item !== undefined) ? normalized : undefined;
}

export type ToolAvailabilityReasonCode =
  | "available"
  | "blocked-by-security-matrix"
  | "unsupported-channel"
  | "outside-safe-scope"
  | "missing-contract"
  | "disabled-by-settings"
  | "not-in-agent-whitelist"
  | "conversation-restricted"
  | "excluded-by-launch-toolset"
  | "blocked-by-launch-role-policy"
  | "blocked-by-launch-permission-mode";

export interface ToolAvailabilityState {
  name: string;
  available: boolean;
  alwaysEnabled: boolean;
  reasonCode: ToolAvailabilityReasonCode;
  reasonMessage: string;
  contractReason?: ToolContractDenialReason;
}

export class ToolExecutor {
  private readonly tools: Map<string, Tool>;
  private readonly workspaceRoot: string;
  private readonly extraWorkspaceRoots: string[];
  private readonly alwaysEnabledTools: Set<string>;
  private readonly policy: ToolPolicy;
  private readonly auditLogger?: (log: ToolAuditLog) => void;
  private agentCapabilities?: AgentCapabilities;
  private goalCapabilities?: GoalCapabilities;
  private readonly logger?: ToolExecutorLogger;
  private readonly isToolDisabled?: (toolName: string) => boolean;
  private readonly isToolAllowedForAgent?: (toolName: string, agentId?: string) => boolean;
  private readonly isToolAllowedInConversation?: (toolName: string, conversationId: string, agentId?: string) => boolean;
  private readonly contractAccessPolicy?: ToolContractAccessPolicy;
  private conversationStore?: ConversationStoreInterface; // 移除 readonly，允许后期绑定
  private readonly tokenCounters = new Map<string, ITokenCounterService>(); // 每个 conversation 的 token 计数器
  private broadcast?: (event: string, payload: Record<string, unknown>) => void;
  private broadcastObserver?: (event: string, payload: Record<string, unknown>, meta: {
    conversationId: string;
    agentId?: string;
    toolName: string;
  }) => void;

  constructor(options: ToolExecutorOptions) {
    this.tools = new Map(options.tools.map(t => [t.definition.name, t]));
    this.workspaceRoot = options.workspaceRoot;
    this.extraWorkspaceRoots = options.extraWorkspaceRoots ?? [];
    this.alwaysEnabledTools = new Set(options.alwaysEnabledTools ?? []);
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.auditLogger = options.auditLogger;
    this.agentCapabilities = options.agentCapabilities;
    this.goalCapabilities = options.goalCapabilities;
    this.logger = options.logger;
    this.isToolDisabled = options.isToolDisabled;
    this.isToolAllowedForAgent = options.isToolAllowedForAgent;
    this.isToolAllowedInConversation = options.isToolAllowedInConversation;
    this.contractAccessPolicy = options.contractAccessPolicy;
    this.conversationStore = options.conversationStore;
    this.broadcast = options.broadcast;
    this.broadcastObserver = options.broadcastObserver;
  }

  /**
   * Late-bind agentCapabilities (for cases where the orchestrator is created after the executor).
   */
  setAgentCapabilities(caps: AgentCapabilities): void {
    this.agentCapabilities = caps;
  }

  setGoalCapabilities(caps: GoalCapabilities): void {
    this.goalCapabilities = caps;
  }

  /**
   * Late-bind conversationStore (for cases where the store is created after the executor).
   */
  setConversationStore(store: ConversationStoreInterface): void {
    this.conversationStore = store;
  }

  setBroadcast(
    broadcast?: (event: string, payload: Record<string, unknown>) => void,
  ): void {
    this.broadcast = broadcast;
  }

  setBroadcastObserver(
    observer?: (event: string, payload: Record<string, unknown>, meta: {
      conversationId: string;
      agentId?: string;
      toolName: string;
    }) => void,
  ): void {
    this.broadcastObserver = observer;
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
  getDefinitions(
    agentId?: string,
    conversationId?: string,
    runtimeContext?: ToolExecutionRuntimeContext,
  ): { type: "function"; function: { name: string; description: string; parameters: object } }[] {
    const active = this.getAvailableTools(agentId, conversationId, runtimeContext);
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

  /** 获取单个工具在当前上下文下的可见性结果 */
  getToolAvailability(
    toolName: string,
    agentId?: string,
    conversationId?: string,
    runtimeContext?: ToolExecutionRuntimeContext,
  ): ToolAvailabilityState | undefined {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return undefined;
    }
    return this.evaluateToolAvailability(tool, agentId, conversationId, runtimeContext);
  }

  /** 获取所有已注册工具在当前上下文下的可见性结果 */
  getRegisteredToolAvailabilities(
    agentId?: string,
    conversationId?: string,
    runtimeContext?: ToolExecutionRuntimeContext,
  ): ToolAvailabilityState[] {
    return Array.from(this.tools.values()).map((tool) =>
      this.evaluateToolAvailability(tool, agentId, conversationId, runtimeContext),
    );
  }

  /** 获取当前运行时可见的工具契约元数据 */
  getContracts(agentId?: string, conversationId?: string, runtimeContext?: ToolExecutionRuntimeContext): ToolContract[] {
    return this.getAvailableTools(agentId, conversationId, runtimeContext).flatMap((tool) => {
      const contract = getToolContract(tool);
      return contract ? [contract] : [];
    });
  }

  /** 获取所有已注册工具的契约元数据（不过滤 disabled / allowlist） */
  getRegisteredToolContracts(): ToolContract[] {
    return Array.from(this.tools.values()).flatMap((tool) => {
      const contract = getToolContract(tool);
      return contract ? [contract] : [];
    });
  }

  /** 检查工具是否存在 */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /** 动态注册工具 */
  registerTool(tool: Tool, options?: RegisterToolOptions): void {
    if (this.tools.has(tool.definition.name) && !options?.silentReplace) {
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
    runtimeContext?: ToolExecutionRuntimeContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const launchSpec = normalizeRuntimeLaunchSpec(runtimeContext?.launchSpec);

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
    const availability = this.evaluateToolAvailability(tool, agentId, conversationId, runtimeContext);
    if (!availability.allowed) {
      const result: ToolCallResult = {
        id: request.id,
        name: request.name,
        success: false,
        output: "",
        error: availability.reasonMessage,
        durationMs: Date.now() - start,
      };
      this.audit(result, conversationId, request.arguments);
      return result;
    }

    const context: ToolContext = {
      conversationId,
      workspaceRoot: this.workspaceRoot,
      extraWorkspaceRoots: this.extraWorkspaceRoots.length > 0 ? this.extraWorkspaceRoots : undefined,
      defaultCwd: launchSpec?.cwd,
      agentId,
      launchSpec,
      userUuid, // 传递UUID
      senderInfo, // 传递发送者信息
      roomContext, // 传递房间上下文
      conversationStore: this.conversationStore, // 传递会话存储（用于缓存）
      tokenCounter: this.tokenCounters.get(conversationId), // 传递 token 计数器（任务级统计）
      broadcast: this.broadcast
        ? (event, payload) => {
          const broadcast = this.broadcast;
          this.broadcastObserver?.(event, payload, {
            conversationId,
            agentId,
            toolName: request.name,
          });
          broadcast?.(event, payload);
        }
        : undefined, // 传递事件广播回调（扩展 B）
      policy: this.policy,
      agentCapabilities: this.agentCapabilities,
      goalCapabilities: this.goalCapabilities,
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
    runtimeContext?: ToolExecutionRuntimeContext,
  ): Promise<ToolCallResult[]> {
    return Promise.all(requests.map(req => this.execute(req, conversationId, agentId, userUuid, senderInfo, roomContext, runtimeContext)));
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

  private evaluateToolAvailability(
    tool: Tool,
    agentId?: string,
    conversationId?: string,
    runtimeContext?: ToolExecutionRuntimeContext,
  ):
    | ({ allowed: true } & ToolAvailabilityState)
    | ({ allowed: false } & ToolAvailabilityState & { reason: "contract" | "runtime" | "disabled" | "agent" | "conversation"; contractDecision?: ToolContractAccessDecision }) {
    const toolName = tool.definition.name;
    const alwaysEnabled = this.alwaysEnabledTools.has(toolName);
    const launchSpec = normalizeRuntimeLaunchSpec(runtimeContext?.launchSpec);

    if (this.contractAccessPolicy) {
      const contractDecision = evaluateToolContractAccess(tool, this.contractAccessPolicy);
      if (!contractDecision.allowed) {
        return {
          ...this.buildAvailabilityState(toolName, alwaysEnabled, false, contractDecision.reason),
          allowed: false,
          reason: "contract",
          contractDecision,
        };
      }
    }

    if (launchSpec?.toolSet && !launchSpec.toolSet.includes(toolName)) {
      return {
        ...this.buildAvailabilityState(toolName, alwaysEnabled, false, "excluded-by-launch-toolset"),
        allowed: false,
        reason: "runtime",
      };
    }

    const rolePolicyDecision = evaluateLaunchRolePolicy(tool, launchSpec);
    if (!rolePolicyDecision.allowed) {
      return {
        name: toolName,
        available: false,
        alwaysEnabled,
        reasonCode: "blocked-by-launch-role-policy",
        reasonMessage: rolePolicyDecision.reasonMessage,
        allowed: false,
        reason: "runtime",
      };
    }

    const permissionDecision = evaluateLaunchPermissionMode(tool, launchSpec);
    if (!permissionDecision.allowed) {
      return {
        name: toolName,
        available: false,
        alwaysEnabled,
        reasonCode: "blocked-by-launch-permission-mode",
        reasonMessage: permissionDecision.reasonMessage,
        allowed: false,
        reason: "runtime",
      };
    }

    if (!alwaysEnabled && this.isToolDisabled?.(toolName)) {
      return {
        ...this.buildAvailabilityState(toolName, alwaysEnabled, false, "disabled-by-settings"),
        allowed: false,
        reason: "disabled",
      };
    }

    if (this.isToolAllowedForAgent && !this.isToolAllowedForAgent(toolName, agentId)) {
      return {
        ...this.buildAvailabilityState(toolName, alwaysEnabled, false, "not-in-agent-whitelist"),
        allowed: false,
        reason: "agent",
      };
    }

    if (conversationId && this.isToolAllowedInConversation && !this.isToolAllowedInConversation(toolName, conversationId, agentId)) {
      return {
        ...this.buildAvailabilityState(toolName, alwaysEnabled, false, "conversation-restricted"),
        allowed: false,
        reason: "conversation",
      };
    }

    return {
      ...this.buildAvailabilityState(toolName, alwaysEnabled, true, "available"),
      allowed: true,
    };
  }

  private getAvailableTools(
    agentId?: string,
    conversationId?: string,
    runtimeContext?: ToolExecutionRuntimeContext,
  ): Tool[] {
    return Array.from(this.tools.values()).filter((tool) =>
      this.evaluateToolAvailability(tool, agentId, conversationId, runtimeContext).allowed,
    );
  }

  private buildAvailabilityState(
    toolName: string,
    alwaysEnabled: boolean,
    available: boolean,
    reason: ToolAvailabilityReasonCode | ToolContractDenialReason | undefined,
  ): ToolAvailabilityState {
    const normalizedReason = this.normalizeAvailabilityReasonCode(reason);
    return {
      name: toolName,
      available,
      alwaysEnabled,
      reasonCode: normalizedReason,
      reasonMessage: this.describeAvailabilityReason(toolName, normalizedReason),
      contractReason: this.isContractDenialReason(reason) ? reason : undefined,
    };
  }

  private normalizeAvailabilityReasonCode(
    reason: ToolAvailabilityReasonCode | ToolContractDenialReason | undefined,
  ): ToolAvailabilityReasonCode {
    switch (reason) {
      case "available":
      case "disabled-by-settings":
      case "not-in-agent-whitelist":
      case "conversation-restricted":
      case "excluded-by-launch-toolset":
      case "blocked-by-launch-role-policy":
      case "blocked-by-launch-permission-mode":
        return reason;
      case "channel":
        return "unsupported-channel";
      case "safe-scope":
        return "outside-safe-scope";
      case "missing-contract":
        return "missing-contract";
      case "blocked":
        return "blocked-by-security-matrix";
      default:
        return "blocked-by-security-matrix";
    }
  }

  private isContractDenialReason(
    reason: ToolAvailabilityReasonCode | ToolContractDenialReason | undefined,
  ): reason is ToolContractDenialReason {
    return reason === "blocked" || reason === "channel" || reason === "safe-scope" || reason === "missing-contract";
  }

  private describeAvailabilityReason(
    toolName: string,
    reasonCode: ToolAvailabilityReasonCode,
  ): string {
    switch (reasonCode) {
      case "available":
        return `工具 ${toolName} 当前可用`;
      case "blocked-by-security-matrix":
        return `工具 ${toolName} 当前被安全矩阵阻止`;
      case "unsupported-channel":
        return `工具 ${toolName} 不允许在当前端使用`;
      case "outside-safe-scope":
        return `工具 ${toolName} 超出当前安全域`;
      case "missing-contract":
        return `工具 ${toolName} 缺少 contract，当前安全矩阵不允许使用`;
      case "disabled-by-settings":
        return `工具 ${toolName} 已被禁用`;
      case "not-in-agent-whitelist":
        return `工具 ${toolName} 不在当前 Agent 白名单内`;
      case "conversation-restricted":
        return `工具 ${toolName} 不允许在当前会话中使用`;
      case "excluded-by-launch-toolset":
        return `工具 ${toolName} 不在当前 launchSpec 的 toolSet 内`;
      case "blocked-by-launch-role-policy":
        return `工具 ${toolName} 被当前 launchSpec 的 role policy 阻止`;
      case "blocked-by-launch-permission-mode":
        return `工具 ${toolName} 被当前 launchSpec 的 permissionMode 阻止`;
      default:
        return `工具 ${toolName} 当前不可用`;
    }
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
