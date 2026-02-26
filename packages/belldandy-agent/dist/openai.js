import { FailoverClient } from "./failover-client.js";
import { buildUrl, preprocessMultimodalContent } from "./multimodal.js";
/**
 * 检测 API 协议类型
 * - 如果指定了 forceProtocol 参数，优先使用该值
 * - 否则根据 baseUrl 自动检测
 * - Anthropic 协议：Anthropic 官方、Kimi Code 等
 * - OpenAI 协议：OpenAI、Azure、Moonshot、Gemini 等
 */
function detectProtocol(baseUrl, forceProtocol) {
    // 优先使用强制指定的协议
    if (forceProtocol) {
        return forceProtocol;
    }
    const lowerUrl = baseUrl.toLowerCase();
    // Anthropic 官方 API 或兼容端点
    if (lowerUrl.includes("anthropic.com") || lowerUrl.includes("kimi.com/coding")) {
        return "anthropic";
    }
    return "openai";
}
export class OpenAIChatAgent {
    opts;
    failoverClient;
    protocol;
    constructor(opts) {
        this.opts = {
            ...opts,
            timeoutMs: opts.timeoutMs ?? 60_000,
            stream: opts.stream ?? true,
        };
        // 检测 API 协议类型（优先使用用户指定的协议）
        this.protocol = detectProtocol(opts.baseUrl, opts.protocol);
        // 初始化容灾客户端
        this.failoverClient = new FailoverClient({
            primary: { id: "primary", baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model },
            fallbacks: opts.fallbacks,
            logger: opts.failoverLogger,
        });
    }
    async *run(input) {
        yield { type: "status", status: "running" };
        try {
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
            const messages = buildMessages(this.opts.systemPrompt, content, input.history);
            // 使用容灾客户端发送请求
            const { response: res, profile: usedProfile } = await this.failoverClient.fetchWithFailover({
                timeoutMs: this.opts.timeoutMs,
                buildRequest: (profile) => this.buildRequest(profile, messages),
            });
            // 实际使用的协议（跟随 failover 选中的 profile）
            const actualProtocol = usedProfile.protocol ?? this.protocol;
            if (!res.ok) {
                const text = await safeReadText(res);
                yield { type: "final", text: `模型调用失败（HTTP ${res.status}）：${text}` };
                yield { type: "status", status: "error" };
                return;
            }
            if (!this.opts.stream) {
                const json = (await res.json());
                const content = this.getNonStreamContent(json, actualProtocol);
                yield* emitChunkedFinal(content);
                return;
            }
            const body = res.body;
            if (!body) {
                yield { type: "final", text: "模型调用失败：响应体为空" };
                yield { type: "status", status: "error" };
                return;
            }
            let out = "";
            for await (const item of parseSseStream(body, actualProtocol)) {
                if (item.type === "delta") {
                    out += item.delta;
                    yield item;
                }
                if (item.type === "final") {
                    yield { type: "final", text: out };
                    yield { type: "status", status: "done" };
                    return;
                }
                if (item.type === "error") {
                    yield { type: "final", text: item.message };
                    yield { type: "status", status: "error" };
                    return;
                }
            }
            yield { type: "final", text: out };
            yield { type: "status", status: "done" };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            yield { type: "final", text: `模型调用异常：${msg}` };
            yield { type: "status", status: "error" };
        }
    }
    buildRequest(profile, messages) {
        // 优先使用 profile 自身的 protocol（models.json 配置），再 fallback 到 agent 级别协议
        const effectiveProtocol = profile.protocol ?? this.protocol;
        if (effectiveProtocol === "anthropic") {
            // Anthropic 协议：提取 system 消息，使用数组格式支持 prompt caching
            const systemMessage = messages.find(m => m.role === "system")?.content;
            const chatMessages = messages.filter(m => m.role !== "system");
            const payload = {
                model: profile.model,
                messages: chatMessages,
                max_tokens: this.opts.maxOutputTokens ?? 4096,
                stream: this.opts.stream,
            };
            // System prompt 使用数组格式 + cache_control 启用 prompt caching
            if (systemMessage) {
                payload.system = [
                    {
                        type: "text",
                        text: typeof systemMessage === "string" ? systemMessage : JSON.stringify(systemMessage),
                        cache_control: { type: "ephemeral" },
                    },
                ];
            }
            // 标准 Anthropic API headers
            // 注意：某些服务（如 Kimi Code）可能有额外的客户端校验
            const headers = {
                "content-type": "application/json",
                "x-api-key": profile.apiKey,
                "anthropic-version": "2023-06-01",
            };
            return {
                url: buildUrl(profile.baseUrl, "/v1/messages"),
                init: {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                },
            };
        }
        // OpenAI 协议
        const payload = {
            model: profile.model,
            messages,
            max_tokens: this.opts.maxOutputTokens ?? 4096,
            stream: this.opts.stream,
        };
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
    }
    getNonStreamContent(json, protocol) {
        if ((protocol ?? this.protocol) === "anthropic") {
            // Anthropic 格式：{ content: [{ type: "text", text: "..." }] }
            const content = json.content;
            return content?.[0]?.text ?? "";
        }
        // OpenAI 格式：{ choices: [{ message: { content: "..." } }] }
        const choices = json.choices;
        return choices?.[0]?.message?.content ?? "";
    }
}
function buildMessages(systemPrompt, userContent, history) {
    const messages = [];
    // Layer 1: System
    if (systemPrompt && systemPrompt.trim()) {
        messages.push({ role: "system", content: systemPrompt.trim() });
    }
    // Layer 2: History
    if (history && history.length > 0) {
        messages.push(...history);
    }
    // Layer 3: Current User Message
    messages.push({ role: "user", content: userContent });
    return messages;
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
async function* emitChunkedFinal(text) {
    const chunks = splitText(text, 16);
    let out = "";
    for (const delta of chunks) {
        out += delta;
        yield { type: "delta", delta };
    }
    yield { type: "final", text: out };
    yield { type: "status", status: "done" };
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
async function* parseSseStream(body, protocol) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        while (true) {
            const idx = buffer.indexOf("\n\n");
            if (idx < 0)
                break;
            const eventBlock = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLines = eventBlock
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.startsWith("data:"))
                .map((l) => l.slice("data:".length).trim());
            for (const data of dataLines) {
                if (data === "[DONE]") {
                    yield { type: "final" };
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    if (protocol === "anthropic") {
                        // Anthropic SSE 格式
                        // { type: "content_block_delta", delta: { type: "text_delta", text: "..." } }
                        if (json.type === "content_block_delta" && json.delta?.text) {
                            yield { type: "delta", delta: json.delta.text };
                        }
                        // 消息结束标记
                        if (json.type === "message_stop") {
                            yield { type: "final" };
                            return;
                        }
                    }
                    else {
                        // OpenAI SSE 格式
                        const delta = json?.choices?.[0]?.delta?.content;
                        if (typeof delta === "string" && delta.length) {
                            yield { type: "delta", delta };
                        }
                    }
                }
                catch {
                    yield { type: "error", message: "模型流解析失败" };
                    return;
                }
            }
        }
    }
}
//# sourceMappingURL=openai.js.map