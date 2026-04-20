import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetTokenUsageUploadBatchingForTests,
  uploadTokenUsage,
  type TokenUsageUploadLogger,
} from "./token-usage-upload.js";

describe("token usage upload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetTokenUsageUploadBatchingForTests();
  });

  it("batches adjacent uploads for the same conversation and source", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);
    const log: TokenUsageUploadLogger = { warn: vi.fn() };

    await Promise.all([
      uploadTokenUsage({
        config: { enabled: true, url: "http://token-upload.local/usage", timeoutMs: 5000 },
        userUuid: "u-1",
        conversationId: "conv-1",
        deltaTokens: 3,
        source: "webchat",
        log,
      }),
      uploadTokenUsage({
        config: { enabled: true, url: "http://token-upload.local/usage", timeoutMs: 5000 },
        userUuid: "u-1",
        conversationId: "conv-1",
        deltaTokens: 6,
        source: "webchat",
        log,
      }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      userUuid: "u-1",
      conversationId: "conv-1",
      source: "webchat",
      deltaTokens: 9,
    });
  });

  it("keeps uploads separate across different conversations", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);
    const log: TokenUsageUploadLogger = { warn: vi.fn() };

    await Promise.all([
      uploadTokenUsage({
        config: { enabled: true, url: "http://token-upload.local/usage", timeoutMs: 5000 },
        userUuid: "u-1",
        conversationId: "conv-1",
        deltaTokens: 3,
        source: "webchat",
        log,
      }),
      uploadTokenUsage({
        config: { enabled: true, url: "http://token-upload.local/usage", timeoutMs: 5000 },
        userUuid: "u-1",
        conversationId: "conv-2",
        deltaTokens: 6,
        source: "webchat",
        log,
      }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
