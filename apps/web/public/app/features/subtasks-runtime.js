import { findSubtaskBySessionId } from "./subtasks-overview.js";

function getElementsByDataValue(root, attribute, expectedValue) {
  if (!root || !attribute || !expectedValue) return [];
  return [...root.querySelectorAll(`[${attribute}]`)]
    .filter((node) => node.getAttribute(attribute) === expectedValue);
}

export function createSubtasksRuntimeFeature({
  refs,
  getSubtasksState,
  getSubtasksOverviewFeature,
  switchMode,
  openConversationSession,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    subtasksSection,
    subtasksListEl,
    subtasksDetailEl,
    subtasksShowArchivedEl,
  } = refs;

  function getFeature() {
    return getSubtasksOverviewFeature?.();
  }

  function applySubtaskSessionFocus(sessionId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) return false;
    const listMatch = getElementsByDataValue(subtasksListEl, "data-subtask-session-id", normalizedSessionId)[0];
    const detailMatch = getElementsByDataValue(subtasksDetailEl, "data-subtask-session-focus", normalizedSessionId)[0];
    if (listMatch) {
      listMatch.scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (detailMatch) {
      detailMatch.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return Boolean(listMatch || detailMatch);
  }

  function applySubtaskPromptSnapshotFocus(sessionId) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId || !subtasksDetailEl) return false;
    subtasksDetailEl.querySelectorAll("[data-subtask-prompt-snapshot-session].is-continuation-focus").forEach((node) => {
      node.classList.remove("is-continuation-focus");
    });
    const snapshotSection = getElementsByDataValue(
      subtasksDetailEl,
      "data-subtask-prompt-snapshot-session",
      normalizedSessionId,
    )[0];
    if (!snapshotSection) return false;
    snapshotSection.classList.add("is-continuation-focus");
    snapshotSection.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }

  function replayFocus() {
    const subtasksState = getSubtasksState();
    const linkedSessionId = subtasksState.linkedSessionContext?.sessionId || subtasksState.continuationFocusSessionId || "";
    if (!linkedSessionId) return;
    applySubtaskSessionFocus(linkedSessionId);
    applySubtaskPromptSnapshotFocus(linkedSessionId);
  }

  async function loadSubtasks(forceSelectFirst = false) {
    const result = await getFeature()?.loadSubtasks(forceSelectFirst);
    replayFocus();
    return result;
  }

  async function loadSubtaskDetail(taskId, options = {}) {
    const result = await getFeature()?.loadSubtaskDetail(taskId, options);
    replayFocus();
    return result;
  }

  async function openSubtaskById(taskId) {
    const normalizedTaskId = typeof taskId === "string" ? taskId.trim() : "";
    if (!normalizedTaskId) return;

    const subtasksState = getSubtasksState();
    switchMode("subtasks");
    subtasksState.selectedId = normalizedTaskId;
    await loadSubtasks(false);

    let existsInList = Array.isArray(subtasksState.items)
      && subtasksState.items.some((item) => item?.id === normalizedTaskId);

    if (!existsInList && subtasksState.includeArchived !== true) {
      subtasksState.includeArchived = true;
      if (subtasksShowArchivedEl) {
        subtasksShowArchivedEl.checked = true;
      }
      await loadSubtasks(false);
      existsInList = Array.isArray(subtasksState.items)
        && subtasksState.items.some((item) => item?.id === normalizedTaskId);
    }

    if (!existsInList) {
      subtasksState.selectedId = normalizedTaskId;
    }
    await loadSubtaskDetail(normalizedTaskId, { quiet: !existsInList });
  }

  async function openSubtaskBySession(sessionId, options = {}) {
    const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!normalizedSessionId) return;

    const subtasksState = getSubtasksState();
    subtasksState.continuationFocusSessionId = normalizedSessionId;
    switchMode("subtasks");
    await loadSubtasks(false);

    let matchedItem = findSubtaskBySessionId(subtasksState.items, normalizedSessionId);
    if (!matchedItem && subtasksState.includeArchived !== true) {
      subtasksState.includeArchived = true;
      if (subtasksShowArchivedEl) {
        subtasksShowArchivedEl.checked = true;
      }
      await loadSubtasks(false);
      matchedItem = findSubtaskBySessionId(subtasksState.items, normalizedSessionId);
    }

    if (!matchedItem && options.taskId) {
      subtasksState.linkedSessionContext = {
        sessionId: normalizedSessionId,
        taskId: options.taskId,
        parentConversationId: "",
      };
      await openSubtaskById(options.taskId);
      openConversationSession(normalizedSessionId, "", { switchToChat: false, renderHint: false });
      replayFocus();
      return;
    }

    if (!matchedItem) {
      openConversationSession(
        normalizedSessionId,
        t(
          "agentPanel.openContinuationSessionHint",
          { sessionId: normalizedSessionId },
          `Switched to continuation session: ${normalizedSessionId}`,
        ),
      );
      return;
    }

    subtasksState.linkedSessionContext = {
      sessionId: normalizedSessionId,
      taskId: matchedItem.id,
      parentConversationId: matchedItem.parentConversationId || "",
    };
    subtasksState.selectedId = matchedItem.id;
    await loadSubtaskDetail(matchedItem.id, { quiet: false });
    openConversationSession(normalizedSessionId, "", { switchToChat: false, renderHint: false });
    replayFocus();
  }

  function refreshSubtasksLocale() {
    if (!subtasksSection) return;
    getFeature()?.refreshLocale();
  }

  return {
    loadSubtasks,
    loadSubtaskDetail,
    openSubtaskById,
    openSubtaskBySession,
    refreshSubtasksLocale,
  };
}
