import type { AgentRunInput, AgentStreamItem, BelldandyAgent } from "./index.js";
import { type ModelProfile, type FailoverLogger } from "./failover-client.js";
import { type VideoUploadConfig } from "./multimodal.js";
export type OpenAIWireApi = "chat_completions" | "responses";
export type OpenAIChatAgentOptions = {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs?: number;
    stream?: boolean;
    systemPrompt?: string;
    /** 备用 Profile 列表（模型容灾） */
    fallbacks?: ModelProfile[];
    /** 容灾日志接口 */
    failoverLogger?: FailoverLogger;
    /** 视频文件上传专用配置（当聊天代理不支持 /files 端点时） */
    videoUploadConfig?: VideoUploadConfig;
    /** 强制指定 API 协议（默认自动检测） */
    protocol?: ApiProtocol;
    /** 单次模型调用最大输出 token 数（默认 4096；调大可避免长输出被截断） */
    maxOutputTokens?: number;
    /** OpenAI 协议底层线路：chat.completions（默认）或 responses */
    wireApi?: OpenAIWireApi;
    /** 同一 profile 最大重试次数（不含首次请求） */
    maxRetries?: number;
    /** 同一 profile 重试退避基线（毫秒） */
    retryBackoffMs?: number;
    /** primary profile 专用代理 URL（可选） */
    proxyUrl?: string;
    /** 启动阶段预置冷却（毫秒） */
    bootstrapProfileCooldowns?: Record<string, number>;
};
type ApiProtocol = "openai" | "anthropic";
export declare class OpenAIChatAgent implements BelldandyAgent {
    private readonly opts;
    private readonly failoverClient;
    private readonly protocol;
    constructor(opts: OpenAIChatAgentOptions);
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
    private buildRequest;
    private getNonStreamContent;
}
export {};
//# sourceMappingURL=openai.d.ts.map