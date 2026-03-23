import { afterEach, describe, expect, it, vi } from "vitest";

import { FailoverClient, type ModelProfile } from "./failover-client.js";

function createProfile(overrides?: Partial<ModelProfile>): ModelProfile {
  return {
    id: "primary",
    baseUrl: "https://api.openai.com",
    apiKey: "test-key",
    model: "test-model",
    ...overrides,
  };
}

describe("FailoverClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stops immediately when caller signal is already aborted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new FailoverClient({
      primary: createProfile(),
    });
    const controller = new AbortController();
    controller.abort("cancelled before request");

    await expect(
      client.fetchWithFailover({
        signal: controller.signal,
        buildRequest: () => ({
          url: "https://api.openai.com/chat/completions",
          init: {
            method: "POST",
          },
        }),
      }),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "cancelled before request",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not continue retry backoff after caller abort", async () => {
    const fetchMock = vi.fn(async () => new Response("server error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FailoverClient({
      primary: createProfile(),
    });
    const controller = new AbortController();

    const pending = client.fetchWithFailover({
      signal: controller.signal,
      maxRetries: 1,
      retryBackoffMs: 100,
      buildRequest: () => ({
        url: "https://api.openai.com/chat/completions",
        init: {
          method: "POST",
        },
      }),
    });

    await Promise.resolve();
    await Promise.resolve();
    controller.abort("cancelled during retry wait");

    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: "cancelled during retry wait",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps timeout retries on the same profile when failure is internal timeout", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "AbortError";
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FailoverClient({
      primary: createProfile(),
    });

    const result = await client.fetchWithFailover({
      maxRetries: 1,
      retryBackoffMs: 100,
      buildRequest: () => ({
        url: "https://api.openai.com/chat/completions",
        init: {
          method: "POST",
        },
      }),
    });

    expect(result.profile.id).toBe("primary");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      reason: "timeout",
      attempt: 1,
      maxAttempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
