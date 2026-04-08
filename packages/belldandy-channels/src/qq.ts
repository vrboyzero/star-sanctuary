import { WebSocket } from "ws";
import type { BelldandyAgent, ConversationStore } from "@belldandy/agent";
import type { ChatKind, ChannelRouter } from "./router/types.js";
import type { Channel, ChannelConfig } from "./types.js";
import { chunkMarkdownForOutbound } from "./reply-chunking.js";

export interface QqChannelConfig extends ChannelConfig {
    appId: string;
    appSecret: string;
    sandbox?: boolean;
    conversationStore: ConversationStore;
    agentId?: string;
}

interface WsPayload {
    op: number;
    d?: any;
    s?: number;
    t?: string;
}

type QqReplyContext = {
    channelId?: string;
    guildId?: string;
    groupOpenId?: string;
    userOpenId?: string;
    messageId?: string;
    eventType: string;
};

// WebSocket OpCodes
const OpCode = {
    DISPATCH: 0,        // 服务端推送事件
    HEARTBEAT: 1,       // 客户端心跳
    IDENTIFY: 2,        // 鉴权
    RESUME: 6,          // 恢复连接
    RECONNECT: 7,       // 服务端通知重连
    INVALID_SESSION: 9, // 无效会话
    HELLO: 10,          // 服务端欢迎
    HEARTBEAT_ACK: 11,  // 心跳ACK
} as const;

// Intents (订阅事件类型)
const Intents = {
    GUILDS: 1 << 0,
    GUILD_MEMBERS: 1 << 1,
    GUILD_MESSAGES: 1 << 9,          // 私域消息
    GUILD_MESSAGE_REACTIONS: 1 << 10,
    DIRECT_MESSAGE: 1 << 12,         // 私信
    GROUP_AND_C2C_EVENT: 1 << 25,    // 单聊与群聊
    PUBLIC_GUILD_MESSAGES: 1 << 30,  // 公域消息（需要@）
} as const;

export class QqChannel implements Channel {
    readonly name = "qq";

    private readonly agent: BelldandyAgent;
    private readonly conversationStore: ConversationStore;
    private readonly agentId?: string;
    private readonly defaultAgentId?: string;
    private readonly router?: ChannelRouter;
    private readonly replyChunkingConfig?: QqChannelConfig["replyChunkingConfig"];
    private readonly onChannelSecurityApprovalRequired?: QqChannelConfig["onChannelSecurityApprovalRequired"];

    private _running = false;
    private latestActiveChatId?: string;
    private readonly replyContextByChatId = new Map<string, QqReplyContext>();

    private readonly processedMessages = new Set<string>();
    private readonly MESSAGE_CACHE_SIZE = 1000;

    // AccessToken management
    private accessToken: string = "";
    private tokenExpiresAt: number = 0;
    private tokenRefreshTimer?: NodeJS.Timeout;
    private reconnectTimer?: NodeJS.Timeout;

    // WebSocket
    private ws?: WebSocket;
    private heartbeatInterval?: NodeJS.Timeout;
    private sessionId?: string;
    private sequence: number = 0;
    private gatewayUrl?: string;
    private suppressCloseReconnect = false;

    get isRunning(): boolean {
        return this._running;
    }

    constructor(private readonly config: QqChannelConfig) {
        this.agent = config.agent;
        this.conversationStore = config.conversationStore;
        this.agentId = config.agentId;
        this.defaultAgentId = config.defaultAgentId;
        this.router = config.router;
        this.replyChunkingConfig = config.replyChunkingConfig;
        this.onChannelSecurityApprovalRequired = config.onChannelSecurityApprovalRequired;
    }

    private resolveAgent(agentId?: string): BelldandyAgent {
        if (this.config.agentResolver) {
            try {
                return this.config.agentResolver(agentId);
            } catch (error) {
                console.warn(`[${this.name}] Failed to resolve agent "${agentId}", fallback to default agent:`, error);
            }
        }
        return this.agent;
    }

    private inferChatKind(eventType: string): ChatKind {
        if (eventType === "DIRECT_MESSAGE_CREATE" || eventType === "C2C_MESSAGE_CREATE") return "dm";
        if (eventType === "GROUP_AT_MESSAGE_CREATE") return "group";
        return "channel";
    }

    private resolveChatId(message: any): string | undefined {
        const chatId = message.channel_id || message.guild_id || message.group_openid || message.author?.id;
        return typeof chatId === "string" && chatId.length > 0 ? chatId : undefined;
    }

    private rememberReplyContext(chatId: string, replyContext: QqReplyContext): void {
        this.latestActiveChatId = chatId;
        this.replyContextByChatId.set(chatId, replyContext);
    }

    private getReplyContext(chatId?: string): QqReplyContext | undefined {
        if (chatId) {
            return this.replyContextByChatId.get(chatId);
        }
        if (!this.latestActiveChatId) {
            return undefined;
        }
        return this.replyContextByChatId.get(this.latestActiveChatId);
    }

    /**
     * 获取 AccessToken
     */
    private async fetchAccessToken(): Promise<void> {
        try {
            const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    appId: this.config.appId,
                    clientSecret: this.config.appSecret,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to fetch AccessToken: ${response.status} ${text}`);
            }

            const data = await response.json();
            if (!data.access_token) {
                throw new Error(`Invalid AccessToken response: ${JSON.stringify(data)}`);
            }

            this.accessToken = data.access_token;
            // 确保 expiresIn 至少为 60 秒，避免负数或过小值导致无限循环
            const rawExpiresIn = data.expires_in || 7200;
            const expiresIn = Math.max(60, rawExpiresIn - 300);
            this.tokenExpiresAt = Date.now() + expiresIn * 1000;

            console.log(`[${this.name}] AccessToken obtained, expires in ${expiresIn}s (raw: ${rawExpiresIn}s)`);
            this.scheduleTokenRefresh(expiresIn);
        } catch (error) {
            console.error(`[${this.name}] Failed to fetch AccessToken:`, error);
            throw error;
        }
    }

    /**
     * 调度 Token 刷新
     */
    private scheduleTokenRefresh(expiresInSeconds: number): void {
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
        }

        // 确保至少等待 60 秒，避免无限循环
        const safeExpiresIn = Math.max(60, expiresInSeconds);

        this.tokenRefreshTimer = setTimeout(async () => {
            console.log(`[${this.name}] Refreshing AccessToken...`);
            try {
                await this.fetchAccessToken();
            } catch (error) {
                console.error(`[${this.name}] Failed to refresh AccessToken:`, error);
                this.scheduleTokenRefresh(60);
            }
        }, safeExpiresIn * 1000);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }

    private scheduleReconnect(delayMs: number): void {
        this.clearReconnectTimer();
        if (!this._running) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this._running) {
                return;
            }
            void this.connectWebSocket().catch((error) => {
                console.error(`[${this.name}] Failed to reconnect WebSocket:`, error);
                this.scheduleReconnect(delayMs);
            });
        }, delayMs);
    }

    /**
     * 获取 Gateway URL
     */
    private async fetchGatewayUrl(): Promise<string> {
        const baseUrl = this.config.sandbox
            ? "https://sandbox.api.sgroup.qq.com"
            : "https://api.sgroup.qq.com";

        const response = await fetch(`${baseUrl}/gateway/bot`, {
            headers: {
                Authorization: `QQBot ${this.accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Failed to fetch gateway URL: ${response.status} ${text}`);
        }

        const data = await response.json();
        if (!data.url) {
            throw new Error(`Invalid gateway response: ${JSON.stringify(data)}`);
        }

        return data.url;
    }

    /**
     * 建立 WebSocket 连接
     */
    private async connectWebSocket(): Promise<void> {
        if (!this.gatewayUrl) {
            this.gatewayUrl = await this.fetchGatewayUrl();
        }

        console.log(`[${this.name}] Connecting to ${this.gatewayUrl}`);

        this.ws = new WebSocket(this.gatewayUrl);

        this.ws.on("open", () => {
            this.clearReconnectTimer();
            this.suppressCloseReconnect = false;
            console.log(`[${this.name}] WebSocket connected`);
        });

        this.ws.on("message", (data: Buffer) => {
            try {
                const payload: WsPayload = JSON.parse(data.toString());
                // 记录所有收到的消息（除了心跳ACK）
                if (payload.op !== OpCode.HEARTBEAT_ACK) {
                    console.log(`[${this.name}] Raw WS message:`, JSON.stringify(payload).substring(0, 500));
                }
                this.handleWsMessage(payload);
            } catch (error) {
                console.error(`[${this.name}] Failed to parse WebSocket message:`, error);
            }
        });

        this.ws.on("close", (code, reason) => {
            console.log(`[${this.name}] WebSocket closed: ${code} ${reason.toString()}`);

            // 清理心跳定时器
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = undefined;
            }

            const shouldSuppressReconnect = this.suppressCloseReconnect;
            this.suppressCloseReconnect = false;
            if (!this._running) return;
            if (shouldSuppressReconnect) return;

            // 按 QQ 官方文档分类处理 close code:
            // https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/error-trace/websocket.html

            // 不可重连：配置/协议错误，需要开发者修复
            const FATAL_CODES = [4001, 4002, 4010, 4011, 4012, 4013, 4014, 4914, 4915];
            if (FATAL_CODES.includes(code)) {
                console.error(`[${this.name}] Fatal close code ${code}, will NOT reconnect. Fix config and restart.`);
                this._running = false;
                return;
            }

            // 4009: 连接过期，可 RESUME（保留 session）
            // 4008: 发送过快，可 RESUME（保留 session，稍等久一点）
            // 其他正常断开（1000/1001 等）：保留 session 尝试 RESUME

            // 4006/4007: session 或 seq 无效，不可 RESUME，需重新 IDENTIFY
            // 4900~4913: 内部错误，不可 RESUME，需重新 IDENTIFY
            if (code === 4006 || code === 4007 || (code >= 4900 && code <= 4913)) {
                console.log(`[${this.name}] Session invalidated (code: ${code}), will re-IDENTIFY on next connect`);
                this.sessionId = undefined;
                this.sequence = 0;
            }

            const delay = code === 4008 ? 10000 : 5000;
            console.log(`[${this.name}] Reconnecting in ${delay / 1000}s...`);
            this.scheduleReconnect(delay);
        });

        this.ws.on("error", (error) => {
            console.error(`[${this.name}] WebSocket error:`, error);
        });
    }

    /**
     * 处理 WebSocket 消息
     */
    private handleWsMessage(payload: WsPayload): void {
        const { op, d, s, t } = payload;

        // 更新序列号
        if (s !== undefined && s !== null) {
            this.sequence = s;
        }

        switch (op) {
            case OpCode.HELLO:
                // 收到 HELLO，判断是恢复会话还是新建会话
                if (this.sessionId && this.sequence > 0) {
                    this.sendResume();
                } else {
                    this.sendIdentify();
                }
                // 启动心跳
                if (d?.heartbeat_interval) {
                    this.startHeartbeat(d.heartbeat_interval);
                }
                break;

            case OpCode.DISPATCH:
                // 事件分发
                console.log(`[${this.name}] Dispatch event: ${t}`, JSON.stringify(d).substring(0, 200));
                if (t === "READY") {
                    this.sessionId = d.session_id;
                    console.log(`[${this.name}] Session ready: ${this.sessionId}`);
                } else if (t === "RESUMED") {
                    console.log(`[${this.name}] Session resumed successfully (seq: ${this.sequence})`);
                } else if (
                    t === "AT_MESSAGE_CREATE" ||
                    t === "MESSAGE_CREATE" ||
                    t === "DIRECT_MESSAGE_CREATE" ||
                    t === "C2C_MESSAGE_CREATE" ||
                    t === "GROUP_AT_MESSAGE_CREATE"
                ) {
                    this.handleMessage(d, t);
                } else {
                    console.log(`[${this.name}] Unhandled event type: ${t}`);
                }
                break;

            case OpCode.HEARTBEAT_ACK:
                // 心跳确认
                break;

            case OpCode.RECONNECT:
                // 服务端要求重连
                console.log(`[${this.name}] Server requested reconnect`);
                this.reconnect();
                break;

            case OpCode.INVALID_SESSION:
                // 无效会话，重新连接
                console.log(`[${this.name}] Invalid session, reconnecting...`);
                this.sessionId = undefined;
                this.sequence = 0;
                this.scheduleReconnect(5000);
                break;

            default:
                console.log(`[${this.name}] Unknown opcode: ${op}`);
        }
    }

    /**
     * 发送 IDENTIFY
     */
    private sendIdentify(): void {
        const intents =
            Intents.GUILDS |
            Intents.GUILD_MESSAGES |
            Intents.DIRECT_MESSAGE |
            Intents.GROUP_AND_C2C_EVENT |
            Intents.PUBLIC_GUILD_MESSAGES;

        const payload: WsPayload = {
            op: OpCode.IDENTIFY,
            d: {
                token: `QQBot ${this.accessToken}`,
                intents,
                shard: [0, 1],
                properties: {
                    $os: "linux",
                    $browser: "belldandy",
                    $device: "belldandy",
                },
            },
        };

        this.ws?.send(JSON.stringify(payload));
        console.log(`[${this.name}] Sent IDENTIFY`);
    }

    /**
     * 发送 RESUME（恢复会话）
     */
    private sendResume(): void {
        const payload: WsPayload = {
            op: OpCode.RESUME,
            d: {
                token: `QQBot ${this.accessToken}`,
                session_id: this.sessionId,
                seq: this.sequence,
            },
        };

        this.ws?.send(JSON.stringify(payload));
        console.log(`[${this.name}] Sent RESUME (session: ${this.sessionId}, seq: ${this.sequence})`);
    }

    /**
     * 启动心跳
     */
    private startHeartbeat(interval: number): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            const payload: WsPayload = {
                op: OpCode.HEARTBEAT,
                d: this.sequence,
            };
            this.ws?.send(JSON.stringify(payload));
        }, interval);

        console.log(`[${this.name}] Heartbeat started (interval: ${interval}ms)`);
    }

    /**
     * 重连
     */
    private reconnect(): void {
        this.suppressCloseReconnect = true;
        this.clearReconnectTimer();
        if (this.ws) {
            this.ws.close();
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        this.scheduleReconnect(1000);
    }

    /**
     * 处理消息
     */
    private async handleMessage(message: any, eventType: string): Promise<void> {
        if (!message || !message.id) return;

        const msgId = message.id;

        // 去重
        if (this.processedMessages.has(msgId)) {
            return;
        }
        this.processedMessages.add(msgId);
        if (this.processedMessages.size > this.MESSAGE_CACHE_SIZE) {
            const first = this.processedMessages.values().next().value;
            if (first !== undefined) {
                this.processedMessages.delete(first);
            }
        }

        // 忽略机器人自己的消息
        if (message.author?.bot) {
            return;
        }

        const content = message.content?.trim();
        if (!content) return;

        console.log(`[${this.name}] Received message: ${content.substring(0, 50)}...`);

        const chatId = this.resolveChatId(message);
        if (!chatId) {
            console.warn(`[${this.name}] Unable to resolve chat ID for message ${msgId}`);
            return;
        }

        const replyContext: QqReplyContext = {
            channelId: message.channel_id,
            guildId: message.guild_id,
            groupOpenId: message.group_openid,
            userOpenId: message.author?.id,
            messageId: message.id,
            eventType,
        };
        this.rememberReplyContext(chatId, replyContext);

        const chatKind = this.inferChatKind(eventType);
        const mentions = eventType.includes("_AT_") ? ["__mention__"] : [];
        const mentioned = chatKind === "dm" ? true : mentions.length > 0;
        const decision = this.router
            ? this.router.decide({
                channel: "qq",
                chatKind,
                chatId,
                text: content,
                senderId: typeof message.author?.id === "string" ? message.author.id : undefined,
                senderName: typeof message.author?.username === "string" ? message.author.username : undefined,
                mentions,
                mentioned,
                eventType,
            })
            : {
                allow: true,
                reason: "router_unavailable",
                agentId: this.agentId ?? this.defaultAgentId,
            };

        if (!decision.allow) {
            if (decision.reason === "channel_security:dm_allowlist_blocked" && chatKind === "dm") {
                const senderId = typeof message.author?.id === "string" ? message.author.id : "";
                if (senderId) {
                    void this.onChannelSecurityApprovalRequired?.({
                        channel: "qq",
                        senderId,
                        senderName: typeof message.author?.username === "string" ? message.author.username : undefined,
                        chatId,
                        chatKind: "dm",
                        messagePreview: content,
                    });
                }
            }
            console.log(`[${this.name}] Route blocked message ${msgId} (${decision.reason})`);
            return;
        }

        const selectedAgentId = decision.agentId ?? this.agentId ?? this.defaultAgentId;
        const runAgent = this.resolveAgent(selectedAgentId);
        console.log(`[${this.name}] Route decision for ${msgId}: allow=${decision.allow}, rule=${decision.matchedRuleId ?? "default"}, agent=${selectedAgentId ?? "default"}`);

        // 获取或创建会话
        const conversationId = `qq_${chatId}`;

        // 添加用户消息到会话历史
        this.conversationStore.addMessage(conversationId, "user", content, {
            agentId: selectedAgentId,
            channel: this.name,
        });

        // 获取会话历史
        const history = this.conversationStore.getHistory(conversationId);

        // 调用 Agent 处理
        try {
            for await (const item of runAgent.run({
                conversationId,
                text: content,
                history,
                meta: {
                    eventType,
                    channel: this.name,
                    agentId: selectedAgentId,
                },
            })) {
                if (item.type === "final") {
                    await this.sendReply(item.text, replyContext);
                    // 添加助手回复到会话历史
                    this.conversationStore.addMessage(conversationId, "assistant", item.text, {
                        agentId: selectedAgentId,
                        channel: this.name,
                    });
                }
            }
        } catch (error) {
            console.error(`[${this.name}] Agent error:`, error);
            await this.sendReply("抱歉，处理消息时出错了。", replyContext);
        }
    }

    /**
     * 发送回复
     */
    private async sendReply(content: string, replyContext?: QqReplyContext): Promise<void> {
        const targetContext = replyContext ?? this.getReplyContext();
        if (!targetContext) {
            console.warn(`[${this.name}] No reply context available`);
            return;
        }

        const { channelId, guildId, groupOpenId, userOpenId, messageId, eventType } = targetContext;

        try {
            const baseUrl = this.config.sandbox
                ? "https://sandbox.api.sgroup.qq.com"
                : "https://api.sgroup.qq.com";

            let url: string;
            let body: any;

            if (eventType === "DIRECT_MESSAGE_CREATE") {
                // 频道私信回复
                url = `${baseUrl}/dms/${guildId}/messages`;
                body = {
                    content,
                    msg_id: messageId,
                };
            } else if (eventType === "C2C_MESSAGE_CREATE") {
                // 单聊回复 (API v2)
                url = `${baseUrl}/v2/users/${userOpenId}/messages`;
                body = {
                    content,
                    msg_type: 0,
                    msg_id: messageId,
                };
            } else if (eventType === "GROUP_AT_MESSAGE_CREATE") {
                // 群聊回复 (API v2)
                url = `${baseUrl}/v2/groups/${groupOpenId}/messages`;
                body = {
                    content,
                    msg_type: 0,
                    msg_id: messageId,
                };
            } else {
                // 频道回复
                url = `${baseUrl}/channels/${channelId}/messages`;
                body = {
                    content,
                    msg_id: messageId,
                };
            }

            const chunks = chunkMarkdownForOutbound(content, "qq", {
                config: this.replyChunkingConfig,
            });
            for (const chunk of chunks) {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        Authorization: `QQBot ${this.accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ...body,
                        content: chunk,
                    }),
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Failed to send message: ${response.status} ${text}`);
                }
            }

            console.log(`[${this.name}] Message sent successfully`);
        } catch (error) {
            console.error(`[${this.name}] Failed to send reply:`, error);
        }
    }

    async start(): Promise<void> {
        if (this._running) return;

        // 获取 AccessToken
        await this.fetchAccessToken();

        // 连接 WebSocket
        await this.connectWebSocket();

        this._running = true;
        console.log(`[${this.name}] WebSocket Channel started. (Sandbox: ${this.config.sandbox ?? true})`);
    }

    async stop(): Promise<void> {
        if (!this._running) return;

        this._running = false;
        this.suppressCloseReconnect = false;

        // 清理定时器
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
            this.tokenRefreshTimer = undefined;
        }
        this.clearReconnectTimer();
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }

        // 关闭 WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }

        this.processedMessages.clear();
        this.latestActiveChatId = undefined;
        this.replyContextByChatId.clear();
        console.log(`[${this.name}] Channel stopped.`);
    }

    async sendProactiveMessage(content: string, chatId?: string): Promise<boolean> {
        const targetChatId = chatId || this.latestActiveChatId;
        const targetContext = this.getReplyContext(targetChatId);
        if (!targetChatId || !targetContext) {
            console.warn(`[${this.name}] Cannot send proactive message - no active chat ID found.`);
            return false;
        }

        try {
            await this.sendReply(content, targetContext);
            console.log(`[${this.name}] Proactive message sent to ${targetChatId}`);
            return true;
        } catch (e) {
            console.error(`[${this.name}] Failed to send proactive message:`, e);
            return false;
        }
    }
}
