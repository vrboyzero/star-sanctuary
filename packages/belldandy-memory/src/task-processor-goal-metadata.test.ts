import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store.js";
import { TaskProcessor } from "./task-processor.js";

describe("TaskProcessor goal metadata", () => {
  it("persists goal metadata into task record metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-task-meta-"));
    const store = new MemoryStore(path.join(tempDir, "memory.sqlite"));
    const processor = new TaskProcessor(store, { enabled: true });

    processor.startTask({
      conversationId: "goal:goal_alpha:node:node-1:run:run-1",
      sessionKey: "goal:goal_alpha:node:node-1:run:run-1",
      source: "chat",
      objective: "test goal metadata",
      metadata: {
        goalId: "goal_alpha",
        nodeId: "node-1",
        runId: "run-1",
        goalSession: true,
      },
    });

    const taskId = processor.completeTask({
      conversationId: "goal:goal_alpha:node:node-1:run:run-1",
      success: true,
      durationMs: 100,
      messages: [],
    });

    expect(taskId).toBeTruthy();
    const task = store.getTask(taskId!);
    expect(task?.metadata?.goalId).toBe("goal_alpha");
    expect(task?.metadata?.nodeId).toBe("node-1");
    expect(task?.metadata?.runId).toBe("run-1");
    expect(task?.metadata?.goalSession).toBe(true);
    expect(task?.metadata?.toolCallCount).toBe(0);
    store.close();
  });
});

