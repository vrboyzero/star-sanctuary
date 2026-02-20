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
//# sourceMappingURL=index.d.ts.map