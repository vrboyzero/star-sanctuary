import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ToolEnabledAgent,
  applyPrependContextToInput,
  buildToolTranscriptMessageForHistory,
  compactReasoningContentForHistory,
  sanitizeAssistantToolCallHistoryContent,
  sanitizeResponsesToolDefinitions,
} from "./tool-agent.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeResponsesToolDefinitions", () => {
  it("should remove unsupported schema keywords for responses tools", () => {
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "timer",
          description: "Timer tool",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string" },
              payload: {
                type: "object",
                oneOf: [{ required: ["a"] }],
                properties: {
                  a: { type: "string" },
                },
              },
            },
            required: ["action"],
            oneOf: [{ required: ["action", "payload"] }],
            $schema: "https://json-schema.org/draft/2020-12/schema",
            definitions: {
              internal: {
                type: "object",
              },
            },
          },
        },
      },
    ];

    const sanitized = sanitizeResponsesToolDefinitions(tools);

    expect(sanitized[0].function.parameters).toEqual({
      type: "object",
      properties: {
        action: { type: "string" },
        payload: {
          type: "object",
          properties: {
            a: { type: "string" },
          },
        },
      },
      required: ["action"],
    });
  });

  it("should not mutate original tool definitions", () => {
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "timer",
          description: "Timer tool",
          parameters: {
            type: "object",
            oneOf: [{ required: ["action"] }],
            properties: {
              action: { type: "string" },
            },
          },
        },
      },
    ];

    const original = JSON.parse(JSON.stringify(tools));
    const sanitized = sanitizeResponsesToolDefinitions(tools);

    expect(tools).toEqual(original);
    expect(sanitized).not.toBe(tools);
    expect((sanitized[0].function.parameters as any).oneOf).toBeUndefined();
    expect((tools[0].function.parameters as any).oneOf).toBeDefined();
  });
});

describe("applyPrependContextToInput", () => {
  it("prepends context into the first multimodal text part without duplicating a second text part", () => {
    const input = {
      conversationId: "conv-1",
      text: "user prompt",
      content: [
        { type: "text" as const, text: "user prompt" },
        { type: "image_url" as const, image_url: { url: "data:image/png;base64,abc" } },
      ],
    };

    const result = applyPrependContextToInput(input, "<recent-memory>ctx</recent-memory>");

    expect(result.text).toBe("<recent-memory>ctx</recent-memory>\n\nuser prompt");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(2);
    expect(result.content?.[0]).toEqual({
      type: "text",
      text: "<recent-memory>ctx</recent-memory>\n\nuser prompt",
    });
    expect(result.content?.[1]).toEqual(input.content[1]);
  });

  it("inserts a text part when multimodal content has no existing text part", () => {
    const input = {
      conversationId: "conv-2",
      text: "",
      content: [
        { type: "image_url" as const, image_url: { url: "data:image/png;base64,abc" } },
      ],
    };

    const result = applyPrependContextToInput(input, "<auto-recall>ctx</auto-recall>");

    expect(result.text).toBe("<auto-recall>ctx</auto-recall>");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content?.[0]).toEqual({
      type: "text",
      text: "<auto-recall>ctx</auto-recall>",
    });
    expect(result.content?.[1]).toEqual(input.content[0]);
  });
});

describe("tool transcript compaction", () => {
  it("removes tool call protocol blocks from assistant history content", () => {
    const input = [
      "Before",
      "<|tool_calls_section_begin|>{\"name\":\"file_write\"}<|tool_calls_section_end|>",
      "After",
    ].join("\n");

    expect(sanitizeAssistantToolCallHistoryContent(input)).toBe("Before\n\n（正在执行操作）\n\nAfter");
  });

  it("compacts oversized reasoning content for history", () => {
    const content = "A".repeat(80) + "B".repeat(80);
    const compacted = compactReasoningContentForHistory(content, 80);

    expect(compacted).toBeDefined();
    expect(compacted).not.toBe(content);
    expect(compacted).toContain("[reasoning truncated");
    expect(compacted!.length).toBeLessThanOrEqual(120);
  });

  it("drops reasoning content when it mostly duplicates visible assistant text", () => {
    const visible = "先读取配置文件，再整理最近三条任务摘要，最后根据结果生成回复。".repeat(8);
    const reasoning = `${visible}\n\n补充说明：内部思考与可见答复基本一致。`;

    expect(compactReasoningContentForHistory(reasoning, 4000, visible)).toBeUndefined();
  });

  it("runs tool_result_persist hook before writing tool transcript history", () => {
    const result = buildToolTranscriptMessageForHistory({
      toolCallId: "call-1",
      toolName: "file_read",
      output: "X".repeat(50),
      success: true,
      hookRunner: {
        runToolResultPersist: () => ({
          message: {
            role: "tool",
            tool_call_id: "call-1",
            content: "trimmed-output",
          },
        }),
      },
    });

    expect(result).toEqual({
      role: "tool",
      tool_call_id: "call-1",
      content: "trimmed-output",
    });
  });
});

describe("ToolEnabledAgent hook timeouts", () => {
  it("times out before_agent_start instead of hanging the run", async () => {
    const agent = new ToolEnabledAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      timeoutMs: 20,
      toolExecutor: createToolExecutor(),
      hookRunner: {
        runBeforeAgentStart: () => new Promise(() => {}),
        runAgentEnd: async () => {},
        runBeforeToolCall: async () => undefined,
        runAfterToolCall: async () => {},
        runToolResultPersist: () => undefined,
      } as any,
    });

    const items = await collectItems(agent.run({
      conversationId: "conv-before-agent-start-timeout",
      text: "hello",
    }));

    expect(items).toEqual([
      { type: "status", status: "error" },
      expect.objectContaining({
        type: "final",
        text: expect.stringContaining("before_agent_start timed out"),
      }),
    ]);
  });

  it("times out after_tool_call hook and still completes the run", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(createJsonResponse({
      choices: [{
        message: {
          content: "",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: {
              name: "echo",
              arguments: "{}",
            },
          }],
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })).mockResolvedValueOnce(createJsonResponse({
      choices: [{
        message: {
          content: "done",
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const loggerError = vi.fn();
    const toolExecutor = createToolExecutor({
      getDefinitions: () => [{
        type: "function" as const,
        function: {
          name: "echo",
          description: "echo",
          parameters: { type: "object", properties: {} },
        },
      }],
      execute: vi.fn(async () => ({
        id: "call-1",
        name: "echo",
        success: true,
        output: "tool-output",
        durationMs: 0,
      })),
    });
    const agent = new ToolEnabledAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      timeoutMs: 20,
      toolExecutor,
      logger: { error: loggerError },
      hookRunner: {
        runBeforeAgentStart: async () => undefined,
        runAgentEnd: async () => {},
        runBeforeToolCall: async () => undefined,
        runAfterToolCall: () => new Promise(() => {}),
        runToolResultPersist: () => undefined,
      } as any,
    });

    const items = await collectItems(agent.run({
      conversationId: "conv-after-tool-call-timeout",
      text: "use tool",
    }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(items.some((item) => item.type === "tool_call")).toBe(true);
    expect(items.some((item) => item.type === "tool_result")).toBe(true);
    expect(items[items.length - 1]).toEqual({ type: "status", status: "done" });
    expect(loggerError).toHaveBeenCalledWith(
      "agent",
      expect.stringContaining("after_tool_call"),
      undefined,
    );
  });

  it("converts before_tool_call timeout into tool_result failure instead of emitting a stray final", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(createJsonResponse({
      choices: [{
        message: {
          content: "",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: {
              name: "echo",
              arguments: "{}",
            },
          }],
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })).mockResolvedValueOnce(createJsonResponse({
      choices: [{
        message: {
          content: "model recovered",
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const agent = new ToolEnabledAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      timeoutMs: 20,
      toolExecutor: createToolExecutor({
        getDefinitions: () => [{
          type: "function" as const,
          function: {
            name: "echo",
            description: "echo",
            parameters: { type: "object", properties: {} },
          },
        }],
      }),
      hookRunner: {
        runBeforeAgentStart: async () => undefined,
        runAgentEnd: async () => {},
        runBeforeToolCall: () => new Promise(() => {}),
        runAfterToolCall: async () => {},
        runToolResultPersist: () => undefined,
      } as any,
    });

    const items = await collectItems(agent.run({
      conversationId: "conv-before-tool-timeout",
      text: "use tool",
    }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(items.filter((item) => item.type === "final")).toEqual([
      { type: "final", text: "model recovered" },
    ]);
    expect(items).toContainEqual({
      type: "tool_result",
      id: "call-1",
      name: "echo",
      success: false,
      output: "",
      error: expect.stringContaining("before_tool_call timed out"),
    });
    expect(items[items.length - 1]).toEqual({ type: "status", status: "done" });
  });

  it("times out agent_end hook and still clears token counters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(createJsonResponse({
      choices: [{
        message: {
          content: "all done",
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const clearTokenCounter = vi.fn();
    const loggerError = vi.fn();
    const agent = new ToolEnabledAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      timeoutMs: 20,
      toolExecutor: createToolExecutor({ clearTokenCounter }),
      logger: { error: loggerError },
      hookRunner: {
        runBeforeAgentStart: async () => undefined,
        runAgentEnd: () => new Promise(() => {}),
        runBeforeToolCall: async () => undefined,
        runAfterToolCall: async () => {},
        runToolResultPersist: () => undefined,
      } as any,
    });

    const items = await collectItems(agent.run({
      conversationId: "conv-agent-end-timeout",
      text: "finish",
    }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(items[items.length - 1]).toEqual({ type: "status", status: "done" });
    expect(clearTokenCounter).toHaveBeenCalledWith("conv-agent-end-timeout");
    expect(loggerError).toHaveBeenCalledWith(
      "agent",
      expect.stringContaining("agent_end"),
      undefined,
    );
  });

  it("passes launchSpec runtime context into tool definitions and execution", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(createJsonResponse({
      choices: [{
        message: {
          content: "",
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: {
              name: "echo",
              arguments: "{}",
            },
          }],
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })).mockResolvedValueOnce(createJsonResponse({
      choices: [{
        message: {
          content: "done",
        },
      }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    const getDefinitions = vi.fn(() => [{
      type: "function" as const,
      function: {
        name: "echo",
        description: "echo",
        parameters: { type: "object", properties: {} },
      },
    }]);
    const execute = vi.fn(async () => ({
      id: "call-1",
      name: "echo",
      success: true,
      output: "tool-output",
      durationMs: 0,
    }));
    const agent = new ToolEnabledAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      timeoutMs: 20,
      toolExecutor: createToolExecutor({
        getDefinitions,
        execute,
      }),
    });

    const items = await collectItems(agent.run({
      conversationId: "conv-launch-spec",
      text: "use tool",
      meta: {
        _agentLaunchSpec: {
          cwd: "/tmp/worktree",
          toolSet: ["echo"],
          permissionMode: "confirm",
        },
      },
    }));

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(items).toContainEqual({ type: "final", text: "done" });
    expect(getDefinitions).toHaveBeenCalledWith(undefined, "conv-launch-spec", {
      launchSpec: {
        cwd: "/tmp/worktree",
        toolSet: ["echo"],
        permissionMode: "confirm",
      },
    });
    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      "conv-launch-spec",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        launchSpec: {
          cwd: "/tmp/worktree",
          toolSet: ["echo"],
          permissionMode: "confirm",
        },
      },
    );
  });

  it("serializes concurrent runs for the same conversation", async () => {
    let releaseFirstFetch!: () => void;
    const firstFetchPending = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => {
        await firstFetchPending;
        return createJsonResponse({
          choices: [{ message: { content: "first done" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
      })
      .mockResolvedValueOnce(createJsonResponse({
        choices: [{ message: { content: "second done" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }));

    const agent = new ToolEnabledAgent({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-test",
      timeoutMs: 50,
      toolExecutor: createToolExecutor(),
    });

    const run1 = collectItems(agent.run({
      conversationId: "conv-serialized",
      text: "first",
    }));
    await Promise.resolve();
    const run2 = collectItems(agent.run({
      conversationId: "conv-serialized",
      text: "second",
    }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    releaseFirstFetch();
    const [items1, items2] = await Promise.all([run1, run2]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(items1).toContainEqual({ type: "final", text: "first done" });
    expect(items2).toContainEqual({ type: "final", text: "second done" });
  });
});

function createToolExecutor(overrides: Record<string, unknown> = {}): any {
  return {
    getDefinitions: () => [],
    setTokenCounter: vi.fn(),
    clearTokenCounter: vi.fn(),
    execute: vi.fn(),
    ...overrides,
  };
}

async function collectItems(stream: AsyncIterable<any>): Promise<any[]> {
  const items: any[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
