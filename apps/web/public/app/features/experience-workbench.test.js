// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createExperienceWorkbenchFeature } from "./experience-workbench.js";

function countStats(items) {
  return (Array.isArray(items) ? items : []).reduce((stats, item) => {
    stats.total += 1;
    if (item?.type === "skill") {
      stats.skills += 1;
    } else {
      stats.methods += 1;
    }
    if (item?.status === "draft") stats.draft += 1;
    if (item?.status === "accepted") stats.accepted += 1;
    if (item?.status === "rejected") stats.rejected += 1;
    return stats;
  }, {
    total: 0,
    methods: 0,
    skills: 0,
    draft: 0,
    accepted: 0,
    rejected: 0,
  });
}

function getRenderedStatValues(container) {
  return Array.from(container.querySelectorAll(".memory-stat-value")).map((node) => node.textContent);
}

function getCapabilityLaneDraftCounts(container) {
  return Array.from(container.querySelectorAll(".memory-usage-overview-lane .memory-stat-caption")).map((node) => node.textContent);
}

async function flushAsyncWork(rounds = 1) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createHarness(options = {}) {
  document.body.innerHTML = `
    <section id="experienceWorkbenchSection">
      <div id="experienceWorkbenchTitle"></div>
      <div id="experienceWorkbenchStats"></div>
      <button id="experienceWorkbenchTabCandidates"></button>
      <button id="experienceWorkbenchTabCapabilityAcquisition"></button>
      <button id="experienceWorkbenchTabUsageOverview"></button>
      <div id="experienceWorkbenchCandidatesPane"></div>
      <div id="experienceWorkbenchCapabilityPane" class="hidden"></div>
      <div id="experienceWorkbenchCapabilityOverview"></div>
      <div id="experienceWorkbenchUsagePane" class="hidden"></div>
      <div id="experienceWorkbenchUsageOverview"></div>
      <input id="experienceWorkbenchQuery" />
      <select id="experienceWorkbenchTypeFilter"></select>
      <select id="experienceWorkbenchStatusFilter"></select>
      <button id="experienceWorkbenchResetFilters"></button>
      <input id="experienceGenerateTaskId" />
      <button id="experienceGenerateMethodBtn"></button>
      <button id="experienceGenerateSkillBtn"></button>
      <div id="experienceWorkbenchList"></div>
      <div id="experienceWorkbenchDetail"></div>
    </section>
  `;

  const refs = {
    experienceWorkbenchSection: document.getElementById("experienceWorkbenchSection"),
    experienceWorkbenchTitleEl: document.getElementById("experienceWorkbenchTitle"),
    experienceWorkbenchStatsEl: document.getElementById("experienceWorkbenchStats"),
    experienceWorkbenchTabCandidatesBtn: document.getElementById("experienceWorkbenchTabCandidates"),
    experienceWorkbenchTabCapabilityAcquisitionBtn: document.getElementById("experienceWorkbenchTabCapabilityAcquisition"),
    experienceWorkbenchTabUsageOverviewBtn: document.getElementById("experienceWorkbenchTabUsageOverview"),
    experienceWorkbenchCandidatesPaneEl: document.getElementById("experienceWorkbenchCandidatesPane"),
    experienceWorkbenchCapabilityPaneEl: document.getElementById("experienceWorkbenchCapabilityPane"),
    experienceWorkbenchCapabilityOverviewEl: document.getElementById("experienceWorkbenchCapabilityOverview"),
    experienceWorkbenchUsagePaneEl: document.getElementById("experienceWorkbenchUsagePane"),
    experienceWorkbenchUsageOverviewEl: document.getElementById("experienceWorkbenchUsageOverview"),
    experienceWorkbenchQueryEl: document.getElementById("experienceWorkbenchQuery"),
    experienceWorkbenchTypeFilterEl: document.getElementById("experienceWorkbenchTypeFilter"),
    experienceWorkbenchStatusFilterEl: document.getElementById("experienceWorkbenchStatusFilter"),
    experienceWorkbenchResetFiltersBtn: document.getElementById("experienceWorkbenchResetFilters"),
    experienceGenerateTaskIdEl: document.getElementById("experienceGenerateTaskId"),
    experienceGenerateMethodBtn: document.getElementById("experienceGenerateMethodBtn"),
    experienceGenerateSkillBtn: document.getElementById("experienceGenerateSkillBtn"),
    experienceWorkbenchListEl: document.getElementById("experienceWorkbenchList"),
    experienceWorkbenchDetailEl: document.getElementById("experienceWorkbenchDetail"),
  };

  const experienceState = {
    items: [],
    draftItems: [],
    draftItemsLoading: false,
    draftItemsError: "",
    selectedId: null,
    selectedCandidate: null,
    stats: null,
    activeTab: "capability-acquisition",
    filters: {
      query: "",
      type: "",
      status: "",
    },
    generateTaskId: "",
    requestToken: 0,
    activeAgentId: "default",
  };
  const memoryViewerState = {
    pendingExperienceActionKey: null,
  };

  const defaultCandidates = [
    {
      id: "draft-method-1",
      taskId: "task-method-1",
      type: "method",
      status: "draft",
      title: "Method Draft One",
      slug: "method-draft-one",
      summary: "method summary",
      content: "# Method Draft One",
      createdAt: "2026-04-20T09:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
      sourceTaskSnapshot: {},
    },
    {
      id: "draft-skill-1",
      taskId: "task-skill-1",
      type: "skill",
      status: "draft",
      title: "Skill Draft One",
      slug: "skill-draft-one",
      summary: "skill summary",
      content: "# Skill Draft One",
      createdAt: "2026-04-20T08:00:00.000Z",
      updatedAt: "2026-04-20T11:00:00.000Z",
      sourceTaskSnapshot: {},
      skillFreshness: {
        status: "needs_patch",
        summary: "需要补丁",
      },
    },
    {
      id: "accepted-method-1",
      taskId: "task-method-2",
      type: "method",
      status: "accepted",
      title: "Accepted Method",
      slug: "accepted-method",
      summary: "accepted summary",
      content: "# Accepted Method",
      createdAt: "2026-04-18T08:00:00.000Z",
      updatedAt: "2026-04-18T09:00:00.000Z",
      sourceTaskSnapshot: {},
      publishedPath: "state/methods/accepted-method.md",
    },
  ];
  const candidates = Array.isArray(options.candidates) && options.candidates.length
    ? options.candidates
    : defaultCandidates;
  const listCandidateIds = Array.isArray(options.listCandidateIds) && options.listCandidateIds.length
    ? options.listCandidateIds
    : candidates.map((item) => item.id);
  const resolveListItems = () => listCandidateIds
    .map((id) => candidates.find((item) => item.id === id) || null)
    .filter(Boolean);
  const normalizeFilterValues = (value) => Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim().toLowerCase()).filter(Boolean)
    : [String(value ?? "").trim().toLowerCase()].filter(Boolean);
  const applyCandidateFilter = (items, filter) => {
    const safeFilter = filter && typeof filter === "object" ? filter : {};
    let filtered = Array.isArray(items) ? [...items] : [];
    const statusValues = normalizeFilterValues(safeFilter.status);
    const typeValues = normalizeFilterValues(safeFilter.type);
    if (statusValues.length) {
      filtered = filtered.filter((item) => statusValues.includes(String(item?.status ?? "").trim().toLowerCase()));
    }
    if (typeValues.length) {
      filtered = filtered.filter((item) => typeValues.includes(String(item?.type ?? "").trim().toLowerCase()));
    }
    return filtered;
  };

  const sendReq = vi.fn(async (req) => {
    if (req.method === "experience.candidate.list") {
      const sourceItems = req.params?.filter?.status
        ? candidates
        : resolveListItems();
      const filteredItems = applyCandidateFilter(sourceItems, req.params?.filter);
      const offset = Number.isInteger(req.params?.offset) && req.params.offset > 0 ? req.params.offset : 0;
      const limit = Number.isInteger(req.params?.limit) && req.params.limit > 0 ? req.params.limit : filteredItems.length;
      const items = filteredItems.slice(offset, offset + limit);
      return { ok: true, payload: { items } };
    }
    if (req.method === "experience.candidate.stats") {
      return { ok: true, payload: { stats: countStats(candidates) } };
    }
    if (req.method === "experience.candidate.get") {
      const candidate = candidates.find((item) => item.id === req.params?.candidateId) || null;
      return { ok: true, payload: { candidate } };
    }
    if (req.method === "experience.candidate.accept") {
      const candidate = candidates.find((item) => item.id === req.params?.candidateId) || null;
      if (options.requirePublishConfirmation && req.params?.confirmed !== true) {
        return {
          ok: false,
          error: {
            code: "confirmation_required",
            message: `${candidate?.type || "candidate"} publish requires user confirmation.`,
          },
        };
      }
      if (candidate) {
        candidate.status = "accepted";
        candidate.publishedPath = `state/${candidate.slug}`;
      }
      return { ok: true, payload: { candidate } };
    }
    if (req.method === "experience.candidate.reject") {
      const candidate = candidates.find((item) => item.id === req.params?.candidateId) || null;
      if (candidate) {
        candidate.status = "rejected";
      }
      return { ok: true, payload: { candidate } };
    }
    if (req.method === "experience.candidate.reject_bulk") {
      const candidateType = String(req.params?.filter?.type ?? "").trim().toLowerCase();
      let count = 0;
      candidates.forEach((candidate) => {
        if (candidate.status === "draft" && String(candidate.type ?? "").trim().toLowerCase() === candidateType) {
          candidate.status = "rejected";
          count += 1;
        }
      });
      return {
        ok: true,
        payload: {
          count,
          filter: {
            type: candidateType,
            status: "draft",
          },
        },
      };
    }
    throw new Error(`Unexpected request ${req.method}`);
  });

  const openTaskFromWorkbench = vi.fn(async () => {});
  const showNotice = vi.fn();

  const feature = createExperienceWorkbenchFeature({
    refs,
    isConnected: () => true,
    sendReq,
    makeId: () => "req-1",
    getExperienceWorkbenchState: () => experienceState,
    getMemoryViewerState: () => memoryViewerState,
    getSelectedAgentId: () => "default",
    getSelectedAgentLabel: () => "default",
    renderCandidateDetailPanel: (candidate) => `<div data-rendered-candidate="${candidate?.id || ""}"></div>`,
    renderTaskUsageOverviewCard: () => `<div>usage overview</div>`,
    loadTaskUsageOverview: vi.fn(async () => {}),
    generateExperienceCandidate: vi.fn(async () => null),
    openToolSettingsTab: vi.fn(async () => {}),
    escapeHtml: (value) => String(value ?? ""),
    formatDateTime: (value) => String(value ?? ""),
    openTaskFromWorkbench,
    openMemoryFromWorkbench: vi.fn(async () => {}),
    openSourcePath: vi.fn(async () => {}),
    showNotice,
    t: (_key, params, fallback) => {
      let text = fallback ?? "";
      if (params && typeof params === "object") {
        Object.entries(params).forEach(([key, value]) => {
          text = text.replace(`{${key}}`, String(value));
        });
      }
      return text;
    },
  });

  feature.bindUi();

  return {
    refs,
    feature,
    candidates,
    sendReq,
    showNotice,
    openTaskFromWorkbench,
    experienceState,
  };
}

describe("experience workbench capability acquisition", () => {
  it("opens capability acquisition as the default tab", async () => {
    const { refs, feature, experienceState } = createHarness();

    await feature.openExperienceWorkbench();

    expect(experienceState.activeTab).toBe("capability-acquisition");
    expect(refs.experienceWorkbenchCapabilityPaneEl.classList.contains("hidden")).toBe(false);
    expect(refs.experienceWorkbenchCandidatesPaneEl.classList.contains("hidden")).toBe(true);
  });

  it("renders only draft candidates in the capability acquisition tab", async () => {
    const { refs, feature } = createHarness();

    await feature.openExperienceWorkbench({ tab: "capability-acquisition", preferFirst: false });

    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).toContain("Method Draft One");
    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).toContain("Skill Draft One");
    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).not.toContain("Accepted Method");
    expect(refs.experienceWorkbenchCapabilityPaneEl.classList.contains("hidden")).toBe(false);
  });

  it("opens candidate detail and refreshes the capability list after accepting a draft", async () => {
    const { refs, feature, sendReq, openTaskFromWorkbench, experienceState } = createHarness();

    await feature.openExperienceWorkbench({ tab: "capability-acquisition", preferFirst: false });

    refs.experienceWorkbenchCapabilityOverviewEl
      .querySelector("[data-capability-open-candidate-id='draft-method-1']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(experienceState.activeTab).toBe("candidates");
    expect(refs.experienceWorkbenchDetailEl.innerHTML).toContain("data-rendered-candidate=\"draft-method-1\"");

    refs.experienceWorkbenchTabCapabilityAcquisitionBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    refs.experienceWorkbenchCapabilityOverviewEl
      .querySelector("[data-capability-open-task-id='task-skill-1']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();

    expect(openTaskFromWorkbench).toHaveBeenCalledWith("task-skill-1");

    refs.experienceWorkbenchCapabilityOverviewEl
      .querySelector("[data-capability-review-candidate-id='draft-method-1'][data-capability-review-candidate-action='accept']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendReq).toHaveBeenCalledWith(expect.objectContaining({
      method: "experience.candidate.accept",
      params: expect.objectContaining({
        candidateId: "draft-method-1",
        agentId: "default",
      }),
    }));
    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).not.toContain("Method Draft One");
    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).toContain("Skill Draft One");
  });

  it("retries accept with confirmed flag when publish confirmation is required", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const { refs, feature, sendReq } = createHarness({ requirePublishConfirmation: true });

      await feature.openExperienceWorkbench({ tab: "capability-acquisition", preferFirst: false });

      refs.experienceWorkbenchCapabilityOverviewEl
        .querySelector("[data-capability-review-candidate-id='draft-method-1'][data-capability-review-candidate-action='accept']")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const acceptCalls = sendReq.mock.calls
        .map(([req]) => req)
        .filter((req) => req.method === "experience.candidate.accept");
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(acceptCalls).toHaveLength(2);
      expect(acceptCalls[0].params).toMatchObject({
        candidateId: "draft-method-1",
        agentId: "default",
      });
      expect(acceptCalls[0].params.confirmed).toBeUndefined();
      expect(acceptCalls[1].params).toMatchObject({
        candidateId: "draft-method-1",
        agentId: "default",
        confirmed: true,
      });
      await flushAsyncWork(8);
      expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).not.toContain("Method Draft One");
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("refreshes the summary stats after rejecting a draft from capability acquisition", async () => {
    const { refs, feature, sendReq } = createHarness({
      listCandidateIds: ["draft-skill-1", "accepted-method-1"],
    });

    await feature.openExperienceWorkbench({ tab: "capability-acquisition", preferFirst: false });

    expect(getRenderedStatValues(refs.experienceWorkbenchStatsEl)).toEqual(["3", "2", "1", "2", "1", "0"]);
    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).toContain("Method Draft One");

    refs.experienceWorkbenchCapabilityOverviewEl
      .querySelector("[data-capability-review-candidate-id='draft-method-1'][data-capability-review-candidate-action='reject']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendReq).toHaveBeenCalledWith(expect.objectContaining({
      method: "experience.candidate.reject",
      params: expect.objectContaining({
        candidateId: "draft-method-1",
        agentId: "default",
      }),
    }));
    expect(getRenderedStatValues(refs.experienceWorkbenchStatsEl)).toEqual(["3", "2", "1", "1", "1", "1"]);
    expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).not.toContain("Method Draft One");
  });

  it("bulk rejects all method drafts with a single request and updates summary stats", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const candidates = [
        {
          id: "draft-method-1",
          taskId: "task-method-1",
          type: "method",
          status: "draft",
          title: "Method Draft One",
          slug: "method-draft-one",
          summary: "method summary 1",
          content: "# Method Draft One",
          createdAt: "2026-04-20T09:00:00.000Z",
          updatedAt: "2026-04-20T10:00:00.000Z",
          sourceTaskSnapshot: {},
        },
        {
          id: "draft-method-2",
          taskId: "task-method-2",
          type: "method",
          status: "draft",
          title: "Method Draft Two",
          slug: "method-draft-two",
          summary: "method summary 2",
          content: "# Method Draft Two",
          createdAt: "2026-04-20T08:00:00.000Z",
          updatedAt: "2026-04-20T11:00:00.000Z",
          sourceTaskSnapshot: {},
        },
        {
          id: "draft-method-3",
          taskId: "task-method-3",
          type: "method",
          status: "draft",
          title: "Method Draft Three",
          slug: "method-draft-three",
          summary: "method summary 3",
          content: "# Method Draft Three",
          createdAt: "2026-04-20T07:00:00.000Z",
          updatedAt: "2026-04-20T12:00:00.000Z",
          sourceTaskSnapshot: {},
        },
        {
          id: "draft-skill-1",
          taskId: "task-skill-1",
          type: "skill",
          status: "draft",
          title: "Skill Draft One",
          slug: "skill-draft-one",
          summary: "skill summary 1",
          content: "# Skill Draft One",
          createdAt: "2026-04-20T08:30:00.000Z",
          updatedAt: "2026-04-20T12:30:00.000Z",
          sourceTaskSnapshot: {},
        },
        {
          id: "draft-skill-2",
          taskId: "task-skill-2",
          type: "skill",
          status: "draft",
          title: "Skill Draft Two",
          slug: "skill-draft-two",
          summary: "skill summary 2",
          content: "# Skill Draft Two",
          createdAt: "2026-04-20T08:40:00.000Z",
          updatedAt: "2026-04-20T12:40:00.000Z",
          sourceTaskSnapshot: {},
        },
        {
          id: "accepted-method-1",
          taskId: "task-method-accepted-1",
          type: "method",
          status: "accepted",
          title: "Accepted Method",
          slug: "accepted-method",
          summary: "accepted summary",
          content: "# Accepted Method",
          createdAt: "2026-04-18T08:00:00.000Z",
          updatedAt: "2026-04-18T09:00:00.000Z",
          sourceTaskSnapshot: {},
        },
      ];
      const { refs, feature, sendReq } = createHarness({ candidates });

      await feature.openExperienceWorkbench({ tab: "capability-acquisition", preferFirst: false });

      expect(getRenderedStatValues(refs.experienceWorkbenchStatsEl)).toEqual(["6", "4", "2", "5", "1", "0"]);
      expect(getCapabilityLaneDraftCounts(refs.experienceWorkbenchCapabilityOverviewEl)).toEqual(["Draft 3", "Draft 2"]);

      refs.experienceWorkbenchCapabilityOverviewEl
        .querySelector("[data-capability-bulk-reject-type='method']")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      await flushAsyncWork(10);

      const bulkRejectCalls = sendReq.mock.calls
        .map(([req]) => req)
        .filter((req) => req.method === "experience.candidate.reject_bulk");
      const singleRejectCalls = sendReq.mock.calls
        .map(([req]) => req)
        .filter((req) => req.method === "experience.candidate.reject");

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(bulkRejectCalls).toHaveLength(1);
      expect(bulkRejectCalls[0].params).toEqual(expect.objectContaining({
        agentId: "default",
        filter: {
          type: "method",
        },
      }));
      expect(singleRejectCalls).toHaveLength(0);
      expect(getRenderedStatValues(refs.experienceWorkbenchStatsEl)).toEqual(["6", "4", "2", "2", "1", "3"]);
      expect(getCapabilityLaneDraftCounts(refs.experienceWorkbenchCapabilityOverviewEl)).toEqual(["Draft 0", "Draft 2"]);
      expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).not.toContain("Method Draft One");
      expect(refs.experienceWorkbenchCapabilityOverviewEl.innerHTML).toContain("Skill Draft One");
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("loads all draft candidates across paged capability requests", async () => {
    const makeDraftCandidate = (type, index) => ({
      id: `${type}-draft-${index}`,
      taskId: `task-${type}-${index}`,
      type,
      status: "draft",
      title: `${type === "skill" ? "Skill" : "Method"} Draft ${index}`,
      slug: `${type}-draft-${index}`,
      summary: `${type} summary ${index}`,
      content: `# ${type} draft ${index}`,
      createdAt: `2026-04-${String(20 - Math.floor(index / 10)).padStart(2, "0")}T${String(index % 10).padStart(2, "0")}:00:00.000Z`,
      updatedAt: `2026-04-${String(20 - Math.floor(index / 10)).padStart(2, "0")}T${String(index % 10).padStart(2, "0")}:30:00.000Z`,
      sourceTaskSnapshot: {},
    });
    const candidates = [
      ...Array.from({ length: 60 }, (_, index) => makeDraftCandidate("method", index)),
      ...Array.from({ length: 60 }, (_, index) => makeDraftCandidate("skill", index)),
    ];
    const { refs, feature, sendReq } = createHarness({ candidates });

    await feature.openExperienceWorkbench({ tab: "capability-acquisition", preferFirst: false });

    expect(getCapabilityLaneDraftCounts(refs.experienceWorkbenchCapabilityOverviewEl)).toEqual(["Draft 60", "Draft 60"]);
    expect(sendReq).toHaveBeenCalledWith(expect.objectContaining({
      method: "experience.candidate.list",
      params: expect.objectContaining({
        filter: { status: "draft" },
        offset: 100,
      }),
    }));

    refs.experienceWorkbenchCapabilityOverviewEl
      .querySelector("[data-capability-review-candidate-id='method-draft-0'][data-capability-review-candidate-action='reject']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getCapabilityLaneDraftCounts(refs.experienceWorkbenchCapabilityOverviewEl)).toEqual(["Draft 59", "Draft 60"]);
  });
});
