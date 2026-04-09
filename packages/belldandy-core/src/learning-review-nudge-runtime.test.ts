import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildConversationPromptSnapshotArtifact, getConversationPromptSnapshotArtifactPath } from "./conversation-prompt-snapshot.js";
import { buildLearningReviewNudgeRuntimeReport } from "./learning-review-nudge-runtime.js";

describe("buildLearningReviewNudgeRuntimeReport", () => {
  it("reports latest foreground runtime trigger details from prompt snapshots", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-learning-review-doctor-"));
    try {
      const artifact = buildConversationPromptSnapshotArtifact({
        snapshot: {
          agentId: "default",
          conversationId: "goal:goal_alpha:node:node_1:run:run_1",
          runId: "run_1",
          createdAt: Date.parse("2026-04-09T14:12:00.000Z"),
          systemPrompt: "system",
          messages: [
            { role: "system", content: "system" },
            { role: "user", content: "请帮我整理这轮长期任务的经验候选" },
          ],
          deltas: [
            {
              id: "learning-review-nudge",
              deltaType: "user-prelude",
              role: "user-prelude",
              source: "learning-review-nudge",
              text: "<learning-review-nudge>\n- draft candidates -> experience_candidate_list\n</learning-review-nudge>",
              metadata: {
                lineCount: 1,
                sessionKind: "goal_node",
                triggerSources: ["explicit_user_intent", "goal_review_pressure"],
                signalKinds: ["candidate", "review"],
              },
            },
          ],
          hookSystemPromptUsed: false,
        },
      });
      const outputPath = getConversationPromptSnapshotArtifactPath({
        stateDir,
        conversationId: artifact.manifest.conversationId,
        runId: artifact.manifest.runId,
      });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2), "utf-8");

      const report = await buildLearningReviewNudgeRuntimeReport({ stateDir });
      expect(report.summary).toMatchObject({
        available: true,
        triggered: true,
        sessionKind: "goal_node",
        triggerSources: ["explicit_user_intent", "goal_review_pressure"],
        signalKinds: ["candidate", "review"],
        lineCount: 1,
      });
      expect(report.latest).toMatchObject({
        conversationId: "goal:goal_alpha:node:node_1:run:run_1",
        runId: "run_1",
      });
      expect(report.latest?.currentTurnPreview).toContain("长期任务");
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("reports latest foreground run as not triggered when no learning-review delta exists", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-learning-review-doctor-"));
    try {
      const artifact = buildConversationPromptSnapshotArtifact({
        snapshot: {
          agentId: "default",
          conversationId: "agent:default:main",
          runId: "run_2",
          createdAt: Date.parse("2026-04-09T14:20:00.000Z"),
          systemPrompt: "system",
          messages: [
            { role: "system", content: "system" },
            { role: "user", content: "最近有什么事吗？" },
          ],
          deltas: [],
          hookSystemPromptUsed: false,
        },
      });
      const outputPath = getConversationPromptSnapshotArtifactPath({
        stateDir,
        conversationId: artifact.manifest.conversationId,
        runId: artifact.manifest.runId,
      });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2), "utf-8");

      const report = await buildLearningReviewNudgeRuntimeReport({ stateDir });
      expect(report.summary).toMatchObject({
        available: true,
        triggered: false,
        sessionKind: "main",
        lineCount: 0,
      });
      expect(report.summary.headline).toContain("did not trigger");
      expect(report.latest?.currentTurnPreview).toContain("最近有什么事吗");
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
