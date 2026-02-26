/**
 * 工具增强型 Agent
 *
 * 支持工具调用的 Agent 实现，集成完整的钩子系统。
 */
import type { ToolExecutor } from "@belldandy/skills";
import type { AgentRunInput, AgentStreamItem, BelldandyAgent, AgentHooks } from "./index.js";
import type { HookRunner } from "./hook-runner.js";
import { type ModelProfile, type FailoverLogger } from "./failover-client.js";
import { type VideoUploadConfig } from "./multimodal.js";
import { type CompactionOptions, type SummarizerFn } from "./compaction.js";
import type { ConversationStore } from "./conversation.js";
type ApiProtocol = "openai" | "anthropic";
export type ToolEnabledAgentOptions = {
    baseUrl: string;
    apiKey: string;
    model: string;
    toolExecutor: ToolExecutor;
    timeoutMs?: number;
    maxToolCalls?: number;
    systemPrompt?: string;
    /** 简化版钩子接口（向后兼容） */
    hooks?: AgentHooks;
    /** 新版钩子运行器（推荐使用） */
    hookRunner?: HookRunner;
    /** 可选：统一 Logger，用于钩子失败等日志 */
    logger?: {
        error(module: string, msg: string, data?: unknown): void;
    };
    /** 备用 Profile 列表（模型容灾） */
    fallbacks?: ModelProfile[];
    /** 容灾日志接口 */
    failoverLogger?: FailoverLogger;
    /** 视频文件上传专用配置（当聊天代理不支持 /files 端点时） */
    videoUploadConfig?: VideoUploadConfig;
    /** 强制指定 API 协议（默认自动检测） */
    protocol?: ApiProtocol;
    /** 最大输入 token 数限制（超过时自动裁剪历史消息，0 或不设表示不限制） */
    maxInputTokens?: number;
    /** 单次模型调用最大输出 token 数（默认 4096；调大可避免长输出被截断导致工具调用 JSON 损坏） */
    maxOutputTokens?: number;
    /** ReAct 循环内压缩配置（可选） */
    compaction?: CompactionOptions;
    /** 模型摘要函数（用于循环内压缩） */
    summarizer?: SummarizerFn;
    /** 会话存储（用于跨 run 持久化 token 计数器状态） */
    conversationStore?: ConversationStore;
};
export declare class ToolEnabledAgent implements BelldandyAgent {
    private readonly opts;
    private readonly failoverClient;
    constructor(opts: ToolEnabledAgentOptions);
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
    private callModel;
    /**
     * ReAct 循环内压缩：将 messages 数组中的旧历史消息压缩为摘要。
     * 直接修改 messages 数组（in-place），返回更新后的 CompactionState。
     */
    private compactInLoop;
}
export {};
//# sourceMappingURL=tool-agent.d.ts.map