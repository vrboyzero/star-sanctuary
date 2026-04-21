// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createMemoryDetailRenderFeature } from "./memory-detail-render.js";
import { createMemoryViewerFeature } from "./memory-viewer.js";

function createHarness() {
  document.body.innerHTML = `
    <div id="memoryViewerDetail"></div>
    <div id="memoryViewerStats"></div>
  `;

  const refs = {
    memoryViewerDetailEl: document.getElementById("memoryViewerDetail"),
    memoryViewerStatsEl: document.getElementById("memoryViewerStats"),
    memoryChunkCategoryFilterEl: null,
  };

  const state = {
    tab: "tasks",
    items: [],
    stats: null,
    selectedId: "task-1",
    selectedTask: null,
    selectedCandidate: null,
    pendingUsageRevokeId: null,
    pendingExperienceActionKey: null,
    activeAgentId: "default",
  };

  const loadCandidateDetail = vi.fn(async () => {});
  const openExperienceCandidate = vi.fn(async () => {});
  const runtime = {
    generateExperienceCandidate: vi.fn(async () => {}),
    reviewExperienceCandidate: vi.fn(async () => {}),
    updateSkillFreshnessStaleMark: vi.fn(async () => {}),
  };

  const viewerFeature = createMemoryViewerFeature({
    refs: {
      memoryViewerSection: null,
      memoryViewerTitleEl: null,
      memoryViewerStatsEl: refs.memoryViewerStatsEl,
      memoryViewerListEl: null,
      memoryViewerDetailEl: refs.memoryViewerDetailEl,
      memoryDreamBarEl: null,
      memoryDreamStatusEl: null,
      memoryDreamMetaEl: null,
      memoryDreamObsidianEl: null,
      memoryDreamSummaryEl: null,
      memoryDreamRefreshBtn: null,
      memoryDreamRunBtn: null,
      memoryDreamHistoryToggleBtn: null,
      memoryDreamHistoryEl: null,
      memoryDreamHistoryStatusEl: null,
      memoryDreamHistoryRefreshBtn: null,
      memoryDreamHistoryListEl: null,
      memoryDreamHistoryDetailEl: null,
      memoryTabTasksBtn: null,
      memoryTabMemoriesBtn: null,
      memoryTabSharedReviewBtn: null,
      memoryTabOutboundAuditBtn: null,
      memoryOutboundAuditFiltersEl: null,
      memoryOutboundAuditFocusAllBtn: null,
      memoryOutboundAuditFocusThreadsBtn: null,
      memorySharedReviewBatchBarEl: null,
      memoryTaskFiltersEl: null,
      memoryChunkFiltersEl: null,
      memorySearchInputEl: null,
      memoryTaskStatusFilterEl: null,
      memoryTaskSourceFilterEl: null,
      memoryChunkTypeFilterEl: null,
      memoryChunkVisibilityFilterEl: null,
      memoryChunkGovernanceFilterEl: null,
      memoryChunkCategoryFilterEl: null,
      memorySharedReviewFiltersEl: null,
      memorySharedReviewFocusFilterEl: null,
      memorySharedReviewTargetFilterEl: null,
      memorySharedReviewClaimedByFilterEl: null,
    },
    isConnected: () => true,
    sendReq: vi.fn(),
    makeId: () => "req-1",
    getMemoryViewerState: () => state,
    getSelectedAgentId: () => "default",
    getSelectedAgentLabel: () => "default",
    getAvailableAgents: () => [],
    syncMemoryTaskGoalFilterUi: vi.fn(),
    renderMemoryViewerListEmpty: vi.fn(),
    renderMemoryViewerDetailEmpty: vi.fn(),
    loadTaskDetail: vi.fn(),
    loadMemoryDetail: vi.fn(),
    escapeHtml: (value) => String(value ?? ""),
    formatCount: (value) => String(value ?? 0),
    formatDateTime: (value) => String(value ?? ""),
    formatDuration: (value) => String(value ?? ""),
    formatLineRange: () => "",
    formatScore: (value) => String(value ?? ""),
    formatMemoryCategory: (value) => String(value ?? ""),
    normalizeMemoryVisibility: (value) => String(value ?? ""),
    getVisibilityBadgeClass: () => "",
    summarizeSourcePath: (value) => String(value ?? ""),
    getTaskGoalId: () => "",
    getGoalDisplayName: () => "",
    getLatestExperienceUsageTimestamp: () => "",
    getActiveMemoryCategoryLabel: () => "",
    renderMemoryCategoryDistribution: () => "",
    renderTaskUsageOverviewCard: () => "",
    bindStatsAuditJumpLinks: vi.fn(),
    bindMemoryPathLinks: vi.fn(),
    bindTaskAuditJumpLinks: vi.fn(),
    openConversationSession: vi.fn(),
    showNotice: vi.fn(),
    t: (_key, _params, fallback) => fallback ?? "",
  });

  const detailRenderFeature = createMemoryDetailRenderFeature({
    refs,
    isConnected: () => true,
    sendReq: vi.fn(),
    makeId: () => "req-1",
    getMemoryViewerState: () => state,
    getMemoryViewerFeature: () => viewerFeature,
    getMemoryRuntimeFeature: () => runtime,
    getGoalDisplayName: () => "",
    getCurrentAgentSelection: () => "default",
    renderMemoryViewerDetailEmpty: vi.fn(),
    renderMemoryViewerStats: vi.fn(),
    loadTaskUsageOverview: vi.fn(async () => {}),
    loadTaskDetail: vi.fn(async () => {}),
    loadCandidateDetail,
    openExperienceCandidate,
    openTaskFromAudit: vi.fn(async () => {}),
    openMemoryFromAudit: vi.fn(async () => {}),
    openSourcePath: vi.fn(async () => {}),
    loadGoals: vi.fn(async () => {}),
    switchMode: vi.fn(),
    openGoalTaskViewer: vi.fn(async () => {}),
    showNotice: vi.fn(),
    escapeHtml: (value) => String(value ?? ""),
    formatDateTime: (value) => String(value ?? ""),
    t: (_key, _params, fallback) => fallback ?? "",
  });

  return { refs, state, runtime, detailRenderFeature, loadCandidateDetail, openExperienceCandidate };
}

describe("memory detail render actions", () => {
  it("binds generate/review/stale actions in task detail", async () => {
    const { refs, state, runtime, detailRenderFeature } = createHarness();
    state.selectedCandidate = {
      id: "exp-skill-pending",
      taskId: "task-1",
      type: "skill",
      status: "draft",
      title: "技能候选",
      slug: "skill-demo",
      content: "# skill",
      summary: "summary",
      sourceTaskSnapshot: {},
      skillFreshness: {
        status: "needs_patch",
        skillKey: "demo skill",
        sourceCandidateId: "exp-skill-accepted",
        summary: "需要补丁",
        signals: [],
        suggestion: {
          kind: "review_patch_candidate",
          summary: "open patch",
          candidateId: "exp-patch-1",
        },
      },
    };
    state.selectedTask = {
      id: "task-1",
      conversationId: "conv-1",
      status: "success",
      source: "chat",
      title: "任务一",
      usedMethods: [],
      usedSkills: [
        {
          usageId: "usage-skill-1",
          taskId: "task-1",
          assetType: "skill",
          assetKey: "demo skill",
          usedVia: "tool",
          createdAt: "2026-04-20T00:00:00.000Z",
          usageCount: 1,
          lastUsedAt: "2026-04-20T00:00:00.000Z",
          lastUsedTaskId: "task-1",
          sourceCandidateId: "exp-skill-accepted",
          sourceCandidateStatus: "accepted",
          skillFreshness: {
            status: "warn_stale",
            skillKey: "demo skill",
            sourceCandidateId: "exp-skill-accepted",
            summary: "说明可能过期",
            signals: [],
            suggestion: {
              kind: "monitor",
              summary: "继续观察",
            },
          },
        },
      ],
      activities: [],
      toolCalls: [],
      memoryLinks: [],
      artifactPaths: [],
    };

    detailRenderFeature.renderTaskDetail(state.selectedTask);

    refs.memoryViewerDetailEl.querySelector("[data-generate-experience-type='method']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    refs.memoryViewerDetailEl.querySelector("[data-review-candidate-action='accept']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    refs.memoryViewerDetailEl.querySelector("[data-skill-freshness-stale-action='mark']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(runtime.generateExperienceCandidate).toHaveBeenCalledWith("task-1", "method");
    expect(runtime.reviewExperienceCandidate).toHaveBeenCalledWith("exp-skill-pending", "accept", { taskId: "task-1" });
    expect(runtime.updateSkillFreshnessStaleMark).toHaveBeenCalledWith({
      sourceCandidateId: "exp-skill-accepted",
      skillKey: "demo skill",
      taskId: "task-1",
      candidateId: "exp-skill-pending",
      stale: true,
    });
  });

  it("opens patch candidate from skill freshness detail", async () => {
    const { refs, state, detailRenderFeature, loadCandidateDetail } = createHarness();
    state.selectedCandidate = {
      id: "exp-skill-pending",
      taskId: "task-1",
      type: "skill",
      status: "draft",
      title: "技能候选",
      slug: "skill-demo",
      content: "# skill",
      summary: "summary",
      sourceTaskSnapshot: {},
      skillFreshness: {
        status: "needs_patch",
        skillKey: "demo skill",
        sourceCandidateId: "exp-skill-accepted",
        summary: "需要补丁",
        signals: [],
        suggestion: {
          kind: "review_patch_candidate",
          summary: "open patch",
          candidateId: "exp-patch-1",
        },
      },
    };
    state.selectedTask = {
      id: "task-1",
      conversationId: "conv-1",
      status: "success",
      source: "chat",
      title: "任务一",
      usedMethods: [],
      usedSkills: [],
      activities: [],
      toolCalls: [],
      memoryLinks: [],
      artifactPaths: [],
    };

    detailRenderFeature.renderTaskDetail(state.selectedTask);

    refs.memoryViewerDetailEl.querySelector("[data-open-candidate-id='exp-patch-1']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(loadCandidateDetail).toHaveBeenCalledWith("exp-patch-1");
  });

  it("opens experience workbench candidate entry from memory detail actions", async () => {
    const { refs, state, detailRenderFeature, openExperienceCandidate } = createHarness();
    state.selectedCandidate = {
      id: "exp-skill-pending",
      taskId: "task-1",
      type: "skill",
      status: "draft",
      title: "技能候选",
      slug: "skill-demo",
      content: "# skill",
      summary: "summary",
      sourceTaskSnapshot: {},
    };
    state.selectedTask = {
      id: "task-1",
      conversationId: "conv-1",
      status: "success",
      source: "chat",
      title: "任务一",
      usedMethods: [{ sourceCandidateId: "exp-method-1" }],
      usedSkills: [],
      activities: [],
      toolCalls: [],
      memoryLinks: [],
      artifactPaths: [],
    };

    detailRenderFeature.renderTaskDetail(state.selectedTask);
    refs.memoryViewerDetailEl.querySelector("[data-open-experience-candidate-id='exp-method-1']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    refs.memoryViewerDetailEl.querySelector("[data-open-experience-candidate-id='exp-skill-pending']")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(openExperienceCandidate).toHaveBeenCalledWith("exp-method-1");
    expect(openExperienceCandidate).toHaveBeenCalledWith("exp-skill-pending");
  });
});
