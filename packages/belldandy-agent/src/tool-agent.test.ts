import { describe, expect, it } from "vitest";

import { sanitizeResponsesToolDefinitions } from "./tool-agent.js";

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
