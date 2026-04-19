import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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
    expect(indexContent).toContain("| Time | Run ID | Status | Summary | File |");
    expect(indexContent).toContain("dream-1");
  });
});
