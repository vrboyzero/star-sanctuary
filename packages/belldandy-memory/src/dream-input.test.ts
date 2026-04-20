import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDreamConversationArtifactPath,
  buildDreamRuleSkeleton,
  buildDreamInputSnapshot,
} from "./dream-input.js";
import type { DreamInputMemoryManagerDelegate } from "./dream-types.js";
import type { ExperienceUsageSummary, TaskExperienceDetail } from "./experience-types.js";
import type { MemorySearchResult } from "./types.js";

describe("dream input aggregation", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
    tempDirs.length = 0;
  });

  it("aggregates recent task, durable memory, digest and session memory inputs", async () => {
    const sessionsDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-dream-input-"));
    tempDirs.push(sessionsDir);

    const conversationId = "agent:coder:main";
    await fs.writeFile(
      buildDreamConversationArtifactPath({
        sessionsDir,
        conversationId,
        suffix: ".digest.json",
      }),
      JSON.stringify({
        conversationId,
        status: "updated",
        pendingMessageCount: 2,
        rollingSummary: "最近一轮在收口 dream 输入层。",
        digestGeneration: 3,
      }),
      "utf-8",
    );
    await fs.writeFile(
      buildDreamConversationArtifactPath({
        sessionsDir,
        conversationId,
        suffix: ".session-memory.json",
      }),
      JSON.stringify({
        summary: "当前主要在实现 dream state 和输入聚合。",
        currentWork: "补齐 dream-store 与 dream-input。",
        nextStep: "接 runtime。",
        lastSummarizedMessageCount: 4,
        lastSummarizedToolCursor: 2,
      }),
      "utf-8",
    );

    const recentUsage: ExperienceUsageSummary = {
      usageId: "usage-1",
      taskId: "task-1",
      assetType: "method",
      assetKey: "dream-input.md",
      usageCount: 2,
      usedVia: "tool",
      createdAt: "2026-04-19T10:31:00.000Z",
      sourceCandidateId: "candidate-1",
      sourceCandidateType: "method",
      sourceCandidateTitle: "Dream Input Pipeline",
      sourceCandidateStatus: "accepted",
      sourceCandidateTaskId: "task-0",
      lastUsedAt: "2026-04-19T10:31:00.000Z",
      lastUsedTaskId: "task-1",
    };

    const taskDetail: TaskExperienceDetail = {
      id: "task-1",
      conversationId,
      sessionKey: conversationId,
      agentId: "coder",
      source: "chat",
      title: "实现 dream 输入聚合",
      objective: "把高信噪比输入统一收敛成 snapshot",
      status: "success",
      summary: "完成输入聚合函数并接入 source explanation。",
      outcome: "step 2 ready",
      reflection: "避免直接依赖 core",
      toolCalls: [{
        toolName: "apply_patch",
        success: true,
      }],
      artifactPaths: ["packages/belldandy-memory/src/dream-input.ts"],
      startedAt: "2026-04-19T10:00:00.000Z",
      finishedAt: "2026-04-19T10:40:00.000Z",
      createdAt: "2026-04-19T10:00:00.000Z",
      updatedAt: "2026-04-19T10:40:00.000Z",
      activities: [{
        id: "act-1",
        taskId: "task-1",
        conversationId,
        sessionKey: conversationId,
        agentId: "coder",
        source: "chat",
        kind: "file_changed",
        state: "completed",
        sequence: 1,
        happenedAt: "2026-04-19T10:20:00.000Z",
        recordedAt: "2026-04-19T10:20:00.000Z",
        title: "新增 dream-input.ts",
        files: ["packages/belldandy-memory/src/dream-input.ts"],
      }],
      memoryLinks: [{
        chunkId: "mem-1",
        relation: "used",
        sourcePath: "memory/2026-04-19.md",
        memoryType: "daily",
        visibility: "private",
        snippet: "dream 输入优先复用现有摘要治理。",
      }],
      usedMethods: [recentUsage],
      usedSkills: [],
      workRecap: {
        taskId: "task-1",
        conversationId,
        sessionKey: conversationId,
        agentId: "coder",
        headline: "完成 dream 输入聚合。",
        confirmedFacts: ["统一了 recent task/work/memory 聚合。"],
        derivedFromActivityIds: ["act-1"],
        updatedAt: "2026-04-19T10:35:00.000Z",
      },
      resumeContext: {
        taskId: "task-1",
        conversationId,
        sessionKey: conversationId,
        agentId: "coder",
        currentStopPoint: "状态层和输入聚合层已落盘。",
        nextStep: "实现 dream runtime。",
        derivedFromActivityIds: ["act-1"],
        updatedAt: "2026-04-19T10:40:00.000Z",
      },
    };

    const memoryManager: DreamInputMemoryManagerDelegate = {
      getRecent(limit) {
        const items: MemorySearchResult[] = [
          {
            id: "mem-1",
            sourcePath: path.join("memory", "2026-04-19.md"),
            sourceType: "file",
            memoryType: "daily",
            category: "decision",
            visibility: "private",
            content: "dream 输入优先复用现有摘要治理。",
            snippet: "dream 输入优先复用现有摘要治理。",
            summary: "dream 输入依赖现有摘要层。",
            score: 1,
            updatedAt: "2026-04-19T10:10:00.000Z",
          },
          {
            id: "mem-2",
            sourcePath: "team-memory/MEMORY.md",
            sourceType: "file",
            memoryType: "core",
            category: "fact",
            visibility: "shared",
            content: "approved shared memory 才能进入 Commons。",
            snippet: "approved shared memory 才能进入 Commons。",
            summary: "Commons 只接 approved shared memory。",
            score: 1,
            updatedAt: "2026-04-19T09:00:00.000Z",
          },
        ];
        return items.slice(0, limit ?? 10);
      },
      getRecentTasks() {
        return [
          {
            id: "task-1",
            updatedAt: "2026-04-19T10:40:00.000Z",
          },
          {
            id: "task-old",
            updatedAt: "2026-04-12T10:40:00.000Z",
          },
        ];
      },
      getTaskDetail(taskId) {
        return taskId === "task-1" ? taskDetail : null;
      },
      getTaskByConversation(id) {
        return id === conversationId ? { id: "task-1" } : null;
      },
      getRecentWork() {
        return [{
          taskId: "task-1",
          conversationId,
          title: "实现 dream 输入聚合",
          objective: "把高信噪比输入统一收敛成 snapshot",
          summary: "完成输入聚合函数并接入 source explanation。",
          status: "success",
          source: "chat",
          startedAt: "2026-04-19T10:00:00.000Z",
          finishedAt: "2026-04-19T10:40:00.000Z",
          updatedAt: "2026-04-19T10:40:00.000Z",
          agentId: "coder",
          toolNames: ["apply_patch"],
          artifactPaths: ["packages/belldandy-memory/src/dream-input.ts"],
          recentActivityTitles: ["新增 dream-input.ts"],
          workRecap: taskDetail.workRecap,
          resumeContext: taskDetail.resumeContext,
        }];
      },
    };

    const snapshot = await buildDreamInputSnapshot({
      agentId: "coder",
      conversationId,
      sessionsDir,
      now: "2026-04-19T12:00:00.000Z",
      memoryManager,
      buildMindProfileSnapshot: async () => ({
        summary: {
          available: true,
          headline: "private/shared memory 已就绪",
        },
        profile: {
          headline: "当前重点是 dream runtime",
        },
      }),
      buildLearningReviewInput: async ({ recentTasks, recentDurableMemories }) => ({
        summary: {
          available: true,
          headline: `task=${recentTasks.length}, memory=${recentDurableMemories.length}`,
        },
        summaryLines: ["优先继续推进 dream runtime。"],
        nudges: ["不要让 dream 自动写 MEMORY.md。"],
      }),
      getTaskChangeSeq: () => 5,
      getMemoryChangeSeq: () => 7,
    });

    expect(snapshot.agentId).toBe("coder");
    expect(snapshot.sessionDigest?.rollingSummary).toContain("dream 输入层");
    expect(snapshot.sessionMemory?.currentWork).toContain("dream-store");
    expect(snapshot.recentTasks).toHaveLength(1);
    expect(snapshot.focusTask?.id).toBe("task-1");
    expect(snapshot.recentWorkItems[0]?.sourceExplanation?.sourceRefs.length).toBeGreaterThan(0);
    expect(snapshot.recentDurableMemories).toHaveLength(2);
    expect(snapshot.sourceCounts.recentPrivateMemoryCount).toBe(1);
    expect(snapshot.sourceCounts.recentSharedMemoryCount).toBe(1);
    expect(snapshot.sourceCounts.sessionDigestAvailable).toBe(true);
    expect(snapshot.sourceCounts.learningReviewAvailable).toBe(true);
    expect(snapshot.recentExperienceUsages[0]?.usageId).toBe("usage-1");
    expect(snapshot.changeCursor).toMatchObject({
      digestGeneration: 3,
      sessionMemoryMessageCount: 4,
      sessionMemoryToolCursor: 2,
      taskChangeSeq: 5,
      memoryChangeSeq: 7,
    });
    expect(snapshot.ruleSkeleton).toMatchObject({
      topicCandidates: [
        "实现 dream 输入聚合",
        "把高信噪比输入统一收敛成 snapshot",
        "补齐 dream-store 与 dream-input。",
      ],
      confidence: "high",
      sourceSummary: {
        primarySources: [
          "focus_task",
          "recent_work",
          "session_digest",
          "session_memory",
          "durable_memory",
          "experience_usage",
          "mind_profile",
          "learning_review",
        ],
        sourceCount: 8,
        taskCount: 1,
        workCount: 1,
        durableMemoryCount: 2,
        experienceUsageCount: 1,
      },
    });
    expect(snapshot.ruleSkeleton?.confirmedFacts).toContain("最近一轮在收口 dream 输入层。");
    expect(snapshot.ruleSkeleton?.confirmedFacts).toContain("统一了 recent task/work/memory 聚合。");
    expect(snapshot.ruleSkeleton?.openLoops).toContain("接 runtime。");
    expect(snapshot.ruleSkeleton?.carryForwardCandidates).toContain("不要让 dream 自动写 MEMORY.md。");
  });

  it("builds a stable rule skeleton from existing snapshot surfaces", () => {
    const skeleton = buildDreamRuleSkeleton({
      agentId: "coder",
      collectedAt: "2026-04-20T08:00:00.000Z",
      windowStartedAt: "2026-04-17T08:00:00.000Z",
      windowHours: 72,
      sourceCounts: {
        recentTaskCount: 2,
        recentWorkCount: 1,
        recentWorkRecapCount: 1,
        recentResumeContextCount: 1,
        recentDurableMemoryCount: 1,
        recentPrivateMemoryCount: 1,
        recentSharedMemoryCount: 0,
        recentExperienceUsageCount: 0,
        sessionDigestAvailable: true,
        sessionMemoryAvailable: true,
        mindProfileAvailable: false,
        learningReviewAvailable: false,
      },
      focusTask: {
        id: "task-1",
        conversationId: "agent:coder:main",
        sessionKey: "agent:coder:main",
        agentId: "coder",
        source: "chat",
        title: "收口 dream fallback",
        status: "running",
        startedAt: "2026-04-20T07:00:00.000Z",
        createdAt: "2026-04-20T07:00:00.000Z",
        updatedAt: "2026-04-20T07:30:00.000Z",
        activities: [],
        memoryLinks: [],
        usedMethods: [],
        usedSkills: [],
      },
      sessionDigest: {
        rollingSummary: "正在收口 dream fallback 方案。",
      },
      sessionMemory: {
        summary: "当前在处理 llm 缺失时的兜底输出。",
        nextStep: "补 writer 可观察字段。",
        pendingTasks: ["确认 fallback 不影响 Obsidian mirror。"],
      },
      recentTasks: [{
        id: "task-1",
        conversationId: "agent:coder:main",
        sessionKey: "agent:coder:main",
        agentId: "coder",
        source: "chat",
        title: "收口 dream fallback",
        status: "running",
        startedAt: "2026-04-20T07:00:00.000Z",
        createdAt: "2026-04-20T07:00:00.000Z",
        updatedAt: "2026-04-20T07:30:00.000Z",
        activities: [],
        memoryLinks: [],
        usedMethods: [],
        usedSkills: [],
      }],
      recentWorkItems: [{
        taskId: "task-1",
        conversationId: "agent:coder:main",
        title: "收口 dream fallback",
        status: "running",
        source: "chat",
        startedAt: "2026-04-20T07:00:00.000Z",
        updatedAt: "2026-04-20T07:30:00.000Z",
        toolNames: [],
        artifactPaths: [],
        recentActivityTitles: [],
        workRecap: {
          taskId: "task-1",
          conversationId: "agent:coder:main",
          sessionKey: "agent:coder:main",
          agentId: "coder",
          headline: "fallback 方案已经进入 writer 对接阶段。",
          confirmedFacts: ["当前已明确 fallback 不能中断自动链。"],
          derivedFromActivityIds: [],
          updatedAt: "2026-04-20T07:25:00.000Z",
        },
        resumeContext: {
          taskId: "task-1",
          conversationId: "agent:coder:main",
          sessionKey: "agent:coder:main",
          agentId: "coder",
          currentStopPoint: "writer 字段还没补齐。",
          nextStep: "补 writer 可观察字段。",
          derivedFromActivityIds: [],
          updatedAt: "2026-04-20T07:30:00.000Z",
        },
      }],
      recentDurableMemories: [{
        id: "mem-1",
        sourcePath: "memory/2026-04-20.md",
        sourceType: "file",
        memoryType: "daily",
        visibility: "private",
        snippet: "fallback 需要保持 dream/Obsidian/doctor 都不断链。",
      }],
      recentExperienceUsages: [],
    });

    expect(skeleton.topicCandidates).toEqual([
      "收口 dream fallback",
      "补 writer 可观察字段。",
    ]);
    expect(skeleton.confirmedFacts).toContain("正在收口 dream fallback 方案。");
    expect(skeleton.confirmedFacts).toContain("当前已明确 fallback 不能中断自动链。");
    expect(skeleton.openLoops).toContain("补 writer 可观察字段。");
    expect(skeleton.openLoops).toContain("确认 fallback 不影响 Obsidian mirror。");
    expect(skeleton.openLoops).toContain("writer 字段还没补齐。");
    expect(skeleton.openLoops).toContain("任务进行中：收口 dream fallback");
    expect(skeleton.carryForwardCandidates).toEqual([]);
    expect(skeleton.confidence).toBe("high");
    expect(skeleton.sourceSummary.summaryLine).toContain("sources=focus_task+recent_work+session_digest+session_memory+durable_memory");
  });
});
