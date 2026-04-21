// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryViewerFeature } from "./memory-viewer.js";

function createHarness() {
  document.body.innerHTML = `
    <section id="memoryViewerSection"></section>
    <div id="memoryViewerTitle"></div>
    <div id="memoryViewerStats"></div>
    <div id="memoryViewerList"></div>
    <div id="memoryViewerDetail"></div>
    <button id="memoryDreamModalTrigger" type="button">梦境</button>
    <div id="memoryDreamModal" class="hidden">
      <span id="memoryDreamModalTitle"></span>
      <button id="memoryDreamModalClose" type="button">关闭</button>
    </div>
    <div id="memoryDreamBar"></div>
    <span id="memoryDreamStatus"></span>
    <span id="memoryDreamMeta"></span>
    <span id="memoryDreamObsidian"></span>
    <span id="memoryDreamSummary"></span>
    <button id="memoryDreamRefresh" type="button"></button>
    <button id="memoryDreamRun" type="button"></button>
    <button id="memoryDreamHistoryToggle" type="button"></button>
    <div id="memoryDreamHistory" class="hidden"></div>
    <span id="memoryDreamHistoryStatus"></span>
    <button id="memoryDreamHistoryRefresh" type="button"></button>
    <div id="memoryDreamHistoryList"></div>
    <div id="memoryDreamHistoryDetail"></div>
  `;

  const refs = {
    memoryViewerSection: document.getElementById("memoryViewerSection"),
    memoryViewerTitleEl: document.getElementById("memoryViewerTitle"),
    memoryViewerStatsEl: document.getElementById("memoryViewerStats"),
    memoryViewerListEl: document.getElementById("memoryViewerList"),
    memoryViewerDetailEl: document.getElementById("memoryViewerDetail"),
    memoryDreamModalTriggerBtn: document.getElementById("memoryDreamModalTrigger"),
    memoryDreamModalEl: document.getElementById("memoryDreamModal"),
    memoryDreamModalTitleEl: document.getElementById("memoryDreamModalTitle"),
    memoryDreamModalCloseBtn: document.getElementById("memoryDreamModalClose"),
    memoryDreamBarEl: document.getElementById("memoryDreamBar"),
    memoryDreamStatusEl: document.getElementById("memoryDreamStatus"),
    memoryDreamMetaEl: document.getElementById("memoryDreamMeta"),
    memoryDreamObsidianEl: document.getElementById("memoryDreamObsidian"),
    memoryDreamSummaryEl: document.getElementById("memoryDreamSummary"),
    memoryDreamRefreshBtn: document.getElementById("memoryDreamRefresh"),
    memoryDreamRunBtn: document.getElementById("memoryDreamRun"),
    memoryDreamHistoryToggleBtn: document.getElementById("memoryDreamHistoryToggle"),
    memoryDreamHistoryEl: document.getElementById("memoryDreamHistory"),
    memoryDreamHistoryStatusEl: document.getElementById("memoryDreamHistoryStatus"),
    memoryDreamHistoryRefreshBtn: document.getElementById("memoryDreamHistoryRefresh"),
    memoryDreamHistoryListEl: document.getElementById("memoryDreamHistoryList"),
    memoryDreamHistoryDetailEl: document.getElementById("memoryDreamHistoryDetail"),
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
  };

  const state = {
    tab: "tasks",
    outboundAuditFocus: "all",
    items: [],
    selectedId: null,
    selectedTask: null,
    selectedCandidate: null,
    sharedReviewFilters: {},
    activeAgentId: "default",
    dreamRuntime: null,
    dreamCommons: null,
    dreamBusy: false,
    dreamHistoryOpen: false,
    dreamHistoryLoading: false,
    dreamHistoryError: "",
    dreamHistoryItems: [],
    selectedDreamHistoryId: null,
    selectedDreamHistoryItem: null,
    selectedDreamHistoryContent: "",
    dreamHistoryDetailLoading: false,
    dreamHistoryDetailError: "",
  };

  createMemoryViewerFeature({
    refs,
    isConnected: () => true,
    sendReq: vi.fn(),
    makeId: () => "req-1",
    getMemoryViewerState: () => state,
    getSelectedAgentId: () => "default",
    getSelectedAgentLabel: () => "默认 Agent",
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

  return refs;
}

describe("memory viewer dream modal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens and closes the dream modal from the header trigger", () => {
    const refs = createHarness();

    expect(refs.memoryDreamModalEl?.classList.contains("hidden")).toBe(true);
    expect(refs.memoryDreamModalTriggerBtn?.textContent).toBe("梦境");

    refs.memoryDreamModalTriggerBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(refs.memoryDreamModalEl?.classList.contains("hidden")).toBe(false);
    expect(refs.memoryDreamModalTriggerBtn?.getAttribute("aria-expanded")).toBe("true");
    expect(refs.memoryDreamModalTitleEl?.textContent).toBe("梦境");

    refs.memoryDreamModalCloseBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(refs.memoryDreamModalEl?.classList.contains("hidden")).toBe(true);
    expect(refs.memoryDreamModalTriggerBtn?.getAttribute("aria-expanded")).toBe("false");
  });
});
