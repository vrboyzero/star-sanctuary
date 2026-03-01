import { type BelldandyAgent, ConversationStore, type AgentRegistry } from "@belldandy/agent";
import type { GatewayEventFrame } from "@belldandy/protocol";
import type { BelldandyLogger } from "./logger/index.js";
import type { ToolsConfigManager } from "./tools-config.js";
import type { ToolExecutor, TranscribeOptions, TranscribeResult, SkillRegistry } from "@belldandy/skills";
import type { PluginRegistry } from "@belldandy/plugins";
import type { WebhookConfig, IdempotencyManager } from "./webhook/index.js";
export type GatewayServerOptions = {
    port: number;
    host?: string;
    auth: {
        mode: "none" | "token" | "password";
        token?: string;
        password?: string;
    };
    webRoot: string;
    stateDir?: string;
    agentFactory?: () => BelldandyAgent;
    /** Multi-Agent registry (takes precedence over agentFactory when agentId is specified) */
    agentRegistry?: AgentRegistry;
    conversationStoreOptions?: {
        maxHistory?: number;
        ttlSeconds?: number;
    };
    conversationStore?: ConversationStore;
    onActivity?: () => void;
    /** 可选：统一 Logger，未提供时使用 console */
    logger?: BelldandyLogger;
    /** Server-side auto TTS: check if TTS mode is enabled */
    ttsEnabled?: () => boolean;
    /** Server-side auto TTS: synthesize speech from text */
    ttsSynthesize?: (text: string) => Promise<{
        webPath: string;
        htmlAudio: string;
    } | null>;
    /** 调用设置管理器 */
    toolsConfigManager?: ToolsConfigManager;
    /** 工具执行器（用于获取已注册工具列表） */
    toolExecutor?: ToolExecutor;
    /** STT implementation: transcribe speech from audio buffer */
    sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
    /** 插件注册表（用于获取已加载插件列表） */
    pluginRegistry?: PluginRegistry;
    /** 可选：检查当前是否已配置好 AI 模型（用于 hello-ok 中告知前端是否需要引导配置）*/
    isConfigured?: () => boolean;
    /** 技能注册表（用于获取已加载技能列表） */
    skillRegistry?: SkillRegistry;
    /** Webhook 配置 */
    webhookConfig?: WebhookConfig;
    /** Webhook 幂等性管理器 */
    webhookIdempotency?: IdempotencyManager;
};
export type GatewayServer = {
    port: number;
    host: string;
    close: () => Promise<void>;
    broadcast: (frame: GatewayEventFrame) => void;
};
export declare function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer>;
//# sourceMappingURL=server.d.ts.map