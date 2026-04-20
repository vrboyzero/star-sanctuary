// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createMemoryViewerFeature } from "./memory-viewer.js";

function createHarness(initialTab = "memories") {
  document.body.innerHTML = `
    <section id="memoryViewerSection"></section>
    <div id="memoryViewerTitle"></div>
    <div id="memoryViewerStats"></div>
    <div id="memoryViewerList"></div>
    <div id="memoryViewerDetail"></div>
    <div id="memorySharedReviewBatchBar"></div>
  `;

  const state = {
    tab: initialTab,
    outboundAuditFocus: "all",
    listPageByTab: {},
    items: [],
    selectedId: null,
    selectedTask: null,
    selectedCandidate: null,
    sharedReviewSummary: null,
    sharedReviewFilters: {},
    selectedSharedReviewIds: [],
    sharedReviewBatchBusy: false,
    activeAgentId: "default",
  };

  const refs = {
    memoryViewerSection: document.getElementById("memoryViewerSection"),
    memoryViewerTitleEl: document.getElementById("memoryViewerTitle"),
    memoryViewerStatsEl: document.getElementById("memoryViewerStats"),
    memoryViewerListEl: document.getElementById("memoryViewerList"),
    memoryViewerDetailEl: document.getElementById("memoryViewerDetail"),
    memorySharedReviewBatchBarEl: document.getElementById("memorySharedReviewBatchBar"),
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
  };

  const loadMemoryDetail = vi.fn(async () => {});
  const feature = createMemoryViewerFeature({
    refs,
    isConnected: () => true,
    sendReq: vi.fn(),
    makeId: () => "req-1",
    getMemoryViewerState: () => state,
    getSelectedAgentId: () => "default",
    getSelectedAgentLabel: () => "default",
    getAvailableAgents: () => [],
    syncMemoryTaskGoalFilterUi: vi.fn(),
    renderMemoryViewerListEmpty: vi.fn((message) => {
      refs.memoryViewerListEl.innerHTML = `<div class="memory-viewer-empty">${String(message)}</div>`;
    }),
    renderMemoryViewerDetailEmpty: vi.fn((message) => {
      refs.memoryViewerDetailEl.innerHTML = `<div class="memory-viewer-empty">${String(message)}</div>`;
    }),
    loadTaskDetail: vi.fn(),
    loadMemoryDetail,
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
    getLatestExperienceUsageTimestamp: () => 0,
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

  return { state, refs, feature, loadMemoryDetail };
}

describe("memory viewer pagination", () => {
  it("renders memory lists by page and loads the first item of the next page on navigation", async () => {
    const { state, refs, feature, loadMemoryDetail } = createHarness("memories");
    const items = Array.from({ length: 21 }, (_, index) => ({
      id: `mem-${index + 1}`,
      sourcePath: `state/memory/${index + 1}.md`,
      summary: `summary ${index + 1}`,
      snippet: `snippet ${index + 1}`,
      memoryType: "note",
      sourceType: "conversation",
      visibility: "private",
      category: "general",
      score: index + 1,
    }));
    state.items = items;
    state.selectedId = "mem-1";

    feature.renderMemoryList(items);

    expect(refs.memoryViewerListEl.querySelectorAll("[data-memory-id]")).toHaveLength(20);
    expect(refs.memoryViewerListEl.textContent).toContain("Showing 1-20 / 21");

    refs.memoryViewerListEl.querySelector("[data-memory-list-page-action='next']")?.click();
    await Promise.resolve();

    expect(loadMemoryDetail).toHaveBeenCalledTimes(1);
    expect(loadMemoryDetail).toHaveBeenCalledWith("mem-21");
    expect(state.selectedId).toBe("mem-21");
    expect(refs.memoryViewerListEl.querySelectorAll("[data-memory-id]")).toHaveLength(1);
    expect(refs.memoryViewerListEl.querySelector("[data-memory-id='mem-21']")?.classList.contains("active")).toBe(true);
  });
});
