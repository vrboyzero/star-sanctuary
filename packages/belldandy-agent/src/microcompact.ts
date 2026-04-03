export type MicrocompactOptions = {
  enabled?: boolean;
  keepRecentToolMessages?: number;
  compactableToolNames?: string[];
  minOutputChars?: number;
  maxDigestChars?: number;
};

export type MicrocompactMessage =
  | { role: "system"; content?: unknown }
  | { role: "user"; content?: unknown }
  | { role: "assistant"; content?: unknown; tool_calls?: Array<{ id: string; function?: { name?: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

export type MicrocompactResult = {
  mutated: boolean;
  compactedCount: number;
  reclaimedChars: number;
};

const DEFAULT_KEEP_RECENT_TOOL_MESSAGES = 4;
const DEFAULT_MIN_OUTPUT_CHARS = 240;
const DEFAULT_MAX_DIGEST_CHARS = 180;
const DEFAULT_COMPACTABLE_TOOL_NAMES = new Set([
  "run_command",
  "file_read",
  "list_files",
  "web_fetch",
]);

function isAlreadyMicrocompacted(content: string): boolean {
  return content.startsWith("[old tool output cleared]") || content.startsWith("[old tool error summary preserved]");
}

function summarizeContent(content: string, maxDigestChars: number): string {
  const normalized = content
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "no significant output recorded";
  if (normalized.length <= maxDigestChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxDigestChars - 3))}...`;
}

function isCompactableToolName(toolName: string, options?: MicrocompactOptions): boolean {
  if (!toolName) return false;
  if (Array.isArray(options?.compactableToolNames) && options.compactableToolNames.length > 0) {
    return options.compactableToolNames.includes(toolName);
  }
  return DEFAULT_COMPACTABLE_TOOL_NAMES.has(toolName);
}

function buildCompactedToolContent(toolName: string, content: string, maxDigestChars: number): string {
  const summary = summarizeContent(content, maxDigestChars);
  if (/^错误[:：]/.test(content.trim())) {
    return [
      "[old tool error summary preserved]",
      `tool=${toolName}`,
      `error=${summary}`,
    ].join("\n");
  }
  return [
    "[old tool output cleared]",
    `tool=${toolName}`,
    `result=${summary}`,
  ].join("\n");
}

export function microcompactMessages(
  messages: MicrocompactMessage[],
  options?: MicrocompactOptions,
): MicrocompactResult {
  if (options?.enabled === false || messages.length === 0) {
    return {
      mutated: false,
      compactedCount: 0,
      reclaimedChars: 0,
    };
  }

  const keepRecentToolMessages = Math.max(0, Math.floor(options?.keepRecentToolMessages ?? DEFAULT_KEEP_RECENT_TOOL_MESSAGES));
  const minOutputChars = Math.max(32, Math.floor(options?.minOutputChars ?? DEFAULT_MIN_OUTPUT_CHARS));
  const maxDigestChars = Math.max(48, Math.floor(options?.maxDigestChars ?? DEFAULT_MAX_DIGEST_CHARS));
  const toolCallNameById = new Map<string, string>();
  const toolMessageIndices: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        const toolName = typeof toolCall?.function?.name === "string" ? toolCall.function.name : "";
        if (toolName && typeof toolCall?.id === "string" && toolCall.id) {
          toolCallNameById.set(toolCall.id, toolName);
        }
      }
      continue;
    }

    if (message.role === "tool") {
      toolMessageIndices.push(i);
    }
  }

  const compactUntil = Math.max(0, toolMessageIndices.length - keepRecentToolMessages);
  let compactedCount = 0;
  let reclaimedChars = 0;

  for (let i = 0; i < compactUntil; i++) {
    const messageIndex = toolMessageIndices[i];
    const message = messages[messageIndex];
    if (!message || message.role !== "tool") continue;
    if (typeof message.content !== "string" || !message.content.trim()) continue;
    if (message.content.length < minOutputChars) continue;
    if (isAlreadyMicrocompacted(message.content)) continue;

    const toolName = toolCallNameById.get(message.tool_call_id) ?? "";
    if (!isCompactableToolName(toolName, options)) continue;

    const compacted = buildCompactedToolContent(toolName, message.content, maxDigestChars);
    if (compacted.length >= message.content.length) continue;

    reclaimedChars += message.content.length - compacted.length;
    compactedCount += 1;
    message.content = compacted;
  }

  return {
    mutated: compactedCount > 0,
    compactedCount,
    reclaimedChars,
  };
}
