import * as p from "@clack/prompts";
import type { ModelProfile } from "@belldandy/agent";

import {
  validateOptionalNonNegativeInt,
  validateOptionalPositiveInt,
  validateOptionalUrl,
} from "./advanced-modules-shared.js";

type OptionalFieldUpdate<T> =
  | { mode: "keep" }
  | { mode: "clear" }
  | { mode: "set"; value: T };

export type ModelFallbackAdvancedBatchPatch = {
  protocol: OptionalFieldUpdate<string>;
  wireApi: OptionalFieldUpdate<string>;
  requestTimeoutMs: OptionalFieldUpdate<number>;
  maxRetries: OptionalFieldUpdate<number>;
  retryBackoffMs: OptionalFieldUpdate<number>;
  proxyUrl: OptionalFieldUpdate<string>;
};

type ModelFallbackChoice = Pick<ModelProfile, "id" | "displayName" | "model" | "baseUrl">;

export async function promptModelFallbackIdsToManage(
  profiles: ModelFallbackChoice[],
  verb: string,
): Promise<string[]> {
  const selected: string[] = [];
  while (true) {
    const remaining = profiles.filter((profile) => !selected.includes(profile.id ?? ""));
    if (remaining.length === 0) {
      break;
    }
    const chosen = resolvePromptValue(await p.select<string>({
      message: selected.length === 0 ? `Choose fallback to ${verb}` : `Choose another fallback to ${verb}`,
      options: [
        ...remaining.map((profile) => ({
          value: profile.id ?? "",
          label: profile.id ?? "<missing-id>",
          hint: profile.displayName ?? profile.model ?? profile.baseUrl ?? "configured fallback",
        })),
        { value: "__done__", label: "Done", hint: `${selected.length} selected` },
      ],
      initialValue: remaining[0]?.id ?? "__done__",
    }));
    if (chosen === "__done__") {
      break;
    }
    selected.push(chosen);
    const addMore = resolvePromptValue(await p.confirm({
      message: "Select another fallback?",
      initialValue: remaining.length > 1,
      active: "Yes",
      inactive: "Done",
    }));
    if (!addMore) {
      break;
    }
  }
  return selected;
}

export async function promptModelFallbackAdvancedBatchPatch(): Promise<ModelFallbackAdvancedBatchPatch> {
  const protocol = await promptChoiceUpdate("Batch protocol override", [
    { value: "openai", label: "Set openai", hint: "Use OpenAI-compatible protocol" },
    { value: "anthropic", label: "Set anthropic", hint: "Use Anthropic protocol" },
  ]);
  const wireApi = await promptChoiceUpdate("Batch wire API override", [
    { value: "chat_completions", label: "Set chat_completions", hint: "Classic /chat/completions route" },
    { value: "responses", label: "Set responses", hint: "OpenAI Responses API route" },
  ]);
  const requestTimeoutMs = await promptNumberUpdate("Batch request timeout ms", "Request timeout", "positive");
  const maxRetries = await promptNumberUpdate("Batch max retries", "Max retries", "nonnegative");
  const retryBackoffMs = await promptNumberUpdate("Batch retry backoff ms", "Retry backoff", "positive");
  const proxyUrl = await promptStringUpdate("Batch proxy URL", "Proxy URL", (value) => validateOptionalUrl(value, "Proxy URL"));

  return {
    protocol,
    wireApi,
    requestTimeoutMs,
    maxRetries,
    retryBackoffMs,
    proxyUrl,
  };
}

export function applyModelFallbackAdvancedBatchPatch(
  fallbacks: ModelProfile[],
  ids: string[],
  patch: ModelFallbackAdvancedBatchPatch,
): ModelProfile[] {
  const targets = new Set(ids.map((item) => String(item ?? "").trim()).filter(Boolean));
  return fallbacks.map((profile) => {
    const profileId = String(profile.id ?? "").trim();
    if (!targets.has(profileId)) {
      return profile;
    }

    let nextProfile: ModelProfile = { ...profile };
    nextProfile = applyOptionalField(nextProfile, "protocol", patch.protocol);
    nextProfile = applyOptionalField(nextProfile, "wireApi", patch.wireApi);
    nextProfile = applyOptionalField(nextProfile, "requestTimeoutMs", patch.requestTimeoutMs);
    nextProfile = applyOptionalField(nextProfile, "maxRetries", patch.maxRetries);
    nextProfile = applyOptionalField(nextProfile, "retryBackoffMs", patch.retryBackoffMs);
    nextProfile = applyOptionalField(nextProfile, "proxyUrl", patch.proxyUrl);
    return nextProfile;
  });
}

export function summarizeModelFallbackAdvancedBatchPatch(patch: ModelFallbackAdvancedBatchPatch): string[] {
  const lines: string[] = [];
  appendSummary(lines, "protocol", patch.protocol);
  appendSummary(lines, "wireApi", patch.wireApi);
  appendSummary(lines, "requestTimeoutMs", patch.requestTimeoutMs, (value) => `${value}ms`);
  appendSummary(lines, "maxRetries", patch.maxRetries, (value) => String(value));
  appendSummary(lines, "retryBackoffMs", patch.retryBackoffMs, (value) => `${value}ms`);
  appendSummary(lines, "proxyUrl", patch.proxyUrl);
  return lines;
}

function appendSummary<T>(
  lines: string[],
  label: string,
  update: OptionalFieldUpdate<T>,
  formatValue: (value: T) => string = (value) => String(value),
): void {
  if (update.mode === "keep") return;
  if (update.mode === "clear") {
    lines.push(`${label}=clear`);
    return;
  }
  lines.push(`${label}=${formatValue(update.value)}`);
}

function applyOptionalField<T, K extends keyof ModelProfile>(
  profile: ModelProfile,
  key: K,
  update: OptionalFieldUpdate<T>,
): ModelProfile {
  if (update.mode === "keep") {
    return profile;
  }
  if (update.mode === "clear") {
    const { [key]: _removed, ...rest } = profile;
    return rest as ModelProfile;
  }
  return {
    ...profile,
    [key]: update.value,
  } as ModelProfile;
}

async function promptChoiceUpdate(
  message: string,
  options: Array<{ value: string; label: string; hint?: string }>,
): Promise<OptionalFieldUpdate<string>> {
  const chosen = resolvePromptValue(await p.select<string>({
    message,
    options: [
      { value: "__keep__", label: "Keep existing", hint: "Do not change this field" },
      ...options,
      { value: "__clear__", label: "Clear override", hint: "Remove this field from selected fallbacks" },
    ],
    initialValue: "__keep__",
  }));
  if (chosen === "__keep__") return { mode: "keep" };
  if (chosen === "__clear__") return { mode: "clear" };
  return { mode: "set", value: chosen };
}

async function promptStringUpdate(
  message: string,
  label: string,
  validate: (value: string) => string | undefined,
): Promise<OptionalFieldUpdate<string>> {
  const mode = resolvePromptValue(await p.select<string>({
    message,
    options: [
      { value: "keep", label: "Keep existing", hint: "Do not change this field" },
      { value: "set", label: "Set value" },
      { value: "clear", label: "Clear override", hint: "Remove this field from selected fallbacks" },
    ],
    initialValue: "keep",
  }));
  if (mode === "keep") return { mode: "keep" };
  if (mode === "clear") return { mode: "clear" };
  const value = resolvePromptValue(await p.text({
    message: `${label} value`,
    defaultValue: "",
    validate,
  }));
  return { mode: "set", value: value.trim() };
}

async function promptNumberUpdate(
  message: string,
  label: string,
  kind: "positive" | "nonnegative",
): Promise<OptionalFieldUpdate<number>> {
  const mode = resolvePromptValue(await p.select<string>({
    message,
    options: [
      { value: "keep", label: "Keep existing", hint: "Do not change this field" },
      { value: "set", label: "Set value" },
      { value: "clear", label: "Clear override", hint: "Remove this field from selected fallbacks" },
    ],
    initialValue: "keep",
  }));
  if (mode === "keep") return { mode: "keep" };
  if (mode === "clear") return { mode: "clear" };
  const rawValue = resolvePromptValue(await p.text({
    message: `${label} value`,
    defaultValue: "",
    validate: (value) => kind === "positive"
      ? validateOptionalPositiveInt(value, label)
      : validateOptionalNonNegativeInt(value, label),
  }));
  return { mode: "set", value: Number.parseInt(rawValue.trim(), 10) };
}

function resolvePromptValue<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value;
}
