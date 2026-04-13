import { describe, expect, test } from "vitest";
import type { ModelProfile } from "@belldandy/agent";

import {
  applyModelFallbackAdvancedBatchPatch,
  summarizeModelFallbackAdvancedBatchPatch,
  type ModelFallbackAdvancedBatchPatch,
} from "./advanced-modules-models-organize.js";
import { buildModelCatalogPickerLinkLines } from "./advanced-modules-models-diagnostics.js";

function createProfile(input: Partial<ModelProfile> & Pick<ModelProfile, "id" | "baseUrl" | "apiKey" | "model">): ModelProfile {
  return {
    id: input.id,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.protocol ? { protocol: input.protocol } : {}),
    ...(input.wireApi ? { wireApi: input.wireApi } : {}),
    ...(typeof input.requestTimeoutMs === "number" ? { requestTimeoutMs: input.requestTimeoutMs } : {}),
    ...(typeof input.maxRetries === "number" ? { maxRetries: input.maxRetries } : {}),
    ...(typeof input.retryBackoffMs === "number" ? { retryBackoffMs: input.retryBackoffMs } : {}),
    ...(input.proxyUrl ? { proxyUrl: input.proxyUrl } : {}),
  };
}

describe("advanced-modules-models-organize", () => {
  test("applies advanced batch patch only to selected fallbacks", () => {
    const patch: ModelFallbackAdvancedBatchPatch = {
      protocol: { mode: "set", value: "openai" },
      wireApi: { mode: "clear" },
      requestTimeoutMs: { mode: "set", value: 90000 },
      maxRetries: { mode: "set", value: 3 },
      retryBackoffMs: { mode: "keep" },
      proxyUrl: { mode: "clear" },
    };

    const updated = applyModelFallbackAdvancedBatchPatch([
      createProfile({
        id: "alpha",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-alpha",
        model: "claude-sonnet-4",
        protocol: "anthropic",
        wireApi: "chat_completions",
        requestTimeoutMs: 30000,
        proxyUrl: "https://proxy.internal",
      }),
      createProfile({
        id: "bravo",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-bravo",
        model: "gpt-4o",
      }),
    ], ["alpha"], patch);

    expect(updated[0]).toEqual(expect.objectContaining({
      id: "alpha",
      protocol: "openai",
      requestTimeoutMs: 90000,
      maxRetries: 3,
    }));
    expect(updated[0]?.wireApi).toBeUndefined();
    expect(updated[0]?.proxyUrl).toBeUndefined();
    expect(updated[1]).toEqual(expect.objectContaining({
      id: "bravo",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
    }));
  });

  test("summarizes edited advanced fields compactly", () => {
    const lines = summarizeModelFallbackAdvancedBatchPatch({
      protocol: { mode: "set", value: "anthropic" },
      wireApi: { mode: "clear" },
      requestTimeoutMs: { mode: "set", value: 120000 },
      maxRetries: { mode: "keep" },
      retryBackoffMs: { mode: "set", value: 5000 },
      proxyUrl: { mode: "clear" },
    });

    expect(lines).toEqual([
      "protocol=anthropic",
      "wireApi=clear",
      "requestTimeoutMs=120000ms",
      "retryBackoffMs=5000ms",
      "proxyUrl=clear",
    ]);
  });

  test("builds lightweight catalog and picker linkage notes", () => {
    const lines = buildModelCatalogPickerLinkLines({
      fallbacks: [
        createProfile({
          id: "moonshot-main",
          baseUrl: "https://api.moonshot.cn/v1",
          apiKey: "",
          model: "kimi-k2.5",
        }),
        createProfile({
          id: "anthropic-main",
          baseUrl: "https://api.anthropic.com",
          apiKey: "sk-anthropic",
          model: "claude-sonnet-4",
          protocol: "anthropic",
        }),
      ],
      preferredProviderValue: "anthropic, moonshot, anthropic",
    });

    expect(lines).toEqual(expect.arrayContaining([
      "models.list / WebChat picker currently see 2 provider bucket(s): Moonshot, Anthropic.",
      "Preferred provider order from BELLDANDY_MODEL_PREFERRED_PROVIDERS: anthropic, moonshot. Picker groups providers in that order first.",
      "1 fallback(s) would show auth missing in the picker until apiKey/baseUrl/model are complete.",
      "This workflow edits fallback routes only; primary model and compaction/memory-summary model settings still live outside configure models.",
    ]));
  });
});
