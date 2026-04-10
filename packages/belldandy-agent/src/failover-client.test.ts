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
    expect(result.summary).toMatchObject({
      finalStatus: "success",
      finalProfileId: "primary",
      degraded: true,
      requestCount: 2,
      stepCounts: {
        sameProfileRetries: 1,
        crossProfileFallbacks: 0,
        cooldownSkips: 0,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("records cross-profile fallback when primary fails and backup succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FailoverClient({
      primary: createProfile(),
      fallbacks: [createProfile({
        id: "backup",
        baseUrl: "https://backup.example.com",
        model: "backup-model",
      })],
    });

    const result = await client.fetchWithFailover({
      buildRequest: () => ({
        url: "https://api.openai.com/chat/completions",
        init: {
          method: "POST",
        },
      }),
    });

    expect(result.profile.id).toBe("backup");
    expect(result.summary).toMatchObject({
      finalStatus: "success",
      finalProfileId: "backup",
      degraded: true,
      requestCount: 2,
      stepCounts: {
        sameProfileRetries: 0,
        crossProfileFallbacks: 1,
        cooldownSkips: 0,
        terminalFailures: 0,
      },
    });
  });

  it("records cooldown skips before using a fallback profile", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FailoverClient({
      primary: createProfile(),
      fallbacks: [createProfile({
        id: "backup",
        baseUrl: "https://backup.example.com",
        model: "backup-model",
      })],
      bootstrapCooldowns: {
        primary: 60_000,
      },
    });

    const result = await client.fetchWithFailover({
      buildRequest: () => ({
        url: "https://backup.example.com/chat/completions",
        init: {
          method: "POST",
        },
      }),
    });

    expect(result.profile.id).toBe("backup");
    expect(result.summary).toMatchObject({
      finalStatus: "success",
      finalProfileId: "backup",
      requestCount: 1,
      stepCounts: {
        cooldownSkips: 1,
        sameProfileRetries: 0,
        crossProfileFallbacks: 0,
      },
    });
  });

  it("surfaces exhausted summaries when all profiles fail", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(new Response("server error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new FailoverClient({
      primary: createProfile(),
      fallbacks: [createProfile({
        id: "backup",
        baseUrl: "https://backup.example.com",
        model: "backup-model",
      })],
    });

    await expect(
      client.fetchWithFailover({
        buildRequest: () => ({
          url: "https://api.openai.com/chat/completions",
          init: {
            method: "POST",
          },
        }),
      }),
    ).rejects.toMatchObject({
      name: "FailoverExhaustedError",
      summary: {
        finalStatus: "exhausted",
        stepCounts: {
          crossProfileFallbacks: 1,
          terminalFailures: 1,
        },
      },
    });
  });
});
