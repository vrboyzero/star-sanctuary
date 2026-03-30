export type JsonObject = Record<string, unknown>;

export {
  STATE_DIR_ENV_KEY,
  STATE_DIR_WINDOWS_ENV_KEY,
  STATE_DIR_WSL_ENV_KEY,
  LEGACY_STATE_DIR_BASENAME,
  DEFAULT_STATE_DIR_BASENAME,
  LEGACY_STATE_DIR_DISPLAY,
  DEFAULT_STATE_DIR_DISPLAY,
  resolveNamedCompatDir,
  resolveDefaultStateDir,
  resolveStateDir,
  resolveWorkspaceStateDir,
} from "./state-dir.js";

export type { TokenUsageUploadConfig, TokenUsageUploadLogger } from "./token-usage-upload.js";
export { uploadTokenUsage } from "./token-usage-upload.js";
export { extractOwnerUuid } from "./identity.js";

export type BelldandyRole = "web" | "cli" | "node";

export type GatewayAuth =
  | { mode: "token"; token: string }
  | { mode: "password"; password: string }
  | { mode: "none" };

export type ConnectChallengeFrame = {
  type: "connect.challenge";
  nonce: string;
};

export type ConnectRequestFrame = {
  type: "connect";
  role: BelldandyRole;
  clientId?: string;
  auth?: GatewayAuth;
  clientName?: string;
  clientVersion?: string;
  /** 用户UUID（可选，用于身份权力验证） */
  userUuid?: string;
};

export type HelloOkFrame = {
  type: "hello-ok";
  sessionId: string;
  role: BelldandyRole;
  methods: string[];
  events: string[];
  version?: string;
  agentName?: string;      // Agent 名称（从 IDENTITY.md 提取）
  agentAvatar?: string;    // Agent 头像（Emoji 或 URL）
  userName?: string;       // 用户名称（从 USER.md 提取）
  userAvatar?: string;     // 用户头像（Emoji 或 URL）
  /** 是否支持UUID验证（告知客户端当前环境是否支持UUID） */
  supportsUuid?: boolean;
  /** false 表示 AI 模型尚未配置（无 API Key），前端应自动弹出设置面板引导用户 */
  configOk?: boolean;
};

export type GatewayReqFrame = {
  type: "req";
  id: string;
  method: string;
  params?: JsonObject;
};

export type GatewayResFrame =
  | { type: "res"; id: string; ok: true; payload?: JsonObject }
  | { type: "res"; id: string; ok: false; error: { code: string; message: string } };

export type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: JsonObject;
};

export type GatewayFrame =
  | ConnectChallengeFrame
  | ConnectRequestFrame
  | HelloOkFrame
  | GatewayReqFrame
  | GatewayResFrame
  | GatewayEventFrame;

export type MessageSendParams = {
  conversationId?: string;
  text: string;
  from?: string;
  clientContext?: {
    sentAtMs?: number;
    timezoneOffsetMinutes?: number;
    locale?: string;
  };
  /** 指定使用的 Agent Profile ID（可选，缺省使用 "default"） */
  agentId?: string;
  /** 指定使用的模型 ID（可选，缺省使用默认模型） */
  modelId?: string;
  /** 用户UUID（可选，用于身份权力验证） */
  userUuid?: string;
  /** 消息发送者信息（用于身份上下文） */
  senderInfo?: {
    type: "user" | "agent";
    id: string;
    name?: string;
    identity?: string; // Agent的身份标签（如：舰长、CEO）
  };
  /** 房间上下文信息（用于多人聊天场景） */
  roomContext?: {
    roomId?: string;
    environment: "local" | "community"; // 本地WebChat vs office.goddess.ai社区
    clientId?: string;
    members?: Array<{
      type: "user" | "agent";
      id: string;
      name?: string;
      identity?: string; // Agent的身份标签
    }>;
  };
  attachments?: Array<{
    name: string;
    type: string;
    base64: string;
  }>;
};

export type ToolSettingsConfirmDecision = "approve" | "reject";

export type ToolSettingsConfirmParams = {
  requestId: string;
  decision: ToolSettingsConfirmDecision;
  conversationId?: string;
};

export type ToolSettingsConfirmRequiredEvent = {
  source: string;
  mode: "confirm";
  conversationId: string;
  requestId: string;
  requestedByAgentId?: string;
  summary: string[];
  impact: string;
  expiresAt: number;
  targetClientId?: string;
};

export type ToolSettingsConfirmResolvedEvent = {
  source: string;
  conversationId: string;
  requestId: string;
  decision: "approved" | "rejected";
  summary: string[];
  resolvedAt: number;
  targetClientId?: string;
};

export type ChatDeltaEvent = {
  conversationId: string;
  delta: string;
};

export type ChatMessageMeta = {
  timestampMs: number;
  displayTimeText: string;
  isLatest?: boolean;
};

export type ChatFinalEvent = {
  conversationId: string;
  text: string;
  role?: "user" | "assistant";
  messageMeta?: ChatMessageMeta;
};

export type ConversationMetaMessage = {
  role: "user" | "assistant";
  content: string;
  timestampMs: number;
  displayTimeText: string;
  isLatest: boolean;
  agentId?: string;
  clientContext?: {
    sentAtMs?: number;
    timezoneOffsetMinutes?: number;
    locale?: string;
  };
};

export type AgentStatusEvent = {
  conversationId: string;
  status: "running" | "done" | "error";
};


export type PairingRequiredEvent = {
  clientId: string;
  code: string;
  message: string;
};

export type ConfigUpdateParams = {
  updates: Record<string, string>;
};

// Result payload for config.read (Response payload)
export type ConfigReadResult = {
  config: Record<string, string>;
};

// Result payload for system.doctor (Response payload)
export type SystemDoctorResult = {
  checks: Array<{
    id: string;
    name: string;
    status: "pass" | "fail" | "warn";
    message?: string;
  }>;
};

// Result payload for agents.list (Response payload)
export type AgentsListResult = {
  agents: Array<{
    id: string;
    displayName: string;
    name?: string;
    avatar?: string;
    model: string; // 引用名，不暴露 apiKey
  }>;
};

// Result payload for models.list (Response payload)
export type ModelsListResult = {
  models: Array<{
    id: string;
    displayName: string;
    model: string;
  }>;
  currentDefault: string;
};
