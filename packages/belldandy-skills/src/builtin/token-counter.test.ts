import { describe, expect, it, vi } from "vitest";

import type { ITokenCounterService, ToolContext } from "../types.js";
import { tokenCounterStartTool, tokenCounterStopTool } from "./token-counter.js";

function createFakeTokenCounter(): ITokenCounterService {
  const counters = new Map<string, { startTime: number; inputBase: number; outputBase: number }>();
  let totalInput = 0;
  let totalOutput = 0;

  return {
    start(name: string) {
      if (counters.has(name)) {
        throw new Error(`Token counter "${name}" already running`);
      }
      counters.set(name, {
        startTime: Date.now(),
        inputBase: totalInput,
        outputBase: totalOutput,
      });
    },
    stop(name: string) {
      const counter = counters.get(name);
      if (!counter) {
        throw new Error(`Token counter "${name}" not found`);
      }
      counters.delete(name);
      const inputTokens = totalInput - counter.inputBase;
      const outputTokens = totalOutput - counter.outputBase;
      return {
        name,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: Math.max(0, Date.now() - counter.startTime),
      };
    },
    list() {
      return Array.from(counters.keys());
    },
    notifyUsage(inputTokens: number, outputTokens: number) {
      totalInput += inputTokens;
      totalOutput += outputTokens;
    },
    cleanup() {
      const leaked = Array.from(counters.keys());
      counters.clear();
      return leaked;
    },
  };
}

function createBaseContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-token-counter",
    workspaceRoot: "E:/project/star-sanctuary",
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 30_000,
      maxResponseBytes: 1024 * 1024,
    },
    ...overrides,
  };
}

describe("token counter tools", () => {
  it("token_counter_start should start a named counter", async () => {
    const tokenCounter = createFakeTokenCounter();

    const result = await tokenCounterStartTool.execute({ name: "analysis" }, createBaseContext({ tokenCounter }));

    expect(result.success).toBe(true);
    expect(result.output).toContain('Token counter "analysis" started.');
    expect(tokenCounter.list()).toEqual(["analysis"]);
  });

  it("token_counter_start should reject duplicate names", async () => {
    const tokenCounter = createFakeTokenCounter();
    tokenCounter.start("analysis");

    const result = await tokenCounterStartTool.execute({ name: "analysis" }, createBaseContext({ tokenCounter }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('already running');
  });

  it("token_counter_start should fail gracefully when service is unavailable", async () => {
    const result = await tokenCounterStartTool.execute({ name: "analysis" }, createBaseContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Token counter service not available");
  });

  it("token_counter_stop should return stats, broadcast result, and persist to conversationStore", async () => {
    const tokenCounter = createFakeTokenCounter();
    const broadcast = vi.fn();
    const recordTaskTokenResult = vi.fn();
    const conversationStore = {
      setRoomMembersCache: vi.fn(),
      getRoomMembersCache: vi.fn(),
      clearRoomMembersCache: vi.fn(),
      recordTaskTokenResult,
      getTaskTokenResults: vi.fn(() => []),
    };

    tokenCounter.start("analysis");
    tokenCounter.notifyUsage(12, 8);

    const result = await tokenCounterStopTool.execute(
      { name: "analysis" },
      createBaseContext({
        tokenCounter,
        broadcast,
        conversationStore,
      }),
    );

    expect(result.success).toBe(true);
    expect(JSON.parse(result.output)).toMatchObject({
      name: "analysis",
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    });
    expect(recordTaskTokenResult).toHaveBeenCalledWith("conv-token-counter", expect.objectContaining({
      name: "analysis",
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    }));
    expect(broadcast).toHaveBeenCalledWith("token.counter.result", expect.objectContaining({
      conversationId: "conv-token-counter",
      name: "analysis",
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
    }));
  });

  it("token_counter_stop should reject missing counters", async () => {
    const tokenCounter = createFakeTokenCounter();

    const result = await tokenCounterStopTool.execute({ name: "missing" }, createBaseContext({ tokenCounter }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it("token_counter_stop should fail gracefully when service is unavailable", async () => {
    const result = await tokenCounterStopTool.execute({ name: "analysis" }, createBaseContext());

    expect(result.success).toBe(false);
    expect(result.error).toContain("Token counter service not available");
  });
});
