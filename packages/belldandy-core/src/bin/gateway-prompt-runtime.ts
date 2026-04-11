import type {
  AgentPromptDelta,
  ProviderNativeSystemBlock,
  SystemPromptSection,
} from "@belldandy/agent";

export function createGatewaySystemPromptSection(input: {
  id: string;
  label: string;
  source: "runtime" | "profile";
  priority: number;
  text: string;
}): SystemPromptSection {
  return {
    id: input.id,
    label: input.label,
    source: input.source,
    priority: input.priority,
    text: input.text,
  };
}

export function stripStructuredRuntimeIdentityFromSystemPrompt(input: {
  systemPrompt: string;
  deltas?: AgentPromptDelta[];
}): {
  primaryText: string;
  runtimeContextText?: string;
} | undefined {
  const runtimeIdentityTexts = (input.deltas ?? [])
    .filter((delta) => delta.deltaType === "runtime-identity" && delta.role === "system")
    .map((delta) => delta.text.trim())
    .filter(Boolean);

  if (runtimeIdentityTexts.length === 0) {
    return undefined;
  }

  let remaining = input.systemPrompt.trim();
  const extractedRuntimeTexts: string[] = [];
  for (const runtimeText of [...runtimeIdentityTexts].reverse()) {
    if (remaining === runtimeText) {
      extractedRuntimeTexts.unshift(runtimeText);
      remaining = "";
      continue;
    }

    const suffix = `\n${runtimeText}`;
    if (!remaining.endsWith(suffix)) {
      return undefined;
    }

    extractedRuntimeTexts.unshift(runtimeText);
    remaining = remaining.slice(0, remaining.length - suffix.length).trimEnd();
  }

  return {
    primaryText: remaining.trim(),
    runtimeContextText: extractedRuntimeTexts.join("\n").trim() || undefined,
  };
}

export function cloneProviderNativeSystemBlocks(
  blocks?: ProviderNativeSystemBlock[],
): ProviderNativeSystemBlock[] {
  if (!blocks || blocks.length === 0) {
    return [];
  }
  return blocks.map((block) => ({
    ...block,
    sourceSectionIds: [...block.sourceSectionIds],
    sourceDeltaIds: [...block.sourceDeltaIds],
  }));
}

export function renderProviderNativeSystemBlocksText(
  blocks: ProviderNativeSystemBlock[],
  blockType?: ProviderNativeSystemBlock["blockType"],
): string {
  const texts = blocks
    .filter((block) => !blockType || block.blockType === blockType)
    .map((block) => block.text.trim())
    .filter(Boolean);
  return texts.join("\n").trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readResidentPromptMetadata(
  metadata: Record<string, unknown> | undefined,
): { residentProfile?: Record<string, unknown>; memoryPolicy?: Record<string, unknown>; residentStateBinding?: Record<string, unknown> } {
  return {
    ...(isRecord(metadata?.residentProfile) ? { residentProfile: { ...metadata.residentProfile } } : {}),
    ...(isRecord(metadata?.memoryPolicy) ? { memoryPolicy: { ...metadata.memoryPolicy } } : {}),
    ...(isRecord(metadata?.residentStateBinding) ? { residentStateBinding: { ...metadata.residentStateBinding } } : {}),
  };
}
