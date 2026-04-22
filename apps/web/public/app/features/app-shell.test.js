// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createAppShellFeature } from "./app-shell.js";

function createSection(id, hidden = true) {
  const element = document.createElement("section");
  element.id = id;
  if (hidden) {
    element.classList.add("hidden");
  }
  document.body.appendChild(element);
  return element;
}

describe("app shell feature", () => {
  it("switches back to chat mode from auxiliary panels", () => {
    const chatSection = createSection("chatSection", true);
    const editorSection = createSection("editorSection", true);
    const memoryViewerSection = createSection("memoryViewerSection", false);
    const experienceWorkbenchSection = createSection("experienceWorkbenchSection", true);
    const goalsSection = createSection("goalsSection", true);
    const subtasksSection = createSection("subtasksSection", true);
    const composerSection = createSection("composerSection", true);
    const editorActions = createSection("editorActions", false);
    const canvasSection = createSection("canvasSection", true);
    const switchMemoryBtn = document.createElement("button");
    document.body.appendChild(switchMemoryBtn);

    const feature = createAppShellFeature({
      refs: {
        switchMemoryBtn,
        chatSection,
        editorSection,
        memoryViewerSection,
        experienceWorkbenchSection,
        goalsSection,
        subtasksSection,
        composerSection,
        editorActions,
      },
      getTreeMode: () => "root",
      subtasksState: {},
    });

    feature.switchMode("chat");

    expect(chatSection.classList.contains("hidden")).toBe(false);
    expect(composerSection.classList.contains("hidden")).toBe(false);
    expect(memoryViewerSection.classList.contains("hidden")).toBe(true);
    expect(editorSection.classList.contains("hidden")).toBe(true);
    expect(editorActions.classList.contains("hidden")).toBe(true);
    expect(canvasSection.classList.contains("hidden")).toBe(true);
  });
});
