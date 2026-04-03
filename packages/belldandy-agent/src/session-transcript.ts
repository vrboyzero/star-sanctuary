import * as fsp from "node:fs/promises";

export const SESSION_TRANSCRIPT_SCHEMA_VERSION = 1;

export type SessionTranscriptEventType =
  | "user_message_accepted"
  | "assistant_message_finalized"
  | "compact_boundary_recorded"
  | "partial_compaction_view_recorded";

export type SessionTranscriptMessagePayload = {
  message: {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    agentId?: string;
    clientContext?: {
      sentAtMs?: number;
      timezoneOffsetMinutes?: number;
      locale?: string;
    };
  };
  conversation?: {
    agentId?: string;
    channel?: string;
  };
};

export type SessionTranscriptMessageEvent = {
  schemaVersion: number;
  eventId: string;
  conversationId: string;
  type: "user_message_accepted" | "assistant_message_finalized";
  createdAt: number;
  payload: SessionTranscriptMessagePayload;
};

export type SessionTranscriptCompactBoundaryPayload = {
  boundary: {
    id: string;
    trigger: "request" | "manual" | "partial_up_to" | "partial_from";
    createdAt: number;
    summaryStateVersion: number;
    preCompactTokenCount: number;
    postCompactTokenCount: number;
    compactedMessageCount: number;
    tier?: "rolling" | "archival";
    fallbackUsed: boolean;
    rebuildTriggered: boolean;
    preservedSegment: {
      headMessageId?: string;
      anchorId?: string;
      tailMessageId?: string;
      preservedMessageCount: number;
    };
  };
  summaryRef?: {
    kind: "compaction_state" | "partial_compaction_view";
    partialCompactionViewId?: string;
  };
};

export type SessionTranscriptCompactBoundaryEvent = {
  schemaVersion: number;
  eventId: string;
  conversationId: string;
  type: "compact_boundary_recorded";
  createdAt: number;
  payload: SessionTranscriptCompactBoundaryPayload;
};

export type SessionTranscriptPartialCompactionViewPayload = {
  boundaryId?: string;
  view: {
    id: string;
    direction: "from";
    pivotMessageId: string;
    pivotMessageCount: number;
    compactedMessageCount: number;
    summaryMessages: Array<{ role: "user" | "assistant"; content: string }>;
    createdAt: number;
    originalTokens: number;
    compactedTokens: number;
    fallbackUsed: boolean;
    tier?: "rolling" | "archival";
  };
};

export type SessionTranscriptPartialCompactionViewEvent = {
  schemaVersion: number;
  eventId: string;
  conversationId: string;
  type: "partial_compaction_view_recorded";
  createdAt: number;
  payload: SessionTranscriptPartialCompactionViewPayload;
};

export type SessionTranscriptEvent = SessionTranscriptMessageEvent | SessionTranscriptCompactBoundaryEvent | SessionTranscriptPartialCompactionViewEvent | {
  schemaVersion: number;
  eventId: string;
  conversationId: string;
  type: Exclude<SessionTranscriptEventType, SessionTranscriptMessageEvent["type"] | SessionTranscriptCompactBoundaryEvent["type"] | SessionTranscriptPartialCompactionViewEvent["type"]>;
  createdAt: number;
  payload: Record<string, unknown>;
};

export const sessionTranscriptAsyncFs = {
  appendFile(filePath: string, data: string, encoding: BufferEncoding): Promise<void> {
    return fsp.appendFile(filePath, data, encoding);
  },
  readFile(filePath: string, encoding: BufferEncoding): Promise<string> {
    return fsp.readFile(filePath, encoding);
  },
};

let sessionTranscriptEventIdCounter = 0;

function createSessionTranscriptEventId(createdAt: number): string {
  sessionTranscriptEventIdCounter += 1;
  return `stx_${createdAt}_${sessionTranscriptEventIdCounter.toString(36)}`;
}

export function createSessionTranscriptMessageEvent(input: {
  conversationId: string;
  message: SessionTranscriptMessagePayload["message"];
  conversation?: SessionTranscriptMessagePayload["conversation"];
  createdAt?: number;
}): SessionTranscriptMessageEvent {
  const createdAt = typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
    ? Math.max(0, Math.floor(input.createdAt))
    : Date.now();

  return {
    schemaVersion: SESSION_TRANSCRIPT_SCHEMA_VERSION,
    eventId: createSessionTranscriptEventId(createdAt),
    conversationId: input.conversationId,
    type: input.message.role === "user" ? "user_message_accepted" : "assistant_message_finalized",
    createdAt,
    payload: {
      message: { ...input.message },
      conversation: input.conversation ? { ...input.conversation } : undefined,
    },
  };
}

export function createSessionTranscriptCompactBoundaryEvent(input: {
  conversationId: string;
  boundary: SessionTranscriptCompactBoundaryPayload["boundary"];
  summaryRef?: SessionTranscriptCompactBoundaryPayload["summaryRef"];
  createdAt?: number;
}): SessionTranscriptCompactBoundaryEvent {
  const createdAt = typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
    ? Math.max(0, Math.floor(input.createdAt))
    : Date.now();

  return {
    schemaVersion: SESSION_TRANSCRIPT_SCHEMA_VERSION,
    eventId: createSessionTranscriptEventId(createdAt),
    conversationId: input.conversationId,
    type: "compact_boundary_recorded",
    createdAt,
    payload: {
      boundary: {
        ...input.boundary,
        preservedSegment: { ...input.boundary.preservedSegment },
      },
      summaryRef: input.summaryRef ? { ...input.summaryRef } : undefined,
    },
  };
}

export function createSessionTranscriptPartialCompactionViewEvent(input: {
  conversationId: string;
  boundaryId?: string;
  view: SessionTranscriptPartialCompactionViewPayload["view"];
  createdAt?: number;
}): SessionTranscriptPartialCompactionViewEvent {
  const createdAt = typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
    ? Math.max(0, Math.floor(input.createdAt))
    : Date.now();

  return {
    schemaVersion: SESSION_TRANSCRIPT_SCHEMA_VERSION,
    eventId: createSessionTranscriptEventId(createdAt),
    conversationId: input.conversationId,
    type: "partial_compaction_view_recorded",
    createdAt,
    payload: {
      boundaryId: input.boundaryId,
      view: {
        ...input.view,
        summaryMessages: input.view.summaryMessages.map((message) => ({ ...message })),
      },
    },
  };
}

export function serializeSessionTranscriptEvent(event: SessionTranscriptEvent): string {
  return JSON.stringify(event) + "\n";
}

export async function appendSessionTranscriptEvent(
  filePath: string,
  event: SessionTranscriptEvent,
): Promise<void> {
  await sessionTranscriptAsyncFs.appendFile(filePath, serializeSessionTranscriptEvent(event), "utf-8");
}

export async function readSessionTranscriptFile(filePath?: string): Promise<SessionTranscriptEvent[]> {
  if (!filePath) return [];

  try {
    const raw = await sessionTranscriptAsyncFs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as SessionTranscriptEvent;
          if (!parsed || typeof parsed !== "object") return [];
          if (typeof parsed.conversationId !== "string" || typeof parsed.type !== "string") return [];
          return [parsed];
        } catch {
          return [];
        }
      });
  } catch (err) {
    const fsErr = err as NodeJS.ErrnoException;
    if (fsErr.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}
