import { describe, expect, test } from "vitest";
import type { ModelProfile } from "@belldandy/agent";

import { buildModelProviderProtocolDiagnostics } from "./advanced-modules-models-diagnostics.js";

function createProfile(overrides: Partial<ModelProfile> & Pick<ModelProfile, "baseUrl" | "apiKey" | "model">): ModelProfile {
  return {
    baseUrl: overrides.baseUrl,
    apiKey: overrides.apiKey,
    model: overrides.model,
    ...(overrides.id ? { id: overrides.id } : {}),
    ...(overrides.displayName ? { displayName: overrides.displayName } : {}),
    ...(overrides.protocol ? { protocol: overrides.protocol } : {}),
    ...(overrides.wireApi ? { wireApi: overrides.wireApi } : {}),
    ...(typeof overrides.requestTimeoutMs === "number" ? { requestTimeoutMs: overrides.requestTimeoutMs } : {}),
    ...(typeof overrides.maxRetries === "number" ? { maxRetries: overrides.maxRetries } : {}),
    ...(typeof overrides.retryBackoffMs === "number" ? { retryBackoffMs: overrides.retryBackoffMs } : {}),
    ...(overrides.proxyUrl ? { proxyUrl: overrides.proxyUrl } : {}),
  };
}

describe("advanced-modules-models-diagnostics", () => {
  test("reports provider and protocol gaps for fallback models", () => {
    const lines = buildModelProviderProtocolDiagnostics({
      fallbacks: [
        createProfile({
          id: "openai-a",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-openai-a",
          model: "gpt-4o",
        }),
        createProfile({
          id: "openai-b",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "",
          model: "gpt-4o-mini",
          wireApi: "responses",
        }),
        createProfile({
          id: "claude-a",
          baseUrl: "https://api.anthropic.com",
          apiKey: "sk-claude-a",
          model: "claude-sonnet-4",
          protocol: "anthropic",
          wireApi: "chat_completions",
        }),
        createProfile({
          id: "custom-a",
          baseUrl: "https://gateway.internal/v1",
          apiKey: "sk-custom-a",
          model: "gpt-4.1",
        }),
      ],
    });

    expect(lines).toEqual(expect.arrayContaining([
      "Fallbacks span 3 provider bucket(s): Anthropic (1), OpenAI (2), OpenAI-Compatible (1).",
      "Multiple fallbacks still share the same provider bucket: OpenAI -> openai-a, openai-b. This improves model variety but not cross-provider resilience.",
      "1 fallback(s) still resolve to generic provider buckets: OpenAI-Compatible -> custom-a. Check baseUrl/protocol if you expected a named provider.",
      "3 fallback(s) inherit the global protocol: openai-a, openai-b, custom-a. Mixed providers usually diagnose better with explicit protocol overrides.",
      "1 fallback(s) set protocol=anthropic and also override wireApi: claude-a. wireApi is ignored on anthropic protocol routes.",
      "1 fallback(s) force wireApi=responses: openai-b. Verify the provider/model supports /responses before relying on failover.",
      "1 fallback(s) are missing required auth/runtime fields: openai-b. models.list will mark them as auth missing.",
    ]));
  });

  test("reports duplicate provider model routes", () => {
    const lines = buildModelProviderProtocolDiagnostics({
      fallbacks: [
        createProfile({
          id: "openai-a",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-openai-a",
          model: "gpt-4o",
        }),
        createProfile({
          id: "openai-b",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-openai-b",
          model: "gpt-4o",
        }),
      ],
    });

    expect(lines).toContain(
      "Duplicate provider/model routes detected: OpenAI:gpt-4o -> openai-a, openai-b. Keep both only if timeout/proxy/retry settings are intentionally different.",
    );
  });

  test("reports empty fallback state clearly", () => {
    expect(buildModelProviderProtocolDiagnostics({ fallbacks: [] })).toEqual([
      "No fallback models are configured yet.",
    ]);
  });
});
