// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createAgentRuntimeFeature } from "./agent-runtime.js";
import { PENDING_AGENT_SELECTION_KEY } from "./chat-network.js";
import { zhCN } from "../i18n/zh-CN.js";

function translate(key, params = {}) {
  const segments = String(key || "").split(".");
  let value = zhCN;
  for (const segment of segments) {
    if (!value || typeof value !== "object" || !(segment in value)) {
      return "";
    }
    value = value[segment];
  }
  if (typeof value !== "string") return "";
  return value.replace(/\{(\w+)\}/g, (_match, name) => String(params?.[name] ?? ""));
}

function createFeatureHarness() {
  sessionStorage.clear();
  document.body.innerHTML = `
    <select id="agentSelect">
      <option value="coder">代码专家</option>
    </select>
    <aside id="agentRightPanel" class="hidden"></aside>
    <div id="goalsDetail"></div>
    <div id="messages"></div>
    <div id="agentCreateModal" class="hidden">
      <button id="agentCreateModalClose"></button>
      <button id="agentCreateCancel"></button>
      <button id="agentCreateSubmit"></button>
      <input id="agentCreateId" />
      <input id="agentCreateDisplayName" />
      <select id="agentCreateModel"></select>
      <textarea id="agentCreateSystemPrompt"></textarea>
    </div>
  `;

  const refs = {
    agentSelectEl: document.getElementById("agentSelect"),
    agentRightPanelEl: document.getElementById("agentRightPanel"),
    goalsDetailEl: document.getElementById("goalsDetail"),
    messagesEl: document.getElementById("messages"),
    agentCreateModalEl: document.getElementById("agentCreateModal"),
    agentCreateModalCloseBtn: document.getElementById("agentCreateModalClose"),
    agentCreateCancelBtn: document.getElementById("agentCreateCancel"),
    agentCreateSubmitBtn: document.getElementById("agentCreateSubmit"),
    agentCreateIdEl: document.getElementById("agentCreateId"),
    agentCreateDisplayNameEl: document.getElementById("agentCreateDisplayName"),
    agentCreateModelEl: document.getElementById("agentCreateModel"),
    agentCreateSystemPromptEl: document.getElementById("agentCreateSystemPrompt"),
  };
  const agentCatalog = new Map();
  const noopAsync = vi.fn(async () => {});
  const openConversationSession = vi.fn();
  const openAgentConfigEditor = vi.fn();
  const showNotice = vi.fn();
  const sendReq = vi.fn(async () => null);
  const requestModelCatalog = vi.fn(async () => ({
    models: [{ id: "primary", displayName: "主模型", model: "gpt-5" }],
    currentDefault: "primary",
    preferredProviderIds: [],
    manualEntrySupported: false,
  }));
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
    sendReq,
    makeId: () => "req-1",
    requestModelCatalog,
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
    showNotice,
    localeController: { t: translate },
    t: translate,
  });

  return { feature, refs, openConversationSession, openAgentConfigEditor, showNotice, sendReq, requestModelCatalog };
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

  it("renders a create button in the agent panel toolbar", () => {
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

    const createBtn = refs.agentRightPanelEl.querySelector(".agent-panel-create-btn");
    expect(createBtn).not.toBeNull();
    expect(createBtn.textContent).toContain("新建 Agent");
  });

  it("submits agent.create and shows restart notice after success", async () => {
    const { feature, refs, showNotice, sendReq, openAgentConfigEditor } = createFeatureHarness();

    sendReq.mockResolvedValueOnce({
      ok: true,
      payload: {
        agentId: "coder-lite",
        requiresRestart: true,
      },
    });

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

    refs.agentCreateIdEl.value = "coder-lite";
    refs.agentCreateDisplayNameEl.value = "代码助手";
    refs.agentCreateModelEl.innerHTML = "<option value=\"primary\">主模型（primary）</option>";
    refs.agentCreateModelEl.value = "primary";
    refs.agentCreateSystemPromptEl.value = "你是一名严谨的代码助手。";

    refs.agentCreateSubmitBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendReq).toHaveBeenCalledWith(expect.objectContaining({
      method: "agent.create",
      params: {
        id: "coder-lite",
        displayName: "代码助手",
        model: "primary",
        systemPromptOverride: "你是一名严谨的代码助手。",
      },
    }));
    expect(showNotice).toHaveBeenCalledWith(
      "Agent 已创建",
      expect.stringContaining("coder-lite"),
      "success",
      12000,
      expect.objectContaining({
        actionLabel: "立即重启",
      }),
    );
    expect(openAgentConfigEditor).toHaveBeenCalledWith("agents.json", {
      findPattern: "\"id\"\\s*:\\s*\"coder-lite\"",
    });
    expect(sessionStorage.getItem(PENDING_AGENT_SELECTION_KEY)).toBe("coder-lite");
  });

  it("does not close the create modal when clicking the backdrop", async () => {
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

    refs.agentRightPanelEl.querySelector(".agent-panel-create-btn").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(refs.agentCreateModalEl.classList.contains("hidden")).toBe(false);

    refs.agentCreateModalEl.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(refs.agentCreateModalEl.classList.contains("hidden")).toBe(false);
  });
});
