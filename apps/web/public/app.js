import {
  persistAuthFields,
  persistConnectionFields,
  persistUuidField,
  persistWorkspaceRootsField,
  restoreAuthFields,
  restoreUuidField,
  restoreWorkspaceRootsField,
} from "./app/features/persistence.js";
import { APP_DOM_REFS } from "./app/bootstrap/dom.js";
import {
  DEFAULT_VOICE_SHORTCUT,
  AGENT_ID_KEY,
  CLIENT_KEY,
  MODEL_ID_KEY,
  STORE_KEY,
  UUID_KEY,
  VOICE_SHORTCUT_DISABLED_VALUE,
  VOICE_SHORTCUT_KEY,
  WEBCHAT_DEBUG_KEY,
  WORKSPACE_ROOTS_KEY,
} from "./app/bootstrap/storage-keys.js";
import {
  createDefaultSharedReviewFilters,
  goalsState,
  memoryViewerState,
  subtasksState,
} from "./app/bootstrap/state.js";
import { createAttachmentsFeature } from "./app/features/attachments.js";
import { createAgentSessionCacheFeature } from "./app/features/agent-session-cache.js";
import { createChatEventsFeature } from "./app/features/chat-events.js";
import { createChatNetworkFeature } from "./app/features/chat-network.js";
import { createChatUiFeature } from "./app/features/chat-ui.js";
import { createCanvasContextFeature } from "./app/features/canvas-context.js";
import { decodeContinuationAction } from "./app/features/continuation-targets.js";
import { buildDoctorChatSummary } from "./app/features/doctor-observability.js";
import { createAppShellFeature } from "./app/features/app-shell.js";
import { createGoalsDetailFeature } from "./app/features/goals-detail.js";
import { createGoalsGovernancePanelFeature } from "./app/features/goals-governance-panel.js";
import { createGoalsCapabilityPanelFeature } from "./app/features/goals-capability-panel.js";
import { createGoalsOverviewFeature } from "./app/features/goals-overview.js";
import { createGoalsReadonlyPanelsFeature } from "./app/features/goals-readonly-panels.js";
import { createGoalsRuntimeFeature } from "./app/features/goals-runtime.js";
import { createGoalsTrackingPanelFeature } from "./app/features/goals-tracking-panel.js";
import { createMemoryDetailRenderFeature } from "./app/features/memory-detail-render.js";
import { createMemoryRuntimeFeature } from "./app/features/memory-runtime.js";
import { createMemoryViewerFeature } from "./app/features/memory-viewer.js";
import { buildResidentPanelSummary } from "./app/features/resident-observability-summary.js";
import { createSessionNavigationFeature } from "./app/features/session-navigation.js";
import { createSessionDigestFeature } from "./app/features/session-digest.js";
import { createSettingsRuntimeFeature } from "./app/features/settings-runtime.js";
import { createSubtasksOverviewFeature, parseGoalSessionReference } from "./app/features/subtasks-overview.js";
import { createSubtasksRuntimeFeature } from "./app/features/subtasks-runtime.js";
import { createLocaleController } from "./app/features/locale.js";
import { initPromptController } from "./app/features/prompt.js";
import { createThemeController } from "./app/features/theme.js";
import { createVoiceFeature } from "./app/features/voice.js";
import { createWorkspaceFeature } from "./app/features/workspace.js";
import { LOCALE_DICTIONARIES, LOCALE_META } from "./app/i18n/index.js";

const {
  statusEl,
  authModeEl,
  authValueEl,
  userUuidEl,
  saveUuidBtn,
  workspaceRootsEl,
  connectBtn,
  sendBtn,
  promptEl,
  voiceBtn,
  voiceDurationEl,
  messagesEl,
  modelFilterEl,
  modelSelectEl,
  agentSelectEl,
  themeToggleBtn,
  sidebarEl,
  sidebarTitleEl,
  fileTreeEl,
  refreshTreeBtn,
  chatSection,
  editorSection,
  canvasContextBarEl,
  editorPath,
  editorModeBadge,
  editorTextarea,
  composerSection,
  editorActions,
  cancelEditBtn,
  saveEditBtn,
  openEnvEditorBtn,
  switchRootBtn,
  switchFacetBtn,
  switchCronBtn,
  switchMemoryBtn,
  switchGoalsBtn,
  switchSubtasksBtn,
  switchCanvasBtn,
  openChannelSettingsBtn,
  agentRightPanelEl,
  memoryViewerSection,
  memoryViewerTitleEl,
  memoryViewerStatsEl,
  memoryViewerListEl,
  memoryViewerDetailEl,
  memoryViewerRefreshBtn,
  memoryTabTasksBtn,
  memoryTabMemoriesBtn,
  memoryTabSharedReviewBtn,
  memoryTabOutboundAuditBtn,
  memorySearchInputEl,
  memorySearchBtn,
  memoryTaskFiltersEl,
  memoryChunkFiltersEl,
  memoryTaskStatusFilterEl,
  memoryTaskSourceFilterEl,
  memoryTaskGoalFilterBarEl,
  memoryTaskGoalFilterLabelEl,
  memoryTaskGoalFilterClearBtn,
  memorySharedReviewBatchBarEl,
  memoryChunkTypeFilterEl,
  memoryChunkVisibilityFilterEl,
  memoryChunkGovernanceFilterEl,
  memoryChunkCategoryFilterEl,
  memorySharedReviewFiltersEl,
  memorySharedReviewFocusFilterEl,
  memorySharedReviewTargetFilterEl,
  memorySharedReviewClaimedByFilterEl,
  memorySharedReviewClearFiltersBtn,
  goalsSection,
  goalsSummaryEl,
  goalsListEl,
  goalsDetailEl,
  goalsRefreshBtn,
  subtasksSection,
  subtasksSummaryEl,
  subtasksListEl,
  subtasksDetailEl,
  subtasksShowArchivedEl,
  subtasksRefreshBtn,
  goalCreateBtn,
  goalCreateModal,
  goalCreateCloseBtn,
  goalCreateCancelBtn,
  goalCreateSubmitBtn,
  goalCreateTitleEl,
  goalCreateObjectiveEl,
  goalCreateRootEl,
  goalCreateAutoResumeEl,
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
  taskTokenHistoryEl,
  sessionDigestSummaryEl,
  sessionContinuationSummaryEl,
  sessionDigestRefreshBtn,
  sessionDigestModalEl,
  sessionDigestModalTitleEl,
  sessionDigestModalMetaEl,
  sessionDigestModalActionsEl,
  sessionDigestModalContentEl,
  sessionDigestModalCloseBtn,
  tokenUsageEl,
  restartOverlayEl,
  restartCountdownEl,
  restartReasonEl,
  tokenUsageValueEls,
  taskTokenUsagePanelEl,
  taskTokenValueEls,
  attachmentsPreviewEl,
  attachBtn,
  fileInput,
  saveWorkspaceRootsBtn,
  settingsModal,
  openSettingsBtn,
  closeSettingsBtn,
  saveSettingsBtn,
  restartBtn,
  recommendApiLink,
  officialHomeLink,
  workshopLink,
  cfgApiKey,
  cfgLocale,
  cfgBaseUrl,
  cfgModel,
  cfgModelPreferredProviders,
  refreshModelFallbackConfigBtn,
  modelFallbackConfigMeta,
  cfgModelFallbackContent,
  cfgExternalOutboundRequireConfirmation,
  cfgHeartbeat,
  cfgHeartbeatEnabled,
  cfgHeartbeatActiveHours,
  cfgBrowserRelayEnabled,
  cfgRelayPort,
  cfgMcpEnabled,
  cfgCronEnabled,
  cfgEmbeddingEnabled,
  cfgEmbeddingApiKey,
  cfgEmbeddingBaseUrl,
  cfgEmbeddingModel,
  cfgToolsEnabled,
  cfgAgentToolControlMode,
  cfgAgentToolControlConfirmPassword,
  cfgTtsEnabled,
  cfgTtsProvider,
  cfgTtsVoice,
  cfgDashScopeApiKey,
  cfgVoiceShortcut,
  cfgVoiceShortcutStatus,
  cfgVoiceShortcutDefault,
  cfgVoiceShortcutClear,
  cfgFacetAnchor,
  cfgInjectAgents,
  cfgInjectSoul,
  cfgInjectMemory,
  cfgMaxSystemPromptChars,
  cfgMaxHistory,
  cfgConversationKindMain,
  cfgConversationKindSubtask,
  cfgConversationKindGoal,
  cfgConversationKindHeartbeat,
  channelsSettingsSection,
  openCommunityConfigBtn,
  cfgCommunityApiEnabled,
  cfgCommunityApiToken,
  cfgFeishuAppId,
  cfgFeishuAppSecret,
  cfgFeishuAgentId,
  cfgQqAppId,
  cfgQqAppSecret,
  cfgQqAgentId,
  cfgQqSandbox,
  cfgDiscordEnabled,
  cfgDiscordBotToken,
  refreshChannelSecurityBtn,
  channelSecurityConfigMeta,
  cfgChannelSecurityContent,
  channelReplyChunkingConfigMeta,
  cfgChannelReplyChunkingContent,
  channelSecurityPendingList,
  doctorStatusEl,
  toolSettingsConfirmModal,
  toolSettingsConfirmImpactEl,
  toolSettingsConfirmSummaryEl,
  toolSettingsConfirmExpiryEl,
  toolSettingsConfirmApproveBtn,
  toolSettingsConfirmRejectBtn,
  externalOutboundConfirmModal,
  externalOutboundConfirmPreviewEl,
  externalOutboundConfirmTargetEl,
  externalOutboundConfirmExpiryEl,
  externalOutboundConfirmApproveBtn,
  externalOutboundConfirmRejectBtn,
  toolSettingsModal,
  openToolSettingsBtn,
  closeToolSettingsBtn,
  saveToolSettingsBtn,
  toolSettingsBody,
  toolTabButtons,
} = APP_DOM_REFS;

let ws = null;
let isReady = false;
let activeConversationId = null;
const residentAgentRosterEnabled = window.BELLDANDY_WEB_CONFIG?.residentAgentRosterEnabled !== false;
const CONFIG_CACHE_TTL_MS = 2000;
let configCacheData = null;
let configCacheLoadedAt = 0;
let configCachePromise = null;
const taskTokenHistoryByConversation = new Map();
const TASK_TOKEN_HISTORY_LIMIT = 1;
let transientUrlToken = null;
const clientId = resolveClientId();
let queuedText = null;

const webchatDebugEnabled = (() => {
  try {
    const stored = localStorage.getItem(WEBCHAT_DEBUG_KEY);
    if (stored === "1" || stored === "true") return true;
  } catch {
    // ignore
  }
  const flag = new URLSearchParams(window.location.search).get("debug");
  return flag === "1" || flag === "true";
})();

const promptController = initPromptController({
  promptEl,
  onSubmit: () => sendMessage(),
});

const localeController = createLocaleController({
  storageKey: "ss-webchat-locale",
  defaultLocale: "zh-CN",
  dictionaries: LOCALE_DICTIONARIES,
  localeMeta: LOCALE_META,
});

const themeController = createThemeController({
  storageKey: "ss-webchat-theme",
  defaultTheme: "dark",
  toggleButtonEl: themeToggleBtn,
  translate: localeController.t,
});

let attachmentsFeature = null;
const agentSessionCacheFeature = createAgentSessionCacheFeature();
let workspaceFeature = null;
let chatEventsFeature = null;
let chatNetworkFeature = null;
let chatUiFeature = null;
let canvasContextFeature = null;
let goalsCapabilityPanelFeature = null;
let goalsDetailFeature = null;
let goalsGovernancePanelFeature = null;
let goalsOverviewFeature = null;
let goalsReadonlyPanelsFeature = null;
let goalsRuntimeFeature = null;
let goalsTrackingPanelFeature = null;
let memoryDetailRenderFeature = null;
let memoryRuntimeFeature = null;
let memoryViewerFeature = null;
let sessionDigestFeature = null;
let settingsRuntimeFeature = null;
let subtasksOverviewFeature = null;
let subtasksRuntimeFeature = null;
let sessionNavigationFeature = null;
let residentAgentActivationSeq = 0;

function debugLog(...args) {
  if (!webchatDebugEnabled) return;
  console.debug(...args);
}

const appShellFeature = createAppShellFeature({
  refs: {
    switchRootBtn,
    switchFacetBtn,
    switchCronBtn,
    switchMemoryBtn,
    switchGoalsBtn,
    switchSubtasksBtn,
    switchCanvasBtn,
    chatSection,
    editorSection,
    memoryViewerSection,
    goalsSection,
    subtasksSection,
    composerSection,
    editorActions,
  },
  getTreeMode: () => workspaceFeature?.getTreeMode() ?? "root",
  subtasksState,
  reopenLinkedSession: (sessionId) => sessionNavigationFeature?.openConversationSession(sessionId, "", {
    switchToChat: false,
    renderHint: false,
  }),
  renderCanvasGoalContext: () => renderCanvasGoalContext(),
});
const showNotice = (...args) => appShellFeature.showNotice(...args);
const switchMode = (...args) => appShellFeature.switchMode(...args);
const updateSidebarModeButtons = (...args) => appShellFeature.updateSidebarModeButtons(...args);

sessionNavigationFeature = createSessionNavigationFeature({
  refs: {
    messagesEl,
  },
  setActiveConversationId: (conversationId) => {
    activeConversationId = conversationId;
  },
  renderCanvasGoalContext: () => renderCanvasGoalContext(),
  switchMode,
  getChatEventsFeature: () => chatEventsFeature,
  loadConversationMeta: (conversationId, options) => loadConversationMeta(conversationId, options),
  getSessionDigestFeature: () => sessionDigestFeature,
  t: localeController.t,
});
const openConversationSession = (...args) => sessionNavigationFeature.openConversationSession(...args);

const voiceFeature = createVoiceFeature({
  storageKey: VOICE_SHORTCUT_KEY,
  disabledValue: VOICE_SHORTCUT_DISABLED_VALUE,
  defaultShortcut: DEFAULT_VOICE_SHORTCUT,
  promptEl,
  composerSection,
  voiceButtonEl: voiceBtn,
  voiceDurationEl,
  getIsSettingsOpen: () => Boolean(settingsModal && !settingsModal.classList.contains("hidden")),
  syncPromptHeight: () => promptController.syncHeight(),
  estimateDataUrlBytes,
  estimatePendingAttachmentTotalBytes: () => attachmentsFeature?.estimatePendingAttachmentTotalBytes() ?? 0,
  getAttachmentLimits: () => attachmentsFeature?.getAttachmentLimits() ?? {
    maxFileBytes: DEFAULT_ATTACHMENT_MAX_FILE_BYTES,
    maxTotalBytes: DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES,
  },
  formatBytes,
  addAttachment: (attachment) => {
    attachmentsFeature?.addAttachment(attachment);
  },
  renderAttachmentsPreview: (hintMessage) => {
    attachmentsFeature?.renderAttachmentsPreview(hintMessage);
  },
  onSendMessage: () => sendMessage(),
  t: localeController.t,
  getSpeechRecognitionLocale: () => localeController.getSpeechRecognitionLocale(),
});

localeController.subscribe(() => {
  themeController.refreshLabels?.();
  voiceFeature.refreshLocale?.();
  chatNetworkFeature?.refreshLocale?.();
  workspaceFeature?.refreshLocale?.();
  canvasContextFeature?.refreshLocale?.();
  window._canvasApp?.refreshLocale?.();
  settingsRuntimeFeature?.refreshLocale?.();
  refreshGoalsLocale();
  refreshMemoryLocale();
  memoryViewerFeature?.syncMemoryViewerHeaderTitle?.();
  sessionDigestFeature?.refreshLocale?.();
  refreshSubtasksLocale();
  renderAgentRightPanel();
  syncSaveWorkspaceRootsButton();
  renderTaskTokenHistory();
});

// 身份信息（从 hello-ok 获取）
let agentName = "Agent";
let agentAvatar = "🤖";
let userName = "User";
let userAvatar = "👤";
let defaultAgentName = "Agent";
let defaultAgentAvatar = "🤖";
const agentCatalog = new Map();
let agentPanelUploadInput = null;
let agentPanelUploadTargetAgentId = "";
let agentPanelUploadBusyAgentId = "";
const DEFAULT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const IMAGE_COMPRESS_TRIGGER_BYTES = 800 * 1024;
const IMAGE_COMPRESS_TARGET_BYTES = 1200 * 1024;
const IMAGE_COMPRESS_MAX_EDGE = 2048;
const IMAGE_COMPRESS_RESIZE_FACTOR = 0.85;
const IMAGE_COMPRESS_QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54];
attachmentsFeature = createAttachmentsFeature({
  refs: {
    attachmentsPreviewEl,
    attachBtn,
    fileInput,
    composerSection,
    promptEl,
  },
  defaultLimits: {
    maxFileBytes: DEFAULT_ATTACHMENT_MAX_FILE_BYTES,
    maxTotalBytes: DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES,
  },
  imageCompression: {
    triggerBytes: IMAGE_COMPRESS_TRIGGER_BYTES,
    targetBytes: IMAGE_COMPRESS_TARGET_BYTES,
    maxEdge: IMAGE_COMPRESS_MAX_EDGE,
    resizeFactor: IMAGE_COMPRESS_RESIZE_FACTOR,
    qualities: IMAGE_COMPRESS_QUALITIES,
  },
  estimateDataUrlBytes,
  formatBytes,
});

workspaceFeature = createWorkspaceFeature({
  refs: {
    sidebarEl,
    sidebarTitleEl,
    fileTreeEl,
    refreshTreeBtn,
    editorPathEl: editorPath,
    editorModeBadgeEl: editorModeBadge,
    editorTextareaEl: editorTextarea,
    cancelEditBtn,
    saveEditBtn,
    openEnvEditorBtn,
    switchRootBtn,
    switchFacetBtn,
    switchCronBtn,
    workspaceRootsEl,
  },
  keys: {
    workspaceRootsKey: WORKSPACE_ROOTS_KEY,
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  switchMode: (mode) => switchMode(mode),
  showNotice,
  escapeHtml,
  loadServerConfig,
  syncAttachmentLimitsFromConfig,
  persistWorkspaceRootsField,
  t: localeController.t,
});

restoreAuthFields({ storeKey: STORE_KEY, authModeEl, authValueEl });
restoreWorkspaceRootsField({ workspaceRootsKey: WORKSPACE_ROOTS_KEY, workspaceRootsEl });
restoreUuidField({ uuidKey: UUID_KEY, userUuidEl });

// 监听 UUID 保存按钮
if (saveUuidBtn && userUuidEl) {
  saveUuidBtn.addEventListener("click", () => {
    const uuid = userUuidEl.value.trim();
    debugLog("[UUID] Saving UUID", { hasUuid: Boolean(uuid) });
    persistUuidField({ uuidKey: UUID_KEY, userUuidEl });
    // 如果 WebSocket 已连接，重新连接以更新 UUID
    if (ws && isReady) {
      debugLog("[UUID] UUID changed, reconnecting");
      teardown();
      setTimeout(() => connect(), 100);
    } else {
      debugLog("[UUID] WebSocket not connected, will use UUID on next connect");
    }
  });
}

// 监听 UUID 输入框的变化，自动保存并重新连接（备用方案）
if (userUuidEl) {
  userUuidEl.addEventListener("blur", () => {
    persistUuidField({ uuidKey: UUID_KEY, userUuidEl });
    // 如果 WebSocket 已连接，重新连接以更新 UUID
    if (ws && isReady) {
      debugLog("[UUID] UUID changed (blur), reconnecting");
      teardown();
      setTimeout(() => connect(), 100);
    }
  });
}

// [NEW] Allow ?token=... param to override/set auth
const urlToken = consumeUrlTokenParam();
if (urlToken) {
  authModeEl.value = "token";
  authValueEl.value = urlToken;
  transientUrlToken = urlToken;
}

setStatus(localeController.t("status.disconnected", {}, "disconnected"));
attachmentsFeature.renderAttachmentsPreview();

connectBtn.addEventListener("click", () => connect());
sendBtn.addEventListener("click", () => sendMessage());
if (memoryViewerRefreshBtn) {
  memoryViewerRefreshBtn.addEventListener("click", () => loadMemoryViewer(true));
}
if (memoryTabTasksBtn) {
  memoryTabTasksBtn.addEventListener("click", () => switchMemoryViewerTab("tasks"));
}
if (memoryTabMemoriesBtn) {
  memoryTabMemoriesBtn.addEventListener("click", () => switchMemoryViewerTab("memories"));
}
if (memoryTabSharedReviewBtn) {
  memoryTabSharedReviewBtn.addEventListener("click", () => switchMemoryViewerTab("sharedReview"));
}
if (memoryTabOutboundAuditBtn) {
  memoryTabOutboundAuditBtn.addEventListener("click", () => switchMemoryViewerTab("outboundAudit"));
}
if (memorySearchBtn) {
  memorySearchBtn.addEventListener("click", () => loadMemoryViewer(true));
}
if (goalsRefreshBtn) {
  goalsRefreshBtn.addEventListener("click", () => loadGoals(true));
}
if (subtasksRefreshBtn) {
  subtasksRefreshBtn.addEventListener("click", () => loadSubtasks(true));
}
if (subtasksShowArchivedEl) {
  subtasksShowArchivedEl.checked = subtasksState.includeArchived === true;
  subtasksShowArchivedEl.addEventListener("change", () => {
    subtasksState.includeArchived = subtasksShowArchivedEl.checked === true;
    void loadSubtasks(true);
  });
}
if (goalCreateBtn) {
  goalCreateBtn.addEventListener("click", () => {
    toggleGoalCreateModal(true);
  });
}
if (goalCreateCloseBtn) {
  goalCreateCloseBtn.addEventListener("click", () => toggleGoalCreateModal(false));
}
if (goalCreateCancelBtn) {
  goalCreateCancelBtn.addEventListener("click", () => toggleGoalCreateModal(false));
}
if (goalCreateSubmitBtn) {
  goalCreateSubmitBtn.addEventListener("click", () => {
    void submitGoalCreateForm();
  });
}
if (goalCreateModal) {
  goalCreateModal.addEventListener("click", (event) => {
    if (event.target === goalCreateModal) {
      toggleGoalCreateModal(false);
    }
  });
}
if (goalCheckpointActionCloseBtn) {
  goalCheckpointActionCloseBtn.addEventListener("click", () => toggleGoalCheckpointActionModal(false));
}
if (goalCheckpointActionCancelBtn) {
  goalCheckpointActionCancelBtn.addEventListener("click", () => toggleGoalCheckpointActionModal(false));
}
if (goalCheckpointActionSubmitBtn) {
  goalCheckpointActionSubmitBtn.addEventListener("click", () => {
    void submitGoalCheckpointActionForm();
  });
}
if (goalCheckpointActionModal) {
  goalCheckpointActionModal.addEventListener("click", (event) => {
    if (event.target === goalCheckpointActionModal) {
      if (goalCheckpointActionSubmitBtn?.disabled) return;
      toggleGoalCheckpointActionModal(false);
    }
  });
}
if (goalCreateTitleEl) {
  goalCreateTitleEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitGoalCreateForm();
    }
  });
}
if (goalCreateObjectiveEl) {
  goalCreateObjectiveEl.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submitGoalCreateForm();
    }
  });
}
if (goalCheckpointActionSummaryEl) {
  goalCheckpointActionSummaryEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitGoalCheckpointActionForm();
    }
  });
}
if (goalCheckpointActionNoteEl) {
  goalCheckpointActionNoteEl.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submitGoalCheckpointActionForm();
    }
  });
}
if (memoryTaskGoalFilterClearBtn) {
  memoryTaskGoalFilterClearBtn.addEventListener("click", () => {
    void clearMemoryTaskGoalFilter();
  });
}
if (memorySearchInputEl) {
  memorySearchInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadMemoryViewer(true);
    }
  });
}
if (memoryTaskStatusFilterEl) {
  memoryTaskStatusFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "tasks") loadMemoryViewer(true);
  });
}
if (memoryTaskSourceFilterEl) {
  memoryTaskSourceFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "tasks") loadMemoryViewer(true);
  });
}
if (memoryChunkTypeFilterEl) {
  memoryChunkTypeFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "memories") loadMemoryViewer(true);
  });
}
if (memoryChunkVisibilityFilterEl) {
  memoryChunkVisibilityFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "memories") loadMemoryViewer(true);
  });
}
if (memoryChunkGovernanceFilterEl) {
  memoryChunkGovernanceFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "memories" || memoryViewerState.tab === "sharedReview") loadMemoryViewer(true);
  });
}
if (memoryChunkCategoryFilterEl) {
  memoryChunkCategoryFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "memories") loadMemoryViewer(true);
  });
}
if (memorySharedReviewFocusFilterEl) {
  memorySharedReviewFocusFilterEl.addEventListener("change", () => {
    const next = String(memorySharedReviewFocusFilterEl.value || "").trim();
    memoryViewerState.sharedReviewFilters = {
      ...createDefaultSharedReviewFilters(),
      ...memoryViewerState.sharedReviewFilters,
      focus: next === "actionable" || next === "mine" ? next : "",
      claimedByAgentId: "",
    };
    memoryViewerFeature?.syncSharedReviewFilterUi?.();
    if (memoryViewerState.tab === "sharedReview") loadMemoryViewer(true);
  });
}
if (memorySharedReviewTargetFilterEl) {
  memorySharedReviewTargetFilterEl.addEventListener("change", () => {
    memoryViewerState.sharedReviewFilters = {
      ...createDefaultSharedReviewFilters(),
      ...memoryViewerState.sharedReviewFilters,
      targetAgentId: String(memorySharedReviewTargetFilterEl.value || "").trim(),
    };
    if (memoryViewerState.tab === "sharedReview") loadMemoryViewer(true);
  });
}
if (memorySharedReviewClaimedByFilterEl) {
  memorySharedReviewClaimedByFilterEl.addEventListener("change", () => {
    memoryViewerState.sharedReviewFilters = {
      ...createDefaultSharedReviewFilters(),
      ...memoryViewerState.sharedReviewFilters,
      focus: "",
      claimedByAgentId: String(memorySharedReviewClaimedByFilterEl.value || "").trim(),
    };
    memoryViewerFeature?.syncSharedReviewFilterUi?.();
    if (memoryViewerState.tab === "sharedReview") loadMemoryViewer(true);
  });
}
if (memorySharedReviewClearFiltersBtn) {
  memorySharedReviewClearFiltersBtn.addEventListener("click", () => {
    memoryViewerState.sharedReviewFilters = createDefaultSharedReviewFilters();
    memoryViewerFeature?.syncSharedReviewFilterUi?.();
    if (memoryViewerState.tab === "sharedReview") loadMemoryViewer(true);
  });
}
document.addEventListener("keydown", (event) => {
  voiceFeature.handleGlobalKeydown(event);
});

function setStatus(text) {
  statusEl.textContent = text;
  // Clear error hint if exists (it will be re-added by close handler if needed)
  const hint = document.getElementById("status-hint");
  if (hint) hint.remove();
}

function invalidateServerConfigCache() {
  configCacheData = null;
  configCacheLoadedAt = 0;
  configCachePromise = null;
}

async function loadServerConfig(options = {}) {
  const { force = false } = options;
  if (!ws || !isReady) return null;

  const now = Date.now();
  if (!force && configCacheData && now - configCacheLoadedAt < CONFIG_CACHE_TTL_MS) {
    return configCacheData;
  }
  if (!force && configCachePromise) {
    return configCachePromise;
  }

  const promise = (async () => {
    const res = await sendReq({ type: "req", id: makeId(), method: "config.read" });
    if (!(res && res.ok && res.payload && res.payload.config)) {
      return null;
    }
    configCacheData = res.payload.config;
    configCacheLoadedAt = Date.now();
    return configCacheData;
  })();

  configCachePromise = promise;
  try {
    return await promise;
  } finally {
    if (configCachePromise === promise) {
      configCachePromise = null;
    }
  }
}

async function syncWorkspaceRoots() {
  if (!ws || !isReady || !workspaceRootsEl) return;
  const value = workspaceRootsEl.value.trim();
  if (!value) return;

  persistWorkspaceRootsField({ workspaceRootsKey: WORKSPACE_ROOTS_KEY, workspaceRootsEl });
  const id = makeId();
  await sendReq({
    type: "req",
    id,
    method: "config.update",
    params: { updates: { "BELLDANDY_EXTRA_WORKSPACE_ROOTS": value } }
  });
  invalidateServerConfigCache();
}

function syncAttachmentLimitsFromConfig(config) {
  attachmentsFeature?.syncLimitsFromConfig(config);
}

// 从服务器加载可操作区配置值
async function loadWorkspaceRootsFromServer() {
  return workspaceFeature?.loadWorkspaceRootsFromServer();
}

function handleHelloOk(frame) {
  invalidateServerConfigCache();
  if (frame.agentName) {
    agentName = frame.agentName;
    defaultAgentName = frame.agentName;
  }
  if (frame.agentAvatar) {
    agentAvatar = frame.agentAvatar;
    defaultAgentAvatar = frame.agentAvatar;
  }
  if (frame.userName) userName = frame.userName;
  if (frame.userAvatar) userAvatar = frame.userAvatar;
  chatUiFeature?.refreshAvatar("bot", agentAvatar);
  chatUiFeature?.refreshAvatar("me", userAvatar);

  sessionTotalTokens = 0;
  taskTokenHistoryByConversation.clear();
  Object.values(tokenUsageValueEls).forEach((el) => {
    if (el) el.textContent = "--";
  });
  renderTaskTokenHistory();
  if (activeConversationId) {
    void loadConversationMeta(activeConversationId);
    void sessionDigestFeature?.loadSessionDigest(activeConversationId);
  } else {
    sessionDigestFeature?.clear?.();
  }
  flushQueuedText();

  if (frame.configOk === false) {
    setTimeout(() => {
      toggleSettings(true);
      const guideMsg = appendMessage("bot", "👋 欢迎使用 Star Sanctuary！\n\n检测到 AI 模型尚未配置。请在右侧设置面板填入你的 API Key，然后点击 Save 保存。");
      if (guideMsg) guideMsg.style.whiteSpace = "pre-wrap";
    }, 500);
  }

  if (restartOverlayEl) restartOverlayEl.classList.add("hidden");

  workspaceFeature?.refreshAfterConnectionReady();
  loadWorkspaceRootsFromServer();
  void loadAgentList().then((agents) => {
    if (!residentAgentRosterEnabled) return;
    const selectedAgentId = agentSelectEl?.value || agents?.[0]?.id || "default";
    if (selectedAgentId) {
      void activateResidentAgentConversation(selectedAgentId, { forceEnsure: true, switchToChat: false });
    }
  });
  void loadModelList();

  if (memoryViewerSection && !memoryViewerSection.classList.contains("hidden")) {
    loadMemoryViewer(true);
  }
  if (goalsSection && !goalsSection.classList.contains("hidden")) {
    loadGoals(true);
  }
  if (subtasksSection && !subtasksSection.classList.contains("hidden")) {
    loadSubtasks(true);
  }

  if (!sessionStorage.getItem("booted")) {
    playBootSequence();
    sessionStorage.setItem("booted", "true");
  }
}

function getHttpAuthHeaders() {
  const mode = authModeEl?.value || "none";
  const rawValue = authValueEl?.value.trim() || "";
  if (mode === "token" && rawValue) {
    const token = rawValue.startsWith("setup-") || !/^\d+-\d+$/.test(rawValue)
      ? rawValue
      : `setup-${rawValue}`;
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  if (mode === "password" && rawValue) {
    return {
      "x-belldandy-password": rawValue,
    };
  }
  return {};
}

chatNetworkFeature = createChatNetworkFeature({
  refs: {
    statusEl,
    sendBtn,
    authModeEl,
    authValueEl,
    workspaceRootsEl,
    userUuidEl,
    agentSelectEl,
    modelFilterEl,
    modelSelectEl,
  },
  keys: {
    storeKey: STORE_KEY,
    workspaceRootsKey: WORKSPACE_ROOTS_KEY,
    uuidKey: UUID_KEY,
    agentIdKey: AGENT_ID_KEY,
    modelIdKey: MODEL_ID_KEY,
    clientId,
  },
  getTransientUrlToken: () => transientUrlToken,
  getSocket: () => ws,
  setSocket: (socket) => {
    ws = socket;
  },
  getReady: () => isReady,
  setReady: (ready) => {
    isReady = ready;
  },
  persistConnectionFields,
  setStatus,
  safeJsonParse,
  makeId,
  debugLog,
  onHelloOk: (frame) => handleHelloOk(frame),
  onAgentListLoaded: (agents, selectedAgentId) => syncAgentCatalog(agents, selectedAgentId),
  onEvent: (event, payload) => handleEvent(event, payload),
  t: localeController.t,
});

canvasContextFeature = createCanvasContextFeature({
  refs: {
    canvasContextBarEl,
  },
  getCanvasApp: () => window._canvasApp,
  getGoalsState: () => goalsState,
  getActiveConversationId: () => activeConversationId,
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
  t: localeController.t,
});

chatUiFeature = createChatUiFeature({
  refs: {
    messagesEl,
    chatSection,
  },
  getAgentProfile: () => ({
    name: agentName,
    avatar: agentAvatar,
  }),
  getUserProfile: () => ({
    name: userName,
    avatar: userAvatar,
  }),
  getCurrentAgentId: () => getCurrentAgentSelection(),
  escapeHtml,
  showNotice,
  getAvatarUploadHeaders: () => getHttpAuthHeaders(),
  onAvatarUploaded: ({ role, agentId, avatarPath }) => applyUploadedAvatarChange({ role, agentId, avatarPath }),
});

chatUiFeature.initCopyButtonDelegation();

goalsOverviewFeature = createGoalsOverviewFeature({
  refs: {
    goalsSection,
    goalsSummaryEl,
    goalsListEl,
    goalsDetailEl,
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  getGoalsState: () => goalsState,
  getActiveConversationId: () => activeConversationId,
  isConversationForGoal,
  escapeHtml,
  formatGoalStatus,
  formatDateTime,
  summarizeSourcePath,
  formatGoalPathSource,
  sortGoals,
  getGoalById,
  renderGoalDetail,
  renderCanvasGoalContext,
  onResumeGoal: (goalId) => resumeGoal(goalId),
  onPauseGoal: (goalId) => pauseGoal(goalId),
  t: localeController.t,
});

subtasksOverviewFeature = createSubtasksOverviewFeature({
  refs: {
    subtasksSection,
    subtasksSummaryEl,
    subtasksListEl,
    subtasksDetailEl,
  },
  isConnected: () => Boolean(ws && isReady),
  isViewActive: () => Boolean(subtasksSection && !subtasksSection.classList.contains("hidden")),
  sendReq,
  makeId,
  getSubtasksState: () => subtasksState,
  getActiveConversationId: () => activeConversationId,
  escapeHtml,
  formatDateTime,
  summarizeSourcePath,
  onOpenSourcePath: (sourcePath) => openSourcePath(sourcePath),
  onOpenTask: (taskId) => openTaskFromAudit(taskId),
  onOpenGoal: async (goalId) => {
    switchMode("goals");
    await loadGoals(true, goalId);
  },
  onOpenContinuationAction: (action) => openContinuationAction(action),
  getSelectedAgentId: () => getCurrentAgentSelection(),
  showNotice,
  t: localeController.t,
});

subtasksRuntimeFeature = createSubtasksRuntimeFeature({
  refs: {
    subtasksSection,
    subtasksListEl,
    subtasksDetailEl,
    subtasksShowArchivedEl,
  },
  getSubtasksState: () => subtasksState,
  getSubtasksOverviewFeature: () => subtasksOverviewFeature,
  switchMode,
  openConversationSession,
  t: localeController.t,
});

goalsDetailFeature = createGoalsDetailFeature({
  refs: {
    goalsDetailEl,
  },
  getActiveConversationId: () => activeConversationId,
  isConversationForGoal,
  escapeHtml,
  formatGoalStatus,
  formatDateTime,
  formatGoalPathSource,
  goalDocFilePath,
  goalRuntimeFilePath,
  goalBaseConversationId,
  onBindDetailActions: (goal) => bindGoalDetailActions(goal),
  onLoadGoalCanvasData: (goal) => {
    void loadGoalCanvasData(goal);
  },
  onLoadGoalTrackingData: (goal) => {
    void loadGoalTrackingData(goal);
  },
  onLoadGoalCapabilityData: (goal) => {
    void loadGoalCapabilityData(goal);
  },
  onLoadGoalProgressData: (goal) => {
    void loadGoalProgressData(goal);
  },
  onLoadGoalHandoffData: (goal) => {
    void loadGoalHandoffData(goal);
  },
  onLoadGoalReviewGovernanceData: (goal) => {
    void loadGoalReviewGovernanceData(goal);
  },
  t: localeController.t,
});

goalsReadonlyPanelsFeature = createGoalsReadonlyPanelsFeature({
  refs: {
    goalsDetailEl,
  },
  escapeHtml,
  formatDateTime,
  normalizeGoalBoardId,
  goalRuntimeFilePath,
  onBindHandoffPanelActions: (goal) => bindGoalHandoffPanelActions(goal),
  t: localeController.t,
});

goalsTrackingPanelFeature = createGoalsTrackingPanelFeature({
  refs: {
    goalsDetailEl,
  },
  escapeHtml,
  formatDateTime,
  getGoalCheckpointSlaBadge,
  summarizeSourcePath,
  t: localeController.t,
});

goalsGovernancePanelFeature = createGoalsGovernancePanelFeature({
  refs: {
    goalsDetailEl,
  },
  escapeHtml,
  formatDateTime,
  goalRuntimeFilePath,
});

goalsCapabilityPanelFeature = createGoalsCapabilityPanelFeature({
  refs: {
    goalsDetailEl,
  },
  escapeHtml,
  formatDateTime,
  onOpenSourcePath: (sourcePath) => openSourcePath(sourcePath),
  onOpenSubtask: (taskId) => openSubtaskById(taskId),
  t: localeController.t,
});

goalsRuntimeFeature = createGoalsRuntimeFeature({
  refs: {
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
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  getGoalsState: () => goalsState,
  getGoalsOverviewFeature: () => goalsOverviewFeature,
  getGoalsDetailFeature: () => goalsDetailFeature,
  getGoalById,
  loadGoals: (forceReload = false, preferredGoalId) => goalsOverviewFeature?.loadGoals(forceReload, preferredGoalId),
  showNotice,
  formatDateTime,
  escapeHtml,
  onResumeGoal: (goalId, options) => resumeGoal(goalId, options),
  onPauseGoal: (goalId) => pauseGoal(goalId),
  onOpenSourcePath: (sourcePath) => openSourcePath(sourcePath),
  onOpenTask: (taskId) => openTaskFromAudit(taskId),
  onOpenGoalTaskViewer: (goalId) => openGoalTaskViewer(goalId),
  onOpenGoalBoard: (boardId, goalId) => openGoalCanvasBoard(boardId, goalId),
  onOpenGoalBoardList: (goalId) => openGoalCanvasList(goalId),
  onGenerateGoalHandoff: (goalId) => generateGoalHandoff(goalId),
  onLoadGoalReviewGovernanceData: (goal) => loadGoalReviewGovernanceData(goal),
  onLoadGoalTrackingData: (goal) => loadGoalTrackingData(goal),
  t: localeController.t,
});

memoryDetailRenderFeature = createMemoryDetailRenderFeature({
  refs: {
    memoryViewerDetailEl,
    memoryViewerStatsEl,
    memoryChunkCategoryFilterEl,
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  getMemoryViewerState: () => memoryViewerState,
  getMemoryViewerFeature: () => memoryViewerFeature,
  getGoalDisplayName,
  getCurrentAgentSelection,
  renderMemoryViewerDetailEmpty: (message) => renderMemoryViewerDetailEmpty(message),
  renderMemoryViewerStats: (stats) => renderMemoryViewerStats(stats),
  loadTaskUsageOverview: () => loadTaskUsageOverview(),
  loadTaskDetail: (taskId) => loadTaskDetail(taskId),
  loadCandidateDetail: (candidateId) => loadCandidateDetail(candidateId),
  openTaskFromAudit: (taskId) => openTaskFromAudit(taskId),
  openMemoryFromAudit: (chunkId) => openMemoryFromAudit(chunkId),
  openSourcePath: (sourcePath, options) => openSourcePath(sourcePath, options),
  loadGoals: (forceReload = false, preferredGoalId) => loadGoals(forceReload, preferredGoalId),
  switchMode,
  openGoalTaskViewer,
  showNotice,
  escapeHtml,
  formatDateTime,
  t: localeController.t,
});

memoryViewerFeature = createMemoryViewerFeature({
  refs: {
    memoryViewerSection,
    memoryViewerTitleEl,
    memoryViewerStatsEl,
    memoryViewerListEl,
    memoryViewerDetailEl,
    memoryTabTasksBtn,
    memoryTabMemoriesBtn,
    memoryTabSharedReviewBtn,
    memoryTabOutboundAuditBtn,
    memorySharedReviewBatchBarEl,
    memoryTaskFiltersEl,
    memoryChunkFiltersEl,
    memorySearchInputEl,
    memoryTaskStatusFilterEl,
    memoryTaskSourceFilterEl,
    memoryChunkTypeFilterEl,
    memoryChunkVisibilityFilterEl,
    memoryChunkGovernanceFilterEl,
    memoryChunkCategoryFilterEl,
    memorySharedReviewFiltersEl,
    memorySharedReviewFocusFilterEl,
    memorySharedReviewTargetFilterEl,
    memorySharedReviewClaimedByFilterEl,
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  getMemoryViewerState: () => memoryViewerState,
  getSelectedAgentId: () => getCurrentAgentSelection(),
  getSelectedAgentLabel: () => getCurrentAgentLabel(),
  getAvailableAgents: () => [...agentCatalog.values()],
  syncMemoryTaskGoalFilterUi,
  renderMemoryViewerListEmpty,
  renderMemoryViewerDetailEmpty,
  loadTaskDetail: (taskId) => loadTaskDetail(taskId),
  loadMemoryDetail: (chunkId) => loadMemoryDetail(chunkId),
  escapeHtml,
  formatCount: (value) => memoryDetailRenderFeature.formatCount(value),
  formatDateTime,
  formatDuration: (value) => memoryDetailRenderFeature.formatDuration(value),
  formatLineRange: (startLine, endLine) => memoryDetailRenderFeature.formatLineRange(startLine, endLine),
  formatScore: (score) => memoryDetailRenderFeature.formatScore(score),
  formatMemoryCategory: (value) => memoryDetailRenderFeature.formatMemoryCategory(value),
  normalizeMemoryVisibility: (value) => memoryDetailRenderFeature.normalizeMemoryVisibility(value),
  getVisibilityBadgeClass: (visibility) => memoryDetailRenderFeature.getVisibilityBadgeClass(visibility),
  summarizeSourcePath: (sourcePath) => memoryDetailRenderFeature.summarizeSourcePath(sourcePath),
  getTaskGoalId: (task) => memoryDetailRenderFeature.getTaskGoalId(task),
  getGoalDisplayName,
  getLatestExperienceUsageTimestamp: (...groups) => memoryDetailRenderFeature.getLatestExperienceUsageTimestamp(...groups),
  getActiveMemoryCategoryLabel: () => memoryDetailRenderFeature.getActiveMemoryCategoryLabel(),
  renderMemoryCategoryDistribution: (stats) => memoryDetailRenderFeature.renderMemoryCategoryDistribution(stats),
  renderTaskUsageOverviewCard: () => memoryDetailRenderFeature.renderTaskUsageOverviewCard(),
  bindStatsAuditJumpLinks: () => memoryDetailRenderFeature.bindStatsAuditJumpLinks(),
  bindMemoryPathLinks: () => memoryDetailRenderFeature.bindMemoryPathLinks(),
  bindTaskAuditJumpLinks: () => memoryDetailRenderFeature.bindTaskAuditJumpLinks(),
  showNotice,
  t: localeController.t,
});

memoryRuntimeFeature = createMemoryRuntimeFeature({
  refs: {
    memoryViewerSection,
    memoryTaskGoalFilterBarEl,
    memoryTaskGoalFilterLabelEl,
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  getMemoryViewerState: () => memoryViewerState,
  getMemoryViewerFeature: () => memoryViewerFeature,
  getCurrentAgentSelection,
  getGoalDisplayName,
  switchMode,
  loadGoals: (forceReload = false, preferredGoalId) => loadGoals(forceReload, preferredGoalId),
  showNotice,
  renderMemoryViewerStats: (stats) => renderMemoryViewerStats(stats),
  renderTaskList: (items) => renderTaskList(items),
  renderMemoryList: (items) => renderMemoryList(items),
  renderSharedReviewList: (items) => renderSharedReviewList(items),
  renderTaskDetail: (task) => memoryDetailRenderFeature.renderTaskDetail(task),
  renderCandidateOnlyDetail: (candidate) => renderCandidateOnlyDetail(candidate),
  renderMemoryDetail: (item) => renderMemoryDetail(item),
  renderMemoryViewerListEmpty: (message) => renderMemoryViewerListEmpty(message),
  renderMemoryViewerDetailEmpty: (message) => renderMemoryViewerDetailEmpty(message),
  getCurrentAgentLabel: () => getCurrentAgentLabel(),
  t: localeController.t,
});

sessionDigestFeature = createSessionDigestFeature({
  refs: {
    sessionDigestSummaryEl,
    sessionContinuationSummaryEl,
    sessionDigestRefreshBtn,
    sessionDigestModalEl,
    sessionDigestModalTitleEl,
    sessionDigestModalMetaEl,
    sessionDigestModalActionsEl,
    sessionDigestModalContentEl,
    sessionDigestModalCloseBtn,
  },
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  getActiveConversationId: () => activeConversationId,
  onSendHistoryAction: ({ actionId, conversationId }) => {
    sendConversationHistoryAction(actionId, conversationId);
  },
  onOpenContinuationAction: (action) => openContinuationAction(action),
  escapeHtml,
  formatDateTime,
  showNotice,
  t: localeController.t,
});

function loadAgentList() {
  return chatNetworkFeature?.loadAgentList();
}

function loadModelList() {
  return chatNetworkFeature?.loadModelList();
}

function getCurrentAgentSelection() {
  const selected = agentSelectEl?.value?.trim();
  return selected || "default";
}

function getCurrentAgentLabel() {
  const selectedAgentId = getCurrentAgentSelection();
  const selectedAgent = agentCatalog.get(selectedAgentId);
  if (selectedAgent?.displayName || selectedAgent?.name) {
    return selectedAgent.displayName || selectedAgent.name;
  }
  const selectedIndex = typeof agentSelectEl?.selectedIndex === "number" ? agentSelectEl.selectedIndex : -1;
  if (selectedIndex >= 0) {
    const optionLabel = agentSelectEl?.options?.[selectedIndex]?.text;
    if (typeof optionLabel === "string" && optionLabel.trim()) {
      return optionLabel.trim();
    }
  }
  return "";
}

function resetMemoryViewerStateForAgent(agentId = getCurrentAgentSelection()) {
  const previousAgentId = String(memoryViewerState.activeAgentId || "default").trim() || "default";
  const fallbackTab = memoryViewerState.tab;
  memoryViewerFeature?.captureAgentViewState?.(previousAgentId);
  memoryViewerState.requestToken = Number(memoryViewerState.requestToken || 0) + 1;
  memoryViewerState.activeAgentId = String(agentId || "default").trim() || "default";
  memoryViewerFeature?.applyAgentViewState?.(memoryViewerState.activeAgentId, fallbackTab);
  memoryViewerState.stats = null;
  memoryViewerState.items = [];
  memoryViewerState.selectedId = null;
  memoryViewerState.selectedTask = null;
  memoryViewerState.selectedCandidate = null;
  memoryViewerState.pendingUsageRevokeId = null;
  memoryViewerState.usageOverview = {
    loading: false,
    methods: [],
    skills: [],
  };
  memoryViewerState.usageOverviewSeq = Number(memoryViewerState.usageOverviewSeq || 0) + 1;
  memoryViewerState.memoryQueryView = null;
  memoryViewerState.experienceQueryView = null;
  memoryViewerState.sharedReviewSummary = null;
  memoryViewerState.sharedGovernance = null;
  memoryViewerState.selectedSharedReviewIds = [];
  memoryViewerState.sharedReviewBatchBusy = false;
}

async function refreshMemoryViewerForAgentSwitch(agentId = getCurrentAgentSelection()) {
  resetMemoryViewerStateForAgent(agentId);
  memoryViewerFeature?.syncMemoryViewerHeaderTitle?.();

  if (!memoryViewerSection || memoryViewerSection.classList.contains("hidden")) {
    return;
  }

  if (!ws || !isReady) {
    refreshMemoryLocale();
    return;
  }

  renderMemoryViewerStats(null);
  if (memoryViewerState.tab === "tasks") {
    renderMemoryViewerListEmpty(localeController.t("memory.tasksLoading", {}, "Loading tasks..."));
    renderMemoryViewerDetailEmpty(localeController.t("memory.taskDetailLoading", {}, "Loading task details..."));
  } else {
    renderMemoryViewerListEmpty(localeController.t("memory.memoriesLoading", {}, "Loading memories..."));
    renderMemoryViewerDetailEmpty(localeController.t("memory.memoryDetailLoading", {}, "Loading memory details..."));
  }

  await loadMemoryViewer(true);
}

function syncAgentRuntimeEntry(agentId, patch = {}) {
  if (!agentId) return null;
  const existing = agentCatalog.get(agentId);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
  };
  agentCatalog.set(agentId, next);
  return next;
}

async function ensureResidentAgentSession(agentId) {
  if (!residentAgentRosterEnabled || !agentId) return null;
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "agent.session.ensure",
    params: { agentId },
  });
  if (!res || !res.ok || !res.payload?.conversationId) {
    return null;
  }

  const mainConversationId = typeof res.payload.mainConversationId === "string" && res.payload.mainConversationId.trim()
    ? res.payload.mainConversationId.trim()
    : String(res.payload.conversationId);
  const lastConversationId = typeof res.payload.lastConversationId === "string" && res.payload.lastConversationId.trim()
    ? res.payload.lastConversationId.trim()
    : String(res.payload.conversationId);
  agentSessionCacheFeature.bindAgentConversation(agentId, mainConversationId, { main: true });
  agentSessionCacheFeature.bindAgentConversation(agentId, lastConversationId);
  syncAgentRuntimeEntry(agentId, {
    status: typeof res.payload.status === "string" ? res.payload.status : "idle",
    mainConversationId,
    lastConversationId,
    lastActiveAt: typeof res.payload.lastActiveAt === "number" ? res.payload.lastActiveAt : undefined,
  });
  return res.payload;
}

async function activateResidentAgentConversation(agentId, options = {}) {
  if (!agentId) return;
  const activationSeq = ++residentAgentActivationSeq;
  const forceEnsure = options.forceEnsure === true;
  const switchToChat = options.switchToChat !== false;
  let conversationId = agentSessionCacheFeature.getAgentConversation(agentId)
    || agentCatalog.get(agentId)?.lastConversationId
    || agentCatalog.get(agentId)?.mainConversationId
    || "";

  if (!conversationId || forceEnsure) {
    const ensured = await ensureResidentAgentSession(agentId);
    if (activationSeq !== residentAgentActivationSeq) return;
    conversationId = typeof ensured?.conversationId === "string" ? ensured.conversationId : conversationId;
  }

  if (!conversationId) {
    activeConversationId = null;
    renderCanvasGoalContext();
    chatEventsFeature?.resetStreamingState();
    sessionDigestFeature?.clear?.();
    renderConversationMessages([]);
    return;
  }

  agentSessionCacheFeature.bindAgentConversation(agentId, conversationId, {
    main: conversationId === agentCatalog.get(agentId)?.mainConversationId,
  });
  activeConversationId = conversationId;
  renderCanvasGoalContext();
  if (switchToChat) {
    switchMode("chat");
  }
  chatEventsFeature?.resetStreamingState();

  const cachedMessages = agentSessionCacheFeature.getConversationMessages(conversationId);
  if (cachedMessages.length > 0) {
    renderConversationMessages(cachedMessages);
  } else {
    renderConversationMessages([]);
  }

  void loadConversationMeta(conversationId, { showGoalEntryBanner: true });
  void sessionDigestFeature?.loadSessionDigest(conversationId);
}

function applyUploadedAvatarChange({ role, agentId, avatarPath }) {
  const bustedPath = `${avatarPath}${avatarPath.includes("?") ? "&" : "?"}v=${Date.now()}`;
  if (role === "agent") {
    const targetAgentId = agentId && typeof agentId === "string" ? agentId : getCurrentAgentSelection();
    updateAgentCatalogAvatar(targetAgentId, bustedPath);
    if (targetAgentId === "default") {
      defaultAgentAvatar = bustedPath;
    }
    syncSelectedAgentIdentity();
    chatUiFeature?.refreshAvatar("bot", agentAvatar);
    renderAgentRightPanel();
    return;
  }
  userAvatar = bustedPath;
  chatUiFeature?.refreshAvatar("me", userAvatar);
}

function ensureAgentPanelAvatarUploadInput() {
  if (agentPanelUploadInput) return agentPanelUploadInput;

  agentPanelUploadInput = document.createElement("input");
  agentPanelUploadInput.type = "file";
  agentPanelUploadInput.accept = "image/png,image/jpeg,image/gif,image/webp";
  agentPanelUploadInput.className = "hidden";
  agentPanelUploadInput.addEventListener("change", () => {
    const selectedFile = agentPanelUploadInput?.files?.[0];
    const targetAgentId = agentPanelUploadTargetAgentId;
    agentPanelUploadTargetAgentId = "";
    if (agentPanelUploadInput) {
      agentPanelUploadInput.value = "";
    }
    if (!selectedFile || !targetAgentId) return;
    void uploadAgentPanelAvatar(targetAgentId, selectedFile);
  });
  document.body.appendChild(agentPanelUploadInput);
  return agentPanelUploadInput;
}

function openAgentPanelAvatarPicker(agentId) {
  if (!agentId || agentPanelUploadBusyAgentId) return;
  agentPanelUploadTargetAgentId = agentId;
  ensureAgentPanelAvatarUploadInput().click();
}

async function uploadAgentPanelAvatar(agentId, file) {
  if (!agentId || !file || agentPanelUploadBusyAgentId) return;

  agentPanelUploadBusyAgentId = agentId;
  renderAgentRightPanel();

  try {
    const formData = new FormData();
    formData.append("role", "agent");
    if (agentId !== "default") {
      formData.append("agentId", agentId);
    }
    formData.append("file", file, file.name || "avatar.png");

    const res = await fetch("/api/avatar/upload", {
      method: "POST",
      body: formData,
      headers: getHttpAuthHeaders(),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.ok) {
      const message = payload?.error?.message || localeController.t("agentPanel.avatarUploadFailedMessage", {}, "头像上传失败。");
      showNotice(
        localeController.t("agentPanel.avatarUploadFailedTitle", {}, "头像上传失败"),
        message,
        "error",
        3800,
      );
      return;
    }

    const avatarPath = typeof payload.avatarPath === "string" ? payload.avatarPath : "";
    if (!avatarPath) {
      showNotice(
        localeController.t("agentPanel.avatarUploadFailedTitle", {}, "头像上传失败"),
        localeController.t("agentPanel.avatarMissingPathMessage", {}, "服务端未返回头像路径。"),
        "error",
        3800,
      );
      return;
    }

    applyUploadedAvatarChange({ role: "agent", agentId, avatarPath });
    const agentLabel = agentCatalog.get(agentId)?.displayName || agentCatalog.get(agentId)?.name || agentId;
    showNotice(
      localeController.t("agentPanel.avatarUpdatedTitle", {}, "头像已更新"),
      localeController.t(
        "agentPanel.avatarUpdatedMessage",
        { agentName: agentLabel },
        `${agentLabel} 的头像已写入对应的 IDENTITY.md。`,
      ),
      "success",
      2200,
    );
  } catch (error) {
    showNotice(
      localeController.t("agentPanel.avatarUploadFailedTitle", {}, "头像上传失败"),
      error instanceof Error ? error.message : String(error),
      "error",
      3800,
    );
  } finally {
    agentPanelUploadBusyAgentId = "";
    renderAgentRightPanel();
  }
}

function syncAgentCatalog(agents = [], selectedAgentId = "") {
  agentCatalog.clear();
  for (const agent of Array.isArray(agents) ? agents : []) {
    if (!agent || typeof agent !== "object" || !agent.id) continue;
    const mainConversationId = typeof agent.mainConversationId === "string" ? agent.mainConversationId : "";
    const lastConversationId = typeof agent.lastConversationId === "string" ? agent.lastConversationId : "";
    if (mainConversationId) {
      agentSessionCacheFeature.bindAgentConversation(agent.id, mainConversationId, { main: true });
    }
    if (lastConversationId) {
      agentSessionCacheFeature.bindAgentConversation(agent.id, lastConversationId);
    }
    agentCatalog.set(agent.id, {
      id: agent.id,
      displayName: agent.displayName || agent.id,
      name: agent.name || agent.displayName || agent.id,
      avatar: agent.avatar || "",
      model: agent.model || "",
      status: typeof agent.status === "string" ? agent.status : "idle",
      mainConversationId,
      lastConversationId,
      lastActiveAt: typeof agent.lastActiveAt === "number" ? agent.lastActiveAt : undefined,
      memoryMode: typeof agent.memoryMode === "string" ? agent.memoryMode : "",
      workspaceBinding: typeof agent.workspaceBinding === "string" ? agent.workspaceBinding : "",
      sessionNamespace: typeof agent.sessionNamespace === "string" ? agent.sessionNamespace : "",
      conversationDigest: agent.conversationDigest && typeof agent.conversationDigest === "object"
        ? {
          status: typeof agent.conversationDigest.status === "string" ? agent.conversationDigest.status : "",
          pendingMessageCount: Number(agent.conversationDigest.pendingMessageCount) || 0,
        }
        : null,
      recentTaskDigest: agent.recentTaskDigest && typeof agent.recentTaskDigest === "object"
        ? {
          recentCount: Number(agent.recentTaskDigest.recentCount) || 0,
          latestTaskId: typeof agent.recentTaskDigest.latestTaskId === "string" ? agent.recentTaskDigest.latestTaskId : "",
          latestTitle: typeof agent.recentTaskDigest.latestTitle === "string" ? agent.recentTaskDigest.latestTitle : "",
          latestStatus: typeof agent.recentTaskDigest.latestStatus === "string" ? agent.recentTaskDigest.latestStatus : "",
          latestFinishedAt: typeof agent.recentTaskDigest.latestFinishedAt === "string" ? agent.recentTaskDigest.latestFinishedAt : "",
        }
        : null,
      recentSubtaskDigest: agent.recentSubtaskDigest && typeof agent.recentSubtaskDigest === "object"
        ? {
          recentCount: Number(agent.recentSubtaskDigest.recentCount) || 0,
          latestTaskId: typeof agent.recentSubtaskDigest.latestTaskId === "string" ? agent.recentSubtaskDigest.latestTaskId : "",
          latestSummary: typeof agent.recentSubtaskDigest.latestSummary === "string" ? agent.recentSubtaskDigest.latestSummary : "",
          latestStatus: typeof agent.recentSubtaskDigest.latestStatus === "string" ? agent.recentSubtaskDigest.latestStatus : "",
          latestUpdatedAt: Number(agent.recentSubtaskDigest.latestUpdatedAt) || 0,
          latestAgentId: typeof agent.recentSubtaskDigest.latestAgentId === "string" ? agent.recentSubtaskDigest.latestAgentId : "",
          latestParentTaskId: typeof agent.recentSubtaskDigest.latestParentTaskId === "string" ? agent.recentSubtaskDigest.latestParentTaskId : "",
        }
        : null,
      experienceUsageDigest: agent.experienceUsageDigest && typeof agent.experienceUsageDigest === "object"
        ? {
          usageCount: Number(agent.experienceUsageDigest.usageCount) || 0,
          methodCount: Number(agent.experienceUsageDigest.methodCount) || 0,
          skillCount: Number(agent.experienceUsageDigest.skillCount) || 0,
          latestAssetType: typeof agent.experienceUsageDigest.latestAssetType === "string" ? agent.experienceUsageDigest.latestAssetType : "",
          latestAssetKey: typeof agent.experienceUsageDigest.latestAssetKey === "string" ? agent.experienceUsageDigest.latestAssetKey : "",
          latestTaskId: typeof agent.experienceUsageDigest.latestTaskId === "string" ? agent.experienceUsageDigest.latestTaskId : "",
          latestUsedAt: typeof agent.experienceUsageDigest.latestUsedAt === "string" ? agent.experienceUsageDigest.latestUsedAt : "",
        }
        : null,
      sharedGovernance: agent.sharedGovernance && typeof agent.sharedGovernance === "object"
        ? {
          pendingCount: Number(agent.sharedGovernance.pendingCount) || 0,
          claimedCount: Number(agent.sharedGovernance.claimedCount) || 0,
        }
        : null,
      continuationState: agent.continuationState && typeof agent.continuationState === "object"
        ? {
          scope: typeof agent.continuationState.scope === "string" ? agent.continuationState.scope : "",
          targetId: typeof agent.continuationState.targetId === "string" ? agent.continuationState.targetId : "",
          recommendedTargetId: typeof agent.continuationState.recommendedTargetId === "string" ? agent.continuationState.recommendedTargetId : "",
          targetType: typeof agent.continuationState.targetType === "string" ? agent.continuationState.targetType : "",
          resumeMode: typeof agent.continuationState.resumeMode === "string" ? agent.continuationState.resumeMode : "",
          summary: typeof agent.continuationState.summary === "string" ? agent.continuationState.summary : "",
          nextAction: typeof agent.continuationState.nextAction === "string" ? agent.continuationState.nextAction : "",
        }
        : null,
      observabilityHeadline: typeof agent.observabilityHeadline === "string" ? agent.observabilityHeadline : "",
    });
  }

  if (agentSelectEl && selectedAgentId && agentSelectEl.value !== selectedAgentId) {
    agentSelectEl.value = selectedAgentId;
  }

  syncSelectedAgentIdentity();
  renderAgentRightPanel();
  memoryViewerFeature?.syncMemoryViewerHeaderTitle?.();
  memoryViewerFeature?.syncSharedReviewFilterUi?.();
}

function syncSelectedAgentIdentity() {
  const selectedAgent = agentCatalog.get(getCurrentAgentSelection());
  if (!selectedAgent) return;
  agentName = selectedAgent.name || selectedAgent.displayName || defaultAgentName;
  agentAvatar = selectedAgent.avatar || agentCatalog.get("default")?.avatar || defaultAgentAvatar;
  chatUiFeature?.refreshAvatar("bot", agentAvatar);
  memoryViewerFeature?.syncMemoryViewerHeaderTitle?.();
  memoryViewerFeature?.syncSharedReviewFilterUi?.();
}

function updateAgentCatalogAvatar(agentId, avatarPath) {
  const targetAgentId = agentId && agentId !== "default" ? agentId : "default";
  const existing = agentCatalog.get(targetAgentId);
  if (existing) {
    existing.avatar = avatarPath;
    agentCatalog.set(targetAgentId, existing);
    if (targetAgentId === getCurrentAgentSelection()) {
      agentAvatar = avatarPath;
    }
    return;
  }

  agentCatalog.set(targetAgentId, {
    id: targetAgentId,
    displayName: targetAgentId,
    name: targetAgentId,
    avatar: avatarPath,
    model: "",
  });
  if (targetAgentId === getCurrentAgentSelection()) {
    agentAvatar = avatarPath;
  }
}

async function focusAgentObservabilityTarget(agentId) {
  const targetAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
  if (agentSelectEl && agentSelectEl.value !== targetAgentId) {
    agentSelectEl.value = targetAgentId;
    localStorage.setItem(AGENT_ID_KEY, targetAgentId);
  }
  syncSelectedAgentIdentity();
  renderAgentRightPanel();
  await refreshMemoryViewerForAgentSwitch(targetAgentId);
  if (residentAgentRosterEnabled) {
    await activateResidentAgentConversation(targetAgentId, {
      forceEnsure: true,
      switchToChat: false,
    });
  }
}

function getElementsByDataValue(root, attribute, expectedValue) {
  if (!root || !attribute || !expectedValue) return [];
  return [...root.querySelectorAll(`[${attribute}]`)]
    .filter((node) => node.getAttribute(attribute) === expectedValue);
}

function clearGoalContinuationFocus() {
  goalsDetailEl?.querySelectorAll(".is-continuation-focus").forEach((node) => {
    node.classList.remove("is-continuation-focus");
  });
}

function applyGoalContinuationFocus(goalId = goalsState.selectedId) {
  clearGoalContinuationFocus();
  const focus = goalsState.continuationFocusNode;
  if (!goalsDetailEl || !focus || !focus.nodeId || !goalId || focus.goalId !== goalId) {
    return false;
  }
  const matched = getElementsByDataValue(goalsDetailEl, "data-goal-node-id", focus.nodeId)
    .map((node) => node.closest("[data-goal-continuation-focus]") || node);
  if (!matched.length) return false;
  matched.forEach((node) => node.classList.add("is-continuation-focus"));
  matched
    .map((node) => node.closest(".goal-tracking-card, .goal-capability-card"))
    .filter(Boolean)
    .forEach((node) => node.classList.add("is-continuation-focus"));
  if (!focus.scrolled) {
    matched[0].scrollIntoView({ block: "center", behavior: "smooth" });
    focus.scrolled = true;
  }
  return true;
}

async function openSubtaskBySession(sessionId, options = {}) {
  return subtasksRuntimeFeature?.openSubtaskBySession(sessionId, options);
}

async function openContinuationAction(action = {}) {
  const kind = typeof action?.kind === "string" ? action.kind : "";
  if (!kind) return;

  switch (kind) {
    case "goalReplay":
      if (action.goalId && action.nodeId) {
        goalsState.continuationFocusNode = {
          goalId: action.goalId,
          nodeId: action.nodeId,
          scrolled: false,
        };
      } else {
        goalsState.continuationFocusNode = null;
      }
      subtasksState.linkedSessionContext = null;
      subtasksState.continuationFocusSessionId = null;
      if (!action.goalId) return;
      await resumeGoal(action.goalId, {
        nodeId: typeof action.nodeId === "string" ? action.nodeId : undefined,
        checkpointId: typeof action.checkpointId === "string" ? action.checkpointId : undefined,
        silent: true,
      });
      await loadGoals(true, action.goalId);
      return;
    case "goal":
      goalsState.continuationFocusNode = null;
      subtasksState.linkedSessionContext = null;
      subtasksState.continuationFocusSessionId = null;
      if (!action.goalId) return;
      switchMode("goals");
      await loadGoals(true, action.goalId);
      return;
    case "node":
      if (action.goalId && action.nodeId) {
        goalsState.continuationFocusNode = {
          goalId: action.goalId,
          nodeId: action.nodeId,
          scrolled: false,
        };
      }
      if (!action.goalId) return;
      switchMode("goals");
      await loadGoals(true, action.goalId);
      return;
    case "session":
      goalsState.continuationFocusNode = null;
      if (action.sessionId) {
        await openSubtaskBySession(action.sessionId, { taskId: action.taskId });
        return;
      }
      if (action.taskId) {
        subtasksState.linkedSessionContext = null;
        await openSubtaskById(action.taskId);
      }
      return;
    case "conversation":
      goalsState.continuationFocusNode = null;
      subtasksState.continuationFocusSessionId = null;
      if (action.conversationId) {
        openConversationSession(
          action.conversationId,
          localeController.t(
            "agentPanel.openContinuationConversationHint",
            { conversationId: action.conversationId },
            `Switched to continuation conversation: ${action.conversationId}`,
          ),
        );
        return;
      }
      switchMode("chat");
      return;
    default:
      return;
  }
}

async function openAgentObservabilityAction(agentId, action = {}) {
  const kind = typeof action?.kind === "string" ? action.kind : "";
  if (!kind) return;

  await focusAgentObservabilityTarget(agentId);

  switch (kind) {
    case "task":
      if (!action.taskId) return;
      switchMode("memory");
      await openTaskFromAudit(action.taskId);
      return;
    case "tasks":
      switchMode("memory");
      if (memoryViewerState.tab !== "tasks") {
        switchMemoryViewerTab("tasks");
      } else {
        await loadMemoryViewer(true);
      }
      return;
    case "subtask":
      if (!action.taskId) return;
      await openSubtaskById(action.taskId);
      return;
    case "subtasks":
      switchMode("subtasks");
      await loadSubtasks(true);
      return;
    case "sharedReview":
      switchMode("memory");
      if (memoryViewerState.tab !== "sharedReview") {
        switchMemoryViewerTab("sharedReview");
      } else {
        await loadMemoryViewer(true);
      }
      return;
    case "goal":
    case "node":
    case "session":
    case "conversation":
      await openContinuationAction(action);
      return;
    default:
      return;
  }
}

function openAgentObservabilityModal(agent, observability) {
  const modalOverlay = document.getElementById("agentObservabilityModal");
  const modalTitle = document.getElementById("agentObservabilityModalTitle");
  const modalBody = document.getElementById("agentObservabilityModalBody");
  const modalClose = document.getElementById("agentObservabilityModalClose");
  if (!modalOverlay || !modalBody) return;

  if (modalTitle) {
    modalTitle.textContent = agent.displayName || agent.id || "Agent";
  }

  modalBody.textContent = "";

  if (Array.isArray(observability.badges) && observability.badges.length > 0) {
    const badgesEl = document.createElement("div");
    badgesEl.className = "agent-observability-modal-badges";
    for (const text of observability.badges) {
      if (!text) continue;
      const badge = document.createElement("span");
      badge.className = "agent-observability-modal-badge";
      badge.textContent = text;
      badgesEl.appendChild(badge);
    }
    modalBody.appendChild(badgesEl);
  }

  if (Array.isArray(observability.rows) && observability.rows.length > 0) {
    const rowsEl = document.createElement("div");
    rowsEl.className = "agent-observability-modal-rows";
    for (const row of observability.rows) {
      const rowBtn = document.createElement("button");
      rowBtn.type = "button";
      rowBtn.className = "agent-observability-modal-row";
      rowBtn.title = row.value || row.label || "";
      rowBtn.addEventListener("click", () => {
        modalOverlay.classList.add("hidden");
        void openAgentObservabilityAction(agent.id, row.action);
      });

      const labelEl = document.createElement("span");
      labelEl.className = "agent-observability-modal-label";
      labelEl.textContent = row.label || "";
      rowBtn.appendChild(labelEl);

      const valueEl = document.createElement("span");
      valueEl.className = "agent-observability-modal-value";
      valueEl.textContent = row.value || "";
      rowBtn.appendChild(valueEl);

      rowsEl.appendChild(rowBtn);
    }
    modalBody.appendChild(rowsEl);
  }

  modalOverlay.classList.remove("hidden");

  const closeHandler = () => {
    modalOverlay.classList.add("hidden");
  };
  if (modalClose) {
    modalClose.onclick = closeHandler;
  }
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeHandler();
  }, { once: true });
}

function renderAgentRightPanel() {
  if (!agentRightPanelEl) return;

  const agents = [...agentCatalog.values()];
  agentRightPanelEl.textContent = "";
  agentRightPanelEl.classList.toggle("hidden", agents.length <= 1);
  if (agents.length <= 1) return;

  const fragment = document.createDocumentFragment();
  const activeAgentId = getCurrentAgentSelection();
  const uploadBusy = Boolean(agentPanelUploadBusyAgentId);
  for (const agent of agents) {
    const card = document.createElement("div");
    card.className = "agent-card";
    if (agent.id === activeAgentId) {
      card.classList.add("active");
    }
    card.setAttribute("data-agent-id", agent.id);

    const main = document.createElement("button");
    main.type = "button";
    main.className = "agent-card-main";
    main.title = agent.observabilityHeadline || agent.displayName || agent.id;

    const avatar = document.createElement("div");
    avatar.className = "agent-card-avatar avatar-clickable";
    avatar.title = localeController.t(
      "agentPanel.changeAvatarTitle",
      { agentName: agent.displayName || agent.id },
      `为 ${agent.displayName || agent.id} 更换头像`,
    );
    if (uploadBusy && agentPanelUploadBusyAgentId === agent.id) {
      avatar.style.opacity = "0.5";
      avatar.title = localeController.t("agentPanel.uploadingAvatar", {}, "上传中...");
    }
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      openAgentPanelAvatarPicker(agent.id);
    });

    if (typeof agent.avatar === "string" && agent.avatar.trim()) {
      avatar.style.backgroundImage = `url(${agent.avatar})`;
      avatar.classList.add("agent-card-avatar-image");
    } else {
      const fallbackSeed = (agent.displayName || agent.name || agent.id || "?").trim();
      avatar.textContent = fallbackSeed.slice(0, 1).toUpperCase();
    }

    const content = document.createElement("div");
    content.className = "agent-card-content";

    const name = document.createElement("div");
    name.className = "agent-card-name";
    name.textContent = agent.displayName || agent.id;

    const meta = document.createElement("div");
    meta.className = "agent-card-meta";
    const statusText = typeof agent.status === "string" && agent.status && agent.status !== "idle"
      ? ` · ${agent.status}`
      : "";
    meta.textContent = `${agent.model || agent.id}${statusText}`;

    content.appendChild(name);
    content.appendChild(meta);
    main.appendChild(avatar);
    main.appendChild(content);
    main.addEventListener("click", () => {
      if (!agentSelectEl) return;
      agentSelectEl.value = agent.id;
      agentSelectEl.dispatchEvent(new Event("change"));
    });

    card.appendChild(main);
    const observability = buildResidentPanelSummary(agent, localeController.t);
    if (Array.isArray(observability?.badges) && observability.badges.length > 0 ||
        Array.isArray(observability?.rows) && observability.rows.length > 0) {
      const summaryWrap = document.createElement("div");
      summaryWrap.className = "agent-card-observability";

      const detailBtn = document.createElement("button");
      detailBtn.type = "button";
      detailBtn.className = "agent-card-detail-btn";
      detailBtn.textContent = localeController.t("agentPanel.showDetail", {}, "详情 ▸");
      detailBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openAgentObservabilityModal(agent, observability);
      });
      summaryWrap.appendChild(detailBtn);
      card.appendChild(summaryWrap);
    }
    fragment.appendChild(card);
  }

  agentRightPanelEl.appendChild(fragment);
}

if (agentSelectEl) {
  agentSelectEl.addEventListener("change", async () => {
    const selectedAgentId = agentSelectEl.value || "default";
    localStorage.setItem(AGENT_ID_KEY, selectedAgentId);
    syncSelectedAgentIdentity();
    renderAgentRightPanel();
    void refreshMemoryViewerForAgentSwitch(selectedAgentId);

    if (residentAgentRosterEnabled) {
      await activateResidentAgentConversation(selectedAgentId, { forceEnsure: true });
      return;
    }

    // 切换 Agent = 新建会话（隔离上下文）
    activeConversationId = null;
    renderCanvasGoalContext();
    chatEventsFeature?.resetStreamingState();
    sessionDigestFeature?.clear?.();
    messagesEl.innerHTML = "";
    const displayName = agentSelectEl.options[agentSelectEl.selectedIndex]?.text || agentSelectEl.value;
    appendMessage("system", `已切换到 ${displayName}`);
  });
}

if (modelSelectEl) {
  modelSelectEl.addEventListener("change", () => {
    const selected = modelSelectEl.value || "";
    if (selected) {
      localStorage.setItem(MODEL_ID_KEY, selected);
    } else {
      localStorage.removeItem(MODEL_ID_KEY);
    }
  });
}

// 保存按钮点击事件
let saveWorkspaceRootsButtonState = "default";
let saveWorkspaceRootsResetTimer = null;

function syncSaveWorkspaceRootsButton() {
  if (!saveWorkspaceRootsBtn) return;
  const key = saveWorkspaceRootsButtonState === "saved" ? "common.saved" : "common.save";
  const fallback = saveWorkspaceRootsButtonState === "saved" ? "Saved" : "Save";
  saveWorkspaceRootsBtn.innerHTML = `<u>${localeController.t(key, {}, fallback)}</u>`;
}

syncSaveWorkspaceRootsButton();

if (saveWorkspaceRootsBtn) {
  saveWorkspaceRootsBtn.addEventListener("click", async () => {
    if (!ws || !isReady) {
      alert(localeController.t("panel.saveWorkspaceNotConnected", {}, "Please connect to the server first"));
      return;
    }

    const value = workspaceRootsEl ? workspaceRootsEl.value.trim() : "";

    // 保存到 localStorage
    persistWorkspaceRootsField({ workspaceRootsKey: WORKSPACE_ROOTS_KEY, workspaceRootsEl });

    // 更新 .env
    const id = makeId();
    const res = await sendReq({
      type: "req",
      id,
      method: "config.update",
      params: { updates: { "BELLDANDY_EXTRA_WORKSPACE_ROOTS": value } }
    });

    if (res && res.ok) {
      invalidateServerConfigCache();
      saveWorkspaceRootsButtonState = "saved";
      syncSaveWorkspaceRootsButton();
      if (saveWorkspaceRootsResetTimer) {
        clearTimeout(saveWorkspaceRootsResetTimer);
      }
      saveWorkspaceRootsResetTimer = setTimeout(() => {
        saveWorkspaceRootsButtonState = "default";
        syncSaveWorkspaceRootsButton();
        saveWorkspaceRootsResetTimer = null;
      }, 1500);
    } else {
      const msg = res && res.error ? res.error.message : localeController.t("settings.failed", {}, "Failed");
      alert(localeController.t("panel.saveWorkspaceFailed", { message: msg }, "Save failed: {message}"));
    }
  });
}

function connect() {
  return chatNetworkFeature?.connect();
}

function teardown() {
  return chatNetworkFeature?.teardown();
}

async function playBootSequence() {
  const overlay = document.getElementById("awakening");
  const logEl = document.getElementById("bootLog");
  if (!overlay || !logEl) return;

  overlay.classList.remove("hidden");

  const logs = [
    "Initializing Neural Interface...",
    "Loading Core Memories... OK",
    "Establishing Secure Link... OK",
    "Syncing with Star Sanctuary Gateway...",
    "User Identity Verified.",
    "System Online."
  ];

  for (const line of logs) {
    const p = document.createElement("div");
    p.className = "boot-line";
    p.textContent = `> ${line}`;
    logEl.appendChild(p);
    // Random delay for typing effect
    await new Promise(r => setTimeout(r, 100 + Math.random() * 300));
  }

  await new Promise(r => setTimeout(r, 800));
  overlay.classList.add("hidden");
}
function estimateBase64DecodedBytes(base64) {
  if (typeof base64 !== "string") return 0;
  const normalized = base64.trim().replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : (normalized.endsWith("=") ? 1 : 0);
  return Math.max(0, (normalized.length / 4) * 3 - padding);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function restorePromptText(text) {
  promptController.restoreText(text);
}

function buildConversationHistoryActionPrompt(actionId, conversationId) {
  switch (actionId) {
    case "list_recent":
    case "list_main":
      return localeController.t(
        "panel.sessionHistoryPromptListMain",
        {},
        "请直接使用 conversation_list 工具，并设置 has_messages_only=true、exclude_heartbeat=true、exclude_subtasks=true、exclude_goal_sessions=true，列出最近 8 个当前可访问会话，并用简洁列表返回 conversationId、更新时间、消息数、agentId。",
      );
    case "list_all_allowed":
      return localeController.t(
        "panel.sessionHistoryPromptListAllAllowed",
        {},
        "请直接使用 conversation_list 工具，列出当前运行时策略允许访问的全部会话，并用简洁列表返回 conversationId、更新时间、消息数、agentId。",
      );
    case "read_timeline":
      if (!conversationId) return "";
      return localeController.t(
        "panel.sessionHistoryPromptReadTimeline",
        { conversationId },
        `请直接使用 conversation_read 工具读取当前会话（conversation_id=${conversationId}）的 timeline 视图，并用简洁中文总结关键节点。`,
      );
    case "read_restore":
      if (!conversationId) return "";
      return localeController.t(
        "panel.sessionHistoryPromptReadRestore",
        { conversationId },
        `请直接使用 conversation_read 工具读取当前会话（conversation_id=${conversationId}）的 restore 视图，重点说明 raw、compacted、canonical extraction 三层差异。`,
      );
    default:
      return "";
  }
}

function sendConversationHistoryAction(actionId, conversationId) {
  const promptText = buildConversationHistoryActionPrompt(actionId, conversationId);
  if (!promptText) {
    showNotice(
      localeController.t("panel.sessionDigestFullTitle", {}, "Session Digest Full Text"),
      localeController.t("panel.sessionDigestNoConversation", {}, "No active conversation yet."),
      "error",
    );
    return;
  }
  switchMode("chat");
  void sendMessage({
    textOverride: promptText,
    pendingAttachmentsOverride: [],
  });
}

function buildAttachmentsPayload(attachments) {
  return attachments.map(att => {
    let base64 = "";
    if (typeof att.content === "string" && att.content.startsWith("data:")) {
      const parts = att.content.split(",");
      base64 = parts.length > 1 ? parts[1] : "";
    } else {
      try {
        base64 = window.btoa(unescape(encodeURIComponent(att.content || "")));
      } catch (e) {
        console.error("Base64 conversion failed for", att.name, e);
      }
    }
    return {
      name: att.name,
      type: att.mimeType || "application/octet-stream",
      base64
    };
  });
}

async function sendMessage(options = {}) {
  const hasTextOverride = typeof options.textOverride === "string";
  const text = hasTextOverride ? options.textOverride.trim() : promptEl.value.trim();
  const pendingAttachments = Array.isArray(options.pendingAttachmentsOverride)
    ? options.pendingAttachmentsOverride
    : attachmentsFeature
      ? attachmentsFeature.getPendingAttachments()
      : [];
  const attachmentLimits = attachmentsFeature ? attachmentsFeature.getAttachmentLimits() : {
    maxFileBytes: DEFAULT_ATTACHMENT_MAX_FILE_BYTES,
    maxTotalBytes: DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES,
  };

  if (!text && !pendingAttachments.length) return;
  if (!hasTextOverride) {
    promptEl.value = "";
    promptController.syncHeight();
  }

  if (!ws || !isReady) {
    queuedText = text;
    connect();
    return;
  }

  // ── 斜杠命令：/compact ──
  if (text === "/compact") {
    if (!activeConversationId) {
      appendMessage("bot", "当前没有活跃的对话，无法压缩上下文。");
      return;
    }
    appendMessage("me", "/compact");
    const statusEl = appendMessage("bot", "正在压缩上下文…");
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "context.compact",
      params: { conversationId: activeConversationId },
    });
    if (res && res.ok && res.payload) {
      const p = res.payload;
      if (p.compacted) {
        statusEl.textContent = `上下文压缩完成（${p.tier ?? "unknown"}）：${p.originalTokens ?? "?"} → ${p.compactedTokens ?? "?"} tokens`;
      } else {
        statusEl.textContent = "当前上下文较短，无需压缩。";
      }
    } else {
      statusEl.textContent = "压缩失败：" + (res?.error?.message || "未知错误");
    }
    return;
  }

  // ── 斜杠命令：/restart ──
  if (text === "/restart") {
    appendMessage("me", "/restart");
    const statusEl = appendMessage("bot", localeController.t("settings.restartCommandPending", {}, "Restarting service…"));
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.restart",
    });
    if (res && res.ok) {
      statusEl.textContent = localeController.t("settings.restartCommandAccepted", {}, "Service is restarting, please wait...");
      setStatus(localeController.t("settings.restartingStatus", {}, "Restarting..."));
    } else {
      const message = res?.error?.message || localeController.t("settings.failed", {}, "Failed");
      statusEl.textContent = localeController.t("settings.restartFailed", { message }, `Restart failed: ${message}`);
    }
    return;
  }

  // ── 斜杠命令：/doctor ──
  if (text === "/doctor") {
    appendMessage("me", "/doctor");
    const statusEl = appendMessage("bot", "正在执行健康检查…");
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.doctor",
      params: {
        ...(activeConversationId ? { promptConversationId: activeConversationId, toolConversationId: activeConversationId } : {}),
        ...(agentSelectEl?.value ? { promptAgentId: agentSelectEl.value, toolAgentId: agentSelectEl.value } : {}),
      },
    });
    if (res && res.ok && res.payload && res.payload.checks) {
      const lines = res.payload.checks.map(c => {
        const icon = c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
        return `${icon} ${c.name}: ${c.message}`;
      });
      lines.push(...buildDoctorChatSummary(res.payload, localeController.t));
      statusEl.textContent = lines.join("\n");
    } else {
      statusEl.textContent = "健康检查失败：" + (res?.error?.message || "未知错误");
    }
    return;
  }

  // Canvas context injection: when user sends from canvas view, prepend board snapshot
  let finalText = text;
  const canvasSection = document.getElementById("canvasSection");
  if (canvasSection && !canvasSection.classList.contains("hidden") && window._canvasApp?.currentBoardId && window._canvasApp.manager?.board) {
    const snapshot = window._canvasApp.getCanvasSnapshot();
    if (snapshot) {
      finalText = `[当前画布上下文]\n${snapshot}\n\n[用户消息]\n${text}`;
    }
  }

  // 准备附件数据（用于预估体积 + 实际发送）
  const attachments = buildAttachmentsPayload(pendingAttachments);
  const attachmentDecodedBytes = attachments.reduce((sum, att) => sum + estimateBase64DecodedBytes(att.base64), 0);

  const uuid = userUuidEl ? userUuidEl.value.trim() : ""; // 获取UUID
  const params = {
    conversationId: activeConversationId || undefined,
    text: finalText,
    from: "web",
    clientContext: {
      sentAtMs: Date.now(),
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
    },
    roomContext: { environment: "local" },
    modelId: modelSelectEl?.value || undefined,
    agentId: agentSelectEl?.value || undefined,
    attachments,
  };

  // 如果有UUID，添加到params
  if (uuid) {
    params.userUuid = uuid;
  }

  const oversizedAttachment = attachments.find((att) => estimateBase64DecodedBytes(att.base64) > attachmentLimits.maxFileBytes);
  if (oversizedAttachment) {
    appendMessage("bot",
      `⚠️ 本次消息已在发送前拦截。\n` +
      `附件 "${oversizedAttachment.name}" 超过单文件大小限制。\n` +
      `当前限制：${formatBytes(attachmentLimits.maxFileBytes)}（可通过 BELLDANDY_ATTACHMENT_MAX_FILE_BYTES 调整）。\n` +
      `建议：压缩文件或拆分后重试。`
    );
    console.warn("message.send blocked by single attachment limit", {
      fileName: oversizedAttachment.name,
      fileLimitBytes: attachmentLimits.maxFileBytes,
      attachmentCount: attachments.length,
    });
    if (!hasTextOverride) {
      restorePromptText(text);
    }
    return;
  }

  if (attachmentDecodedBytes > attachmentLimits.maxTotalBytes) {
    appendMessage("bot",
      `⚠️ 本次消息已在发送前拦截。\n` +
      `附件总大小约 ${formatBytes(attachmentDecodedBytes)}，超过总限制 ${formatBytes(attachmentLimits.maxTotalBytes)}。\n` +
      `可通过 BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES 调整上限，或减少附件后重试。`
    );
    console.warn("message.send blocked by attachment total limit", {
      attachmentDecodedBytes,
      totalLimitBytes: attachmentLimits.maxTotalBytes,
      attachmentCount: attachments.length,
    });
    if (!hasTextOverride) {
      restorePromptText(text);
    }
    return;
  }

  const displayText = text || (pendingAttachments.length ? "[语音消息]" : "");
  const optimisticUserMeta = {
    timestampMs: params.clientContext.sentAtMs,
    isLatest: true,
  };
  appendMessage("me", displayText + (pendingAttachments.length ? ` [${pendingAttachments.length} 附件]` : ""), optimisticUserMeta);
  if (residentAgentRosterEnabled && activeConversationId) {
    agentSessionCacheFeature.bindAgentConversation(getCurrentAgentSelection(), activeConversationId, {
      main: activeConversationId === agentCatalog.get(getCurrentAgentSelection())?.mainConversationId,
    });
    agentSessionCacheFeature.appendUserMessage(
      activeConversationId,
      displayText + (pendingAttachments.length ? ` [${pendingAttachments.length} 附件]` : ""),
      {
        timestampMs: optimisticUserMeta.timestampMs,
        agentId: getCurrentAgentSelection(),
      },
    );
  }
  const botMsgEl = chatEventsFeature?.beginStreamingReply({
    timestampMs: Date.now(),
    isLatest: false,
  }) || appendMessage("bot", "", { timestampMs: Date.now(), isLatest: false });

  if (!Array.isArray(options.pendingAttachmentsOverride)) {
    attachmentsFeature?.clearPendingAttachments();
  }

  const id = makeId();
  const payload = await sendReq({
    type: "req",
    id,
    method: "message.send",
    params,
  });

  if (payload && payload.ok === false) {
    if (payload.error && payload.error.code === "pairing_required") {
      const msg = payload.error.message ? String(payload.error.message) : "Pairing required.";
      if (botMsgEl) {
        botMsgEl.innerHTML = `\n        <div style="line-height: 1.6;">\n          ${escapeHtml(msg)}<br><br>\n          <b>新手操作指南：</b><br>\n          1. 不要关闭当前网页。<br>\n          2. <b>保持那个运行着服务的黑色窗口不要关</b>，然后在项目目录下重新打开一个<b>新的黑色终端窗口</b>。<br>\n          3. 在这个新窗口里，复制并粘贴下面的完整命令，然后按回车键：<br>\n          <div style="background: var(--bg-secondary); padding: 8px; border-radius: 4px; margin: 8px 0; font-family: monospace;">\n            corepack pnpm bdd pairing approve &lt;CODE&gt;\n          </div>\n          <i style="color: var(--text-tertiary); font-size: 0.9em;">（注意：请把 <code>&lt;CODE&gt;</code> 换成上方实际给你的配对码）</i><br><br>\n          4. 终端提示成功后，在这个网页再发一次消息即可。\n        </div>\n      `;
      }
      return;
    }
    if (payload.error && payload.error.code === "config_required") {
      if (botMsgEl) {
        botMsgEl.textContent = `❌ 配置缺失：${payload.error.message}\n请点击右上角设置图标（⚙️）完善配置。`;
      }
      toggleSettings(true); // Auto open settings
      return;
    }
  }

  if (payload && payload.ok && payload.payload && payload.payload.conversationId) {
    activeConversationId = String(payload.payload.conversationId);
    if (residentAgentRosterEnabled) {
      const currentAgentId = getCurrentAgentSelection();
      agentSessionCacheFeature.bindAgentConversation(currentAgentId, activeConversationId, {
        main: activeConversationId === agentCatalog.get(currentAgentId)?.mainConversationId,
      });
      syncAgentRuntimeEntry(currentAgentId, {
        lastConversationId: activeConversationId,
      });
      renderAgentRightPanel();
    }
    if (payload.payload.messageMeta) {
      const wrappers = messagesEl?.querySelectorAll(".msg-wrapper.me .msg[data-latest='true']") || [];
      const latestUserBubble = wrappers.length ? wrappers[wrappers.length - 1] : null;
      if (latestUserBubble) {
        chatUiFeature?.updateMessageMeta?.(latestUserBubble, payload.payload.messageMeta);
      }
    }
    renderCanvasGoalContext();
    void loadConversationMeta(activeConversationId, { renderMessages: false });
    void sessionDigestFeature?.loadSessionDigest(activeConversationId);
  }
}

// ... existing handleEvent ...

// 暴露给 WebView 等环境的接口
window.__BELLDANDY_WEBCHAT_READY__ = true;

// Initialize Recommend API Link
if (recommendApiLink && window.BELLDANDY_WEB_CONFIG?.recommendApiUrl) {
  recommendApiLink.href = window.BELLDANDY_WEB_CONFIG.recommendApiUrl;
}

// Initialize Official Home Link（官方主页链接）
if (officialHomeLink && window.BELLDANDY_WEB_CONFIG?.officialHomeUrl) {
  officialHomeLink.href = window.BELLDANDY_WEB_CONFIG.officialHomeUrl;
}

// Initialize Workshop Link（工坊入口链接）
if (workshopLink && window.BELLDANDY_WEB_CONFIG?.workshopUrl) {
  workshopLink.href = window.BELLDANDY_WEB_CONFIG.workshopUrl;
}
const REDACTED_PLACEHOLDER = "[REDACTED]";

settingsRuntimeFeature = createSettingsRuntimeFeature({
  refs: APP_DOM_REFS,
  isConnected: () => Boolean(ws && isReady),
  sendReq,
  makeId,
  setStatus,
  loadServerConfig,
  invalidateServerConfigCache,
  syncAttachmentLimitsFromConfig,
  voiceFeature,
  localeController,
  chatNetworkFeature,
  onOpenCommunityConfig: () => {
    void openFile("community.json");
  },
  onOpenContinuationAction: (action) => openContinuationAction(action),
  getConnectionAuthMode: () => authModeEl?.value || "none",
  clientId,
  getSelectedAgentId: () => agentSelectEl?.value || localStorage.getItem(AGENT_ID_KEY) || "default",
  getActiveConversationId: () => activeConversationId || "",
  getSelectedSubtaskId: () => subtasksState.selectedId || "",
  isSubtasksViewActive: () => Boolean(subtasksSection && !subtasksSection.classList.contains("hidden")),
  escapeHtml,
  showNotice,
  redactedPlaceholder: REDACTED_PLACEHOLDER,
});

function toggleSettings(show) {
  settingsRuntimeFeature?.toggleSettings(show);
}

chatEventsFeature = createChatEventsFeature({
  appendMessage,
  showRestartCountdown,
  setTokenUsageRunning: (running) => {
    if (!tokenUsageEl) return;
    tokenUsageEl.classList.toggle("updating", Boolean(running));
  },
  updateTokenUsage,
  showTaskTokenResult,
  onChannelSecurityPending: (payload) => settingsRuntimeFeature?.handleChannelSecurityPending(payload),
  queueGoalUpdateEvent,
  onSubtaskUpdated: (payload) => subtasksOverviewFeature?.handleSubtaskUpdate(payload),
  onToolSettingsConfirmRequired: (payload) => settingsRuntimeFeature?.handleToolSettingsConfirmRequired(payload),
  onToolSettingsConfirmResolved: (payload) => settingsRuntimeFeature?.handleToolSettingsConfirmResolved(payload),
  onExternalOutboundConfirmRequired: (payload) => settingsRuntimeFeature?.handleExternalOutboundConfirmRequired(payload),
  onExternalOutboundConfirmResolved: (payload) => settingsRuntimeFeature?.handleExternalOutboundConfirmResolved(payload),
  onToolsConfigUpdated: (payload) => settingsRuntimeFeature?.handleToolsConfigUpdated(payload),
  onConversationDigestUpdated: (payload) => sessionDigestFeature?.handleDigestUpdated(payload),
  stripThinkBlocks,
  configureMarkedOnce,
  renderAssistantMessage: (bubble, rawText) => chatUiFeature?.renderAssistantMessage?.(bubble, rawText),
  updateMessageMeta: (bubble, meta) => chatUiFeature?.updateMessageMeta?.(bubble, meta),
  forceScrollToBottom,
  getCanvasApp: () => window._canvasApp,
  getActiveConversationId: () => activeConversationId,
  onAgentStatusEvent: (payload) => {
    const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
    const agentId = typeof payload?.agentId === "string"
      ? payload.agentId
      : [...agentCatalog.values()].find((agent) => agentSessionCacheFeature.getAgentConversation(agent.id) === conversationId)?.id;
    if (!agentId) return;
    const nextStatus = payload?.status === "running"
      ? "running"
      : payload?.status === "error"
        ? "error"
        : "idle";
    syncAgentRuntimeEntry(agentId, { status: nextStatus });
    renderAgentRightPanel();
  },
  onConversationDelta: (payload) => {
    const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
    const delta = typeof payload?.delta === "string" ? payload.delta : "";
    if (!conversationId || !delta) return;
    agentSessionCacheFeature.appendAssistantDelta(conversationId, delta, {
      timestampMs: Date.now(),
    });
  },
  onConversationFinal: (payload) => {
    const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
    if (!conversationId) return;
    agentSessionCacheFeature.finalizeAssistantMessage(conversationId, payload?.text || "", {
      timestampMs: typeof payload?.messageMeta?.timestampMs === "number" ? payload.messageMeta.timestampMs : Date.now(),
      displayTimeText: typeof payload?.messageMeta?.displayTimeText === "string" ? payload.messageMeta.displayTimeText : "",
      agentId: typeof payload?.agentId === "string" ? payload.agentId : undefined,
    });
  },
  escapeHtml,
});

connect();

function handleEvent(event, payload) {
  chatEventsFeature?.handleEvent(event, payload);
}

function showRestartCountdown(countdown, reason) {
  if (!restartOverlayEl || !restartCountdownEl) return;

  if (countdown > 0) {
    // 显示倒计时
    restartOverlayEl.classList.remove("hidden");
    if (restartReasonEl) {
      restartReasonEl.textContent = reason;
    }
    restartCountdownEl.textContent = String(countdown);
    // pulse 动画
    restartCountdownEl.classList.remove("pulse");
    void restartCountdownEl.offsetWidth; // force reflow
    restartCountdownEl.classList.add("pulse");
  } else {
    // countdown === 0，服务即将断开
    restartCountdownEl.textContent = "…";
    setStatus(localeController.t("settings.restartingStatus", {}, "Restarting..."));
  }
}

function formatTokenCount(n) {
  if (n == null || n === 0) return "--";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatDurationMs(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

function formatTaskTokenTime(ts) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "--";
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function normalizeTaskTokenRecord(record) {
  if (!record || typeof record !== "object") return null;
  return {
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : "task",
    inputTokens: Number(record.inputTokens || 0),
    outputTokens: Number(record.outputTokens || 0),
    totalTokens: Number(record.totalTokens || 0),
    durationMs: Number(record.durationMs || 0),
    createdAt: typeof record.createdAt === "number" ? record.createdAt : Date.now(),
    auto: record.auto === true,
  };
}

function setTaskTokenHistory(conversationId, items) {
  if (!conversationId) return;
  const normalized = Array.isArray(items)
    ? items.map(normalizeTaskTokenRecord).filter(Boolean).slice(0, TASK_TOKEN_HISTORY_LIMIT)
    : [];
  taskTokenHistoryByConversation.set(conversationId, normalized);
  if (conversationId === activeConversationId) {
    renderTaskTokenHistory();
  }
}

function prependTaskTokenHistory(conversationId, item) {
  if (!conversationId) return;
  const normalized = normalizeTaskTokenRecord(item);
  if (!normalized) return;
  const current = taskTokenHistoryByConversation.get(conversationId) || [];
  taskTokenHistoryByConversation.set(conversationId, [normalized, ...current].slice(0, TASK_TOKEN_HISTORY_LIMIT));
  if (conversationId === activeConversationId) {
    renderTaskTokenHistory();
  }
}

function renderConversationMessages(messages) {
  if (!messagesEl) return;
  messagesEl.innerHTML = "";

  if (!Array.isArray(messages) || messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "system-msg";
    empty.textContent = "当前会话暂无消息";
    messagesEl.appendChild(empty);
    return;
  }

  for (const item of messages) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "assistant" ? "bot" : "me";
    const content = typeof item.content === "string" ? item.content : String(item.content ?? "");
    const meta = {
      timestampMs: typeof item.timestampMs === "number" && Number.isFinite(item.timestampMs) ? item.timestampMs : undefined,
      displayTimeText: typeof item.displayTimeText === "string" ? item.displayTimeText : undefined,
      isLatest: item.isLatest === true,
    };
    const bubble = appendMessage(role, role === "bot" ? "" : content, meta);
    if (role === "bot") {
      chatUiFeature?.renderAssistantMessage?.(bubble, content);
    }
    chatUiFeature?.updateMessageMeta?.(bubble, meta);
  }
}

async function loadConversationMeta(conversationId, options = {}) {
  const renderMessages = options.renderMessages !== false;
  const showGoalEntryBanner = options.showGoalEntryBanner === true;
  if (!conversationId || !ws || !isReady) {
    renderTaskTokenHistory();
    sessionDigestFeature?.clear?.();
    return;
  }
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "conversation.meta",
    params: { conversationId, limit: TASK_TOKEN_HISTORY_LIMIT },
  });
  if (res && res.ok && res.payload) {
    if (Array.isArray(res.payload.taskTokenResults)) {
      setTaskTokenHistory(conversationId, res.payload.taskTokenResults);
    } else {
      renderTaskTokenHistory();
    }
    if (Array.isArray(res.payload.messages)) {
      agentSessionCacheFeature.setConversationMessages(conversationId, res.payload.messages);
    }
    if (renderMessages && Array.isArray(res.payload.messages) && conversationId === activeConversationId) {
      renderConversationMessages(res.payload.messages);
      if (showGoalEntryBanner && parseGoalSessionReference(conversationId)) {
        const goalSessionEntryBanner = typeof res.payload.goalSessionEntryBanner === "string"
          ? res.payload.goalSessionEntryBanner.trim()
          : "";
        if (goalSessionEntryBanner) {
          appendMessage("system", goalSessionEntryBanner);
        }
      }
    }
    sessionDigestFeature?.setContinuationState?.(res.payload.continuationState || null, { conversationId });
    return;
  }
  sessionDigestFeature?.setContinuationState?.(null, { conversationId });
  renderTaskTokenHistory();
}

function renderTaskTokenHistory() {
  if (!taskTokenHistoryEl) return;
  const items = activeConversationId
    ? (taskTokenHistoryByConversation.get(activeConversationId) || [])
    : [];
  const latestItems = items.slice(0, 1);

  if (!latestItems.length) {
    taskTokenHistoryEl.innerHTML = `<div class="task-token-history-empty">${escapeHtml(localeController.t("panel.taskTokenEmpty", {}, "No task-level token records yet"))}</div>`;
    return;
  }

  taskTokenHistoryEl.innerHTML = latestItems.map((item) => `
    <div class="task-token-chip${item.auto ? " auto" : ""}">
      <div class="task-token-chip-top">
        <span class="task-token-chip-name">${escapeHtml(item.name)}</span>
        <span class="task-token-chip-badge">${item.auto ? "AUTO" : "MANUAL"}</span>
      </div>
      <div class="task-token-chip-sep">|</div>
      <div class="task-token-chip-total">TOTAL ${escapeHtml(formatTokenCount(item.totalTokens))}</div>
      <div class="task-token-chip-sep">|</div>
      <div class="task-token-chip-meta">IN ${escapeHtml(formatTokenCount(item.inputTokens))} <span style="opacity:0.5;margin:0 2px;">/</span> OUT ${escapeHtml(formatTokenCount(item.outputTokens))}</div>
      <div class="task-token-chip-sep">|</div>
      <div class="task-token-chip-meta">${escapeHtml(formatDurationMs(item.durationMs))} <span style="opacity:0.5;margin:0 2px;">/</span> ${escapeHtml(formatTaskTokenTime(item.createdAt))}</div>
    </div>
  `).join("");
}

let sessionTotalTokens = 0;

function updateTokenUsage(payload) {
  if (!payload) return;
  const set = (id, val) => {
    const el = tokenUsageValueEls[id];
    if (el) el.textContent = formatTokenCount(val);
  };
  set("tuSys", payload.systemPromptTokens);
  set("tuCtx", payload.contextTokens);
  set("tuIn", payload.inputTokens);
  set("tuOut", payload.outputTokens);
  // 会话累计：每次收到 usage 事件，累加 input + output
  sessionTotalTokens += (payload.inputTokens || 0) + (payload.outputTokens || 0);
  set("tuAll", sessionTotalTokens);
  // 移除 updating 动画
  if (tokenUsageEl) tokenUsageEl.classList.remove("updating");
}

let taskTokenHideTimer = null;

function showTaskTokenResult(payload) {
  if (!payload) return;
  if (!taskTokenUsagePanelEl) return;

  if (payload.conversationId) {
    prependTaskTokenHistory(String(payload.conversationId), payload);
  }

  const set = (id, val) => {
    const el = taskTokenValueEls[id];
    if (el) el.textContent = typeof val === "number" ? formatTokenCount(val) : String(val ?? "--");
  };
  set("taskName", payload.name);
  set("taskIn", payload.inputTokens);
  set("taskOut", payload.outputTokens);
  set("taskTotal", payload.totalTokens);

  taskTokenUsagePanelEl.style.display = "flex";

  // 8 秒后自动隐藏
  if (taskTokenHideTimer) clearTimeout(taskTokenHideTimer);
  taskTokenHideTimer = setTimeout(() => {
    taskTokenUsagePanelEl.style.display = "none";
  }, 8000);
}

function flushQueuedText() {
  const text = queuedText;
  if (!text) return;
  queuedText = null;
  promptEl.value = text;
  sendMessage();
}

function appendMessage(kind, text, meta) {
  return chatUiFeature?.appendMessage(kind, text, meta) || null;
}

/**
 * 处理消息中的图片和视频，转换为缩略图
 * @param {HTMLElement} msgEl - 消息气泡元素
 */
function processMediaInMessage(msgEl) {
  return chatUiFeature?.processMediaInMessage(msgEl);
}

/**
 * 打开媒体弹窗
 * @param {string} src - 媒体源 URL
 * @param {string} type - 媒体类型 ("image" 或 "video")
 */
function openMediaModal(src, type) {
  return chatUiFeature?.openMediaModal(src, type);
}

/** 强制滚动到底部 - 使用 chatSection 作为滚动容器 */
function forceScrollToBottom() {
  return chatUiFeature?.forceScrollToBottom();
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function makeId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendReq(frame) {
  return chatNetworkFeature?.sendReq(frame) ?? Promise.resolve(null);
}

function resolveClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {
    // ignore
  }
  const id = makeId();
  try {
    localStorage.setItem(CLIENT_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

// ==================== 附件处理逻辑 ====================

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  return estimateBase64DecodedBytes(dataUrl.slice(comma + 1));
}

if (switchMemoryBtn) {
  switchMemoryBtn.addEventListener("click", async () => {
    switchMode("memory");
    await loadMemoryViewer(false);
  });
}
if (switchGoalsBtn) {
  switchGoalsBtn.addEventListener("click", async () => {
    switchMode("goals");
    await loadGoals(false);
  });
}
if (switchSubtasksBtn) {
  switchSubtasksBtn.addEventListener("click", async () => {
    switchMode("subtasks");
    await loadSubtasks(false);
  });
}
if (openChannelSettingsBtn) {
  openChannelSettingsBtn.addEventListener("click", () => {
    void settingsRuntimeFeature?.openChannels?.();
  });
}

// 画布工作区按钮
if (switchCanvasBtn) {
  switchCanvasBtn.addEventListener("click", async () => {
    if (window._canvasApp) {
      switchMode("canvas");
      await window._canvasApp.showBoardList();
    }
  });
}

function renderAttachmentsPreview(hintMessage = "") {
  attachmentsFeature?.renderAttachmentsPreview(hintMessage);
}

function openEnvFile() {
  return workspaceFeature?.openEnvFile();
}

function loadFileTree(folderPath = "") {
  return workspaceFeature?.loadFileTree(folderPath);
}

function openFile(filePath) {
  return workspaceFeature?.openFile(filePath);
}

function openSourcePath(sourcePath, options = {}) {
  return workspaceFeature?.openSourcePath(sourcePath, options);
}

function readSourceFile(sourcePath) {
  return workspaceFeature?.readSourceFile(sourcePath);
}

function saveFile() {
  return workspaceFeature?.saveFile();
}

function cancelEdit() {
  return workspaceFeature?.cancelEdit();
}

function switchTreeMode(mode) {
  return workspaceFeature?.switchTreeMode(mode);
}

function goalBaseConversationId(goalId) {
  return canvasContextFeature?.goalBaseConversationId(goalId) || `goal:${goalId}`;
}

function isGoalConversationId(conversationId) {
  return canvasContextFeature?.isGoalConversationId(conversationId)
    || (typeof conversationId === "string" && conversationId.startsWith("goal:"));
}

function isConversationForGoal(conversationId, goalId) {
  return canvasContextFeature?.isConversationForGoal(conversationId, goalId)
    || (typeof conversationId === "string" && conversationId.startsWith(goalBaseConversationId(goalId)));
}

function parseGoalConversationContext(conversationId) {
  return canvasContextFeature?.parseGoalConversationContext(conversationId) || null;
}

function renderCanvasGoalContext() {
  return canvasContextFeature?.renderCanvasGoalContext();
}

function getGoalById(goalId) {
  return Array.isArray(goalsState.items)
    ? goalsState.items.find((goal) => goal && goal.id === goalId) || null
    : null;
}

function upsertGoalStateItem(goal) {
  if (!goal || !goal.id) return null;
  const current = Array.isArray(goalsState.items) ? goalsState.items : [];
  const next = [...current.filter((item) => item && item.id !== goal.id), goal];
  goalsState.items = sortGoals(next);
  return getGoalById(goal.id);
}

function sortGoals(items) {
  return [...items].sort((a, b) => {
    const aActive = a?.status === "executing" ? 1 : 0;
    const bActive = b?.status === "executing" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const aUpdated = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bUpdated = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;
    return String(a?.title || "").localeCompare(String(b?.title || ""));
  });
}

function isGoalsViewActive() {
  return Boolean(goalsSection && !goalsSection.classList.contains("hidden"));
}

function needsGoalDetailRerender(previousGoal, nextGoal) {
  if (!previousGoal) return true;
  const fields = [
    "title",
    "objective",
    "status",
    "currentPhase",
    "pathSource",
    "activeConversationId",
    "activeNodeId",
    "lastNodeId",
    "lastRunId",
    "pausedAt",
    "goalRoot",
    "docRoot",
    "runtimeRoot",
    "northstarPath",
    "tasksPath",
    "progressPath",
    "handoffPath",
    "boardId",
  ];
  return fields.some((field) => String(previousGoal?.[field] || "") !== String(nextGoal?.[field] || ""));
}

function refreshGoalDetailAreas(goal, areas) {
  if (!goal || !Array.isArray(areas) || !isGoalsViewActive() || goalsState.selectedId !== goal.id) return;
  const areaSet = new Set(areas);
  if (areaSet.has("tracking")) void loadGoalTrackingData(goal);
  if (areaSet.has("progress")) void loadGoalProgressData(goal);
  if (areaSet.has("handoff")) void loadGoalHandoffData(goal);
  if (areaSet.has("capability")) void loadGoalCapabilityData(goal);
  if (areaSet.has("goal") || areaSet.has("tracking") || areaSet.has("capability")) void loadGoalReviewGovernanceData(goal);
  if (areaSet.has("goal") && areaSet.has("tracking")) void loadGoalCanvasData(goal);
}

function flushGoalUpdate(goalId) {
  if (!goalId) return;
  if (goalsState.liveUpdateTimers?.[goalId]) {
    clearTimeout(goalsState.liveUpdateTimers[goalId]);
    delete goalsState.liveUpdateTimers[goalId];
  }
  const pending = goalsState.liveUpdatePending?.[goalId];
  if (!pending?.goal) return;
  delete goalsState.liveUpdatePending[goalId];

  const previousGoal = getGoalById(goalId);
  const mergedGoal = upsertGoalStateItem(pending.goal) || pending.goal;
  if (isGoalsViewActive()) {
    renderGoalsSummary(goalsState.items);
    renderGoalList(goalsState.items);
  }
  if (goalsState.selectedId === goalId && isGoalsViewActive()) {
    if (needsGoalDetailRerender(previousGoal, mergedGoal)) {
      renderGoalDetail(mergedGoal);
    } else {
      refreshGoalDetailAreas(mergedGoal, pending.areas);
    }
  }
  renderCanvasGoalContext();
}

function queueGoalUpdateEvent(payload) {
  const goal = payload && payload.goal && typeof payload.goal === "object" ? payload.goal : null;
  const goalId = typeof goal?.id === "string" ? goal.id : "";
  if (!goalId) return;
  const areas = Array.isArray(payload?.areas)
    ? payload.areas.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const pending = goalsState.liveUpdatePending?.[goalId];
  goalsState.liveUpdatePending[goalId] = {
    goal,
    areas: pending?.areas
      ? [...new Set([...pending.areas, ...areas])]
      : [...new Set(areas)],
    reason: payload?.reason || pending?.reason || "",
    at: payload?.at || pending?.at || "",
  };
  if (goalsState.liveUpdateTimers?.[goalId]) {
    clearTimeout(goalsState.liveUpdateTimers[goalId]);
  }
  goalsState.liveUpdateTimers[goalId] = setTimeout(() => {
    flushGoalUpdate(goalId);
  }, goalsState.liveUpdateDelayMs || 120);
}

function formatGoalStatus(status) {
  if (!status) return "-";
  const labels = {
    draft: "draft",
    aligning: "aligning",
    planning: "planning",
    ready: "ready",
    executing: "executing",
    blocked: "blocked",
    pending_approval: "pending_approval",
    reviewing: "reviewing",
    paused: "paused",
    completed: "completed",
    archived: "archived",
  };
  return labels[status] || String(status);
}

function formatGoalPathSource(source) {
  return source === "user-configured" ? "user-configured" : "default";
}

function goalDocFilePath(goal, fileName) {
  if (!goal?.docRoot) return "";
  return /[\\/]$/.test(goal.docRoot) ? `${goal.docRoot}${fileName}` : `${goal.docRoot}/${fileName}`;
}

function goalRuntimeFilePath(goal, fileName) {
  if (!goal?.runtimeRoot) return "";
  return /[\\/]$/.test(goal.runtimeRoot) ? `${goal.runtimeRoot}${fileName}` : `${goal.runtimeRoot}/${fileName}`;
}

function getGoalDisplayName(goalId) {
  if (!goalId) return "-";
  const goal = getGoalById(goalId);
  return goal?.title || goalId;
}

function syncMemoryTaskGoalFilterUi() {
  return memoryRuntimeFeature?.syncMemoryTaskGoalFilterUi();
}

async function clearMemoryTaskGoalFilter() {
  return memoryRuntimeFeature?.clearMemoryTaskGoalFilter();
}

async function openGoalTaskViewer(goalId) {
  return memoryRuntimeFeature?.openGoalTaskViewer(goalId);
}

function resetGoalCreateForm() {
  if (goalCreateTitleEl) goalCreateTitleEl.value = "";
  if (goalCreateObjectiveEl) goalCreateObjectiveEl.value = "";
  if (goalCreateRootEl) goalCreateRootEl.value = "";
  if (goalCreateAutoResumeEl) goalCreateAutoResumeEl.checked = true;
}

function toggleGoalCreateModal(show) {
  if (!goalCreateModal) return;
  if (show) {
    resetGoalCreateForm();
    goalCreateModal.classList.remove("hidden");
    setTimeout(() => goalCreateTitleEl?.focus(), 0);
  } else {
    goalCreateModal.classList.add("hidden");
  }
}

function getGoalCheckpointSlaBadge(checkpoint) {
  if (!checkpoint?.slaAt) return "";
  const deadline = new Date(checkpoint.slaAt);
  if (Number.isNaN(deadline.getTime())) {
    return `<span class="memory-badge">SLA ${escapeHtml(checkpoint.slaAt)}</span>`;
  }
  const overdue = deadline.getTime() < Date.now();
  return `<span class="memory-badge ${overdue ? "is-overdue" : ""}">${overdue ? "SLA 已超时" : "SLA"} ${escapeHtml(formatDateTime(checkpoint.slaAt))}</span>`;
}

function toggleGoalCheckpointActionModal(show, context = null) {
  return goalsRuntimeFeature?.toggleGoalCheckpointActionModal(show, context);
}

function renderGoalsLoading(message) {
  return goalsRuntimeFeature?.renderGoalsLoading(message);
}

function renderGoalsSummary(items) {
  return goalsRuntimeFeature?.renderGoalsSummary(items);
}

function renderGoalsEmpty(message) {
  return goalsRuntimeFeature?.renderGoalsEmpty(message);
}

function renderGoalList(items) {
  return goalsRuntimeFeature?.renderGoalList(items);
}

function refreshGoalsLocale() {
  return goalsRuntimeFeature?.refreshGoalsLocale();
}

function refreshSubtasksLocale() {
  return subtasksRuntimeFeature?.refreshSubtasksLocale();
}

function bindGoalDetailActions(goal) {
  return goalsRuntimeFeature?.bindGoalDetailActions(goal);
}

async function runGoalCheckpointAction(goalId, nodeId, checkpointId, action) {
  return goalsRuntimeFeature?.runGoalCheckpointAction(goalId, nodeId, checkpointId, action);
}

function getGoalActionActor() {
  const uuid = userUuidEl?.value.trim() || "";
  return uuid || "web-ui";
}

async function runGoalApprovalScan(goalId, options = {}) {
  if (!ws || !isReady) {
    showNotice("无法执行审批扫描", "未连接到服务器。", "error");
    return;
  }
  const goal = getGoalById(goalId);
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.approval.scan",
    params: {
      goalId,
      autoEscalate: options.autoEscalate !== false,
    },
  });
  if (!res?.ok) {
    showNotice("审批扫描失败", res?.error?.message || "goal.approval.scan 调用失败。", "error");
    return;
  }
  showNotice("审批扫描完成", res.payload?.summary || "已刷新 approval workflow 状态。", "success");
  if (goal) {
    void loadGoalReviewGovernanceData(goal);
    void loadGoalTrackingData(goal);
  }
}

async function runGoalSuggestionReviewDecision(goalId, input) {
  if (!ws || !isReady) {
    showNotice("无法执行 suggestion review", "未连接到服务器。", "error");
    return;
  }
  const actor = window.prompt("审批人 / Reviewer", getGoalActionActor()) || getGoalActionActor();
  const note = window.prompt("审批备注（可留空）", "") || "";
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.suggestion_review.decide",
    params: {
      goalId,
      reviewId: input.reviewId,
      suggestionType: input.suggestionType || undefined,
      suggestionId: input.suggestionId || undefined,
      decision: input.decision,
      reviewer: actor,
      decidedBy: actor,
      note: note || undefined,
    },
  });
  if (!res?.ok) {
    showNotice("suggestion review 失败", res?.error?.message || "goal.suggestion_review.decide 调用失败。", "error");
    return;
  }
  showNotice("suggestion review 已提交", `${input.decision} 已写入审批流。`, "success");
  const goal = getGoalById(goalId);
  if (goal) void loadGoalReviewGovernanceData(goal);
}

async function runGoalSuggestionReviewEscalation(goalId, input) {
  if (!ws || !isReady) {
    showNotice("无法升级 suggestion review", "未连接到服务器。", "error");
    return;
  }
  const escalatedTo = window.prompt("升级到的 Reviewer", "") || "";
  const reason = window.prompt("升级原因", "Need escalation") || "";
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.suggestion_review.escalate",
    params: {
      goalId,
      reviewId: input.reviewId,
      suggestionType: input.suggestionType || undefined,
      suggestionId: input.suggestionId || undefined,
      escalatedBy: getGoalActionActor(),
      escalatedTo: escalatedTo || undefined,
      reason: reason || undefined,
      force: true,
    },
  });
  if (!res?.ok) {
    showNotice("suggestion review 升级失败", res?.error?.message || "goal.suggestion_review.escalate 调用失败。", "error");
    return;
  }
  showNotice("suggestion review 已升级", "当前审批 stage 已升级。", "success");
  const goal = getGoalById(goalId);
  if (goal) void loadGoalReviewGovernanceData(goal);
}

async function runGoalCheckpointEscalation(goalId, nodeId, checkpointId) {
  if (!ws || !isReady) {
    showNotice("无法升级 checkpoint", "未连接到服务器。", "error");
    return;
  }
  const escalatedTo = window.prompt("升级到的 Reviewer", "") || "";
  const reason = window.prompt("升级原因", "Need escalation") || "";
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.checkpoint.escalate",
    params: {
      goalId,
      nodeId,
      checkpointId,
      escalatedBy: getGoalActionActor(),
      escalatedTo: escalatedTo || undefined,
      reason: reason || undefined,
      force: true,
    },
  });
  if (!res?.ok) {
    showNotice("checkpoint 升级失败", res?.error?.message || "goal.checkpoint.escalate 调用失败。", "error");
    return;
  }
  showNotice("checkpoint 已升级", "当前 checkpoint 审批 stage 已升级。", "success");
  const goal = getGoalById(goalId);
  if (goal) {
    void loadGoalReviewGovernanceData(goal);
    void loadGoalTrackingData(goal);
  }
}

async function submitGoalCheckpointActionForm() {
  return goalsRuntimeFeature?.submitGoalCheckpointActionForm();
}

function normalizeGoalNodeStatus(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!normalized) return "pending";
  if (["done", "completed", "complete", "success", "succeeded", "approved"].includes(normalized)) return "completed";
  if (["running", "executing", "in_progress", "processing"].includes(normalized)) return "running";
  if (["blocked", "failed", "error"].includes(normalized)) return "blocked";
  return normalized;
}

function normalizeCheckpointStatus(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!normalized) return "required";
  return normalized;
}

function parseGoalGraphNodes(rawGraph) {
  if (!rawGraph || typeof rawGraph !== "object") return [];
  const rawNodes = Array.isArray(rawGraph.nodes)
    ? rawGraph.nodes
    : rawGraph.nodes && typeof rawGraph.nodes === "object"
      ? Object.values(rawGraph.nodes)
      : [];
  return rawNodes.map((node, index) => {
    const item = node && typeof node === "object" ? node : {};
    const data = item.data && typeof item.data === "object" ? item.data : {};
    const id = item.id || data.id || `node-${index + 1}`;
    const title = item.title || data.title || item.name || data.name || id;
    const status = normalizeGoalNodeStatus(item.status || data.status);
    const phase = item.phase || data.phase || item.stage || data.stage || "";
    const owner = item.owner || data.owner || "";
    const lastRunId = item.lastRunId || data.lastRunId || "";
    const summary = item.summary || data.summary || "";
    const artifacts = Array.isArray(item.artifacts)
      ? item.artifacts
      : Array.isArray(data.artifacts)
        ? data.artifacts
        : [];
    return {
      id: String(id),
      title: String(title),
      status,
      phase: phase ? String(phase) : "",
      owner: owner ? String(owner) : "",
      lastRunId: lastRunId ? String(lastRunId) : "",
      summary: summary ? String(summary) : "",
      artifacts: artifacts
        .map((artifact) => typeof artifact === "string" ? artifact.trim() : "")
        .filter(Boolean),
    };
  });
}

function parseGoalCheckpoints(rawCheckpoints) {
  if (!rawCheckpoints || typeof rawCheckpoints !== "object") return [];
  const items = Array.isArray(rawCheckpoints.items) ? rawCheckpoints.items : [];
  return items.map((item, index) => {
    const data = item && typeof item === "object" ? item : {};
    const id = data.id || `checkpoint-${index + 1}`;
    const title = data.title || data.summary || id;
    const history = Array.isArray(data.history)
      ? data.history.map((entry, historyIndex) => {
        const historyItem = entry && typeof entry === "object" ? entry : {};
        return {
          action: historyItem.action ? String(historyItem.action) : `history-${historyIndex + 1}`,
          status: normalizeCheckpointStatus(historyItem.status),
          at: historyItem.at ? String(historyItem.at) : "",
          summary: historyItem.summary ? String(historyItem.summary) : "",
          note: historyItem.note ? String(historyItem.note) : "",
          actor: historyItem.actor ? String(historyItem.actor) : "",
          reviewer: historyItem.reviewer ? String(historyItem.reviewer) : "",
          reviewerRole: historyItem.reviewerRole ? String(historyItem.reviewerRole) : "",
          requestedBy: historyItem.requestedBy ? String(historyItem.requestedBy) : "",
          decidedBy: historyItem.decidedBy ? String(historyItem.decidedBy) : "",
          slaAt: historyItem.slaAt ? String(historyItem.slaAt) : "",
          runId: historyItem.runId ? String(historyItem.runId) : "",
        };
      })
      : [];
    return {
      id: String(id),
      title: String(title),
      status: normalizeCheckpointStatus(data.status),
      updatedAt: data.updatedAt ? String(data.updatedAt) : "",
      requestedAt: data.requestedAt ? String(data.requestedAt) : "",
      decidedAt: data.decidedAt ? String(data.decidedAt) : "",
      summary: data.summary ? String(data.summary) : "",
      note: data.note ? String(data.note) : "",
      reviewer: data.reviewer ? String(data.reviewer) : "",
      reviewerRole: data.reviewerRole ? String(data.reviewerRole) : "",
      requestedBy: data.requestedBy ? String(data.requestedBy) : "",
      decidedBy: data.decidedBy ? String(data.decidedBy) : "",
      slaAt: data.slaAt ? String(data.slaAt) : "",
      nodeId: data.nodeId ? String(data.nodeId) : "",
      runId: data.runId ? String(data.runId) : "",
      workflow: data.workflow && typeof data.workflow === "object" ? data.workflow : null,
      history,
    };
  });
}

function normalizeGoalCapabilityPlanStatus(status) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (normalized === "orchestrated") return "orchestrated";
  return "planned";
}

function normalizeGoalCapabilityExecutionMode(mode) {
  const normalized = typeof mode === "string" ? mode.trim().toLowerCase() : "";
  return normalized === "multi_agent" ? "multi_agent" : "single_agent";
}

function normalizeGoalCapabilityRiskLevel(level) {
  const normalized = typeof level === "string" ? level.trim().toLowerCase() : "";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

function parseStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
}

function parseLearningReviewInput(rawInput) {
  if (!rawInput || typeof rawInput !== "object") return null;
  const summary = rawInput.summary && typeof rawInput.summary === "object" ? rawInput.summary : {};
  return {
    summary: {
      available: summary.available === true,
      headline: summary.headline ? String(summary.headline) : "",
      memorySignalCount: Number(summary.memorySignalCount || 0),
      candidateSignalCount: Number(summary.candidateSignalCount || 0),
      reviewSignalCount: Number(summary.reviewSignalCount || 0),
      nudgeCount: Number(summary.nudgeCount || 0),
    },
    summaryLines: parseStringList(rawInput.summaryLines),
    nudges: parseStringList(rawInput.nudges),
  };
}

function parseGoalCapabilityPlans(rawPlans) {
  if (!rawPlans || typeof rawPlans !== "object") return [];
  const items = Array.isArray(rawPlans.items) ? rawPlans.items : [];
  return items
    .map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      const checkpoint = data.checkpoint && typeof data.checkpoint === "object" ? data.checkpoint : {};
        const actualUsage = data.actualUsage && typeof data.actualUsage === "object" ? data.actualUsage : {};
        const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {};
        const orchestration = data.orchestration && typeof data.orchestration === "object" ? data.orchestration : {};
        const coordinationPlan = orchestration.coordinationPlan && typeof orchestration.coordinationPlan === "object"
          ? orchestration.coordinationPlan
          : {};
        const rolePolicy = coordinationPlan.rolePolicy && typeof coordinationPlan.rolePolicy === "object"
          ? coordinationPlan.rolePolicy
          : {};
        const verifierHandoff = orchestration.verifierHandoff && typeof orchestration.verifierHandoff === "object"
          ? orchestration.verifierHandoff
          : {};
        const verifierResult = orchestration.verifierResult && typeof orchestration.verifierResult === "object"
          ? orchestration.verifierResult
          : {};
        const methods = Array.isArray(data.methods) ? data.methods : [];
        const skills = Array.isArray(data.skills) ? data.skills : [];
        const mcpServers = Array.isArray(data.mcpServers) ? data.mcpServers : [];
        const subAgents = Array.isArray(data.subAgents) ? data.subAgents : [];
        const deviations = Array.isArray(analysis.deviations) ? analysis.deviations : [];
        const delegationResults = Array.isArray(orchestration.delegationResults) ? orchestration.delegationResults : [];
        const verifierFindings = Array.isArray(verifierResult.findings) ? verifierResult.findings : [];
        return {
        id: data.id ? String(data.id) : `plan-${index + 1}`,
        goalId: data.goalId ? String(data.goalId) : "",
        nodeId: data.nodeId ? String(data.nodeId) : "",
        runId: data.runId ? String(data.runId) : "",
        status: normalizeGoalCapabilityPlanStatus(data.status),
        executionMode: normalizeGoalCapabilityExecutionMode(data.executionMode),
        riskLevel: normalizeGoalCapabilityRiskLevel(data.riskLevel),
        objective: data.objective ? String(data.objective) : "",
        summary: data.summary ? String(data.summary) : "",
        queryHints: parseStringList(data.queryHints),
        reasoning: parseStringList(data.reasoning),
        methods: methods
          .map((entry) => entry && typeof entry === "object" ? {
            file: entry.file ? String(entry.file) : "",
            title: entry.title ? String(entry.title) : "",
            score: Number.isFinite(entry.score) ? Number(entry.score) : null,
            reason: entry.reason ? String(entry.reason) : "",
          } : null)
          .filter((entry) => entry && entry.file),
        skills: skills
          .map((entry) => entry && typeof entry === "object" ? {
            name: entry.name ? String(entry.name) : "",
            description: entry.description ? String(entry.description) : "",
            score: Number.isFinite(entry.score) ? Number(entry.score) : null,
            priority: entry.priority ? String(entry.priority) : "",
            source: entry.source ? String(entry.source) : "",
            reason: entry.reason ? String(entry.reason) : "",
          } : null)
          .filter((entry) => entry && entry.name),
        mcpServers: mcpServers
          .map((entry) => entry && typeof entry === "object" ? {
            serverId: entry.serverId ? String(entry.serverId) : "",
            status: entry.status ? String(entry.status) : "unknown",
            toolCount: Number.isFinite(entry.toolCount) ? Number(entry.toolCount) : null,
            resourceCount: Number.isFinite(entry.resourceCount) ? Number(entry.resourceCount) : null,
            reason: entry.reason ? String(entry.reason) : "",
          } : null)
          .filter((entry) => entry && entry.serverId),
          subAgents: subAgents
            .map((entry) => entry && typeof entry === "object" ? {
              agentId: entry.agentId ? String(entry.agentId) : "",
              role: entry.role ? String(entry.role) : "",
              objective: entry.objective ? String(entry.objective) : "",
              reason: entry.reason ? String(entry.reason) : "",
              deliverable: entry.deliverable ? String(entry.deliverable) : "",
              handoffToVerifier: entry.handoffToVerifier === true,
            } : null)
            .filter((entry) => entry && entry.agentId && entry.objective),
        gaps: parseStringList(data.gaps),
        checkpoint: {
          required: checkpoint.required === true,
          reasons: parseStringList(checkpoint.reasons),
          approvalMode: checkpoint.approvalMode ? String(checkpoint.approvalMode) : "none",
          requiredRequestFields: parseStringList(checkpoint.requiredRequestFields),
          requiredDecisionFields: parseStringList(checkpoint.requiredDecisionFields),
          suggestedTitle: checkpoint.suggestedTitle ? String(checkpoint.suggestedTitle) : "",
          suggestedNote: checkpoint.suggestedNote ? String(checkpoint.suggestedNote) : "",
          suggestedReviewer: checkpoint.suggestedReviewer ? String(checkpoint.suggestedReviewer) : "",
          suggestedReviewerRole: checkpoint.suggestedReviewerRole ? String(checkpoint.suggestedReviewerRole) : "",
          suggestedSlaHours: Number.isFinite(checkpoint.suggestedSlaHours) ? Number(checkpoint.suggestedSlaHours) : null,
          escalationMode: checkpoint.escalationMode ? String(checkpoint.escalationMode) : "none",
        },
        actualUsage: {
          methods: parseStringList(actualUsage.methods),
          skills: parseStringList(actualUsage.skills),
          mcpServers: parseStringList(actualUsage.mcpServers),
          toolNames: parseStringList(actualUsage.toolNames),
          updatedAt: actualUsage.updatedAt ? String(actualUsage.updatedAt) : "",
        },
        analysis: {
          status: typeof analysis.status === "string" && analysis.status.trim() ? String(analysis.status).trim() : "pending",
          summary: analysis.summary ? String(analysis.summary) : "",
          deviations: deviations
            .map((entry) => entry && typeof entry === "object" ? {
              kind: entry.kind ? String(entry.kind) : "",
              area: entry.area ? String(entry.area) : "",
              severity: entry.severity ? String(entry.severity) : "",
              summary: entry.summary ? String(entry.summary) : "",
              planned: parseStringList(entry.planned),
              actual: parseStringList(entry.actual),
            } : null)
            .filter(Boolean),
          recommendations: parseStringList(analysis.recommendations),
          updatedAt: analysis.updatedAt ? String(analysis.updatedAt) : "",
        },
          generatedAt: data.generatedAt ? String(data.generatedAt) : "",
          updatedAt: data.updatedAt ? String(data.updatedAt) : "",
          orchestratedAt: data.orchestratedAt ? String(data.orchestratedAt) : "",
          orchestration: {
            claimed: orchestration.claimed === true,
            delegated: orchestration.delegated === true,
            delegationCount: Number.isFinite(orchestration.delegationCount) ? Number(orchestration.delegationCount) : 0,
            coordinationPlan: coordinationPlan.summary ? {
              summary: String(coordinationPlan.summary),
              plannedDelegationCount: Number.isFinite(coordinationPlan.plannedDelegationCount)
                ? Number(coordinationPlan.plannedDelegationCount)
                : 0,
              rolePolicy: {
                selectedRoles: parseStringList(rolePolicy.selectedRoles),
                selectionReasons: parseStringList(rolePolicy.selectionReasons),
                verifierRole: rolePolicy.verifierRole ? String(rolePolicy.verifierRole) : "",
                fanInStrategy: rolePolicy.fanInStrategy ? String(rolePolicy.fanInStrategy) : "",
              },
            } : null,
            delegationResults: delegationResults
              .map((entry) => entry && typeof entry === "object" ? {
                agentId: entry.agentId ? String(entry.agentId) : "",
                role: entry.role ? String(entry.role) : "",
                status: entry.status ? String(entry.status) : "success",
                summary: entry.summary ? String(entry.summary) : "",
                error: entry.error ? String(entry.error) : "",
                sessionId: entry.sessionId ? String(entry.sessionId) : "",
                taskId: entry.taskId ? String(entry.taskId) : "",
                outputPath: entry.outputPath ? String(entry.outputPath) : "",
              } : null)
              .filter((entry) => entry && entry.agentId && entry.summary),
            verifierHandoff: verifierHandoff.summary ? {
              status: verifierHandoff.status ? String(verifierHandoff.status) : "not_required",
              verifierRole: verifierHandoff.verifierRole ? String(verifierHandoff.verifierRole) : "",
              verifierAgentId: verifierHandoff.verifierAgentId ? String(verifierHandoff.verifierAgentId) : "",
              verifierTaskId: verifierHandoff.verifierTaskId ? String(verifierHandoff.verifierTaskId) : "",
              verifierSessionId: verifierHandoff.verifierSessionId ? String(verifierHandoff.verifierSessionId) : "",
              summary: String(verifierHandoff.summary),
              sourceAgentIds: parseStringList(verifierHandoff.sourceAgentIds),
              sourceTaskIds: parseStringList(verifierHandoff.sourceTaskIds),
              outputPath: verifierHandoff.outputPath ? String(verifierHandoff.outputPath) : "",
              notes: parseStringList(verifierHandoff.notes),
              error: verifierHandoff.error ? String(verifierHandoff.error) : "",
            } : null,
            verifierResult: verifierResult.summary ? {
              status: verifierResult.status ? String(verifierResult.status) : "pending",
              summary: String(verifierResult.summary),
              recommendation: verifierResult.recommendation ? String(verifierResult.recommendation) : "unknown",
              findings: verifierFindings
                .map((entry) => entry && typeof entry === "object" ? {
                  severity: entry.severity ? String(entry.severity) : "low",
                  summary: entry.summary ? String(entry.summary) : "",
                } : null)
                .filter((entry) => entry && entry.summary),
              evidenceTaskIds: parseStringList(verifierResult.evidenceTaskIds),
              outputPath: verifierResult.outputPath ? String(verifierResult.outputPath) : "",
              generatedAt: verifierResult.generatedAt ? String(verifierResult.generatedAt) : "",
            } : null,
            notes: parseStringList(orchestration.notes),
          },
        };
      })
    .sort((a, b) => {
      const left = new Date(b.updatedAt || b.generatedAt || 0).getTime();
      const right = new Date(a.updatedAt || a.generatedAt || 0).getTime();
      return left - right;
    });
}

function renderGoalCapabilityPanelLoading() {
  return goalsCapabilityPanelFeature?.renderGoalCapabilityPanelLoading();
}

function renderGoalCapabilityPanelError(message) {
  return goalsCapabilityPanelFeature?.renderGoalCapabilityPanelError(message);
}

function renderGoalCapabilityPanel(goal, payload) {
  return goalsCapabilityPanelFeature?.renderGoalCapabilityPanel(goal, payload);
}

function getCachedGoalCapabilityEntry(goalId) {
  if (!goalId || !goalsState.capabilityCache || typeof goalsState.capabilityCache !== "object") return null;
  return goalsState.capabilityCache[goalId] || null;
}

async function ensureGoalCapabilityCache(goal, options = {}) {
  if (!goal?.id) return null;
  const goalId = goal.id;
  const forceReload = options.forceReload === true;
  const cached = getCachedGoalCapabilityEntry(goalId);
  if (cached && !forceReload) return cached;
  if (!forceReload && goalsState.capabilityPending?.[goalId]) {
    return goalsState.capabilityPending[goalId];
  }

  const pending = (async () => {
    const [tasksFile, capabilityPlansFile] = await Promise.all([
      readSourceFile(goal.tasksPath),
      readSourceFile(goalRuntimeFilePath(goal, "capability-plans.json")),
    ]);
    const rawGraph = tasksFile?.content ? safeJsonParse(tasksFile.content) : null;
    const rawPlans = capabilityPlansFile?.content ? safeJsonParse(capabilityPlansFile.content) : null;
    const nodes = parseGoalGraphNodes(rawGraph);
    const entry = {
      plans: parseGoalCapabilityPlans(rawPlans),
      nodeMap: Object.fromEntries(nodes.map((node) => [node.id, node.title])),
      capabilityPath: goalRuntimeFilePath(goal, "capability-plans.json"),
      loadedAt: new Date().toISOString(),
      readError: !tasksFile && !capabilityPlansFile,
    };
    goalsState.capabilityCache[goalId] = entry;
    return entry;
  })();

  goalsState.capabilityPending[goalId] = pending;
  try {
    return await pending;
  } finally {
    delete goalsState.capabilityPending[goalId];
  }
}

async function loadGoalCapabilityData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = goalsState.capabilitySeq + 1;
  goalsState.capabilitySeq = seq;
  renderGoalCapabilityPanelLoading();

  const entry = await ensureGoalCapabilityCache(goal, { forceReload: true });
  if (goalsState.capabilitySeq !== seq || goalsState.selectedId !== trackingGoalId) return;

  if (!entry || entry.readError) {
    renderGoalCapabilityPanelError("无法读取 tasks.json / capability-plans.json。若使用了自定义路径，请确认该路径已加入可操作区。");
    return;
  }

  renderGoalCapabilityPanel(goal, {
    plans: entry.plans,
    nodeMap: entry.nodeMap,
  });
  applyGoalContinuationFocus(goal.id);
}

function parseGoalProgressEntries(rawContent) {
  if (typeof rawContent !== "string" || !rawContent.trim()) return [];
  const entries = [];
  const sections = rawContent.split(/^##\s+/m).filter(Boolean);
  for (const section of sections) {
    const newlineIndex = section.indexOf("\n");
    const at = newlineIndex >= 0 ? section.slice(0, newlineIndex).trim() : section.trim();
    const body = newlineIndex >= 0 ? section.slice(newlineIndex + 1) : "";
    const lines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const data = {};
    for (const line of lines) {
      const itemMatch = /^-\s+([^:]+):\s*(.*)$/.exec(line);
      if (!itemMatch) continue;
      data[itemMatch[1].trim().toLowerCase()] = itemMatch[2].trim();
    }
    entries.push({
      at,
      event: data.event || "",
      title: data.title || "",
      nodeId: data.node || "",
      status: data.status || "",
      runId: data.run || "",
      checkpointId: data.checkpoint || "",
      summary: data.summary || "",
      note: data.note || "",
    });
  }
  return entries;
}

function normalizeGoalBoardId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseGoalBoardRef(rawBoardRef) {
  const item = rawBoardRef && typeof rawBoardRef === "object" ? rawBoardRef : {};
  return {
    boardId: normalizeGoalBoardId(item.boardId || item.id),
    linkedAt: typeof item.linkedAt === "string" && item.linkedAt.trim() ? item.linkedAt.trim() : "",
    updatedAt: typeof item.updatedAt === "string" && item.updatedAt.trim() ? item.updatedAt.trim() : "",
  };
}

function renderGoalCanvasPanelLoading() {
  return goalsReadonlyPanelsFeature?.renderGoalCanvasPanelLoading();
}

function renderGoalCanvasPanel(goal, payload) {
  return goalsReadonlyPanelsFeature?.renderGoalCanvasPanel(goal, payload);
}

async function loadGoalCanvasData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = goalsState.canvasSeq + 1;
  goalsState.canvasSeq = seq;
  renderGoalCanvasPanelLoading();

  const boardRefFile = await readSourceFile(goalRuntimeFilePath(goal, "board-ref.json"));
  if (goalsState.canvasSeq !== seq || goalsState.selectedId !== trackingGoalId) return;

  const rawBoardRef = boardRefFile?.content ? safeJsonParse(boardRefFile.content) : null;
  const parsed = parseGoalBoardRef(rawBoardRef);

  renderGoalCanvasPanel(goal, {
    runtimeBoardId: parsed.boardId,
    linkedAt: parsed.linkedAt,
    updatedAt: parsed.updatedAt,
    readError: !boardRefFile,
  });
}

async function openGoalCanvasList(goalId) {
  return canvasContextFeature?.openGoalCanvasList(goalId);
}

async function openGoalCanvasBoard(boardId, goalId) {
  return canvasContextFeature?.openGoalCanvasBoard(boardId, goalId);
}

function renderGoalTrackingPanelLoading() {
  return goalsTrackingPanelFeature?.renderGoalTrackingPanelLoading();
}

function renderGoalTrackingPanel(goal, payload) {
  return goalsTrackingPanelFeature?.renderGoalTrackingPanel(goal, payload);
}

function renderGoalTrackingPanelError(message) {
  return goalsTrackingPanelFeature?.renderGoalTrackingPanelError(message);
}

async function loadGoalTrackingData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = goalsState.trackingSeq + 1;
  goalsState.trackingSeq = seq;
  renderGoalTrackingPanelLoading();

  const [tasksFile, checkpointsFile, capabilityEntry] = await Promise.all([
    readSourceFile(goal.tasksPath),
    readSourceFile(goalRuntimeFilePath(goal, "checkpoints.json")),
    ensureGoalCapabilityCache(goal),
  ]);

  if (goalsState.trackingSeq !== seq || goalsState.selectedId !== trackingGoalId) return;

  const rawGraph = tasksFile?.content ? safeJsonParse(tasksFile.content) : null;
  const rawCheckpoints = checkpointsFile?.content ? safeJsonParse(checkpointsFile.content) : null;

  if (!tasksFile && !checkpointsFile) {
    goalsState.trackingCheckpoints = [];
    renderGoalTrackingPanelError("无法读取 tasks.json / checkpoints.json。若使用了自定义路径，请确认该路径已加入可操作区。");
    return;
  }

  const parsedCheckpoints = parseGoalCheckpoints(rawCheckpoints).map((item) => ({
    ...item,
    goalId: item.goalId || trackingGoalId,
  }));
  goalsState.trackingCheckpoints = parsedCheckpoints;
  renderGoalTrackingPanel(goal, {
    nodes: parseGoalGraphNodes(rawGraph),
    checkpoints: parsedCheckpoints,
    capabilityPlans: capabilityEntry?.plans || [],
    focusNodeId: goalsState.continuationFocusNode?.goalId === trackingGoalId
      ? goalsState.continuationFocusNode?.nodeId || ""
      : "",
  });
  applyGoalContinuationFocus(goal.id);
}

function renderGoalProgressPanelLoading() {
  return goalsReadonlyPanelsFeature?.renderGoalProgressPanelLoading();
}

function renderGoalProgressPanel(entries) {
  return goalsReadonlyPanelsFeature?.renderGoalProgressPanel(entries);
}

async function loadGoalProgressData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = (goalsState.progressSeq || 0) + 1;
  goalsState.progressSeq = seq;
  renderGoalProgressPanelLoading();

  const progressFile = await readSourceFile(goal.progressPath);
  if (goalsState.progressSeq !== seq || goalsState.selectedId !== trackingGoalId) return;

  renderGoalProgressPanel(parseGoalProgressEntries(progressFile?.content || ""));
}

// ========================== GOAL HANDOFF ==========================

function renderGoalHandoffPanelLoading() {
  return goalsReadonlyPanelsFeature?.renderGoalHandoffPanelLoading();
}

function bindGoalHandoffPanelActions(goal) {
  const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
  if (!panel || !goal) return;
  panel.querySelectorAll("[data-continuation-action]").forEach((node) => {
    node.addEventListener("click", () => {
      const action = decodeContinuationAction(node.getAttribute("data-continuation-action") || "");
      if (!action) return;
      void openContinuationAction(action);
    });
  });
  panel.querySelectorAll("[data-goal-generate-handoff]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-generate-handoff") || goal.id;
      if (!goalId) return;
      void generateGoalHandoff(goalId);
    });
  });
  panel.querySelectorAll("[data-open-source]").forEach((node) => {
    node.addEventListener("click", () => {
      const sourcePath = node.getAttribute("data-open-source");
      if (!sourcePath) return;
      void openSourcePath(sourcePath);
    });
  });
}

function renderGoalHandoffPanelError(goal, message) {
  return goalsReadonlyPanelsFeature?.renderGoalHandoffPanelError(goal, message);
}

function renderGoalHandoffPanel(goal, handoff, continuationState = null) {
  return goalsReadonlyPanelsFeature?.renderGoalHandoffPanel(goal, handoff, continuationState);
}

async function loadGoalHandoffData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = (goalsState.handoffSeq || 0) + 1;
  goalsState.handoffSeq = seq;
  renderGoalHandoffPanelLoading();
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.handoff.get",
    params: { goalId: goal.id },
  });
  if (goalsState.handoffSeq !== seq || goalsState.selectedId !== trackingGoalId) return;
  if (!res?.ok || !res.payload?.handoff) {
    renderGoalHandoffPanelError(goal, res?.error?.message || "无法读取 goal handoff snapshot。");
    return;
  }
  renderGoalHandoffPanel(goal, res.payload.handoff, res.payload.continuationState || null);
}

function parseGoalReviewGovernanceSummary(rawSummary) {
  if (!rawSummary || typeof rawSummary !== "object") return null;
  const summary = rawSummary;
  const governanceConfig = summary.governanceConfig && typeof summary.governanceConfig === "object" ? summary.governanceConfig : {};
  const notificationsState = summary.notifications && typeof summary.notifications === "object" ? summary.notifications : {};
  const dispatchesState = summary.notificationDispatches && typeof summary.notificationDispatches === "object" ? summary.notificationDispatches : {};
  const actionableReviews = Array.isArray(summary.actionableReviews) ? summary.actionableReviews : [];
  const overdueReviews = Array.isArray(summary.overdueReviews) ? summary.overdueReviews : [];
  const templates = Array.isArray(governanceConfig.templates) ? governanceConfig.templates : [];
  const reviewers = Array.isArray(governanceConfig.reviewers) ? governanceConfig.reviewers : [];
  const notifications = Array.isArray(notificationsState.items) ? notificationsState.items : [];
  const dispatches = Array.isArray(dispatchesState.items) ? dispatchesState.items : [];
  return {
    generatedAt: summary.generatedAt ? String(summary.generatedAt) : "",
    summary: summary.summary ? String(summary.summary) : "",
    governanceConfigPath: summary.governanceConfigPath ? String(summary.governanceConfigPath) : "",
    notificationsPath: summary.notificationsPath ? String(summary.notificationsPath) : "",
    notificationDispatchesPath: summary.notificationDispatchesPath ? String(summary.notificationDispatchesPath) : "",
    notificationDispatchCounts: summary.notificationDispatchCounts && typeof summary.notificationDispatchCounts === "object"
      ? summary.notificationDispatchCounts
      : { total: dispatches.length, byChannel: {}, byStatus: {} },
    reviewStatusCounts: summary.reviewStatusCounts && typeof summary.reviewStatusCounts === "object" ? summary.reviewStatusCounts : {},
    reviewTypeCounts: summary.reviewTypeCounts && typeof summary.reviewTypeCounts === "object" ? summary.reviewTypeCounts : {},
    workflowPendingCount: Number(summary.workflowPendingCount || 0),
    workflowOverdueCount: Number(summary.workflowOverdueCount || 0),
    checkpointWorkflowPendingCount: Number(summary.checkpointWorkflowPendingCount || 0),
    checkpointWorkflowOverdueCount: Number(summary.checkpointWorkflowOverdueCount || 0),
    templates: templates.map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      return {
        id: data.id ? String(data.id) : `template-${index + 1}`,
        title: data.title ? String(data.title) : data.id ? String(data.id) : `template-${index + 1}`,
        target: data.target ? String(data.target) : "all",
        mode: data.mode ? String(data.mode) : "single",
      };
    }),
    reviewers: reviewers.map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      return {
        id: data.id ? String(data.id) : `reviewer-${index + 1}`,
        name: data.name ? String(data.name) : data.id ? String(data.id) : `reviewer-${index + 1}`,
        reviewerRole: data.reviewerRole ? String(data.reviewerRole) : "",
      };
    }),
    notifications: notifications.map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      return {
        id: data.id ? String(data.id) : `notification-${index + 1}`,
        kind: data.kind ? String(data.kind) : "sla_reminder",
        targetType: data.targetType ? String(data.targetType) : "suggestion_review",
        targetId: data.targetId ? String(data.targetId) : "",
        recipient: data.recipient ? String(data.recipient) : "",
        message: data.message ? String(data.message) : "",
        createdAt: data.createdAt ? String(data.createdAt) : "",
      };
    }),
    notificationDispatches: dispatches.map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      return {
        id: data.id ? String(data.id) : `dispatch-${index + 1}`,
        notificationId: data.notificationId ? String(data.notificationId) : "",
        channel: data.channel ? String(data.channel) : "goal_detail",
        status: data.status ? String(data.status) : "pending",
        targetType: data.targetType ? String(data.targetType) : "suggestion_review",
        targetId: data.targetId ? String(data.targetId) : "",
        recipient: data.recipient ? String(data.recipient) : "",
        routeKey: data.routeKey ? String(data.routeKey) : "",
        message: data.message ? String(data.message) : "",
        createdAt: data.createdAt ? String(data.createdAt) : "",
        updatedAt: data.updatedAt ? String(data.updatedAt) : "",
      };
    }),
    learningReviewInput: parseLearningReviewInput(summary.learningReviewInput),
    recommendations: parseStringList(summary.recommendations),
    actionableReviews: actionableReviews.map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      return {
        id: data.id ? String(data.id) : `review-${index + 1}`,
        title: data.title ? String(data.title) : data.id ? String(data.id) : `review-${index + 1}`,
        suggestionType: data.suggestionType ? String(data.suggestionType) : "method_candidate",
        status: data.status ? String(data.status) : "pending_review",
        reviewer: data.reviewer ? String(data.reviewer) : "",
        nodeId: data.nodeId ? String(data.nodeId) : "",
        suggestionId: data.suggestionId ? String(data.suggestionId) : "",
        updatedAt: data.updatedAt ? String(data.updatedAt) : "",
      };
    }),
    overdueReviews: overdueReviews.map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      return {
        id: data.id ? String(data.id) : `overdue-review-${index + 1}`,
        title: data.title ? String(data.title) : data.id ? String(data.id) : `overdue-review-${index + 1}`,
        suggestionType: data.suggestionType ? String(data.suggestionType) : "method_candidate",
        status: data.status ? String(data.status) : "pending_review",
      };
    }),
    actionableCheckpoints: parseGoalCheckpoints({
      items: Array.isArray(summary.actionableCheckpoints) ? summary.actionableCheckpoints : [],
    }),
  };
}

function renderGoalReviewGovernancePanelLoading() {
  return goalsGovernancePanelFeature?.renderGoalReviewGovernancePanelLoading();
}

function renderGoalReviewGovernancePanelError(message) {
  return goalsGovernancePanelFeature?.renderGoalReviewGovernancePanelError(message);
}

function renderGoalReviewGovernancePanel(goal, data) {
  return goalsGovernancePanelFeature?.renderGoalReviewGovernancePanel(goal, data);
}

function bindGoalReviewGovernanceActions(goal) {
  const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
  if (!panel || !goal) return;
  panel.querySelectorAll("[data-goal-approval-scan]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-approval-scan") || goal.id;
      if (!goalId) return;
      void runGoalApprovalScan(goalId, { autoEscalate: node.getAttribute("data-goal-auto-escalate") !== "false" });
    });
  });
  panel.querySelectorAll("[data-goal-suggestion-decision]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-suggestion-goal-id") || goal.id;
      const reviewId = node.getAttribute("data-goal-suggestion-review-id");
      const decision = node.getAttribute("data-goal-suggestion-decision");
      const suggestionType = node.getAttribute("data-goal-suggestion-type");
      const suggestionId = node.getAttribute("data-goal-suggestion-id");
      if (!goalId || !reviewId || !decision) return;
      void runGoalSuggestionReviewDecision(goalId, {
        reviewId,
        decision,
        suggestionType,
        suggestionId,
      });
    });
  });
  panel.querySelectorAll("[data-goal-suggestion-escalate]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-suggestion-goal-id") || goal.id;
      const reviewId = node.getAttribute("data-goal-suggestion-review-id");
      const suggestionType = node.getAttribute("data-goal-suggestion-type");
      const suggestionId = node.getAttribute("data-goal-suggestion-id");
      if (!goalId || !reviewId) return;
      void runGoalSuggestionReviewEscalation(goalId, {
        reviewId,
        suggestionType,
        suggestionId,
      });
    });
  });
  panel.querySelectorAll("[data-goal-checkpoint-escalate]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-checkpoint-goal-id") || goal.id;
      const nodeId = node.getAttribute("data-goal-checkpoint-node-id");
      const checkpointId = node.getAttribute("data-goal-checkpoint-id");
      if (!goalId || !nodeId || !checkpointId) return;
      void runGoalCheckpointEscalation(goalId, nodeId, checkpointId);
    });
  });
}

async function loadGoalReviewGovernanceData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = (goalsState.governanceSeq || 0) + 1;
  goalsState.governanceSeq = seq;
  renderGoalReviewGovernancePanelLoading();
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.review_governance.summary",
    params: { goalId: goal.id },
  });
  if (goalsState.governanceSeq !== seq || goalsState.selectedId !== trackingGoalId) return;
  if (!res?.ok || !res.payload?.summary) {
    renderGoalReviewGovernancePanelError(res?.error?.message || "无法读取 review governance summary。");
    return;
  }
  const parsed = parseGoalReviewGovernanceSummary(res.payload.summary);
  goalsState.governanceCache[goal.id] = parsed;
  renderGoalReviewGovernancePanel(goal, parsed);
  bindGoalReviewGovernanceActions(goal);
}

function renderGoalDetail(goal) {
  return goalsRuntimeFeature?.renderGoalDetail(goal);
}

async function loadGoals(forceReload = false, preferredGoalId) {
  return goalsRuntimeFeature?.loadGoals(forceReload, preferredGoalId);
}

async function loadSubtasks(forceSelectFirst = false) {
  return subtasksRuntimeFeature?.loadSubtasks(forceSelectFirst);
}

async function loadSubtaskDetail(taskId, options = {}) {
  return subtasksRuntimeFeature?.loadSubtaskDetail(taskId, options);
}

async function openSubtaskById(taskId) {
  return subtasksRuntimeFeature?.openSubtaskById(taskId);
}

async function submitGoalCreateForm() {
  if (!ws || !isReady) {
    showNotice(
      localeController.t("goals.createUnavailableTitle", {}, "Unable to create long task"),
      localeController.t("goals.notConnected", {}, "Not connected to the server."),
      "error",
    );
    return;
  }
  const normalizedTitle = goalCreateTitleEl?.value.trim() || "";
  if (!normalizedTitle) {
    showNotice(
      localeController.t("goals.createUnavailableTitle", {}, "Unable to create long task"),
      localeController.t("goals.titleRequired", {}, "Title cannot be empty."),
      "error",
    );
    goalCreateTitleEl?.focus();
    return;
  }
  const objective = goalCreateObjectiveEl?.value.trim() || "";
  const goalRoot = goalCreateRootEl?.value.trim() || "";
  const autoResume = goalCreateAutoResumeEl?.checked !== false;
  if (goalCreateSubmitBtn) {
    goalCreateSubmitBtn.disabled = true;
    goalCreateSubmitBtn.textContent = localeController.t("goals.creating", {}, "Creating...");
  }
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.create",
    params: {
      title: normalizedTitle,
      objective: objective.trim() || undefined,
      goalRoot: goalRoot.trim() || undefined,
    },
  });
  if (goalCreateSubmitBtn) {
    goalCreateSubmitBtn.disabled = false;
    goalCreateSubmitBtn.textContent = localeController.t("goals.createButton", {}, "Create");
  }
  if (!res || !res.ok || !res.payload?.goal?.id) {
    showNotice(
      localeController.t("goals.createFailedTitle", {}, "Failed to create long task"),
      res?.error?.message || localeController.t("goals.unknownError", {}, "Unknown error."),
      "error",
    );
    return;
  }
  const goal = res.payload.goal;
  toggleGoalCreateModal(false);
  showNotice(
    localeController.t("goals.createdTitle", {}, "Long task created"),
    localeController.t("goals.createdMessage", { goalName: goal.title || goal.id }, `${goal.title || goal.id} was created and is ready to enter its execution channel.`),
    "success",
    2200,
  );
  await loadGoals(true, goal.id);
  if (autoResume) {
    await resumeGoal(goal.id, { silent: true });
  }
}

async function resumeGoal(goalId, options = {}) {
  if (!ws || !isReady) {
    showNotice(
      localeController.t("goals.resumeUnavailableTitle", {}, "Unable to resume long task"),
      localeController.t("goals.notConnected", {}, "Not connected to the server."),
      "error",
    );
    return;
  }
  const nodeId = typeof options.nodeId === "string" && options.nodeId.trim() ? options.nodeId.trim() : undefined;
  const checkpointId = typeof options.checkpointId === "string" && options.checkpointId.trim()
    ? options.checkpointId.trim()
    : undefined;
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.resume",
    params: { goalId, nodeId, checkpointId },
  });
  if (!res || !res.ok) {
    showNotice(
      localeController.t("goals.resumeFailedTitle", {}, "Failed to resume long task"),
      res?.error?.message || localeController.t("goals.unknownError", {}, "Unknown error."),
      "error",
    );
    return;
  }
  const goal = res.payload?.goal || getGoalById(goalId);
  const conversationId = res.payload?.conversationId || goal?.activeConversationId || goalBaseConversationId(goalId);
  await loadGoals(true, goalId);
  openConversationSession(conversationId, nodeId
    ? localeController.t("goals.resumedNodeChannelHint", { goalName: goal?.title || goalId, nodeId }, `Entered long task node channel: ${goal?.title || goalId} / ${nodeId}`)
    : localeController.t("goals.resumedChannelHint", { goalName: goal?.title || goalId }, `Entered long task channel: ${goal?.title || goalId}`));
  if (!options.silent) {
    showNotice(
      localeController.t("goals.resumedTitle", {}, "Long task resumed"),
      checkpointId && nodeId
        ? localeController.t(
          "goals.replayedCheckpointMessage",
          { goalName: goal?.title || goalId, checkpointId, nodeId },
          `${goal?.title || goalId} replayed checkpoint ${checkpointId} and resumed node ${nodeId}.`,
        )
        : nodeId
        ? localeController.t("goals.resumedNodeMessage", { goalName: goal?.title || goalId, nodeId }, `${goal?.title || goalId} resumed from the last node ${nodeId}.`)
        : localeController.t("goals.resumedMessage", { goalName: goal?.title || goalId }, `${goal?.title || goalId} switched to its dedicated goal channel.`),
      "success",
      2200,
    );
  }
}

async function pauseGoal(goalId) {
  if (!ws || !isReady) {
    showNotice(
      localeController.t("goals.pauseUnavailableTitle", {}, "Unable to pause long task"),
      localeController.t("goals.notConnected", {}, "Not connected to the server."),
      "error",
    );
    return;
  }
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.pause",
    params: { goalId },
  });
  if (!res || !res.ok) {
    showNotice(
      localeController.t("goals.pauseFailedTitle", {}, "Failed to pause long task"),
      res?.error?.message || localeController.t("goals.unknownError", {}, "Unknown error."),
      "error",
    );
    return;
  }
  if (isConversationForGoal(activeConversationId, goalId)) {
    activeConversationId = null;
    renderCanvasGoalContext();
    chatEventsFeature?.resetStreamingState();
  }
  const goal = res.payload?.goal || getGoalById(goalId);
  await loadGoals(true, goalId);
  showNotice(
    localeController.t("goals.pausedTitle", {}, "Long task paused"),
    localeController.t("goals.pausedMessage", { goalName: goal?.title || goalId }, `${goal?.title || goalId} has been paused. The normal chat channel is unaffected.`),
    "info",
    2400,
  );
}

async function generateGoalHandoff(goalId) {
  if (!ws || !isReady) {
    showNotice(
      localeController.t("goals.handoffUnavailableTitle", {}, "Unable to generate handoff"),
      localeController.t("goals.notConnected", {}, "Not connected to the server."),
      "error",
    );
    return;
  }
  const goal = getGoalById(goalId);
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.handoff.generate",
    params: { goalId },
  });
  if (!res || !res.ok) {
    showNotice(
      localeController.t("goals.handoffFailedTitle", {}, "Failed to generate handoff"),
      res?.error?.message || localeController.t("goals.unknownError", {}, "Unknown error."),
      "error",
    );
    return;
  }
  if (goal && goalsState.selectedId === goalId) {
    void loadGoalHandoffData(goal);
  }
  showNotice(
    localeController.t("goals.handoffGeneratedTitle", {}, "Handoff generated"),
    localeController.t("goals.handoffGeneratedMessage", { goalName: goal?.title || goalId }, `The recovery handoff summary for ${goal?.title || goalId} has been updated.`),
    "success",
    2200,
  );
}

function switchMemoryViewerTab(tab) {
  return memoryRuntimeFeature?.switchMemoryViewerTab(tab);
}

function syncMemoryViewerUi() {
  return memoryRuntimeFeature?.syncMemoryViewerUi();
}

async function loadMemoryViewer(forceSelectFirst = false) {
  return memoryRuntimeFeature?.loadMemoryViewer(forceSelectFirst);
}

async function loadMemoryViewerStats() {
  return memoryRuntimeFeature?.loadMemoryViewerStats();
}

async function loadTaskUsageOverview() {
  return memoryRuntimeFeature?.loadTaskUsageOverview();
}

async function loadTaskViewer(forceSelectFirst = false) {
  return memoryRuntimeFeature?.loadTaskViewer(forceSelectFirst);
}

async function loadTaskDetail(taskId, requestContext = null) {
  return memoryRuntimeFeature?.loadTaskDetail(taskId, requestContext);
}

async function loadMemoryChunkViewer(forceSelectFirst = false) {
  return memoryRuntimeFeature?.loadMemoryChunkViewer(forceSelectFirst);
}

async function loadMemoryDetail(chunkId, requestContext = null, options = {}) {
  return memoryRuntimeFeature?.loadMemoryDetail(chunkId, requestContext, options);
}

async function openTaskFromAudit(taskId) {
  return memoryRuntimeFeature?.openTaskFromAudit(taskId);
}

async function openMemoryFromAudit(chunkId) {
  return memoryRuntimeFeature?.openMemoryFromAudit(chunkId);
}

async function loadCandidateDetail(candidateId) {
  return memoryRuntimeFeature?.loadCandidateDetail(candidateId);
}

function renderMemoryViewerStats(stats) {
  return memoryViewerFeature?.renderMemoryViewerStats(stats);
}

function renderTaskList(items) {
  return memoryViewerFeature?.renderTaskList(items);
}

function renderMemoryList(items) {
  return memoryViewerFeature?.renderMemoryList(items);
}

function renderSharedReviewList(items) {
  return memoryViewerFeature?.renderSharedReviewList(items);
}

function resolveMemoryDetailTargetAgentId(chunkId) {
  return memoryRuntimeFeature?.resolveMemoryDetailTargetAgentId(chunkId);
}

function refreshMemoryLocale() {
  return memoryRuntimeFeature?.refreshMemoryLocale();
}

function renderTaskDetail(task) {
  return memoryDetailRenderFeature?.renderTaskDetail(task);
}

function renderCandidateOnlyDetail(candidate) {
  return memoryViewerFeature?.renderCandidateOnlyDetail(candidate);
}

function renderMemoryDetail(item) {
  return memoryViewerFeature?.renderMemoryDetail(item);
}

function renderMemoryViewerListEmpty(message) {
  if (!memoryViewerListEl) return;
  memoryViewerListEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

function renderMemoryViewerDetailEmpty(message) {
  if (!memoryViewerDetailEl) return;
  memoryViewerDetailEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

function summarizeSourcePath(sourcePath) {
  return memoryDetailRenderFeature?.summarizeSourcePath(sourcePath)
    || String(sourcePath || "(unknown source)");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

syncMemoryViewerUi();
updateSidebarModeButtons();

// Expose switchMode for canvas.js
window._belldandySwitchMode = switchMode;
window._belldandyT = (key, params, fallback) => localeController.t(key, params, fallback);

// Expose canvas context refresh for canvas.js
window._belldandySyncCanvasContext = renderCanvasGoalContext;

// Expose openFile for canvas.js (method node double-click → editor)
window._belldandyOpenFile = (filePath) => openFile(filePath);

// Expose loadConversation for canvas.js (session node double-click → chat)
window._belldandyLoadConversation = (conversationId) => {
  openConversationSession(conversationId);
};

// Initialize canvas app (canvas.js creates window._canvasApp)
if (window._canvasApp) {
  window._canvasApp.init((req) => sendReq(req));
  window._canvasApp.refreshLocale?.();
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function consumeUrlTokenParam() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) return null;
    params.delete("token");
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
    return token;
  } catch {
    return null;
  }
}

if (authModeEl) {
  authModeEl.addEventListener("change", () => {
    if (authModeEl.value !== "token") transientUrlToken = null;
    persistAuthFields({ storeKey: STORE_KEY, authModeEl, authValueEl, transientUrlToken });
  });
}
if (authValueEl) {
  authValueEl.addEventListener("input", () => {
    if (transientUrlToken && authValueEl.value.trim() !== transientUrlToken) {
      transientUrlToken = null;
    }
    persistAuthFields({ storeKey: STORE_KEY, authModeEl, authValueEl, transientUrlToken });
  });
}

function configureMarkedOnce() {
  return chatUiFeature?.configureMarkedOnce();
}

function stripThinkBlocks(text) {
  return chatUiFeature?.stripThinkBlocks(text) || "";
}

function sanitizeAssistantHtml(rawHtml) {
  return chatUiFeature?.sanitizeAssistantHtml(rawHtml) || "";
}

