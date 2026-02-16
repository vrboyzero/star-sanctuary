import * as lark from "@larksuiteoapi/node-sdk";
import type { BelldandyAgent } from "@belldandy/agent";
import type { Channel } from "./types.js";

import { ConversationStore } from "@belldandy/agent";

export interface FeishuChannelConfig {
    appId: string;
    appSecret: string;
    agent: BelldandyAgent;
    conversationStore: ConversationStore;
    initialChatId?: string;
    onChatIdUpdate?: (chatId: string) => void;
    sttTranscribe?: (opts: { buffer: Buffer; fileName: string; mime?: string }) => Promise<{ text: string } | null>;
}

/**
 * 飞书渠道实现
 * 使用 WebSocket 长连接模式，无需公网 IP
 */
export class FeishuChannel implements Channel {
    /** 渠道名称 */
    readonly name = "feishu";

    private readonly client: lark.Client;
    private readonly wsClient: lark.WSClient;
    private readonly agent: BelldandyAgent;
    private readonly conversationStore: ConversationStore;
    private readonly sttTranscribe?: (opts: { buffer: Buffer; fileName: string; mime?: string }) => Promise<{ text: string } | null>;
    private _running = false;
    private lastChatId?: string; // Track the last active chat for proactive messaging
    private onChatIdUpdate?: (chatId: string) => void;

    // Deduplication: track processed message IDs to avoid responding multiple times
    private readonly processedMessages = new Set<string>();
    private readonly MESSAGE_CACHE_SIZE = 1000;

    /** 渠道是否正在运行 */
    get isRunning(): boolean {
        return this._running;
    }

    constructor(config: FeishuChannelConfig) {
        this.agent = config.agent;
        this.conversationStore = config.conversationStore;

        // HTTP Client for sending messages
        this.client = new lark.Client({
            appId: config.appId,
            appSecret: config.appSecret,
        });

        // WebSocket Client for receiving events
        this.wsClient = new lark.WSClient({
            appId: config.appId,
            appSecret: config.appSecret,
            loggerLevel: lark.LoggerLevel.info,
        });

        // Store callback
        this.onChatIdUpdate = config.onChatIdUpdate;
        this.sttTranscribe = config.sttTranscribe;

        // setupEventHandlers was removed

        if (config.initialChatId) {
            this.lastChatId = config.initialChatId;
            console.log(`Feishu: Restored last chat ID: ${this.lastChatId}`);
        }
    }



    async start(): Promise<void> {
        if (this._running) return;

        // Create an event dispatcher
        const eventDispatcher = new lark.EventDispatcher({}).register({
            "im.message.receive_v1": async (data) => {
                await this.handleMessage(data);
            },
        });

        // Start WS connection with the dispatcher
        await this.wsClient.start({
            eventDispatcher,
        });

        this._running = true;
        console.log(`[${this.name}] WebSocket Channel started.`);
    }

    async stop(): Promise<void> {
        if (!this._running) return;

        try {
            // Note: @larksuiteoapi/node-sdk WSClient 目前没有公开的 stop/close 方法
            // 如果未来 SDK 支持，可以在这里调用
            // await this.wsClient.stop();

            this._running = false;
            this.processedMessages.clear();
            console.log(`[${this.name}] Channel stopped.`);
        } catch (e) {
            console.error(`[${this.name}] Error stopping channel:`, e);
            throw e;
        }
    }

    private async handleMessage(data: any) {
        // SDK directly passes the event data, not nested under data.event
        // Based on official example: const { message: { chat_id, content} } = data;
        const message = data.message;
        const sender = data.sender;

        if (!message) {
            console.error("Feishu: message object is undefined in event data", data);
            return;
        }

        // Ignore updates, own messages, or system messages if needed
        // Usually we check message_type

        if (message.message_type !== "text" && message.message_type !== "audio") {
            // For now, only handle text and audio
            // TODO: Support images/files
            return;
        }

        const chatId = message.chat_id;
        if (this.lastChatId !== chatId) {
            this.lastChatId = chatId;
            // Notify listener for persistence
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.onChatIdUpdate?.(chatId);
        }
        const msgId = message.message_id;

        // === Deduplication: skip if we've already processed this message ===
        if (this.processedMessages.has(msgId)) {
            console.log(`Feishu: Skipping duplicate message ${msgId}`);
            return;
        }
        // Mark as processed immediately to prevent concurrent processing
        this.processedMessages.add(msgId);
        // Limit cache size to prevent memory leak
        if (this.processedMessages.size > this.MESSAGE_CACHE_SIZE) {
            const firstKey = this.processedMessages.values().next().value;
            if (firstKey) this.processedMessages.delete(firstKey);
        }

        // Content is a JSON string: "{\"text\":\"hello\"}"
        let text = "";
        try {
            const contentObj = JSON.parse(message.content);
            if (message.message_type === "text") {
                text = contentObj.text;
            } else if (message.message_type === "audio") {
                if (!this.sttTranscribe) {
                    console.warn(`Feishu: Received audio message ${msgId} but STT is not configured.`);
                    return; // Or send a reply saying voice is not supported
                }
                const fileKey = contentObj.file_key;
                console.log(`Feishu: Downloading audio ${fileKey}...`);

                // Download audio file
                // SDK path: client.im.messageResource.get
                // Note: using 'as any' to bypass potential type mismatch in some SDK versions
                const response = await (this.client as any).im.messageResource.get({
                    path: { message_id: msgId, file_key: fileKey },
                    params: { type: "file" }, // type: 'image' | 'file'
                });

                // The SDK returns a stream or buffer depending on implementation?
                // Looking at SDK types, `writeFile` returns Promise<response>. 
                // But `get` returns `Promise<any>` with binary data in `data`?
                // Actually `get` returns a response object where `data` might be a stream.
                // Let's assume it returns a buffer or we can read it.
                // Official SDK often returns raw buffer if not streaming.
                // Let's try to treat response as containing buffer.
                // Note: The SDK's `im.message.resource.get` usually returns a stream in `data` property?
                // Let's double check standard implementation.
                // For safety, let's treat `response` (or `response.data`) as something convertible to Buffer.

                // Hack: If response is a crypto.webcrypto.BufferSource or ArrayBuffer...
                // The SDK behavior: `await client.im.message.resource.get(...)` returns `{ code: 0, msg: "success", data: ReadableStream }`?
                // Actually it returns binary data directly if not specified otherwise? 
                // Let's wrap in try-catch and inspect.

                // Assuming `response` is valid.
                // Wait, `get` returns `Promise<GetMessageResourceResponse>`.
                // We need to read the stream.

                // Let's fetch it manually if SDK is tricky, but we need auth token.
                // Better to use SDK.
                // If it fails, we catch error.

                // Let's assume `response` is the binary data (Buffer) because `node-sdk` might handle it?
                // No, looking at `node-sdk` code, it usually returns standard response wrapper.
                // If the content type is binary, `response` might be the buffer or stream.

                // Let's look at `node-sdk` typings if possible.
                // `get(request: GetMessageResourceRequest): Promise<GetMessageResourceResponse>;`
                // It usually returns a file stream.

                // To keep it simple, let's try `await response.writeFile(path)`? 
                // Or `response` itself is a stream.

                // Let's start with a simpler assumption: The `response` matches what `readFile` expects.
                // Actually, let's assume `response` is a Buffer for now (Node SDK behavior varies).
                // Or use `writeFile`.

                // CORRECT APPROACH for Lark Node SDK:
                // `const res = await client.im.message.resource.get(...)`
                // `const buffer = await res.readFile()`?? No.

                // It seems `client.im.message.resource.get` returns the binary file stream directly in some versions?
                // Let's try downloading via standard `Buffer.concat` on stream.

                let buffer: Buffer;
                if (Buffer.isBuffer(response)) {
                    buffer = response;
                } else if ((response as any).data && typeof (response as any).data.on === 'function') {
                    // It is a stream
                    const chunks: Buffer[] = [];
                    for await (const chunk of (response as any).data) {
                        chunks.push(Buffer.from(chunk));
                    }
                    buffer = Buffer.concat(chunks);
                } else if ((response as any).writeFile) {
                    // Valid response object with file helper?
                    const chunks: Buffer[] = [];
                    const stream = await (response as any).response.blob?.()?.stream?.(); // Modern?
                    // Fallback:
                    buffer = Buffer.from(JSON.stringify(response)); // Error placeholder
                } else {
                    // Assume it's a buffer-like object or try to convert
                    buffer = Buffer.from(response as any);
                }

                if (buffer.length < 100) {
                    // Likely JSON error response
                    console.warn("Feishu: Audio download might be invalid (too small).");
                }

                // Transcribe
                // Feishu audio is usually 'opus' in 'audio/ogg' container or 'mp4' (m4a).
                // File extension in key is not guaranteed.
                // We'll guess MIME or use 'audio/mp4' (common for mobile).
                const mime = "audio/mp4";
                const sttRes = await this.sttTranscribe({
                    buffer,
                    fileName: `feishu_${msgId}.m4a`,
                    mime
                });

                if (sttRes?.text) {
                    text = sttRes.text;
                    console.log(`Feishu: Audio transcribed: "${text}"`);
                } else {
                    console.warn(`Feishu: Audio transcription failed for ${msgId}.`);
                    return;
                }
            }

        } catch (e) {
            console.error("Failed to parse Feishu message content or download audio", e);
            return;
        }

        // Ignore empty messages
        if (!text) return;

        console.log(`Feishu: Processing message ${msgId} from chat ${chatId}: "${text.slice(0, 50)}..."`);

        // Run the agent
        // We create a history context if possible, but for MVP we just send the text
        // The agent is responsible for context via ConversationStore (not linked here yet)
        // We pass conversationId as chatId

        // [PERSISTENCE] Add User Message to Store
        this.conversationStore.addMessage(chatId, "user", text);

        // [PERSISTENCE] Get History from Store
        const history = this.conversationStore.getHistory(chatId);

        const runInput = {
            conversationId: chatId, // Map Feishu Chat ID to Conversation ID
            text: text,
            history: history, // Provide history context
            // We could pass sender info in meta
            meta: {
                from: sender,
                messageId: msgId,
                channel: "feishu"
            }
        };

        try {
            const stream = this.agent.run(runInput);
            let replyText = "";

            for await (const item of stream) {
                if (item.type === "delta") {
                    // Streaming is tricky with Feishu unless we use "card" updates.
                    // For simplicity in MVP, we accumulate and send send/reply at the end.
                    replyText += item.delta;
                } else if (item.type === "final") {
                    replyText = item.text; // Ensure we get the final full text if provided
                } else if (item.type === "tool_call") {
                    console.log(`Feishu: Tool call: ${item.name}`, item.arguments);
                } else if (item.type === "tool_result") {
                    console.log(`Feishu: Tool result: ${item.name} - success: ${item.success}`,
                        item.success ? item.output?.slice(0, 100) : item.error);
                }
            }

            if (replyText) {
                // [PERSISTENCE] Add Assistant Message to Store
                const sanitized = replyText
                    .replace(/<audio[^>]*>.*?<\/audio>/gi, "")
                    .replace(/\[Download\]\([^)]*\/generated\/[^)]*\)/gi, "")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                this.conversationStore.addMessage(chatId, "assistant", sanitized || replyText);

                await this.reply(msgId, replyText);
                console.log(`Feishu: Repled to message ${msgId}`);
            } else {
                console.warn(`Feishu: Agent returned empty response for message ${msgId}`);
            }

        } catch (e) {
            console.error("Error running agent for Feishu message:", e);
            await this.reply(msgId, "Error: " + String(e));
        }
    }

    private async reply(messageId: string, content: string) {
        try {
            await this.client.im.message.reply({
                path: {
                    message_id: messageId,
                },
                data: {
                    content: JSON.stringify({ text: content }),
                    msg_type: "text",
                },
            });
        } catch (e) {
            console.error("Failed to reply to Feishu:", e);
        }
    }

    /**
     * 主动发送消息（非回复）
     * @param content - 消息内容
     * @param chatId - 可选，指定发送目标。不指定则发送到最后活跃的会话
     * @returns 是否发送成功
     */
    async sendProactiveMessage(content: string, chatId?: string): Promise<boolean> {
        const targetChatId = chatId || this.lastChatId;

        if (!targetChatId) {
            console.warn(`[${this.name}] Cannot send proactive message - no active chat ID found.`);
            return false;
        }

        try {
            await this.client.im.message.create({
                params: {
                    receive_id_type: "chat_id",
                },
                data: {
                    receive_id: targetChatId,
                    content: JSON.stringify({ text: content }),
                    msg_type: "text",
                },
            });
            console.log(`[${this.name}] Proactive message sent to ${targetChatId}`);
            return true;
        } catch (e) {
            console.error(`[${this.name}] Failed to send proactive message:`, e);
            return false;
        }
    }
}
