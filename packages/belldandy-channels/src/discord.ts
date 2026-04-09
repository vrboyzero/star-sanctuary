import { Client, GatewayIntentBits, Message, TextChannel } from "discord.js";
import type { BelldandyAgent } from "@belldandy/agent";
import type { CurrentConversationBindingStore } from "./current-conversation-binding-store.js";
import type { Channel, ChannelConfig, ChannelEventListener, ChannelProactiveTarget } from "./types.js";
import type { ChannelRouter } from "./router/types.js";
import { chunkMarkdownForOutbound } from "./reply-chunking.js";
import { buildChannelSessionDescriptor } from "./session-key.js";

export interface DiscordChannelConfig extends ChannelConfig {
    botToken: string;
    intents?: number;
}

export class DiscordChannel implements Channel {
    readonly name = "discord";
    private client: Client | null = null;
    private startPromise: Promise<void> | null = null;
    private clientSession = 0;
    private agent: BelldandyAgent;
    private config: DiscordChannelConfig;
    private listeners: ChannelEventListener[] = [];
    private processedMessages = new Set<string>();
    private _running = false;
    private readonly router?: ChannelRouter;
    private readonly replyChunkingConfig?: DiscordChannelConfig["replyChunkingConfig"];
    private readonly currentConversationBindingStore?: CurrentConversationBindingStore;
    private readonly onChannelSecurityApprovalRequired?: DiscordChannelConfig["onChannelSecurityApprovalRequired"];

    constructor(config: DiscordChannelConfig) {
        this.agent = config.agent;
        this.config = config;
        this.router = config.router;
        this.replyChunkingConfig = config.replyChunkingConfig;
        this.currentConversationBindingStore = config.currentConversationBindingStore;
        this.onChannelSecurityApprovalRequired = config.onChannelSecurityApprovalRequired;
    }

    private resolveAgent(agentId?: string): BelldandyAgent {
        if (this.config.agentResolver) {
            try {
                return this.config.agentResolver(agentId);
            } catch (error) {
                console.warn(`[Discord] Failed to resolve agent "${agentId}", fallback to default agent:`, error);
            }
        }
        return this.agent;
    }

    get isRunning(): boolean {
        return this._running && this.client !== null && this.client.isReady();
    }

    async start(): Promise<void> {
        if (this._running) {
            console.warn("[Discord] Already running");
            return;
        }
        if (this.startPromise) {
            await this.startPromise;
            return;
        }

        const intents = this.config.intents ?? (
            GatewayIntentBits.Guilds |
            GatewayIntentBits.GuildMessages |
            GatewayIntentBits.DirectMessages |
            GatewayIntentBits.MessageContent
        );

        const client = new Client({ intents });
        const session = ++this.clientSession;
        this.client = client;

        client.once("clientReady", () => {
            if (this.client !== client || this.clientSession !== session) {
                return;
            }
            console.log(`[Discord] Logged in as ${client.user!.tag}`);
            this._running = true;
            this.emit({ type: "started", channel: this.name });
        });

        client.on("messageCreate", (msg) => {
            if (this.client !== client || this.clientSession !== session) {
                return;
            }
            this.handleMessage(msg);
        });

        client.on("error", (error) => {
            if (this.client !== client || this.clientSession !== session) {
                return;
            }
            console.error("[Discord] Client error:", error);
            this.emit({ type: "error", channel: this.name, error });
        });

        const startPromise = (async () => {
            try {
                await client.login(this.config.botToken);
                if (this.client !== client || this.clientSession !== session) {
                    client.destroy();
                }
            } catch (error) {
                if (this.client === client && this.clientSession === session) {
                    this.client = null;
                    this._running = false;
                }
                throw error;
            }
        })();
        this.startPromise = startPromise;
        try {
            await startPromise;
        } finally {
            if (this.startPromise === startPromise) {
                this.startPromise = null;
            }
        }
    }

    async stop(): Promise<void> {
        const client = this.client;
        const session = this.clientSession;
        if (!client && !this.startPromise) return;
        this.client = null;
        this.clientSession = session + 1;
        this._running = false;
        this.processedMessages.clear();
        if (client) {
            client.destroy();
        }
        console.log("[Discord] Stopped");
        this.emit({ type: "stopped", channel: this.name });
    }

    private async handleMessage(message: Message): Promise<void> {
        // 忽略 Bot 自身消息
        if (message.author.bot) return;

        // 消息去重
        if (this.processedMessages.has(message.id)) return;
        this.processedMessages.add(message.id);

        // 限制去重集合大小
        if (this.processedMessages.size > 1000) {
            const toDelete = Array.from(this.processedMessages).slice(0, 500);
            toDelete.forEach((id) => this.processedMessages.delete(id));
        }

        const chatId = message.channelId;
        const userId = message.author.id;
        const username = message.author.username;

        console.log(`[Discord] Message from ${username} in ${chatId}: ${message.content}`);
        this.emit({ type: "message_received", channel: this.name, messageId: message.id, chatId });

        // 构建多模态内容
        const contentParts: any[] = [];

        if (message.content) {
            contentParts.push({ type: "text", text: message.content });
        }

        for (const attachment of message.attachments.values()) {
            if (attachment.contentType?.startsWith("image/")) {
                contentParts.push({
                    type: "image_url",
                    image_url: { url: attachment.url }
                });
                this.emit({
                    type: "media_received",
                    channel: this.name,
                    messageId: message.id,
                    chatId,
                    mediaType: "image"
                });
            } else if (attachment.contentType?.startsWith("video/")) {
                contentParts.push({
                    type: "video_url",
                    video_url: { url: attachment.url }
                });
                this.emit({
                    type: "media_received",
                    channel: this.name,
                    messageId: message.id,
                    chatId,
                    mediaType: "video"
                });
            } else if (attachment.contentType?.startsWith("audio/")) {
                contentParts.push({
                    type: "text",
                    text: `[用户发送了音频文件: ${attachment.name}]`
                });
                this.emit({
                    type: "media_received",
                    channel: this.name,
                    messageId: message.id,
                    chatId,
                    mediaType: "audio"
                });
            }
        }

        if (contentParts.length === 0) {
            console.warn("[Discord] Empty message, skipping");
            return;
        }

        const chatKind = message.guildId ? "channel" : "dm";
        const mentions = message.mentions.users.map((u) => u.id);
        const mentioned = message.guildId ? message.mentions.has(this.client!.user!.id) : true;
        const session = buildChannelSessionDescriptor({
            channel: "discord",
            chatKind,
            chatId,
            senderId: userId,
        });
        const decision = this.router
            ? this.router.decide({
                channel: "discord",
                chatKind,
                chatId,
                sessionScope: session.sessionScope,
                sessionKey: session.sessionKey,
                text: message.content || "",
                senderId: userId,
                senderName: username,
                mentions,
                mentioned,
                eventType: "messageCreate",
            })
            : {
                allow: true,
                reason: "router_unavailable",
                agentId: this.config.defaultAgentId,
            };

        if (!decision.allow) {
            if (decision.reason === "channel_security:dm_allowlist_blocked" && chatKind === "dm" && userId) {
                void this.onChannelSecurityApprovalRequired?.({
                    channel: "discord",
                    senderId: userId,
                    senderName: username,
                    chatId,
                    chatKind: "dm",
                    messagePreview: message.content || "",
                });
            }
            console.log(`[Discord] Route blocked message ${message.id} (${decision.reason})`);
            return;
        }

        const selectedAgentId = decision.agentId ?? this.config.defaultAgentId;
        const runAgent = this.resolveAgent(selectedAgentId);
        console.log(`[Discord] Route decision for ${message.id}: allow=${decision.allow}, rule=${decision.matchedRuleId ?? "default"}, agent=${selectedAgentId ?? "default"}`);
        await this.currentConversationBindingStore?.upsert({
            channel: "discord",
            sessionKey: session.sessionKey,
            sessionScope: session.sessionScope,
            legacyConversationId: session.legacyConversationId,
            chatKind,
            chatId,
            ...(session.peerId ? { peerId: session.peerId } : {}),
            updatedAt: Date.now(),
            target: {
                channelId: chatId,
                ...(message.guildId ? { guildId: message.guildId } : {}),
            },
        });

        // 显示 "正在输入..." 状态
        if (message.channel.isTextBased() && 'sendTyping' in message.channel) {
            await message.channel.sendTyping();
        }

        try {
            // 调用 Agent 处理
            const stream = runAgent.run({
                text: message.content || "",
                content: contentParts,
                conversationId: session.legacyConversationId,
                meta: {
                    channel: "discord",
                    userId,
                    username,
                    guildId: message.guildId ?? undefined,
                    channelId: chatId,
                    agentId: selectedAgentId,
                    sessionScope: session.sessionScope,
                    sessionKey: session.sessionKey,
                    legacyConversationId: session.legacyConversationId,
                }
            });

            let fullResponse = "";
            let lastTypingTime = Date.now();

            for await (const item of stream) {
                if (item.type === "delta") {
                    fullResponse += item.delta;
                    // 每 2 秒续发一次 typing 状态
                    const now = Date.now();
                    if (now - lastTypingTime > 2000) {
                        if (message.channel.isTextBased() && 'sendTyping' in message.channel) {
                            await message.channel.sendTyping();
                        }
                        lastTypingTime = now;
                    }
                } else if (item.type === "final") {
                    fullResponse = item.text;
                }
            }

            // 发送最终回复
            if (fullResponse) {
                await this.sendLongMessage(message.channel as TextChannel, fullResponse);
                this.emit({ type: "message_sent", channel: this.name, chatId });
            }
        } catch (error) {
            console.error("[Discord] Agent error:", error);
            await message.reply("抱歉，处理消息时出现错误。");
            this.emit({ type: "error", channel: this.name, error: error as Error });
        }
    }

    /**
     * 处理 Discord 2000 字符单条消息限制，自动分段发送
     */
    private async sendLongMessage(channel: TextChannel, content: string): Promise<void> {
        const chunks = chunkMarkdownForOutbound(content, "discord", {
            config: this.replyChunkingConfig,
        });
        for (const chunk of chunks) {
            await channel.send(chunk);
            if (chunks.length > 1) {
                await new Promise((resolve) => setTimeout(resolve, 500)); // 防止速率限制
            }
        }
    }

    /**
     * 主动发送消息
     */
    async sendProactiveMessage(content: string, target?: ChannelProactiveTarget): Promise<boolean> {
        if (!this.isRunning) {
            console.error("[Discord] Cannot send message: client not running");
            return false;
        }

        const explicitChannelId = typeof target === "string"
            ? target
            : typeof target?.chatId === "string"
                ? target.chatId
                : "";
        const explicitSessionKey = typeof target === "object" && typeof target?.sessionKey === "string"
            ? target.sessionKey.trim()
            : "";
        const directBinding = explicitSessionKey
            ? await this.currentConversationBindingStore?.get(explicitSessionKey)
            : undefined;
        const fallbackBinding = !explicitChannelId && !directBinding
            ? await this.currentConversationBindingStore?.getLatestByChannel({ channel: "discord" })
            : undefined;
        const targetChannelId = directBinding?.target.channelId
            || directBinding?.chatId
            || explicitChannelId
            || fallbackBinding?.target.channelId
            || fallbackBinding?.chatId;

        if (!targetChannelId) {
            console.error("[Discord] No binding-backed target channel specified");
            return false;
        }

        try {
            const channel = await this.client!.channels.fetch(targetChannelId);

            if (!channel || !channel.isTextBased()) {
                console.error("[Discord] Invalid channel:", targetChannelId);
                return false;
            }

            await this.sendLongMessage(channel as TextChannel, content);
            this.emit({ type: "message_sent", channel: this.name, chatId: targetChannelId });
            return true;
        } catch (error) {
            console.error("[Discord] Failed to send proactive message:", error);
            this.emit({ type: "error", channel: this.name, error: error as Error });
            return false;
        }
    }

    /**
     * 事件监听器管理
     */
    addEventListener(listener: ChannelEventListener): void {
        this.listeners.push(listener);
    }

    removeEventListener(listener: ChannelEventListener): void {
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    private emit(event: any): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (e) {
                console.error("[Discord] Event listener error:", e);
            }
        }
    }
}
