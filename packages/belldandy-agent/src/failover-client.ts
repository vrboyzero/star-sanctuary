/**
 * Model Failover Client
 *
 * 封装 HTTP 请求逻辑，支持多 Provider 自动故障转移与错误分类。
 * 参考 OpenClaw 的 model-fallback.ts 实现。
 */

// ─── Types ───────────────────────────────────────────────────────────────

/** 模型 Profile：描述一个可用的 API 端点 */
export type ModelProfile = {
    /** 唯一标识（用于日志） */
    id?: string;
    /** 显示名称（用于前端展示） */
    displayName?: string;
    /** API 基础 URL（如 https://api.openai.com） */
    baseUrl: string;
    /** API Key */
    apiKey: string;
    /** 模型名称（如 gpt-4o） */
    model: string;
    /** API 协议（"openai" | "anthropic"），未指定时使用全局配置 */
    protocol?: string;
    /** OpenAI 线路协议（"chat_completions" | "responses"），可按模型覆盖 */
    wireApi?: string;
    /** 单次请求超时（毫秒） */
    requestTimeoutMs?: number;
    /** 同一 profile 的最大重试次数（不含首次请求） */
    maxRetries?: number;
    /** 同一 profile 重试退避基线（毫秒） */
    retryBackoffMs?: number;
    /** 供应商专用代理 URL（可选） */
    proxyUrl?: string;
};

/** 容灾错误原因分类 */
export type FailoverReason =
    | "rate_limit"   // 429
    | "timeout"      // 超时 / AbortError
    | "server_error" // 5xx
    | "auth"         // 401 / 403
    | "billing"      // 402
    | "format"       // 400（请求格式错误，不可重试）
    | "unknown";

/** 单次尝试的记录 */
export type FailoverAttempt = {
    profileId: string;
    provider: string;
    model: string;
    error: string;
    reason: FailoverReason;
    status?: number;
    attempt?: number;
    maxAttempts?: number;
    timeoutMs?: number;
    wireApi?: string;
};

/** fetchWithFailover 的返回结果 */
export type FailoverResult = {
    /** 实际使用的 Response */
    response: Response;
    /** 实际使用的 Profile */
    profile: ModelProfile;
    /** 所有失败尝试的记录 */
    attempts: FailoverAttempt[];
};

/** 可选的日志接口 */
export type FailoverLogger = {
    info(module: string, msg: string): void;
    warn(module: string, msg: string): void;
    error(module: string, msg: string): void;
};

// ─── 错误分类函数 ─────────────────────────────────────────────────────────

/**
 * 根据 HTTP 状态码判断错误是否可重试（应触发 failover）。
 * - 429 / 5xx / 408 → 可重试
 * - 401 / 402 / 403 → 可重试（换 Key / Provider 可能解决）
 * - 400 → 不可重试（请求格式问题，换 Provider 也没用）
 */
export function classifyFailoverReason(status: number): FailoverReason {
    if (status === 429) return "rate_limit";
    if (status === 408) return "timeout";
    if (status === 401 || status === 403) return "auth";
    if (status === 402) return "billing";
    if (status === 400) return "format";
    if (status >= 500) return "server_error";
    return "unknown";
}

/** 判断该错误原因是否应触发 failover */
export function isRetryableReason(reason: FailoverReason): boolean {
    // 400 (format) 不可重试——请求本身有问题，换 Provider 也无效
    return reason !== "format";
}

// ─── Cooldown 管理 ────────────────────────────────────────────────────────

/** 简单的内存级 Cooldown 管理器（支持指数退避） */
class CooldownManager {
    private readonly cooldowns = new Map<string, number>();
    private readonly errorCounts = new Map<string, { count: number; lastFailure: number }>();

    /** 默认冷却 60 秒 */
    private readonly defaultCooldownMs: number;
    /** 错误计数重置窗口（默认 24 小时） */
    private readonly errorWindowMs: number;

    constructor(cooldownMs = 60_000, errorWindowMs = 24 * 60 * 60 * 1000) {
        this.defaultCooldownMs = cooldownMs;
        this.errorWindowMs = errorWindowMs;
    }

    /**
     * 将 profile 标记为冷却中。
     * 如果提供了 durationMs 则使用该值（如 Retry-After），
     * 否则使用指数退避：60s * 5^(errorCount-1)，上限 1 小时。
     */
    mark(profileId: string, durationMs?: number): void {
        // 更新错误计数
        const now = Date.now();
        const existing = this.errorCounts.get(profileId);
        let errorCount: number;

        if (existing && (now - existing.lastFailure) < this.errorWindowMs) {
            errorCount = existing.count + 1;
        } else {
            errorCount = 1;
        }
        this.errorCounts.set(profileId, { count: errorCount, lastFailure: now });

        // 计算冷却时间
        let cooldownMs: number;
        if (durationMs !== undefined) {
            cooldownMs = durationMs;
        } else {
            // 指数退避：60s * 5^(n-1)，上限 1 小时
            cooldownMs = Math.min(
                this.defaultCooldownMs * Math.pow(5, errorCount - 1),
                3_600_000,
            );
        }

        const until = now + cooldownMs;
        this.cooldowns.set(profileId, until);
    }

    /** 检查 profile 是否在冷却中 */
    isInCooldown(profileId: string): boolean {
        const until = this.cooldowns.get(profileId);
        if (until === undefined) return false;
        if (Date.now() >= until) {
            this.cooldowns.delete(profileId);
            return false;
        }
        return true;
    }

    /** 标记 profile 成功，重置错误计数 */
    markSuccess(profileId: string): void {
        this.errorCounts.delete(profileId);
        this.cooldowns.delete(profileId);
    }

    /** 清除指定 profile 的冷却 */
    clear(profileId: string): void {
        this.cooldowns.delete(profileId);
    }

    /** 清除所有冷却 */
    clearAll(): void {
        this.cooldowns.clear();
        this.errorCounts.clear();
    }
}

// ─── FailoverClient ──────────────────────────────────────────────────────

export class FailoverClient {
    private readonly profiles: ModelProfile[];
    private readonly cooldown: CooldownManager;
    private readonly logger?: FailoverLogger;

    constructor(params: {
        /** 主 Profile（必填） */
        primary: ModelProfile;
        /** 备用 Profiles（可选） */
        fallbacks?: ModelProfile[];
        /** 冷却时间（毫秒），默认 60s */
        cooldownMs?: number;
        /** 启动阶段的预置冷却（毫秒） */
        bootstrapCooldowns?: Record<string, number>;
        /** 日志接口 */
        logger?: FailoverLogger;
    }) {
        // 确保主 Profile 有 id
        const primary: ModelProfile = {
            ...params.primary,
            id: params.primary.id ?? "primary",
        };

        const fallbacks = (params.fallbacks ?? []).map((f, i) => ({
            ...f,
            id: f.id ?? `fallback-${i}`,
        }));

        this.profiles = [primary, ...fallbacks];
        this.cooldown = new CooldownManager(params.cooldownMs ?? 60_000);
        this.logger = params.logger;

        if (params.bootstrapCooldowns) {
            for (const [profileId, durationMs] of Object.entries(params.bootstrapCooldowns)) {
                if (durationMs > 0) {
                    this.cooldown.mark(profileId, durationMs);
                }
            }
        }
    }

    /** 获取所有 Profile（用于调试） */
    getProfiles(): ReadonlyArray<ModelProfile> {
        return this.profiles;
    }

    /**
     * 核心容灾请求方法。
     *
     * 依次尝试每个 Profile 发送请求，遇到可重试错误时自动切换到下一个。
     *
     * @param buildRequest  根据 Profile 构建 fetch 参数的函数
     * @param timeoutMs     单次请求超时（毫秒）
     * @returns             成功的 Response + 使用的 Profile + 尝试记录
     * @throws              如果所有 Profile 均失败
     */
    async fetchWithFailover(params: {
        /** 根据给定的 (baseUrl, apiKey, model) 构建 fetch 的 url 和 init */
        buildRequest: (profile: ModelProfile) => { url: string; init: RequestInit };
        /** 可选：调用方取消信号。若触发，应立即停止 failover / retry / backoff。 */
        signal?: AbortSignal;
        /** 单次请求超时（毫秒） */
        timeoutMs?: number;
        /** 请求超时下限（毫秒），会覆盖过小的 profile.requestTimeoutMs */
        minimumTimeoutMs?: number;
        /** 默认同 profile 最大重试次数（不含首次请求） */
        maxRetries?: number;
        /** 默认重试退避基线（毫秒） */
        retryBackoffMs?: number;
    }): Promise<FailoverResult> {
        const {
            buildRequest,
            signal,
            timeoutMs = 120_000,
            minimumTimeoutMs,
            maxRetries = 0,
            retryBackoffMs = 300,
        } = params;
        const attempts: FailoverAttempt[] = [];
        let lastError: Error | undefined;

        throwIfAborted(signal);

        for (const profile of this.profiles) {
            throwIfAborted(signal);
            const profileId = profile.id ?? "unknown";
            const baseTimeoutMs = normalizePositiveInt(profile.requestTimeoutMs) ?? timeoutMs;
            const timeoutFloorMs = normalizePositiveInt(minimumTimeoutMs) ?? 0;
            const resolvedTimeoutMs = Math.max(baseTimeoutMs, timeoutFloorMs);
            const resolvedMaxRetries = normalizeNonNegativeInt(profile.maxRetries) ?? maxRetries;
            const resolvedBackoffMs = normalizePositiveInt(profile.retryBackoffMs) ?? retryBackoffMs;
            const maxAttempts = resolvedMaxRetries + 1;

            // 跳过冷却中的 Profile
            if (this.cooldown.isInCooldown(profileId)) {
                this.logger?.info("failover", `跳过冷却中的 Profile: ${profileId}`);
                attempts.push({
                    profileId,
                    provider: extractProvider(profile.baseUrl),
                    model: profile.model,
                    error: `Profile ${profileId} 处于冷却中，跳过`,
                    reason: "rate_limit",
                    maxAttempts,
                    timeoutMs: resolvedTimeoutMs,
                    wireApi: profile.wireApi,
                });
                continue;
            }

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                throwIfAborted(signal);
                // 构建请求
                const { url, init } = buildRequest(profile);
                const requestSignal = init.signal ?? undefined;
                const externalSignal = signal ?? requestSignal;
                throwIfAborted(externalSignal);

                // 设置超时
                const controller = new AbortController();
                let timedOut = false;
                let removeAbortForwarder: (() => void) | undefined;
                const timer = setTimeout(() => {
                    timedOut = true;
                    controller.abort();
                }, resolvedTimeoutMs);

                // 合并 signal
                if (externalSignal) {
                    // 如果调用方也传了 signal，任一触发都 abort
                    const onAbort = () => controller.abort();
                    externalSignal.addEventListener("abort", onAbort, { once: true });
                    removeAbortForwarder = () => externalSignal.removeEventListener("abort", onAbort);
                }

                try {
                    const requestInit: RequestInit = {
                        ...init,
                        signal: controller.signal,
                    };
                    const dispatcher = await getProxyDispatcher(profile.proxyUrl);
                    if (dispatcher) {
                        (requestInit as any).dispatcher = dispatcher;
                    }

                    const response = await fetch(url, requestInit);

                    // 成功（2xx）
                    if (response.ok) {
                        this.cooldown.markSuccess(profileId);
                        if (attempts.length > 0) {
                            this.logger?.info(
                                "failover",
                                `✅ Profile "${profileId}" (${profile.model}) 成功（经过 ${attempts.length} 次失败尝试）`,
                            );
                        }
                        return { response, profile, attempts };
                    }

                    // 非 2xx：分类错误
                    const reason = classifyFailoverReason(response.status);
                    const errorText = await safeReadText(response);
                    const errorMsg = `HTTP ${response.status}: ${errorText}`;
                    const canRetrySameProfile = attempt < maxAttempts && isSameProfileRetryable(reason);

                    // 400 (format) 不可重试——直接返回给调用方处理
                    if (!isRetryableReason(reason)) {
                        this.logger?.warn(
                            "failover",
                            `Profile "${profileId}" 返回 HTTP ${response.status}（${reason}），不可重试`,
                        );
                        return { response, profile, attempts };
                    }

                    attempts.push({
                        profileId,
                        provider: extractProvider(profile.baseUrl),
                        model: profile.model,
                        error: errorMsg,
                        reason,
                        status: response.status,
                        attempt,
                        maxAttempts,
                        timeoutMs: resolvedTimeoutMs,
                        wireApi: profile.wireApi,
                    });
                    lastError = new Error(errorMsg);

                    if (canRetrySameProfile) {
                        const retryAfterMs = reason === "rate_limit" ? parseRetryAfter(response) : undefined;
                        const waitMs = retryAfterMs ?? calcBackoffDelay(resolvedBackoffMs, attempt);
                        this.logger?.warn(
                            "failover",
                            `⚠️ Profile "${profileId}" (${profile.model}) 失败: ${errorMsg}（attempt ${attempt}/${maxAttempts}, wire_api=${profile.wireApi ?? "-"}, timeout=${resolvedTimeoutMs}ms），${waitMs}ms 后重试同 profile...`,
                        );
                        await sleep(waitMs, externalSignal);
                        continue;
                    }

                    this.logger?.warn(
                        "failover",
                        `⚠️ Profile "${profileId}" (${profile.model}) 失败: ${errorMsg}（attempt ${attempt}/${maxAttempts}, wire_api=${profile.wireApi ?? "-"}, timeout=${resolvedTimeoutMs}ms），尝试下一个...`,
                    );

                    // 对 rate_limit 和 billing 设置冷却
                    // 优先使用 Retry-After 响应头（Anthropic 会返回）
                    if (reason === "rate_limit") {
                        const retryAfterMs = parseRetryAfter(response);
                        this.cooldown.mark(profileId, retryAfterMs); // 有 Retry-After 用它，否则指数退避
                    } else if (reason === "billing") {
                        this.cooldown.mark(profileId, 600_000); // 10 分钟
                    } else {
                        this.cooldown.mark(profileId);
                    }
                    break;
                } catch (err) {
                    // 网络错误或超时
                    const isAbort = err instanceof Error && err.name === "AbortError";
                    if (isAbort && externalSignal?.aborted && !timedOut) {
                        throw toAbortError(externalSignal.reason);
                    }
                    const reason: FailoverReason = isAbort ? "timeout" : "unknown";
                    const errorMsg = isAbort
                        ? `请求超时（${resolvedTimeoutMs}ms）`
                        : err instanceof Error
                            ? err.message
                            : String(err);
                    const canRetrySameProfile = attempt < maxAttempts && isSameProfileRetryable(reason);

                    attempts.push({
                        profileId,
                        provider: extractProvider(profile.baseUrl),
                        model: profile.model,
                        error: errorMsg,
                        reason,
                        attempt,
                        maxAttempts,
                        timeoutMs: resolvedTimeoutMs,
                        wireApi: profile.wireApi,
                    });
                    lastError = err instanceof Error ? err : new Error(String(err));

                    if (canRetrySameProfile) {
                        const waitMs = calcBackoffDelay(resolvedBackoffMs, attempt);
                        this.logger?.warn(
                            "failover",
                            `⚠️ Profile "${profileId}" (${profile.model}) 异常: ${errorMsg}（attempt ${attempt}/${maxAttempts}, wire_api=${profile.wireApi ?? "-"}, timeout=${resolvedTimeoutMs}ms），${waitMs}ms 后重试同 profile...`,
                        );
                        await sleep(waitMs, externalSignal);
                        continue;
                    }

                    this.logger?.warn(
                        "failover",
                        `⚠️ Profile "${profileId}" (${profile.model}) 异常: ${errorMsg}（attempt ${attempt}/${maxAttempts}, wire_api=${profile.wireApi ?? "-"}, timeout=${resolvedTimeoutMs}ms），尝试下一个...`,
                    );
                    this.cooldown.mark(profileId);
                    break;
                } finally {
                    clearTimeout(timer);
                    removeAbortForwarder?.();
                }
            }
        }

        // 所有 Profile 均失败
        const summary = attempts
            .map((a) => `${a.profileId}/${a.model}: ${a.error} (${a.reason})`)
            .join(" | ");

        const finalError = new Error(
            `所有模型均失败（共 ${attempts.length} 次尝试）: ${summary}`,
        );
        if (lastError) {
            finalError.cause = lastError;
        }
        throw finalError;
    }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────

const proxyDispatcherCache = new Map<string, unknown>();

function normalizePositiveInt(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const rounded = Math.floor(value);
    return rounded > 0 ? rounded : undefined;
}

function normalizeNonNegativeInt(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const rounded = Math.floor(value);
    return rounded >= 0 ? rounded : undefined;
}

function isSameProfileRetryable(reason: FailoverReason): boolean {
    return reason === "timeout"
        || reason === "rate_limit"
        || reason === "server_error"
        || reason === "unknown";
}

function calcBackoffDelay(baseMs: number, attempt: number): number {
    const safeBase = Math.max(100, baseMs);
    const exponent = Math.max(0, attempt - 1);
    return Math.min(safeBase * Math.pow(2, exponent), 5_000);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        const onAbort = () => {
            cleanup();
            reject(toAbortError(signal.reason));
        };
        const cleanup = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
        };
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

function throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw toAbortError(signal.reason);
}

function toAbortError(reason?: unknown): Error {
    if (reason instanceof Error) {
        reason.name = "AbortError";
        return reason;
    }
    const error = new Error(typeof reason === "string" && reason.trim() ? reason : "The operation was aborted.");
    error.name = "AbortError";
    return error;
}

async function getProxyDispatcher(proxyUrl?: string): Promise<unknown | undefined> {
    if (!proxyUrl || !proxyUrl.trim()) return undefined;
    const normalized = proxyUrl.trim();
    const cached = proxyDispatcherCache.get(normalized);
    if (cached) return cached;

    try {
        const moduleName = ["undici"].join("");
        const undici = await import(moduleName);
        const ProxyAgentCtor = (undici as any).ProxyAgent;
        if (typeof ProxyAgentCtor !== "function") return undefined;
        const dispatcher = new ProxyAgentCtor(normalized);
        proxyDispatcherCache.set(normalized, dispatcher);
        return dispatcher;
    } catch {
        return undefined;
    }
}

/**
 * 解析 Retry-After 响应头。
 * 支持秒数（如 "30"）和 HTTP-date 格式。
 * 返回 undefined 表示无有效值（交给指数退避处理）。
 */
function parseRetryAfter(response: Response): number | undefined {
    const header = response.headers.get("retry-after");
    if (!header) return undefined;

    // 尝试解析为秒数
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) {
        return Math.ceil(seconds * 1000); // 转为毫秒
    }

    // 尝试解析为 HTTP-date
    const date = Date.parse(header);
    if (!Number.isNaN(date)) {
        const delayMs = date - Date.now();
        return delayMs > 0 ? delayMs : undefined;
    }

    return undefined;
}

/** 从 baseUrl 中提取 Provider 名称（用于日志） */
function extractProvider(baseUrl: string): string {
    try {
        const host = new URL(baseUrl).hostname;
        // api.openai.com → openai
        // api.moonshot.cn → moonshot
        const parts = host.split(".");
        if (parts.length >= 2) {
            return parts[parts.length - 2];
        }
        return host;
    } catch {
        return baseUrl;
    }
}

/** 安全地读取 Response body 前 500 字符 */
async function safeReadText(res: Response): Promise<string> {
    try {
        const text = await res.text();
        return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    } catch {
        return "";
    }
}

// ─── 配置加载 ─────────────────────────────────────────────────────────────

/** models.json 的格式 */
export type ModelConfigFile = {
    /** 备用 Profile 列表 */
    fallbacks: Array<{
        id?: string;
        displayName?: string;
        baseUrl: string;
        apiKey: string;
        model: string;
        protocol?: string;
        wireApi?: string;
        requestTimeoutMs?: number;
        maxRetries?: number;
        retryBackoffMs?: number;
        proxyUrl?: string;
    }>;
};

/**
 * 从 JSON 文件加载容灾配置。
 * 如果文件不存在或解析失败，返回空数组。
 */
export async function loadModelFallbacks(filePath: string): Promise<ModelProfile[]> {
    const { readFile } = await import("node:fs/promises");

    try {
        const raw = await readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw) as ModelConfigFile;

        if (!parsed.fallbacks || !Array.isArray(parsed.fallbacks)) {
            return [];
        }

        // 基本校验
        return parsed.fallbacks
            .filter((f) => f.baseUrl && f.apiKey && f.model)
            .map((f, i) => ({
                id: f.id ?? `fallback-${i}`,
                displayName: typeof f.displayName === "string" ? f.displayName : undefined,
                baseUrl: f.baseUrl,
                apiKey: f.apiKey,
                model: f.model,
                protocol: typeof f.protocol === "string" ? f.protocol : undefined,
                wireApi: typeof f.wireApi === "string" ? f.wireApi : undefined,
                requestTimeoutMs: normalizePositiveInt(f.requestTimeoutMs),
                maxRetries: normalizeNonNegativeInt(f.maxRetries),
                retryBackoffMs: normalizePositiveInt(f.retryBackoffMs),
                proxyUrl: typeof f.proxyUrl === "string" ? f.proxyUrl : undefined,
            }));
    } catch {
        // 文件不存在或解析失败，静默返回空
        return [];
    }
}
