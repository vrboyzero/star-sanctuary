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
    sttTranscribe?: (opts: {
        buffer: Buffer;
        fileName: string;
        mime?: string;
    }) => Promise<{
        text: string;
    } | null>;
}
/**
 * 飞书渠道实现
 * 使用 WebSocket 长连接模式，无需公网 IP
 */
export declare class FeishuChannel implements Channel {
    /** 渠道名称 */
    readonly name = "feishu";
    private readonly client;
    private readonly wsClient;
    private readonly agent;
    private readonly conversationStore;
    private readonly sttTranscribe?;
    private _running;
    private lastChatId?;
    private onChatIdUpdate?;
    private readonly processedMessages;
    private readonly MESSAGE_CACHE_SIZE;
    /** 渠道是否正在运行 */
    get isRunning(): boolean;
    constructor(config: FeishuChannelConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleMessage;
    private reply;
    /**
     * 主动发送消息（非回复）
     * @param content - 消息内容
     * @param chatId - 可选，指定发送目标。不指定则发送到最后活跃的会话
     * @returns 是否发送成功
     */
    sendProactiveMessage(content: string, chatId?: string): Promise<boolean>;
}
