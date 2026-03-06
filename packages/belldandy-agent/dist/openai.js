import { FailoverClient } from "./failover-client.js";
import { buildUrl, preprocessMultimodalContent } from "./multimodal.js";
const MIN_MULTIMODAL_REQUEST_TIMEOUT_MS = 300_000;
const LARGE_TEXT_ATTACHMENT_TRIGGER_CHARS = 12_000;
const HUGE_TEXT_ATTACHMENT_TRIGGER_CHARS = 30_000;
const MIN_LARGE_TEXT_ATTACHMENT_TIMEOUT_MS = 120_000;
const MIN_HUGE_TEXT_ATTACHMENT_TIMEOUT_MS = 300_000;
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
function normalizeWireApi(raw) {
    if (!raw)
        return undefined;
    const value = raw.trim().toLowerCase();
    if (value === "responses")
        return "responses";
    if (value === "chat_completions")
        return "chat_completions";
    return undefined;
}
function resolveWireApiForProfile(profile, defaultWireApi) {
    const fromProfile = normalizeWireApi(profile.wireApi);
    if (fromProfile)
        return fromProfile;
    // fallback profile 默认走 chat_completions，避免全局 responses 导致兼容模型 404
    if (profile.id && profile.id !== "primary")
        return "chat_completions";
    return defaultWireApi;
}
function hasMultimodalContentInMessages(messages) {
    return messages.some((m) => Array.isArray(m.content) && m.content.some((part) => typeof part?.type === "string" && part.type !== "text"));
}
function readTextAttachmentChars(meta) {
    if (!meta || typeof meta !== "object")
        return 0;
    const stats = meta.attachmentStats;
    const value = stats?.textAttachmentChars;
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;
}
function resolveMinimumAdaptiveTimeoutMs(messages, textAttachmentChars) {
    let minimumTimeoutMs = 0;
    if (hasMultimodalContentInMessages(messages)) {
        minimumTimeoutMs = Math.max(minimumTimeoutMs, MIN_MULTIMODAL_REQUEST_TIMEOUT_MS);
    }
    if (textAttachmentChars >= HUGE_TEXT_ATTACHMENT_TRIGGER_CHARS) {
        minimumTimeoutMs = Math.max(minimumTimeoutMs, MIN_HUGE_TEXT_ATTACHMENT_TIMEOUT_MS);
    }
    else if (textAttachmentChars >= LARGE_TEXT_ATTACHMENT_TRIGGER_CHARS) {
        minimumTimeoutMs = Math.max(minimumTimeoutMs, MIN_LARGE_TEXT_ATTACHMENT_TIMEOUT_MS);
    }
    return minimumTimeoutMs > 0 ? minimumTimeoutMs : undefined;
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
            wireApi: opts.wireApi ?? "chat_completions",
            maxRetries: opts.maxRetries ?? 0,
            retryBackoffMs: opts.retryBackoffMs ?? 300,
        };
        // 检测 API 协议类型（优先使用用户指定的协议）
        this.protocol = detectProtocol(opts.baseUrl, opts.protocol);
        // 初始化容灾客户端
        this.failoverClient = new FailoverClient({
            primary: {
                id: "primary",
                baseUrl: opts.baseUrl,
                apiKey: opts.apiKey,
                model: opts.model,
                proxyUrl: opts.proxyUrl,
            },
            fallbacks: opts.fallbacks,
            logger: opts.failoverLogger,
            bootstrapCooldowns: opts.bootstrapProfileCooldowns,
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
            const textAttachmentChars = readTextAttachmentChars(input.meta);
            const minimumAdaptiveTimeoutMs = resolveMinimumAdaptiveTimeoutMs(messages, textAttachmentChars);
            const requestTimeoutMs = minimumAdaptiveTimeoutMs
                ? Math.max(this.opts.timeoutMs, minimumAdaptiveTimeoutMs)
                : this.opts.timeoutMs;
            // 使用容灾客户端发送请求
            const { response: res, profile: usedProfile } = await this.failoverClient.fetchWithFailover({
                timeoutMs: requestTimeoutMs,
                minimumTimeoutMs: minimumAdaptiveTimeoutMs,
                maxRetries: this.opts.maxRetries,
                retryBackoffMs: this.opts.retryBackoffMs,
                buildRequest: (profile) => this.buildRequest(profile, messages),
            });
            // 实际使用的协议（跟随 failover 选中的 profile）
            const actualProtocol = usedProfile.protocol ?? this.protocol;
            const actualWireApi = resolveWireApiForProfile(usedProfile, this.opts.wireApi);
            if (!res.ok) {
                const text = await safeReadText(res);
                yield { type: "final", text: `模型调用失败（HTTP ${res.status}）：${text}` };
                yield { type: "status", status: "error" };
                return;
            }
            if (!this.opts.stream) {
                const json = (await res.json());
                const content = this.getNonStreamContent(json, actualProtocol, actualWireApi);
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
            for await (const item of parseSseStream(body, actualProtocol, actualWireApi)) {
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
        const effectiveWireApi = resolveWireApiForProfile(profile, this.opts.wireApi);
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
        if (effectiveWireApi === "responses") {
            const payload = {
                model: profile.model,
                input: buildResponsesInput(messages),
                max_output_tokens: this.opts.maxOutputTokens ?? 4096,
                stream: this.opts.stream,
            };
            return {
                url: buildUrl(profile.baseUrl, "/responses"),
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
    getNonStreamContent(json, protocol, wireApi) {
        if ((protocol ?? this.protocol) === "anthropic") {
            // Anthropic 格式：{ content: [{ type: "text", text: "..." }] }
            const content = json.content;
            return content?.[0]?.text ?? "";
        }
        if ((wireApi ?? this.opts.wireApi) === "responses") {
            return extractResponsesText(json);
        }
        // OpenAI Chat Completions 格式：{ choices: [{ message: { content: "..." } }] }
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
async function* parseSseStream(body, protocol, wireApi) {
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
                        if (wireApi === "responses") {
                            // Responses SSE: response.output_text.delta / response.completed
                            if (json?.type === "response.output_text.delta" && typeof json.delta === "string" && json.delta.length) {
                                yield { type: "delta", delta: json.delta };
                                continue;
                            }
                            if (json?.type === "response.completed") {
                                yield { type: "final" };
                                return;
                            }
                            if (json?.type === "response.error" || json?.type === "error") {
                                const message = json?.error?.message ?? "模型流返回错误";
                                yield { type: "error", message };
                                return;
                            }
                        }
                        else {
                            // OpenAI Chat Completions SSE 格式
                            const delta = json?.choices?.[0]?.delta?.content;
                            if (typeof delta === "string" && delta.length) {
                                yield { type: "delta", delta };
                            }
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
function buildResponsesInput(messages) {
    const input = [];
    for (const message of messages) {
        const role = toResponsesRole(message.role);
        const content = toResponsesContent(message.content);
        if (typeof content === "undefined")
            continue;
        input.push({ role, content });
    }
    return input;
}
function toResponsesRole(role) {
    if (role === "system" || role === "developer")
        return "developer";
    if (role === "assistant")
        return "assistant";
    return "user";
}
function toResponsesContent(content) {
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        const mapped = content
            .map((part) => {
            if (!part || typeof part !== "object")
                return undefined;
            if (part.type === "text" && typeof part.text === "string") {
                return { type: "input_text", text: part.text };
            }
            if (part.type === "image_url" && typeof part.image_url?.url === "string") {
                return { type: "input_image", image_url: part.image_url.url };
            }
            if (part.type === "video_url" && typeof part.video_url?.url === "string") {
                return { type: "input_text", text: `[Video] ${part.video_url.url}` };
            }
            return undefined;
        })
            .filter(Boolean);
        return mapped.length > 0 ? mapped : undefined;
    }
    if (content === null || typeof content === "undefined") {
        return undefined;
    }
    return String(content);
}
function extractResponsesText(json) {
    const direct = json.output_text;
    if (typeof direct === "string") {
        return direct;
    }
    const output = Array.isArray(json.output) ? json.output : [];
    const chunks = [];
    for (const item of output) {
        if (!item || typeof item !== "object")
            continue;
        if (item.type === "message" && Array.isArray(item.content)) {
            for (const part of item.content) {
                if (!part || typeof part !== "object")
                    continue;
                if (typeof part.text === "string" && part.text.length > 0) {
                    chunks.push(part.text);
                }
            }
        }
    }
    return chunks.join("");
}
//# sourceMappingURL=openai.js.map