import type { GatewayResFrame } from "@belldandy/protocol";
import type { ToolExecutor } from "@belldandy/skills";
import { listToolContractsV2 } from "@belldandy/skills";

import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";
import {
  buildEmptyToolContractV2Summary,
  buildToolContractV2Observability,
} from "./tool-contract-v2-observability.js";

type AgentContractsQueryRuntimeMethod = "agent.contracts.get";

export type QueryRuntimeAgentContractsContext = {
  requestId: string;
  toolExecutor?: ToolExecutor;
  runtimeObserver?: QueryRuntimeObserver<AgentContractsQueryRuntimeMethod>;
};

export async function handleAgentContractsGetWithQueryRuntime(
  ctx: QueryRuntimeAgentContractsContext,
  params: {
    agentId?: string;
    conversationId?: string;
    taskId?: string;
  },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "agent.contracts.get" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      detail: {
        hasToolExecutor: Boolean(ctx.toolExecutor),
      },
    });

    if (!ctx.toolExecutor) {
      queryRuntime.mark("completed", {
        detail: {
          returnedEmptyContracts: true,
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: true,
        payload: {
          requested: {
            agentId: params.agentId,
            conversationId: params.conversationId,
            taskId: params.taskId,
          },
          summary: buildEmptyToolContractV2Summary(),
          contracts: {},
        },
      };
    }

    queryRuntime.mark("request_validated", {
      detail: {
        agentId: params.agentId,
        conversationId: params.conversationId,
        taskId: params.taskId,
      },
    });

    const registeredToolNames = ctx.toolExecutor.getRegisteredToolNames();
    const contracts = listToolContractsV2(ctx.toolExecutor.getRegisteredToolContracts());
    const observability = buildToolContractV2Observability({
      contracts,
      registeredToolNames,
    });
    const summary = observability.summary;

    queryRuntime.mark("runtime_report_built", {
      detail: {
        registeredToolCount: registeredToolNames.length,
        contractV2Count: contracts.length,
        missingV2Count: summary.missingV2Count,
      },
    });

    queryRuntime.mark("completed", {
      detail: {
        contractV2Count: contracts.length,
      },
    });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        requested: {
          agentId: params.agentId,
          conversationId: params.conversationId,
          taskId: params.taskId,
        },
        summary,
        contracts: observability.contracts,
      },
    };
  });
}
