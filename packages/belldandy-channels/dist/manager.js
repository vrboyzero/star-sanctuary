/**
 * 渠道管理器 - 统一管理多个渠道
 */
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
export class DefaultChannelManager {
    channels = new Map();
    /**
     * 注册渠道
     */
    register(channel) {
        if (this.channels.has(channel.name)) {
            console.warn(`[ChannelManager] Channel "${channel.name}" already registered, replacing.`);
        }
        this.channels.set(channel.name, channel);
        console.log(`[ChannelManager] Registered channel: ${channel.name}`);
    }
    /**
     * 注销渠道
     */
    unregister(channelName) {
        const channel = this.channels.get(channelName);
        if (channel) {
            if (channel.isRunning) {
                console.warn(`[ChannelManager] Unregistering running channel "${channelName}". Consider stopping it first.`);
            }
            this.channels.delete(channelName);
            console.log(`[ChannelManager] Unregistered channel: ${channelName}`);
        }
    }
    /**
     * 获取渠道
     */
    get(channelName) {
        return this.channels.get(channelName);
    }
    /**
     * 获取所有渠道
     */
    getAll() {
        return Array.from(this.channels.values());
    }
    /**
     * 获取所有渠道名称
     */
    getNames() {
        return Array.from(this.channels.keys());
    }
    /**
     * 启动所有渠道
     */
    async startAll() {
        const promises = Array.from(this.channels.values()).map(async (channel) => {
            try {
                await channel.start();
            }
            catch (e) {
                console.error(`[ChannelManager] Failed to start channel "${channel.name}":`, e);
            }
        });
        await Promise.all(promises);
    }
    /**
     * 停止所有渠道
     */
    async stopAll() {
        const promises = Array.from(this.channels.values()).map(async (channel) => {
            try {
                await channel.stop();
            }
            catch (e) {
                console.error(`[ChannelManager] Failed to stop channel "${channel.name}":`, e);
            }
        });
        await Promise.all(promises);
    }
    /**
     * 向所有渠道广播消息
     * @returns Map<渠道名称, 是否发送成功>
     */
    async broadcast(content) {
        const results = new Map();
        const promises = Array.from(this.channels.entries()).map(async ([name, channel]) => {
            try {
                const success = await channel.sendProactiveMessage(content);
                results.set(name, success);
            }
            catch (e) {
                console.error(`[ChannelManager] Failed to broadcast to "${name}":`, e);
                results.set(name, false);
            }
        });
        await Promise.all(promises);
        return results;
    }
    /**
     * 获取渠道状态摘要
     */
    getStatus() {
        return Array.from(this.channels.values()).map((channel) => ({
            name: channel.name,
            running: channel.isRunning,
        }));
    }
}
//# sourceMappingURL=manager.js.map