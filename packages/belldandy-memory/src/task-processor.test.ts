import { describe, expect, it, vi } from "vitest";
import { TaskProcessor } from "./task-processor.js";
import type { TaskRecord } from "./task-types.js";
import type { TaskSummarizer } from "./task-summarizer.js";

class FakeStore {
  tasks = new Map<string, TaskRecord>();
  links: Array<{ taskId: string; chunkId: string; relation: string }> = [];

  createTask(task: TaskRecord): void {
    this.tasks.set(task.id, task);
  }

  updateTask(taskId: string, patch: Partial<TaskRecord>): void {
    const current = this.tasks.get(taskId);
    if (!current) return;
    this.tasks.set(taskId, { ...current, ...patch });
  }

  getTask(taskId: string): TaskRecord | null {
    return this.tasks.get(taskId) ?? null;
  }

  linkTaskMemory(taskId: string, chunkId: string, relation: "used" | "generated" | "referenced"): void {
    this.links.push({ taskId, chunkId, relation });
  }
}

describe("TaskProcessor", () => {
  it("should create a base task record with usage data", () => {
    const store = new FakeStore();
    const processor = new TaskProcessor(store as any, { enabled: true });

    processor.startTask({
      conversationId: "conv-1",
      sessionKey: "conv-1",
      source: "chat",
      objective: "修复记忆检索问题",
    });
    processor.recordToolCall("conv-1", {
      toolName: "file_write",
      success: true,
      durationMs: 120,
      artifactPaths: ["packages/a.ts"],
    });

    const taskId = processor.completeTask({
      conversationId: "conv-1",
      success: true,
      durationMs: 3200,
      messages: [
        { type: "usage", inputTokens: 111, outputTokens: 222 },
      ],
    });

    expect(taskId).toBeTruthy();
    const task = store.getTask(taskId!)!;
    expect(task.objective).toBe("修复记忆检索问题");
    expect(task.tokenInput).toBe(111);
    expect(task.tokenOutput).toBe(222);
    expect(task.tokenTotal).toBe(333);
    expect(task.toolCalls?.length).toBe(1);
    expect(task.artifactPaths).toEqual(["packages/a.ts"]);
  });

  it("should update task summary asynchronously when summarizer is enabled", async () => {
    const store = new FakeStore();
    const summarizeTask = vi.fn().mockResolvedValue({
      title: "修复记忆检索问题",
      summary: "已完成检索问题修复并补齐回归验证。",
      reflection: "后续应优先保留旧检索行为不变。",
      outcome: "success",
      artifactPaths: ["packages/b.ts"],
    });
    const summarizer = {
      isEnabled: true,
      modelName: "mock-task-model",
      summarizeTask,
    } as unknown as TaskSummarizer;

    const processor = new TaskProcessor(store as any, {
      enabled: true,
      summarizer,
      conversationStore: {
        getHistory: () => [
          { role: "user", content: "请修复记忆检索问题" },
          { role: "assistant", content: "我来检查相关实现" },
        ],
      },
      summaryMinToolCalls: 1,
    });

    processor.startTask({
      conversationId: "conv-2",
      sessionKey: "conv-2",
      source: "chat",
      objective: "修复记忆检索问题",
    });
    processor.recordToolCall("conv-2", {
      toolName: "apply_patch",
      success: true,
      durationMs: 80,
      artifactPaths: ["packages/a.ts"],
    });

    const taskId = processor.completeTask({
      conversationId: "conv-2",
      success: true,
      durationMs: 6400,
    });

    await processor.waitForIdle();

    expect(summarizeTask).toHaveBeenCalledTimes(1);
    const task = store.getTask(taskId!)!;
    expect(task.title).toBe("修复记忆检索问题");
    expect(task.summary).toBe("已完成检索问题修复并补齐回归验证。");
    expect(task.reflection).toBe("后续应优先保留旧检索行为不变。");
    expect(task.summaryModel).toBe("mock-task-model");
    expect(task.artifactPaths).toEqual(["packages/a.ts", "packages/b.ts"]);
  });

  it("should persist linked memory chunks when task completes", () => {
    const store = new FakeStore();
    const processor = new TaskProcessor(store as any, { enabled: true });

    processor.startTask({
      conversationId: "conv-3",
      sessionKey: "conv-3",
      source: "chat",
      objective: "查找并修复记忆问题",
    });
    processor.linkMemory("conv-3", ["chunk-1", "chunk-2"], "used");
    processor.linkMemory("conv-3", ["chunk-1"], "used");

    const taskId = processor.completeTask({
      conversationId: "conv-3",
      success: true,
    });

    expect(taskId).toBeTruthy();
    expect(store.links).toEqual([
      { taskId: taskId!, chunkId: "chunk-1", relation: "used" },
      { taskId: taskId!, chunkId: "chunk-2", relation: "used" },
    ]);
  });
});
