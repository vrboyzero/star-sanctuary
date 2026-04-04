import type {
  AgentPromptDelta,
  AgentPromptSnapshot,
  ProviderNativeSystemBlock,
} from "@belldandy/agent";

export function normalizeLegacyPromptSnapshot(
  snapshot: AgentPromptSnapshot,
): AgentPromptSnapshot {
  const synthesizedDeltas: AgentPromptDelta[] = [];
  const hasRuntimeIdentityDelta = snapshot.deltas?.some((delta) => delta.deltaType === "runtime-identity") === true;
  const hasUserPreludeDelta = snapshot.deltas?.some((delta) => delta.deltaType === "user-prelude") === true;

  if (!hasRuntimeIdentityDelta) {
    const dynamicRuntimeTextFromBlocks = renderProviderNativeSystemBlocksText(
      snapshot.providerNativeSystemBlocks,
      "dynamic-runtime",
    );
    if (dynamicRuntimeTextFromBlocks) {
      synthesizedDeltas.push({
        id: "provider-native-dynamic-runtime",
        deltaType: "runtime-identity",
        role: "system",
        source: "snapshot-normalize-provider-native",
        text: dynamicRuntimeTextFromBlocks,
      });
    } else if (
      (!snapshot.deltas || snapshot.deltas.length === 0)
      && hasLegacyRuntimeIdentityMarker(snapshot.systemPrompt)
    ) {
      const legacySplitPrompt = splitLegacyRuntimeIdentityContext(snapshot.systemPrompt);
      if (legacySplitPrompt.runtimeContextText) {
        synthesizedDeltas.push({
          id: "runtime-identity-context",
          deltaType: "runtime-identity",
          role: "system",
          source: "snapshot-normalize",
          text: legacySplitPrompt.runtimeContextText,
        });
      }
    }
  }

  if (snapshot.prependContext && !hasUserPreludeDelta) {
    synthesizedDeltas.push({
      id: "prepend-context",
      deltaType: "user-prelude",
      role: "user-prelude",
      source: "snapshot-normalize",
      text: snapshot.prependContext,
    });
  }

  if (synthesizedDeltas.length === 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    ...(snapshot.providerNativeSystemBlocks
      ? {
        providerNativeSystemBlocks: snapshot.providerNativeSystemBlocks.map(cloneProviderNativeSystemBlock),
      }
      : {}),
    deltas: [
      ...synthesizedDeltas,
      ...(snapshot.deltas?.map(clonePromptDelta) ?? []),
    ],
  };
}

function splitLegacyRuntimeIdentityContext(systemPrompt: string): {
  primaryText: string;
  runtimeContextText?: string;
} {
  const marker = getLegacyRuntimeIdentityMarker(systemPrompt);
  const markerIndex = systemPrompt.indexOf(marker);
  if (markerIndex < 0) {
    return {
      primaryText: systemPrompt.trim(),
    };
  }
  return {
    primaryText: systemPrompt.slice(0, markerIndex).trim(),
    runtimeContextText: systemPrompt.slice(markerIndex).trim(),
  };
}

function getLegacyRuntimeIdentityMarker(systemPrompt: string): string {
  return systemPrompt.includes("\n## Identity Context (Runtime)")
    ? "\n## Identity Context (Runtime)"
    : "## Identity Context (Runtime)";
}

function hasLegacyRuntimeIdentityMarker(systemPrompt: string): boolean {
  return systemPrompt.includes("## Identity Context (Runtime)");
}

function renderProviderNativeSystemBlocksText(
  blocks?: ProviderNativeSystemBlock[],
  blockType?: ProviderNativeSystemBlock["blockType"],
): string | undefined {
  const texts = (blocks ?? [])
    .filter((block) => !blockType || block.blockType === blockType)
    .map((block) => block.text.trim())
    .filter(Boolean);
  const merged = texts.join("\n").trim();
  return merged || undefined;
}

function clonePromptDelta(delta: AgentPromptDelta): AgentPromptDelta {
  return {
    ...delta,
    ...(delta.metadata ? { metadata: { ...delta.metadata } } : {}),
  };
}

function cloneProviderNativeSystemBlock(
  block: ProviderNativeSystemBlock,
): ProviderNativeSystemBlock {
  return {
    ...block,
    sourceSectionIds: [...block.sourceSectionIds],
    sourceDeltaIds: [...block.sourceDeltaIds],
  };
}
