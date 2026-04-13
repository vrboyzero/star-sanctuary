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
    openConversationSession: vi.fn(),
    appendMessage: vi.fn(),
    getChatUiFeature: () => ({ refreshAvatar: vi.fn() }),
    onAgentIdentityChanged: vi.fn(),
    onAgentCatalogChanged: vi.fn(),
    showNotice: vi.fn(),
    localeController: { t: (_key, _params, fallback) => fallback ?? "" },
  });

  return { feature, refs };
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
});
