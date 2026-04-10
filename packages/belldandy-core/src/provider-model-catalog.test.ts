import { describe, expect, it } from "vitest";

import { buildProviderModelCatalog } from "./provider-model-catalog.js";

describe("provider model catalog", () => {
  it("builds provider and model metadata without leaking secrets", () => {
    const snapshot = buildProviderModelCatalog({
      currentDefault: "claude-opus",
      preferredProviderIds: ["openrouter", "anthropic", "openrouter"],
      primaryModelConfig: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-5",
        protocol: "openai",
        wireApi: "responses",
      },
      modelFallbacks: [
        {
          id: "claude-opus",
          displayName: "Claude Opus 4.5",
          baseUrl: "https://api.anthropic.com",
          apiKey: "sk-claude",
          model: "claude-opus-4-5",
          protocol: "anthropic",
        },
      ],
    });

    expect(snapshot.currentDefault).toBe("claude-opus");
    expect(snapshot.preferredProviderIds).toEqual(["openrouter", "anthropic"]);
    expect(snapshot.manualEntrySupported).toBe(true);
    expect(snapshot.providers).toEqual([
      {
        id: "openai",
        label: "OpenAI",
        onboardingScopes: ["api_key", "base_url", "model"],
        capabilities: ["chat", "audio_transcription", "tts_output", "image_generation"],
      },
      {
        id: "anthropic",
        label: "Anthropic",
        onboardingScopes: ["api_key", "base_url", "model"],
        capabilities: ["chat"],
      },
    ]);
    expect(snapshot.models).toEqual([
      expect.objectContaining({
        id: "primary",
        model: "gpt-5",
        providerId: "openai",
        providerLabel: "OpenAI",
        source: "primary",
        authStatus: "missing",
        wireApi: "responses",
        capabilities: expect.arrayContaining(["chat", "responses_api", "image_input", "text_inline"]),
        isDefault: false,
      }),
      expect.objectContaining({
        id: "claude-opus",
        displayName: "Claude Opus 4.5（默认）",
        model: "claude-opus-4-5",
        providerId: "anthropic",
        providerLabel: "Anthropic",
        source: "named",
        authStatus: "ready",
        protocol: "anthropic",
        capabilities: expect.arrayContaining(["chat", "anthropic_api", "image_input", "text_inline"]),
        isDefault: true,
      }),
    ]);
    expect((snapshot.models[0] as Record<string, unknown>).apiKey).toBeUndefined();
    expect((snapshot.models[1] as Record<string, unknown>).baseUrl).toBeUndefined();
  });
});
