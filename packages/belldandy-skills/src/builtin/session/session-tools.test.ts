import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types.js";
import { sessionsSpawnTool } from "./spawn.js";
import { delegateTaskTool } from "./delegate.js";
import { delegateParallelTool } from "./delegate-parallel.js";

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-session",
    workspaceRoot: "/tmp/workspace",
    defaultCwd: "/tmp/workspace/apps/web",
    launchSpec: {
      cwd: "/tmp/workspace/apps/web",
      toolSet: ["file_read", "run_command"],
      permissionMode: "confirm",
      isolationMode: "workspace",
      parentTaskId: "task_parent",
    },
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 30_000,
      maxResponseBytes: 512_000,
    },
    ...overrides,
  };
}

describe("session tools launchSpec wiring", () => {
  it("sessions_spawn should build an explicit launchSpec with inherited runtime defaults", async () => {
    const spawnSubAgent = vi.fn(async () => ({
      success: true,
      output: "spawned",
      sessionId: "sub_1",
      taskId: "task_1",
    }));
    const context = createContext({
      agentCapabilities: {
        spawnSubAgent,
      },
    });

    const result = await sessionsSpawnTool.execute({
      instruction: "Inspect the current module",
      agent_id: "coder",
      context: { file: "apps/web/public/app.js" },
    }, context);

    expect(result.success).toBe(true);
    expect(spawnSubAgent).toHaveBeenCalledWith(expect.objectContaining({
      instruction: "Inspect the current module",
      agentId: "coder",
      parentConversationId: "conv-session",
      channel: "subtask",
      cwd: "/tmp/workspace/apps/web",
      toolSet: ["file_read", "run_command"],
      permissionMode: "confirm",
      isolationMode: "workspace",
      parentTaskId: "task_parent",
      context: { file: "apps/web/public/app.js" },
    }));
  });

  it("delegate_task should build an explicit launchSpec before orchestration", async () => {
    const spawnSubAgent = vi.fn(async () => ({
      success: true,
      output: "done",
      sessionId: "sub_2",
      taskId: "task_2",
    }));
    const context = createContext({
      agentCapabilities: {
        spawnSubAgent,
      },
    });

    const result = await delegateTaskTool.execute({
      instruction: "Write the integration patch",
      agent_id: "coder",
      context: { target: "packages/belldandy-core/src/server.ts" },
    }, context);

    expect(result.success).toBe(true);
    expect(spawnSubAgent).toHaveBeenCalledWith(expect.objectContaining({
      instruction: "Write the integration patch",
      agentId: "coder",
      parentConversationId: "conv-session",
      channel: "subtask",
      cwd: "/tmp/workspace/apps/web",
      toolSet: ["file_read", "run_command"],
      permissionMode: "confirm",
      isolationMode: "workspace",
      parentTaskId: "task_parent",
      context: { target: "packages/belldandy-core/src/server.ts" },
    }));
  });

  it("delegate_parallel should build explicit launchSpec entries for every task", async () => {
    const spawnParallel = vi.fn(async (tasks) => tasks.map((_task: unknown, index: number) => ({
      success: true,
      output: `done-${index + 1}`,
      sessionId: `sub_${index + 1}`,
      taskId: `task_${index + 1}`,
    })));
    const context = createContext({
      agentCapabilities: {
        spawnParallel,
      },
    });

    const result = await delegateParallelTool.execute({
      tasks: [
        { instruction: "Review A", agent_id: "researcher", context: { file: "a.ts" } },
        { instruction: "Review B", context: { file: "b.ts" } },
      ],
    }, context);

    expect(result.success).toBe(true);
    expect(spawnParallel).toHaveBeenCalledWith([
      expect.objectContaining({
        instruction: "Review A",
        agentId: "researcher",
        parentConversationId: "conv-session",
        channel: "subtask",
        cwd: "/tmp/workspace/apps/web",
        parentTaskId: "task_parent",
      }),
      expect.objectContaining({
        instruction: "Review B",
        agentId: undefined,
        parentConversationId: "conv-session",
        channel: "subtask",
        cwd: "/tmp/workspace/apps/web",
        parentTaskId: "task_parent",
      }),
    ]);
  });
});
