import type { JsonObject } from "@belldandy/protocol";
export type { JsonObject };

/** 工具参数 schema（JSON Schema 子集，兼容 OpenAI function calling） */
export type ToolParameterSchema = {
  type: "object";
  properties: Record<string, {
    type: "string" | "number" | "boolean" | "array" | "object";
    description: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
  oneOf?: Array<{ required: string[] }>;
};

/** 工具定义（用于发送给模型） */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
};

/** 工具调用请求 */
export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: JsonObject;
};

/** 工具调用结果 */
export type ToolCallResult = {
  id: string;
  name: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
};

/** 运行命令策略 */
export type ToolExecPolicy = {
  /** 快速命令超时（毫秒） */
  quickTimeoutMs?: number;
  /** 构建/长任务超时（毫秒） */
  longTimeoutMs?: number;
  /** 额外标记为快速命令的可执行名 */
  quickCommands?: string[];
  /** 额外标记为长任务的可执行名 */
  longCommands?: string[];
  /** 额外允许的命令（加入 safelist） */
  extraSafelist?: string[];
  /** 额外禁止的命令（加入 blocklist） */
  extraBlocklist?: string[];
  /** 非交互参数策略 */
  nonInteractive?: {
    enabled?: boolean;
    /** 额外识别的非交互标记 */
    additionalFlags?: string[];
    /** 默认追加到所有命令的标记（谨慎使用） */
    defaultFlags?: string[];
    /** 特定命令的追加规则：key 支持 "cmd" 或 "cmd sub" */
    rules?: Record<string, string[] | string>;
  };
};

/** 文件写入策略 */
export type ToolFileWritePolicy = {
  /** 允许写入的扩展名（为空表示不限制） */
  allowedExtensions?: string[];
  /** 是否允许点文件（如 .gitignore） */
  allowDotFiles?: boolean;
  /** 是否允许 base64 写入（二进制） */
  allowBinary?: boolean;
};

/** 权限策略 */
export type ToolPolicy = {
  /** 文件读取允许路径（空 = 不限制，仅检查工作区边界） */
  allowedPaths: string[];
  /** 文件操作禁止路径 */
  deniedPaths: string[];
  /** 网络访问允许域名（空 = 允许所有公网域名） */
  allowedDomains: string[];
  /** 网络访问禁止域名 */
  deniedDomains: string[];
  /** 最大超时（毫秒） */
  maxTimeoutMs: number;
  /** 最大响应大小（字节） */
  maxResponseBytes: number;
  /** 命令执行策略（可选） */
  exec?: ToolExecPolicy;
  /** 文件写入策略（可选） */
  fileWrite?: ToolFileWritePolicy;
};

export type SubAgentResult = {
  success: boolean;
  output: string;
  error?: string;
  sessionId?: string;
};

export type SessionInfo = {
  id: string;
  parentId?: string;
  agentId?: string;
  status: "pending" | "running" | "done" | "error" | "timeout";
  createdAt: number;
  finishedAt?: number;
  summary?: string;
};

export type SpawnSubAgentOptions = {
  instruction: string;
  agentId?: string;
  context?: JsonObject;
  parentConversationId?: string;
};

export type AgentCapabilities = {
  spawnSubAgent?: (opts: SpawnSubAgentOptions) => Promise<SubAgentResult>;
  spawnParallel?: (tasks: SpawnSubAgentOptions[]) => Promise<SubAgentResult[]>;
  listSessions?: (parentConversationId?: string) => Promise<SessionInfo[]>;
};

/** 消息发送者信息 */
export type SenderInfo = {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string; // Agent的身份标签（如：舰长、CEO）
};

/** 房间成员信息 */
export type RoomMember = {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string; // Agent的身份标签
};

/** 房间上下文信息 */
export type RoomContext = {
  roomId?: string;
  environment: "local" | "community"; // 本地WebChat vs office.goddess.ai社区
  members?: RoomMember[];
};

/** Token 计数器服务接口（由 belldandy-agent 实现，此处定义以避免循环依赖） */
export interface ITokenCounterService {
  start(name: string): void;
  stop(name: string): { name: string; inputTokens: number; outputTokens: number; totalTokens: number; durationMs: number };
  list(): string[];
  notifyUsage(inputTokens: number, outputTokens: number): void;
  cleanup(): string[];
}

/** 工具执行上下文 */
export type ToolContext = {
  conversationId: string;
  workspaceRoot: string;
  /** 额外允许的文件操作根目录（如其他盘符下的目录），路径必须落在 workspaceRoot 或其一内 */
  extraWorkspaceRoots?: string[];
  /** 当前 Agent ID（用于 per-agent workspace 定位，如 switch_facet） */
  agentId?: string;
  /** 用户UUID（用于身份权力验证） */
  userUuid?: string;
  /** 消息发送者信息（用于身份上下文） */
  senderInfo?: SenderInfo;
  /** 房间上下文信息（用于多人聊天场景） */
  roomContext?: RoomContext;
  /** 会话存储（用于缓存等功能） */
  conversationStore?: ConversationStoreInterface;
  policy: ToolPolicy;
  agentCapabilities?: AgentCapabilities;
  /** Token 计数器（由 ToolEnabledAgent 注入，用于任务级 token 统计） */
  tokenCounter?: ITokenCounterService;
  /** 事件广播回调（由 Gateway 注入，用于工具主动推送事件到前端） */
  broadcast?: (event: string, payload: Record<string, unknown>) => void;
  logger?: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
    trace(message: string): void;
  };
};

/** ConversationStore 接口（避免循环依赖） */
export interface ConversationStoreInterface {
  setRoomMembersCache(
    conversationId: string,
    members: Array<{ type: "user" | "agent"; id: string; name?: string; identity?: string }>,
    ttl?: number,
  ): void;
  getRoomMembersCache(
    conversationId: string,
  ): Array<{ type: "user" | "agent"; id: string; name?: string; identity?: string }> | undefined;
  clearRoomMembersCache(conversationId: string): void;
}


/** 工具实现接口 */
export interface Tool {
  definition: ToolDefinition;
  execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult>;
}

/** 工具审计日志 */
export type ToolAuditLog = {
  timestamp: string;
  conversationId: string;
  toolName: string;
  arguments: JsonObject;
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
};
