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
    appendMessage: vi.fn(),
    getChatUiFeature: () => ({ refreshAvatar: vi.fn() }),
    onAgentIdentityChanged: vi.fn(),
    onAgentCatalogChanged: vi.fn(),
    showNotice: vi.fn(),
    localeController: { t: (_key, _params, fallback) => fallback ?? "" },
  });

  return { feature, refs, openConversationSession };
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
});
