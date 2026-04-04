import { describe, expect, it } from "vitest";

import {
  applyPromptExperimentsToSections,
  buildPromptObservabilitySummary,
  buildPromptTokenBreakdown,
  measurePromptText,
  parsePromptExperimentConfig,
  withDeltaPromptMetrics,
  withProviderNativeSystemBlockPromptMetrics,
  withSectionPromptMetrics,
} from "./prompt-observability.js";

describe("prompt observability", () => {
  it("measures chars and tokens for sections, deltas, and provider-native blocks", () => {
    expect(withSectionPromptMetrics({
      id: "core",
      label: "core",
      source: "core",
      priority: 0,
      text: "hello world",
    })).toMatchObject({
      charLength: 11,
      estimatedChars: 11,
      estimatedTokens: 3,
    });

    expect(withDeltaPromptMetrics({
      id: "delta-1",
      deltaType: "attachment",
      role: "attachment",
      text: "中文测试",
    })).toMatchObject({
      charLength: 4,
      estimatedChars: 4,
      estimatedTokens: 2,
    });

    expect(withProviderNativeSystemBlockPromptMetrics({
      id: "block-1",
      blockType: "static-capability",
      text: "abcd",
      sourceSectionIds: ["methodology"],
      sourceDeltaIds: [],
      cacheControlEligible: true,
    })).toMatchObject({
      charLength: 4,
      estimatedChars: 4,
      estimatedTokens: 1,
    });

    expect(measurePromptText("")).toMatchObject({
      charLength: 0,
      estimatedChars: 0,
      estimatedTokens: 0,
    });
  });

  it("builds token breakdown across prompt layers", () => {
    expect(buildPromptTokenBreakdown({
      systemPromptText: "hello world",
      sections: [{ text: "hello world" }],
      droppedSections: [{ text: "abcd" }],
      deltas: [{ text: "中文测试" }],
      providerNativeSystemBlocks: [{ text: "abcd" }],
    })).toMatchObject({
      systemPromptEstimatedChars: 11,
      systemPromptEstimatedTokens: 3,
      sectionEstimatedChars: 11,
      sectionEstimatedTokens: 3,
      droppedSectionEstimatedChars: 4,
      droppedSectionEstimatedTokens: 1,
      deltaEstimatedChars: 4,
      deltaEstimatedTokens: 2,
      providerNativeSystemBlockEstimatedChars: 4,
      providerNativeSystemBlockEstimatedTokens: 1,
    });
  });

  it("parses and applies the disabled-section experiment", () => {
    const config = parsePromptExperimentConfig({
      disabledSectionIdsRaw: "methodology, context , ,workspace-tools",
      sectionPriorityOverridesRaw: "context:5,core:0,invalid,nope:abc",
      disabledToolContractNamesRaw: "apply_patch, run_command , ",
    });
    expect(config).toEqual({
      disabledSectionIds: ["methodology", "context", "workspace-tools"],
      sectionPriorityOverrides: {
        context: 5,
        core: 0,
      },
      disabledToolContractNames: ["apply_patch", "run_command"],
    });

    const applied = applyPromptExperimentsToSections([
      {
        id: "core",
        label: "core",
        source: "core",
        priority: 0,
        text: "core",
      },
      {
        id: "methodology",
        label: "methodology",
        source: "methodology",
        priority: 1,
        text: "methodology",
      },
      {
        id: "context",
        label: "context",
        source: "context",
        priority: 2,
        text: "context",
      },
      {
        id: "extra",
        label: "extra",
        source: "extra",
        priority: 100,
        text: "extra",
      },
    ], config);

    expect(applied.sections.map((section) => section.id)).toEqual(["core", "extra"]);
    expect(applied.droppedSections.map((section) => section.id)).toEqual(["methodology", "context"]);
    expect(applied.disabledSectionIdsApplied).toEqual(["methodology", "context"]);
    expect(applied.sectionPriorityOverridesApplied).toEqual({
      core: 0,
      context: 5,
    });
  });

  it("builds a doctor-friendly prompt observability summary", () => {
    const summary = buildPromptObservabilitySummary({
      scope: "run",
      agentId: "default",
      displayName: "Belldandy",
      model: "primary",
      conversationId: "conv-1",
      runId: "run-1",
      createdAt: 123,
      text: "hello world",
      totalChars: 11,
      finalChars: 11,
      sections: [{ id: "core", text: "hello world" }],
      droppedSections: [{ id: "methodology", text: "abcd" }],
      deltas: [{ id: "delta-1", text: "中文测试" }],
      providerNativeSystemBlocks: [{ id: "block-1", text: "abcd", cacheControlEligible: true }],
      metadata: {
        promptExperiments: {
          disabledSectionIdsApplied: ["methodology"],
        },
      },
    });

    expect(summary).toMatchObject({
      scope: "run",
      agentId: "default",
      counts: {
        sectionCount: 1,
        droppedSectionCount: 1,
        deltaCount: 1,
        providerNativeSystemBlockCount: 1,
      },
      promptSizes: {
        totalChars: 11,
        finalChars: 11,
      },
      tokenBreakdown: {
        systemPromptEstimatedTokens: 3,
        droppedSectionEstimatedTokens: 1,
        deltaEstimatedTokens: 2,
        providerNativeSystemBlockEstimatedTokens: 1,
      },
      experiments: {
        disabledSectionIdsApplied: ["methodology"],
      },
    });
  });

  it("reads token breakdown from canonical metadata key", () => {
    const summary = buildPromptObservabilitySummary({
      agentId: "default",
      text: "hello world",
      totalChars: 11,
      finalChars: 11,
      metadata: {
        tokenBreakdown: {
          systemPromptEstimatedChars: 11,
          systemPromptEstimatedTokens: 3,
          sectionEstimatedChars: 11,
          sectionEstimatedTokens: 3,
          droppedSectionEstimatedChars: 0,
          droppedSectionEstimatedTokens: 0,
          deltaEstimatedChars: 0,
          deltaEstimatedTokens: 0,
          providerNativeSystemBlockEstimatedChars: 0,
          providerNativeSystemBlockEstimatedTokens: 0,
        },
      },
    });

    expect(summary.tokenBreakdown).toMatchObject({
      systemPromptEstimatedTokens: 3,
      sectionEstimatedTokens: 3,
    });
  });
});
