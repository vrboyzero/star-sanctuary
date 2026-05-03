// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createAgentRuntimeFeature } from "./agent-runtime.js";

function createFeatureHarness() {
  document.body.innerHTML = `
    <select id="agentSelect">
      <option value="coder">代码专家</option>
    </select>
    <aside id="agentRightPanel" class="hidden"></aside>
    <div id="goalsDetail"></div>
    <div id="messages"></div>
  `;

  const refs = {
    agentSelectEl: document.getElementById("agentSelect"),
    agentRightPanelEl: document.getElementById("agentRightPanel"),
    goalsDetailEl: document.getElementById("goalsDetail"),
    messagesEl: document.getElementById("messages"),
  };
  const agentCatalog = new Map();
  const noopAsync = vi.fn(async () => {});
  const openConversationSession = vi.fn();
  const openAgentConfigEditor = vi.fn();
  const sessionCacheFeature = {
    bindAgentConversation: vi.fn(),
    getAgentConversation: vi.fn(() => ""),
    getConversationMessages: vi.fn(() => []),
    appendUserMessage: vi.fn(),
    appendAssistantDelta: vi.fn(),
    finalizeAssistantMessage: vi.fn(),
    setConversationMessages: vi.fn(),
  };

  const feature = createAgentRuntimeFeature({
    refs,
    agentCatalog,
    residentAgentRosterEnabled: false,
    agentSessionCacheFeature: sessionCacheFeature,
    sendReq: noopAsync,
    makeId: () => "req-1",
    getHttpAuthHeaders: () => ({}),
    getActiveConversationId: () => "",
    setActiveConversationId: vi.fn(),
    renderCanvasGoalContext: vi.fn(),
    switchMode: vi.fn(),
    getChatEventsFeature: () => ({ resetStreamingState: vi.fn() }),
    getSessionDigestFeature: () => ({ clear: vi.fn(), loadSessionDigest: noopAsync }),
    renderConversationMessages: vi.fn(),
    loadConversationMeta: noopAsync,
    refreshMemoryViewerForAgentSwitch: noopAsync,
    getSubtasksState: () => ({}),
    openSubtaskBySession: noopAsync,
    openSubtaskById: noopAsync,
    loadSubtasks: noopAsync,
    getGoalsState: () => ({}),
    loadGoals: noopAsync,
    resumeGoal: noopAsync,
    getMemoryViewerState: () => ({}),
    switchMemoryViewerTab: vi.fn(),
    loadMemoryViewer: noopAsync,
    openTaskFromAudit: noopAsync,
    openConversationSession,
    openAgentConfigEditor,
    appendMessage: vi.fn(),
    getChatUiFeature: () => ({ refreshAvatar: vi.fn() }),
    onAgentIdentityChanged: vi.fn(),
    onAgentCatalogChanged: vi.fn(),
    showNotice: vi.fn(),
    localeController: { t: (_key, _params, fallback) => fallback ?? "" },
  });

  return { feature, refs, openConversationSession, openAgentConfigEditor };
}

describe("agent runtime panel", () => {
  it("keeps the right-side agent panel visible for a single agent roster", () => {
    const { feature, refs } = createFeatureHarness();

    feature.syncAgentCatalog([
      {
        id: "coder",
        displayName: "代码专家",
        name: "代码专家",
        avatar: "",
        model: "gpt-5",
        status: "idle",
      },
    ], "coder");

    expect(refs.agentRightPanelEl.classList.contains("hidden")).toBe(false);
    expect(refs.agentRightPanelEl.querySelectorAll(".agent-card")).toHaveLength(1);
    expect(refs.agentRightPanelEl.textContent).toContain("代码专家");
  });

  it("renders a compact work summary card and reuses lightweight jump actions", async () => {
    const { feature, refs, openConversationSession } = createFeatureHarness();

    feature.syncAgentCatalog([
      {
        id: "coder",
        displayName: "代码专家",
        name: "代码专家",
        avatar: "",
        model: "gpt-5",
        status: "running",
        continuationState: {
          targetType: "conversation",
          recommendedTargetId: "conv-42",
          summary: "继续跟进多 Agent 观察性改造",
        },
        sharedGovernance: {
          pendingCount: 1,
          claimedCount: 0,
        },
      },
    ], "coder");

    const summaryBtn = refs.agentRightPanelEl.querySelector(".agent-card-work-summary");
    expect(summaryBtn).not.toBeNull();
    expect(summaryBtn.textContent).toContain("继续跟进多 Agent 观察性改造");
    expect(summaryBtn.disabled).toBe(false);

    summaryBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(openConversationSession).toHaveBeenCalledWith(
      "conv-42",
      expect.stringContaining("conv-42"),
    );
  });

  it("renders an edit button and opens agents.json at the matching agent id", () => {
    const { feature, refs, openAgentConfigEditor } = createFeatureHarness();

    feature.syncAgentCatalog([
      {
        id: "coder",
        displayName: "代码专家",
        name: "代码专家",
        avatar: "",
        model: "gpt-5",
        status: "idle",
      },
    ], "coder");

    const actionButtons = refs.agentRightPanelEl.querySelectorAll(".agent-card-actions .agent-card-detail-btn");
    expect(actionButtons).toHaveLength(2);
    expect(actionButtons[0].textContent).toBe("编辑");
    expect(actionButtons[1].textContent).toBe("详情 ▸");

    actionButtons[0].click();

    expect(openAgentConfigEditor).toHaveBeenCalledWith("agents.json", {
      findPattern: "\"id\"\\s*:\\s*\"coder\"",
    });
  });
});
