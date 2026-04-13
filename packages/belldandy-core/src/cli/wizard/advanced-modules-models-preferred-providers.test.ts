import { describe, expect, test } from "vitest";
import type { ModelProfile } from "@belldandy/agent";

import {
  buildPreferredProviderConfigPreviewLines,
  summarizePreferredProviderConfig,
  validatePreferredProviderInput,
} from "./advanced-modules-models-preferred-providers.js";

function createProfile(input: Partial<ModelProfile> & Pick<ModelProfile, "id" | "baseUrl" | "apiKey" | "model">): ModelProfile {
  return {
    id: input.id,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    model: input.model,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.protocol ? { protocol: input.protocol } : {}),
  };
}

describe("advanced-modules-models-preferred-providers", () => {
  test("validates comma separated preferred provider input", () => {
    expect(validatePreferredProviderInput("")).toBeUndefined();
    expect(validatePreferredProviderInput("anthropic, moonshot")).toBeUndefined();
    expect(validatePreferredProviderInput(" , , ")).toBe("Enter at least one provider id, or leave blank to clear the preferred order.");
  });

  test("builds preview lines for next preferred provider order", () => {
    const lines = buildPreferredProviderConfigPreviewLines({
      fallbacks: [
        createProfile({
          id: "moonshot-main",
          baseUrl: "https://api.moonshot.cn/v1",
          apiKey: "sk-moonshot",
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
      currentValue: "moonshot",
      nextValue: "anthropic, moonshot, custom",
    });

    expect(lines).toEqual(expect.arrayContaining([
      "Current preferred provider order: moonshot.",
      "Next effective provider order: anthropic, moonshot, custom.",
      "Matched current fallback buckets: anthropic, moonshot.",
      "Not currently visible from fallback buckets: custom.",
      "Picker provider grouping would start as: anthropic, moonshot.",
    ]));
  });

  test("summarizes preferred provider config compactly", () => {
    expect(summarizePreferredProviderConfig("anthropic, moonshot, anthropic")).toBe("anthropic, moonshot");
    expect(summarizePreferredProviderConfig("")).toBe("none");
  });
});
