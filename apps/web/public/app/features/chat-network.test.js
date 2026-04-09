import { describe, expect, it } from "vitest";

import {
  buildManualModelValue,
  buildModelCatalogGroups,
  formatModelOptionLabel,
  formatModelProviderGroupLabel,
  modelMatchesCatalogFilter,
  parseManualModelValue,
  resolvePreferredAgentSelection,
  resolvePreferredModelSelection,
} from "./chat-network.js";

describe("chat network agent selection", () => {
  const agents = [
    { id: "coder", displayName: "代码专家" },
    { id: "default", displayName: "Belldandy" },
    { id: "researcher", displayName: "调研助手" },
  ];

  it("keeps the current selection when the roster order changes", () => {
    expect(resolvePreferredAgentSelection(agents, "default", "")).toBe("default");
  });

  it("falls back to the saved selection when current selection is unavailable", () => {
    expect(resolvePreferredAgentSelection(agents, "missing", "researcher")).toBe("researcher");
  });

  it("falls back to the first roster entry when no selection can be restored", () => {
    expect(resolvePreferredAgentSelection(agents, "missing", "also-missing")).toBe("coder");
  });
});

describe("chat network model selection", () => {
  const models = [
    {
      id: "primary",
      displayName: "gpt-5（默认）",
      model: "gpt-5",
      providerLabel: "OpenAI",
      providerId: "openai",
      source: "primary",
      authStatus: "ready",
      isDefault: true,
    },
    {
      id: "claude-opus",
      displayName: "Claude Opus 4.5",
      model: "claude-opus-4-5",
      providerLabel: "Anthropic",
      providerId: "anthropic",
      source: "named",
      authStatus: "missing",
      isDefault: false,
    },
    {
      id: "moonshot-kimi",
      displayName: "Kimi K2.5",
      model: "kimi-k2.5",
      providerLabel: "Moonshot",
      providerId: "moonshot",
      source: "named",
      authStatus: "ready",
      isDefault: false,
    },
  ];

  it("formats provider and auth state into option labels", () => {
    expect(formatModelOptionLabel(models[0])).toBe("gpt-5（默认） · OpenAI");
    expect(formatModelOptionLabel(models[1])).toBe("Claude Opus 4.5 · Anthropic · auth missing");
  });

  it("preserves valid manual model selections when manual entry is supported", () => {
    const manualValue = buildManualModelValue("gpt-5.1-mini");
    expect(parseManualModelValue(manualValue)).toBe("gpt-5.1-mini");
    expect(resolvePreferredModelSelection(models, "", manualValue, true)).toBe(manualValue);
  });

  it("falls back to listed models when manual entry is unavailable", () => {
    expect(resolvePreferredModelSelection(models, "missing", "claude-opus", false)).toBe("claude-opus");
    expect(resolvePreferredModelSelection(models, "", buildManualModelValue("gpt-5.1-mini"), false)).toBe("");
  });

  it("groups providers with preferred ready providers first", () => {
    const groups = buildModelCatalogGroups(models, "primary");
    expect(groups.map((group) => group.providerId)).toEqual(["openai", "moonshot", "anthropic"]);
    expect(formatModelProviderGroupLabel(groups[0])).toBe("OpenAI · preferred");
    expect(formatModelProviderGroupLabel(groups[2])).toBe("Anthropic · auth missing");
  });

  it("uses explicit preferred provider order before inferred default-provider order", () => {
    const groups = buildModelCatalogGroups(models, "primary", ["moonshot", "anthropic"]);
    expect(groups.map((group) => group.providerId)).toEqual(["moonshot", "anthropic", "openai"]);
    expect(formatModelProviderGroupLabel(groups[0])).toBe("Moonshot · preferred");
    expect(formatModelProviderGroupLabel(groups[1])).toBe("Anthropic · preferred · auth missing");
  });

  it("filters catalog by model or provider keyword", () => {
    expect(modelMatchesCatalogFilter(models[1], "anth")).toBe(true);
    expect(modelMatchesCatalogFilter(models[2], "kimi")).toBe(true);
    expect(modelMatchesCatalogFilter(models[0], "moonshot")).toBe(false);
  });
});
