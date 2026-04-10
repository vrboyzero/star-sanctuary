import type { ModelProfile } from "@belldandy/agent";

export const MEDIA_CAPABILITIES = [
  "image_input",
  "video_input",
  "audio_transcription",
  "text_inline",
  "tts_output",
  "image_generation",
  "camera_capture",
] as const;

export type MediaCapability = typeof MEDIA_CAPABILITIES[number];

export type MediaCapabilityDescriptor = {
  id: string;
  label: string;
  capabilities: MediaCapability[];
};

type PrimaryModelCatalogConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol?: string;
  wireApi?: string;
};

const BUILTIN_MEDIA_TOOL_CAPABILITIES: MediaCapabilityDescriptor[] = [
  { id: "stt_transcribe", label: "Speech To Text", capabilities: ["audio_transcription"] },
  { id: "tts_synthesize", label: "Text To Speech", capabilities: ["tts_output"] },
  { id: "image_generate", label: "Image Generation", capabilities: ["image_generation"] },
  { id: "camera_capture", label: "Camera Capture", capabilities: ["camera_capture", "image_input"] },
];

function uniqueCapabilities(values: Array<MediaCapability | undefined>): MediaCapability[] {
  const seen = new Set<MediaCapability>();
  for (const value of values) {
    if (!value) continue;
    seen.add(value);
  }
  return [...seen];
}

function normalizeProtocol(value: string | undefined): "openai" | "anthropic" | undefined {
  if (value === "openai" || value === "anthropic") return value;
  return undefined;
}

function normalizeModelName(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function inferProviderId(input: {
  baseUrl?: string;
  protocol?: string;
}): string {
  const protocol = normalizeProtocol(input.protocol);
  const normalizedBaseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim().toLowerCase() : "";
  if (normalizedBaseUrl) {
    try {
      const host = new URL(normalizedBaseUrl).hostname.toLowerCase();
      if (host.includes("openai")) return "openai";
      if (host.includes("anthropic")) return "anthropic";
      if (host.includes("moonshot")) return "moonshot";
      if (host.includes("openrouter")) return "openrouter";
      if (host.includes("groq")) return "groq";
      if (host.includes("dashscope") || host.includes("aliyuncs")) return "dashscope";
      if (host.includes("deepseek")) return "deepseek";
      if (host.includes("ollama")) return "ollama";
      if (host.includes("azure")) return "azure";
      if (host.includes("x.ai") || host.includes("xai") || host.includes("grok")) return "xai";
      if (host.includes("together")) return "together";
    } catch {
      return protocol === "anthropic" ? "anthropic" : "custom";
    }
  }
  if (protocol === "anthropic") return "anthropic";
  if (protocol === "openai") return "openai-compatible";
  return "openai-compatible";
}

export function inferProviderMediaCapabilities(providerId: string): MediaCapability[] {
  switch (providerId) {
    case "openai":
      return ["audio_transcription", "tts_output", "image_generation"];
    case "groq":
      return ["audio_transcription"];
    case "dashscope":
      return ["audio_transcription", "tts_output"];
    case "moonshot":
      return ["image_input", "video_input"];
    default:
      return [];
  }
}

export function inferModelMediaCapabilities(input: {
  providerId?: string;
  protocol?: string;
  wireApi?: string;
  model?: string;
}): MediaCapability[] {
  const providerId = typeof input.providerId === "string" ? input.providerId.trim().toLowerCase() : undefined;
  const protocol = normalizeProtocol(input.protocol);
  const model = normalizeModelName(input.model);
  const hasVisionLikeModel = Boolean(
    model
    && (
      model.includes("gpt-4o")
      || model.includes("gpt-4.1")
      || model.includes("gpt-5")
      || model.includes("claude-3")
      || model.includes("claude-opus")
      || model.includes("claude-sonnet")
      || model.includes("gemini")
      || model.includes("kimi")
      || model.includes("vision")
      || model.includes("-vl")
      || model.includes("qvq")
      || model.includes("llava")
    )
  );
  const hasVideoLikeModel = Boolean(
    model && (
      model.includes("kimi")
      || model.includes("video")
      || model.includes("vision-video")
    )
  );

  return uniqueCapabilities([
    providerId === "moonshot" ? "image_input" : undefined,
    providerId === "moonshot" ? "video_input" : undefined,
    protocol === "anthropic" || providerId === "anthropic" ? "image_input" : undefined,
    input.wireApi === "responses" ? "image_input" : undefined,
    hasVisionLikeModel ? "image_input" : undefined,
    hasVideoLikeModel ? "video_input" : undefined,
    "text_inline",
  ]);
}

export function resolveModelMediaCapabilities(input: {
  modelRef?: string;
  primaryModelConfig?: PrimaryModelCatalogConfig;
  modelFallbacks?: ModelProfile[];
}): MediaCapability[] {
  const modelRef = typeof input.modelRef === "string" && input.modelRef.trim()
    ? input.modelRef.trim()
    : "primary";
  if (modelRef === "primary") {
    const primary = input.primaryModelConfig;
    if (!primary) return ["text_inline"];
    return inferModelMediaCapabilities({
      providerId: inferProviderId({
        baseUrl: primary.baseUrl,
        protocol: primary.protocol,
      }),
      protocol: primary.protocol,
      wireApi: primary.wireApi,
      model: primary.model,
    });
  }

  const fallback = input.modelFallbacks?.find((item) => item.id === modelRef || item.model === modelRef);
  if (fallback) {
    return inferModelMediaCapabilities({
      providerId: inferProviderId({
        baseUrl: fallback.baseUrl,
        protocol: fallback.protocol,
      }),
      protocol: fallback.protocol,
      wireApi: fallback.wireApi,
      model: fallback.model,
    });
  }

  return inferModelMediaCapabilities({ model: modelRef });
}

export function listBuiltinMediaToolCapabilities(): MediaCapabilityDescriptor[] {
  return BUILTIN_MEDIA_TOOL_CAPABILITIES.map((entry) => ({
    ...entry,
    capabilities: [...entry.capabilities],
  }));
}

export function hasMediaCapability(
  capabilities: readonly string[] | undefined,
  capability: MediaCapability,
): boolean {
  return Array.isArray(capabilities) && capabilities.includes(capability);
}
