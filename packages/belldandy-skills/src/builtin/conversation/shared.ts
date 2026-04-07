import type {
  ConversationAccessKind,
  ConversationMessageLike,
  ConversationRestoreViewLike,
  ConversationTimelineProjectionLike,
  ConversationTranscriptExportLike,
  PersistedConversationSummaryLike,
} from "../../types.js";

export const ALL_CONVERSATION_ACCESS_KINDS: ConversationAccessKind[] = ["main", "subtask", "goal", "heartbeat"];

export function classifyConversationKind(conversationId: string): ConversationAccessKind {
  if (conversationId.startsWith("heartbeat-")) return "heartbeat";
  if (conversationId.startsWith("sub_")) return "subtask";
  if (conversationId.startsWith("goal:")) return "goal";
  return "main";
}

export function normalizeAllowedConversationKinds(value: unknown): ConversationAccessKind[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kinds = value.filter((item): item is ConversationAccessKind =>
    item === "main" || item === "subtask" || item === "goal" || item === "heartbeat");
  return kinds.length > 0 ? [...new Set(kinds)] : [];
}

export function isConversationAllowed(
  conversationId: string,
  allowedKinds: ConversationAccessKind[] | undefined,
): boolean {
  if (!allowedKinds) return true;
  return allowedKinds.includes(classifyConversationKind(conversationId));
}

export function formatConversationAccessDenied(
  conversationId: string,
  allowedKinds: ConversationAccessKind[] | undefined,
): string {
  const kind = classifyConversationKind(conversationId);
  const allowed = allowedKinds && allowedKinds.length > 0
    ? allowedKinds.join(",")
    : "none";
  return `Conversation access denied by current runtime policy: ${kind} (allowed=${allowed})`;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parsePositiveInt(
  value: unknown,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number {
  const min = typeof options.min === "number" ? options.min : 1;
  const max = typeof options.max === "number" ? options.max : Number.POSITIVE_INFINITY;
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

export function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

export function formatTimestamp(value?: number): string {
  if (!Number.isFinite(value)) return "-";
  try {
    return new Date(value as number).toISOString();
  } catch {
    return "-";
  }
}

export function truncateText(value: unknown, limit = 180): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

export function formatConversationList(items: PersistedConversationSummaryLike[]): string {
  if (items.length === 0) {
    return "No conversations found.";
  }
  return [
    `Conversations: ${items.length}`,
    "",
    ...items.map((item) => [
      `- ${item.conversationId}`,
      `  updated=${formatTimestamp(item.updatedAt)} messages=${item.messageCount}`,
      `  agent=${item.agentId || "-"} channel=${item.channel || "-"}`,
      `  transcript=${item.hasTranscript ? "yes" : "no"} meta=${item.hasMeta ? "yes" : "no"} loaded_messages=${item.hasMessages ? "yes" : "no"}`,
    ].join("\n")),
  ].join("\n");
}

export function formatMessageLines(
  messages: Array<ConversationMessageLike | { role: "user" | "assistant"; content: string; timestamp?: number }>,
  limit: number,
): string[] {
  return messages.slice(-limit).map((message, index, arr) => {
    const ordinal = arr.length - index;
    const timestamp = "timestamp" in message ? formatTimestamp(message.timestamp) : "-";
    return `- [${timestamp}] ${ordinal}. ${message.role}: ${truncateText(message.content, 240)}`;
  });
}

export function formatRestoreSummary(restore: ConversationRestoreViewLike): string[] {
  return [
    `conversation=${restore.conversationId}`,
    `source=${restore.diagnostics.source}`,
    `transcript_events=${restore.diagnostics.transcriptEventCount}`,
    `transcript_messages=${restore.diagnostics.transcriptMessageEventCount}`,
    `relink_applied=${restore.diagnostics.relinkApplied ? "yes" : "no"}`,
    `fallback_to_raw=${restore.diagnostics.fallbackToRaw ? "yes" : "no"}`,
    `fallback_reason=${restore.diagnostics.fallbackReason || "-"}`,
    `raw_messages=${restore.rawMessages.length}`,
    `compacted_view=${restore.compactedView.length}`,
    `canonical_extraction=${restore.canonicalExtractionView.length}`,
  ];
}

export function formatTimelineItems(timeline: ConversationTimelineProjectionLike, limit: number): string[] {
  const items = timeline.items.slice(-limit);
  return items.map((item) => {
    const kind = typeof item.kind === "string" ? item.kind : "item";
    if (kind === "message") {
      return `- [${formatTimestamp(Number(item.createdAt) || 0)}] message ${String(item.role || "-")} ${String(item.messageId || "-")}: ${truncateText(item.contentPreview, 200)}`;
    }
    if (kind === "compact_boundary") {
      return `- [${formatTimestamp(Number(item.createdAt) || 0)}] compact boundary=${String(item.boundaryId || "-")} trigger=${String(item.trigger || "-")} tier=${String(item.tier || "-")} token_delta=${String(item.tokenDelta || 0)}`;
    }
    if (kind === "partial_compaction") {
      return `- [${formatTimestamp(Number(item.createdAt) || 0)}] partial direction=${String(item.direction || "-")} pivot=${String(item.pivotMessageId || "-")} token_delta=${String(item.tokenDelta || 0)}`;
    }
    if (kind === "restore_result") {
      return `- [${formatTimestamp(Number(item.createdAt) || 0)}] restore source=${String(item.source || "-")} relink=${item.relinkApplied ? "yes" : "no"} fallback=${item.fallbackToRaw ? "yes" : "no"} raw=${String(item.rawMessageCount || 0)}`;
    }
    return `- ${truncateText(JSON.stringify(item), 240)}`;
  });
}

export function formatTranscriptSummary(bundle: ConversationTranscriptExportLike, limit: number): string[] {
  const recentEvents = bundle.events.slice(-Math.min(limit, 5)).map((event) => {
    const type = typeof event.type === "string" ? event.type : "event";
    const createdAt = typeof event.createdAt === "number" ? formatTimestamp(event.createdAt) : "-";
    return `- [${createdAt}] ${type}: ${truncateText(JSON.stringify(event), 220)}`;
  });
  return [
    `conversation=${bundle.manifest.conversationId}`,
    `mode=${bundle.manifest.redactionMode}`,
    `event_count=${bundle.summary.eventCount}`,
    `message_events=${bundle.summary.messageEventCount}`,
    `compact_boundaries=${bundle.summary.compactBoundaryCount}`,
    `partial_views=${bundle.summary.partialCompactionViewCount}`,
    `restore_source=${bundle.summary.restore.source}`,
    `relink_applied=${bundle.summary.restore.relinkApplied ? "yes" : "no"}`,
    `fallback_to_raw=${bundle.summary.restore.fallbackToRaw ? "yes" : "no"}`,
    `redaction_notes=${bundle.redaction.notes.join(" | ") || "-"}`,
    "",
    "Recent Export Events:",
    ...(recentEvents.length > 0 ? recentEvents : ["- none"]),
  ];
}
