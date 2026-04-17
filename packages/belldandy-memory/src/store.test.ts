import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryStore } from "./store.js";
import { buildTaskRecapArtifacts } from "./task-recap.js";
import type { MemoryChunk } from "./types.js";
import type { TaskActivityRecord, TaskRecord } from "./task-types.js";

describe("MemoryStore", () => {
  let rootDir: string;
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-store-"));
    dbPath = path.join(rootDir, "memory.db");
    store = new MemoryStore(dbPath);
  });

  afterEach(async () => {
    store.close();
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  });

  it("rolls back replaceSourceChunks when a chunk write fails", () => {
    const sourcePath = "/tmp/atomic-source.md";

    store.upsertChunk({
      id: "old-1",
      sourcePath,
      sourceType: "file",
      memoryType: "other",
      content: "old content chunk one",
    });
    store.upsertChunk({
      id: "old-2",
      sourcePath,
      sourceType: "file",
      memoryType: "other",
      content: "old content chunk two",
    });

    const circularMetadata: { self?: unknown } = {};
    circularMetadata.self = circularMetadata;

    const replacementChunks: MemoryChunk[] = [
      {
        id: "new-1",
        sourcePath,
        sourceType: "file",
        memoryType: "other",
        content: "new content chunk one",
      },
      {
        id: "new-2",
        sourcePath,
        sourceType: "file",
        memoryType: "other",
        content: "new content chunk two",
        metadata: circularMetadata,
      },
    ];

    expect(() => store.replaceSourceChunks(sourcePath, replacementChunks)).toThrow();

    const remainingChunks = store.getChunksBySource(sourcePath, 10);

    expect(remainingChunks).toHaveLength(2);
    expect(remainingChunks.map((item) => item.id)).toEqual(["old-1", "old-2"]);
    expect(remainingChunks.every((item) => item.content?.includes("old content"))).toBe(true);
  });

  it("rebuilds work recap and resume context when task metadata updates", async () => {
    const startedAt = "2026-04-17T08:00:00.000Z";
    const completedAt = "2026-04-17T08:05:00.000Z";
    const baseTask: TaskRecord = {
      id: "task-recap-refresh-1",
      conversationId: "conv-recap-refresh-1",
      sessionKey: "session-recap-refresh-1",
      source: "chat",
      status: "partial",
      objective: "继续整理 Step 2 的 resume 能力",
      startedAt,
      finishedAt: completedAt,
      createdAt: completedAt,
      updatedAt: completedAt,
    };
    const activities: TaskActivityRecord[] = [
      {
        id: "activity-recap-refresh-1",
        taskId: baseTask.id,
        conversationId: baseTask.conversationId,
        sessionKey: baseTask.sessionKey,
        source: baseTask.source,
        kind: "task_completed",
        state: "attempted",
        sequence: 0,
        happenedAt: completedAt,
        recordedAt: completedAt,
        title: "任务暂告一段，等待继续。",
      },
    ];
    const initialArtifacts = buildTaskRecapArtifacts({
      task: baseTask,
      activities,
      updatedAt: completedAt,
    });

    store.createTask({
      ...baseTask,
      workRecap: initialArtifacts.workRecap,
      resumeContext: initialArtifacts.resumeContext,
    });
    store.createTaskActivity(activities[0]);

    await new Promise((resolve) => setTimeout(resolve, 10));

    store.updateTask(baseTask.id, {
      summary: "已停在整理 resume 能力的字段与注入链路，等待下一步继续落检索入口。",
    });

    const updated = store.getTask(baseTask.id);

    expect(updated?.summary).toBe("已停在整理 resume 能力的字段与注入链路，等待下一步继续落检索入口。");
    expect(updated?.workRecap?.headline).toContain("当前停在：已停在整理 resume 能力的字段与注入链路");
    expect(updated?.resumeContext?.currentStopPoint).toBe("已停在整理 resume 能力的字段与注入链路，等待下一步继续落检索入口。");
    expect(updated?.workRecap?.updatedAt).toBe(updated?.updatedAt);
    expect(updated?.resumeContext?.updatedAt).toBe(updated?.updatedAt);
  });
});
