import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryManager } from "./manager.js";
import { buildTaskRecapArtifacts } from "./task-recap.js";
import type { TaskActivityRecord, TaskRecord } from "./task-types.js";

describe("MemoryManager guardrails", () => {
  let rootDir: string;
  let stateDir: string;
  let sessionsDir: string;
  let docsDir: string;
  let manager: MemoryManager | null;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-manager-"));
    stateDir = path.join(rootDir, "state");
    sessionsDir = path.join(stateDir, "sessions");
    docsDir = path.join(rootDir, "docs");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(docsDir, { recursive: true });
    manager = null;
  });

  afterEach(async () => {
    manager?.close();
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => { });
  });

  it("indexes explicit MEMORY.md files and additional workspace roots", async () => {
    const stateMemoryPath = path.join(stateDir, "MEMORY.md");
    const extraDocPath = path.join(docsDir, "guide.md");
    await fs.writeFile(stateMemoryPath, "# Main Memory\nmarkerstateroot\n", "utf-8");
    await fs.writeFile(extraDocPath, "# Guide\nmarkerextraroot\n", "utf-8");

    manager = createManager({
      workspaceRoot: sessionsDir,
      stateDir,
      additionalRoots: [docsDir],
      additionalFiles: [stateMemoryPath],
    });

    await manager.indexWorkspace();

    const recent = manager.getRecent(10);

    expect(recent.some((item) => item.sourcePath === stateMemoryPath)).toBe(true);
    expect(recent.some((item) => item.sourcePath === extraDocPath)).toBe(true);
  });

  it("resolves relative memory source paths against stateDir roots for task linking", async () => {
    const stateMemoryPath = path.join(stateDir, "MEMORY.md");
    const dailyMemoryPath = path.join(stateDir, "memory", "2026-03-17.md");
    await fs.mkdir(path.dirname(dailyMemoryPath), { recursive: true });
    await fs.writeFile(stateMemoryPath, "# Main Memory\nstate root memory\n", "utf-8");
    await fs.writeFile(dailyMemoryPath, "# 2026-03-17\ndaily memory\n", "utf-8");

    manager = createManager({
      workspaceRoot: sessionsDir,
      stateDir,
      additionalRoots: [path.join(stateDir, "memory")],
      additionalFiles: [stateMemoryPath],
      taskMemoryEnabled: true,
    });

    await manager.indexWorkspace();

    expect(await manager.linkTaskMemoriesFromSource("conv-state-link", "MEMORY.md", "used")).toBeGreaterThan(0);
    expect(await manager.linkTaskMemoriesFromSource("conv-state-link", "memory/2026-03-17.md", "used")).toBeGreaterThan(0);
  });

  it("keeps explicit search available while implicit recall still skips greetings", async () => {
    const filePath = path.join(docsDir, "hello.md");
    await fs.writeFile(filePath, "# Greeting\nhello memory marker\n", "utf-8");

    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
    });

    await manager.indexWorkspace();

    const explicit = await manager.search("hello", { limit: 5 });
    const implicit = await manager.search("hello", { limit: 5, retrievalMode: "implicit" });

    expect(explicit.some((item) => item.sourcePath === filePath)).toBe(true);
    expect(implicit).toHaveLength(0);
  });

  it("preserves chunk and source visibility after reindex", async () => {
    const chunkFilePath = path.join(docsDir, "chunk-visibility.md");
    const sourceFilePath = path.join(docsDir, "source-visibility.md");
    const longChunkContent = [
      "# Chunk Visibility",
      "chunkvisibilitymarkera ".repeat(8),
      "chunkvisibilitymarkerb ".repeat(8),
      "chunkvisibilitymarkerc ".repeat(8),
    ].join("\n\n");
    await fs.writeFile(chunkFilePath, longChunkContent, "utf-8");
    await fs.writeFile(sourceFilePath, "# Source Visibility\nsourcevisibilitymarker\n", "utf-8");

    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      indexerOptions: {
        chunkOptions: { maxLength: 80, overlap: 0 },
      },
    });

    await manager.indexWorkspace();

    const initialChunkRecords = (manager as any).store.getChunksBySource(chunkFilePath, 10);
    expect(initialChunkRecords.length).toBeGreaterThan(1);
    const chunk = initialChunkRecords[0];
    expect(chunk?.id).toBeTruthy();
    expect(manager.promoteMemoryChunk(chunk.id)?.visibility).toBe("shared");

    const sourcePromotion = manager.promoteMemorySource(sourceFilePath);
    expect(sourcePromotion.count).toBeGreaterThan(0);

    await manager.indexWorkspace();

    const reindexedChunk = manager.getMemory(chunk.id);
    const reindexedSource = (manager as any).store.getChunksBySource(sourceFilePath, 10);

    expect(reindexedChunk?.visibility).toBe("shared");
    expect(reindexedSource.every((item: { visibility?: string }) => item.visibility === "shared")).toBe(true);
  });

  it("ignores configured directories by path segment instead of substring", async () => {
    const ignoredDir = path.join(docsDir, "node_modules");
    const safeDir = path.join(docsDir, "project-node_modules-copy");
    const ignoredFile = path.join(ignoredDir, "ignore.md");
    const safeFile = path.join(safeDir, "keep.md");
    await fs.mkdir(ignoredDir, { recursive: true });
    await fs.mkdir(safeDir, { recursive: true });
    await fs.writeFile(ignoredFile, "ignored-marker", "utf-8");
    await fs.writeFile(safeFile, "keep-marker", "utf-8");

    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      indexerOptions: {
        ignorePatterns: ["node_modules"],
      },
    });

    await manager.indexWorkspace();

    const recent = manager.getRecent(20);

    expect(recent.some((item) => item.sourcePath === safeFile)).toBe(true);
    expect(recent.some((item) => item.sourcePath === ignoredFile)).toBe(false);
  });

  it("excludes session memories from context injection by default", async () => {
    const stateMemoryPath = path.join(stateDir, "MEMORY.md");
    const sessionFilePath = path.join(sessionsDir, "session-001.md");

    manager = createManager({
      workspaceRoot: sessionsDir,
      stateDir,
    });

    const store = (manager as any).store;
    store.upsertChunk({
      id: "core-memory-1",
      sourcePath: stateMemoryPath,
      sourceType: "file",
      memoryType: "core",
      content: "Project decision marker",
    });
    store.upsertChunk({
      id: "session-memory-1",
      sourcePath: sessionFilePath,
      sourceType: "session",
      memoryType: "session",
      content: "Just finished restarting service",
    });

    const injected = manager.getContextInjectionMemories({ limit: 10 });
    const injectedWithSession = manager.getContextInjectionMemories({ limit: 10, includeSession: true });

    expect(injected.some((item) => item.sourcePath === stateMemoryPath)).toBe(true);
    expect(injected.some((item) => item.sourcePath === sessionFilePath)).toBe(false);
    expect(injectedWithSession.some((item) => item.sourcePath === sessionFilePath)).toBe(true);
  });

  it("detects recent duplicate tool actions from successful tasks", async () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      taskMemoryEnabled: true,
    });

    const conversationId = "conv-dedup-1";
    manager.startTaskCapture({
      conversationId,
      sessionKey: conversationId,
      source: "chat",
      objective: "restart gateway after config change",
    });
    manager.recordTaskToolCall(conversationId, {
      toolName: "service_restart",
      success: true,
      actionKey: "service_restart:gateway",
    });
    manager.completeTaskCapture({
      conversationId,
      success: true,
      durationMs: 1200,
      messages: [],
    });

    const duplicated = manager.findRecentDuplicateToolAction({
      toolName: "service_restart",
      actionKey: "service_restart:gateway",
      withinMinutes: 20,
    });

    const different = manager.findRecentDuplicateToolAction({
      toolName: "service_restart",
      actionKey: "service_restart:other",
      withinMinutes: 20,
    });

    expect(duplicated?.conversationId).toBe(conversationId);
    expect(different).toBeNull();
  });

  it("builds recent task summaries without requiring full task hydration", async () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      taskMemoryEnabled: true,
    });

    const store = (manager as any).store;
    store.createTask({
      id: "task-summary-1",
      conversationId: "conv-summary-1",
      sessionKey: "session-summary-1",
      source: "chat",
      status: "success",
      title: "Refresh memory usage dashboard",
      objective: "verify recent task summary projection",
      summary: "dashboard refreshed with memory usage overview",
      reflection: "heavy reflection body should not matter for summary reads",
      outcome: "done",
      toolCalls: [
        { toolName: "memory_search", success: true, durationMs: 80 },
        { toolName: "experience_usage_stats", success: true, durationMs: 40 },
      ],
      artifactPaths: ["reports/memory-usage.md"],
      startedAt: "2026-03-21T10:00:00.000Z",
      finishedAt: "2026-03-21T10:00:30.000Z",
      createdAt: "2026-03-21T10:00:00.000Z",
      updatedAt: "2026-03-21T10:00:30.000Z",
    });

    const summaries = manager.getRecentTaskSummaries(5);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      taskId: "task-summary-1",
      title: "Refresh memory usage dashboard",
      summary: "dashboard refreshed with memory usage overview",
      status: "success",
      source: "chat",
      toolNames: ["memory_search", "experience_usage_stats"],
      artifactPaths: ["reports/memory-usage.md"],
    });
  });

  it("returns task activity facts in task detail", () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      taskMemoryEnabled: true,
    });

    const taskId = manager.startTaskCapture({
      conversationId: "conv-activity-1",
      sessionKey: "session-activity-1",
      source: "chat",
      objective: "record factual execution activity",
    });
    expect(taskId).toBeTruthy();

    manager.linkTaskMemories("conv-activity-1", ["chunk-activity-1"], "used");
    manager.recordTaskToolCall("conv-activity-1", {
      toolName: "apply_patch",
      success: true,
      durationMs: 90,
      artifactPaths: ["packages/belldandy-memory/src/task-processor.ts"],
    });
    manager.completeTaskCapture({
      conversationId: "conv-activity-1",
      success: true,
      durationMs: 1800,
    });

    const detail = manager.getTaskDetail(taskId!);

    expect(detail?.activities.map((item) => item.kind)).toEqual([
      "task_started",
      "memory_recalled",
      "tool_called",
      "file_changed",
      "task_completed",
    ]);
    expect(detail?.workRecap?.headline).toContain("任务已完成");
    expect(detail?.workRecap?.confirmedFacts).toEqual(expect.arrayContaining([
      "已关联 1 条召回记忆",
      "已变更文件：packages/belldandy-memory/src/task-processor.ts",
    ]));
    expect(detail?.resumeContext?.currentStopPoint).toBe("任务已完成。");
    expect(detail?.resumeContext?.nextStep).toBeUndefined();
    expect(detail?.activities.every((item) => !("nextStep" in item))).toBe(true);
    expect(detail?.activities.find((item) => item.kind === "file_changed")?.files).toEqual([
      "packages/belldandy-memory/src/task-processor.ts",
    ]);
  });

  it("builds recent_work shortcuts with recap and recent activity", () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      taskMemoryEnabled: true,
    });

    const store = (manager as any).store;
    seedTaskShortcut(store, {
      taskId: "task-shortcut-recent-1",
      conversationId: "conv-shortcut-recent-1",
      status: "partial",
      objective: "补 recent_work 检索短路径",
      summary: "已开始补 recent_work 与 resume_context 的 manager 检索接口。",
      updatedAt: "2026-04-17T09:10:00.000Z",
      activities: [
        createShortcutActivity({
          id: "activity-shortcut-recent-1",
          taskId: "task-shortcut-recent-1",
          conversationId: "conv-shortcut-recent-1",
          sequence: 0,
          kind: "tool_called",
          state: "completed",
          happenedAt: "2026-04-17T09:05:00.000Z",
          title: "已执行工具 apply_patch",
        }),
        createShortcutActivity({
          id: "activity-shortcut-recent-2",
          taskId: "task-shortcut-recent-1",
          conversationId: "conv-shortcut-recent-1",
          sequence: 1,
          kind: "file_changed",
          state: "completed",
          happenedAt: "2026-04-17T09:06:00.000Z",
          title: "已变更文件：packages/belldandy-memory/src/manager.ts",
          files: ["packages/belldandy-memory/src/manager.ts"],
        }),
      ],
    });

    const items = manager.getRecentWork({ limit: 3, query: "recent_work" });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      taskId: "task-shortcut-recent-1",
      status: "partial",
    });
    expect(items[0].workRecap?.headline).toContain("当前停在");
    expect(items[0].recentActivityTitles).toEqual(expect.arrayContaining([
      "已变更文件：packages/belldandy-memory/src/manager.ts",
      "已执行工具 apply_patch",
    ]));
    expect(items[0].matchReasons).toEqual(expect.arrayContaining(["标题/目标", "摘要/复盘"]));
  });

  it("prefers resumable partial task when reading resume_context", () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      taskMemoryEnabled: true,
    });

    const store = (manager as any).store;
    seedTaskShortcut(store, {
      taskId: "task-resume-old-success",
      conversationId: "conv-resume-old-success",
      status: "success",
      objective: "完成旧的 viewer task 详情优化",
      summary: "旧任务已完成。",
      updatedAt: "2026-04-16T08:00:00.000Z",
      activities: [
        createShortcutActivity({
          id: "activity-resume-old-success",
          taskId: "task-resume-old-success",
          conversationId: "conv-resume-old-success",
          sequence: 0,
          kind: "task_completed",
          state: "completed",
          happenedAt: "2026-04-16T08:00:00.000Z",
          title: "任务已完成。",
        }),
      ],
    });
    seedTaskShortcut(store, {
      taskId: "task-resume-current",
      conversationId: "conv-resume-current",
      status: "partial",
      objective: "继续补 recent_work / resume_context RPC",
      summary: "已停在 RPC 接线前，待继续补 memory.recent_work 与 memory.resume_context。",
      updatedAt: "2026-04-17T10:00:00.000Z",
      activities: [
        createShortcutActivity({
          id: "activity-resume-current-1",
          taskId: "task-resume-current",
          conversationId: "conv-resume-current",
          sequence: 0,
          kind: "tool_called",
          state: "completed",
          happenedAt: "2026-04-17T09:55:00.000Z",
          title: "已执行工具 apply_patch",
        }),
      ],
    });

    const item = manager.getResumeContext({ query: "resume_context RPC" });

    expect(item?.taskId).toBe("task-resume-current");
    expect(item?.resumeContext?.currentStopPoint).toContain("已停在 RPC 接线前");
    expect(item?.resumeContext?.nextStep).toBeTruthy();
  });

  it("finds similar past work from task recap and activity fields", () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      taskMemoryEnabled: true,
    });

    const store = (manager as any).store;
    seedTaskShortcut(store, {
      taskId: "task-similar-viewer-1",
      conversationId: "conv-similar-viewer-1",
      status: "success",
      objective: "修复 memory viewer task detail 渲染",
      summary: "已补 task detail 的 Work Recap 与 Resume Context 展示。",
      updatedAt: "2026-04-16T11:00:00.000Z",
      activities: [
        createShortcutActivity({
          id: "activity-similar-viewer-1",
          taskId: "task-similar-viewer-1",
          conversationId: "conv-similar-viewer-1",
          sequence: 0,
          kind: "file_changed",
          state: "completed",
          happenedAt: "2026-04-16T10:58:00.000Z",
          title: "已变更文件：apps/web/public/app/features/memory-detail-render.js",
          files: ["apps/web/public/app/features/memory-detail-render.js"],
        }),
      ],
    });
    seedTaskShortcut(store, {
      taskId: "task-similar-other-1",
      conversationId: "conv-similar-other-1",
      status: "success",
      objective: "重启邮件服务",
      summary: "与 viewer 无关。",
      updatedAt: "2026-04-16T09:00:00.000Z",
      activities: [],
    });

    const items = manager.findSimilarPastWork({
      query: "memory viewer task detail",
      limit: 3,
    });

    expect(items).toHaveLength(1);
    expect(items[0].taskId).toBe("task-similar-viewer-1");
    expect(items[0].matchReasons).toEqual(expect.arrayContaining(["标题/目标", "摘要/复盘", "最近活动"]));
  });

  it("returns durable memory guidance with accepted and rejected policy summary", () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      evolutionEnabled: true,
      evolutionModel: "test-evolution-model",
      evolutionBaseUrl: "https://example.invalid/v1",
      evolutionApiKey: "test-evolution-key",
    });

    const guidance = manager.getDurableMemoryGuidance();

    expect(guidance).toMatchObject({
      policyVersion: "week9-v1",
      acceptedCandidateTypes: ["user", "feedback", "project", "reference"],
    });
    expect(guidance.rejectedContentTypes.map((item) => item.code)).toEqual(expect.arrayContaining([
      "code_pattern",
      "file_path",
      "git_history",
      "debug_recipe",
      "policy_rule",
    ]));
  });

  it("filters code-like and path-like extraction candidates before writing durable memory", async () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      evolutionEnabled: true,
      evolutionModel: "test-evolution-model",
      evolutionBaseUrl: "https://example.invalid/v1",
      evolutionApiKey: "test-evolution-key",
      evolutionMinMessages: 2,
    });

    const extractionSpy = vi.spyOn(manager as any, "callLLMForExtraction").mockResolvedValue([
      {
        type: "事实",
        category: "fact",
        candidateType: "project",
        content: "当前项目的主目标是在本周收口 memory runtime 的 doctor 与 budget。",
      },
      {
        type: "经验",
        category: "experience",
        candidateType: "feedback",
        content: "执行 `pnpm test` 后如果失败就继续重跑。",
      },
      {
        type: "事实",
        category: "fact",
        candidateType: "project",
        content: "packages/belldandy-core/src/server.ts 需要继续拆分。",
      },
    ]);

    const result = await manager.extractMemoriesFromConversation("conv-memory-policy", [
      { role: "user", content: "请沉淀这轮对话里长期有效的信息。" },
      { role: "assistant", content: "本周要把 memory runtime 的 doctor 与 budget 收口。" },
    ]);

    expect(result).toMatchObject({
      count: 1,
      acceptedCandidateTypes: ["project"],
      rejectedCount: 2,
    });
    expect(result.rejectedReasons).toEqual(expect.arrayContaining(["code_pattern", "file_path"]));
    expect(result.summary).toContain("accepted=1");
    expect(result.summary).toContain("rejected=2");

    extractionSpy.mockRestore();
  });

  it("returns policy_filtered skip reason when all durable candidates are rejected by policy", async () => {
    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      evolutionEnabled: true,
      evolutionModel: "test-evolution-model",
      evolutionBaseUrl: "https://example.invalid/v1",
      evolutionApiKey: "test-evolution-key",
      evolutionMinMessages: 2,
    });

    const extractionSpy = vi.spyOn(manager as any, "callLLMForExtraction").mockResolvedValue([
      {
        type: "经验",
        category: "experience",
        candidateType: "feedback",
        content: "执行 `pnpm test` 失败后继续重跑。",
      },
      {
        type: "事实",
        category: "fact",
        candidateType: "project",
        content: "packages/belldandy-core/src/server.ts 仍需继续拆分。",
      },
    ]);

    const result = await manager.extractMemoriesFromConversation("conv-memory-policy-filtered", [
      { role: "user", content: "请只保留长期有效的事实。" },
      { role: "assistant", content: "短期命令和文件路径不应该进入 durable memory。" },
    ]);

    expect(result).toMatchObject({
      count: 0,
      rejectedCount: 2,
      skipReason: "policy_filtered",
    });
    expect(result.rejectedReasons).toEqual(expect.arrayContaining(["code_pattern", "file_path"]));

    extractionSpy.mockRestore();
  });
});

function seedTaskShortcut(store: any, input: {
  taskId: string;
  conversationId: string;
  status: TaskRecord["status"];
  objective?: string;
  summary?: string;
  updatedAt: string;
  activities: TaskActivityRecord[];
}): void {
  const task: TaskRecord = {
    id: input.taskId,
    conversationId: input.conversationId,
    sessionKey: input.conversationId,
    source: "chat",
    status: input.status,
    objective: input.objective,
    summary: input.summary,
    startedAt: input.updatedAt,
    finishedAt: input.status === "success" ? input.updatedAt : undefined,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  };
  const recap = buildTaskRecapArtifacts({
    task,
    activities: input.activities,
    updatedAt: input.updatedAt,
  });
  store.createTask({
    ...task,
    workRecap: recap.workRecap,
    resumeContext: recap.resumeContext,
  });
  for (const activity of input.activities) {
    store.createTaskActivity(activity);
  }
}

function createShortcutActivity(input: {
  id: string;
  taskId: string;
  conversationId: string;
  sequence: number;
  kind: TaskActivityRecord["kind"];
  state: TaskActivityRecord["state"];
  happenedAt: string;
  title: string;
  files?: string[];
}): TaskActivityRecord {
  return {
    id: input.id,
    taskId: input.taskId,
    conversationId: input.conversationId,
    sessionKey: input.conversationId,
    source: "chat",
    kind: input.kind,
    state: input.state,
    sequence: input.sequence,
    happenedAt: input.happenedAt,
    recordedAt: input.happenedAt,
    title: input.title,
    files: input.files,
  };
}

function createManager(options: ConstructorParameters<typeof MemoryManager>[0]): MemoryManager {
  const manager = new MemoryManager(options);
  (manager as any).embeddingProvider = {
    modelName: "test-memory-manager",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };
  return manager;
}
