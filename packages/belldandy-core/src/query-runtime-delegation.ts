import type { AgentRegistry } from "@belldandy/agent";
import type { GatewayResFrame } from "@belldandy/protocol";

import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";
import { buildSubTaskLaunchExplainability } from "./subtask-launch-explainability.js";
import type { SubTaskRuntimeStore } from "./task-runtime.js";
import { buildSubTaskResultEnvelope } from "./subtask-result-envelope.js";

type DelegationInspectQueryRuntimeMethod = "delegation.inspect.get";

export type QueryRuntimeDelegationContext = {
  requestId: string;
  subTaskRuntimeStore?: SubTaskRuntimeStore;
  agentRegistry?: Pick<AgentRegistry, "getProfile">;
  runtimeObserver?: QueryRuntimeObserver<DelegationInspectQueryRuntimeMethod>;
};

export async function handleDelegationInspectGetWithQueryRuntime(
  ctx: QueryRuntimeDelegationContext,
  params: { taskId: string },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "delegation.inspect.get" as const,
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
        error: { code: "not_available", message: "Delegation inspect runtime not available" },
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
        error: { code: "not_found", message: `Delegation task not found: ${params.taskId}` },
      };
    }

    const delegation = item.launchSpec?.delegation;
    const resultEnvelope = buildSubTaskResultEnvelope(item);
    const launchExplainability = buildSubTaskLaunchExplainability(item, ctx.agentRegistry);

    queryRuntime.mark("runtime_report_built", {
      conversationId: item.parentConversationId,
      detail: {
        taskId: item.id,
        hasDelegation: Boolean(delegation),
        hasLaunchExplainability: Boolean(launchExplainability),
        hasResultEnvelope: Boolean(resultEnvelope),
        aggregationMode: delegation?.aggregationMode,
        source: delegation?.source,
        status: item.status,
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
        requested: {
          taskId: params.taskId,
        },
        task: {
          id: item.id,
          parentConversationId: item.parentConversationId,
          agentId: item.agentId,
          status: item.status,
        },
        delegation: delegation ?? null,
        launchExplainability: launchExplainability ?? null,
        explainability: launchExplainability ?? null,
        resultEnvelope,
      },
    };
  });
}
