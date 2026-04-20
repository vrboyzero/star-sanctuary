import { describe, expect, it } from "vitest";

import { buildDreamRuleSkeleton } from "./dream-input.js";
import { buildDreamPromptBundle, parseDreamModelOutput } from "./dream-prompt.js";
import type { DreamInputSnapshot } from "./dream-types.js";

describe("dream prompt parsing", () => {
  it("builds prompt input around rule skeleton instead of raw snapshot surfaces", () => {
    const snapshot: DreamInputSnapshot = {
      agentId: "coder",
      collectedAt: "2026-04-20T08:00:00.000Z",
      windowStartedAt: "2026-04-17T08:00:00.000Z",
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
        recentExperienceUsageCount: 1,
        sessionDigestAvailable: true,
        sessionMemoryAvailable: true,
        mindProfileAvailable: false,
        learningReviewAvailable: false,
      },
      focusTask: {
        id: "task-1",
        conversationId: "agent:coder:main",
        sessionKey: "agent:coder:main",
        source: "chat",
        title: "收口 dream prompt",
        status: "success",
        startedAt: "2026-04-20T07:00:00.000Z",
        createdAt: "2026-04-20T07:00:00.000Z",
        updatedAt: "2026-04-20T07:30:00.000Z",
        activities: [],
        memoryLinks: [],
        usedMethods: [],
        usedSkills: [],
      },
      sessionDigest: {
        rollingSummary: "规则骨架已经成形。",
      },
      sessionMemory: {
        currentWork: "把 prompt 改成消费 rule skeleton。",
        nextStep: "补 runtime fallback。",
      },
      recentTasks: [],
      recentWorkItems: [],
      recentDurableMemories: [{
        id: "mem-1",
        sourcePath: "memory/2026-04-20.md",
        sourceType: "file",
        snippet: "prompt 应优先消费骨架而非松散 snapshot。",
      }],
      recentExperienceUsages: [{
        usageId: "usage-1",
        taskId: "task-1",
        assetType: "method",
        assetKey: "dream-prompt",
        usageCount: 1,
        usedVia: "tool",
        createdAt: "2026-04-20T07:10:00.000Z",
      }],
    };
    snapshot.ruleSkeleton = buildDreamRuleSkeleton(snapshot);

    const bundle = buildDreamPromptBundle(snapshot);

    expect(bundle.system).toContain("规则骨架");
    expect(bundle.inputView).toMatchObject({
      ruleSkeleton: {
        topicCandidates: ["收口 dream prompt", "把 prompt 改成消费 rule skeleton。", "补 runtime fallback。"],
        confidence: "high",
      },
      anchors: {
        focusTaskTitle: "收口 dream prompt",
        currentWork: "把 prompt 改成消费 rule skeleton。",
        nextStep: "补 runtime fallback。",
      },
    });
    expect(bundle.inputView).not.toHaveProperty("recentWorkItems");
    expect(bundle.user).toContain("\"ruleSkeleton\"");
  });

  it("parses pure JSON output", () => {
    const result = parseDreamModelOutput(JSON.stringify({
      headline: "Dream ready",
      summary: "纯 JSON 输出可以正常解析。",
      narrative: "dream 会直接读取 JSON 字段。",
      stableInsights: ["保持现有 dream 写回边界。"],
      corrections: [],
      openQuestions: [],
      shareCandidates: [],
      nextFocus: ["继续观察自动 dream。"],
    }));

    expect(result.headline).toBe("Dream ready");
    expect(result.nextFocus).toEqual(["继续观察自动 dream。"]);
  });

  it("parses JSON wrapped by think tags and markdown fence", () => {
    const raw = [
      "<think>",
      "让我先整理一下输入。",
      "这部分不要进入最终输出。",
      "</think>",
      "```json",
      "{",
      "  \"headline\": \"Dream runtime ready\",",
      "  \"summary\": \"即使模型先输出 think，再给 JSON，也应该能解析。\",",
      "  \"narrative\": \"解析层应跳过推理包裹，只读取 JSON 对象。\",",
      "  \"stableInsights\": [\"dream 不应因 think 包装直接失败。\"],",
      "  \"corrections\": [],",
      "  \"openQuestions\": [],",
      "  \"shareCandidates\": [],",
      "  \"nextFocus\": [\"继续验证自动 dream 运行。\"]",
      "}",
      "```",
    ].join("\n");

    const result = parseDreamModelOutput(raw);
    expect(result.headline).toBe("Dream runtime ready");
    expect(result.stableInsights).toEqual(["dream 不应因 think 包装直接失败。"]);
  });

  it("parses JSON object embedded in explanatory prose", () => {
    const raw = [
      "下面是最终 JSON：",
      "{",
      "  \"headline\": \"Embedded JSON\",",
      "  \"summary\": \"前后有说明文字时也应提取对象。\",",
      "  \"narrative\": \"只要能找到首个完整 JSON 对象，就不应直接失败。\",",
      "  \"stableInsights\": [],",
      "  \"corrections\": [],",
      "  \"openQuestions\": [],",
      "  \"shareCandidates\": [],",
      "  \"nextFocus\": []",
      "}",
      "请按此写入。",
    ].join("\n");

    const result = parseDreamModelOutput(raw);
    expect(result.summary).toBe("前后有说明文字时也应提取对象。");
  });
});
