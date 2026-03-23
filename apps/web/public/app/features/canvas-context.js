export function createCanvasContextFeature({
  refs,
  getCanvasApp,
  getGoalsState,
  getActiveConversationId,
  getGoalById,
  normalizeGoalBoardId,
  getCachedGoalCapabilityEntry,
  goalRuntimeFilePath,
  escapeHtml,
  ensureGoalCapabilityCache,
  switchMode,
  loadGoals,
  openGoalTaskViewer,
  openConversationSession,
  openSourcePath,
  showNotice,
  getGoalDisplayName,
}) {
  const { canvasContextBarEl } = refs;

  function goalBaseConversationId(goalId) {
    return `goal:${goalId}`;
  }

  function isGoalConversationId(conversationId) {
    return typeof conversationId === "string" && conversationId.startsWith("goal:");
  }

  function isConversationForGoal(conversationId, goalId) {
    return typeof conversationId === "string" && conversationId.startsWith(goalBaseConversationId(goalId));
  }

  function parseGoalConversationContext(conversationId) {
    if (!isGoalConversationId(conversationId)) return null;
    const normalizedConversationId = String(conversationId).trim();
    const match = /^goal:([^:]+)(?::node:([^:]+):run:([^:]+))?$/.exec(normalizedConversationId);
    if (!match) return null;
    return {
      goalId: match[1] || "",
      nodeId: match[2] || "",
      runId: match[3] || "",
      conversationId: normalizedConversationId,
    };
  }

  function findGoalByBoardId(boardId) {
    const goalsState = getGoalsState?.();
    return boardId && Array.isArray(goalsState?.items)
      ? goalsState.items.find((goal) => normalizeGoalBoardId(goal?.boardId) === boardId) || null
      : null;
  }

  function renderCanvasGoalContext() {
    if (!canvasContextBarEl) return;

    const canvasApp = getCanvasApp?.();
    const activeConversationId = getActiveConversationId?.() || "";
    const goalsState = getGoalsState?.() || {};
    const boardId = normalizeGoalBoardId(canvasApp?.currentBoardId);
    const conversation = parseGoalConversationContext(activeConversationId);
    const mappedGoal = findGoalByBoardId(boardId);
    const goalId = conversation?.goalId || mappedGoal?.id || "";
    const goal = goalId ? getGoalById(goalId) || mappedGoal : mappedGoal;
    const goalName = goal?.title || goalId || "";
    const activeNodeId = typeof goal?.activeNodeId === "string" ? goal.activeNodeId.trim() : "";
    const nodeId = conversation?.nodeId || activeNodeId;
    const runId = conversation?.runId || (typeof goal?.lastRunId === "string" ? goal.lastRunId.trim() : "");
    const capabilityEntry = goalId ? getCachedGoalCapabilityEntry(goalId) : null;
    const capabilityPlans = Array.isArray(capabilityEntry?.plans) ? capabilityEntry.plans : [];
    const capabilityPlan = capabilityPlans.find((plan) => plan.nodeId === nodeId)
      || capabilityPlans.find((plan) => plan.nodeId === activeNodeId)
      || capabilityPlans[0]
      || null;

    canvasApp?.setGoalContext?.({
      goalId: goalId || "",
      goalTitle: goalName || "",
      nodeId: nodeId || "",
      runId: runId || "",
      conversationId: conversation?.conversationId || "",
      boardId: boardId || "",
      capabilityPlanId: capabilityPlan?.id || "",
      capabilityMode: capabilityPlan?.executionMode || "",
      capabilityRisk: capabilityPlan?.riskLevel || "",
      capabilityStatus: capabilityPlan?.status || "",
      capabilityAlignment: capabilityPlan?.analysis?.status || "",
    });

    if (!boardId && !goalId && !conversation) {
      canvasContextBarEl.classList.add("hidden");
      canvasContextBarEl.innerHTML = "";
      return;
    }

    let note = "当前处于画布工作区。";
    if (conversation?.goalId && goalName) {
      note = nodeId
        ? `当前画布可回跳到 ${goalName} 的节点通道。`
        : `当前画布可回跳到 ${goalName} 的 goal 通道。`;
    } else if (goalName && boardId) {
      note = `当前画布已匹配到长期任务 ${goalName} 的主板。`;
    } else if (boardId) {
      note = "当前画布尚未匹配到长期任务，可继续独立使用。";
    }

    const actions = [];
    if (goalId) {
      actions.push(`<button class="canvas-tb-btn" data-canvas-open-goal-detail="${escapeHtml(goalId)}">打开长期任务详情</button>`);
      actions.push(`<button class="canvas-tb-btn" data-canvas-open-goal-tasks="${escapeHtml(goalId)}">查看 Goal Tasks</button>`);
    }
    if (conversation?.conversationId) {
      actions.push(`
        <button
          class="canvas-tb-btn"
          data-canvas-open-conversation="${escapeHtml(conversation.conversationId)}"
          data-canvas-conversation-label="${escapeHtml(nodeId ? `返回节点通道：${goalName || goalId} / ${nodeId}` : `返回长期任务通道：${goalName || goalId}`)}"
        >
          ${nodeId ? "返回当前节点通道" : "返回当前 Goal 通道"}
        </button>
      `);
    }
    if (goal?.runtimeRoot) {
      actions.push(`<button class="canvas-tb-btn" data-canvas-open-capability-source="${escapeHtml(goalRuntimeFilePath(goal, "capability-plans.json"))}">打开 capabilityPlan</button>`);
    }

    const capabilityMeta = capabilityPlan ? `
      <span class="canvas-context-item canvas-context-item-capability">
        <span class="canvas-context-label">Plan</span>
        <span class="canvas-context-value">${escapeHtml(capabilityPlan.nodeId || capabilityPlan.id)}</span>
      </span>
      <span class="canvas-context-item canvas-context-item-capability">
        <span class="canvas-context-label">Mode</span>
        <span class="canvas-context-value">${escapeHtml(capabilityPlan.executionMode || "-")}</span>
      </span>
      <span class="canvas-context-item canvas-context-item-capability">
        <span class="canvas-context-label">Risk</span>
        <span class="canvas-context-value">${escapeHtml(capabilityPlan.riskLevel || "-")}</span>
      </span>
      <span class="canvas-context-item canvas-context-item-capability">
        <span class="canvas-context-label">Align</span>
        <span class="canvas-context-value">${escapeHtml(capabilityPlan.analysis?.status || "-")}</span>
      </span>
      <span class="canvas-context-note canvas-context-note-capability">${escapeHtml(capabilityPlan.summary || capabilityPlan.analysis?.summary || "当前节点已有 capabilityPlan 可回看。")}</span>
    ` : goalId ? `
      <span class="canvas-context-note canvas-context-note-capability">${escapeHtml(capabilityEntry ? "当前 goal 尚未匹配到对应 node 的 capabilityPlan。" : "正在读取 capabilityPlan 上下文…")}</span>
    ` : "";

    canvasContextBarEl.classList.remove("hidden");
    canvasContextBarEl.innerHTML = `
      <div class="canvas-context-meta">
        <span class="canvas-context-item"><span class="canvas-context-label">Board</span><span class="canvas-context-value">${escapeHtml(boardId || "-")}</span></span>
        <span class="canvas-context-item"><span class="canvas-context-label">Goal</span><span class="canvas-context-value">${escapeHtml(goalName || "-")}</span></span>
        ${nodeId ? `<span class="canvas-context-item"><span class="canvas-context-label">Node</span><span class="canvas-context-value">${escapeHtml(nodeId)}</span></span>` : ""}
        ${runId ? `<span class="canvas-context-item"><span class="canvas-context-label">Run</span><span class="canvas-context-value">${escapeHtml(runId)}</span></span>` : ""}
        ${capabilityMeta}
        <span class="canvas-context-note">${escapeHtml(note)}</span>
      </div>
      <div class="canvas-context-actions">
        ${actions.join("")}
      </div>
    `;

    canvasContextBarEl.querySelectorAll("[data-canvas-open-goal-detail]").forEach((node) => {
      node.addEventListener("click", async () => {
        const nextGoalId = node.getAttribute("data-canvas-open-goal-detail");
        if (!nextGoalId) return;
        switchMode("goals");
        await loadGoals(true, nextGoalId);
      });
    });
    canvasContextBarEl.querySelectorAll("[data-canvas-open-goal-tasks]").forEach((node) => {
      node.addEventListener("click", async () => {
        const nextGoalId = node.getAttribute("data-canvas-open-goal-tasks");
        if (!nextGoalId) return;
        await openGoalTaskViewer(nextGoalId);
      });
    });
    canvasContextBarEl.querySelectorAll("[data-canvas-open-conversation]").forEach((node) => {
      node.addEventListener("click", () => {
        const conversationId = node.getAttribute("data-canvas-open-conversation");
        if (!conversationId) return;
        const hint = node.getAttribute("data-canvas-conversation-label") || undefined;
        openConversationSession(conversationId, hint);
      });
    });
    canvasContextBarEl.querySelectorAll("[data-canvas-open-capability-source]").forEach((node) => {
      node.addEventListener("click", () => {
        const sourcePath = node.getAttribute("data-canvas-open-capability-source");
        if (!sourcePath) return;
        void openSourcePath(sourcePath);
      });
    });

    if (goal && goalId && (!capabilityEntry || (nodeId && !capabilityPlan)) && !goalsState.capabilityPending?.[goalId]) {
      void ensureGoalCapabilityCache(goal, { forceReload: Boolean(capabilityEntry) }).then(() => {
        const latestCanvasApp = getCanvasApp?.();
        const latestBoardId = normalizeGoalBoardId(latestCanvasApp?.currentBoardId);
        const latestConversation = parseGoalConversationContext(getActiveConversationId?.() || "");
        const latestGoalId = latestConversation?.goalId || findGoalByBoardId(latestBoardId)?.id || "";
        if (latestGoalId === goalId) {
          renderCanvasGoalContext();
        }
      }).catch(() => {});
    }
  }

  async function openGoalCanvasList(goalId) {
    const canvasApp = getCanvasApp?.();
    if (!canvasApp) {
      showNotice("Canvas 不可用", "前端 Canvas 组件尚未初始化。", "error");
      return;
    }

    switchMode("canvas");
    await canvasApp.showBoardList();
    if (goalId) {
      showNotice("已切到画布列表", `可从画布列表继续处理 ${getGoalDisplayName(goalId)} 的主板。`, "info", 2200);
    }
  }

  async function openGoalCanvasBoard(boardId, goalId) {
    const canvasApp = getCanvasApp?.();
    if (!canvasApp) {
      showNotice("Canvas 不可用", "前端 Canvas 组件尚未初始化。", "error");
      return;
    }

    const normalizedBoardId = normalizeGoalBoardId(boardId);
    if (!normalizedBoardId) {
      await openGoalCanvasList(goalId);
      return;
    }

    switchMode("canvas");
    await canvasApp.openBoard(normalizedBoardId);

    if (canvasApp.currentBoardId === normalizedBoardId && canvasApp.manager?.board) {
      canvasApp._showCanvasView?.();
      return;
    }

    await canvasApp.showBoardList();
    showNotice("未找到关联画布", `未能打开 ${normalizedBoardId}，已切换到画布列表。`, "error", 3200);
  }

  return {
    goalBaseConversationId,
    isGoalConversationId,
    isConversationForGoal,
    parseGoalConversationContext,
    renderCanvasGoalContext,
    openGoalCanvasList,
    openGoalCanvasBoard,
  };
}
