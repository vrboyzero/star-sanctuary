/**
 * Belldandy Channel 通用接口
 * 所有外部渠道（飞书、Telegram、Discord 等）都应实现此接口
 */
import type { BelldandyAgent } from "@belldandy/agent";
/**
 * 渠道基础配置
 */
export interface ChannelConfig {
    /** Agent 实例，用于处理消息 */
    agent: BelldandyAgent;
}
/**
 * 渠道事件类型
 */
export type ChannelEvent = {
    type: "started";
    channel: string;
} | {
    type: "stopped";
    channel: string;
} | {
    type: "message_received";
    channel: string;
    messageId: string;
    chatId: string;
} | {
    type: "message_sent";
    channel: string;
    messageId?: string;
    chatId: string;
} | {
    type: "media_received";
    channel: string;
    messageId: string;
    chatId: string;
    mediaType: "audio" | "image" | "video";
    buffer?: Buffer;
    mime?: string;
} | {
    type: "error";
    channel: string;
    error: Error;
};
/**
 * 渠道事件监听器
 */
export type ChannelEventListener = (event: ChannelEvent) => void;
/**
 * Channel 通用接口
 *
 * 实现此接口的渠道可以被 Gateway 统一管理
 *
 * @example
 * ```typescript
 * class TelegramChannel implements Channel {
 *     readonly name = "telegram";
 *     // ... 实现其他方法
 * }
 * ```
 */
export interface Channel {
    /**
     * 渠道名称（唯一标识符）
     * 例如: "feishu", "telegram", "discord"
     */
    readonly name: string;
    /**
     * 渠道是否正在运行
     */
    readonly isRunning: boolean;
    /**
     * 启动渠道
     * - 建立连接（WebSocket/HTTP Long Polling 等）
     * - 开始监听消息
     */
    start(): Promise<void>;
    /**
     * 停止渠道
     * - 断开连接
     * - 清理资源
     */
    stop(): Promise<void>;
    /**
     * 主动发送消息（非回复）
     * 用于心跳提醒、定时任务等场景
     *
     * @param content - 消息内容
     * @param chatId - 可选，指定发送目标。不指定则发送到最后活跃的会话
     * @returns 是否发送成功
     */
    sendProactiveMessage(content: string, chatId?: string): Promise<boolean>;
    /**
     * 添加事件监听器（可选实现）
     */
    addEventListener?(listener: ChannelEventListener): void;
    /**
     * 移除事件监听器（可选实现）
     */
    removeEventListener?(listener: ChannelEventListener): void;
}
/**
 * 渠道管理器接口
 * 用于 Gateway 统一管理多个渠道
 */
export interface ChannelManager {
    /**
     * 注册渠道
     */
    register(channel: Channel): void;
    /**
     * 注销渠道
     */
    unregister(channelName: string): void;
    /**
     * 获取渠道
     */
    get(channelName: string): Channel | undefined;
    /**
     * 获取所有渠道
     */
    getAll(): Channel[];
    /**
     * 启动所有渠道
     */
    startAll(): Promise<void>;
    /**
     * 停止所有渠道
     */
    stopAll(): Promise<void>;
    /**
     * 向所有渠道广播消息
     */
    broadcast(content: string): Promise<Map<string, boolean>>;
}
