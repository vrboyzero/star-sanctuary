import { describe, expect, it } from "vitest";

import {
  buildDreamRuntimeBarView,
  buildEmailThreadConversationAdvicePrompt,
  buildEmailThreadConversationOpenNote,
  buildMemoryDetailCollapsedPreview,
  buildSharedReviewBatchActionState,
  buildSharedReviewQueueParams,
  collectActionableSharedReviewIds,
  createDefaultMemoryViewerAgentViewState,
  extractCandidateContextTargets,
  extractTaskContextTargets,
  formatDreamFallbackReasonLabel,
  formatDreamGenerationModeLabel,
  getMemoryViewerListPageSize,
  normalizeMemoryViewerAgentViewState,
  paginateMemoryViewerItems,
} from "./memory-viewer.js";
import { buildDreamHistoryPanelView } from "./memory-viewer-dream-history.js";

describe("memory viewer shared review filters", () => {
  it("builds an explicit advice request prompt for opened email thread conversations", () => {
    const prompt = buildEmailThreadConversationAdvicePrompt({
      latestSubject: "Re: Kickoff",
      latestTriageSummary: "需要尽快回复并确认时间",
      latestSuggestedReplyStarter: "Hi Alice,",
      latestSuggestedReplyQuality: "review_required",
    });

    expect(prompt).toContain("我刚从邮件线程整理打开了这个线程");
    expect(prompt).toContain("线程整理摘要: 需要尽快回复并确认时间");
    expect(prompt).toContain("建议回复 starter: Hi Alice,");
  });

  it("builds a compact organizer note for opening email thread conversations", () => {
    expect(buildEmailThreadConversationOpenNote({
      latestTriageSummary: "需要尽快回复并确认时间",
      latestSuggestedReplySubject: "Re: Kickoff",
      latestSuggestedReplyStarter: "Hi Alice,",
      latestSuggestedReplyQuality: "review_required",
      latestSuggestedReplyConfidence: "medium",
      latestSuggestedReplyWarnings: ["先核对日期。"],
      latestSuggestedReplyDraft: [
        "Hi Alice,",
        "",
        "Thanks for following up.",
        "I am checking the schedule now.",
        "Will confirm the final time by tomorrow.",
      ].join("\n"),
    })).toContain("线程整理摘要: 需要尽快回复并确认时间");

    expect(buildEmailThreadConversationOpenNote({
      latestTriageSummary: "需要尽快回复并确认时间",
      latestSuggestedReplySubject: "Re: Kickoff",
      latestSuggestedReplyStarter: "Hi Alice,",
      latestSuggestedReplyQuality: "review_required",
      latestSuggestedReplyConfidence: "medium",
      latestSuggestedReplyWarnings: ["先核对日期。"],
      latestSuggestedReplyDraft: [
        "Hi Alice,",
        "",
        "Thanks for following up.",
        "I am checking the schedule now.",
        "Will confirm the final time by tomorrow.",
      ].join("\n"),
    })).toContain("建议回复草稿摘录");
  });

  it("defaults shared review queue to pending status", () => {
    expect(buildSharedReviewQueueParams({
      reviewerAgentId: "coder",
    })).toEqual({
      limit: 50,
      reviewerAgentId: "coder",
      filter: {
        sharedPromotionStatus: "pending",
      },
    });
  });

  it("maps actionable focus and target agent filters into queue params", () => {
    expect(buildSharedReviewQueueParams({
      reviewerAgentId: "coder",
      query: "timeout",
      governanceStatus: "approved",
      sharedReviewFilters: {
        focus: "actionable",
        targetAgentId: "default",
      },
    })).toEqual({
      limit: 50,
      reviewerAgentId: "coder",
      query: "timeout",
      filter: {
        sharedPromotionStatus: "approved",
        actionableOnly: true,
        targetAgentId: "default",
      },
    });
  });

  it("maps my-claims focus and explicit claimed owner filters correctly", () => {
    expect(buildSharedReviewQueueParams({
      reviewerAgentId: "reviewer",
      sharedReviewFilters: {
        focus: "mine",
      },
    })).toEqual({
      limit: 50,
      reviewerAgentId: "reviewer",
      filter: {
        sharedPromotionStatus: "pending",
        claimedByAgentId: "reviewer",
      },
    });

    expect(buildSharedReviewQueueParams({
      reviewerAgentId: "reviewer",
      sharedReviewFilters: {
        claimedByAgentId: "coder",
      },
    })).toEqual({
      limit: 50,
      reviewerAgentId: "reviewer",
      filter: {
        sharedPromotionStatus: "pending",
        claimedByAgentId: "coder",
      },
    });
  });

  it("derives batch action counts from selected shared review items", () => {
    const state = buildSharedReviewBatchActionState([
      {
        id: "claimable",
        reviewStatus: "pending",
        claimTimedOut: false,
        actionableByReviewer: true,
      },
      {
        id: "mine",
        reviewStatus: "pending",
        claimOwner: "reviewer",
        claimTimedOut: false,
        actionableByReviewer: true,
      },
      {
        id: "overdue",
        reviewStatus: "pending",
        claimOwner: "coder",
        claimTimedOut: true,
        actionableByReviewer: true,
      },
      {
        id: "approved",
        reviewStatus: "approved",
      },
      {
        id: "blocked",
        reviewStatus: "pending",
        claimOwner: "coder",
        claimTimedOut: false,
        actionableByReviewer: false,
      },
    ], ["claimable", "mine", "overdue", "approved", "blocked"], "reviewer");

    expect(state.selectedCount).toBe(5);
    expect(state.actions.claim.map((item) => item.id)).toEqual(["claimable", "overdue"]);
    expect(state.actions.release.map((item) => item.id)).toEqual(["mine"]);
    expect(state.actions.approved.map((item) => item.id)).toEqual(["claimable", "mine", "overdue"]);
    expect(state.actions.rejected.map((item) => item.id)).toEqual(["claimable", "mine", "overdue"]);
    expect(state.actions.revoked.map((item) => item.id)).toEqual(["approved"]);
  });

  it("collects only currently actionable shared review ids", () => {
    expect(collectActionableSharedReviewIds([
      {
        id: "claimable",
        reviewStatus: "pending",
        actionableByReviewer: true,
      },
      {
        id: "mine",
        reviewStatus: "pending",
        claimOwner: "reviewer",
        actionableByReviewer: true,
      },
      {
        id: "approved",
        reviewStatus: "approved",
      },
      {
        id: "blocked",
        reviewStatus: "pending",
        claimOwner: "coder",
        actionableByReviewer: false,
      },
    ], "reviewer")).toEqual(["claimable", "mine", "approved"]);
  });

  it("extracts task context entry targets from linked memories and usage records", () => {
    expect(extractTaskContextTargets({
      memoryLinks: [{ chunkId: "mem_a" }, { chunkId: " mem_a " }, { chunkId: "mem_b" }],
      artifactPaths: [" docs/a.md ", "", "docs/b.md"],
      usedMethods: [{ sourceCandidateId: "cand_method" }],
      usedSkills: [{ sourceCandidateId: "cand_skill" }, { sourceCandidateId: "cand_method" }],
    })).toEqual({
      firstMemoryId: "mem_a",
      memoryCount: 2,
      firstArtifactPath: "docs/a.md",
      artifactCount: 2,
      firstCandidateId: "cand_method",
      candidateCount: 2,
    });
  });

  it("extracts candidate context entry targets from source snapshot", () => {
    expect(extractCandidateContextTargets({
      taskId: "task_source_1",
      publishedPath: " methods/demo.md ",
      sourceTaskSnapshot: {
        conversationId: "goal:goal_demo",
        memoryLinks: [{ chunkId: "mem_source_1" }, { chunkId: " mem_source_1 " }, { chunkId: "mem_source_2" }],
        artifactPaths: [" artifacts/out.md ", "artifacts/log.md"],
      },
    })).toEqual({
      sourceTaskId: "task_source_1",
      sourceConversationId: "goal:goal_demo",
      firstMemoryId: "mem_source_1",
      memoryCount: 2,
      firstArtifactPath: "artifacts/out.md",
      artifactCount: 2,
      publishedPath: "methods/demo.md",
    });
  });

  it("creates a clean default memory viewer view state for a resident agent", () => {
    expect(createDefaultMemoryViewerAgentViewState("outboundAudit")).toEqual({
      tab: "outboundAudit",
      outboundAuditFocus: "all",
      searchQuery: "",
      taskStatus: "",
      taskSource: "",
      memoryType: "",
      memoryVisibility: "",
      memoryGovernance: "",
      sharedReviewGovernance: "pending",
      memoryCategory: "",
      sharedReviewFilters: {
        focus: "",
        targetAgentId: "",
        claimedByAgentId: "",
      },
      goalIdFilter: null,
    });
  });

  it("normalizes persisted memory viewer agent view state before restoring filters", () => {
    expect(normalizeMemoryViewerAgentViewState({
      tab: " outboundAudit ",
      outboundAuditFocus: " threads ",
      searchQuery: " note ",
      taskStatus: " done ",
      taskSource: " cron ",
      memoryType: " decision ",
      memoryVisibility: " shared ",
      memoryGovernance: " pending ",
      sharedReviewGovernance: " approved ",
      memoryCategory: " architecture ",
      sharedReviewFilters: {
        focus: "mine",
        targetAgentId: " default ",
        claimedByAgentId: " reviewer ",
      },
      goalIdFilter: " goal_demo ",
    }, "tasks")).toEqual({
      tab: "outboundAudit",
      outboundAuditFocus: "threads",
      searchQuery: "note",
      taskStatus: "done",
      taskSource: "cron",
      memoryType: "decision",
      memoryVisibility: "shared",
      memoryGovernance: "pending",
      sharedReviewGovernance: "approved",
      memoryCategory: "architecture",
      sharedReviewFilters: {
        focus: "mine",
        targetAgentId: "default",
        claimedByAgentId: "reviewer",
      },
      goalIdFilter: "goal_demo",
    });
  });

  it("uses smaller page sizes for heavy memory viewer lists", () => {
    expect(getMemoryViewerListPageSize("tasks")).toBe(20);
    expect(getMemoryViewerListPageSize("memories")).toBe(20);
    expect(getMemoryViewerListPageSize("sharedReview")).toBe(25);
    expect(getMemoryViewerListPageSize("outboundAudit")).toBe(25);
  });

  it("paginates memory viewer items with stable page metadata", () => {
    const pagination = paginateMemoryViewerItems(
      Array.from({ length: 26 }, (_, index) => ({ id: `item-${index + 1}` })),
      { page: 1, pageSize: 20 },
    );

    expect(pagination.currentPage).toBe(1);
    expect(pagination.totalPages).toBe(2);
    expect(pagination.visibleStart).toBe(21);
    expect(pagination.visibleEnd).toBe(26);
    expect(pagination.visibleItems.map((item) => item.id)).toEqual([
      "item-21",
      "item-22",
      "item-23",
      "item-24",
      "item-25",
      "item-26",
    ]);
  });

  it("builds collapsed previews for oversized memory detail blocks", () => {
    const preview = buildMemoryDetailCollapsedPreview(
      Array.from({ length: 20 }, (_, index) => `line-${index + 1}`).join("\n"),
      { maxLines: 4, maxChars: 200 },
    );

    expect(preview.truncated).toBe(true);
    expect(preview.lineCount).toBe(20);
    expect(preview.preview).toContain("line-1");
    expect(preview.preview).not.toContain("line-20");
    expect(preview.preview.endsWith("\n…")).toBe(true);
  });

  it("formats dream generation mode and fallback reason labels", () => {
    expect(formatDreamGenerationModeLabel("llm")).toBe("LLM");
    expect(formatDreamGenerationModeLabel("fallback")).toBe("Fallback");
    expect(formatDreamFallbackReasonLabel("missing_model_config")).toBe("缺少模型配置");
    expect(formatDreamFallbackReasonLabel("llm_call_failed")).toBe("LLM 调用失败");
  });

  it("builds memory viewer dream bar text with fallback observability and enabled run button", () => {
    const view = buildDreamRuntimeBarView({
      connected: true,
      dreamBusy: false,
      dreamRuntime: {
        requested: {
          agentId: "coder",
          defaultConversationId: "agent:coder:main",
        },
        availability: {
          enabled: true,
          available: false,
          reason: "missing model/baseUrl/apiKey",
        },
        state: {
          status: "idle",
          lastObsidianSync: {
            stage: "synced",
            targetPath: "E:/vaults/main/Star Sanctuary/Agents/coder/Dreams/2026/04/dream-1.md",
            updatedAt: "2026-04-20T12:06:00.000Z",
          },
          autoStats: {
            attemptedCount: 2,
            executedCount: 1,
            skippedCount: 1,
          },
          recentRuns: [
            {
              id: "dream-1",
              status: "completed",
              finishedAt: "2026-04-20T12:00:00.000Z",
              summary: "fallback dream generated from rule skeleton",
              generationMode: "fallback",
              fallbackReason: "missing_model_config",
            },
          ],
        },
      },
      dreamCommons: {
        availability: {
          enabled: true,
          available: true,
          vaultPath: "E:/vaults/main",
        },
        state: {
          status: "completed",
          lastSuccessAt: "2026-04-20T12:05:00.000Z",
          approvedCount: 3,
          revokedCount: 1,
          noteCount: 4,
        },
      },
    }, {
      formatDateTime: (value) => value || "-",
      formatCount: (value) => String(value ?? 0),
    });

    expect(view.statusLine).toContain("fallback 就绪");
    expect(view.metaLine).toContain("agent:coder:main");
    expect(view.obsidianLine).toContain("Obsidian：synced");
    expect(view.obsidianLine).toContain("E:/vaults/main/Star Sanctuary/Agents/coder/Dreams/2026/04/dream-1.md");
    expect(view.summaryLine).toContain("生成：Fallback (缺少模型配置)");
    expect(view.summaryLine).toContain("Commons：completed · approved 3 / revoked 1 / notes 4");
    expect(view.runDisabled).toBe(false);
    expect(view.runTitle).toBe("");
  });

  it("builds dream history panel view with selected dream detail", () => {
    const view = buildDreamHistoryPanelView({
      connected: true,
      open: true,
      items: [
        {
          id: "dream-2",
          status: "completed",
          triggerMode: "manual",
          requestedAt: "2026-04-20T13:00:00.000Z",
          finishedAt: "2026-04-20T13:01:00.000Z",
          summary: "fallback dream generated from rule skeleton",
          generationMode: "fallback",
          fallbackReason: "missing_model_config",
          dreamPath: "state/dreams/dream-2.md",
          obsidianSync: {
            stage: "synced",
            targetPath: "vault/Star Sanctuary/Agents/coder/Dreams/2026/04/dream-2.md",
          },
        },
      ],
      selectedId: "dream-2",
      selectedItem: {
        id: "dream-2",
        status: "completed",
        triggerMode: "manual",
        requestedAt: "2026-04-20T13:00:00.000Z",
        finishedAt: "2026-04-20T13:01:00.000Z",
        summary: "fallback dream generated from rule skeleton",
        generationMode: "fallback",
        fallbackReason: "missing_model_config",
        dreamPath: "state/dreams/dream-2.md",
        obsidianSync: {
          stage: "synced",
          targetPath: "vault/Star Sanctuary/Agents/coder/Dreams/2026/04/dream-2.md",
        },
      },
      selectedContent: "# Dream Fallback\n\n## 本次主题候选\n- runtime",
    }, {
      formatDateTime: (value) => value || "-",
    });

    expect(view.open).toBe(true);
    expect(view.historyStatusLine).toContain("1 条");
    expect(view.entries[0]?.isActive).toBe(true);
    expect(view.entries[0]?.meta.join(" · ")).toContain("Fallback");
    expect(view.detail.title).toContain("fallback dream generated");
    expect(view.detail.cards.some((card) => card.label === "生成" && String(card.value).includes("Fallback"))).toBe(true);
    expect(view.detail.content).toContain("# Dream Fallback");
  });
});
