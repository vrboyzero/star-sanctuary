/**
 * 渠道管理器 - 统一管理多个渠道
 */
import type { Channel, ChannelManager } from "./types.js";
/**
 * 默认渠道管理器实现
 *
 * @example
 * ```typescript
 * const manager = new DefaultChannelManager();
 *
 * // 注册渠道
 * manager.register(new FeishuChannel(config));
 * manager.register(new TelegramChannel(config));
 *
 * // 启动所有渠道
 * await manager.startAll();
 *
 * // 广播消息到所有渠道
 * await manager.broadcast("系统维护通知");
 * ```
 */
export declare class DefaultChannelManager implements ChannelManager {
    private readonly channels;
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
     * 获取所有渠道名称
     */
    getNames(): string[];
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
     * @returns Map<渠道名称, 是否发送成功>
     */
    broadcast(content: string): Promise<Map<string, boolean>>;
    /**
     * 获取渠道状态摘要
     */
    getStatus(): {
        name: string;
        running: boolean;
    }[];
}
//# sourceMappingURL=manager.d.ts.map