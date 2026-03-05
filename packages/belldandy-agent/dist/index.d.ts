import type { JsonObject } from "@belldandy/protocol";
export { OpenAIChatAgent, type OpenAIChatAgentOptions } from "./openai.js";
export { ToolEnabledAgent, type ToolEnabledAgentOptions } from "./tool-agent.js";
export { FailoverClient, loadModelFallbacks, classifyFailoverReason, isRetryableReason, type ModelProfile, type FailoverReason, type FailoverAttempt, type FailoverResult, type FailoverLogger, type ModelConfigFile, } from "./failover-client.js";
export { ensureWorkspace, loadWorkspaceFiles, ensureAgentWorkspace, loadAgentWorkspaceFiles, needsBootstrap, createBootstrapFile, removeBootstrapFile, extractIdentityInfo, SOUL_FILENAME, IDENTITY_FILENAME, USER_FILENAME, BOOTSTRAP_FILENAME, AGENTS_FILENAME, TOOLS_FILENAME, HEARTBEAT_FILENAME, type WorkspaceFile, type WorkspaceFileName, type WorkspaceLoadResult, type IdentityInfo, } from "./workspace.js";
export { buildSystemPrompt, buildWorkspaceContext, type SystemPromptParams, } from "./system-prompt.js";
export { ConversationStore, type Conversation, type ConversationMessage, type ConversationStoreOptions, } from "./conversation.js";
export type AgentContentPart = {
    type: "text";
    text: string;
} | {
    type: "image_url";
    image_url: {
        url: string;
    };
} | {
    type: "video_url";
    video_url: {
        url: string;
    };
};
/** 消息发送者信息 */
export type SenderInfo = {
    type: "user" | "agent";
    id: string;
    name?: string;
    identity?: string;
};
/** 房间成员信息 */
export type RoomMember = {
    type: "user" | "agent";
    id: string;
    name?: string;
    identity?: string;
};
/** 房间上下文信息 */
export type RoomContext = {
    roomId?: string;
    environment: "local" | "community";
    members?: RoomMember[];
};
export type AgentRunInput = {
    conversationId: string;
    /**
     * Legacy text field. If `content` is provided, it takes precedence.
     * If only `text` is provided, it will be treated as `{ type: "text", text }`.
     */
    text: string;
    /** 用户原始输入文本（可选；用于钩子语义召回等场景） */
    userInput?: string;
    /**
     * Multimodal content parts (text, image, etc).
     * Compatible with OpenAI's content array format.
     */
    content?: string | Array<AgentContentPart>;
    meta?: JsonObject;
    /** 当前 Agent ID（传递给 ToolExecutor 用于 per-agent workspace 定位） */
    agentId?: string;
    /** 对话历史（role 必须是 user 或 assistant） */
    history?: Array<{
        role: "user" | "assistant";
        content: string | Array<AgentContentPart>;
    }>;
    /** 用户UUID（用于身份权力验证） */
    userUuid?: string;
    /** 消息发送者信息（用于身份上下文） */
    senderInfo?: SenderInfo;
    /** 房间上下文信息（用于多人聊天场景） */
    roomContext?: RoomContext;
};
export type AgentDelta = {
    type: "delta";
    delta: string;
};
export type AgentFinal = {
    type: "final";
    text: string;
};
export type AgentStatus = {
    type: "status";
    status: "running" | "done" | "error";
};
export type AgentToolCall = {
    type: "tool_call";
    id: string;
    name: string;
    arguments: JsonObject;
};
export type AgentToolResult = {
    type: "tool_result";
    id: string;
    name: string;
    success: boolean;
    output: string;
    error?: string;
};
export type AgentUsage = {
    type: "usage";
    /** 系统提示词 token 估算 */
    systemPromptTokens: number;
    /** 上下文（历史+当前消息）token 估算 */
    contextTokens: number;
    /** API 实际 input tokens（ReAct 循环累加） */
    inputTokens: number;
    /** API 实际 output tokens（ReAct 循环累加） */
    outputTokens: number;
    /** Anthropic cache 创建 tokens */
    cacheCreationTokens: number;
    /** Anthropic cache 读取 tokens */
    cacheReadTokens: number;
    /** 本次 run 的模型调用次数 */
    modelCalls: number;
};
export type AgentStreamItem = AgentDelta | AgentFinal | AgentStatus | AgentToolCall | AgentToolResult | AgentUsage;
export interface BelldandyAgent {
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}
export declare class MockAgent implements BelldandyAgent {
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}
export * from "./hooks.js";
export { createHookRunner, type HookRunner, type HookRunnerLogger, type HookRunnerOptions } from "./hook-runner.js";
export { buildUrl, uploadFileToMoonshot, preprocessMultimodalContent, type PreprocessResult, type VideoUploadConfig } from "./multimodal.js";
export { convertMessagesToAnthropic, convertToolsToAnthropic, buildAnthropicRequest, parseAnthropicResponse, type AnthropicUsage, type AnthropicRequestPayload, type ParsedAnthropicResponse, } from "./anthropic.js";
export { buildDefaultProfile, loadAgentProfiles, resolveModelConfig, type AgentProfile, type AgentConfigFile, } from "./agent-profile.js";
export { AgentRegistry, type AgentFactoryFn, type AgentCreateOptions, } from "./agent-registry.js";
export { SubAgentOrchestrator, type SubAgentSession, type SubAgentSessionStatus, type SubAgentEvent, type SpawnOptions, type SpawnResult, type OrchestratorOptions, type OrchestratorLogger, type OrchestratorHookRunner, } from "./orchestrator.js";
export { compactMessages, compactIncremental, needsCompaction, needsInLoopCompaction, estimateTokens, estimateMessagesTokens, createEmptyCompactionState, type CompactionOptions, type CompactionResult, type CompactionState, type SummarizerFn, } from "./compaction.js";
//# sourceMappingURL=index.d.ts.map