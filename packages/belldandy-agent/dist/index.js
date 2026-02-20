export { OpenAIChatAgent } from "./openai.js";
export { ToolEnabledAgent } from "./tool-agent.js";
// Failover（模型容灾）
export { FailoverClient, loadModelFallbacks, classifyFailoverReason, isRetryableReason, } from "./failover-client.js";
// Workspace & System Prompt (SOUL/Persona)
export { ensureWorkspace, loadWorkspaceFiles, ensureAgentWorkspace, loadAgentWorkspaceFiles, needsBootstrap, createBootstrapFile, removeBootstrapFile, extractIdentityInfo, SOUL_FILENAME, IDENTITY_FILENAME, USER_FILENAME, BOOTSTRAP_FILENAME, AGENTS_FILENAME, TOOLS_FILENAME, HEARTBEAT_FILENAME, } from "./workspace.js";
export { buildSystemPrompt, buildWorkspaceContext, } from "./system-prompt.js";
export { ConversationStore, } from "./conversation.js";
export class MockAgent {
    async *run(input) {
        yield { type: "status", status: "running" };
        const response = `Belldandy(MVP) 收到：${input.text}`;
        const chunks = splitText(response, 6);
        let out = "";
        for (const delta of chunks) {
            out += delta;
            await sleep(60);
            yield { type: "delta", delta };
        }
        yield { type: "final", text: out };
        yield { type: "status", status: "done" };
    }
}
function splitText(text, size) {
    const out = [];
    let i = 0;
    while (i < text.length) {
        out.push(text.slice(i, i + Math.max(1, size)));
        i += Math.max(1, size);
    }
    return out;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// 钩子系统
export * from "./hooks.js";
export { createHookRunner } from "./hook-runner.js";
// 多模态预处理（视频上传等）
export { buildUrl, uploadFileToMoonshot, preprocessMultimodalContent } from "./multimodal.js";
// Anthropic 原生协议支持（prompt caching、消息/工具转换）
export { convertMessagesToAnthropic, convertToolsToAnthropic, buildAnthropicRequest, parseAnthropicResponse, } from "./anthropic.js";
// Agent Profile（多 Agent 预备）
export { buildDefaultProfile, loadAgentProfiles, resolveModelConfig, } from "./agent-profile.js";
// Agent Registry（多 Agent 注册表）
export { AgentRegistry, } from "./agent-registry.js";
// Sub-Agent Orchestrator（子 Agent 编排）
export { SubAgentOrchestrator, } from "./orchestrator.js";
// 对话压缩
export { compactMessages, compactIncremental, needsCompaction, needsInLoopCompaction, estimateTokens, estimateMessagesTokens, createEmptyCompactionState, } from "./compaction.js";
//# sourceMappingURL=index.js.map