import { describe, expect, it, vi } from "vitest";
import { TaskProcessor } from "./task-processor.js";
import type { TaskActivityRecord, TaskRecord } from "./task-types.js";
import type { TaskSummarizer } from "./task-summarizer.js";

class FakeStore {
  tasks = new Map<string, TaskRecord>();
  activities: TaskActivityRecord[] = [];
  links: Array<{ taskId: string; chunkId: string; relation: string }> = [];

  createTask(task: TaskRecord): void {
    this.tasks.set(task.id, task);
  }

  createTaskActivity(activity: TaskActivityRecord): void {
    this.activities.push(activity);
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
    expect(task.workRecap?.confirmedFacts).toEqual(expect.arrayContaining([
      "已执行工具 file_write",
      "已变更文件：packages/a.ts",
    ]));
    expect(task.workRecap?.pendingActions).toBeUndefined();
    expect(task.resumeContext?.currentStopPoint).toBe("任务已完成。");
    expect(task.resumeContext?.nextStep).toBeUndefined();
    expect(store.activities.map((item) => item.kind)).toEqual([
      "task_started",
      "tool_called",
      "file_changed",
      "task_completed",
    ]);
    expect(store.activities.every((item) => !("nextStep" in item))).toBe(true);
    expect(store.activities[1]?.state).toBe("completed");
    expect(store.activities[2]?.files).toEqual(["packages/a.ts"]);
    expect(store.activities[3]?.state).toBe("completed");
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

  it("should promote summarized partial outcome into task status and refreshed resume context", async () => {
    const store = new FakeStore();
    const summarizeTask = vi.fn().mockResolvedValue({
      title: "补 memory 来源解释入口",
      summary: "已补来源解释卡片初版，待继续接 explain_sources 与 viewer 懒加载。",
      reflection: "下次应优先检查续做链路里的 partial 状态是否真实落库。",
      outcome: "partial",
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
          { role: "user", content: "继续补 memory viewer 来源解释入口" },
          { role: "assistant", content: "我先接 explain_sources，再补 viewer 懒加载。" },
        ],
      },
      summaryMinToolCalls: 1,
    });

    processor.startTask({
      conversationId: "conv-partial-1",
      sessionKey: "conv-partial-1",
      source: "chat",
      objective: "继续补 memory viewer 来源解释入口",
    });
    processor.recordToolCall("conv-partial-1", {
      toolName: "apply_patch",
      success: true,
      durationMs: 90,
      artifactPaths: ["apps/web/public/app/features/memory-detail-render.js"],
    });

    const taskId = processor.completeTask({
      conversationId: "conv-partial-1",
      success: true,
      durationMs: 2800,
    });

    await processor.waitForIdle();

    const task = store.getTask(taskId!)!;
    expect(task.status).toBe("partial");
    expect(task.outcome).toBe("partial");
    expect(task.summary).toBe("已补来源解释卡片初版，待继续接 explain_sources 与 viewer 懒加载。");
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
    expect(store.activities.some((item) => item.kind === "memory_recalled")).toBe(true);
  });

  it("should keep artifact paths added outside tool summaries", () => {
    const store = new FakeStore();
    const processor = new TaskProcessor(store as any, { enabled: true });

    processor.startTask({
      conversationId: "conv-4",
      sessionKey: "conv-4",
      source: "chat",
      objective: "校验 source_path 挂链产物记录",
    });
    processor.addArtifactPath("conv-4", "memory/shared.md");
    processor.addArtifactPath("conv-4", "memory/shared.md");

    const taskId = processor.completeTask({
      conversationId: "conv-4",
      success: true,
    });

    expect(taskId).toBeTruthy();
    expect(store.getTask(taskId!)?.artifactPaths).toEqual(["memory/shared.md"]);
    expect(store.activities.some((item) => item.kind === "artifact_generated")).toBe(true);
  });

  it("should record failure facts without mixing in future work", () => {
    const store = new FakeStore();
    const processor = new TaskProcessor(store as any, { enabled: true });

    processor.startTask({
      conversationId: "conv-5",
      sessionKey: "conv-5",
      source: "chat",
      objective: "复现失败路径",
    });
    processor.recordToolCall("conv-5", {
      toolName: "memory_search",
      success: false,
      durationMs: 35,
      note: "request failed",
    });

    const taskId = processor.completeTask({
      conversationId: "conv-5",
      success: false,
      error: "search crashed",
    });

    expect(taskId).toBeTruthy();
    expect(store.activities.map((item) => item.kind)).toEqual([
      "task_started",
      "tool_called",
      "error_observed",
      "task_completed",
    ]);
    expect(store.activities[1]?.state).toBe("failed");
    expect(store.activities[2]?.error).toContain("search crashed");
    expect(store.activities[3]?.state).toBe("failed");
    expect(store.getTask(taskId!)?.workRecap?.pendingActions).toEqual([
      "先处理最近失败原因，再决定是否重试最近动作。",
    ]);
    expect(store.getTask(taskId!)?.resumeContext?.nextStep).toBe("先处理最近失败原因，再决定是否重试最近动作。");
  });
});
