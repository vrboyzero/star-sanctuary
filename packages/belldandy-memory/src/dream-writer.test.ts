import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildDreamRuleSkeleton } from "./dream-input.js";
import { writeDreamArtifacts } from "./dream-writer.js";
import type { DreamInputSnapshot, DreamRecord } from "./dream-types.js";

describe("dream writer", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
    tempDirs.length = 0;
  });

  it("writes dream markdown and DREAM.md index", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-dream-writer-"));
    tempDirs.push(stateDir);

    const dreamPath = path.join(stateDir, "dreams", "2026", "04", "2026-04-19--dream-1.md");
    const record: DreamRecord = {
      id: "dream-1",
      agentId: "coder",
      status: "completed",
      triggerMode: "manual",
      requestedAt: "2026-04-19T12:00:00.000Z",
      startedAt: "2026-04-19T12:00:00.000Z",
      finishedAt: "2026-04-19T12:01:00.000Z",
      conversationId: "agent:coder:main",
      summary: "runtime 已完成接线",
      dreamPath,
      indexPath: path.join(stateDir, "DREAM.md"),
      generationMode: "llm",
    };
    const snapshot: DreamInputSnapshot = {
      agentId: "coder",
      collectedAt: "2026-04-19T12:00:00.000Z",
      windowStartedAt: "2026-04-16T12:00:00.000Z",
      windowHours: 72,
      conversationId: "agent:coder:main",
      sourceCounts: {
        recentTaskCount: 1,
        recentWorkCount: 1,
        recentWorkRecapCount: 1,
        recentResumeContextCount: 1,
        recentDurableMemoryCount: 1,
        recentPrivateMemoryCount: 1,
        recentSharedMemoryCount: 0,
        recentExperienceUsageCount: 0,
        sessionDigestAvailable: true,
        sessionMemoryAvailable: true,
        mindProfileAvailable: true,
        learningReviewAvailable: true,
      },
      recentTasks: [],
      recentWorkItems: [],
      recentDurableMemories: [],
      recentExperienceUsages: [],
      sessionDigest: {
        rollingSummary: "最近在实现 dream runtime。",
      },
      sessionMemory: {
        summary: "已完成 Step 3 主链路。",
      },
      mindProfileSnapshot: {
        profile: {
          headline: "当前重点是 dream 手动链路。",
        },
      },
      learningReviewInput: {
        summary: {
          headline: "继续补观测与验证。",
        },
      },
    };

    const result = await writeDreamArtifacts({
      stateDir,
      agentId: "coder",
      dreamPath,
      record,
      draft: {
        headline: "Dream runtime ready",
        summary: "手动运行与文件写回已经打通。",
        narrative: "本轮主要目标是把 dream 结果稳定写入私有文件。",
        stableInsights: ["先打通 manual run，再逐步补自动 gate。"],
        corrections: ["dream 当前不应写 MEMORY.md。"],
        openQuestions: ["Step 4 是否需要马上接入 UI。"],
        shareCandidates: [{
          title: "dream-runtime handoff",
          reason: "可形成后续 observability 的基础",
          suggestedVisibility: "shared_candidate",
        }],
        nextFocus: ["补 dream.status.get 与 history.list 观测。"],
      },
      snapshot,
      previousRuns: [],
    });

    const dreamContent = await fs.readFile(result.dreamPath, "utf-8");
    const indexContent = await fs.readFile(result.indexPath, "utf-8");

    expect(dreamContent).toContain("## Stable Insights");
    expect(dreamContent).toContain("dream 当前不应写 MEMORY.md");
    expect(dreamContent).toContain("- Generation Mode: llm");
    expect(dreamContent).toContain("- Rule Skeleton Source Summary:");
    expect(indexContent).toContain("| Time | Run ID | Status | Summary | File |");
    expect(indexContent).toContain("dream-1");
  });

  it("writes fallback dream markdown with fixed fallback sections", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-dream-writer-fallback-"));
    tempDirs.push(stateDir);

    const dreamPath = path.join(stateDir, "dreams", "2026", "04", "2026-04-19--dream-fallback.md");
    const record: DreamRecord = {
      id: "dream-fallback",
      agentId: "coder",
      status: "completed",
      triggerMode: "manual",
      requestedAt: "2026-04-19T12:00:00.000Z",
      startedAt: "2026-04-19T12:00:00.000Z",
      finishedAt: "2026-04-19T12:01:00.000Z",
      conversationId: "agent:coder:main",
      summary: "fallback dream ready",
      dreamPath,
      indexPath: path.join(stateDir, "DREAM.md"),
      generationMode: "fallback",
      fallbackReason: "missing_model_config",
    };
    const snapshot: DreamInputSnapshot = {
      agentId: "coder",
      collectedAt: "2026-04-19T12:00:00.000Z",
      windowStartedAt: "2026-04-16T12:00:00.000Z",
      windowHours: 72,
      conversationId: "agent:coder:main",
      sourceCounts: {
        recentTaskCount: 1,
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
      sessionDigest: {
        rollingSummary: "规则骨架已经可用。",
      },
      sessionMemory: {
        summary: "当前需要在没有模型时写 fallback dream。",
        nextStep: "继续观察 writer 输出。",
      },
      recentTasks: [],
      recentWorkItems: [],
      recentDurableMemories: [{
        id: "mem-1",
        sourcePath: "memory/2026-04-19.md",
        sourceType: "file",
        snippet: "fallback 不应中断自动链。",
      }],
      recentExperienceUsages: [],
      ruleSkeleton: {
        topicCandidates: ["收口 dream fallback"],
        confirmedFacts: ["规则骨架已经可用。", "fallback 不应中断自动链。"],
        openLoops: ["继续观察 writer 输出。"],
        carryForwardCandidates: ["后续补 doctor 可观察字段。"],
        confidence: "medium",
        sourceSummary: {
          primarySources: ["session_digest", "session_memory", "durable_memory"],
          sourceCount: 3,
          taskCount: 1,
          workCount: 1,
          durableMemoryCount: 1,
          experienceUsageCount: 0,
          summaryLine: "sources=session_digest+session_memory+durable_memory; tasks=1; work=1; durable=1; usages=0",
        },
      },
    };

    const ruleSkeleton = snapshot.ruleSkeleton ?? buildDreamRuleSkeleton(snapshot);

    const result = await writeDreamArtifacts({
      stateDir,
      agentId: "coder",
      dreamPath,
      record,
      draft: {
        headline: "Dream Fallback - coder - 2026-04-19",
        summary: "fallback dream generated from rule skeleton",
        narrative: "当前缺少可用的 dream 模型配置。",
        generationMode: "fallback",
        fallbackReason: "missing_model_config",
        stableInsights: ruleSkeleton.confirmedFacts,
        corrections: [],
        openQuestions: ruleSkeleton.openLoops,
        shareCandidates: [],
        nextFocus: ruleSkeleton.carryForwardCandidates,
      },
      snapshot,
      previousRuns: [],
    });

    const dreamContent = await fs.readFile(result.dreamPath, "utf-8");
    expect(dreamContent).toContain("- Generation Mode: fallback");
    expect(dreamContent).toContain("- Fallback Reason: missing_model_config");
    expect(dreamContent).toContain("## 本次主题候选");
    expect(dreamContent).toContain("## 已确认事实");
    expect(dreamContent).toContain("## 未闭环事项");
    expect(dreamContent).toContain("## 建议继续观察");
    expect(dreamContent).not.toContain("## Narrative");
  });
});
