function getGoalCheckpointActionConfig(action) {
  const actionMap = {
    approve: {
      method: "goal.checkpoint.approve",
      modalTitle: "批准 Checkpoint",
      successTitle: "已批准 checkpoint",
      submitLabel: "批准",
      defaultSummary: "已批准",
      actorLabel: "审批人",
      noteLabel: "审批说明",
      notePlaceholder: "可选，例如：验证通过，可进入下一节点",
      noteHelp: "可选。用于记录批准依据、验证结果或补充说明。",
      noteRequired: false,
      hint: "批准后会把 checkpoint 推进到下一状态，并把摘要写入进度时间线。",
    },
    reject: {
      method: "goal.checkpoint.reject",
      modalTitle: "拒绝 Checkpoint",
      successTitle: "已拒绝 checkpoint",
      submitLabel: "拒绝",
      defaultSummary: "已拒绝",
      actorLabel: "审批人",
      noteLabel: "拒绝原因",
      notePlaceholder: "必填，例如：需要补充修改后再提交",
      noteHelp: "必填。拒绝不能只留下状态，必须给出明确原因。",
      noteRequired: true,
      hint: "拒绝会保留 checkpoint 记录，并让后续恢复动作有明确依据。",
    },
    expire: {
      method: "goal.checkpoint.expire",
      modalTitle: "标记 Checkpoint 过期",
      successTitle: "已标记 checkpoint 过期",
      submitLabel: "标记过期",
      defaultSummary: "已过期",
      actorLabel: "操作人",
      noteLabel: "过期原因",
      notePlaceholder: "必填，例如：审批超时，需要重新发起",
      noteHelp: "必填。建议写明为什么当前 checkpoint 需要作废。",
      noteRequired: true,
      hint: "过期适用于审批超时、上下文失效或产物已被新版本替换的场景。",
    },
    reopen: {
      method: "goal.checkpoint.reopen",
      modalTitle: "重新打开 Checkpoint",
      successTitle: "已重新打开 checkpoint",
      submitLabel: "重新打开",
      defaultSummary: "已重新打开",
      actorLabel: "重新发起人",
      noteLabel: "重新打开说明",
      notePlaceholder: "必填，例如：已完成补充修改，重新发起审批",
      noteHelp: "必填。说明为什么重新打开，以及期望下一步如何处理。",
      noteRequired: true,
      hint: "重新打开会让 checkpoint 回到可继续处理状态，并保留历史记录。",
    },
  };
  return actionMap[action] || null;
}

function formatDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeLocalValue(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function createGoalsRuntimeFeature({
  refs,
  isConnected,
  sendReq,
  makeId,
  getGoalsState,
  getGoalsOverviewFeature,
  getGoalsDetailFeature,
  getGoalById,
  loadGoals,
  showNotice,
  formatDateTime,
  escapeHtml,
  onResumeGoal,
  onPauseGoal,
  onOpenSourcePath,
  onOpenTask,
  onOpenGoalTaskViewer,
  onOpenGoalBoard,
  onOpenGoalBoardList,
  onGenerateGoalHandoff,
  onLoadGoalReviewGovernanceData,
  onLoadGoalTrackingData,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    goalsSection,
    goalsDetailEl,
    goalCheckpointActionModal,
    goalCheckpointActionTitleEl,
    goalCheckpointActionHintEl,
    goalCheckpointActionContextEl,
    goalCheckpointActionReviewerEl,
    goalCheckpointActionReviewerRoleEl,
    goalCheckpointActionRequestedByEl,
    goalCheckpointActionActorLabelEl,
    goalCheckpointActionActorEl,
    goalCheckpointActionSlaAtEl,
    goalCheckpointActionSummaryEl,
    goalCheckpointActionNoteLabelEl,
    goalCheckpointActionNoteHelpEl,
    goalCheckpointActionNoteEl,
    goalCheckpointActionCloseBtn,
    goalCheckpointActionCancelBtn,
    goalCheckpointActionSubmitBtn,
  } = refs;

  let pendingGoalCheckpointAction = null;

  function renderGoalsLoading(message) {
    getGoalsOverviewFeature?.()?.renderGoalsLoading(message);
  }

  function renderGoalsSummary(items) {
    getGoalsOverviewFeature?.()?.renderGoalsSummary(items);
  }

  function renderGoalsEmpty(message) {
    getGoalsOverviewFeature?.()?.renderGoalsEmpty(message);
  }

  function renderGoalList(items) {
    getGoalsOverviewFeature?.()?.renderGoalList(items);
  }

  function renderGoalDetail(goal) {
    return getGoalsDetailFeature?.()?.renderGoalDetail(goal);
  }

  function refreshGoalsLocale() {
    if (!goalsSection) return;
    if (!isConnected()) {
      renderGoalsLoading(t("goals.loadingDisconnected", {}, "Disconnected"));
      return;
    }
    const goalsState = getGoalsState();
    if (Array.isArray(goalsState.items) && goalsState.items.length) {
      renderGoalsSummary(goalsState.items);
      renderGoalList(goalsState.items);
      renderGoalDetail(getGoalById(goalsState.selectedId));
      return;
    }
    if (goalsState.loadSeq > 0) {
      renderGoalsLoading(t("goals.loading", {}, "Loading..."));
    }
  }

  function resetGoalCheckpointActionForm() {
    if (goalCheckpointActionTitleEl) goalCheckpointActionTitleEl.textContent = "处理 Checkpoint";
    if (goalCheckpointActionHintEl) {
      goalCheckpointActionHintEl.textContent = "在这里完成 checkpoint 审批或状态流转，避免使用临时 prompt 输入。";
    }
    if (goalCheckpointActionContextEl) goalCheckpointActionContextEl.innerHTML = "";
    if (goalCheckpointActionReviewerEl) goalCheckpointActionReviewerEl.value = "";
    if (goalCheckpointActionReviewerRoleEl) goalCheckpointActionReviewerRoleEl.value = "";
    if (goalCheckpointActionRequestedByEl) goalCheckpointActionRequestedByEl.value = "";
    if (goalCheckpointActionActorLabelEl) goalCheckpointActionActorLabelEl.textContent = "审批人";
    if (goalCheckpointActionActorEl) goalCheckpointActionActorEl.value = "";
    if (goalCheckpointActionSlaAtEl) goalCheckpointActionSlaAtEl.value = "";
    if (goalCheckpointActionSummaryEl) {
      goalCheckpointActionSummaryEl.value = "";
      goalCheckpointActionSummaryEl.placeholder = "例如：已批准 / 已拒绝 / 已过期 / 已重新打开";
    }
    if (goalCheckpointActionNoteLabelEl) goalCheckpointActionNoteLabelEl.textContent = "说明";
    if (goalCheckpointActionNoteHelpEl) {
      goalCheckpointActionNoteHelpEl.textContent = "部分操作要求填写原因，避免只留下状态没有上下文。";
    }
    if (goalCheckpointActionNoteEl) {
      goalCheckpointActionNoteEl.value = "";
      goalCheckpointActionNoteEl.placeholder = "补充审批意见、过期原因或重新打开说明";
    }
  }

  function setGoalCheckpointActionBusy(busy) {
    const config = pendingGoalCheckpointAction
      ? getGoalCheckpointActionConfig(pendingGoalCheckpointAction.action)
      : null;
    if (goalCheckpointActionCloseBtn) goalCheckpointActionCloseBtn.disabled = busy;
    if (goalCheckpointActionCancelBtn) goalCheckpointActionCancelBtn.disabled = busy;
    if (goalCheckpointActionSubmitBtn) {
      goalCheckpointActionSubmitBtn.disabled = busy;
      goalCheckpointActionSubmitBtn.textContent = busy
        ? `${config?.submitLabel || "提交"}中...`
        : config?.submitLabel || "提交";
    }
    if (goalCheckpointActionReviewerEl) goalCheckpointActionReviewerEl.disabled = busy;
    if (goalCheckpointActionReviewerRoleEl) goalCheckpointActionReviewerRoleEl.disabled = busy;
    if (goalCheckpointActionRequestedByEl) goalCheckpointActionRequestedByEl.disabled = busy;
    if (goalCheckpointActionActorEl) goalCheckpointActionActorEl.disabled = busy;
    if (goalCheckpointActionSlaAtEl) goalCheckpointActionSlaAtEl.disabled = busy;
    if (goalCheckpointActionSummaryEl) goalCheckpointActionSummaryEl.disabled = busy;
    if (goalCheckpointActionNoteEl) goalCheckpointActionNoteEl.disabled = busy;
  }

  function findTrackedGoalCheckpoint(goalId, checkpointId) {
    if (!goalId || !checkpointId) return null;
    const goalsState = getGoalsState();
    return goalsState.trackingCheckpoints.find((item) => item.goalId === goalId && item.id === checkpointId) || null;
  }

  function renderGoalCheckpointActionContext(context) {
    if (!goalCheckpointActionContextEl || !context) return;
    goalCheckpointActionContextEl.innerHTML = `
      <div class="goal-checkpoint-action-context-item">
        <span class="goal-summary-label">Goal</span>
        <strong>${escapeHtml(context.goalId)}</strong>
      </div>
      <div class="goal-checkpoint-action-context-item">
        <span class="goal-summary-label">Node</span>
        <strong>${escapeHtml(context.nodeId)}</strong>
      </div>
      <div class="goal-checkpoint-action-context-item">
        <span class="goal-summary-label">Checkpoint</span>
        <strong>${escapeHtml(context.checkpointId)}</strong>
      </div>
      <div class="goal-checkpoint-action-context-item">
        <span class="goal-summary-label">Status</span>
        <strong>${escapeHtml(context.status || "-")}</strong>
      </div>
      <div class="goal-checkpoint-action-context-item">
        <span class="goal-summary-label">Reviewer</span>
        <strong>${escapeHtml(context.reviewer || "-")}</strong>
      </div>
      <div class="goal-checkpoint-action-context-item">
        <span class="goal-summary-label">SLA</span>
        <strong>${escapeHtml(context.slaAt ? formatDateTime(context.slaAt) : "-")}</strong>
      </div>
    `;
  }

  function toggleGoalCheckpointActionModal(show, context = null) {
    if (!goalCheckpointActionModal) return;
    if (show) {
      const nextContext = context && typeof context === "object" ? { ...context } : null;
      const config = nextContext ? getGoalCheckpointActionConfig(nextContext.action) : null;
      if (!nextContext || !config) return;
      pendingGoalCheckpointAction = nextContext;
      resetGoalCheckpointActionForm();
      if (goalCheckpointActionTitleEl) goalCheckpointActionTitleEl.textContent = config.modalTitle;
      if (goalCheckpointActionHintEl) goalCheckpointActionHintEl.textContent = config.hint;
      if (goalCheckpointActionReviewerEl) goalCheckpointActionReviewerEl.value = nextContext.reviewer || "";
      if (goalCheckpointActionReviewerRoleEl) goalCheckpointActionReviewerRoleEl.value = nextContext.reviewerRole || "";
      if (goalCheckpointActionRequestedByEl) goalCheckpointActionRequestedByEl.value = nextContext.requestedBy || "";
      if (goalCheckpointActionActorLabelEl) goalCheckpointActionActorLabelEl.textContent = config.actorLabel;
      if (goalCheckpointActionActorEl) {
        goalCheckpointActionActorEl.value = config.method === "goal.checkpoint.reopen"
          ? nextContext.requestedBy || ""
          : nextContext.decidedBy || "";
      }
      if (goalCheckpointActionSlaAtEl) goalCheckpointActionSlaAtEl.value = formatDateTimeLocalValue(nextContext.slaAt);
      if (goalCheckpointActionSummaryEl) goalCheckpointActionSummaryEl.value = nextContext.summary || config.defaultSummary;
      if (goalCheckpointActionNoteLabelEl) goalCheckpointActionNoteLabelEl.textContent = config.noteLabel;
      if (goalCheckpointActionNoteHelpEl) goalCheckpointActionNoteHelpEl.textContent = config.noteHelp;
      if (goalCheckpointActionNoteEl) {
        goalCheckpointActionNoteEl.placeholder = config.notePlaceholder;
        goalCheckpointActionNoteEl.value = nextContext.note || "";
      }
      renderGoalCheckpointActionContext(nextContext);
      setGoalCheckpointActionBusy(false);
      goalCheckpointActionModal.classList.remove("hidden");
      setTimeout(() => {
        if (config.noteRequired) {
          goalCheckpointActionNoteEl?.focus();
        } else {
          goalCheckpointActionSummaryEl?.focus();
          goalCheckpointActionSummaryEl?.select();
        }
      }, 0);
      return;
    }

    pendingGoalCheckpointAction = null;
    resetGoalCheckpointActionForm();
    setGoalCheckpointActionBusy(false);
    goalCheckpointActionModal.classList.add("hidden");
  }

  async function runGoalCheckpointAction(goalId, nodeId, checkpointId, action) {
    if (!isConnected()) {
      showNotice("无法执行 checkpoint 操作", "未连接到服务器。", "error");
      return;
    }

    const config = getGoalCheckpointActionConfig(action);
    if (!config) return;
    if (!goalCheckpointActionModal) {
      showNotice("checkpoint 操作失败", "前端操作面板未初始化。", "error");
      return;
    }

    const checkpoint = findTrackedGoalCheckpoint(goalId, checkpointId);
    toggleGoalCheckpointActionModal(true, {
      action,
      goalId,
      nodeId,
      checkpointId,
      status: checkpoint?.status || "",
      reviewer: checkpoint?.reviewer || "",
      reviewerRole: checkpoint?.reviewerRole || "",
      requestedBy: checkpoint?.requestedBy || "",
      decidedBy: checkpoint?.decidedBy || "",
      slaAt: checkpoint?.slaAt || "",
      summary: checkpoint?.summary || "",
      note: checkpoint?.note || "",
    });
  }

  async function submitGoalCheckpointActionForm() {
    if (!pendingGoalCheckpointAction) return;
    if (!isConnected()) {
      showNotice("无法执行 checkpoint 操作", "未连接到服务器。", "error");
      return;
    }

    const context = pendingGoalCheckpointAction;
    const config = getGoalCheckpointActionConfig(context.action);
    if (!config) return;

    const reviewer = goalCheckpointActionReviewerEl?.value.trim() || "";
    const reviewerRole = goalCheckpointActionReviewerRoleEl?.value.trim() || "";
    const requestedBy = goalCheckpointActionRequestedByEl?.value.trim() || "";
    const actor = goalCheckpointActionActorEl?.value.trim() || "";
    const slaAt = parseDateTimeLocalValue(goalCheckpointActionSlaAtEl?.value || "") || "";
    const summary = goalCheckpointActionSummaryEl?.value.trim() || config.defaultSummary;
    const note = goalCheckpointActionNoteEl?.value.trim() || "";
    if (config.noteRequired && !note) {
      showNotice("无法执行 checkpoint 操作", `${config.noteLabel}不能为空。`, "error");
      goalCheckpointActionNoteEl?.focus();
      return;
    }

    setGoalCheckpointActionBusy(true);
    try {
      const res = await sendReq({
        type: "req",
        id: makeId(),
        method: config.method,
        params: {
          goalId: context.goalId,
          nodeId: context.nodeId,
          checkpointId: context.checkpointId,
          reviewer: reviewer || undefined,
          reviewerRole: reviewerRole || undefined,
          requestedBy: (context.action === "reopen" ? actor : requestedBy) || undefined,
          decidedBy: (context.action === "approve" || context.action === "reject" || context.action === "expire")
            ? (actor || undefined)
            : undefined,
          slaAt: slaAt || undefined,
          summary: summary || config.defaultSummary,
          note: note || undefined,
        },
      });
      if (!res || !res.ok) {
        showNotice("checkpoint 操作失败", res?.error?.message || "未知错误。", "error");
        return;
      }

      toggleGoalCheckpointActionModal(false);
      await loadGoals(true, context.goalId);
      showNotice(config.successTitle, `${context.goalId} / ${context.nodeId} 已更新。`, "success", 2200);
    } catch (error) {
      showNotice("checkpoint 操作失败", error instanceof Error ? error.message : String(error), "error");
    } finally {
      if (pendingGoalCheckpointAction) {
        setGoalCheckpointActionBusy(false);
      }
    }
  }

  function bindGoalDetailActions(goal) {
    if (!goalsDetailEl || !goal) return;
    goalsDetailEl.querySelectorAll("[data-goal-resume-detail]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-goal-resume-detail");
        if (!goalId) return;
        void onResumeGoal(goalId);
      });
    });
    goalsDetailEl.querySelectorAll("[data-goal-pause-detail]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-goal-pause-detail");
        if (!goalId) return;
        void onPauseGoal(goalId);
      });
    });
    goalsDetailEl.querySelectorAll("[data-open-source]").forEach((node) => {
      node.addEventListener("click", () => {
        const sourcePath = node.getAttribute("data-open-source");
        if (!sourcePath) return;
        void onOpenSourcePath(sourcePath);
      });
    });
    goalsDetailEl.querySelectorAll("[data-open-task-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-open-task-id");
        if (!taskId) return;
        void onOpenTask(taskId);
      });
    });
    goalsDetailEl.querySelectorAll("[data-open-goal-tasks]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-open-goal-tasks");
        if (!goalId) return;
        void onOpenGoalTaskViewer(goalId);
      });
    });
    goalsDetailEl.querySelectorAll("[data-goal-resume-last-node]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-goal-resume-last-node");
        if (!goalId) return;
        const lastNodeId = node.getAttribute("data-goal-last-node-id");
        void onResumeGoal(goalId, { nodeId: lastNodeId || undefined });
      });
    });
    goalsDetailEl.querySelectorAll("[data-open-goal-board]").forEach((node) => {
      node.addEventListener("click", () => {
        const boardId = node.getAttribute("data-open-goal-board");
        void onOpenGoalBoard(boardId, goal.id);
      });
    });
    goalsDetailEl.querySelectorAll("[data-open-goal-board-list]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-open-goal-board-list") || goal.id;
        void onOpenGoalBoardList(goalId);
      });
    });
    goalsDetailEl.querySelectorAll("[data-goal-checkpoint-action]").forEach((node) => {
      node.addEventListener("click", () => {
        const action = node.getAttribute("data-goal-checkpoint-action");
        const goalId = node.getAttribute("data-goal-checkpoint-goal-id") || goal.id;
        const nodeId = node.getAttribute("data-goal-checkpoint-node-id");
        const checkpointId = node.getAttribute("data-goal-checkpoint-id");
        if (!action || !goalId || !nodeId || !checkpointId) return;
        void runGoalCheckpointAction(goalId, nodeId, checkpointId, action);
      });
    });
    goalsDetailEl.querySelectorAll("[data-goal-generate-handoff]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-goal-generate-handoff") || goal.id;
        if (!goalId) return;
        void onGenerateGoalHandoff(goalId);
      });
    });
  }

  return {
    bindGoalDetailActions,
    loadGoals,
    refreshGoalsLocale,
    renderGoalDetail,
    renderGoalList,
    renderGoalsEmpty,
    renderGoalsLoading,
    renderGoalsSummary,
    runGoalCheckpointAction,
    submitGoalCheckpointActionForm,
    toggleGoalCheckpointActionModal,
  };
}
