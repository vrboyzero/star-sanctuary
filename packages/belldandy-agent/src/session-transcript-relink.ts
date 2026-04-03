import { buildCompactedMessages, type CompactionState } from "./compaction.js";
import type {
  SessionTranscriptCompactBoundaryEvent,
  SessionTranscriptEvent,
  SessionTranscriptPartialCompactionViewEvent,
} from "./session-transcript.js";

export type TranscriptRelinkBoundary = SessionTranscriptCompactBoundaryEvent["payload"]["boundary"];

export type TranscriptRelinkPartialCompactionView = SessionTranscriptPartialCompactionViewEvent["payload"]["view"];

export type TranscriptRelinkArtifacts = {
  boundary?: TranscriptRelinkBoundary;
  partialView?: TranscriptRelinkPartialCompactionView;
};

export type TranscriptRelinkInput = {
  messages: Array<{ id?: string; role: "user" | "assistant"; content: string }>;
  compactionState: CompactionState;
  boundary?: TranscriptRelinkBoundary;
  partialView?: TranscriptRelinkPartialCompactionView;
};

export type TranscriptRelinkResult = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  boundary: TranscriptRelinkBoundary;
  partialView?: TranscriptRelinkPartialCompactionView;
};

type PreservedSegmentMatch = {
  headIndex: number;
  tailIndex: number;
  anchorIndex?: number;
};

function isCompactBoundaryEvent(event: SessionTranscriptEvent): event is SessionTranscriptCompactBoundaryEvent {
  return event.type === "compact_boundary_recorded";
}

function isPartialCompactionViewEvent(event: SessionTranscriptEvent): event is SessionTranscriptPartialCompactionViewEvent {
  return event.type === "partial_compaction_view_recorded";
}

function findMessageIndex(
  messages: Array<{ id?: string }>,
  messageId?: string,
): number {
  if (!messageId) return -1;
  return messages.findIndex((message) => message.id === messageId);
}

function matchPreservedSegment(
  messages: Array<{ id?: string }>,
  boundary: TranscriptRelinkBoundary,
): PreservedSegmentMatch | undefined {
  const { headMessageId, tailMessageId, anchorId, preservedMessageCount } = boundary.preservedSegment;
  const expectedLength = Math.max(0, Math.floor(preservedMessageCount));

  if (expectedLength <= 0) {
    return {
      headIndex: -1,
      tailIndex: -1,
      anchorIndex: anchorId ? findMessageIndex(messages, anchorId) : undefined,
    };
  }

  const headIndex = findMessageIndex(messages, headMessageId);
  const tailIndex = findMessageIndex(messages, tailMessageId);
  if (headIndex < 0 || tailIndex < 0 || headIndex > tailIndex) {
    return undefined;
  }

  if (tailIndex - headIndex + 1 !== expectedLength) {
    return undefined;
  }

  const anchorIndex = anchorId ? findMessageIndex(messages, anchorId) : undefined;
  if (anchorId && typeof anchorIndex !== "number") {
    return undefined;
  }

  return {
    headIndex,
    tailIndex,
    anchorIndex,
  };
}

export function deriveTranscriptRelinkArtifacts(events: SessionTranscriptEvent[]): TranscriptRelinkArtifacts {
  const boundaries = events.filter(isCompactBoundaryEvent);
  if (boundaries.length === 0) {
    return {};
  }

  const latestBoundaryEvent = boundaries[boundaries.length - 1];
  const boundary = latestBoundaryEvent.payload.boundary;

  if (boundary.trigger !== "partial_from") {
    return { boundary };
  }

  const partialViewEvent = events
    .filter(isPartialCompactionViewEvent)
    .filter((event) => !event.payload.boundaryId || event.payload.boundaryId === boundary.id)
    .at(-1);

  return {
    boundary,
    partialView: partialViewEvent?.payload.view,
  };
}

export function buildTranscriptRelinkedHistory(input: TranscriptRelinkInput): TranscriptRelinkResult | undefined {
  const { messages, compactionState, boundary, partialView } = input;
  if (!boundary || messages.length === 0) {
    return undefined;
  }

  const rawHistory = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const segmentMatch = matchPreservedSegment(messages, boundary);
  if (!segmentMatch) {
    return undefined;
  }

  if (boundary.trigger === "partial_from") {
    if (!partialView || partialView.direction !== "from") {
      return undefined;
    }

    if (segmentMatch.headIndex !== 0) {
      return undefined;
    }

    if (typeof segmentMatch.anchorIndex === "number" && segmentMatch.anchorIndex !== segmentMatch.tailIndex) {
      return undefined;
    }

    const preservedPrefix = rawHistory.slice(segmentMatch.headIndex, segmentMatch.tailIndex + 1);
    const compactedSpan = Math.max(0, Math.floor(boundary.compactedMessageCount));
    const tailStartIndex = segmentMatch.tailIndex + 1 + compactedSpan;
    const tailHistory = tailStartIndex < rawHistory.length ? rawHistory.slice(tailStartIndex) : [];

    return {
      history: [
        ...preservedPrefix,
        ...partialView.summaryMessages.map((message) => ({ ...message })),
        ...tailHistory,
      ],
      boundary,
      partialView,
    };
  }

  if (!compactionState.rollingSummary && !compactionState.archivalSummary) {
    return undefined;
  }

  const recentMessages = segmentMatch.headIndex >= 0
    ? rawHistory.slice(segmentMatch.headIndex)
    : rawHistory;

  return {
    history: buildCompactedMessages(compactionState, recentMessages),
    boundary,
  };
}
