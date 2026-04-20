export type TokenUsageUploadConfig = {
  enabled: boolean;
  url?: string;
  token?: string;
  timeoutMs: number;
};

export type TokenUsageUploadLogger = {
  warn: (module: string, message: string, data?: unknown) => void;
};

const TOKEN_USAGE_UPLOAD_BATCH_WINDOW_MS = 25;

type TokenUsageUploadInput = {
  config: TokenUsageUploadConfig;
  userUuid?: string;
  conversationId: string;
  deltaTokens: number;
  source: string;
  log: TokenUsageUploadLogger;
};

type PendingTokenUsageUpload = {
  key: string;
  config: TokenUsageUploadConfig;
  userUuid?: string;
  conversationId: string;
  deltaTokens: number;
  source: string;
  log: TokenUsageUploadLogger;
  promise: Promise<void>;
  resolve: () => void;
  timer: NodeJS.Timeout;
};

const pendingTokenUsageUploads = new Map<string, PendingTokenUsageUpload>();

function createTokenUsageUploadKey(input: TokenUsageUploadInput): string {
  return [
    input.config.url ?? "",
    input.config.token ?? "",
    input.userUuid ?? "",
    input.conversationId,
    input.source,
  ].join("\n");
}

async function flushPendingTokenUsageUpload(key: string): Promise<void> {
  const pending = pendingTokenUsageUploads.get(key);
  if (!pending) {
    return;
  }
  pendingTokenUsageUploads.delete(key);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (pending.config.token) {
    headers.Authorization = `Bearer ${pending.config.token}`;
  }

  const body: Record<string, unknown> = {
    deltaTokens: pending.deltaTokens,
    conversationId: pending.conversationId,
    source: pending.source,
  };
  if (pending.userUuid) {
    body.userUuid = pending.userUuid;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), pending.config.timeoutMs);
  try {
    const res = await fetch(String(pending.config.url), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      pending.log.warn("token-upload", "Token usage upload failed", {
        status: res.status,
        statusText: res.statusText,
        body: bodyText.slice(0, 300),
      });
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      pending.log.warn("token-upload", "Token usage upload timeout", {
        timeoutMs: pending.config.timeoutMs,
      });
    } else {
      pending.log.warn("token-upload", "Token usage upload error", {
        error: String(err),
      });
    }
  } finally {
    clearTimeout(timer);
    pending.resolve();
  }
}

export async function uploadTokenUsage(input: {
  config: TokenUsageUploadConfig;
  userUuid?: string;
  conversationId: string;
  deltaTokens: number;
  source: string;
  log: TokenUsageUploadLogger;
}): Promise<void> {
  const { config, userUuid, conversationId, deltaTokens, source, log } = input;
  if (!(deltaTokens > 0)) {
    return;
  }
  if (!config.url) {
    log.warn("token-upload", "Token usage upload enabled but BELLDANDY_TOKEN_USAGE_UPLOAD_URL is not configured");
    return;
  }

  const pendingKey = createTokenUsageUploadKey({
    config,
    userUuid,
    conversationId,
    deltaTokens,
    source,
    log,
  });
  const existingPending = pendingTokenUsageUploads.get(pendingKey);
  if (existingPending) {
    existingPending.deltaTokens += deltaTokens;
    return existingPending.promise;
  }

  let resolvePending!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePending = resolve;
  });
  const pending: PendingTokenUsageUpload = {
    key: pendingKey,
    config,
    userUuid,
    conversationId,
    deltaTokens,
    source,
    log,
    promise,
    resolve: resolvePending,
    timer: setTimeout(() => {
      void flushPendingTokenUsageUpload(pendingKey);
    }, TOKEN_USAGE_UPLOAD_BATCH_WINDOW_MS),
  };
  pendingTokenUsageUploads.set(pendingKey, pending);
  return promise;
}

export function __resetTokenUsageUploadBatchingForTests(): void {
  for (const pending of pendingTokenUsageUploads.values()) {
    clearTimeout(pending.timer);
    pending.resolve();
  }
  pendingTokenUsageUploads.clear();
}
