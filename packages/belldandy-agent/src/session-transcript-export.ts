import type { SessionRestoreView } from "./session-restore.js";
import type { SessionTranscriptEvent } from "./session-transcript.js";

export const SESSION_TRANSCRIPT_EXPORT_SCHEMA_VERSION = 1;

export type SessionTranscriptExportRedactionMode = "internal" | "shareable" | "metadata_only";

export type SessionTranscriptExportBundle = {
  manifest: {
    schemaVersion: number;
    conversationId: string;
    exportedAt: number;
    source: "conversation.transcript.export";
    redactionMode: SessionTranscriptExportRedactionMode;
  };
  events: Array<Record<string, unknown>>;
  restore: {
    rawMessages: Array<Record<string, unknown>>;
    compactedView: Array<Record<string, unknown>>;
    canonicalExtractionView: Array<Record<string, unknown>>;
    diagnostics: SessionRestoreView["diagnostics"];
  };
  summary: {
    eventCount: number;
    messageEventCount: number;
    compactBoundaryCount: number;
    partialCompactionViewCount: number;
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
  redaction: {
    mode: SessionTranscriptExportRedactionMode;
    contentRedacted: boolean;
    notes: string[];
  };
};

type BuildSessionTranscriptExportBundleInput = {
  conversationId: string;
  transcriptEvents: SessionTranscriptEvent[];
  restore: SessionRestoreView;
  mode?: SessionTranscriptExportRedactionMode;
  exportedAt?: number;
};

function buildContentProjection(content: string | undefined, mode: SessionTranscriptExportRedactionMode): Record<string, unknown> {
  const value = typeof content === "string" ? content : "";
  const normalized = value.trim();

  if (mode === "internal") {
    return {
      content: value,
      contentLength: value.length,
    };
  }

  if (mode === "shareable") {
    const preview = normalized.length > 280 ? `${normalized.slice(0, 280)}...` : normalized;
    return {
      contentPreview: preview,
      contentLength: value.length,
      contentTruncated: preview !== normalized,
    };
  }

  return {
    contentLength: value.length,
    contentRedacted: value.length > 0,
  };
}

function redactMessageLike(
  message: {
    id?: string;
    role: "user" | "assistant";
    content: string;
    timestamp?: number;
    agentId?: string;
    clientContext?: {
      sentAtMs?: number;
      timezoneOffsetMinutes?: number;
      locale?: string;
    };
  },
  mode: SessionTranscriptExportRedactionMode,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(message.id ? { id: message.id } : {}),
    role: message.role,
    ...(typeof message.timestamp === "number" ? { timestamp: message.timestamp } : {}),
    ...buildContentProjection(message.content, mode),
  };

  if (mode === "internal") {
    if (message.agentId) base.agentId = message.agentId;
    if (message.clientContext) {
      base.clientContext = { ...message.clientContext };
    }
  }

  return base;
}

function redactRestoreViewMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  mode: SessionTranscriptExportRedactionMode,
): Array<Record<string, unknown>> {
  return messages.map((message) => redactMessageLike(message, mode));
}

function redactTranscriptEvent(
  event: SessionTranscriptEvent,
  mode: SessionTranscriptExportRedactionMode,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    schemaVersion: event.schemaVersion,
    eventId: event.eventId,
    conversationId: event.conversationId,
    type: event.type,
    createdAt: event.createdAt,
  };

  if (event.type === "user_message_accepted" || event.type === "assistant_message_finalized") {
    return {
      ...base,
      payload: {
        message: redactMessageLike(event.payload.message, mode),
        ...(mode === "internal" && event.payload.conversation ? { conversation: { ...event.payload.conversation } } : {}),
      },
    };
  }

  if (event.type === "compact_boundary_recorded") {
    return {
      ...base,
      payload: {
        boundary: {
          ...event.payload.boundary,
          preservedSegment: { ...event.payload.boundary.preservedSegment },
        },
        ...(event.payload.summaryRef ? { summaryRef: { ...event.payload.summaryRef } } : {}),
      },
    };
  }

  if (event.type === "partial_compaction_view_recorded") {
    return {
      ...base,
      payload: {
        ...(event.payload.boundaryId ? { boundaryId: event.payload.boundaryId } : {}),
        view: {
          ...event.payload.view,
          summaryMessages: redactRestoreViewMessages(event.payload.view.summaryMessages, mode),
        },
      },
    };
  }

  return {
    ...base,
    payload: { ...event.payload },
  };
}

function buildRedactionNotes(mode: SessionTranscriptExportRedactionMode): string[] {
  if (mode === "internal") {
    return [
      "Full transcript and restore text are preserved for internal debugging.",
    ];
  }
  if (mode === "shareable") {
    return [
      "clientContext and conversation helper metadata are removed.",
      "Message text is converted to short previews for safer sharing.",
    ];
  }
  return [
    "Message text content is removed and only structural metadata is preserved.",
  ];
}

export function buildSessionTranscriptExportBundle(
  input: BuildSessionTranscriptExportBundleInput,
): SessionTranscriptExportBundle {
  const mode = input.mode ?? "internal";
  const exportedAt = typeof input.exportedAt === "number" && Number.isFinite(input.exportedAt)
    ? Math.max(0, Math.floor(input.exportedAt))
    : Date.now();
  const messageEventCount = input.transcriptEvents.filter((event) => event.type === "user_message_accepted" || event.type === "assistant_message_finalized").length;
  const compactBoundaryCount = input.transcriptEvents.filter((event) => event.type === "compact_boundary_recorded").length;
  const partialCompactionViewCount = input.transcriptEvents.filter((event) => event.type === "partial_compaction_view_recorded").length;
  const latestEventAt = input.transcriptEvents.length > 0 ? input.transcriptEvents[input.transcriptEvents.length - 1]?.createdAt : undefined;

  return {
    manifest: {
      schemaVersion: SESSION_TRANSCRIPT_EXPORT_SCHEMA_VERSION,
      conversationId: input.conversationId,
      exportedAt,
      source: "conversation.transcript.export",
      redactionMode: mode,
    },
    events: input.transcriptEvents.map((event) => redactTranscriptEvent(event, mode)),
    restore: {
      rawMessages: input.restore.rawMessages.map((message) => redactMessageLike(message, mode)),
      compactedView: redactRestoreViewMessages(input.restore.compactedView, mode),
      canonicalExtractionView: redactRestoreViewMessages(input.restore.canonicalExtractionView, mode),
      diagnostics: { ...input.restore.diagnostics },
    },
    summary: {
      eventCount: input.transcriptEvents.length,
      messageEventCount,
      compactBoundaryCount,
      partialCompactionViewCount,
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
    redaction: {
      mode,
      contentRedacted: mode !== "internal",
      notes: buildRedactionNotes(mode),
    },
  };
}
