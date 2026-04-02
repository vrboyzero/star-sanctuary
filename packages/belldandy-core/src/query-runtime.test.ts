import { expect, test } from "vitest";

import type { BelldandyAgent } from "@belldandy/agent";
import { runAgentToCompletionWithLifecycle, runAgentWithLifecycle } from "./query-runtime-agent-run.js";
import { notifyConversationToolEvent } from "./query-runtime-side-effects.js";
import { QueryRuntime } from "./query-runtime.js";
import { QueryRuntimeTraceStore } from "./query-runtime-trace.js";

test("query runtime emits lifecycle stages for successful execution", async () => {
  const stages: string[] = [];
  const traceIds: string[] = [];
  const runtime = new QueryRuntime({
    method: "message.send",
    observer: (event) => {
      stages.push(event.stage);
      traceIds.push(event.traceId);
    },
  });

  const result = await runtime.run(async (instance) => {
    instance.mark("request_validated", { conversationId: "conv-query-runtime" });
    instance.mark("agent_running", { conversationId: "conv-query-runtime" });
    instance.mark("completed", { conversationId: "conv-query-runtime" });
    return "ok";
  });

  expect(result).toBe("ok");
  expect(stages).toEqual(["started", "request_validated", "agent_running", "completed"]);
  expect(new Set(traceIds).size).toBe(1);
});

test("query runtime emits failed stage when executor throws", async () => {
  const stages: string[] = [];
  const runtime = new QueryRuntime({
    method: "message.send",
    observer: (event) => {
      stages.push(event.stage);
    },
  });

  await expect(runtime.run(async () => {
    throw new Error("boom");
  })).rejects.toThrow("boom");

  expect(stages).toEqual(["started", "failed"]);
});

test("query runtime trace store retains recent lifecycle summary for diagnostics", async () => {
  const traceStore = new QueryRuntimeTraceStore({
    maxTraces: 4,
    maxStagesPerTrace: 3,
  });
  const runtime = new QueryRuntime({
    method: "conversation.digest.refresh",
    traceId: "trace-refresh-1",
    observer: traceStore.createObserver<"conversation.digest.refresh">(),
  });

  await runtime.run(async (instance) => {
    instance.mark("request_validated", { conversationId: "conv-trace-store" });
    instance.mark("digest_refreshed", {
      conversationId: "conv-trace-store",
      detail: { updated: true },
    });
    instance.mark("completed", { conversationId: "conv-trace-store" });
  });

  const summary = traceStore.getSummary();
  expect(summary.observerEnabled).toBe(true);
  expect(summary.totalObservedEvents).toBe(4);
  expect(summary.activeTraceCount).toBe(0);
  expect(summary.traces).toHaveLength(1);
  expect(summary.traces[0]).toMatchObject({
    traceId: "trace-refresh-1",
    method: "conversation.digest.refresh",
    status: "completed",
    conversationId: "conv-trace-store",
    latestStage: "completed",
    stageCount: 4,
  });
  expect(summary.traces[0]?.stages.map((item) => item.stage)).toEqual([
    "request_validated",
    "digest_refreshed",
    "completed",
  ]);
  expect(summary.traces[0]?.stages[1]?.detail).toMatchObject({ updated: true });
});

test("agent run helper captures tool lifecycle and usage summary", async () => {
  const toolCalls: string[] = [];
  const toolResults: Array<{ name: string; success: boolean }> = [];
  const toolEvents: string[] = [];
  const agent: BelldandyAgent = {
    async *run(input) {
      yield {
        type: "tool_call" as const,
        id: "tool-call-1",
        name: "tool.alpha",
        arguments: { mode: "apply" },
      };
      notifyConversationToolEvent(input.conversationId, {
        kind: "tool_config_updated",
      });
      yield {
        type: "tool_result" as const,
        id: "tool-call-1",
        name: "tool.alpha",
        success: true,
        output: "ok",
      };
      yield {
        type: "usage" as const,
        systemPromptTokens: 2,
        contextTokens: 5,
        inputTokens: 11,
        outputTokens: 7,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        modelCalls: 1,
      };
      yield {
        type: "final" as const,
        text: "done",
      };
    },
  };

  const result = await runAgentToCompletionWithLifecycle(agent, {
    conversationId: "conv-agent-run-helper",
    runInput: {
      conversationId: "conv-agent-run-helper",
      text: "hello",
    },
    onToolCall: (item) => {
      toolCalls.push(item.name);
    },
    onToolResult: (item) => {
      toolResults.push({
        name: item.name,
        success: item.success,
      });
    },
    onToolEvent: (detail) => {
      toolEvents.push(String(detail.kind ?? ""));
    },
  });

  expect(result).toMatchObject({
    finalText: "done",
    latestUsage: {
      inputTokens: 11,
      outputTokens: 7,
    },
    toolCallCount: 1,
    toolResultCount: 1,
    toolEventCount: 1,
  });
  expect(result.durationMs).toBeGreaterThanOrEqual(0);
  expect(toolCalls).toEqual(["tool.alpha"]);
  expect(toolResults).toEqual([{ name: "tool.alpha", success: true }]);
  expect(toolEvents).toEqual(["tool_config_updated"]);
});

test("agent stream helper preserves status delta and final summary for streaming runtimes", async () => {
  const statuses: string[] = [];
  const deltas: string[] = [];
  const finals: string[] = [];
  const agent: BelldandyAgent = {
    async *run() {
      yield {
        type: "status" as const,
        status: "running",
      };
      yield {
        type: "delta" as const,
        delta: "hel",
      };
      yield {
        type: "delta" as const,
        delta: "lo",
      };
      yield {
        type: "final" as const,
        text: "hello",
      };
      yield {
        type: "status" as const,
        status: "done",
      };
    },
  };

  const result = await runAgentWithLifecycle(agent, {
    conversationId: "conv-stream-helper",
    runInput: {
      conversationId: "conv-stream-helper",
      text: "ignored",
    },
    onStatus: (item) => {
      statuses.push(item.status);
    },
    onDelta: (item) => {
      deltas.push(item.delta);
    },
    onFinal: (item) => {
      finals.push(item.text);
    },
  });

  expect(statuses).toEqual(["running", "done"]);
  expect(deltas).toEqual(["hel", "lo"]);
  expect(finals).toEqual(["hello"]);
  expect(result).toMatchObject({
    receivedFinal: true,
    fullText: "hello",
    finalText: "hello",
    latestStatus: "done",
    statusCount: 2,
    deltaCount: 2,
  });
});
