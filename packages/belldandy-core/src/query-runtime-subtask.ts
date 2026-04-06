import fs from "node:fs/promises";

import type { AgentRegistry } from "@belldandy/agent";
import type { GatewayResFrame } from "@belldandy/protocol";

import { buildAgentLaunchExplainability } from "./agent-launch-explainability.js";
import type { ConversationPromptSnapshotArtifact } from "./conversation-prompt-snapshot.js";
import type { SubTaskRecord, SubTaskRuntimeStore } from "./task-runtime.js";
import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";
import { buildSubTaskLaunchExplainability } from "./subtask-launch-explainability.js";
import { buildSubTaskResultEnvelope } from "./subtask-result-envelope.js";
import { resolveResidentStateBindingViewForAgent } from "./resident-state-binding.js";

type SubTaskQueryRuntimeMethod =
  | "subtask.list"
  | "subtask.get"
  | "subtask.stop"
  | "subtask.archive";

export type QueryRuntimeSubTaskContext = {
  requestId: string;
  stateDir?: string;
  subTaskRuntimeStore?: SubTaskRuntimeStore;
  agentRegistry?: Pick<AgentRegistry, "getProfile">;
  loadPromptSnapshot?: (input: {
    conversationId: string;
    runId?: string;
  }) => Promise<ConversationPromptSnapshotArtifact | undefined>;
  stopSubTask?: (taskId: string, reason?: string) => Promise<SubTaskRecord | undefined>;
  runtimeObserver?: QueryRuntimeObserver<SubTaskQueryRuntimeMethod>;
};

export async function handleSubTaskListWithQueryRuntime(
  ctx: QueryRuntimeSubTaskContext,
  params: {
    conversationId?: string;
    includeArchived: boolean;
  },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "subtask.list" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      conversationId: params.conversationId,
      detail: {
        available: Boolean(ctx.subTaskRuntimeStore),
      },
    });

    if (!ctx.subTaskRuntimeStore) {
      queryRuntime.mark("completed", {
        conversationId: params.conversationId,
        detail: {
          available: false,
          returnedEmptyList: true,
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: true,
        payload: {
          items: [],
        },
      };
    }

    queryRuntime.mark("request_validated", {
      conversationId: params.conversationId,
      detail: {
        includeArchived: params.includeArchived,
      },
    });

    const items = await ctx.subTaskRuntimeStore.listTasks(
      params.conversationId,
      { includeArchived: params.includeArchived },
    );

    queryRuntime.mark("task_listed", {
      conversationId: params.conversationId,
      detail: {
        count: items.length,
        includeArchived: params.includeArchived,
      },
    });
    queryRuntime.mark("completed", {
      conversationId: params.conversationId,
      detail: {
        count: items.length,
      },
    });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        conversationId: params.conversationId ?? null,
        includeArchived: params.includeArchived,
        items,
      },
    };
  });
}

export async function handleSubTaskGetWithQueryRuntime(
  ctx: QueryRuntimeSubTaskContext,
  params: { taskId: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "subtask.get" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      detail: {
        available: Boolean(ctx.subTaskRuntimeStore),
      },
    });

    if (!ctx.subTaskRuntimeStore) {
      queryRuntime.mark("completed", {
        detail: {
          code: "not_available",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_available", message: "Subtask runtime not available" },
      };
    }

    queryRuntime.mark("request_validated", {
      detail: {
        taskId: params.taskId,
      },
    });

    const item = await ctx.subTaskRuntimeStore.getTask(params.taskId);
    if (!item) {
      queryRuntime.mark("completed", {
        detail: {
          taskId: params.taskId,
          code: "not_found",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_found", message: `Subtask not found: ${params.taskId}` },
      };
    }

    queryRuntime.mark("task_loaded", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
        status: item.status,
        archived: Boolean(item.archivedAt),
      },
    });

    let outputContent: string | undefined;
    if (item.outputPath) {
      try {
        outputContent = await fs.readFile(item.outputPath, "utf-8");
        queryRuntime.mark("task_output_loaded", {
          conversationId: item.parentConversationId,
          detail: {
            taskId: item.id,
            outputChars: outputContent.length,
          },
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
          throw error;
        }
      }
    }

    const launchExplainability = buildSubTaskLaunchExplainability(item, ctx.agentRegistry);
    const promptSnapshotView = await loadSubTaskPromptSnapshotView(ctx, item, queryRuntime);

    queryRuntime.mark("completed", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
        hasLaunchExplainability: Boolean(launchExplainability),
        hasPromptSnapshot: Boolean(promptSnapshotView),
      },
    });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        item: {
          ...item,
        },
        launchExplainability: launchExplainability ?? null,
        promptSnapshotView,
        resultEnvelope: buildSubTaskResultEnvelope(item),
        outputContent,
      },
    };
  });
}

async function loadSubTaskPromptSnapshotView(
  ctx: QueryRuntimeSubTaskContext,
  item: SubTaskRecord,
  queryRuntime: QueryRuntime<"subtask.get">,
): Promise<{
  snapshot: ConversationPromptSnapshotArtifact;
  launchExplainability?: ReturnType<typeof buildAgentLaunchExplainability> | null;
  residentStateBinding?: ReturnType<typeof resolveResidentStateBindingViewForAgent> | null;
} | null> {
  if (!ctx.loadPromptSnapshot || !ctx.stateDir || !item.sessionId) {
    return null;
  }

  const snapshot = await ctx.loadPromptSnapshot({
    conversationId: item.sessionId,
  });
  if (!snapshot) {
    queryRuntime.mark("task_prompt_snapshot_missing", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
        sessionId: item.sessionId,
      },
    });
    return null;
  }

  const agentId = typeof snapshot.manifest.agentId === "string" && snapshot.manifest.agentId.trim()
    ? snapshot.manifest.agentId.trim()
    : item.agentId;
  const launchExplainability = buildAgentLaunchExplainability({
    agentRegistry: ctx.agentRegistry,
    agentId,
    profileId: item.launchSpec?.profileId,
    launchSpec: item.launchSpec,
  });
  const residentStateBinding = resolveResidentStateBindingViewForAgent(
    ctx.stateDir,
    ctx.agentRegistry,
    agentId,
  );

  queryRuntime.mark("task_prompt_snapshot_loaded", {
    conversationId: item.parentConversationId,
    detail: {
      taskId: item.id,
      snapshotConversationId: snapshot.manifest.conversationId,
      ...(snapshot.manifest.runId ? { runId: snapshot.manifest.runId } : {}),
      messageCount: snapshot.summary.messageCount,
    },
  });

  return {
    snapshot,
    launchExplainability: launchExplainability ?? null,
    residentStateBinding: residentStateBinding ?? null,
  };
}

export async function handleSubTaskStopWithQueryRuntime(
  ctx: QueryRuntimeSubTaskContext,
  params: { taskId: string; reason?: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "subtask.stop" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      detail: {
        hasStore: Boolean(ctx.subTaskRuntimeStore),
        hasStopHandler: Boolean(ctx.stopSubTask),
      },
    });

    if (!ctx.subTaskRuntimeStore || !ctx.stopSubTask) {
      queryRuntime.mark("completed", {
        detail: {
          code: "not_available",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_available", message: "Subtask stop not available" },
      };
    }

    queryRuntime.mark("request_validated", {
      detail: {
        taskId: params.taskId,
        hasReason: Boolean(params.reason),
      },
    });

    const current = await ctx.subTaskRuntimeStore.getTask(params.taskId);
    if (!current) {
      queryRuntime.mark("completed", {
        detail: {
          taskId: params.taskId,
          code: "not_found",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_found", message: `Subtask not found: ${params.taskId}` },
      };
    }

    queryRuntime.mark("task_loaded", {
      conversationId: current.parentConversationId,
      detail: {
        taskId: current.id,
        status: current.status,
      },
    });

    if (current.status === "done" || current.status === "error" || current.status === "timeout" || current.status === "stopped") {
      queryRuntime.mark("completed", {
        conversationId: current.parentConversationId,
        detail: {
          taskId: current.id,
          code: "invalid_state",
          status: current.status,
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "invalid_state", message: `Subtask already finished: ${current.status}` },
      };
    }

    const item = await ctx.stopSubTask(params.taskId, params.reason);
    if (!item) {
      queryRuntime.mark("completed", {
        conversationId: current.parentConversationId,
        detail: {
          taskId: current.id,
          code: "stop_failed",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "stop_failed", message: `Failed to stop subtask: ${params.taskId}` },
      };
    }

    queryRuntime.mark("task_stopped", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
        status: item.status,
        stopReason: item.stopReason,
      },
    });
    queryRuntime.mark("completed", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
      },
    });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        item,
      },
    };
  });
}

export async function handleSubTaskArchiveWithQueryRuntime(
  ctx: QueryRuntimeSubTaskContext,
  params: { taskId: string; reason?: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "subtask.archive" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      detail: {
        available: Boolean(ctx.subTaskRuntimeStore),
      },
    });

    if (!ctx.subTaskRuntimeStore) {
      queryRuntime.mark("completed", {
        detail: {
          code: "not_available",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_available", message: "Subtask archive not available" },
      };
    }

    queryRuntime.mark("request_validated", {
      detail: {
        taskId: params.taskId,
        hasReason: Boolean(params.reason),
      },
    });

    const current = await ctx.subTaskRuntimeStore.getTask(params.taskId);
    if (!current) {
      queryRuntime.mark("completed", {
        detail: {
          taskId: params.taskId,
          code: "not_found",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_found", message: `Subtask not found: ${params.taskId}` },
      };
    }

    queryRuntime.mark("task_loaded", {
      conversationId: current.parentConversationId,
      detail: {
        taskId: current.id,
        status: current.status,
        archived: Boolean(current.archivedAt),
      },
    });

    if (current.status === "pending" || current.status === "running") {
      queryRuntime.mark("completed", {
        conversationId: current.parentConversationId,
        detail: {
          taskId: current.id,
          code: "invalid_state",
          status: current.status,
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "invalid_state", message: `Cannot archive active subtask: ${current.status}` },
      };
    }

    const item = await ctx.subTaskRuntimeStore.archiveTask(params.taskId, params.reason);
    if (!item) {
      queryRuntime.mark("completed", {
        conversationId: current.parentConversationId,
        detail: {
          taskId: current.id,
          code: "archive_failed",
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "archive_failed", message: `Failed to archive subtask: ${params.taskId}` },
      };
    }

    queryRuntime.mark("task_archived", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
        archivedAt: item.archivedAt,
      },
    });
    queryRuntime.mark("completed", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
      },
    });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        item,
      },
    };
  });
}
