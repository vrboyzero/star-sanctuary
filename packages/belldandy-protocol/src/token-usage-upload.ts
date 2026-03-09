export type TokenUsageUploadConfig = {
  enabled: boolean;
  url?: string;
  token?: string;
  timeoutMs: number;
};

export type TokenUsageUploadLogger = {
  warn: (module: string, message: string, data?: unknown) => void;
};

export async function uploadTokenUsage(input: {
  config: TokenUsageUploadConfig;
  userUuid?: string;
  conversationId: string;
  deltaTokens: number;
  source: string;
  log: TokenUsageUploadLogger;
}): Promise<void> {
  const { config, userUuid, conversationId, deltaTokens, source, log } = input;
  if (!config.url) {
    log.warn("token-upload", "Token usage upload enabled but BELLDANDY_TOKEN_USAGE_UPLOAD_URL is not configured");
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  const body: Record<string, unknown> = {
    deltaTokens,
    conversationId,
    source,
  };
  if (userUuid) {
    body.userUuid = userUuid;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      log.warn("token-upload", "Token usage upload failed", {
        status: res.status,
        statusText: res.statusText,
        body: bodyText.slice(0, 300),
      });
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      log.warn("token-upload", "Token usage upload timeout", {
        timeoutMs: config.timeoutMs,
      });
    } else {
      log.warn("token-upload", "Token usage upload error", {
        error: String(err),
      });
    }
  } finally {
    clearTimeout(timer);
  }
}
