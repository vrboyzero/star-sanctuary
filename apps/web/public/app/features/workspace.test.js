// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createWorkspaceFeature } from "./workspace.js";

function createWorkspaceHarness({ content = "" } = {}) {
  document.body.innerHTML = `
    <aside id="sidebar"></aside>
    <div id="sidebarTitle"></div>
    <div id="fileTree"></div>
    <div id="editorPath"></div>
    <div id="editorModeBadge" class="hidden"></div>
    <textarea id="editorTextarea"></textarea>
    <button id="cancelEdit"></button>
    <button id="saveEdit"></button>
    <button id="openEnvEditor"></button>
    <button id="switchRoot"></button>
    <button id="switchFacet"></button>
    <button id="switchCron"></button>
    <input id="workspaceRoots" />
  `;

  const switchMode = vi.fn();
  const showNotice = vi.fn();
  const sendReq = vi.fn(async (payload) => {
    if (payload.method === "workspace.read") {
      return {
        ok: true,
        payload: {
          content,
        },
      };
    }
    if (payload.method === "workspace.list") {
      return {
        ok: true,
        payload: {
          items: [],
        },
      };
    }
    return { ok: false, error: { message: "unexpected request" } };
  });

  const refs = {
    sidebarEl: document.getElementById("sidebar"),
    sidebarTitleEl: document.getElementById("sidebarTitle"),
    fileTreeEl: document.getElementById("fileTree"),
    refreshTreeBtn: null,
    editorPathEl: document.getElementById("editorPath"),
    editorModeBadgeEl: document.getElementById("editorModeBadge"),
    editorTextareaEl: document.getElementById("editorTextarea"),
    cancelEditBtn: document.getElementById("cancelEdit"),
    saveEditBtn: document.getElementById("saveEdit"),
    openEnvEditorBtn: document.getElementById("openEnvEditor"),
    switchRootBtn: document.getElementById("switchRoot"),
    switchFacetBtn: document.getElementById("switchFacet"),
    switchCronBtn: document.getElementById("switchCron"),
    workspaceRootsEl: document.getElementById("workspaceRoots"),
  };

  const feature = createWorkspaceFeature({
    refs,
    keys: {
      workspaceRootsKey: "workspace-roots",
    },
    isConnected: () => true,
    sendReq,
    makeId: () => "req-1",
    switchMode,
    showNotice,
    escapeHtml: (value) => value,
    loadServerConfig: vi.fn(),
    syncAttachmentLimitsFromConfig: vi.fn(),
    persistWorkspaceRootsField: vi.fn(),
    t: (_key, _params, fallback) => fallback ?? "",
  });

  return {
    feature,
    refs,
    switchMode,
  };
}

describe("workspace feature", () => {
  it("opens a file and focuses the line that matches the requested agent id", async () => {
    const content = [
      "{",
      "  \"agents\": [",
      "    {",
      "      \"id\":\"default\",",
      "      \"displayName\": \"贝露丹蒂\"",
      "    },",
      "    {",
      "      \"id\"  :  \"coder\",",
      "      \"displayName\": \"代码专家\"",
      "    }",
      "  ]",
      "}",
    ].join("\n");
    const { feature, refs, switchMode } = createWorkspaceHarness({ content });

    await feature.openFile("agents.json", {
      findPattern: "\"id\"\\s*:\\s*\"coder\"",
    });

    const expectedSelection = "\"id\"  :  \"coder\"";
    const expectedOffset = content.indexOf(expectedSelection);
    expect(switchMode).toHaveBeenCalledWith("editor");
    expect(refs.editorPathEl.textContent).toBe("agents.json");
    expect(refs.editorTextareaEl.value).toBe(content);
    expect(refs.editorTextareaEl.selectionStart).toBe(expectedOffset);
    expect(refs.editorTextareaEl.selectionEnd).toBe(expectedOffset + expectedSelection.length);
  });
});
