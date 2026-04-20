// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createToolSettingsController } from "./tool-settings.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function createHarness(payloadOverride = {}) {
  document.body.innerHTML = `
    <div id="toolSettingsModal" class="hidden"></div>
    <button id="openToolSettings"></button>
    <button id="closeToolSettings"></button>
    <button id="saveToolSettings"></button>
    <div id="toolSettingsBody"></div>
    <div id="toolSettingsConfirmModal" class="hidden"></div>
    <div id="toolSettingsConfirmImpact"></div>
    <ul id="toolSettingsConfirmSummary"></ul>
    <div id="toolSettingsConfirmExpiry"></div>
    <button id="toolSettingsConfirmApprove"></button>
    <button id="toolSettingsConfirmReject"></button>
    <button class="tool-tab active" data-tab="builtin"></button>
    <button class="tool-tab" data-tab="mcp"></button>
    <button class="tool-tab" data-tab="plugins"></button>
    <button class="tool-tab" data-tab="methods"></button>
    <button class="tool-tab" data-tab="skills"></button>
  `;

  const refs = {
    toolSettingsConfirmModal: document.getElementById("toolSettingsConfirmModal"),
    toolSettingsConfirmImpactEl: document.getElementById("toolSettingsConfirmImpact"),
    toolSettingsConfirmSummaryEl: document.getElementById("toolSettingsConfirmSummary"),
    toolSettingsConfirmExpiryEl: document.getElementById("toolSettingsConfirmExpiry"),
    toolSettingsConfirmApproveBtn: document.getElementById("toolSettingsConfirmApprove"),
    toolSettingsConfirmRejectBtn: document.getElementById("toolSettingsConfirmReject"),
    toolSettingsModal: document.getElementById("toolSettingsModal"),
    openToolSettingsBtn: document.getElementById("openToolSettings"),
    closeToolSettingsBtn: document.getElementById("closeToolSettings"),
    saveToolSettingsBtn: document.getElementById("saveToolSettings"),
    toolSettingsBody: document.getElementById("toolSettingsBody"),
    toolTabButtons: Array.from(document.querySelectorAll(".tool-tab")),
  };

  const sendReq = vi.fn(async (req) => {
    if (req.method === "tools.list") {
      return {
        ok: true,
        payload: {
          builtin: [],
          mcp: {},
          plugins: [],
          methods: [],
          skills: [],
          disabled: { builtin: [], mcp_servers: [], plugins: [], skills: [] },
          visibilityContext: {},
          toolControl: { mode: "disabled", requiresConfirmation: false, hasConfirmPassword: false, pendingRequest: null },
          ...payloadOverride,
        },
      };
    }
    return { ok: true };
  });

  const controller = createToolSettingsController({
    refs,
    isConnected: () => true,
    sendReq,
    makeId: () => "req-1",
    clientId: "client-1",
    getSelectedAgentId: () => "",
    getActiveConversationId: () => "",
    getSelectedSubtaskId: () => "",
    isSubtasksViewActive: () => false,
    escapeHtml,
    showNotice: vi.fn(),
    t: (_key, _params, fallback) => fallback ?? "",
  });

  return { controller, refs, sendReq };
}

describe("tool settings methods tab", () => {
  beforeEach(() => {
    window._belldandyOpenFile = vi.fn();
  });

  it("renders methods and opens file from read-only method index", async () => {
    const { controller, refs } = createHarness({
      methods: [
        {
          filename: "网页自动化基础.md",
          title: "网页自动化基础",
          summary: "用于处理网页自动化的基础 SOP。",
          status: "published",
          path: "methods/网页自动化基础.md",
        },
      ],
    });

    await controller.toggle(true);
    refs.toolTabButtons.find((item) => item.dataset.tab === "methods")?.click();

    expect(refs.toolSettingsBody.textContent).toContain("网页自动化基础");
    expect(refs.toolSettingsBody.textContent).toContain("用于处理网页自动化的基础 SOP。");
    expect(refs.saveToolSettingsBtn.disabled).toBe(true);

    refs.toolSettingsBody.querySelector("[data-method-path]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(window._belldandyOpenFile).toHaveBeenCalledWith("methods/网页自动化基础.md");
  });

  it("renders empty state when no methods are published", async () => {
    const { controller, refs } = createHarness({ methods: [] });

    await controller.toggle(true);
    refs.toolTabButtons.find((item) => item.dataset.tab === "methods")?.click();

    expect(refs.toolSettingsBody.textContent).toContain("未发布方法");
  });
});
