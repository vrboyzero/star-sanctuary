import type { IncomingMessage, ServerResponse } from "node:http";

import type { FixedWindowRateLimiter } from "./memory-guards.js";

export type WebhookBodyReadProfile = "pre-auth" | "post-auth";

export type WebhookBodyReadErrorCode =
  | "PAYLOAD_TOO_LARGE"
  | "REQUEST_BODY_TIMEOUT"
  | "CONNECTION_CLOSED"
  | "INVALID_JSON";

export const WEBHOOK_BODY_READ_DEFAULTS = Object.freeze({
  preAuth: {
    maxBytes: 64 * 1024,
    timeoutMs: 5_000,
  },
  postAuth: {
    maxBytes: 1024 * 1024,
    timeoutMs: 30_000,
  },
});

export const WEBHOOK_IN_FLIGHT_DEFAULTS = Object.freeze({
  maxInFlightPerKey: 8,
  maxTrackedKeys: 4_096,
});

export type WebhookInFlightLimiter = {
  tryAcquire: (key: string) => boolean;
  release: (key: string) => void;
  size: () => number;
  clear: () => void;
};

export class WebhookBodyReadError extends Error {
  code: WebhookBodyReadErrorCode;

  constructor(code: WebhookBodyReadErrorCode, message: string) {
    super(message);
    this.name = "WebhookBodyReadError";
    this.code = code;
  }
}

function resolveBodyReadLimits(params?: {
  maxBytes?: number;
  timeoutMs?: number;
  profile?: WebhookBodyReadProfile;
}): { maxBytes: number; timeoutMs: number } {
  const defaults =
    params?.profile === "post-auth"
      ? WEBHOOK_BODY_READ_DEFAULTS.postAuth
      : WEBHOOK_BODY_READ_DEFAULTS.preAuth;
  const maxBytes =
    typeof params?.maxBytes === "number" && Number.isFinite(params.maxBytes) && params.maxBytes > 0
      ? Math.floor(params.maxBytes)
      : defaults.maxBytes;
  const timeoutMs =
    typeof params?.timeoutMs === "number" && Number.isFinite(params.timeoutMs) && params.timeoutMs > 0
      ? Math.floor(params.timeoutMs)
      : defaults.timeoutMs;
  return { maxBytes, timeoutMs };
}

export function requestBodyErrorToText(code: WebhookBodyReadErrorCode): string {
  switch (code) {
    case "PAYLOAD_TOO_LARGE":
      return "Payload Too Large";
    case "REQUEST_BODY_TIMEOUT":
      return "Request Body Timeout";
    case "CONNECTION_CLOSED":
      return "Connection Closed";
    case "INVALID_JSON":
      return "Invalid JSON";
    default:
      return "Bad Request";
  }
}

export function isJsonContentType(value: string | string[] | undefined): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return false;
  const mediaType = first.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

export function createWebhookInFlightLimiter(options?: {
  maxInFlightPerKey?: number;
  maxTrackedKeys?: number;
}): WebhookInFlightLimiter {
  const maxInFlightPerKey = Math.max(
    1,
    Math.floor(options?.maxInFlightPerKey ?? WEBHOOK_IN_FLIGHT_DEFAULTS.maxInFlightPerKey),
  );
  const maxTrackedKeys = Math.max(1, Math.floor(options?.maxTrackedKeys ?? WEBHOOK_IN_FLIGHT_DEFAULTS.maxTrackedKeys));
  const active = new Map<string, number>();

  const touch = (key: string, next: number) => {
    active.delete(key);
    active.set(key, next);
    while (active.size > maxTrackedKeys) {
      const oldest = active.keys().next().value;
      if (!oldest) break;
      active.delete(oldest);
    }
  };

  return {
    tryAcquire: (key) => {
      if (!key) return true;
      const current = active.get(key) ?? 0;
      if (current >= maxInFlightPerKey) return false;
      touch(key, current + 1);
      return true;
    },
    release: (key) => {
      if (!key) return;
      const current = active.get(key);
      if (current === undefined) return;
      if (current <= 1) {
        active.delete(key);
        return;
      }
      touch(key, current - 1);
    },
    size: () => active.size,
    clear: () => active.clear(),
  };
}

export function applyBasicWebhookRequestGuards(params: {
  req: IncomingMessage;
  res: ServerResponse;
  rateLimiter?: FixedWindowRateLimiter;
  rateLimitKey?: string;
  nowMs?: number;
  requireJsonContentType?: boolean;
}): boolean {
  if (
    params.rateLimiter &&
    params.rateLimitKey &&
    params.rateLimiter.isRateLimited(params.rateLimitKey, params.nowMs ?? Date.now())
  ) {
    params.res.statusCode = 429;
    params.res.end("Too Many Requests");
    return false;
  }

  if (
    params.requireJsonContentType &&
    params.req.method === "POST" &&
    !isJsonContentType(params.req.headers["content-type"])
  ) {
    params.res.statusCode = 415;
    params.res.end("Unsupported Media Type");
    return false;
  }

  return true;
}

export function beginWebhookRequestPipelineOrReject(params: {
  req: IncomingMessage;
  res: ServerResponse;
  rateLimiter?: FixedWindowRateLimiter;
  rateLimitKey?: string;
  nowMs?: number;
  requireJsonContentType?: boolean;
  inFlightLimiter?: WebhookInFlightLimiter;
  inFlightKey?: string;
  inFlightLimitStatusCode?: number;
  inFlightLimitMessage?: string;
}): { ok: true; release: () => void } | { ok: false } {
  if (
    !applyBasicWebhookRequestGuards({
      req: params.req,
      res: params.res,
      rateLimiter: params.rateLimiter,
      rateLimitKey: params.rateLimitKey,
      nowMs: params.nowMs,
      requireJsonContentType: params.requireJsonContentType,
    })
  ) {
    return { ok: false };
  }

  const inFlightKey = params.inFlightKey ?? "";
  if (params.inFlightLimiter && inFlightKey && !params.inFlightLimiter.tryAcquire(inFlightKey)) {
    params.res.statusCode = params.inFlightLimitStatusCode ?? 429;
    params.res.end(params.inFlightLimitMessage ?? "Too Many Requests");
    return { ok: false };
  }

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      if (params.inFlightLimiter && inFlightKey) {
        params.inFlightLimiter.release(inFlightKey);
      }
    },
  };
}

export async function readRequestBodyWithLimit(
  req: IncomingMessage,
  options?: {
    maxBytes?: number;
    timeoutMs?: number;
    profile?: WebhookBodyReadProfile;
  },
): Promise<string> {
  const limits = resolveBodyReadLimits(options);
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      req.destroy();
      reject(new WebhookBodyReadError("REQUEST_BODY_TIMEOUT", requestBodyErrorToText("REQUEST_BODY_TIMEOUT")));
    }, limits.timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("aborted", onAborted);
      req.off("close", onClose);
      req.off("error", onError);
    };

    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > limits.maxBytes) {
        req.pause();
        finish(() => reject(new WebhookBodyReadError("PAYLOAD_TOO_LARGE", requestBodyErrorToText("PAYLOAD_TOO_LARGE"))));
        return;
      }
      chunks.push(buffer);
    };

    const onEnd = () => {
      finish(() => resolve(Buffer.concat(chunks).toString("utf-8")));
    };

    const onAborted = () => {
      finish(() => reject(new WebhookBodyReadError("CONNECTION_CLOSED", requestBodyErrorToText("CONNECTION_CLOSED"))));
    };

    const onClose = () => {
      if (settled || req.complete) return;
      finish(() => reject(new WebhookBodyReadError("CONNECTION_CLOSED", requestBodyErrorToText("CONNECTION_CLOSED"))));
    };

    const onError = (error: Error) => {
      finish(() => reject(error));
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("aborted", onAborted);
    req.on("close", onClose);
    req.on("error", onError);
  });
}

function respondWebhookBodyReadError(params: {
  res: ServerResponse;
  code: WebhookBodyReadErrorCode;
  invalidMessage?: string;
}): { ok: false } {
  const { res, code, invalidMessage } = params;
  if (code === "PAYLOAD_TOO_LARGE") {
    res.statusCode = 413;
    res.end(requestBodyErrorToText(code));
    return { ok: false };
  }
  if (code === "REQUEST_BODY_TIMEOUT") {
    res.statusCode = 408;
    res.end(requestBodyErrorToText(code));
    return { ok: false };
  }
  if (code === "CONNECTION_CLOSED") {
    res.statusCode = 400;
    res.end(requestBodyErrorToText(code));
    return { ok: false };
  }
  res.statusCode = 400;
  res.end(invalidMessage ?? requestBodyErrorToText(code));
  return { ok: false };
}

export async function readJsonWebhookBodyOrReject(params: {
  req: IncomingMessage;
  res: ServerResponse;
  maxBytes?: number;
  timeoutMs?: number;
  profile?: WebhookBodyReadProfile;
  emptyObjectOnEmpty?: boolean;
  invalidJsonMessage?: string;
}): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const raw = await readRequestBodyWithLimit(params.req, {
      maxBytes: params.maxBytes,
      timeoutMs: params.timeoutMs,
      profile: params.profile,
    });
    if (!raw.trim()) {
      return { ok: true, value: params.emptyObjectOnEmpty === false ? null : {} };
    }
    try {
      return { ok: true, value: JSON.parse(raw) as unknown };
    } catch {
      return respondWebhookBodyReadError({
        res: params.res,
        code: "INVALID_JSON",
        invalidMessage: params.invalidJsonMessage,
      });
    }
  } catch (error) {
    if (error instanceof WebhookBodyReadError) {
      return respondWebhookBodyReadError({
        res: params.res,
        code: error.code,
        invalidMessage: params.invalidJsonMessage,
      });
    }
    return respondWebhookBodyReadError({
      res: params.res,
      code: "INVALID_JSON",
      invalidMessage: params.invalidJsonMessage ?? (error instanceof Error ? error.message : String(error)),
    });
  }
}
