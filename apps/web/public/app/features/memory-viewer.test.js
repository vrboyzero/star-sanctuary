import { describe, expect, it } from "vitest";

import {
  buildEmailThreadConversationAdvicePrompt,
  buildEmailThreadConversationOpenNote,
  buildSharedReviewBatchActionState,
  buildSharedReviewQueueParams,
  collectActionableSharedReviewIds,
  createDefaultMemoryViewerAgentViewState,
  extractCandidateContextTargets,
  extractTaskContextTargets,
  normalizeMemoryViewerAgentViewState,
} from "./memory-viewer.js";

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
});
