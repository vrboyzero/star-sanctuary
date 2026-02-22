/**
 * 工具增强型 Agent
 *
 * 支持工具调用的 Agent 实现，集成完整的钩子系统。
 */
import { FailoverClient } from "./failover-client.js";
import { buildUrl, preprocessMultimodalContent } from "./multimodal.js";
import { buildAnthropicRequest, parseAnthropicResponse, } from "./anthropic.js";
import { estimateTokens, needsInLoopCompaction, compactIncremental, createEmptyCompactionState } from "./compaction.js";
export class ToolEnabledAgent {
    opts;
    failoverClient;
    constructor(opts) {
        this.opts = {
            ...opts,
            timeoutMs: opts.timeoutMs ?? 120_000,
            maxToolCalls: opts.maxToolCalls ?? 999999,
        };
        // 初始化容灾客户端
        this.failoverClient = new FailoverClient({
            primary: { id: "primary", baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model },
            fallbacks: opts.fallbacks,
            logger: opts.failoverLogger,
        });
    }
    async *run(input) {
        const startTime = Date.now();
        const legacyHookCtx = { agentId: "tool-agent", conversationId: input.conversationId };
        // 新版钩子上下文
        const agentHookCtx = {
            agentId: "tool-agent",
            sessionKey: input.conversationId,
        };
        // Hook: beforeRun / before_agent_start
        // 优先使用新版 hookRunner，向后兼容旧版 hooks
        if (this.opts.hookRunner) {
            try {
                const hookRes = await this.opts.hookRunner.runBeforeAgentStart({ prompt: typeof input.content === 'string' ? input.content : input.text, messages: input.history }, // TODO: Update hook types for multimodal
                agentHookCtx);
                if (hookRes) {
                    // 注入系统提示词前置上下文
                    if (hookRes.prependContext) {
                        input = { ...input, text: `${hookRes.prependContext}\n\n${input.text}` };
                    }
                    // systemPrompt 由 hook 返回时，覆盖原有
                    // 这里暂不处理 systemPrompt，保留给调用方在 opts 中设置
                }
            }
            catch (err) {
                yield { type: "status", status: "error" };
                yield { type: "final", text: `钩子 before_agent_start 执行失败: ${err}` };
                return;
            }
        }
        else if (this.opts.hooks?.beforeRun) {
            // 向后兼容：旧版 hooks
            try {
                const hookRes = await this.opts.hooks.beforeRun({ input }, legacyHookCtx);
                if (hookRes && typeof hookRes === "object") {
                    input = { ...input, ...hookRes };
                }
            }
            catch (err) {
                yield { type: "status", status: "error" };
                yield { type: "final", text: `Hook beforeRun failed: ${err}` };
                return;
            }
        }
        yield { type: "status", status: "running" };
        let content = input.content || input.text;
        // Preprocess: upload local videos to Moonshot
        const needsVideoUpload = Array.isArray(content) &&
            content.some((p) => p.type === "video_url" && p.video_url?.url?.startsWith("file://"));
        if (needsVideoUpload) {
            yield { type: "status", status: "uploading_video" };
            const profiles = this.failoverClient.getProfiles();
            const profile = profiles.find(p => p.id === "primary") || profiles[0];
            if (profile) {
                const result = await preprocessMultimodalContent(content, profile, this.opts.videoUploadConfig);
                content = result.content;
            }
        }
        const messages = buildInitialMessages(this.opts.systemPrompt, content, input.history, input.userUuid, input.senderInfo, input.roomContext);
        const tools = this.opts.toolExecutor.getDefinitions();
        let toolCallCount = 0;
        const generatedItems = [];
        let runSuccess = true;
        let runError;
        // ReAct 循环内压缩状态
        let loopCompactionState = createEmptyCompactionState();
        // Usage 累加器
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCacheCreation = 0;
        let totalCacheRead = 0;
        let modelCallCount = 0;
        const buildUsageItem = () => ({
            type: "usage",
            systemPromptTokens: this.opts.systemPrompt ? estimateTokens(this.opts.systemPrompt) : 0,
            contextTokens: (input.history ?? []).reduce((sum, m) => sum + estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content)) + 4, 0),
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheCreationTokens: totalCacheCreation,
            cacheReadTokens: totalCacheRead,
            modelCalls: modelCallCount,
        });
        // 辅助函数：yield 并收集 items
        const yieldItem = async function* (item) {
            generatedItems.push(item);
            yield item;
        };
        try {
            while (true) {
                // ReAct 循环内压缩检查：当上下文接近上限时，压缩历史消息
                const maxInput = this.opts.maxInputTokens;
                if (maxInput && maxInput > 0 && this.opts.compaction?.enabled !== false) {
                    const triggerFraction = this.opts.compaction?.triggerFraction ?? 0.75;
                    const currentTokens = estimateMessagesTotal(messages);
                    if (needsInLoopCompaction(currentTokens, maxInput, triggerFraction)) {
                        try {
                            loopCompactionState = await this.compactInLoop(messages, loopCompactionState);
                        }
                        catch (err) {
                            console.error(`[agent] [compaction] in-loop compaction failed: ${err}`);
                            // 压缩失败不阻塞，继续执行（trimMessagesToFit 会兜底）
                        }
                    }
                }
                // 调用模型
                const response = await this.callModel(messages, tools.length > 0 ? tools : undefined);
                // 记录并累加 usage 信息
                if (response.ok && response.usage) {
                    const u = response.usage;
                    modelCallCount++;
                    totalInputTokens += u.input_tokens;
                    totalOutputTokens += u.output_tokens;
                    totalCacheCreation += u.cache_creation_input_tokens ?? 0;
                    totalCacheRead += u.cache_read_input_tokens ?? 0;
                    const parts = [`input=${u.input_tokens}`, `output=${u.output_tokens}`];
                    if (u.cache_creation_input_tokens)
                        parts.push(`cache_create=${u.cache_creation_input_tokens}`);
                    if (u.cache_read_input_tokens)
                        parts.push(`cache_read=${u.cache_read_input_tokens}`);
                    console.log(`[agent] [usage] ${parts.join(" ")}`);
                }
                else if (response.ok) {
                    modelCallCount++;
                }
                if (!response.ok) {
                    runSuccess = false;
                    runError = response.error;
                    yield* yieldItem(buildUsageItem());
                    yield* yieldItem({ type: "final", text: response.error });
                    yield* yieldItem({ type: "status", status: "error" });
                    return;
                }
                // 输出文本增量（如果有）；先剥离工具调用协议块，避免在对话中展示
                const contentForDisplay = stripToolCallsSection(response.content || "");
                if (contentForDisplay) {
                    for (const delta of splitText(contentForDisplay, 16)) {
                        yield* yieldItem({ type: "delta", delta });
                    }
                }
                // 检查是否有工具调用
                const toolCalls = response.toolCalls;
                console.log(`[TOOL-CHECK] 工具调用数量: ${toolCalls?.length ?? 0}, 响应内容长度: ${response.content?.length ?? 0}`);
                if (!toolCalls || toolCalls.length === 0) {
                    // 无工具调用，输出最终结果（已剥离协议块）
                    console.log(`[TOOL-CHECK] 无工具调用，直接返回文本结果`);
                    yield* yieldItem(buildUsageItem());
                    yield* yieldItem({ type: "final", text: contentForDisplay });
                    yield* yieldItem({ type: "status", status: "done" });
                    return;
                }
                console.log(`[TOOL-CHECK] 检测到工具调用:`, toolCalls.map(tc => tc.function.name).join(', '));
                // 防止无限循环
                toolCallCount += toolCalls.length;
                if (toolCallCount > this.opts.maxToolCalls) {
                    runSuccess = false;
                    runError = `工具调用次数超限（最大 ${this.opts.maxToolCalls} 次）`;
                    yield* yieldItem(buildUsageItem());
                    yield* yieldItem({ type: "final", text: runError });
                    yield* yieldItem({ type: "status", status: "error" });
                    return;
                }
                // 将 assistant 消息（含 tool_calls）加入历史
                messages.push({
                    role: "assistant",
                    content: response.content || undefined,
                    tool_calls: toolCalls,
                    reasoning_content: response.reasoning_content,
                });
                // 执行工具调用
                for (const tc of toolCalls) {
                    const request = {
                        id: tc.id,
                        name: tc.function.name,
                        arguments: safeParseJson(tc.function.arguments),
                    };
                    const toolStartTime = Date.now();
                    // 工具钩子上下文
                    const toolHookCtx = {
                        agentId: "tool-agent",
                        sessionKey: input.conversationId,
                        toolName: request.name,
                    };
                    // Hook: beforeToolCall / before_tool_call
                    if (this.opts.hookRunner) {
                        try {
                            const hookRes = await this.opts.hookRunner.runBeforeToolCall({ toolName: request.name, params: request.arguments }, toolHookCtx);
                            if (hookRes?.block) {
                                // 被钩子阻止
                                const reason = hookRes.blockReason || "被钩子阻止";
                                yield* yieldItem({ type: "final", text: `工具 ${request.name} 执行被阻止: ${reason}` });
                                continue;
                            }
                            if (hookRes?.params) {
                                request.arguments = hookRes.params;
                            }
                        }
                        catch (err) {
                            yield* yieldItem({ type: "final", text: `钩子 before_tool_call 执行失败: ${err}` });
                            continue;
                        }
                    }
                    else if (this.opts.hooks?.beforeToolCall) {
                        // 向后兼容：旧版 hooks
                        try {
                            const hookRes = await this.opts.hooks.beforeToolCall({
                                toolName: request.name,
                                arguments: request.arguments,
                                id: request.id
                            }, legacyHookCtx);
                            if (hookRes === false) {
                                yield* yieldItem({ type: "final", text: `Tool execution cancelled by hook: ${request.name}` });
                                continue;
                            }
                            if (hookRes && typeof hookRes === "object") {
                                request.arguments = hookRes;
                            }
                        }
                        catch (err) {
                            yield* yieldItem({ type: "final", text: `Hook beforeToolCall failed: ${err}` });
                            continue;
                        }
                    }
                    // 广播工具调用事件
                    yield* yieldItem({
                        type: "tool_call",
                        id: request.id,
                        name: request.name,
                        arguments: request.arguments,
                    });
                    // 执行工具
                    const result = await this.opts.toolExecutor.execute(request, input.conversationId, input.agentId, input.userUuid, input.senderInfo, input.roomContext);
                    const toolDurationMs = Date.now() - toolStartTime;
                    // Hook: afterToolCall / after_tool_call
                    if (this.opts.hookRunner) {
                        try {
                            await this.opts.hookRunner.runAfterToolCall({
                                toolName: result.name,
                                params: request.arguments,
                                result: result.output,
                                error: result.error,
                                durationMs: toolDurationMs,
                            }, toolHookCtx);
                        }
                        catch (err) {
                            this.opts.logger?.error("agent", `钩子 after_tool_call 执行失败: ${err}`) ?? console.error(`钩子 after_tool_call 执行失败: ${err}`);
                        }
                    }
                    else if (this.opts.hooks?.afterToolCall) {
                        // 向后兼容：旧版 hooks
                        try {
                            await this.opts.hooks.afterToolCall({
                                toolName: result.name,
                                arguments: request.arguments,
                                result: result.output,
                                success: result.success,
                                error: result.error,
                                id: result.id
                            }, legacyHookCtx);
                        }
                        catch (err) {
                            this.opts.logger?.error("agent", `Hook afterToolCall failed: ${err}`) ?? console.error(`Hook afterToolCall failed: ${err}`);
                        }
                    }
                    // 广播工具结果事件
                    yield* yieldItem({
                        type: "tool_result",
                        id: result.id,
                        name: result.name,
                        success: result.success,
                        output: result.output,
                        error: result.error,
                    });
                    // 将工具结果加入消息历史
                    messages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: result.success ? result.output : `错误：${result.error}`,
                    });
                }
                // 继续循环，让模型处理工具结果
            }
        }
        finally {
            const durationMs = Date.now() - startTime;
            // Hook: afterRun / agent_end
            if (this.opts.hookRunner) {
                try {
                    await this.opts.hookRunner.runAgentEnd({
                        messages: generatedItems,
                        success: runSuccess,
                        error: runError,
                        durationMs,
                    }, agentHookCtx);
                }
                catch (err) {
                    this.opts.logger?.error("agent", `钩子 agent_end 执行失败: ${err}`) ?? console.error(`钩子 agent_end 执行失败: ${err}`);
                }
            }
            else if (this.opts.hooks?.afterRun) {
                // 向后兼容：旧版 hooks
                try {
                    await this.opts.hooks.afterRun({ input, items: generatedItems }, legacyHookCtx);
                }
                catch (err) {
                    this.opts.logger?.error("agent", `Hook afterRun failed: ${err}`) ?? console.error(`Hook afterRun failed: ${err}`);
                }
            }
        }
    }
    async callModel(messages, tools) {
        try {
            // 输入 token 预检：超限时裁剪历史消息
            const maxInput = this.opts.maxInputTokens;
            if (maxInput && maxInput > 0) {
                trimMessagesToFit(messages, tools, maxInput);
            }
            // 用于记录实际使用的协议（由 buildRequest 内部决定）
            let usedProtocol = "openai";
            const { response: res } = await this.failoverClient.fetchWithFailover({
                timeoutMs: this.opts.timeoutMs,
                buildRequest: (profile) => {
                    // 按 profile 的 baseUrl 动态检测协议（而非全局固定）
                    const profileProtocol = this.opts.protocol ?? detectProtocol(profile.baseUrl);
                    usedProtocol = profileProtocol;
                    if (profileProtocol === "anthropic") {
                        return buildAnthropicRequest({
                            profile,
                            messages: messages,
                            tools: tools,
                            maxTokens: 4096,
                            stream: false,
                            enableCaching: true,
                        });
                    }
                    // OpenAI 协议
                    const cleanMessages = messages.map(m => cleanupMessage(m, profile.model));
                    const payload = {
                        model: profile.model,
                        messages: cleanMessages,
                        max_tokens: 4096,
                        stream: false,
                    };
                    if (tools && tools.length > 0) {
                        payload.tools = tools;
                        payload.tool_choice = "auto";
                    }
                    return {
                        url: buildUrl(profile.baseUrl, "/chat/completions"),
                        init: {
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                authorization: `Bearer ${profile.apiKey}`,
                            },
                            body: JSON.stringify(payload),
                        },
                    };
                },
            });
            if (!res.ok) {
                const text = await safeReadText(res);
                return { ok: false, error: `模型调用失败（HTTP ${res.status}）：${text}` };
            }
            // 按实际使用的协议解析响应
            if (usedProtocol === "anthropic") {
                const json = (await res.json());
                const parsed = parseAnthropicResponse(json);
                const toolCalls = parsed.toolCalls && parsed.toolCalls.length > 0
                    ? parsed.toolCalls.map(tc => ({
                        id: tc.id,
                        type: "function",
                        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                    }))
                    : undefined;
                return { ok: true, content: parsed.content, toolCalls, usage: parsed.usage };
            }
            // OpenAI 响应解析
            const json = (await res.json());
            const choice = json.choices?.[0];
            if (!choice) {
                return { ok: false, error: "模型返回空响应" };
            }
            const message = choice.message;
            const content = typeof message?.content === "string" ? message.content : "";
            const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : undefined;
            const reasoning_content = typeof message?.reasoning_content === "string" ? message.reasoning_content : undefined;
            // 提取 OpenAI usage（prompt_tokens → input_tokens, completion_tokens → output_tokens）
            const rawUsage = json.usage;
            const usage = rawUsage ? {
                input_tokens: rawUsage.prompt_tokens ?? rawUsage.input_tokens ?? 0,
                output_tokens: rawUsage.completion_tokens ?? rawUsage.output_tokens ?? 0,
            } : undefined;
            return { ok: true, content, toolCalls, reasoning_content, usage };
        }
        catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                return { ok: false, error: `模型调用超时（${this.opts.timeoutMs}ms）` };
            }
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
    /**
     * ReAct 循环内压缩：将 messages 数组中的旧历史消息压缩为摘要。
     * 直接修改 messages 数组（in-place），返回更新后的 CompactionState。
     */
    async compactInLoop(messages, state) {
        // 提取可压缩的 user/assistant 消息（跳过 system 和 tool 消息）
        const systemMsg = messages[0]?.role === "system" ? messages[0] : null;
        const systemIdx = systemMsg ? 1 : 0;
        // 找到最后一条 user 消息的位置（当前轮次的输入）
        let lastUserIdx = messages.length - 1;
        while (lastUserIdx > systemIdx && messages[lastUserIdx].role !== "user") {
            lastUserIdx--;
        }
        // 收集可压缩的历史消息（system 之后、最近几轮之前的 user/assistant 对）
        const keepRecent = this.opts.compaction?.keepRecentCount ?? 10;
        const historyMessages = [];
        const historyIndices = [];
        for (let i = systemIdx; i < messages.length; i++) {
            const m = messages[i];
            if (m.role === "user" || m.role === "assistant") {
                historyMessages.push({ role: m.role, content: typeof m.content === "string" ? m.content || "" : JSON.stringify(m.content) });
                historyIndices.push(i);
            }
        }
        // 如果历史消息不够多，不压缩
        if (historyMessages.length <= keepRecent)
            return state;
        const result = await compactIncremental(historyMessages, state, {
            ...this.opts.compaction,
            summarizer: this.opts.summarizer,
        });
        if (!result.compacted)
            return state;
        // 替换 messages 数组：保留 system + 压缩后的消息 + tool 消息
        // 压缩后的消息已经包含摘要 + 最近消息
        const newMessages = [];
        if (systemMsg)
            newMessages.push(systemMsg);
        // 添加压缩后的 user/assistant 消息
        for (const m of result.messages) {
            newMessages.push({ role: m.role, content: m.content });
        }
        // 保留原始 messages 中的 tool 相关消息（在最近保留范围内的）
        const keptContentSet = new Set(result.messages.map(m => m.content));
        for (let i = systemIdx; i < messages.length; i++) {
            const m = messages[i];
            if (m.role === "tool") {
                // 只保留与最近消息关联的 tool 消息
                // 简单策略：保留最后 keepRecent*2 条消息范围内的 tool 消息
                if (i >= messages.length - keepRecent * 3) {
                    newMessages.push(m);
                }
            }
            else if (m.role === "assistant" && m.tool_calls) {
                // 保留带 tool_calls 的 assistant 消息（如果在最近范围内）
                if (i >= messages.length - keepRecent * 3) {
                    // 检查是否已经被压缩后的消息覆盖
                    const content = typeof m.content === "string" ? m.content : "";
                    if (!keptContentSet.has(content)) {
                        newMessages.push(m);
                    }
                }
            }
        }
        // in-place 替换
        messages.length = 0;
        messages.push(...newMessages);
        console.log(`[agent] [compaction] in-loop compaction: ${result.originalTokens} → ${result.compactedTokens} tokens (tier: ${result.tier})`);
        return result.state;
    }
}
/** 估算 messages 数组的总 token 数（用于循环内压缩判断） */
function estimateMessagesTotal(messages) {
    const MARGIN = 1.2;
    let total = 0;
    for (const m of messages) {
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        total += estimateTokens(content ?? "") + 4;
        if (m.role === "assistant" && m.tool_calls) {
            total += estimateTokens(JSON.stringify(m.tool_calls));
        }
    }
    return Math.ceil(total * MARGIN);
}
function buildInitialMessages(systemPrompt, userContent, history, userUuid, // 添加UUID参数
senderInfo, // 添加发送者信息
roomContext) {
    const messages = [];
    // Layer 1: System
    let finalSystemPrompt = systemPrompt?.trim() || "";
    // 动态注入身份上下文信息
    const contextLines = [];
    // 1. UUID环境信息
    if (userUuid) {
        contextLines.push("");
        contextLines.push("## Identity Context (Runtime)");
        contextLines.push("- **UUID Support**: ENABLED");
        contextLines.push(`- **Current User UUID**: ${userUuid}`);
        contextLines.push("- You can use the `get_user_uuid` tool to retrieve this UUID at any time.");
    }
    // 2. 发送者信息
    if (senderInfo) {
        if (contextLines.length === 0) {
            contextLines.push("");
            contextLines.push("## Identity Context (Runtime)");
        }
        contextLines.push("");
        contextLines.push("### Current Message Sender");
        contextLines.push(`- **Type**: ${senderInfo.type}`);
        contextLines.push(`- **ID**: ${senderInfo.id}`);
        if (senderInfo.name) {
            contextLines.push(`- **Name**: ${senderInfo.name}`);
        }
        if (senderInfo.type === "agent" && senderInfo.identity) {
            contextLines.push(`- **Identity**: ${senderInfo.identity}`);
        }
        contextLines.push("- You can use the `get_message_sender_info` tool to retrieve sender information at any time.");
    }
    // 3. 房间上下文信息
    if (roomContext) {
        if (contextLines.length === 0) {
            contextLines.push("");
            contextLines.push("## Identity Context (Runtime)");
        }
        contextLines.push("");
        contextLines.push("### Room Context");
        contextLines.push(`- **Environment**: ${roomContext.environment === "community" ? "office.goddess.ai Community" : "Local WebChat"}`);
        if (roomContext.roomId) {
            contextLines.push(`- **Room ID**: ${roomContext.roomId}`);
        }
        if (roomContext.members && roomContext.members.length > 0) {
            const users = roomContext.members.filter((m) => m.type === "user");
            const agents = roomContext.members.filter((m) => m.type === "agent");
            contextLines.push(`- **Members**: ${roomContext.members.length} total (${users.length} users, ${agents.length} agents)`);
            // 智能注入：≤阈值注入完整列表，>阈值只注入统计
            // 支持环境变量配置：BELLDANDY_ROOM_INJECT_THRESHOLD（默认10）
            const SMART_INJECT_THRESHOLD = parseInt(process.env.BELLDANDY_ROOM_INJECT_THRESHOLD || "10", 10);
            if (roomContext.members.length <= SMART_INJECT_THRESHOLD) {
                // 小型房间：注入完整成员列表
                if (users.length > 0) {
                    contextLines.push(`  - Users:`);
                    users.forEach((u) => {
                        contextLines.push(`    - ${u.name || "Unknown"} (UUID: ${u.id})`);
                    });
                }
                if (agents.length > 0) {
                    contextLines.push(`  - Agents:`);
                    agents.forEach((a) => {
                        contextLines.push(`    - ${a.name || "Unknown"} (Identity: ${a.identity || "Unknown"})`);
                    });
                }
            }
            else {
                // 大型房间：只注入统计，提示使用工具查询
                contextLines.push("- Use the `get_room_members` tool to retrieve the full member list with details.");
            }
        }
    }
    // 4. 身份权力规则激活状态
    if (userUuid || senderInfo || roomContext) {
        contextLines.push("");
        contextLines.push("### Identity-Based Authority Rules");
        if (roomContext && roomContext.environment === "community") {
            contextLines.push("- **Status**: ACTIVE (office.goddess.ai Community environment)");
            contextLines.push("- Identity-based authority rules (as defined in SOUL.md) are now in effect.");
            contextLines.push("- You should verify sender identity before executing sensitive commands.");
        }
        else if (userUuid) {
            contextLines.push("- **Status**: ACTIVE (UUID provided)");
            contextLines.push("- Identity-based authority rules (as defined in SOUL.md) are now in effect.");
        }
        else {
            contextLines.push("- **Status**: PARTIAL (sender info available but not in community environment)");
        }
    }
    if (contextLines.length > 0) {
        contextLines.push("");
        finalSystemPrompt += contextLines.join("\n");
    }
    if (finalSystemPrompt) {
        messages.push({ role: "system", content: finalSystemPrompt });
    }
    // Layer 2: History
    if (history && history.length > 0) {
        // 简单转换，tool agent 目前只支持基础 user/assistant 历史
        // 复杂 tool history 暂不还原（保持无状态简单性）
        for (const msg of history) {
            if (msg.role === "user" || msg.role === "assistant") {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
    }
    // Layer 3: Current User Message
    messages.push({ role: "user", content: userContent });
    return messages;
}
/**
 * 根据 baseUrl 自动检测 API 协议类型
 */
function detectProtocol(baseUrl) {
    const lower = baseUrl.toLowerCase();
    if (lower.includes("anthropic.com")) {
        return "anthropic";
    }
    return "openai";
}
// 辅助函数：转换 Message 对象为 OpenAI 格式（去除 undefined 字段）
function cleanupMessage(msg, modelId) {
    if (msg.role === "assistant") {
        // 显式保留 reasoning_content，即使它不是标准 OpenAI 字段
        // 因为某些兼容模型（如 Kimi）需要它作为历史上下文
        const cleaned = {
            role: msg.role,
            content: msg.content,
            tool_calls: msg.tool_calls,
            reasoning_content: msg.reasoning_content,
        };
        // [兼容性修复] 针对 Kimi/DeepSeek 等思考模型
        // 如果历史消息中缺少 reasoning_content（例如来自非思考模型 Claude），
        // 且当前请求的目标模型是思考模型，则注入空思考占位符，防止 API 报错
        const isReasoningModel = modelId && (modelId.includes("kimi") || modelId.includes("deepseek"));
        if (isReasoningModel && msg.tool_calls && !msg.reasoning_content) {
            cleaned.reasoning_content = "（思考内容已省略）";
        }
        return cleaned;
    }
    return msg;
}
function safeParseJson(str) {
    try {
        const parsed = JSON.parse(str);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
}
async function safeReadText(res) {
    try {
        const text = await res.text();
        return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    }
    catch {
        return "";
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
/** 移除模型输出中的工具调用协议块，避免在对话中展示给用户 */
function stripToolCallsSection(text) {
    if (!text || typeof text !== "string")
        return text;
    return text
        .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, "\n\n（正在执行操作）\n\n")
        .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
/**
 * 输入 token 预检：估算 messages + tools 的总 token 数，
 * 超限时从历史消息（非 system、非最后一条 user）开始裁剪。
 * 直接修改 messages 数组（in-place）。
 */
function trimMessagesToFit(messages, tools, maxTokens) {
    const SAFETY_MARGIN = 1.2;
    // 估算工具定义的 token 数（只算一次）
    let toolsTokens = 0;
    if (tools) {
        for (const t of tools) {
            toolsTokens += estimateTokens(t.function.name + t.function.description + JSON.stringify(t.function.parameters));
        }
    }
    // 估算总 token
    const estimateTotal = () => {
        let total = toolsTokens;
        for (const m of messages) {
            const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
            total += estimateTokens(content ?? "") + 4; // +4 for role/formatting
            if (m.role === "assistant" && m.tool_calls) {
                total += estimateTokens(JSON.stringify(m.tool_calls));
            }
        }
        return Math.ceil(total * SAFETY_MARGIN);
    };
    let total = estimateTotal();
    if (total <= maxTokens)
        return;
    // 找到可裁剪的历史消息索引（跳过 system 和最后一条 user）
    // messages 结构：[system?, ...history(user/assistant), current_user]
    // 从 index 1 开始裁剪（保留 system），保留最后一条（current user）
    while (total > maxTokens && messages.length > 2) {
        // 找第一条非 system 消息（但不是最后一条）
        const idx = messages.findIndex((m, i) => m.role !== "system" && i < messages.length - 1);
        if (idx === -1)
            break;
        messages.splice(idx, 1);
        total = estimateTotal();
    }
}
//# sourceMappingURL=tool-agent.js.map