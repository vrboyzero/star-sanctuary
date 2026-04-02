import { describe, it, expect, vi } from "vitest";
import type { Tool, ToolCallRequest, ToolContext, ToolCallResult } from "./types.js";
import { ToolExecutor, DEFAULT_POLICY } from "./executor.js";
import { withToolContract } from "./tool-contract.js";

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

const echoToolWithContract: Tool = withToolContract({
  definition: {
    name: "echo_contract",
    description: "带 contract 的 echo 工具",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "要返回的消息" },
      },
      required: ["message"],
    },
  },
  async execute(args): Promise<ToolCallResult> {
    return {
      id: "",
      name: "echo_contract",
      success: true,
      output: `Echo: ${args.message}`,
      durationMs: 0,
    };
  },
}, {
  family: "other",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway"],
  safeScopes: ["local-safe"],
  activityDescription: "Echo the provided message",
  resultSchema: {
    kind: "text",
    description: "Echo output text.",
  },
  outputPersistencePolicy: "conversation",
});

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

const runtimeAwareTool: Tool = withToolContract({
  definition: {
    name: "runtime_aware",
    description: "回显运行时 launch context",
    parameters: { type: "object", properties: {} },
  },
  async execute(_args, context): Promise<ToolCallResult> {
    return {
      id: "",
      name: "runtime_aware",
      success: true,
      output: JSON.stringify({
        defaultCwd: context.defaultCwd,
        toolSet: context.launchSpec?.toolSet ?? [],
        permissionMode: context.launchSpec?.permissionMode,
      }),
      durationMs: 0,
    };
  },
}, {
  family: "other",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway"],
  safeScopes: ["local-safe"],
  activityDescription: "Echo runtime launch context",
  resultSchema: { kind: "text", description: "runtime launch context json" },
  outputPersistencePolicy: "conversation",
});

const writeToolWithContract: Tool = withToolContract({
  definition: {
    name: "write_contract",
    description: "带 workspace-write contract 的工具",
    parameters: { type: "object", properties: {} },
  },
  async execute(): Promise<ToolCallResult> {
    return {
      id: "",
      name: "write_contract",
      success: true,
      output: "written",
      durationMs: 0,
    };
  },
}, {
  family: "workspace-write",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: true,
  riskLevel: "medium",
  channels: ["gateway"],
  safeScopes: ["local-safe"],
  activityDescription: "Write to workspace",
  resultSchema: { kind: "text", description: "write result" },
  outputPersistencePolicy: "artifact",
});

const execToolWithContract: Tool = withToolContract({
  definition: {
    name: "exec_contract",
    description: "带 command-exec contract 的工具",
    parameters: { type: "object", properties: {} },
  },
  async execute(): Promise<ToolCallResult> {
    return {
      id: "",
      name: "exec_contract",
      success: true,
      output: "executed",
      durationMs: 0,
    };
  },
}, {
  family: "command-exec",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: true,
  riskLevel: "high",
  channels: ["gateway"],
  safeScopes: ["local-safe"],
  activityDescription: "Execute command",
  resultSchema: { kind: "text", description: "exec result" },
  outputPersistencePolicy: "conversation",
});

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

  it("should expose registered tool contracts", () => {
    const executor = new ToolExecutor({
      tools: [echoToolWithContract, echoTool],
      workspaceRoot: "/tmp/test",
    });

    const contracts = executor.getRegisteredToolContracts();

    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.name).toBe("echo_contract");
    expect(contracts[0]?.riskLevel).toBe("low");
  });

  it("should filter visible tool contracts with the same availability rules", () => {
    const executor = new ToolExecutor({
      tools: [echoToolWithContract, failTool],
      workspaceRoot: "/tmp/test",
      isToolAllowedForAgent: (toolName, agentId) => {
        if (agentId === "restricted") {
          return toolName === "echo_contract";
        }
        return true;
      },
    });

    const contracts = executor.getContracts("restricted");

    expect(contracts).toHaveLength(1);
    expect(contracts[0]?.name).toBe("echo_contract");
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

  it("should enforce launchSpec toolSet and inject runtime launch context", async () => {
    const executor = new ToolExecutor({
      tools: [echoTool, failTool, runtimeAwareTool],
      workspaceRoot: "/tmp/test",
    });
    const runtimeContext = {
      launchSpec: {
        cwd: "/tmp/test/subdir",
        toolSet: ["runtime_aware"],
        permissionMode: "confirm",
      },
    };

    const definitions = executor.getDefinitions("default", "conv-1", runtimeContext);
    expect(definitions.map((item) => item.function.name)).toEqual(["runtime_aware"]);
    expect(executor.getToolAvailability("fail", "default", "conv-1", runtimeContext)?.reasonCode).toBe("excluded-by-launch-toolset");

    const blocked = await executor.execute(
      { id: "req-toolset-blocked", name: "echo", arguments: { message: "blocked" } },
      "conv-1",
      "default",
      undefined,
      undefined,
      undefined,
      runtimeContext,
    );
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("toolSet");

    const result = await executor.execute(
      { id: "req-toolset-allowed", name: "runtime_aware", arguments: {} },
      "conv-1",
      "default",
      undefined,
      undefined,
      undefined,
      runtimeContext,
    );

    expect(result.success).toBe(true);
    expect(JSON.parse(result.output)).toEqual({
      defaultCwd: "/tmp/test/subdir",
      toolSet: ["runtime_aware"],
      permissionMode: "confirm",
    });
  });

  it("should enforce launchSpec permissionMode=plan as read-only only", () => {
    const executor = new ToolExecutor({
      tools: [echoToolWithContract, writeToolWithContract],
      workspaceRoot: "/tmp/test",
    });

    const definitions = executor.getDefinitions("default", "conv-1", {
      launchSpec: {
        permissionMode: "plan",
      },
    });

    expect(definitions.map((item) => item.function.name)).toEqual(["echo_contract"]);
    expect(executor.getToolAvailability("write_contract", "default", "conv-1", {
      launchSpec: { permissionMode: "plan" },
    })?.reasonCode).toBe("blocked-by-launch-permission-mode");
  });

  it("should allow workspace writes but still block exec in permissionMode=acceptEdits", () => {
    const executor = new ToolExecutor({
      tools: [writeToolWithContract, execToolWithContract],
      workspaceRoot: "/tmp/test",
    });

    const definitions = executor.getDefinitions("default", "conv-1", {
      launchSpec: {
        permissionMode: "acceptEdits",
      },
    });

    expect(definitions.map((item) => item.function.name)).toEqual(["write_contract"]);
    expect(executor.getToolAvailability("exec_contract", "default", "conv-1", {
      launchSpec: { permissionMode: "acceptEdits" },
    })?.reasonCode).toBe("blocked-by-launch-permission-mode");
  });

  it("should enforce launchSpec role policy by tool family and risk level", () => {
    const executor = new ToolExecutor({
      tools: [echoToolWithContract, writeToolWithContract, execToolWithContract],
      workspaceRoot: "/tmp/test",
    });

    const runtimeContext = {
      launchSpec: {
        role: "researcher" as const,
        allowedToolFamilies: ["other"],
        maxToolRiskLevel: "medium" as const,
        permissionMode: "confirm" as const,
        policySummary: "researcher role: read/search only",
      },
    };

    const definitions = executor.getDefinitions("researcher", "conv-1", runtimeContext);
    expect(definitions.map((item) => item.function.name)).toEqual(["echo_contract"]);
    expect(executor.getToolAvailability("write_contract", "researcher", "conv-1", runtimeContext)?.reasonCode).toBe("blocked-by-launch-role-policy");
    expect(executor.getToolAvailability("exec_contract", "researcher", "conv-1", {
      launchSpec: {
        role: "verifier",
        allowedToolFamilies: ["command-exec"],
        maxToolRiskLevel: "medium",
        permissionMode: "confirm",
      },
    })?.reasonCode).toBe("blocked-by-launch-role-policy");
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
    expect(result.error).toContain("当前 Agent 白名单");
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
    expect(result.error).toContain("当前 Agent 白名单");
  });

  it("should hide and block conversation-scoped tools outside allowed conversations", async () => {
    const goalTool: Tool = {
      definition: {
        name: "goal_init",
        description: "goal bootstrap tool",
        parameters: { type: "object", properties: {} },
      },
      async execute(): Promise<ToolCallResult> {
        return {
          id: "",
          name: "goal_init",
          success: true,
          output: "ok",
          durationMs: 0,
        };
      },
    };

    const executor = new ToolExecutor({
      tools: [echoTool, goalTool],
      workspaceRoot: "/tmp/test",
      isToolAllowedInConversation: (toolName, conversationId) => {
        if (toolName !== "goal_init") return true;
        return conversationId.startsWith("goal:");
      },
    });

    const normalDefinitions = executor.getDefinitions("default", "conv-1");
    expect(normalDefinitions.map((item) => item.function.name)).toEqual(["echo"]);

    const goalDefinitions = executor.getDefinitions("default", "goal:goal_alpha");
    expect(goalDefinitions.map((item) => item.function.name)).toContain("goal_init");

    const blocked = await executor.execute(
      { id: "req-goal-1", name: "goal_init", arguments: {} },
      "conv-1",
    );
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain("当前会话");
  });

  it("should enforce contract access policy for definitions and execution", async () => {
    const executor = new ToolExecutor({
      tools: [echoToolWithContract],
      workspaceRoot: "/tmp/test",
      contractAccessPolicy: {
        channel: "gateway",
        allowedSafeScopes: ["local-safe"],
        blockedToolNames: ["echo_contract"],
      },
    });

    expect(executor.getDefinitions()).toHaveLength(0);
    expect(executor.getToolAvailability("echo_contract")).toMatchObject({
      available: false,
      reasonCode: "blocked-by-security-matrix",
    });

    const result = await executor.execute(
      { id: "req-9", name: "echo_contract", arguments: { message: "denied" } },
      "conv-1",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("安全矩阵");
  });

  it("should expose availability reasons for registered tools", () => {
    const goalTool = withToolContract({
      definition: {
        name: "goal_init",
        description: "goal bootstrap tool",
        parameters: { type: "object", properties: {} },
      },
      async execute(): Promise<ToolCallResult> {
        return {
          id: "",
          name: "goal_init",
          success: true,
          output: "ok",
          durationMs: 0,
        };
      },
    }, {
      family: "other",
      isReadOnly: true,
      isConcurrencySafe: true,
      needsPermission: false,
      riskLevel: "low",
      channels: ["gateway"],
      safeScopes: ["local-safe"],
      activityDescription: "Goal tool",
      resultSchema: { kind: "text", description: "plain text" },
      outputPersistencePolicy: "conversation",
    });

    const executor = new ToolExecutor({
      tools: [echoToolWithContract, goalTool],
      workspaceRoot: "/tmp/test",
      isToolAllowedForAgent: (toolName, agentId) => agentId !== "restricted" || toolName === "goal_init",
      isToolAllowedInConversation: (toolName, conversationId) => toolName !== "goal_init" || conversationId.startsWith("goal:"),
    });

    expect(executor.getToolAvailability("echo_contract", "restricted")?.reasonCode).toBe("not-in-agent-whitelist");
    expect(executor.getToolAvailability("goal_init", "restricted", "conv-1")?.reasonCode).toBe("conversation-restricted");

    const availabilities = executor.getRegisteredToolAvailabilities("restricted", "conv-1");
    expect(availabilities).toHaveLength(2);
    expect(availabilities.some((item) => item.reasonCode === "not-in-agent-whitelist")).toBe(true);
    expect(availabilities.some((item) => item.reasonCode === "conversation-restricted")).toBe(true);
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
