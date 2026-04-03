import type { SessionRestoreView } from "./session-restore.js";
import type {
  SessionTranscriptCompactBoundaryEvent,
  SessionTranscriptEvent,
  SessionTranscriptMessageEvent,
  SessionTranscriptPartialCompactionViewEvent,
} from "./session-transcript.js";

export const SESSION_TIMELINE_SCHEMA_VERSION = 1;

export type SessionTimelineWarningCode =
  | "transcript_empty"
  | "conversation_fallback_used"
  | "no_compact_boundary"
  | "restore_fallback_to_raw";

export type SessionTimelineMessageItem = {
  kind: "message";
  eventId: string;
  eventType: SessionTranscriptMessageEvent["type"];
  createdAt: number;
  messageId: string;
  role: "user" | "assistant";
  contentPreview: string;
  contentLength: number;
  truncated: boolean;
  agentId?: string;
};

export type SessionTimelineCompactBoundaryItem = {
  kind: "compact_boundary";
  eventId: string;
  eventType: "compact_boundary_recorded";
  createdAt: number;
  boundaryId: string;
  trigger: SessionTranscriptCompactBoundaryEvent["payload"]["boundary"]["trigger"];
  tier?: SessionTranscriptCompactBoundaryEvent["payload"]["boundary"]["tier"];
  compactedMessageCount: number;
  preCompactTokenCount: number;
  postCompactTokenCount: number;
  tokenDelta: number;
  fallbackUsed: boolean;
  rebuildTriggered: boolean;
  preservedSegment: SessionTranscriptCompactBoundaryEvent["payload"]["boundary"]["preservedSegment"];
  summaryRefKind?: "compaction_state" | "partial_compaction_view";
  partialCompactionViewId?: string;
};

export type SessionTimelinePartialCompactionItem = {
  kind: "partial_compaction";
  eventId: string;
  eventType: "partial_compaction_view_recorded";
  createdAt: number;
  boundaryId?: string;
  partialViewId: string;
  direction: SessionTranscriptPartialCompactionViewEvent["payload"]["view"]["direction"];
  pivotMessageId: string;
  pivotMessageCount: number;
  compactedMessageCount: number;
  summaryMessageCount: number;
  originalTokens: number;
  compactedTokens: number;
  tokenDelta: number;
  fallbackUsed: boolean;
  tier?: SessionTranscriptPartialCompactionViewEvent["payload"]["view"]["tier"];
};

export type SessionTimelineRestoreResultItem = {
  kind: "restore_result";
  createdAt: number;
  source: SessionRestoreView["diagnostics"]["source"];
  transcriptEventCount: number;
  transcriptMessageEventCount: number;
  relinkApplied: boolean;
  fallbackToRaw: boolean;
  fallbackReason?: SessionRestoreView["diagnostics"]["fallbackReason"];
  boundaryId?: string;
  partialViewId?: string;
  rawMessageCount: number;
  compactedViewCount: number;
  canonicalExtractionCount: number;
};

export type SessionTimelineItem =
  | SessionTimelineMessageItem
  | SessionTimelineCompactBoundaryItem
  | SessionTimelinePartialCompactionItem
  | SessionTimelineRestoreResultItem;

export type SessionTimelineProjection = {
  manifest: {
    schemaVersion: number;
    conversationId: string;
    projectedAt: number;
    source: "conversation.timeline.get";
  };
  items: SessionTimelineItem[];
  summary: {
    eventCount: number;
    itemCount: number;
    messageCount: number;
    compactBoundaryCount: number;
    partialCompactionCount: number;
    latestEventAt?: number;
    restore: {
      source: SessionRestoreView["diagnostics"]["source"];
      relinkApplied: boolean;
      fallbackToRaw: boolean;
      fallbackReason?: SessionRestoreView["diagnostics"]["fallbackReason"];
    };
    boundaryId?: string;
    partialViewId?: string;
  };
  warnings: SessionTimelineWarningCode[];
};

type BuildSessionTimelineProjectionInput = {
  conversationId: string;
  transcriptEvents: SessionTranscriptEvent[];
  restore: SessionRestoreView;
  projectedAt?: number;
  previewChars?: number;
};

function isMessageEvent(event: SessionTranscriptEvent): event is SessionTranscriptMessageEvent {
  return event.type === "user_message_accepted" || event.type === "assistant_message_finalized";
}

function isCompactBoundaryEvent(event: SessionTranscriptEvent): event is SessionTranscriptCompactBoundaryEvent {
  return event.type === "compact_boundary_recorded";
}

function isPartialCompactionEvent(event: SessionTranscriptEvent): event is SessionTranscriptPartialCompactionViewEvent {
  return event.type === "partial_compaction_view_recorded";
}

function buildPreview(content: string, limit: number): {
  preview: string;
  length: number;
  truncated: boolean;
} {
  const normalized = content.trim();
  if (normalized.length <= limit) {
    return {
      preview: normalized,
      length: content.length,
      truncated: false,
    };
  }
  return {
    preview: `${normalized.slice(0, limit)}...`,
    length: content.length,
    truncated: true,
  };
}

function buildWarnings(
  transcriptEvents: SessionTranscriptEvent[],
  restore: SessionRestoreView,
): SessionTimelineWarningCode[] {
  const warnings: SessionTimelineWarningCode[] = [];
  if (transcriptEvents.length === 0) {
    warnings.push("transcript_empty");
  }
  if (restore.diagnostics.source === "conversation_fallback") {
    warnings.push("conversation_fallback_used");
  }
  if (restore.diagnostics.fallbackReason === "no_boundary") {
    warnings.push("no_compact_boundary");
  }
  if (restore.diagnostics.fallbackToRaw) {
    warnings.push("restore_fallback_to_raw");
  }
  return warnings;
}

export function buildSessionTimelineProjection(
  input: BuildSessionTimelineProjectionInput,
): SessionTimelineProjection {
  const previewChars = typeof input.previewChars === "number" && Number.isFinite(input.previewChars)
    ? Math.max(24, Math.floor(input.previewChars))
    : 120;
  const projectedAt = typeof input.projectedAt === "number" && Number.isFinite(input.projectedAt)
    ? Math.max(0, Math.floor(input.projectedAt))
    : Date.now();
  const latestEventAt = input.transcriptEvents.length > 0
    ? input.transcriptEvents[input.transcriptEvents.length - 1]?.createdAt
    : undefined;

  const items: SessionTimelineItem[] = [];
  for (const event of input.transcriptEvents) {
    if (isMessageEvent(event)) {
      const preview = buildPreview(event.payload.message.content, previewChars);
      items.push({
        kind: "message",
        eventId: event.eventId,
        eventType: event.type,
        createdAt: event.createdAt,
        messageId: event.payload.message.id,
        role: event.payload.message.role,
        contentPreview: preview.preview,
        contentLength: preview.length,
        truncated: preview.truncated,
        agentId: event.payload.message.agentId,
      });
      continue;
    }

    if (isCompactBoundaryEvent(event)) {
      items.push({
        kind: "compact_boundary",
        eventId: event.eventId,
        eventType: event.type,
        createdAt: event.createdAt,
        boundaryId: event.payload.boundary.id,
        trigger: event.payload.boundary.trigger,
        tier: event.payload.boundary.tier,
        compactedMessageCount: event.payload.boundary.compactedMessageCount,
        preCompactTokenCount: event.payload.boundary.preCompactTokenCount,
        postCompactTokenCount: event.payload.boundary.postCompactTokenCount,
        tokenDelta: event.payload.boundary.preCompactTokenCount - event.payload.boundary.postCompactTokenCount,
        fallbackUsed: event.payload.boundary.fallbackUsed,
        rebuildTriggered: event.payload.boundary.rebuildTriggered,
        preservedSegment: { ...event.payload.boundary.preservedSegment },
        summaryRefKind: event.payload.summaryRef?.kind,
        partialCompactionViewId: event.payload.summaryRef?.partialCompactionViewId,
      });
      continue;
    }

    if (!isPartialCompactionEvent(event)) {
      continue;
    }

    const view = event.payload.view;
    const tokenDelta = view.originalTokens - view.compactedTokens;
    items.push({
      kind: "partial_compaction",
      eventId: event.eventId,
      eventType: event.type,
      createdAt: event.createdAt,
      boundaryId: event.payload.boundaryId,
      partialViewId: view.id,
      direction: view.direction,
      pivotMessageId: view.pivotMessageId,
      pivotMessageCount: view.pivotMessageCount,
      compactedMessageCount: view.compactedMessageCount,
      summaryMessageCount: view.summaryMessages.length,
      originalTokens: view.originalTokens,
      compactedTokens: view.compactedTokens,
      tokenDelta,
      fallbackUsed: view.fallbackUsed,
      tier: view.tier,
    });
  }

  items.push({
    kind: "restore_result",
    createdAt: latestEventAt ?? projectedAt,
    source: input.restore.diagnostics.source,
    transcriptEventCount: input.restore.diagnostics.transcriptEventCount,
    transcriptMessageEventCount: input.restore.diagnostics.transcriptMessageEventCount,
    relinkApplied: input.restore.diagnostics.relinkApplied,
    fallbackToRaw: input.restore.diagnostics.fallbackToRaw,
    fallbackReason: input.restore.diagnostics.fallbackReason,
    boundaryId: input.restore.boundary?.id,
    partialViewId: input.restore.partialView?.id,
    rawMessageCount: input.restore.rawMessages.length,
    compactedViewCount: input.restore.compactedView.length,
    canonicalExtractionCount: input.restore.canonicalExtractionView.length,
  });

  const messageCount = input.transcriptEvents.filter(isMessageEvent).length;
  const compactBoundaryCount = input.transcriptEvents.filter(isCompactBoundaryEvent).length;
  const partialCompactionCount = input.transcriptEvents.filter(isPartialCompactionEvent).length;

  return {
    manifest: {
      schemaVersion: SESSION_TIMELINE_SCHEMA_VERSION,
      conversationId: input.conversationId,
      projectedAt,
      source: "conversation.timeline.get",
    },
    items,
    summary: {
      eventCount: input.transcriptEvents.length,
      itemCount: items.length,
      messageCount,
      compactBoundaryCount,
      partialCompactionCount,
      latestEventAt,
      restore: {
        source: input.restore.diagnostics.source,
        relinkApplied: input.restore.diagnostics.relinkApplied,
        fallbackToRaw: input.restore.diagnostics.fallbackToRaw,
        fallbackReason: input.restore.diagnostics.fallbackReason,
      },
      boundaryId: input.restore.boundary?.id,
      partialViewId: input.restore.partialView?.id,
    },
    warnings: buildWarnings(input.transcriptEvents, input.restore),
  };
}
