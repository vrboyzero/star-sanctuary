export type JsonObject = Record<string, unknown>;
export type BelldandyRole = "web" | "cli" | "node";
export type GatewayAuth = {
    mode: "token";
    token: string;
} | {
    mode: "password";
    password: string;
} | {
    mode: "none";
};
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
    agentName?: string;
    agentAvatar?: string;
    userName?: string;
    userAvatar?: string;
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
export type GatewayResFrame = {
    type: "res";
    id: string;
    ok: true;
    payload?: JsonObject;
} | {
    type: "res";
    id: string;
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
export type GatewayEventFrame = {
    type: "event";
    event: string;
    payload?: JsonObject;
};
export type GatewayFrame = ConnectChallengeFrame | ConnectRequestFrame | HelloOkFrame | GatewayReqFrame | GatewayResFrame | GatewayEventFrame;
export type MessageSendParams = {
    conversationId?: string;
    text: string;
    from?: string;
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
        identity?: string;
    };
    /** 房间上下文信息（用于多人聊天场景） */
    roomContext?: {
        roomId?: string;
        environment: "local" | "community";
        members?: Array<{
            type: "user" | "agent";
            id: string;
            name?: string;
            identity?: string;
        }>;
    };
    attachments?: Array<{
        name: string;
        type: string;
        base64: string;
    }>;
};
export type ChatDeltaEvent = {
    conversationId: string;
    delta: string;
};
export type ChatFinalEvent = {
    conversationId: string;
    text: string;
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
export type ConfigReadResult = {
    config: Record<string, string>;
};
export type SystemDoctorResult = {
    checks: Array<{
        id: string;
        name: string;
        status: "pass" | "fail" | "warn";
        message?: string;
    }>;
};
export type AgentsListResult = {
    agents: Array<{
        id: string;
        displayName: string;
        model: string;
    }>;
};
export type ModelsListResult = {
    models: Array<{
        id: string;
        displayName: string;
        model: string;
    }>;
    currentDefault: string;
};
//# sourceMappingURL=index.d.ts.map