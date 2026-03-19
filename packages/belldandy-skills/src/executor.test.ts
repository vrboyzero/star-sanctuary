import { describe, it, expect, vi } from "vitest";
import type { Tool, ToolCallRequest, ToolContext, ToolCallResult } from "./types.js";
import { ToolExecutor, DEFAULT_POLICY } from "./executor.js";

// Mock 工具：echo
const echoTool: Tool = {
  definition: {
    name: "echo",
    description: "返回输入的消息",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "要返回的消息" },
      },
      required: ["message"],
    },
  },
  async execute(args, context): Promise<ToolCallResult> {
    return {
      id: "",
      name: "echo",
      success: true,
      output: `Echo: ${args.message}`,
      durationMs: 0,
    };
  },
};

// Mock 工具：总是失败
const failTool: Tool = {
  definition: {
    name: "fail",
    description: "总是失败的工具",
    parameters: { type: "object", properties: {} },
  },
  async execute(args, context): Promise<ToolCallResult> {
    throw new Error("故意失败");
  },
};

describe("ToolExecutor", () => {
  it("should register and execute tools", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
    });

    const request: ToolCallRequest = {
      id: "req-1",
      name: "echo",
      arguments: { message: "Hello" },
    };

    const result = await executor.execute(request, "conv-1");

    expect(result.success).toBe(true);
    expect(result.output).toBe("Echo: Hello");
    expect(result.id).toBe("req-1");
    expect(result.name).toBe("echo");
  });

  it("should return error for unknown tool", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
    });

    const request: ToolCallRequest = {
      id: "req-2",
      name: "unknown",
      arguments: {},
    };

    const result = await executor.execute(request, "conv-1");

    expect(result.success).toBe(false);
    expect(result.error).toContain("未知工具");
  });

  it("should catch and report tool execution errors", async () => {
    const executor = new ToolExecutor({
      tools: [failTool],
      workspaceRoot: "/tmp/test",
    });

    const request: ToolCallRequest = {
      id: "req-3",
      name: "fail",
      arguments: {},
    };

    const result = await executor.execute(request, "conv-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("故意失败");
  });

  it("should return tool definitions for model", () => {
    const executor = new ToolExecutor({
      tools: [echoTool, failTool],
      workspaceRoot: "/tmp/test",
    });

    const definitions = executor.getDefinitions();

    expect(definitions).toHaveLength(2);
    expect(definitions[0].type).toBe("function");
    expect(definitions[0].function.name).toBe("echo");
  });

  it("should filter tool definitions by agent whitelist", () => {
    const executor = new ToolExecutor({
      tools: [echoTool, failTool],
      workspaceRoot: "/tmp/test",
      isToolAllowedForAgent: (toolName, agentId) => {
        if (agentId === "researcher") {
          return toolName === "echo";
        }
        return true;
      },
    });

    const definitions = executor.getDefinitions("researcher");

    expect(definitions).toHaveLength(1);
    expect(definitions[0].function.name).toBe("echo");
  });

  it("should call audit logger", async () => {
    const auditLogs: any[] = [];
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
      auditLogger: (log) => auditLogs.push(log),
    });

    await executor.execute(
      { id: "req-4", name: "echo", arguments: { message: "test" } },
      "conv-audit"
    );

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].toolName).toBe("echo");
    expect(auditLogs[0].conversationId).toBe("conv-audit");
    expect(auditLogs[0].success).toBe(true);
  });

  it("should sanitize sensitive arguments in audit log", async () => {
    const auditLogs: any[] = [];
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
      auditLogger: (log) => auditLogs.push(log),
    });

    await executor.execute(
      { id: "req-5", name: "echo", arguments: { message: "hi", api_key: "secret123" } },
      "conv-1"
    );

    expect(auditLogs[0].arguments.api_key).toBe("[REDACTED]");
    expect(auditLogs[0].arguments.message).toBe("hi");
  });

  it("should execute multiple tools in parallel", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
    });

    const requests: ToolCallRequest[] = [
      { id: "req-a", name: "echo", arguments: { message: "A" } },
      { id: "req-b", name: "echo", arguments: { message: "B" } },
    ];

    const results = await executor.executeAll(requests, "conv-batch");

    expect(results).toHaveLength(2);
    expect(results[0].output).toBe("Echo: A");
    expect(results[1].output).toBe("Echo: B");
  });

  it("should reject tool execution outside agent whitelist", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool, failTool],
      workspaceRoot: "/tmp/test",
      isToolAllowedForAgent: (toolName, agentId) => {
        if (agentId === "researcher") {
          return toolName === "echo";
        }
        return true;
      },
    });

    const result = await executor.execute(
      { id: "req-6", name: "fail", arguments: {} },
      "conv-1",
      "researcher",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("不允许给 Agent \"researcher\" 使用");
  });

  it("should keep default behavior when no whitelist is configured", () => {
    const executor = new ToolExecutor({
      tools: [echoTool, failTool],
      workspaceRoot: "/tmp/test",
      isToolAllowedForAgent: () => true,
    });

    const definitions = executor.getDefinitions("default");

    expect(definitions).toHaveLength(2);
  });

  it("should keep always enabled tools available even when disabled by runtime config", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool, failTool],
      workspaceRoot: "/tmp/test",
      alwaysEnabledTools: ["echo"],
      isToolDisabled: (toolName) => toolName === "echo" || toolName === "fail",
    });

    const definitions = executor.getDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0].function.name).toBe("echo");

    const result = await executor.execute(
      { id: "req-7", name: "echo", arguments: { message: "still works" } },
      "conv-1",
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe("Echo: still works");
  });

  it("should still enforce agent whitelist for always enabled tools", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
      alwaysEnabledTools: ["echo"],
      isToolDisabled: (toolName) => toolName === "echo",
      isToolAllowedForAgent: (_toolName, agentId) => agentId !== "blocked-agent",
    });

    const result = await executor.execute(
      { id: "req-8", name: "echo", arguments: { message: "denied" } },
      "conv-1",
      "blocked-agent",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("不允许给 Agent \"blocked-agent\" 使用");
  });

  it("should support silent replacement for dynamic tools", () => {
    const warns: string[] = [];
    const replacementTool: Tool = {
      ...echoTool,
      async execute(args): Promise<ToolCallResult> {
        return {
          id: "",
          name: "echo",
          success: true,
          output: `Replacement: ${args.message}`,
          durationMs: 0,
        };
      },
    };
    const executor = new ToolExecutor({
      tools: [echoTool],
      workspaceRoot: "/tmp/test",
      logger: {
        info() {},
        warn(message) { warns.push(message); },
        error() {},
      },
    });

    executor.registerTool(replacementTool, { silentReplace: true });

    expect(warns).toHaveLength(0);
    expect(executor.hasTool("echo")).toBe(true);
  });
});

describe("DEFAULT_POLICY", () => {
  it("should have sensible defaults", () => {
    expect(DEFAULT_POLICY.deniedPaths).toContain(".env");
    expect(DEFAULT_POLICY.deniedPaths).toContain(".git");
    expect(DEFAULT_POLICY.maxTimeoutMs).toBeGreaterThan(0);
    expect(DEFAULT_POLICY.maxResponseBytes).toBeGreaterThan(0);
  });
});
