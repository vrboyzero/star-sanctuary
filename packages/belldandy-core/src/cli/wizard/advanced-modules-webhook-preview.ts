import type { WebhookRule } from "../../webhook/types.js";

export function buildWebhookPayloadSchemaLines(payload: Record<string, unknown>): string[] {
  const entries = collectWebhookSchemaEntries(payload);
  if (entries.length === 0) {
    return ["Payload schema: empty object"];
  }
  return [
    "Payload schema:",
    ...entries.map((entry) => `- ${entry.path}: ${entry.description}`),
  ];
}

export function buildWebhookPayloadComparisonLines(samples: Record<string, unknown>[]): string[] {
  if (samples.length <= 1) {
    return buildWebhookPayloadSchemaLines(samples[0] ?? {});
  }
  const topLevelKeyLists = samples.map((payload) => Object.keys(payload).sort((left, right) => left.localeCompare(right)));
  const unionTopLevel = Array.from(new Set(topLevelKeyLists.flat())).sort((left, right) => left.localeCompare(right));
  const commonTopLevel = unionTopLevel.filter((key) => topLevelKeyLists.every((keys) => keys.includes(key)));
  const lines = [
    `Compared payload samples: ${samples.length}`,
    `Common top-level keys: ${commonTopLevel.length > 0 ? commonTopLevel.join(", ") : "(none)"}`,
    `Union top-level keys: ${unionTopLevel.length > 0 ? unionTopLevel.join(", ") : "(none)"}`,
  ];
  for (const [index, payload] of samples.entries()) {
    const schemaEntries = collectWebhookSchemaEntries(payload);
    lines.push(`Sample ${index + 1} keys: ${topLevelKeyLists[index]?.join(", ") || "(none)"}`);
    lines.push(`Sample ${index + 1} schema highlights: ${summarizeSchemaEntries(schemaEntries, 5)}`);
  }
  return lines;
}

export function buildWebhookRequestPreviewLines(input: {
  rule: Pick<WebhookRule, "id" | "defaultAgentId" | "conversationIdPrefix" | "promptTemplate">;
  payload?: Record<string, unknown>;
  resolvedPrompt: string;
}): string[] {
  const route = `/api/webhook/${input.rule.id}`;
  const effectiveAgent = input.rule.defaultAgentId?.trim() || "default";
  const conversationPrefix = input.rule.conversationIdPrefix?.trim() || `webhook:${input.rule.id}`;
  const payloadKeys = Object.keys(input.payload ?? {});
  const placeholders = extractWebhookTemplatePlaceholders(input.rule.promptTemplate ?? "");
  const unsupportedPlaceholders = findUnsupportedWebhookPlaceholderKeys(placeholders);
  const supportedPlaceholders = placeholders.filter((key) => !unsupportedPlaceholders.includes(key));
  const payload = input.payload ?? {};
  const resolvedPlaceholderCount = supportedPlaceholders.filter((key) => key in payload).length;
  const missingPlaceholders = supportedPlaceholders.filter((key) => !(key in payload));
  const requestBodyPreview = truncateWebhookPreview(JSON.stringify({ payload }, null, 0), 180);
  return [
    "Method: POST",
    `Route: ${route}`,
    "Auth: Bearer <webhook token>",
    `Default agent: ${effectiveAgent}`,
    `Conversation id handling: auto-generated from prefix ${conversationPrefix} unless request.conversationId overrides it`,
    `Prompt source: ${input.rule.promptTemplate?.trim() ? "custom template" : "JSON.stringify(payload) fallback"}`,
    `Payload keys: ${payloadKeys.length > 0 ? payloadKeys.sort((left, right) => left.localeCompare(right)).join(", ") : "(none)"}`,
    ...(placeholders.length > 0
      ? [`Template coverage: resolved ${resolvedPlaceholderCount}/${supportedPlaceholders.length} top-level placeholders`]
      : []),
    ...(missingPlaceholders.length > 0
      ? [`Missing top-level fields for template: ${missingPlaceholders.join(", ")}`]
      : []),
    ...(unsupportedPlaceholders.length > 0
      ? [`Unsupported placeholders in template: ${unsupportedPlaceholders.join(", ")}`]
      : []),
    `Request body preview: ${requestBodyPreview}`,
    `Resolved prompt preview: ${input.resolvedPrompt.trim() ? truncateWebhookPreview(input.resolvedPrompt.trim(), 140) : "(empty)"}`,
  ];
}

export function buildWebhookRequestPreviewComparisonLines(input: {
  rule: Pick<WebhookRule, "id" | "defaultAgentId" | "conversationIdPrefix" | "promptTemplate">;
  samples: Array<{
    payload: Record<string, unknown>;
    resolvedPrompt: string;
  }>;
}): string[] {
  if (input.samples.length <= 1) {
    const sample = input.samples[0];
    return buildWebhookRequestPreviewLines({
      rule: input.rule,
      payload: sample?.payload,
      resolvedPrompt: sample?.resolvedPrompt ?? "",
    });
  }
  const route = `/api/webhook/${input.rule.id}`;
  const effectiveAgent = input.rule.defaultAgentId?.trim() || "default";
  const conversationPrefix = input.rule.conversationIdPrefix?.trim() || `webhook:${input.rule.id}`;
  const promptSource = input.rule.promptTemplate?.trim() ? "custom template" : "JSON.stringify(payload) fallback";
  const lines = [
    "Method: POST",
    `Route: ${route}`,
    "Auth: Bearer <webhook token>",
    `Default agent: ${effectiveAgent}`,
    `Conversation id handling: auto-generated from prefix ${conversationPrefix} unless request.conversationId overrides it`,
    `Prompt source: ${promptSource}`,
    `Compared request samples: ${input.samples.length}`,
  ];
  for (const [index, sample] of input.samples.entries()) {
    const payloadKeys = Object.keys(sample.payload).sort((left, right) => left.localeCompare(right));
    const previewLines = buildWebhookRequestPreviewLines({
      rule: input.rule,
      payload: sample.payload,
      resolvedPrompt: sample.resolvedPrompt,
    }).filter((line) => (
      !line.startsWith("Method: ")
      && !line.startsWith("Route: ")
      && !line.startsWith("Auth: ")
      && !line.startsWith("Default agent: ")
      && !line.startsWith("Conversation id handling: ")
      && !line.startsWith("Prompt source: ")
    ));
    lines.push(`Sample ${index + 1} payload keys: ${payloadKeys.length > 0 ? payloadKeys.join(", ") : "(none)"}`);
    lines.push(...previewLines.map((line) => `Sample ${index + 1} ${line}`));
  }
  return lines;
}

type WebhookSchemaEntry = {
  path: string;
  description: string;
};

function collectWebhookSchemaEntries(
  payload: Record<string, unknown>,
  parentPath = "",
  depth = 0,
): WebhookSchemaEntry[] {
  const entries = Object.entries(payload).sort(([left], [right]) => left.localeCompare(right));
  const lines: WebhookSchemaEntry[] = [];
  for (const [key, value] of entries) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    lines.push({
      path,
      description: buildWebhookSchemaDescription(value, depth),
    });
    if (value && typeof value === "object" && !Array.isArray(value) && depth < 1) {
      lines.push(...collectWebhookSchemaEntries(value as Record<string, unknown>, path, depth + 1));
    }
  }
  return lines;
}

function buildWebhookSchemaDescription(value: unknown, depth = 0): string {
  const example = formatWebhookExampleValue(value);
  if (value === null) return example ? `null (${example})` : "null";
  if (typeof value === "string") return example ? `string (${example})` : "string";
  if (typeof value === "number") {
    const kind = Number.isInteger(value) ? "integer" : "number";
    return example ? `${kind} (${example})` : kind;
  }
  if (typeof value === "boolean") return `boolean (${String(value)})`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty> (0 items)";
    const kinds = Array.from(new Set(value.map((item) => describeWebhookValue(item, depth + 1))));
    return `array<${kinds.join(" | ")}> (${value.length} items)`;
  }
  if (typeof value === "object") {
    if (depth >= 1) return "object";
    const keys = Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right));
    return keys.length > 0 ? `object{${keys.join(", ")}}` : "object{}";
  }
  return typeof value;
}

function describeWebhookValue(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    const kinds = Array.from(new Set(value.map((item) => describeWebhookValue(item, depth + 1))));
    return `array<${kinds.join(" | ")}>`;
  }
  if (typeof value === "object") {
    if (depth >= 1) return "object";
    const keys = Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right));
    return keys.length > 0 ? `object{${keys.join(", ")}}` : "object{}";
  }
  return typeof value;
}

function formatWebhookExampleValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(truncateWebhookPreview(value, 24));
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function summarizeSchemaEntries(entries: WebhookSchemaEntry[], limit: number): string {
  if (entries.length === 0) {
    return "(empty)";
  }
  const formatted = entries.map((entry) => `${entry.path}=${entry.description}`);
  if (formatted.length <= limit) {
    return formatted.join("; ");
  }
  return `${formatted.slice(0, limit).join("; ")}; +${formatted.length - limit} more`;
}

function extractWebhookTemplatePlaceholders(template: string): string[] {
  const values = Array.from(template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g))
    .map((match) => String(match[1] ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function findUnsupportedWebhookPlaceholderKeys(placeholders: string[]): string[] {
  return placeholders.filter((key) => key.includes(".") || key.includes("[") || key.includes("]"));
}

function truncateWebhookPreview(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}
