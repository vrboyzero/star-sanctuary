import crypto from "node:crypto";

import type { ConversationRestoreViewLike, Tool, ToolCallResult } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import {
  formatConversationAccessDenied,
  formatMessageLines,
  formatRestoreSummary,
  formatTimelineItems,
  formatTimestamp,
  formatTranscriptSummary,
  isConversationAllowed,
  normalizeOptionalString,
  normalizeAllowedConversationKinds,
  parsePositiveInt,
  truncateText,
} from "./shared.js";

type TaskTokenResultLike = {
  name: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  createdAt: number;
  auto?: boolean;
};

type LoadedDeferredToolsReader = {
  getLoadedToolNames?(conversationId: string): string[];
};

async function ensureConversationExists(
  conversationId: string,
  context: Parameters<Tool["execute"]>[1],
): Promise<boolean> {
  if (conversationId === context.conversationId) return true;
  const conversationStore = context.conversationStore;
  if (!conversationStore?.listPersistedConversations) return true;
  const conversations = await conversationStore.listPersistedConversations({
    conversationIdPrefix: conversationId,
  });
  return conversations.some((item) => item.conversationId === conversationId);
}

function renderMetaView(input: {
  limit: number;
  restore: ConversationRestoreViewLike;
  taskTokenResults: TaskTokenResultLike[];
  loadedDeferredTools: string[];
}): string {
  const lines = [
    "Conversation Meta",
    ...formatRestoreSummary(input.restore),
    `latest_message_at=${formatTimestamp(input.restore.rawMessages.at(-1)?.timestamp)}`,
    `task_token_results=${input.taskTokenResults.length}`,
    `loaded_deferred_tools=${input.loadedDeferredTools.length}`,
    "",
    "Recent Messages:",
    ...formatMessageLines(input.restore.rawMessages, input.limit),
  ];
  if (input.loadedDeferredTools.length > 0) {
    lines.push("", "Loaded Deferred Tools:");
    lines.push(...input.loadedDeferredTools.slice(0, input.limit).map((item) => `- ${item}`));
  }
  if (input.taskTokenResults.length > 0) {
    lines.push("", "Recent Token Results:");
    lines.push(...input.taskTokenResults.slice(0, input.limit).map((item) =>
      `- [${formatTimestamp(item.createdAt)}] ${item.name}: total=${item.totalTokens} input=${item.inputTokens} output=${item.outputTokens} duration_ms=${item.durationMs}`,
    ));
  }
  return lines.join("\n");
}

function renderRestoreView(input: {
  limit: number;
  restore: ConversationRestoreViewLike;
}): string {
  return [
    "Conversation Restore",
    ...formatRestoreSummary(input.restore),
    "",
    "Raw Messages:",
    ...formatMessageLines(input.restore.rawMessages, input.limit),
    "",
    "Compacted View:",
    ...input.restore.compactedView.slice(-input.limit).map((message, index, arr) =>
      `- ${arr.length - index}. ${message.role}: ${truncateText(message.content, 240)}`),
    "",
    "Canonical Extraction View:",
    ...input.restore.canonicalExtractionView.slice(-input.limit).map((message, index, arr) =>
      `- ${arr.length - index}. ${message.role}: ${truncateText(message.content, 240)}`),
  ].join("\n");
}

export const conversationReadTool: Tool = withToolContract({
  definition: {
    name: "conversation_read",
    description: "Read a persisted conversation using a lightweight meta view or deeper restore/timeline/transcript views.",
    parameters: {
      type: "object",
      properties: {
        conversation_id: {
          type: "string",
          description: "Exact conversation ID to inspect.",
        },
        view: {
          type: "string",
          enum: ["meta", "restore", "timeline", "transcript"],
          description: "Which conversation view to read. Default: meta.",
        },
        limit: {
          type: "number",
          description: "Maximum number of messages/items to render in the output. Default: 10.",
        },
        preview_chars: {
          type: "number",
          description: "Preview length for timeline message items. Default: 120.",
        },
        transcript_mode: {
          type: "string",
          enum: ["internal", "shareable", "metadata_only"],
          description: "Redaction mode for transcript export. Default: internal.",
        },
      },
      required: ["conversation_id"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "conversation_read";
    const conversationStore = context.conversationStore;

    if (!conversationStore) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: "Conversation store is not available in the current runtime.",
        durationMs: Date.now() - start,
      };
    }

    try {
      const conversationId = normalizeOptionalString(args.conversation_id);
      if (!conversationId) {
        return {
          id,
          name,
          success: false,
          output: "",
          error: "conversation_id is required.",
          durationMs: Date.now() - start,
        };
      }
      const allowedConversationKinds = normalizeAllowedConversationKinds(context.allowedConversationKinds);
      if (!isConversationAllowed(conversationId, allowedConversationKinds)) {
        return {
          id,
          name,
          success: false,
          output: "",
          error: formatConversationAccessDenied(conversationId, allowedConversationKinds),
          durationMs: Date.now() - start,
        };
      }
      if (!(await ensureConversationExists(conversationId, context))) {
        return {
          id,
          name,
          success: false,
          output: "",
          error: `Conversation not found: ${conversationId}`,
          durationMs: Date.now() - start,
        };
      }

      const view = normalizeOptionalString(args.view) ?? "meta";
      const limit = parsePositiveInt(args.limit, 10, { min: 1, max: 20 });
      const previewChars = parsePositiveInt(args.preview_chars, 120, { min: 24, max: 500 });
      const transcriptMode = normalizeOptionalString(args.transcript_mode) as "internal" | "shareable" | "metadata_only" | undefined;
      if (!["meta", "restore", "timeline", "transcript"].includes(view)) {
        throw new Error(`Unsupported conversation view: ${view}`);
      }

      if (view === "timeline") {
        if (!conversationStore.buildConversationTimeline) {
          throw new Error("Conversation timeline view is not available in the current runtime.");
        }
        const timeline = await conversationStore.buildConversationTimeline(conversationId, { previewChars });
        return {
          id,
          name,
          success: true,
          output: [
            "Conversation Timeline",
            `conversation=${timeline.manifest.conversationId}`,
            `projected_at=${formatTimestamp(timeline.manifest.projectedAt)}`,
            `event_count=${timeline.summary.eventCount}`,
            `item_count=${timeline.summary.itemCount}`,
            `message_count=${timeline.summary.messageCount}`,
            `compact_boundaries=${timeline.summary.compactBoundaryCount}`,
            `partial_views=${timeline.summary.partialCompactionCount}`,
            `restore_source=${timeline.summary.restore.source}`,
            `relink_applied=${timeline.summary.restore.relinkApplied ? "yes" : "no"}`,
            `fallback_to_raw=${timeline.summary.restore.fallbackToRaw ? "yes" : "no"}`,
            `warnings=${timeline.warnings.join(", ") || "-"}`,
            "",
            "Recent Timeline Items:",
            ...formatTimelineItems(timeline, limit),
          ].join("\n"),
          durationMs: Date.now() - start,
        };
      }

      if (view === "transcript") {
        if (!conversationStore.buildConversationTranscriptExport) {
          throw new Error("Conversation transcript export is not available in the current runtime.");
        }
        const bundle = await conversationStore.buildConversationTranscriptExport(conversationId, {
          ...(transcriptMode ? { mode: transcriptMode } : {}),
        });
        return {
          id,
          name,
          success: true,
          output: [
            "Conversation Transcript Export",
            ...formatTranscriptSummary(bundle, limit),
            "",
            "Recent Restore Raw Messages:",
            ...bundle.restore.rawMessages.slice(-limit).map((message, index, arr) =>
              `- ${arr.length - index}. ${truncateText(JSON.stringify(message), 260)}`),
          ].join("\n"),
          durationMs: Date.now() - start,
        };
      }

      if (!conversationStore.buildConversationRestoreView) {
        throw new Error("Conversation restore view is not available in the current runtime.");
      }
      const restore = await conversationStore.buildConversationRestoreView(conversationId);

      if (view === "restore") {
        return {
          id,
          name,
          success: true,
          output: renderRestoreView({ limit, restore }),
          durationMs: Date.now() - start,
        };
      }

      const taskTokenResults = conversationStore.getTaskTokenResults(conversationId, limit);
      const loadedDeferredTools = (conversationStore as LoadedDeferredToolsReader).getLoadedToolNames?.(conversationId) ?? [];
      return {
        id,
        name,
        success: true,
        output: renderMetaView({
          limit,
          restore,
          taskTokenResults,
          loadedDeferredTools,
        }),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  },
}, {
  family: "memory",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["local-safe", "web-safe"],
  activityDescription: "Read persisted conversation history from the current workspace runtime",
  resultSchema: {
    kind: "text",
    description: "Conversation history text for meta, restore, timeline, or transcript views.",
  },
  outputPersistencePolicy: "conversation",
});
