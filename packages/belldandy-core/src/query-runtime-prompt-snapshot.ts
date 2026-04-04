import type { GatewayResFrame } from "@belldandy/protocol";

import type { ConversationPromptSnapshotArtifact } from "./conversation-prompt-snapshot.js";
import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";

export type QueryRuntimePromptSnapshotContext = {
  requestId: string;
  runtimeObserver?: QueryRuntimeObserver<"conversation.prompt_snapshot.get">;
  loadPromptSnapshot: (input: {
    conversationId: string;
    runId?: string;
  }) => Promise<ConversationPromptSnapshotArtifact | undefined>;
};

export async function handleConversationPromptSnapshotGetWithQueryRuntime(
  ctx: QueryRuntimePromptSnapshotContext,
  params: {
    conversationId: string;
    runId?: string;
  },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "conversation.prompt_snapshot.get" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("request_validated", {
      conversationId: params.conversationId,
      detail: {
        ...(params.runId ? { runId: params.runId } : {}),
      },
    });

    const snapshot = await ctx.loadPromptSnapshot({
      conversationId: params.conversationId,
      runId: params.runId,
    });
    if (!snapshot) {
      queryRuntime.mark("completed", {
        conversationId: params.conversationId,
        detail: {
          code: "not_found",
          ...(params.runId ? { runId: params.runId } : {}),
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: {
          code: "not_found",
          message: params.runId
            ? `Prompt snapshot not found for conversation "${params.conversationId}" and run "${params.runId}".`
            : `Prompt snapshot not found for conversation "${params.conversationId}".`,
        },
      };
    }

    queryRuntime.mark("prompt_snapshot_loaded", {
      conversationId: params.conversationId,
      detail: {
        ...(snapshot.manifest.runId ? { runId: snapshot.manifest.runId } : {}),
        messageCount: snapshot.summary.messageCount,
        systemPromptChars: snapshot.summary.systemPromptChars,
      },
    });
    queryRuntime.mark("completed", { conversationId: params.conversationId });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        snapshot,
      },
    };
  });
}
