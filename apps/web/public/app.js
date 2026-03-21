const statusEl = document.getElementById("status");
const authModeEl = document.getElementById("authMode");
const authValueEl = document.getElementById("authValue");
const userUuidEl = document.getElementById("userUuid"); // UUID输入框
const saveUuidBtn = document.getElementById("saveUuid"); // UUID保存按钮
const workspaceRootsEl = document.getElementById("workspaceRoots");
const connectBtn = document.getElementById("connect");
const sendBtn = document.getElementById("send");
const promptEl = document.getElementById("prompt");
const messagesEl = document.getElementById("messages");
const modelSelectEl = document.getElementById("modelSelect");
const agentSelectEl = document.getElementById("agentSelect");
const PROMPT_MAX_HEIGHT_PX = 120;
let promptBaseHeightPx = 0;

// 文件树和编辑器 DOM 元素
const sidebarEl = document.getElementById("sidebar");
const sidebarTitleEl = document.querySelector(".sidebar-title");
const fileTreeEl = document.getElementById("fileTree");
const refreshTreeBtn = document.getElementById("refreshTree");
const chatSection = document.getElementById("chatSection");
const editorSection = document.getElementById("editorSection");
const canvasContextBarEl = document.getElementById("canvasContextBar");
const editorPath = document.getElementById("editorPath");
const editorModeBadge = document.getElementById("editorModeBadge");
const editorTextarea = document.getElementById("editorTextarea");
const composerSection = document.getElementById("composerSection");
const editorActions = document.getElementById("editorActions");
const cancelEditBtn = document.getElementById("cancelEdit");
const saveEditBtn = document.getElementById("saveEdit");
const memoryViewerSection = document.getElementById("memoryViewerSection");
const memoryViewerStatsEl = document.getElementById("memoryViewerStats");
const memoryViewerListEl = document.getElementById("memoryViewerList");
const memoryViewerDetailEl = document.getElementById("memoryViewerDetail");
const memoryViewerRefreshBtn = document.getElementById("memoryViewerRefresh");
const memoryTabTasksBtn = document.getElementById("memoryTabTasks");
const memoryTabMemoriesBtn = document.getElementById("memoryTabMemories");
const memorySearchInputEl = document.getElementById("memorySearchInput");
const memorySearchBtn = document.getElementById("memorySearchBtn");
const memoryTaskFiltersEl = document.getElementById("memoryTaskFilters");
const memoryChunkFiltersEl = document.getElementById("memoryChunkFilters");
const memoryTaskStatusFilterEl = document.getElementById("memoryTaskStatusFilter");
const memoryTaskSourceFilterEl = document.getElementById("memoryTaskSourceFilter");
const memoryTaskGoalFilterBarEl = document.getElementById("memoryTaskGoalFilterBar");
const memoryTaskGoalFilterLabelEl = document.getElementById("memoryTaskGoalFilterLabel");
const memoryTaskGoalFilterClearBtn = document.getElementById("memoryTaskGoalFilterClear");
const memoryChunkTypeFilterEl = document.getElementById("memoryChunkTypeFilter");
const memoryChunkVisibilityFilterEl = document.getElementById("memoryChunkVisibilityFilter");
const memoryChunkCategoryFilterEl = document.getElementById("memoryChunkCategoryFilter");
const goalsSection = document.getElementById("goalsSection");
const goalsSummaryEl = document.getElementById("goalsSummary");
const goalsListEl = document.getElementById("goalsList");
const goalsDetailEl = document.getElementById("goalsDetail");
const goalsRefreshBtn = document.getElementById("goalsRefresh");
const goalCreateBtn = document.getElementById("goalCreate");
const goalCreateModal = document.getElementById("goalCreateModal");
const goalCreateCloseBtn = document.getElementById("goalCreateClose");
const goalCreateCancelBtn = document.getElementById("goalCreateCancel");
const goalCreateSubmitBtn = document.getElementById("goalCreateSubmit");
const goalCreateTitleEl = document.getElementById("goalCreateTitle");
const goalCreateObjectiveEl = document.getElementById("goalCreateObjective");
const goalCreateRootEl = document.getElementById("goalCreateRoot");
const goalCreateAutoResumeEl = document.getElementById("goalCreateAutoResume");
const goalCheckpointActionModal = document.getElementById("goalCheckpointActionModal");
const goalCheckpointActionTitleEl = document.getElementById("goalCheckpointActionTitle");
const goalCheckpointActionHintEl = document.getElementById("goalCheckpointActionHint");
const goalCheckpointActionContextEl = document.getElementById("goalCheckpointActionContext");
const goalCheckpointActionReviewerEl = document.getElementById("goalCheckpointActionReviewer");
const goalCheckpointActionReviewerRoleEl = document.getElementById("goalCheckpointActionReviewerRole");
const goalCheckpointActionRequestedByEl = document.getElementById("goalCheckpointActionRequestedBy");
const goalCheckpointActionActorLabelEl = document.getElementById("goalCheckpointActionActorLabel");
const goalCheckpointActionActorEl = document.getElementById("goalCheckpointActionActor");
const goalCheckpointActionSlaAtEl = document.getElementById("goalCheckpointActionSlaAt");
const goalCheckpointActionSummaryEl = document.getElementById("goalCheckpointActionSummary");
const goalCheckpointActionNoteLabelEl = document.getElementById("goalCheckpointActionNoteLabel");
const goalCheckpointActionNoteHelpEl = document.getElementById("goalCheckpointActionNoteHelp");
const goalCheckpointActionNoteEl = document.getElementById("goalCheckpointActionNote");
const goalCheckpointActionCloseBtn = document.getElementById("goalCheckpointActionClose");
const goalCheckpointActionCancelBtn = document.getElementById("goalCheckpointActionCancel");
const goalCheckpointActionSubmitBtn = document.getElementById("goalCheckpointActionSubmit");
const taskTokenHistoryEl = document.getElementById("taskTokenHistory");

const STORE_KEY = "belldandy.webchat.auth";
const CLIENT_KEY = "belldandy.webchat.clientId";
const WORKSPACE_ROOTS_KEY = "belldandy.webchat.workspaceRoots";
const MODEL_ID_KEY = "belldandy.webchat.modelId";
const AGENT_ID_KEY = "belldandy.webchat.agentId";
const UUID_KEY = "belldandy.webchat.userUuid"; // UUID存储键
const WEBCHAT_DEBUG_KEY = "belldandy.webchat.debug";
const VOICE_SHORTCUT_KEY = "belldandy.webchat.voiceShortcut";
const VOICE_SHORTCUT_DISABLED_VALUE = "disabled";
const DEFAULT_VOICE_SHORTCUT = Object.freeze({
  code: "KeyR",
  ctrlKey: false,
  altKey: true,
  shiftKey: false,
  metaKey: false,
});

let ws = null;
let isReady = false;
let activeConversationId = null;
const taskTokenHistoryByConversation = new Map();
const TASK_TOKEN_HISTORY_LIMIT = 2;
let botMsgEl = null;
let botRawHtmlBuffer = "";
let transientUrlToken = null;
const pendingReq = new Map();
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

let voiceShortcutBinding = loadVoiceShortcutSetting();
let voiceShortcutCaptureActive = false;
let voiceInputController = createNoopVoiceInputController();

function debugLog(...args) {
  if (!webchatDebugEnabled) return;
  console.debug(...args);
}

function createNoopVoiceInputController() {
  return {
    isSupported: false,
    isRecording() {
      return false;
    },
    async toggle() {
      return false;
    },
    updateTitle() {},
  };
}

function getDefaultVoiceShortcut() {
  return { ...DEFAULT_VOICE_SHORTCUT };
}

function isVoiceShortcutFunctionKey(code) {
  return /^F\d{1,2}$/.test(code);
}

function isModifierOnlyCode(code) {
  return [
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
    "MetaLeft",
    "MetaRight",
  ].includes(code);
}

function normalizeVoiceShortcut(shortcut) {
  if (!shortcut || typeof shortcut !== "object") return null;
  const code = typeof shortcut.code === "string" ? shortcut.code.trim() : "";
  if (!code || isModifierOnlyCode(code)) return null;
  const normalized = {
    code,
    ctrlKey: shortcut.ctrlKey === true,
    altKey: shortcut.altKey === true,
    shiftKey: shortcut.shiftKey === true,
    metaKey: shortcut.metaKey === true,
  };
  if (!isVoiceShortcutFunctionKey(code) && !(normalized.ctrlKey || normalized.altKey || normalized.metaKey)) {
    return null;
  }
  return normalized;
}

function loadVoiceShortcutSetting() {
  try {
    const raw = localStorage.getItem(VOICE_SHORTCUT_KEY);
    if (!raw) return getDefaultVoiceShortcut();
    if (raw === VOICE_SHORTCUT_DISABLED_VALUE) return null;
    return normalizeVoiceShortcut(JSON.parse(raw)) || getDefaultVoiceShortcut();
  } catch {
    return getDefaultVoiceShortcut();
  }
}

function persistVoiceShortcutSetting(shortcut) {
  const normalized = normalizeVoiceShortcut(shortcut);
  voiceShortcutBinding = shortcut === null ? null : (normalized || getDefaultVoiceShortcut());
  try {
    if (voiceShortcutBinding === null) {
      localStorage.setItem(VOICE_SHORTCUT_KEY, VOICE_SHORTCUT_DISABLED_VALUE);
    } else {
      localStorage.setItem(VOICE_SHORTCUT_KEY, JSON.stringify(voiceShortcutBinding));
    }
  } catch {
    // ignore local persistence failures
  }
  renderVoiceShortcutSetting();
  voiceInputController.updateTitle();
}

function formatVoiceShortcutKey(code) {
  if (typeof code !== "string" || !code) return "";
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) {
    const suffix = code.slice(6);
    const mapped = {
      Add: "Num+",
      Subtract: "Num-",
      Multiply: "Num*",
      Divide: "Num/",
      Decimal: "Num.",
      Enter: "NumEnter",
    };
    return mapped[suffix] || `Num${suffix}`;
  }
  const mapped = {
    Space: "Space",
    Escape: "Esc",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
  };
  return mapped[code] || code;
}

function formatVoiceShortcut(shortcut) {
  if (!shortcut) return "已禁用";
  const parts = [];
  if (shortcut.ctrlKey) parts.push("Ctrl");
  if (shortcut.altKey) parts.push("Alt");
  if (shortcut.shiftKey) parts.push("Shift");
  if (shortcut.metaKey) parts.push("Meta");
  parts.push(formatVoiceShortcutKey(shortcut.code));
  return parts.join("+");
}

function describeVoiceShortcutForTitle() {
  return voiceShortcutBinding ? `语音输入（点击或 ${formatVoiceShortcut(voiceShortcutBinding)} 切换录音）` : "语音输入（点击切换录音）";
}

function buildVoiceShortcutFromEvent(event) {
  if (!event || typeof event.code !== "string") return null;
  return normalizeVoiceShortcut({
    code: event.code,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  });
}

function matchesVoiceShortcut(event, shortcut) {
  if (!shortcut) return false;
  return (
    event.code === shortcut.code &&
    event.ctrlKey === shortcut.ctrlKey &&
    event.altKey === shortcut.altKey &&
    event.shiftKey === shortcut.shiftKey &&
    event.metaKey === shortcut.metaKey
  );
}

// 身份信息（从 hello-ok 获取）
let agentName = "Agent";
let agentAvatar = "🤖";
let userName = "User";
let userAvatar = "👤";

// 编辑器状态
let editorMode = false;
let currentEditPath = null;
let originalContent = null;
let currentEditReadOnly = false;
// Tree Mode: "root" | "facets"
let currentTreeMode = "root";
const expandedFolders = new Set();
const memoryViewerState = {
  tab: "tasks",
  stats: null,
  items: [],
  selectedId: null,
  selectedTask: null,
  selectedCandidate: null,
  goalIdFilter: null,
  pendingUsageRevokeId: null,
  usageOverview: {
    loading: false,
    methods: [],
    skills: [],
  },
  usageOverviewSeq: 0,
};
const goalsState = {
  items: [],
  selectedId: null,
  loadSeq: 0,
  trackingSeq: 0,
  canvasSeq: 0,
  progressSeq: 0,
  capabilitySeq: 0,
  handoffSeq: 0,
  governanceSeq: 0,
  trackingCheckpoints: [],
  governanceCache: {},
  capabilityCache: {},
  capabilityPending: {},
  liveUpdateDelayMs: 120,
  liveUpdateTimers: {},
  liveUpdatePending: {},
};
let pendingGoalCheckpointAction = null;

// 附件状态
const attachmentsPreviewEl = document.getElementById("attachmentsPreview");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
let pendingAttachments = []; // { name, type, mimeType, content }
const DEFAULT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
let attachmentLimits = {
  maxFileBytes: DEFAULT_ATTACHMENT_MAX_FILE_BYTES,
  maxTotalBytes: DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES,
};
const IMAGE_COMPRESS_TRIGGER_BYTES = 800 * 1024;
const IMAGE_COMPRESS_TARGET_BYTES = 1200 * 1024;
const IMAGE_COMPRESS_MAX_EDGE = 2048;
const IMAGE_COMPRESS_RESIZE_FACTOR = 0.85;
const IMAGE_COMPRESS_QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54];
const attachmentHintEl = ensureAttachmentHintElement();

// 侧边栏状态（默认收起）
let sidebarExpanded = false;
if (sidebarEl) {
  sidebarEl.classList.add("collapsed");
}

restoreAuth();
restoreWorkspaceRoots();
restoreUuid(); // 恢复UUID

// 监听 UUID 保存按钮
if (saveUuidBtn && userUuidEl) {
  saveUuidBtn.addEventListener("click", () => {
    const uuid = userUuidEl.value.trim();
    debugLog("[UUID] Saving UUID", { hasUuid: Boolean(uuid) });
    persistUuid();
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
    persistUuid();
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

setStatus("disconnected");
updateAttachmentHint();

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
if (memorySearchBtn) {
  memorySearchBtn.addEventListener("click", () => loadMemoryViewer(true));
}
if (goalsRefreshBtn) {
  goalsRefreshBtn.addEventListener("click", () => loadGoals(true));
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
if (memoryChunkCategoryFilterEl) {
  memoryChunkCategoryFilterEl.addEventListener("change", () => {
    if (memoryViewerState.tab === "memories") loadMemoryViewer(true);
  });
}
function measurePromptBaseHeight() {
  if (!promptEl) return;
  const computed = window.getComputedStyle(promptEl);
  const lineHeight = parseFloat(computed.lineHeight) || 24;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  const paddingBottom = parseFloat(computed.paddingBottom) || 0;
  const borderTop = parseFloat(computed.borderTopWidth) || 0;
  const borderBottom = parseFloat(computed.borderBottomWidth) || 0;
  promptBaseHeightPx = Math.max(
    promptBaseHeightPx,
    Math.ceil(lineHeight + paddingTop + paddingBottom + borderTop + borderBottom)
  );
}

function syncPromptHeight() {
  if (!promptEl) return;
  const baseHeight = promptBaseHeightPx || promptEl.scrollHeight;
  const hasText = Boolean(promptEl.value);
  if (!hasText) {
    promptEl.style.height = baseHeight + "px";
    promptEl.style.overflowY = "hidden";
    return;
  }
  promptEl.style.height = "auto";
  const nextHeight = Math.min(promptEl.scrollHeight, PROMPT_MAX_HEIGHT_PX);
  promptEl.style.height = Math.max(baseHeight, nextHeight) + "px";
  promptEl.style.overflowY = promptEl.scrollHeight > PROMPT_MAX_HEIGHT_PX ? "auto" : "hidden";
}

function initializePromptHeight() {
  measurePromptBaseHeight();
  syncPromptHeight();
}

promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  // Auto-resize on keydown (for Shift+Enter immediately)
  requestAnimationFrame(syncPromptHeight);
});

promptEl.addEventListener("input", () => {
  syncPromptHeight();
});

initializePromptHeight();
if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    initializePromptHeight();
  }).catch(() => {});
}

// Initialize Voice Input
voiceInputController = initVoiceInput();

document.addEventListener("keydown", (event) => {
  if (!shouldHandleVoiceShortcut(event)) return;
  event.preventDefault();
  event.stopPropagation();
  void voiceInputController.toggle();
});

connect();

function shouldHandleVoiceShortcut(event) {
  if (!voiceShortcutBinding || !voiceInputController.isSupported) return false;
  if (!matchesVoiceShortcut(event, voiceShortcutBinding)) return false;
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (voiceShortcutCaptureActive) return false;
  if (settingsModal && !settingsModal.classList.contains("hidden")) return false;
  if (!composerSection || composerSection.classList.contains("hidden")) return false;
  return true;
}

function setStatus(text) {
  statusEl.textContent = text;
  // Clear error hint if exists (it will be re-added by close handler if needed)
  const hint = document.getElementById("status-hint");
  if (hint) hint.remove();
}

function restoreAuth() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.mode) authModeEl.value = String(parsed.mode);
      if (parsed.value) authValueEl.value = String(parsed.value);
    }
  } catch {
    // ignore
  }
}

function persistAuth() {
  try {
    const mode = authModeEl.value;
    const value = authValueEl.value.trim();
    if (transientUrlToken && mode === "token" && value === transientUrlToken) {
      return;
    }
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ mode, value }),
    );
  } catch {
    // ignore
  }
}

function restoreWorkspaceRoots() {
  try {
    const saved = localStorage.getItem(WORKSPACE_ROOTS_KEY);
    if (saved && workspaceRootsEl) workspaceRootsEl.value = saved;
  } catch {
    // ignore
  }
}

function restoreUuid() {
  try {
    const saved = localStorage.getItem(UUID_KEY);
    if (saved && userUuidEl) userUuidEl.value = saved;
  } catch {
    // ignore
  }
}

function persistUuid() {
  try {
    if (userUuidEl) {
      localStorage.setItem(UUID_KEY, userUuidEl.value.trim());
    }
  } catch {
    // ignore
  }
}

function persistWorkspaceRoots() {
  try {
    if (workspaceRootsEl) {
      localStorage.setItem(WORKSPACE_ROOTS_KEY, workspaceRootsEl.value);
    }
  } catch {
    // ignore
  }
}

async function syncWorkspaceRoots() {
  if (!ws || !isReady || !workspaceRootsEl) return;
  const value = workspaceRootsEl.value.trim();
  if (!value) return;

  persistWorkspaceRoots();
  const id = makeId();
  await sendReq({
    type: "req",
    id,
    method: "config.update",
    params: { updates: { "BELLDANDY_EXTRA_WORKSPACE_ROOTS": value } }
  });
}

function parsePositiveIntOrDefault(raw, fallback) {
  if (raw === undefined || raw === null) return fallback;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function ensureAttachmentHintElement() {
  if (!attachmentsPreviewEl || !attachmentsPreviewEl.parentElement) return null;
  const existing = document.getElementById("attachmentHint");
  if (existing) return existing;

  const hint = document.createElement("div");
  hint.id = "attachmentHint";
  hint.style.fontSize = "12px";
  hint.style.lineHeight = "1.4";
  hint.style.color = "#9ca3af";
  hint.style.margin = "6px 2px 0";
  hint.style.whiteSpace = "pre-wrap";
  hint.style.wordBreak = "break-word";
  attachmentsPreviewEl.parentElement.insertBefore(hint, attachmentsPreviewEl.nextSibling);
  return hint;
}

function estimateTextBytes(text) {
  if (typeof text !== "string") return 0;
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  return unescape(encodeURIComponent(text)).length;
}

function estimateAttachmentBytes(att) {
  if (!att || typeof att !== "object") return 0;
  if (typeof att.content !== "string") return 0;
  if (att.content.startsWith("data:")) return estimateDataUrlBytes(att.content);
  return estimateTextBytes(att.content);
}

function estimatePendingAttachmentTotalBytes() {
  return pendingAttachments.reduce((sum, att) => sum + estimateAttachmentBytes(att), 0);
}

function updateAttachmentHint(extraMessage) {
  if (!attachmentHintEl) return;

  const totalBytes = estimatePendingAttachmentTotalBytes();
  const summary = pendingAttachments.length > 0
    ? `已选 ${pendingAttachments.length} 个附件，约 ${formatBytes(totalBytes)} / ${formatBytes(attachmentLimits.maxTotalBytes)}。单文件上限 ${formatBytes(attachmentLimits.maxFileBytes)}。`
    : `附件上限：单文件 ${formatBytes(attachmentLimits.maxFileBytes)}，总计 ${formatBytes(attachmentLimits.maxTotalBytes)}。`;

  attachmentHintEl.textContent = extraMessage ? `${extraMessage}\n${summary}` : summary;
  attachmentHintEl.style.color = extraMessage ? "#f59e0b" : "#9ca3af";
}

function syncAttachmentLimitsFromConfig(config) {
  if (!config || typeof config !== "object") return;

  const maxFileBytes = parsePositiveIntOrDefault(
    config["BELLDANDY_ATTACHMENT_MAX_FILE_BYTES"],
    DEFAULT_ATTACHMENT_MAX_FILE_BYTES,
  );
  const maxTotalBytes = parsePositiveIntOrDefault(
    config["BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES"],
    DEFAULT_ATTACHMENT_MAX_TOTAL_BYTES,
  );

  attachmentLimits = { maxFileBytes, maxTotalBytes };
  updateAttachmentHint();
}

// 从服务器加载可操作区配置值
async function loadWorkspaceRootsFromServer() {
  if (!ws || !isReady) return;

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "config.read",
  });

  if (res && res.ok && res.payload && res.payload.config) {
    const config = res.payload.config;
    syncAttachmentLimitsFromConfig(config);
    const serverValue = res.payload.config["BELLDANDY_EXTRA_WORKSPACE_ROOTS"];
    if (workspaceRootsEl && serverValue && serverValue !== "[REDACTED]") {
      workspaceRootsEl.value = serverValue;
      persistWorkspaceRoots(); // 同步到 localStorage
    }
  }
}

// ── Agent 选择器 ──
async function loadAgentList() {
  if (!ws || !isReady || !agentSelectEl) return;

  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "agents.list",
  });

  if (!res || !res.ok || !res.payload || !Array.isArray(res.payload.agents)) return;

  const agents = res.payload.agents;

  // 仅 1 个 agent 时隐藏选择器
  if (agents.length <= 1) {
    agentSelectEl.classList.add("hidden");
    return;
  }

  agentSelectEl.innerHTML = "";
  for (const a of agents) {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.displayName;
    agentSelectEl.appendChild(opt);
  }

  // 恢复上次选择
  const saved = localStorage.getItem(AGENT_ID_KEY);
  if (saved && agents.some(a => a.id === saved)) {
    agentSelectEl.value = saved;
  }

  agentSelectEl.classList.remove("hidden");
}

// ── 模型选择器 ──
async function loadModelList() {
  if (!ws || !isReady || !modelSelectEl) return;

  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "models.list",
  });

  if (!res || !res.ok || !res.payload || !Array.isArray(res.payload.models)) return;

  const models = res.payload.models;
  const currentDefault = typeof res.payload.currentDefault === "string" && res.payload.currentDefault.trim()
    ? res.payload.currentDefault.trim()
    : "primary";

  const defaultModel = models.find((m) => m.id === currentDefault);
  const defaultLabel = defaultModel?.displayName || defaultModel?.model || "默认模型";

  modelSelectEl.innerHTML = "";
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = `默认模型 (${defaultLabel})`;
  modelSelectEl.appendChild(defaultOpt);

  for (const m of models) {
    if (!m || typeof m !== "object") continue;
    if (m.id === currentDefault) continue;
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.displayName || m.model || m.id;
    modelSelectEl.appendChild(opt);
  }

  const saved = localStorage.getItem(MODEL_ID_KEY);
  if (saved && [...modelSelectEl.options].some((opt) => opt.value === saved)) {
    modelSelectEl.value = saved;
  } else {
    modelSelectEl.value = "";
  }

  // 有备选模型时显示；只有默认模型时隐藏
  if (modelSelectEl.options.length > 1) {
    modelSelectEl.classList.remove("hidden");
  } else {
    modelSelectEl.classList.add("hidden");
  }
}

if (agentSelectEl) {
  agentSelectEl.addEventListener("change", () => {
    localStorage.setItem(AGENT_ID_KEY, agentSelectEl.value);

    // 切换 Agent = 新建会话（隔离上下文）
    activeConversationId = null;
    renderCanvasGoalContext();
    botMsgEl = null;
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
const saveWorkspaceRootsBtn = document.getElementById("saveWorkspaceRoots");
if (saveWorkspaceRootsBtn) {
  saveWorkspaceRootsBtn.addEventListener("click", async () => {
    if (!ws || !isReady) {
      alert("请先连接到服务器");
      return;
    }

    const value = workspaceRootsEl ? workspaceRootsEl.value.trim() : "";

    // 保存到 localStorage
    persistWorkspaceRoots();

    // 更新 .env
    const id = makeId();
    const res = await sendReq({
      type: "req",
      id,
      method: "config.update",
      params: { updates: { "BELLDANDY_EXTRA_WORKSPACE_ROOTS": value } }
    });

    if (res && res.ok) {
      saveWorkspaceRootsBtn.innerHTML = "<u>已保存</u>";
      setTimeout(() => {
        saveWorkspaceRootsBtn.innerHTML = "<u>保存</u>";
      }, 1500);
    } else {
      const msg = res && res.error ? res.error.message : "保存失败";
      alert(`保存失败: ${msg}`);
    }
  });
}

function connect() {
  persistAuth();
  persistWorkspaceRoots();
  persistUuid(); // 保存UUID
  teardown();

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}`;
  ws = new WebSocket(url);
  isReady = false;
  sendBtn.disabled = true;
  setStatus("connecting");

  ws.addEventListener("open", () => {
    setStatus("connected (awaiting challenge)");
  });

  ws.addEventListener("close", () => {
    // Determine the URL we tried to connect to
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}`;

    setStatus(`disconnected (retrying ${url} in 3s...)`);
    if (!document.getElementById("status-hint")) {
      const hint = document.createElement("div");
      hint.id = "status-hint";
      hint.style.color = "#ff6b6b";
      hint.style.fontSize = "12px";
      hint.style.marginTop = "4px";
      hint.textContent = "If this persists in WSL, try accessing via IP (e.g. 172.x.x.x) instead of localhost.";
      statusEl.parentElement.appendChild(hint);
    }

    isReady = false;
    sendBtn.disabled = true;
    setTimeout(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 3000);
  });

  ws.addEventListener("message", (evt) => {
    const frame = safeJsonParse(evt.data);
    if (!frame || typeof frame !== "object") return;

    if (frame.type === "connect.challenge") {
      sendConnect();
      return;
    }

    if (frame.type === "hello-ok") {
      isReady = true;
      sendBtn.disabled = false;
      setStatus("ready");

      // 保存身份信息
      if (frame.agentName) agentName = frame.agentName;
      if (frame.agentAvatar) agentAvatar = frame.agentAvatar;
      if (frame.userName) userName = frame.userName;
      if (frame.userAvatar) userAvatar = frame.userAvatar;

      // 重置 token 累计
      sessionTotalTokens = 0;
      taskTokenHistoryByConversation.clear();
      ["tuSys", "tuCtx", "tuIn", "tuOut", "tuAll"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "--";
      });
      renderTaskTokenHistory();
      if (activeConversationId) {
        void loadConversationMeta(activeConversationId);
      }
      flushQueuedText();

      // 若服务端告知 AI 模型尚未配置（无 API Key），自动弹出设置面板引导用户
      if (frame.configOk === false) {
        setTimeout(() => {
          toggleSettings(true);
          // 在聊天区显示一条引导消息
          const guideMsg = appendMessage("bot", "👋 欢迎使用 Star Sanctuary！\n\n检测到 AI 模型尚未配置。请在右侧设置面板填入你的 API Key，然后点击 Save 保存。");
          if (guideMsg) guideMsg.style.whiteSpace = "pre-wrap";
        }, 500);
      }

      // 重连成功后隐藏重启倒计时浮层
      const restartOverlay = document.getElementById("restartOverlay");
      if (restartOverlay) restartOverlay.classList.add("hidden");

      // 如果侧边栏已展开，加载文件树
      if (sidebarExpanded) loadFileTree();

      // 从服务器加载当前配置并填充可操作区输入框
      loadWorkspaceRootsFromServer();

      // 加载 Agent 列表并填充选择器
      loadAgentList();
      // 加载模型列表并填充选择器
      loadModelList();
      if (memoryViewerSection && !memoryViewerSection.classList.contains("hidden")) {
        loadMemoryViewer(true);
      }
      if (goalsSection && !goalsSection.classList.contains("hidden")) {
        loadGoals(true);
      }

      // Check if we should play boot sequence
      if (!sessionStorage.getItem("booted")) {
        playBootSequence();
        sessionStorage.setItem("booted", "true");
      }
      return;
    }

    if (frame.type === "res") {
      const inflight = pendingReq.get(frame.id);
      if (inflight) {
        pendingReq.delete(frame.id);
        inflight.resolve(frame);
      }
      return;
    }

    if (frame.type === "event") {
      handleEvent(frame.event, frame.payload || {});
      return;
    }
  });
}

function teardown() {
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  ws = null;
  isReady = false;
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


function sendConnect() {
  if (!ws) return;
  const mode = authModeEl.value;
  const v = authValueEl.value.trim();
  const uuid = userUuidEl ? userUuidEl.value.trim() : ""; // 获取UUID
  debugLog("[UUID] sendConnect", { hasUuid: Boolean(uuid) });
  const auth =
    mode === "token"
      ? { mode: "token", token: v.startsWith("setup-") ? v : (v.match(/^\d+-\d+$/) ? `setup-${v}` : v) }
      : mode === "password"
        ? { mode: "password", password: v }
        : { mode: "none" };

  const connectFrame = {
    type: "connect",
    role: "web",
    clientId,
    auth,
    clientName: "belldandy-webchat",
    clientVersion: "0.0.0",
  };

  // 如果有UUID，添加到连接帧
  if (uuid) {
    connectFrame.userUuid = uuid;
    debugLog("[UUID] Adding UUID to connect frame");
  } else {
    debugLog("[UUID] No UUID to send in connect frame");
  }

  ws.send(JSON.stringify(connectFrame));
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
  if (!text) return;
  promptEl.value = text;
  syncPromptHeight();
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

async function sendMessage() {
  const text = promptEl.value.trim();
  if (!text && !pendingAttachments.length) return;
  promptEl.value = "";
  syncPromptHeight();

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
    const statusEl = appendMessage("bot", "正在重启服务…");
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.restart",
    });
    if (res && res.ok) {
      statusEl.textContent = "服务正在重启，请稍候…";
      setStatus("Restarting...");
    } else {
      statusEl.textContent = "重启失败：" + (res?.error?.message || "未知错误");
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
    });
    if (res && res.ok && res.payload && res.payload.checks) {
      const lines = res.payload.checks.map(c => {
        const icon = c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
        return `${icon} ${c.name}: ${c.message}`;
      });
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
    restorePromptText(text);
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
    restorePromptText(text);
    return;
  }

  const displayText = text || (pendingAttachments.length ? "[语音消息]" : "");
  appendMessage("me", displayText + (pendingAttachments.length ? ` [${pendingAttachments.length} 附件]` : ""));
  botMsgEl = appendMessage("bot", "");
  botRawHtmlBuffer = "";

  pendingAttachments = [];
  renderAttachmentsPreview();

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
      botMsgEl.innerHTML = `\n        <div style="line-height: 1.6;">\n          ${msg}<br><br>\n          <b>新手操作指南：</b><br>\n          1. 不要关闭当前网页。<br>\n          2. <b>保持那个运行着服务的黑色窗口不要关</b>，然后在项目目录下重新打开一个<b>新的黑色终端窗口</b>。<br>\n          3. 在这个新窗口里，复制并粘贴下面的完整命令，然后按回车键：<br>\n          <div style="background: var(--bg-secondary); padding: 8px; border-radius: 4px; margin: 8px 0; font-family: monospace;">\n            corepack pnpm bdd pairing approve &lt;CODE&gt;\n          </div>\n          <i style="color: var(--text-tertiary); font-size: 0.9em;">（注意：请把 <code>&lt;CODE&gt;</code> 换成上方实际给你的配对码）</i><br><br>\n          4. 终端提示成功后，在这个网页再发一次消息即可。\n        </div>\n      `;
      return;
    }
    if (payload.error && payload.error.code === "config_required") {
      botMsgEl.textContent = `❌ 配置缺失：${payload.error.message}\n请点击右上角设置图标（⚙️）完善配置。`;
      toggleSettings(true); // Auto open settings
      return;
    }
  }

  if (payload && payload.ok && payload.payload && payload.payload.conversationId) {
    activeConversationId = String(payload.payload.conversationId);
    renderCanvasGoalContext();
    void loadConversationMeta(activeConversationId);
  }
}

// ... existing handleEvent ...

// --- Settings Logic ---
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettings");
const closeSettingsBtn = document.getElementById("closeSettings");
const saveSettingsBtn = document.getElementById("saveSettings");
const restartBtn = document.getElementById("restartBtn");

// 暴露给 WebView 等环境的接口
window.__BELLDANDY_WEBCHAT_READY__ = true;

// 全局委托复制按钮事件
document.addEventListener("click", async (e) => {
  const codeBtn = e.target.closest(".copy-code-btn");
  if (codeBtn) {
    const wrapper = codeBtn.closest(".code-block-wrapper");
    if (wrapper) {
      const codeEl = wrapper.querySelector("code");
      if (codeEl) {
        try {
          await navigator.clipboard.writeText(codeEl.textContent);
          const originalHTML = codeBtn.innerHTML;
          codeBtn.innerHTML = "已复制";
          setTimeout(() => { codeBtn.innerHTML = originalHTML; }, 2000);
        } catch (err) {
          console.error("复制失败", err);
        }
      }
    }
    return;
  }

  const msgBtn = e.target.closest(".copy-msg-btn");
  if (msgBtn) {
    const wrapper = msgBtn.closest(".msg-content-wrapper");
    if (wrapper) {
      const bubble = wrapper.querySelector(".msg");
      if (bubble) {
        try {
          await navigator.clipboard.writeText(bubble.textContent);
          const originalHTML = msgBtn.innerHTML;
          msgBtn.innerHTML = "已复制";
          setTimeout(() => { msgBtn.innerHTML = originalHTML; }, 2000);
        } catch (err) {
          console.error("复制失败", err);
        }
      }
    }
  }
});
// Initialize Recommend API Link
const recommendApiLink = document.getElementById("recommendApiLink");
if (recommendApiLink && window.BELLDANDY_WEB_CONFIG?.recommendApiUrl) {
  recommendApiLink.href = window.BELLDANDY_WEB_CONFIG.recommendApiUrl;
}

// Initialize Official Home Link（官方主页链接）
const officialHomeLink = document.getElementById("officialHomeLink");
if (officialHomeLink && window.BELLDANDY_WEB_CONFIG?.officialHomeUrl) {
  officialHomeLink.href = window.BELLDANDY_WEB_CONFIG.officialHomeUrl;
}

// Initialize Workshop Link（工坊入口链接）
const workshopLink = document.getElementById("workshopLink");
if (workshopLink && window.BELLDANDY_WEB_CONFIG?.workshopUrl) {
  workshopLink.href = window.BELLDANDY_WEB_CONFIG.workshopUrl;
}

const cfgApiKey = document.getElementById("cfgApiKey");
const cfgBaseUrl = document.getElementById("cfgBaseUrl");
const cfgModel = document.getElementById("cfgModel");
const cfgHeartbeat = document.getElementById("cfgHeartbeat");
const cfgHeartbeatEnabled = document.getElementById("cfgHeartbeatEnabled");
const cfgHeartbeatActiveHours = document.getElementById("cfgHeartbeatActiveHours");
const cfgBrowserRelayEnabled = document.getElementById("cfgBrowserRelayEnabled");
const cfgRelayPort = document.getElementById("cfgRelayPort");
const cfgMcpEnabled = document.getElementById("cfgMcpEnabled");
const cfgCronEnabled = document.getElementById("cfgCronEnabled");
const cfgEmbeddingEnabled = document.getElementById("cfgEmbeddingEnabled");
const cfgEmbeddingApiKey = document.getElementById("cfgEmbeddingApiKey");
const cfgEmbeddingBaseUrl = document.getElementById("cfgEmbeddingBaseUrl");
const cfgEmbeddingModel = document.getElementById("cfgEmbeddingModel");
const cfgToolsEnabled = document.getElementById("cfgToolsEnabled");
const cfgAgentToolControlMode = document.getElementById("cfgAgentToolControlMode");
const cfgAgentToolControlConfirmPassword = document.getElementById("cfgAgentToolControlConfirmPassword");
const cfgTtsEnabled = document.getElementById("cfgTtsEnabled");
const cfgTtsProvider = document.getElementById("cfgTtsProvider");
const cfgTtsVoice = document.getElementById("cfgTtsVoice");
const cfgDashScopeApiKey = document.getElementById("cfgDashScopeApiKey");
const cfgVoiceShortcut = document.getElementById("cfgVoiceShortcut");
const cfgVoiceShortcutStatus = document.getElementById("cfgVoiceShortcutStatus");
const cfgVoiceShortcutDefault = document.getElementById("cfgVoiceShortcutDefault");
const cfgVoiceShortcutClear = document.getElementById("cfgVoiceShortcutClear");
const cfgFacetAnchor = document.getElementById("cfgFacetAnchor");
const cfgInjectAgents = document.getElementById("cfgInjectAgents");
const cfgInjectSoul = document.getElementById("cfgInjectSoul");
const cfgInjectMemory = document.getElementById("cfgInjectMemory");
const cfgMaxSystemPromptChars = document.getElementById("cfgMaxSystemPromptChars");
const cfgMaxHistory = document.getElementById("cfgMaxHistory");
const doctorStatusEl = document.getElementById("doctorStatus");
const REDACTED_PLACEHOLDER = "[REDACTED]";

if (openSettingsBtn) {
  openSettingsBtn.addEventListener("click", () => toggleSettings(true));
}
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));
}
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", saveConfig);
}
if (restartBtn) {
  restartBtn.addEventListener("click", restartServer);
}
if (cfgVoiceShortcut) {
  cfgVoiceShortcut.addEventListener("focus", () => {
    voiceShortcutCaptureActive = true;
    renderVoiceShortcutSetting("按下新的快捷键。Esc 取消，Backspace/Delete 禁用。");
  });
  cfgVoiceShortcut.addEventListener("blur", () => {
    voiceShortcutCaptureActive = false;
    renderVoiceShortcutSetting();
  });
  cfgVoiceShortcut.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      voiceShortcutCaptureActive = false;
      renderVoiceShortcutSetting();
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      voiceShortcutCaptureActive = false;
      cfgVoiceShortcut.blur();
      renderVoiceShortcutSetting("已取消快捷键修改。");
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      persistVoiceShortcutSetting(null);
      voiceShortcutCaptureActive = false;
      cfgVoiceShortcut.blur();
      renderVoiceShortcutSetting("语音快捷键已禁用。");
      return;
    }

    const nextShortcut = buildVoiceShortcutFromEvent(event);
    if (!nextShortcut) {
      renderVoiceShortcutSetting("请使用 Ctrl / Alt / Meta 组合键，或单独使用 F 键。");
      return;
    }

    persistVoiceShortcutSetting(nextShortcut);
    voiceShortcutCaptureActive = false;
    cfgVoiceShortcut.blur();
    renderVoiceShortcutSetting(`快捷键已保存为 ${formatVoiceShortcut(nextShortcut)}。`);
  });
}
if (cfgVoiceShortcutDefault) {
  cfgVoiceShortcutDefault.addEventListener("click", () => {
    persistVoiceShortcutSetting(getDefaultVoiceShortcut());
    renderVoiceShortcutSetting(`已恢复默认快捷键 ${formatVoiceShortcut(voiceShortcutBinding)}。`);
  });
}
if (cfgVoiceShortcutClear) {
  cfgVoiceShortcutClear.addEventListener("click", () => {
    persistVoiceShortcutSetting(null);
    renderVoiceShortcutSetting("语音快捷键已禁用。");
  });
}

function renderVoiceShortcutSetting(message = "") {
  if (cfgVoiceShortcut) {
    cfgVoiceShortcut.value = formatVoiceShortcut(voiceShortcutBinding);
  }
  if (cfgVoiceShortcutStatus) {
    if (voiceShortcutCaptureActive) {
      cfgVoiceShortcutStatus.textContent = message || "按下新的快捷键。Esc 取消，Backspace/Delete 禁用。";
    } else if (message) {
      cfgVoiceShortcutStatus.textContent = message;
    } else {
      cfgVoiceShortcutStatus.textContent = `本地快捷键，当前：${formatVoiceShortcut(voiceShortcutBinding)}。默认 ${formatVoiceShortcut(DEFAULT_VOICE_SHORTCUT)}，不会写入服务端配置。`;
    }
  }
}

function toggleSettings(show) {
  if (show) {
    settingsModal.classList.remove("hidden");
    renderVoiceShortcutSetting();
    loadConfig();
    runDoctor();
  } else {
    voiceShortcutCaptureActive = false;
    settingsModal.classList.add("hidden");
  }
}

async function loadConfig() {
  if (!ws || !isReady) return;
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "config.read" });
  if (res && res.ok && res.payload && res.payload.config) {
    const c = res.payload.config;
    syncAttachmentLimitsFromConfig(c);
    cfgApiKey.value = c["BELLDANDY_OPENAI_API_KEY"] || "";
    cfgBaseUrl.value = c["BELLDANDY_OPENAI_BASE_URL"] || "";
    cfgModel.value = c["BELLDANDY_OPENAI_MODEL"] || "";
    cfgHeartbeat.value = c["BELLDANDY_HEARTBEAT_INTERVAL"] || "";
    cfgHeartbeatEnabled.checked = c["BELLDANDY_HEARTBEAT_ENABLED"] === "true";
    cfgHeartbeatActiveHours.value = c["BELLDANDY_HEARTBEAT_ACTIVE_HOURS"] || "";
    cfgBrowserRelayEnabled.checked = c["BELLDANDY_BROWSER_RELAY_ENABLED"] === "true";
    cfgRelayPort.value = c["BELLDANDY_RELAY_PORT"] || "";
    cfgMcpEnabled.checked = c["BELLDANDY_MCP_ENABLED"] === "true";
    cfgCronEnabled.checked = c["BELLDANDY_CRON_ENABLED"] === "true";
    cfgEmbeddingEnabled.checked = c["BELLDANDY_EMBEDDING_ENABLED"] === "true";
    cfgEmbeddingApiKey.value = c["BELLDANDY_EMBEDDING_OPENAI_API_KEY"] || "";
    cfgEmbeddingBaseUrl.value = c["BELLDANDY_EMBEDDING_OPENAI_BASE_URL"] || "";
    cfgEmbeddingModel.value = c["BELLDANDY_EMBEDDING_MODEL"] || "";
    cfgToolsEnabled.checked = c["BELLDANDY_TOOLS_ENABLED"] === "true";
    cfgAgentToolControlMode.value = c["BELLDANDY_AGENT_TOOL_CONTROL_MODE"] || "disabled";
    cfgAgentToolControlConfirmPassword.value = c["BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD"] || "";
    cfgTtsEnabled.checked = c["BELLDANDY_TTS_ENABLED"] === "true";
    cfgTtsProvider.value = c["BELLDANDY_TTS_PROVIDER"] || "edge";
    cfgTtsVoice.value = c["BELLDANDY_TTS_VOICE"] || "";
    cfgDashScopeApiKey.value = c["DASHSCOPE_API_KEY"] || "";
    cfgFacetAnchor.value = c["BELLDANDY_FACET_ANCHOR"] || "";
    cfgInjectAgents.checked = c["BELLDANDY_INJECT_AGENTS"] === "true";
    cfgInjectSoul.checked = c["BELLDANDY_INJECT_SOUL"] === "true";
    cfgInjectMemory.checked = c["BELLDANDY_INJECT_MEMORY"] === "true";
    cfgMaxSystemPromptChars.value = c["BELLDANDY_MAX_SYSTEM_PROMPT_CHARS"] || "";
    cfgMaxHistory.value = c["BELLDANDY_MAX_HISTORY"] || "";
  }
}

function assignSecretUpdate(updates, key, inputEl) {
  if (!inputEl) return;
  const value = inputEl.value.trim();
  if (value === REDACTED_PLACEHOLDER) return;
  updates[key] = value;
}

async function runDoctor() {
  if (!ws || !isReady) {
    doctorStatusEl.innerHTML = '<span class="badge fail">Disconnected</span>';
    return;
  }
  doctorStatusEl.innerHTML = '<span class="badge">Checking...</span>';

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "system.doctor" });
  if (res && res.ok && res.payload && res.payload.checks) {
    doctorStatusEl.innerHTML = "";
    res.payload.checks.forEach(check => {
      const badge = document.createElement("span");
      badge.className = `badge ${check.status}`;
      badge.textContent = `${check.name}: ${check.message || check.status}`;
      doctorStatusEl.appendChild(badge);
    });
  } else {
    doctorStatusEl.innerHTML = '<span class="badge fail">Check Failed</span>';
  }
}

async function saveConfig() {
  if (!ws || !isReady) {
    alert("Error: Not connected to server.\nPlease refresh the page or check if the Gateway is running.");
    return;
  }
  saveSettingsBtn.textContent = "Saving...";
  saveSettingsBtn.disabled = true;

  const updates = {};
  const mainApiKey = cfgApiKey.value.trim();
  assignSecretUpdate(updates, "BELLDANDY_OPENAI_API_KEY", cfgApiKey);
  updates["BELLDANDY_OPENAI_BASE_URL"] = cfgBaseUrl.value.trim() || "https://api.openai.com/v1";
  updates["BELLDANDY_OPENAI_MODEL"] = cfgModel.value.trim();
  updates["BELLDANDY_HEARTBEAT_ENABLED"] = cfgHeartbeatEnabled.checked ? "true" : "false";
  updates["BELLDANDY_HEARTBEAT_INTERVAL"] = cfgHeartbeat.value.trim();
  updates["BELLDANDY_HEARTBEAT_ACTIVE_HOURS"] = cfgHeartbeatActiveHours.value.trim();
  updates["BELLDANDY_BROWSER_RELAY_ENABLED"] = cfgBrowserRelayEnabled.checked ? "true" : "false";
  updates["BELLDANDY_RELAY_PORT"] = cfgRelayPort.value.trim();
  updates["BELLDANDY_MCP_ENABLED"] = cfgMcpEnabled.checked ? "true" : "false";
  updates["BELLDANDY_CRON_ENABLED"] = cfgCronEnabled.checked ? "true" : "false";
  updates["BELLDANDY_EMBEDDING_ENABLED"] = cfgEmbeddingEnabled.checked ? "true" : "false";
  assignSecretUpdate(updates, "BELLDANDY_EMBEDDING_OPENAI_API_KEY", cfgEmbeddingApiKey);
  updates["BELLDANDY_EMBEDDING_OPENAI_BASE_URL"] = cfgEmbeddingBaseUrl.value.trim();
  updates["BELLDANDY_EMBEDDING_MODEL"] = cfgEmbeddingModel.value.trim();
  updates["BELLDANDY_TOOLS_ENABLED"] = cfgToolsEnabled.checked ? "true" : "false";
  updates["BELLDANDY_AGENT_TOOL_CONTROL_MODE"] = cfgAgentToolControlMode.value.trim() || "disabled";
  assignSecretUpdate(updates, "BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD", cfgAgentToolControlConfirmPassword);
  updates["BELLDANDY_TTS_ENABLED"] = cfgTtsEnabled.checked ? "true" : "false";
  updates["BELLDANDY_TTS_PROVIDER"] = cfgTtsProvider.value.trim() || "edge";
  updates["BELLDANDY_TTS_VOICE"] = cfgTtsVoice.value.trim();
  assignSecretUpdate(updates, "DASHSCOPE_API_KEY", cfgDashScopeApiKey);
  updates["BELLDANDY_FACET_ANCHOR"] = cfgFacetAnchor.value.trim();
  updates["BELLDANDY_INJECT_AGENTS"] = cfgInjectAgents.checked ? "true" : "false";
  updates["BELLDANDY_INJECT_SOUL"] = cfgInjectSoul.checked ? "true" : "false";
  updates["BELLDANDY_INJECT_MEMORY"] = cfgInjectMemory.checked ? "true" : "false";
  updates["BELLDANDY_MAX_SYSTEM_PROMPT_CHARS"] = cfgMaxSystemPromptChars.value.trim();
  updates["BELLDANDY_MAX_HISTORY"] = cfgMaxHistory.value.trim();

  // Set Provider to openai if key present (Lenient mode auto-enable)
  if (mainApiKey && mainApiKey !== REDACTED_PLACEHOLDER) {
    updates["BELLDANDY_AGENT_PROVIDER"] = "openai";
  }

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "config.update", params: { updates } });

  if (res && res.ok) {
    saveSettingsBtn.textContent = "Saved";
    setTimeout(() => {
      saveSettingsBtn.textContent = "Save";
      saveSettingsBtn.disabled = false;
      alert("Configuration saved. Please restart server to apply changes.");
    }, 1000);
  } else {
    saveSettingsBtn.textContent = "Failed";
    saveSettingsBtn.disabled = false;
    alert("Save failed: " + (res.error ? res.error.message : "Unknown error"));
  }
}

async function restartServer() {
  if (!confirm("Are you sure you want to restart the server?")) return;
  if (!ws || !isReady) return;

  const id = makeId();
  await sendReq({ type: "req", id, method: "system.restart" });
  setStatus("Restarting...");
  ws.close();
  // setTimeout(() => location.reload(), 3000); // Rely on auto-reconnect
}

// ... existing helpers ...
function handleEvent(event, payload) {
  if (event === "pairing.required") {
    const code = payload && payload.code ? String(payload.code) : "";
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");
    botMsgEl.innerHTML = `
      <div style="line-height: 1.6;">
        需要配对（Pairing）。配对码：<b>${code}</b><br><br>
        <b>新手操作指南：</b><br>
        1. 不要关闭当前网页。<br>
        2. <b>保持那个运行着服务的黑色窗口不要关</b>，然后在项目目录下重新打开一个<b>新的黑色终端窗口</b>。<br>
        3. 在这个新窗口里，复制并粘贴下面的完整命令，然后按回车键：<br>
        <div style="background: var(--bg-secondary); padding: 8px; border-radius: 4px; margin: 8px 0; font-family: monospace;">
          corepack pnpm bdd pairing approve ${code}
        </div>
        4. 终端提示成功后，在这个网页再发一次消息即可。
      </div>
    `;
    return;
  }
  if (event === "agent.status") {
    if (payload && payload.status === "restarting" && payload.countdown !== undefined) {
      showRestartCountdown(payload.countdown, payload.reason || "");
    }
    // 运行中时给 token-usage 加 updating 样式
    const tuEl = document.getElementById("tokenUsage");
    if (tuEl && payload) {
      if (payload.status === "running") tuEl.classList.add("updating");
      else tuEl.classList.remove("updating");
    }
    return;
  }
  if (event === "token.usage") {
    updateTokenUsage(payload);
    return;
  }
  if (event === "token.counter.result") {
    showTaskTokenResult(payload);
    return;
  }
  if (event === "goal.update") {
    queueGoalUpdateEvent(payload);
    return;
  }
  if (event === "tool_settings.confirm.required") {
    handleToolSettingsConfirmRequired(payload);
    return;
  }
  if (event === "tool_settings.confirm.resolved") {
    handleToolSettingsConfirmResolved(payload);
    return;
  }
  if (event === "tools.config.updated") {
    if (toolSettingsModal && !toolSettingsModal.classList.contains("hidden")) {
      loadToolSettings();
    } else if (payload && payload.disabled) {
      if (!toolSettingsData) {
        toolSettingsData = { builtin: [], mcp: {}, plugins: [], skills: [], disabled: payload.disabled };
      } else {
        toolSettingsData.disabled = payload.disabled;
      }
    }
    return;
  }
  if (event === "chat.delta") {
    const delta = payload && payload.delta ? String(payload.delta) : "";
    if (!delta) return;
    if (!botMsgEl) {
      botMsgEl = appendMessage("bot", "");
      botRawHtmlBuffer = "";
    }
    botRawHtmlBuffer += delta;

    // 剥离 <think> 标签并解析 Markdown，然后再安全过滤
    const strippedText = stripThinkBlocks(botRawHtmlBuffer);
    configureMarkedOnce();
    const parsedHtml = window.marked ? window.marked.parse(strippedText) : strippedText;
    botMsgEl.innerHTML = sanitizeAssistantHtml(parsedHtml);

    // 强制滚动到底部（测试模式）
    forceScrollToBottom();
    return;
  }
  if (event === "chat.final") {
    const text = payload && payload.text ? String(payload.text) : "";
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");
    botRawHtmlBuffer = text;

    // 剥离 <think> 标签并解析 Markdown，然后再安全过滤
    const strippedText = stripThinkBlocks(botRawHtmlBuffer);
    configureMarkedOnce();
    const parsedHtml = window.marked ? window.marked.parse(strippedText) : strippedText;
    botMsgEl.innerHTML = sanitizeAssistantHtml(parsedHtml);

    // 处理图片和视频缩略图
    processMediaInMessage(botMsgEl);

    // [NEW] Auto-play audio if present
    const audioEl = botMsgEl.querySelector("audio");
    if (audioEl) {
      audioEl.play().catch(err => {
        console.warn("Auto-play blocked:", err);
      });
    }

    // 强制滚动到底部（测试模式）
    // 强制滚动到底部（测试模式）
    forceScrollToBottom();
    // ReAct 可视化：chat.final → 总结节点
    if (window._canvasApp) {
      window._canvasApp.handleReactFinal(text);
    }
    return;
  }
  // Canvas 实时更新事件
  if (event === "canvas.update") {
    if (window._canvasApp && payload) {
      const boardId = payload.boardId;
      const action = payload.action;
      const data = payload.payload;
      if (window._canvasApp.currentBoardId === boardId) {
        window._canvasApp.handleCanvasEvent(action, data);
      }
    }
    return;
  }
  // ReAct 可视化：tool_call / tool_result → canvas 临时节点
  if (event === "tool_call") {
    if (window._canvasApp) {
      window._canvasApp.handleReactEvent("tool_call", payload);
    }
    return;
  }
  if (event === "tool_result") {
    if (window._canvasApp) {
      window._canvasApp.handleReactEvent("tool_result", payload);
    }
    return;
  }
}

function showRestartCountdown(countdown, reason) {
  const overlay = document.getElementById("restartOverlay");
  const countdownEl = document.getElementById("restartCountdown");
  const reasonEl = document.getElementById("restartReason");
  if (!overlay || !countdownEl) return;

  if (countdown > 0) {
    // 显示倒计时
    overlay.classList.remove("hidden");
    reasonEl.textContent = reason;
    countdownEl.textContent = String(countdown);
    // pulse 动画
    countdownEl.classList.remove("pulse");
    void countdownEl.offsetWidth; // force reflow
    countdownEl.classList.add("pulse");
  } else {
    // countdown === 0，服务即将断开
    countdownEl.textContent = "…";
    setStatus("Restarting…");
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

async function loadConversationMeta(conversationId) {
  if (!conversationId || !ws || !isReady) {
    renderTaskTokenHistory();
    return;
  }
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "conversation.meta",
    params: { conversationId, limit: TASK_TOKEN_HISTORY_LIMIT },
  });
  if (res && res.ok && res.payload && Array.isArray(res.payload.taskTokenResults)) {
    setTaskTokenHistory(conversationId, res.payload.taskTokenResults);
    return;
  }
  renderTaskTokenHistory();
}

function renderTaskTokenHistory() {
  if (!taskTokenHistoryEl) return;
  const items = activeConversationId
    ? (taskTokenHistoryByConversation.get(activeConversationId) || [])
    : [];

  if (!items.length) {
    taskTokenHistoryEl.innerHTML = '<div class="task-token-history-empty">暂无任务级 Token 记录</div>';
    return;
  }

  taskTokenHistoryEl.innerHTML = items.map((item) => `
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
    const el = document.getElementById(id);
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
  const tuEl = document.getElementById("tokenUsage");
  if (tuEl) tuEl.classList.remove("updating");
}

let taskTokenHideTimer = null;

function showTaskTokenResult(payload) {
  if (!payload) return;
  const panel = document.getElementById("taskTokenUsage");
  if (!panel) return;

  if (payload.conversationId) {
    prependTaskTokenHistory(String(payload.conversationId), payload);
  }

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = typeof val === "number" ? formatTokenCount(val) : String(val ?? "--");
  };
  set("taskName", payload.name);
  set("taskIn", payload.inputTokens);
  set("taskOut", payload.outputTokens);
  set("taskTotal", payload.totalTokens);

  panel.style.display = "flex";

  // 8 秒后自动隐藏
  if (taskTokenHideTimer) clearTimeout(taskTokenHideTimer);
  taskTokenHideTimer = setTimeout(() => {
    panel.style.display = "none";
  }, 8000);
}

function flushQueuedText() {
  const text = queuedText;
  if (!text) return;
  queuedText = null;
  promptEl.value = text;
  sendMessage();
}

function appendMessage(kind, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg-wrapper ${kind}`;

  // 头像
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";

  const avatarSrc = kind === "bot" ? agentAvatar : userAvatar;

  // 判断是否为图片路径/URL
  if (isImagePath(avatarSrc)) {
    avatar.style.backgroundImage = `url(${avatarSrc})`;
    avatar.classList.add("avatar-image");
  } else {
    avatar.textContent = avatarSrc;
  }

  // 消息内容容器
  const contentWrapper = document.createElement("div");
  contentWrapper.className = "msg-content-wrapper";

  // 名称
  const nameEl = document.createElement("div");
  nameEl.className = "msg-name";
  nameEl.textContent = kind === "bot" ? agentName : userName;

  // 消息气泡
  const bubble = document.createElement("div");
  bubble.className = `msg ${kind}`;
  bubble.textContent = text;

  contentWrapper.appendChild(nameEl);
  contentWrapper.appendChild(bubble);

  // 对于机器人的回复，在气泡外加一个复制全文按钮
  if (kind === "bot") {
    const actionsEl = document.createElement("div");
    actionsEl.className = "msg-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-msg-btn";
    copyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg> 复制
    `;
    copyBtn.title = "复制全文";

    actionsEl.appendChild(copyBtn);
    contentWrapper.appendChild(actionsEl);
  }

  wrapper.appendChild(avatar);
  wrapper.appendChild(contentWrapper);

  messagesEl.appendChild(wrapper);
  forceScrollToBottom();
  return bubble; // 返回气泡元素，用于后续更新
}

/**
 * 判断字符串是否为图片路径或 URL
 */
function isImagePath(str) {
  if (!str || typeof str !== "string") return false;

  // 检查是否为 URL
  if (str.startsWith("http://") || str.startsWith("https://") || str.startsWith("//")) {
    return true;
  }

  // 检查是否为本地路径（以 / 或 ./ 或 ../ 开头）
  if (str.startsWith("/") || str.startsWith("./") || str.startsWith("../")) {
    return true;
  }

  // 检查是否包含图片扩展名
  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"];
  const lowerStr = str.toLowerCase();
  return imageExts.some(ext => lowerStr.includes(ext));
}

// ==================== 自动滚动逻辑 ====================

/** 检测滚动条是否接近底部 */
function isNearBottom(el, threshold = 100) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/** 如果用户在底部附近，自动滚动到最新消息 */
function scrollToBottomIfNeeded() {
  if (isNearBottom(chatSection)) {
    forceScrollToBottom();
  }
}

/**
 * 处理消息中的图片和视频，转换为缩略图
 * @param {HTMLElement} msgEl - 消息气泡元素
 */
function processMediaInMessage(msgEl) {
  // 处理图片
  const images = msgEl.querySelectorAll("img");
  images.forEach(img => {
    const originalSrc = img.src;
    const wrapper = document.createElement("div");
    wrapper.className = "media-thumbnail";
    wrapper.style.backgroundImage = `url(${originalSrc})`;
    wrapper.title = "点击查看原图";
    wrapper.addEventListener("click", () => openMediaModal(originalSrc, "image"));
    img.replaceWith(wrapper);
  });

  // 处理视频
  const videos = msgEl.querySelectorAll("video");
  videos.forEach(video => {
    const originalSrc = video.src || (video.querySelector("source")?.src);
    if (!originalSrc) return;

    const wrapper = document.createElement("div");
    wrapper.className = "media-thumbnail video-thumbnail";
    wrapper.title = "点击播放视频";

    // 创建播放图标
    const playIcon = document.createElement("div");
    playIcon.className = "play-icon";
    playIcon.textContent = "▶";
    wrapper.appendChild(playIcon);

    // 尝试使用视频第一帧作为缩略图（如果可能）
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    video.addEventListener("loadeddata", () => {
      ctx.drawImage(video, 0, 0, 200, 150);
      wrapper.style.backgroundImage = `url(${canvas.toDataURL()})`;
    }, { once: true });

    wrapper.addEventListener("click", () => openMediaModal(originalSrc, "video"));
    video.replaceWith(wrapper);
  });
}

/**
 * 打开媒体弹窗
 * @param {string} src - 媒体源 URL
 * @param {string} type - 媒体类型 ("image" 或 "video")
 */
function openMediaModal(src, type) {
  // 创建弹窗
  const modal = document.createElement("div");
  modal.className = "media-modal";
  modal.addEventListener("click", () => modal.remove());

  const content = document.createElement("div");
  content.className = "media-modal-content";
  content.addEventListener("click", (e) => e.stopPropagation());

  if (type === "image") {
    const img = document.createElement("img");
    img.src = src;
    img.style.maxWidth = "90vw";
    img.style.maxHeight = "90vh";
    content.appendChild(img);
  } else if (type === "video") {
    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.style.maxWidth = "90vw";
    video.style.maxHeight = "90vh";
    content.appendChild(video);
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "media-modal-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => modal.remove());

  modal.appendChild(content);
  modal.appendChild(closeBtn);
  document.body.appendChild(modal);
}

/** 强制滚动到底部 - 使用 chatSection 作为滚动容器 */
function forceScrollToBottom() {
  chatSection.scrollTop = chatSection.scrollHeight;
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
  if (!ws) return Promise.resolve(null);
  ws.send(JSON.stringify(frame));
  return new Promise((resolve) => {
    pendingReq.set(frame.id, { resolve });
    setTimeout(() => {
      if (pendingReq.has(frame.id)) {
        pendingReq.delete(frame.id);
        resolve(null);
      }
    }, 30_000);
  });
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

// 附件按钮点击
if (attachBtn) {
  attachBtn.addEventListener("click", () => fileInput?.click());
}

// 文件选择
if (fileInput) {
  fileInput.addEventListener("change", () => {
    if (fileInput.files) handleFiles(fileInput.files);
    fileInput.value = ""; // 重置以允许再次选择相同文件
  });
}

// 拖拽支持 (composerSection 已在文件顶部声明)
if (composerSection) {
  composerSection.addEventListener("dragover", (e) => {
    e.preventDefault();
    composerSection.classList.add("drag-over");
  });
  composerSection.addEventListener("dragleave", () => {
    composerSection.classList.remove("drag-over");
  });
  composerSection.addEventListener("drop", (e) => {
    e.preventDefault();
    composerSection.classList.remove("drag-over");
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
  });
}

// 粘贴图片支持
promptEl.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        // 剪贴板图片默认名无辨识度，加时间戳
        const ext = file.type.split("/")[1] || "png";
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        const named = new File([file], `paste-${ts}.${ext}`, { type: file.type });
        files.push(named);
      }
    }
  }
  if (files.length > 0) {
    e.preventDefault();
    handleFiles(files);
  }
});

// 处理文件列表
async function handleFiles(files) {
  const allowedTypes = {
    image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    video: [".mp4", ".mov", ".avi", ".webm", ".mkv"],
    text: [".txt", ".md", ".json", ".log", ".js", ".ts", ".xml", ".html", ".css", ".csv"] // Added more text types
  };
  const rejected = [];
  let projectedTotalBytes = estimatePendingAttachmentTotalBytes();

  for (const file of files) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    const isImage = allowedTypes.image.includes(ext);
    const isVideo = allowedTypes.video.includes(ext);
    const isText = allowedTypes.text.includes(ext);

    if (!isImage && !isVideo && !isText) {
      console.warn(`不支持的文件类型: ${file.name}`);
      rejected.push(`${file.name}：不支持的文件类型`);
      continue;
    }

    try {
      let content = "";
      let mimeType = file.type || (isImage ? "image/png" : (isVideo ? "video/mp4" : "text/plain"));
      let attachmentBytes = 0;

      if (!isImage && file.size > attachmentLimits.maxFileBytes) {
        rejected.push(`${file.name}：文件大小 ${formatBytes(file.size)} 超过单文件上限 ${formatBytes(attachmentLimits.maxFileBytes)}`);
        continue;
      }
      if (!isImage && projectedTotalBytes + file.size > attachmentLimits.maxTotalBytes) {
        rejected.push(`${file.name}：加入后总大小会超过 ${formatBytes(attachmentLimits.maxTotalBytes)}`);
        continue;
      }

      if (isImage) {
        const processed = await readImageForAttachment(file);
        content = processed.content;
        mimeType = processed.mimeType;
        attachmentBytes = estimateDataUrlBytes(content);
      } else {
        // Videos use Data URL directly; text files are read as UTF-8 text
        content = await readFileContent(file, isVideo);
        attachmentBytes = isVideo
          ? estimateDataUrlBytes(content)
          : estimateTextBytes(typeof content === "string" ? content : "");
      }

      if (attachmentBytes > attachmentLimits.maxFileBytes) {
        rejected.push(`${file.name}：处理后大小 ${formatBytes(attachmentBytes)} 超过单文件上限 ${formatBytes(attachmentLimits.maxFileBytes)}`);
        continue;
      }
      if (projectedTotalBytes + attachmentBytes > attachmentLimits.maxTotalBytes) {
        rejected.push(`${file.name}：加入后总大小会超过 ${formatBytes(attachmentLimits.maxTotalBytes)}`);
        continue;
      }

      pendingAttachments.push({
        name: file.name,
        type: isImage ? "image" : (isVideo ? "video" : "text"),
        mimeType,
        content
      });
      projectedTotalBytes += attachmentBytes;
    } catch (err) {
      console.error(`读取文件失败: ${file.name}`, err);
      rejected.push(`${file.name}：读取失败`);
    }
  }

  if (rejected.length > 0) {
    const lines = rejected.slice(0, 3).map((item) => `- ${item}`);
    if (rejected.length > 3) {
      lines.push(`- 另有 ${rejected.length - 3} 个文件被跳过`);
    }
    renderAttachmentsPreview(`⚠️ 以下文件未加入：\n${lines.join("\n")}`);
    return;
  }

  renderAttachmentsPreview();
}

// 读取文件内容
function readFileContent(file, asBase64) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (asBase64) {
        // 返回完整的 data URL
        resolve(reader.result);
      } else {
        resolve(reader.result);
      }
    };
    reader.onerror = () => reject(reader.error);
    if (asBase64) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  return estimateBase64DecodedBytes(dataUrl.slice(comma + 1));
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    image.src = objectUrl;
  });
}

function canvasToDataUrl(canvas, mimeType, quality) {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch {
    return "";
  }
}

async function compressImageToDataUrl(file, sourceType) {
  const image = await loadImageElementFromFile(file);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  let scale = Math.min(1, IMAGE_COMPRESS_MAX_EDGE / Math.max(sourceWidth, sourceHeight));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context unavailable");
  }

  let best = null;
  const preferredType = sourceType === "image/webp" ? "image/webp" : "image/jpeg";
  const fallbackType = preferredType === "image/webp" ? "image/jpeg" : "image/webp";

  for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const tryTypes = [preferredType, fallbackType];
    for (const type of tryTypes) {
      for (const quality of IMAGE_COMPRESS_QUALITIES) {
        const dataUrl = canvasToDataUrl(canvas, type, quality);
        if (!dataUrl) continue;
        const bytes = estimateDataUrlBytes(dataUrl);
        if (!best || bytes < best.bytes) {
          best = { dataUrl, bytes, mimeType: type };
        }
        if (bytes <= IMAGE_COMPRESS_TARGET_BYTES) {
          return { dataUrl, bytes, mimeType: type };
        }
      }
    }

    scale *= IMAGE_COMPRESS_RESIZE_FACTOR;
  }

  return best;
}

async function readImageForAttachment(file) {
  const sourceType = (file.type || "image/png").toLowerCase();
  const originalDataUrl = await readFileContent(file, true);
  const originalBytes = estimateDataUrlBytes(originalDataUrl);

  // GIF/SVG 保持原样，避免破坏动画或矢量内容
  if (sourceType.includes("gif") || sourceType.includes("svg")) {
    return { content: originalDataUrl, mimeType: sourceType };
  }
  if (originalBytes <= IMAGE_COMPRESS_TRIGGER_BYTES) {
    return { content: originalDataUrl, mimeType: sourceType };
  }

  try {
    const compressed = await compressImageToDataUrl(file, sourceType);
    if (compressed && compressed.dataUrl && compressed.bytes > 0 && compressed.bytes < originalBytes) {
      console.info("Image compressed before upload", {
        name: file.name,
        originalBytes,
        compressedBytes: compressed.bytes,
        mimeType: compressed.mimeType,
      });
      return {
        content: compressed.dataUrl,
        mimeType: compressed.mimeType
      };
    }
  } catch (err) {
    console.warn("Image compression failed, use original file", { name: file.name, error: String(err) });
  }

  return { content: originalDataUrl, mimeType: sourceType };
}

// 渲染附件预览
function renderAttachmentsPreview(hintMessage = "") {
  if (!attachmentsPreviewEl) return;
  attachmentsPreviewEl.innerHTML = "";

  pendingAttachments.forEach((att, idx) => {
    const item = document.createElement("div");
    item.className = "attachment-item";

    if (att.type === "image") {
      // 图片缩略图
      const thumbnail = document.createElement("div");
      thumbnail.className = "attachment-thumbnail";
      thumbnail.style.backgroundImage = `url(${att.content})`;
      thumbnail.title = att.name;
      item.appendChild(thumbnail);
    } else if (att.type === "video") {
      // 视频缩略图（带播放图标）
      const thumbnail = document.createElement("div");
      thumbnail.className = "attachment-thumbnail video-thumbnail";
      thumbnail.title = att.name;

      // 尝试生成视频第一帧作为缩略图
      const video = document.createElement("video");
      video.src = att.content;
      video.addEventListener("loadeddata", () => {
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, 80, 60);
        thumbnail.style.backgroundImage = `url(${canvas.toDataURL()})`;
      }, { once: true });

      const playIcon = document.createElement("div");
      playIcon.className = "play-icon-small";
      playIcon.textContent = "▶";
      thumbnail.appendChild(playIcon);

      item.appendChild(thumbnail);
    } else {
      // 文本/音频文件图标
      const icon = document.createElement("div");
      icon.className = "file-icon";
      icon.textContent = att.type === "audio" ? "🎤" : "📄";
      icon.style.fontSize = "24px";
      item.appendChild(icon);
    }

    const nameSpan = document.createElement("span");
    nameSpan.textContent = att.name.length > 15 ? att.name.slice(0, 12) + "..." : att.name;
    item.appendChild(nameSpan);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => {
      pendingAttachments.splice(idx, 1);
      renderAttachmentsPreview();
    };
    item.appendChild(removeBtn);

    attachmentsPreviewEl.appendChild(item);
  });

  updateAttachmentHint(hintMessage);
}

// ==================== 文件树和编辑器逻辑 ====================

// 侧边栏标题点击事件（展开/收起）
// 侧边栏标题点击事件（不再作为模式切换，仅展开/收起）
if (sidebarTitleEl) {
  sidebarTitleEl.addEventListener("click", () => toggleSidebar());
}

// 切换侧边栏展开/收起
function toggleSidebar() {
  sidebarExpanded = !sidebarExpanded;
  if (sidebarEl) {
    if (sidebarExpanded) {
      sidebarEl.classList.remove("collapsed");
      // 展开时加载文件树
      if (isReady) loadFileTree();
    } else {
      sidebarEl.classList.add("collapsed");
    }
  }
}

// 刷新按钮事件
if (refreshTreeBtn) {
  refreshTreeBtn.addEventListener("click", () => loadFileTree());
}

// 编辑器按钮事件
if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", () => cancelEdit());
}
if (saveEditBtn) {
  saveEditBtn.addEventListener("click", () => saveFile());
}

// 配置按钮事件
const openEnvEditorBtn = document.getElementById("openEnvEditor");
if (openEnvEditorBtn) {
  openEnvEditorBtn.addEventListener("click", () => openEnvFile());
}

// 导航按钮
const switchRootBtn = document.getElementById("switchRoot");
const switchFacetBtn = document.getElementById("switchFacet");
const switchMemoryBtn = document.getElementById("switchMemory");
const switchGoalsBtn = document.getElementById("switchGoals");

if (switchRootBtn) {
  switchRootBtn.addEventListener("click", () => switchTreeMode("root"));
}
if (switchFacetBtn) {
  switchFacetBtn.addEventListener("click", () => switchTreeMode("facets"));
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

// 画布工作区按钮
const switchCanvasBtn = document.getElementById("switchCanvas");
if (switchCanvasBtn) {
  switchCanvasBtn.addEventListener("click", async () => {
    if (window._canvasApp) {
      switchMode("canvas");
      await window._canvasApp.showBoardList();
    }
  });
}

// 切换文件树模式
function switchTreeMode(mode) {
  if (currentTreeMode === mode) {
    if (!sidebarExpanded) toggleSidebar();
    else loadFileTree();
    switchMode("chat");
    return;
  }

  currentTreeMode = mode;
  expandedFolders.clear();

  switchMode("chat");
  updateSidebarModeButtons(mode);

  // 确保侧边栏展开
  if (!sidebarExpanded) {
    toggleSidebar();
  } else {
    loadFileTree();
  }
}

function setSidebarActionButtonState(button, active) {
  if (!button) return;
  button.style.background = active ? "rgba(255,255,255,0.1)" : "transparent";
  button.style.opacity = active ? "1" : "0.7";
}

function updateSidebarModeButtons(treeModeOverride) {
  const treeMode = treeModeOverride ?? currentTreeMode;
  setSidebarActionButtonState(switchRootBtn, treeMode === "root");
  setSidebarActionButtonState(switchFacetBtn, treeMode === "facets");
  setSidebarActionButtonState(switchMemoryBtn, memoryViewerSection && !memoryViewerSection.classList.contains("hidden"));
  setSidebarActionButtonState(switchGoalsBtn, goalsSection && !goalsSection.classList.contains("hidden"));
  const canvasSection = document.getElementById("canvasSection");
  setSidebarActionButtonState(switchCanvasBtn, canvasSection && !canvasSection.classList.contains("hidden"));
}

function ensureNoticeStack() {
  let stack = document.getElementById("noticeStack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.id = "noticeStack";
  stack.className = "notice-stack";
  document.body.appendChild(stack);
  return stack;
}

function showNotice(title, message, tone = "info", durationMs = 3200) {
  const stack = ensureNoticeStack();
  const item = document.createElement("div");
  item.className = `notice-item notice-${tone}`;
  item.innerHTML = `
    <div class="notice-title">${escapeHtml(title)}</div>
    <div class="notice-message">${escapeHtml(message)}</div>
  `;
  stack.appendChild(item);

  const remove = () => {
    if (item.parentElement) item.parentElement.removeChild(item);
  };
  setTimeout(remove, durationMs);
}

function applyEditorSession({ path, content, readOnly = false, label, startLine }) {
  currentEditPath = path;
  originalContent = content;
  currentEditReadOnly = readOnly;

  if (editorPath) {
    editorPath.textContent = label || path || "文件路径";
  }
  if (editorTextarea) {
    editorTextarea.value = content || "";
    editorTextarea.readOnly = readOnly;
  }
  if (editorModeBadge) {
    editorModeBadge.classList.toggle("hidden", !readOnly);
    editorModeBadge.textContent = readOnly ? "只读来源" : "可编辑";
  }
  if (saveEditBtn) {
    saveEditBtn.disabled = readOnly;
    saveEditBtn.textContent = readOnly ? "只读" : "保存";
    saveEditBtn.title = readOnly ? "当前为只读源文件视图" : "";
  }

  switchMode("editor");
  if (typeof startLine === "number" && startLine > 0) {
    focusEditorLine(startLine);
  }
}

function focusEditorLine(lineNumber) {
  if (!editorTextarea || typeof lineNumber !== "number" || lineNumber <= 0) return;
  const lines = editorTextarea.value.split("\n");
  const safeLine = Math.max(1, Math.min(lineNumber, lines.length));
  let offset = 0;
  for (let i = 0; i < safeLine - 1; i += 1) {
    offset += lines[i].length + 1;
  }
  const lineText = lines[safeLine - 1] || "";
  editorTextarea.focus();
  editorTextarea.setSelectionRange(offset, offset + lineText.length);
  const lineHeight = parseFloat(getComputedStyle(editorTextarea).lineHeight || "22");
  editorTextarea.scrollTop = Math.max(0, (safeLine - 3) * lineHeight);
}

function resetEditorAccessState() {
  currentEditReadOnly = false;
  if (editorTextarea) editorTextarea.readOnly = false;
  if (editorModeBadge) {
    editorModeBadge.classList.add("hidden");
    editorModeBadge.textContent = "只读来源";
  }
  if (saveEditBtn) {
    saveEditBtn.disabled = false;
    saveEditBtn.textContent = "保存";
    saveEditBtn.title = "";
  }
}

// 打开 .env 文件进行编辑
async function openEnvFile() {
  if (!ws || !isReady) {
    showNotice("无法打开配置", "未连接到服务器。", "error");
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "config.readRaw",
  });

  if (!res || !res.ok) {
    const msg = res && res.error ? res.error.message : "读取失败";
    showNotice("无法读取配置文件", msg, "error");
    return;
  }

  applyEditorSession({
    path: ".env",
    content: res.payload.content,
    readOnly: false,
    label: ".env (环境配置)",
  });
}

// 加载文件树
async function loadFileTree(folderPath = "") {
  if (!ws || !isReady) {
    if (fileTreeEl) fileTreeEl.innerHTML = '<div class="tree-loading">未连接</div>';
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.list",
    params: { path: currentTreeMode === "facets" && !folderPath ? "facets" : folderPath },
  });

  if (!res || !res.ok || !res.payload || !res.payload.items) {
    if (fileTreeEl && !folderPath) {
      fileTreeEl.innerHTML = '<div class="tree-loading">加载失败</div>';
    }
    return [];
  }

  const items = res.payload.items;

  // 如果是根目录，渲染整个树
  if (!folderPath) {
    renderFileTree(items);
  }

  return items;
}

// 渲染文件树
function renderFileTree(items) {
  if (!fileTreeEl) return;

  fileTreeEl.innerHTML = "";

  if (items.length === 0) {
    fileTreeEl.innerHTML = '<div class="tree-loading">无文件</div>';
    return;
  }

  for (const item of items) {
    const el = createTreeItem(item);
    fileTreeEl.appendChild(el);
  }
}

// 创建树节点
function createTreeItem(item) {
  if (item.type === "directory") {
    const folder = document.createElement("div");
    folder.className = "tree-folder";
    if (expandedFolders.has(item.path)) {
      folder.classList.add("expanded");
    }

    const header = document.createElement("div");
    header.className = "tree-item";
    header.innerHTML = `
      <span class="tree-item-icon"></span>
      <span class="tree-item-name">${escapeHtml(item.name)}</span>
    `;
    header.addEventListener("click", () => toggleFolder(item.path, folder));

    const children = document.createElement("div");
    children.className = "tree-children";

    folder.appendChild(header);
    folder.appendChild(children);

    // 如果已展开，加载子项
    if (expandedFolders.has(item.path)) {
      loadFolderChildren(item.path, children);
    }

    return folder;
  } else {
    const file = document.createElement("div");
    file.className = "tree-file";

    const fileItem = document.createElement("div");
    fileItem.className = "tree-item";
    if (currentEditPath === item.path) {
      fileItem.classList.add("active");
    }
    fileItem.innerHTML = `
      <span class="tree-item-icon"></span>
      <span class="tree-item-name">${escapeHtml(item.name)}</span>
    `;
    fileItem.addEventListener("click", () => openFile(item.path));

    file.appendChild(fileItem);
    return file;
  }
}

// 展开/收起文件夹
async function toggleFolder(folderPath, folderEl) {
  if (expandedFolders.has(folderPath)) {
    expandedFolders.delete(folderPath);
    folderEl.classList.remove("expanded");
  } else {
    expandedFolders.add(folderPath);
    folderEl.classList.add("expanded");

    // 加载子项
    const children = folderEl.querySelector(".tree-children");
    if (children && children.children.length === 0) {
      await loadFolderChildren(folderPath, children);
    }
  }
}

// 加载文件夹子项
async function loadFolderChildren(folderPath, containerEl) {
  containerEl.innerHTML = '<div class="tree-loading" style="padding: 4px 8px; font-size: 12px;">...</div>';

  const items = await loadFileTree(folderPath);

  containerEl.innerHTML = "";

  if (!items || items.length === 0) {
    containerEl.innerHTML = '<div class="tree-loading" style="padding: 4px 8px; font-size: 12px; color: var(--text-muted);">空</div>';
    return;
  }

  for (const item of items) {
    const el = createTreeItem(item);
    containerEl.appendChild(el);
  }
}

// 打开文件进行编辑
async function openFile(filePath) {
  if (!ws || !isReady) {
    showNotice("无法打开文件", "未连接到服务器。", "error");
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.read",
    params: { path: filePath },
  });

  if (!res || !res.ok) {
    const msg = res && res.error ? res.error.message : "读取失败";
    showNotice("无法读取文件", msg, "error");
    return;
  }

  applyEditorSession({
    path: filePath,
    content: res.payload.content,
    readOnly: false,
    label: filePath,
  });

  // 刷新文件树以更新 active 状态
  loadFileTree();
}

async function openSourcePath(sourcePath, options = {}) {
  if (!ws || !isReady) {
    showNotice("无法打开来源文件", "未连接到服务器。", "error");
    return;
  }
  if (!sourcePath || typeof sourcePath !== "string") {
    showNotice("无法打开来源文件", "无效的来源路径。", "error");
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.readSource",
    params: { path: sourcePath },
  });

  if (!res || !res.ok) {
    const msg = res && res.error ? res.error.message : "读取失败";
    showNotice("无法打开来源文件", msg, "error", 4200);
    return;
  }

  applyEditorSession({
    path: res.payload.path || sourcePath,
    content: res.payload.content,
    readOnly: true,
    label: `${res.payload.path || sourcePath} (只读来源)`,
    startLine: options.startLine,
  });
  showNotice("来源文件已打开", "当前为只读视图，不会写回原文件。", "info", 2600);
}

async function readSourceFile(sourcePath) {
  if (!ws || !isReady) return null;
  if (!sourcePath || typeof sourcePath !== "string") return null;
  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.readSource",
    params: { path: sourcePath },
  });
  if (!res || !res.ok) return null;
  return {
    path: res.payload?.path || sourcePath,
    content: typeof res.payload?.content === "string" ? res.payload.content : "",
  };
}

// 保存文件
async function saveFile() {
  if (!ws || !isReady) {
    showNotice("无法保存", "未连接到服务器。", "error");
    return;
  }
  if (currentEditReadOnly) {
    showNotice("当前不可保存", "这是只读来源视图，不能直接写回。", "error");
    return;
  }

  if (!currentEditPath) {
    showNotice("无法保存", "没有正在编辑的文件。", "error");
    return;
  }

  const content = editorTextarea ? editorTextarea.value : "";

  if (saveEditBtn) {
    saveEditBtn.textContent = "保存中...";
    saveEditBtn.disabled = true;
  }

  const id = makeId();
  let res;

  // 如果是 .env 文件，使用 config.writeRaw
  if (currentEditPath === ".env") {
    res = await sendReq({
      type: "req",
      id,
      method: "config.writeRaw",
      params: { content },
    });
  } else {
    res = await sendReq({
      type: "req",
      id,
      method: "workspace.write",
      params: { path: currentEditPath, content },
    });
  }

  if (saveEditBtn) {
    saveEditBtn.disabled = false;
  }

  if (!res || !res.ok) {
    if (saveEditBtn) saveEditBtn.textContent = "保存";
    const msg = res && res.error ? res.error.message : "保存失败";
    showNotice("保存失败", msg, "error");
    return;
  }

  if (saveEditBtn) saveEditBtn.textContent = "已保存";
  showNotice("保存成功", `${currentEditPath} 已写入。`, "success", 1800);

  setTimeout(() => {
    if (saveEditBtn) saveEditBtn.textContent = "保存";
    switchMode("chat");
    currentEditPath = null;
    originalContent = null;
    resetEditorAccessState();
    loadFileTree();
  }, 500);
}

// 取消编辑
function cancelEdit() {
  if (originalContent !== null && editorTextarea) {
    const currentContent = editorTextarea.value;
    if (currentContent !== originalContent) {
      if (!confirm("放弃修改？")) {
        return;
      }
    }
  }

  switchMode("chat");
  currentEditPath = null;
  originalContent = null;
  resetEditorAccessState();
  loadFileTree();
}

// 切换模式
function switchMode(mode) {
  editorMode = mode === "editor";

  const canvasSection = document.getElementById("canvasSection");

  if (mode === "editor") {
    if (chatSection) chatSection.classList.add("hidden");
    if (editorSection) editorSection.classList.remove("hidden");
    if (canvasSection) canvasSection.classList.add("hidden");
    if (memoryViewerSection) memoryViewerSection.classList.add("hidden");
    if (goalsSection) goalsSection.classList.add("hidden");
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.remove("hidden");
  } else if (mode === "canvas") {
    if (chatSection) chatSection.classList.add("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (canvasSection) canvasSection.classList.remove("hidden");
    if (memoryViewerSection) memoryViewerSection.classList.add("hidden");
    if (goalsSection) goalsSection.classList.add("hidden");
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  } else if (mode === "memory") {
    if (chatSection) chatSection.classList.add("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (canvasSection) canvasSection.classList.add("hidden");
    if (memoryViewerSection) memoryViewerSection.classList.remove("hidden");
    if (goalsSection) goalsSection.classList.add("hidden");
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  } else if (mode === "goals") {
    if (chatSection) chatSection.classList.add("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (canvasSection) canvasSection.classList.add("hidden");
    if (memoryViewerSection) memoryViewerSection.classList.add("hidden");
    if (goalsSection) goalsSection.classList.remove("hidden");
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  } else {
    // chat (default)
    if (chatSection) chatSection.classList.remove("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (canvasSection) canvasSection.classList.add("hidden");
    if (memoryViewerSection) memoryViewerSection.classList.add("hidden");
    if (goalsSection) goalsSection.classList.add("hidden");
    if (composerSection) composerSection.classList.remove("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  }

  updateSidebarModeButtons();
  if (mode === "canvas") {
    renderCanvasGoalContext();
  }
}

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
  const match = /^goal:([^:]+)(?::node:([^:]+):run:([^:]+))?$/.exec(String(conversationId).trim());
  if (!match) return null;
  return {
    goalId: match[1] || "",
    nodeId: match[2] || "",
    runId: match[3] || "",
    conversationId: String(conversationId).trim(),
  };
}

function renderCanvasGoalContext() {
  if (!canvasContextBarEl) return;
  const boardId = normalizeGoalBoardId(window._canvasApp?.currentBoardId);
  const conversation = parseGoalConversationContext(activeConversationId);
  const mappedGoal = boardId
    ? (Array.isArray(goalsState.items)
      ? goalsState.items.find((goal) => normalizeGoalBoardId(goal?.boardId) === boardId) || null
      : null)
    : null;
  const goalId = conversation?.goalId || mappedGoal?.id || "";
  const goal = goalId ? getGoalById(goalId) || mappedGoal : mappedGoal;
  const goalName = goal?.title || goalId || "";
  const nodeId = conversation?.nodeId || (typeof goal?.activeNodeId === "string" ? goal.activeNodeId.trim() : "");
  const runId = conversation?.runId || (typeof goal?.lastRunId === "string" ? goal.lastRunId.trim() : "");
  const capabilityEntry = goalId ? getCachedGoalCapabilityEntry(goalId) : null;
  const capabilityPlans = Array.isArray(capabilityEntry?.plans) ? capabilityEntry.plans : [];
  const capabilityPlan = capabilityPlans.find((plan) => plan.nodeId === nodeId)
    || capabilityPlans.find((plan) => plan.nodeId === (typeof goal?.activeNodeId === "string" ? goal.activeNodeId.trim() : ""))
    || capabilityPlans[0]
    || null;
  window._canvasApp?.setGoalContext?.({
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
  }
  if (goalId) {
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
      const latestBoardId = normalizeGoalBoardId(window._canvasApp?.currentBoardId);
      const latestConversation = parseGoalConversationContext(activeConversationId);
      const latestGoalId = latestConversation?.goalId
        || (latestBoardId
          ? (Array.isArray(goalsState.items)
            ? (goalsState.items.find((item) => normalizeGoalBoardId(item?.boardId) === latestBoardId)?.id || "")
            : "")
          : "");
      if (latestGoalId === goalId) {
        renderCanvasGoalContext();
      }
    }).catch(() => {});
  }
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

function getTaskGoalId(task) {
  const goalId = task?.metadata?.goalId;
  return typeof goalId === "string" && goalId.trim() ? goalId.trim() : "";
}

function getGoalDisplayName(goalId) {
  if (!goalId) return "-";
  const goal = getGoalById(goalId);
  return goal?.title || goalId;
}

function syncMemoryTaskGoalFilterUi() {
  if (!memoryTaskGoalFilterBarEl || !memoryTaskGoalFilterLabelEl) return;
  const goalId = memoryViewerState.goalIdFilter;
  const visible = memoryViewerState.tab === "tasks" && Boolean(goalId);
  memoryTaskGoalFilterBarEl.classList.toggle("hidden", !visible);
  if (!visible) return;
  memoryTaskGoalFilterLabelEl.textContent = `当前仅查看长期任务：${getGoalDisplayName(goalId)} (${goalId})`;
}

async function clearMemoryTaskGoalFilter() {
  if (!memoryViewerState.goalIdFilter) return;
  memoryViewerState.goalIdFilter = null;
  syncMemoryTaskGoalFilterUi();
  if (memoryViewerState.tab === "tasks") {
    await loadMemoryViewer(true);
  }
}

async function openGoalTaskViewer(goalId) {
  if (!goalId) return;
  if (memoryViewerState.tab !== "tasks") {
    memoryViewerState.tab = "tasks";
    memoryViewerState.items = [];
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
  }
  memoryViewerState.goalIdFilter = goalId;
  memoryViewerState.selectedId = null;
  syncMemoryViewerUi();
  syncMemoryTaskGoalFilterUi();
  switchMode("memory");
  await loadMemoryViewer(true);
  showNotice("已切到任务视图", `当前仅展示 ${getGoalDisplayName(goalId)} 的关联 tasks。`, "info", 2200);
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

function getGoalCheckpointActionConfig(action) {
  const actionMap = {
    approve: {
      method: "goal.checkpoint.approve",
      modalTitle: "批准 Checkpoint",
      successTitle: "已批准 checkpoint",
      submitLabel: "批准",
      defaultSummary: "Approved",
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
      defaultSummary: "Rejected",
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
      defaultSummary: "Expired",
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
      defaultSummary: "Reopened",
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

function resetGoalCheckpointActionForm() {
  if (goalCheckpointActionTitleEl) goalCheckpointActionTitleEl.textContent = "处理 Checkpoint";
  if (goalCheckpointActionHintEl) {
    goalCheckpointActionHintEl.textContent = "在这里完成 checkpoint 审批或状态流转，避免使用临时 prompt 输入。";
  }
  if (goalCheckpointActionContextEl) goalCheckpointActionContextEl.innerHTML = "";
  if (goalCheckpointActionReviewerEl) goalCheckpointActionReviewerEl.value = "";
  if (goalCheckpointActionReviewerRoleEl) goalCheckpointActionReviewerRoleEl.value = "";
  if (goalCheckpointActionRequestedByEl) goalCheckpointActionRequestedByEl.value = "";
  if (goalCheckpointActionActorLabelEl) goalCheckpointActionActorLabelEl.textContent = "Approver";
  if (goalCheckpointActionActorEl) goalCheckpointActionActorEl.value = "";
  if (goalCheckpointActionSlaAtEl) goalCheckpointActionSlaAtEl.value = "";
  if (goalCheckpointActionSummaryEl) {
    goalCheckpointActionSummaryEl.value = "";
    goalCheckpointActionSummaryEl.placeholder = "例如：Approved / Rejected / Expired / Reopened";
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

function findTrackedGoalCheckpoint(goalId, checkpointId) {
  if (!goalId || !checkpointId) return null;
  return goalsState.trackingCheckpoints.find((item) => item.goalId === goalId && item.id === checkpointId) || null;
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

function getGoalCheckpointSlaBadge(checkpoint) {
  if (!checkpoint?.slaAt) return "";
  const deadline = new Date(checkpoint.slaAt);
  if (Number.isNaN(deadline.getTime())) {
    return `<span class="memory-badge">SLA ${escapeHtml(checkpoint.slaAt)}</span>`;
  }
  const overdue = deadline.getTime() < Date.now();
  return `<span class="memory-badge ${overdue ? "is-overdue" : ""}">${overdue ? "SLA 已超时" : "SLA"} ${escapeHtml(formatDateTime(checkpoint.slaAt))}</span>`;
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

function renderGoalsLoading(message) {
  if (goalsListEl) {
    goalsListEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }
  if (goalsDetailEl) {
    goalsDetailEl.innerHTML = `<div class="memory-viewer-empty">选择左侧长期任务查看详情。</div>`;
  }
}

function renderGoalsSummary(items) {
  if (!goalsSummaryEl) return;
  const goals = Array.isArray(items) ? items : [];
  const executingCount = goals.filter((goal) => goal?.status === "executing").length;
  const pausedCount = goals.filter((goal) => goal?.status === "paused").length;
  const customRootCount = goals.filter((goal) => goal?.pathSource === "user-configured").length;
  goalsSummaryEl.innerHTML = `
    <div class="memory-stat-card"><span class="memory-stat-label">长期任务</span><strong class="memory-stat-value">${escapeHtml(String(goals.length))}</strong></div>
    <div class="memory-stat-card"><span class="memory-stat-label">执行中</span><strong class="memory-stat-value">${escapeHtml(String(executingCount))}</strong></div>
    <div class="memory-stat-card"><span class="memory-stat-label">已暂停</span><strong class="memory-stat-value">${escapeHtml(String(pausedCount))}</strong></div>
    <div class="memory-stat-card"><span class="memory-stat-label">自定义 Root</span><strong class="memory-stat-value">${escapeHtml(String(customRootCount))}</strong></div>
  `;
}

function renderGoalsEmpty(message) {
  renderGoalsSummary([]);
  if (goalsListEl) {
    goalsListEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }
  if (goalsDetailEl) {
    goalsDetailEl.innerHTML = `<div class="memory-viewer-empty">新建一个长期任务后，这里会显示 NORTHSTAR.md、路径和执行状态。</div>`;
  }
}

function renderGoalList(items) {
  if (!goalsListEl) return;
  if (!Array.isArray(items) || items.length === 0) {
    goalsListEl.innerHTML = `<div class="memory-viewer-empty">当前还没有长期任务。</div>`;
    return;
  }
  goalsListEl.innerHTML = items.map((goal) => {
    const isActive = goal.id === goalsState.selectedId;
    const isCurrentConversation = isConversationForGoal(activeConversationId, goal.id);
    const objective = goal.objective ? String(goal.objective).trim() : "";
    return `
      <div class="memory-list-item goal-list-item${isActive ? " active" : ""}" data-goal-id="${escapeHtml(goal.id)}">
        <div class="goal-list-item-head">
          <div class="memory-list-item-title">${escapeHtml(goal.title || goal.id)}</div>
          ${isCurrentConversation ? '<span class="memory-badge memory-badge-shared">current</span>' : ""}
        </div>
        <div class="memory-list-item-meta">
          <span>${escapeHtml(formatGoalStatus(goal.status))}</span>
          <span>${escapeHtml(goal.currentPhase || "-")}</span>
          <span>${escapeHtml(formatDateTime(goal.updatedAt || goal.createdAt))}</span>
        </div>
        <div class="memory-list-item-snippet">${escapeHtml(objective || "未填写 objective，可进入 NORTHSTAR.md 补充目标说明。")}</div>
        <div class="goal-list-item-meta">
          <span>${escapeHtml(summarizeSourcePath(goal.goalRoot || "-"))}</span>
          <span>${escapeHtml(formatGoalPathSource(goal.pathSource))}</span>
        </div>
        <div class="goal-list-item-actions">
          <button class="button goal-inline-action" data-goal-resume="${escapeHtml(goal.id)}">恢复</button>
          <button class="button goal-inline-action goal-inline-action-secondary" data-goal-pause="${escapeHtml(goal.id)}">暂停</button>
        </div>
      </div>
    `;
  }).join("");

  goalsListEl.querySelectorAll("[data-goal-id]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-id");
      if (!goalId) return;
      goalsState.selectedId = goalId;
      renderGoalList(goalsState.items);
      renderGoalDetail(getGoalById(goalId));
    });
  });
  goalsListEl.querySelectorAll("[data-goal-resume]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      const goalId = node.getAttribute("data-goal-resume");
      if (!goalId) return;
      void resumeGoal(goalId);
    });
  });
  goalsListEl.querySelectorAll("[data-goal-pause]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      const goalId = node.getAttribute("data-goal-pause");
      if (!goalId) return;
      void pauseGoal(goalId);
    });
  });
}

function bindGoalDetailActions(goal) {
  if (!goalsDetailEl || !goal) return;
  goalsDetailEl.querySelectorAll("[data-goal-resume-detail]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-resume-detail");
      if (!goalId) return;
      void resumeGoal(goalId);
    });
  });
  goalsDetailEl.querySelectorAll("[data-goal-pause-detail]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-pause-detail");
      if (!goalId) return;
      void pauseGoal(goalId);
    });
  });
  goalsDetailEl.querySelectorAll("[data-open-source]").forEach((node) => {
    node.addEventListener("click", () => {
      const sourcePath = node.getAttribute("data-open-source");
      if (!sourcePath) return;
      void openSourcePath(sourcePath);
    });
  });
  goalsDetailEl.querySelectorAll("[data-open-goal-tasks]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-open-goal-tasks");
      if (!goalId) return;
      void openGoalTaskViewer(goalId);
    });
  });
  goalsDetailEl.querySelectorAll("[data-goal-resume-last-node]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-goal-resume-last-node");
      if (!goalId) return;
      const lastNodeId = node.getAttribute("data-goal-last-node-id");
      void resumeGoal(goalId, { nodeId: lastNodeId || undefined });
    });
  });
  goalsDetailEl.querySelectorAll("[data-open-goal-board]").forEach((node) => {
    node.addEventListener("click", () => {
      const boardId = node.getAttribute("data-open-goal-board");
      void openGoalCanvasBoard(boardId, goal.id);
    });
  });
  goalsDetailEl.querySelectorAll("[data-open-goal-board-list]").forEach((node) => {
    node.addEventListener("click", () => {
      const goalId = node.getAttribute("data-open-goal-board-list") || goal.id;
      void openGoalCanvasList(goalId);
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
      void generateGoalHandoff(goalId);
    });
  });
}

async function runGoalCheckpointAction(goalId, nodeId, checkpointId, action) {
  if (!ws || !isReady) {
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
  if (!pendingGoalCheckpointAction) return;
  if (!ws || !isReady) {
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

function buildGoalRuntimeSummaryCard(goal, options) {
  const {
    activeNodeId,
    lastNodeId,
    lastRunId,
    isCurrentConversation,
  } = options;
  const currentChannel = goal.activeConversationId || goalBaseConversationId(goal.id);
  return `
    <div class="memory-detail-card goal-summary-card">
      <div class="goal-summary-header">
        <div>
          <div class="goal-summary-title">运行摘要</div>
          <div class="goal-summary-text">当前 goal channel、最近节点与运行记录一览。</div>
        </div>
        ${isCurrentConversation ? '<span class="memory-badge memory-badge-shared">当前正在此通道</span>' : '<span class="memory-badge">可恢复</span>'}
      </div>
      <div class="goal-summary-grid">
        <div class="goal-summary-item">
          <span class="goal-summary-label">状态</span>
          <strong class="goal-summary-value">${escapeHtml(formatGoalStatus(goal.status))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">当前节点</span>
          <strong class="goal-summary-value">${escapeHtml(activeNodeId || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">上次节点</span>
          <strong class="goal-summary-value">${escapeHtml(lastNodeId || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">上次 Run</span>
          <strong class="goal-summary-value">${escapeHtml(lastRunId || "-")}</strong>
        </div>
      </div>
      <div class="memory-detail-pre">${escapeHtml(currentChannel)}</div>
    </div>
  `;
}

function buildGoalRecoveryCard(goal, options) {
  const {
    activeNodeId,
    lastNodeId,
    isCurrentConversation,
  } = options;
  let title = "恢复建议";
  let text = "可以直接进入该长期任务的基础 goal channel。";
  let actions = `
    <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
  `;

  if (goal.status === "executing" && isCurrentConversation) {
    title = "建议继续当前通道";
    text = "你已经位于该长期任务的执行通道中，优先继续当前上下文，避免重复恢复。";
    actions = `
      <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">刷新并继续当前通道</button>
      <button class="button" data-open-goal-tasks="${escapeHtml(goal.id)}">查看关联 Tasks</button>
    `;
  } else if (goal.status === "executing" && activeNodeId) {
    title = "建议恢复当前执行节点";
    text = `该长期任务目前记录的活动节点是 ${activeNodeId}，优先回到这个节点继续执行。`;
    actions = `
      <button class="button" data-goal-resume-last-node="${escapeHtml(goal.id)}" data-goal-last-node-id="${escapeHtml(activeNodeId)}">恢复当前节点</button>
      <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
    `;
  } else if (lastNodeId) {
    title = "建议按上次节点恢复";
    text = `检测到最近一次活跃节点为 ${lastNodeId}，优先按该节点恢复，比直接回基础通道更连续。`;
    actions = `
      <button class="button" data-goal-resume-last-node="${escapeHtml(goal.id)}" data-goal-last-node-id="${escapeHtml(lastNodeId)}">按上次节点恢复</button>
      <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
    `;
  } else if (goal.status === "planning" || goal.status === "aligning" || goal.status === "ready") {
    title = "建议先进入基础通道";
    text = "当前还没有可恢复的节点历史，建议先进入基础 goal channel，继续拆解方案与任务。";
    actions = `
      <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
      <button class="button" data-open-source="${escapeHtml(goal.northstarPath)}">打开 NORTHSTAR.md</button>
    `;
  }

  return `
    <div class="memory-detail-card goal-recovery-card">
      <div class="goal-summary-header">
        <div>
          <div class="goal-summary-title">${escapeHtml(title)}</div>
          <div class="goal-summary-text">${escapeHtml(text)}</div>
        </div>
      </div>
      <div class="goal-detail-actions">
        ${actions}
      </div>
    </div>
  `;
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
    return {
      id: String(id),
      title: String(title),
      status,
      phase: phase ? String(phase) : "",
      owner: owner ? String(owner) : "",
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

function parseGoalCapabilityPlans(rawPlans) {
  if (!rawPlans || typeof rawPlans !== "object") return [];
  const items = Array.isArray(rawPlans.items) ? rawPlans.items : [];
  return items
    .map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      const checkpoint = data.checkpoint && typeof data.checkpoint === "object" ? data.checkpoint : {};
      const actualUsage = data.actualUsage && typeof data.actualUsage === "object" ? data.actualUsage : {};
      const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {};
      const methods = Array.isArray(data.methods) ? data.methods : [];
      const skills = Array.isArray(data.skills) ? data.skills : [];
      const mcpServers = Array.isArray(data.mcpServers) ? data.mcpServers : [];
      const subAgents = Array.isArray(data.subAgents) ? data.subAgents : [];
      const deviations = Array.isArray(analysis.deviations) ? analysis.deviations : [];
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
            objective: entry.objective ? String(entry.objective) : "",
            reason: entry.reason ? String(entry.reason) : "",
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
      };
    })
    .sort((a, b) => {
      const left = new Date(b.updatedAt || b.generatedAt || 0).getTime();
      const right = new Date(a.updatedAt || a.generatedAt || 0).getTime();
      return left - right;
    });
}

function formatCapabilityMode(mode) {
  return mode === "multi_agent" ? "Multi Agent" : "Single Agent";
}

function formatCapabilityRisk(level) {
  if (level === "high") return "High Risk";
  if (level === "medium") return "Medium Risk";
  return "Low Risk";
}

function renderCapabilityTagList(items, emptyText) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="memory-viewer-empty">${escapeHtml(emptyText)}</div>`;
  }
  return `
    <div class="goal-capability-tag-list">
      ${items.map((item) => `<span class="memory-badge">${escapeHtml(item)}</span>`).join("")}
    </div>
  `;
}

function renderGoalCapabilityPanelLoading() {
  const panel = goalsDetailEl?.querySelector("#goalCapabilityPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">正在读取 capability-plans.json …</div>`;
}

function renderGoalCapabilityPanelError(message) {
  const panel = goalsDetailEl?.querySelector("#goalCapabilityPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

function renderGoalCapabilityPanel(goal, payload) {
  const panel = goalsDetailEl?.querySelector("#goalCapabilityPanel");
  if (!panel) return;
  const plans = Array.isArray(payload?.plans) ? payload.plans : [];
  const nodeMap = payload?.nodeMap && typeof payload.nodeMap === "object" ? payload.nodeMap : {};
  const planCount = plans.length;
  const orchestratedCount = plans.filter((plan) => plan.status === "orchestrated").length;
  const highRiskCount = plans.filter((plan) => plan.riskLevel === "high").length;
  const driftCount = plans.filter((plan) => plan.analysis?.status === "partial" || plan.analysis?.status === "diverged").length;
  const actualMethodCount = new Set(plans.flatMap((plan) => plan.actualUsage.methods)).size;
  const actualSkillCount = new Set(plans.flatMap((plan) => plan.actualUsage.skills)).size;
  const actualMcpCount = new Set(plans.flatMap((plan) => plan.actualUsage.mcpServers)).size;
  const preferredNodeIds = [goal?.activeNodeId, goal?.lastNodeId]
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  const focusPlan = preferredNodeIds.map((nodeId) => plans.find((plan) => plan.nodeId === nodeId)).find(Boolean) || plans[0] || null;
  const recentPlans = plans.slice(0, 6);

  if (!planCount) {
    panel.innerHTML = `
      <div class="memory-viewer-empty">
        capability-plans.json 中还没有计划记录。可先在 goal channel 中执行
        <code>goal_capability_plan</code> / <code>goal_orchestrate</code>。
      </div>
    `;
    return;
  }

  const focusNodeTitle = focusPlan?.nodeId ? (nodeMap[focusPlan.nodeId] || focusPlan.nodeId) : "当前节点";
  panel.innerHTML = `
    <div class="goal-capability-stats">
      <div class="goal-summary-item">
        <span class="goal-summary-label">Plan 总数</span>
        <strong class="goal-summary-value">${escapeHtml(String(planCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">已编排</span>
        <strong class="goal-summary-value">${escapeHtml(String(orchestratedCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">高风险</span>
        <strong class="goal-summary-value">${escapeHtml(String(highRiskCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">偏差计划</span>
        <strong class="goal-summary-value">${escapeHtml(String(driftCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">实际 Methods</span>
        <strong class="goal-summary-value">${escapeHtml(String(actualMethodCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">实际 Skills</span>
        <strong class="goal-summary-value">${escapeHtml(String(actualSkillCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">实际 MCP</span>
        <strong class="goal-summary-value">${escapeHtml(String(actualMcpCount))}</strong>
      </div>
    </div>

    ${focusPlan ? `
      <div class="goal-capability-focus">
        <div class="goal-tracking-item-head">
          <div>
            <div class="goal-summary-title">当前重点 Plan</div>
            <div class="goal-summary-text">${escapeHtml(focusNodeTitle)} · ${escapeHtml(focusPlan.nodeId || focusPlan.id)}</div>
          </div>
          <div class="goal-checkpoint-meta">
            <span class="memory-badge ${focusPlan.status === "orchestrated" ? "memory-badge-shared" : ""}">${escapeHtml(focusPlan.status)}</span>
            <span class="memory-badge">${escapeHtml(formatCapabilityMode(focusPlan.executionMode))}</span>
            <span class="memory-badge ${focusPlan.riskLevel === "high" ? "is-overdue" : ""}">${escapeHtml(formatCapabilityRisk(focusPlan.riskLevel))}</span>
            <span class="memory-badge ${focusPlan.analysis?.status === "diverged" ? "is-overdue" : focusPlan.analysis?.status === "aligned" ? "memory-badge-shared" : ""}">${escapeHtml(focusPlan.analysis?.status || "pending")}</span>
          </div>
        </div>
        ${focusPlan.summary ? `<div class="memory-list-item-snippet">${escapeHtml(focusPlan.summary)}</div>` : ""}
        ${focusPlan.objective ? `<div class="memory-list-item-snippet">${escapeHtml(focusPlan.objective)}</div>` : ""}
        ${focusPlan.analysis?.summary ? `<div class="memory-list-item-snippet">${escapeHtml(focusPlan.analysis.summary)}</div>` : ""}
        <div class="memory-list-item-meta">
          <span>${escapeHtml(focusPlan.id)}</span>
          ${focusPlan.runId ? `<span>${escapeHtml(focusPlan.runId)}</span>` : ""}
          <span>${escapeHtml(formatDateTime(focusPlan.updatedAt || focusPlan.generatedAt))}</span>
          ${focusPlan.orchestratedAt ? `<span>orchestrated ${escapeHtml(formatDateTime(focusPlan.orchestratedAt))}</span>` : ""}
        </div>

        <div class="goal-capability-columns">
          <div class="goal-capability-column">
            <div class="goal-summary-label">Plan 能力编排</div>
            ${renderCapabilityTagList(
              [
                ...focusPlan.methods.map((item) => item.title || item.file),
                ...focusPlan.skills.map((item) => item.name),
                ...focusPlan.mcpServers.map((item) => item.serverId),
                ...focusPlan.subAgents.map((item) => `${item.agentId}: ${item.objective}`),
              ],
              "当前 plan 还没有明确列出 methods / skills / MCP / sub-agent。",
            )}
          </div>
          <div class="goal-capability-column">
            <div class="goal-summary-label">Actual Usage</div>
            ${renderCapabilityTagList(
              [
                ...focusPlan.actualUsage.methods.map((item) => `method:${item}`),
                ...focusPlan.actualUsage.skills.map((item) => `skill:${item}`),
                ...focusPlan.actualUsage.mcpServers.map((item) => `mcp:${item}`),
              ],
              "当前还没有采集到实际 usage。",
            )}
            ${focusPlan.actualUsage.toolNames.length ? `
              <div class="goal-capability-tool-list">
                ${focusPlan.actualUsage.toolNames.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}
              </div>
            ` : ""}
            ${focusPlan.actualUsage.updatedAt ? `
              <div class="memory-list-item-meta">
                <span>usage updated</span>
                <span>${escapeHtml(formatDateTime(focusPlan.actualUsage.updatedAt))}</span>
              </div>
            ` : ""}
          </div>
        </div>

        <div class="goal-capability-columns">
          <div class="goal-capability-column">
            <div class="goal-summary-label">Reasoning / Query Hints</div>
            ${renderCapabilityTagList(
              [...focusPlan.reasoning, ...focusPlan.queryHints.map((item) => `hint:${item}`)],
              "当前 plan 没有额外 reasoning / query hints。",
            )}
          </div>
          <div class="goal-capability-column">
            <div class="goal-summary-label">Risk / Checkpoint / Gaps</div>
            ${renderCapabilityTagList(
              [
                focusPlan.checkpoint.required ? "checkpoint:required" : "checkpoint:optional",
                `mode:${focusPlan.checkpoint.approvalMode || "none"}`,
                ...focusPlan.checkpoint.requiredRequestFields.map((item) => `request:${item}`),
                ...focusPlan.checkpoint.requiredDecisionFields.map((item) => `decision:${item}`),
                focusPlan.checkpoint.suggestedReviewer ? `reviewer:${focusPlan.checkpoint.suggestedReviewer}` : "",
                focusPlan.checkpoint.suggestedReviewerRole ? `role:${focusPlan.checkpoint.suggestedReviewerRole}` : "",
                focusPlan.checkpoint.suggestedSlaHours ? `sla:${focusPlan.checkpoint.suggestedSlaHours}h` : "",
                focusPlan.checkpoint.escalationMode && focusPlan.checkpoint.escalationMode !== "none" ? `escalation:${focusPlan.checkpoint.escalationMode}` : "",
                ...focusPlan.checkpoint.reasons,
                ...focusPlan.gaps.map((item) => `gap:${item}`),
              ],
              "当前 plan 没有额外风险说明或能力缺口。",
            )}
          </div>
        </div>

        <div class="goal-capability-columns">
          <div class="goal-capability-column">
            <div class="goal-summary-label">Deviation Analysis</div>
            ${renderCapabilityTagList(
              (focusPlan.analysis?.deviations || []).map((item) => `${item.area}:${item.summary}`),
              "当前没有检测到明显偏差。",
            )}
          </div>
          <div class="goal-capability-column">
            <div class="goal-summary-label">Suggestions</div>
            ${renderCapabilityTagList(
              focusPlan.analysis?.recommendations || [],
              "当前没有额外补建议。",
            )}
          </div>
        </div>
      </div>
    ` : ""}

    <div class="goal-tracking-column">
      <div class="goal-summary-title">最近 Capability Plans</div>
      <div class="goal-tracking-list">
        ${recentPlans.map((plan) => {
          const nodeTitle = plan.nodeId ? (nodeMap[plan.nodeId] || plan.nodeId) : plan.id;
          return `
            <div class="goal-tracking-item">
              <div class="goal-tracking-item-head">
                <span class="goal-tracking-item-title">${escapeHtml(nodeTitle)}</span>
                <div class="goal-checkpoint-meta">
                  <span class="memory-badge ${plan.status === "orchestrated" ? "memory-badge-shared" : ""}">${escapeHtml(plan.status)}</span>
                  <span class="memory-badge">${escapeHtml(plan.executionMode)}</span>
                  <span class="memory-badge ${plan.riskLevel === "high" ? "is-overdue" : ""}">${escapeHtml(plan.riskLevel)}</span>
                </div>
              </div>
              ${plan.summary ? `<div class="memory-list-item-snippet">${escapeHtml(plan.summary)}</div>` : ""}
              <div class="memory-list-item-meta">
                <span>${escapeHtml(plan.id)}</span>
                ${plan.nodeId ? `<span>${escapeHtml(plan.nodeId)}</span>` : ""}
                <span>${escapeHtml(formatDateTime(plan.updatedAt || plan.generatedAt))}</span>
              </div>
              <div class="goal-checkpoint-meta">
                <span class="memory-badge">plan m=${escapeHtml(String(plan.methods.length))}</span>
                <span class="memory-badge">s=${escapeHtml(String(plan.skills.length))}</span>
                <span class="memory-badge">mcp=${escapeHtml(String(plan.mcpServers.length))}</span>
                <span class="memory-badge">actual=${escapeHtml(String(
                  plan.actualUsage.methods.length + plan.actualUsage.skills.length + plan.actualUsage.mcpServers.length,
                ))}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
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
  const panel = goalsDetailEl?.querySelector("#goalCanvasPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">正在读取 board-ref.json …</div>`;
}

function renderGoalCanvasPanel(goal, payload) {
  const panel = goalsDetailEl?.querySelector("#goalCanvasPanel");
  if (!panel || !goal) return;

  const registryBoardId = normalizeGoalBoardId(goal.boardId);
  const runtimeBoardId = normalizeGoalBoardId(payload?.runtimeBoardId);
  const effectiveBoardId = runtimeBoardId || registryBoardId;
  const hasMismatch = Boolean(runtimeBoardId && registryBoardId && runtimeBoardId !== registryBoardId);
  const linkedAt = payload?.linkedAt || payload?.updatedAt || "";
  const boardRefPath = goalRuntimeFilePath(goal, "board-ref.json");
  const source = runtimeBoardId ? "runtime board-ref" : registryBoardId ? "goal registry" : "-";

  let statusLabel = "未绑定";
  let statusClass = "memory-badge";
  let hint = "当前还没有检测到 Canvas 主板绑定，可先进入画布列表查看或新建。";

  if (effectiveBoardId && hasMismatch) {
    statusLabel = "绑定存在差异";
    statusClass = "memory-badge";
    hint = `运行态 board-ref (${runtimeBoardId}) 与注册表默认主板 (${registryBoardId}) 不一致，当前优先按运行态绑定打开。`;
  } else if (effectiveBoardId && runtimeBoardId) {
    statusLabel = "已绑定";
    statusClass = "memory-badge memory-badge-shared";
    hint = "已检测到运行态 Canvas 绑定，可直接从长期任务详情跳转到关联画布。";
  } else if (effectiveBoardId) {
    statusLabel = "待确认";
    statusClass = "memory-badge";
    hint = "当前仅检测到注册表中的默认主板声明；若打开失败，可先进入画布列表创建或校正绑定。";
  } else if (payload?.readError) {
    hint = "无法读取 board-ref.json；若使用了自定义路径，请确认该路径已加入可操作区。";
  }

  panel.innerHTML = `
    <div class="goal-summary-header">
      <div>
        <div class="goal-summary-title">Canvas 联动</div>
        <div class="goal-summary-text">${escapeHtml(hint)}</div>
      </div>
      <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
    </div>
    <div class="goal-summary-grid">
      <div class="goal-summary-item">
        <span class="goal-summary-label">当前主板</span>
        <strong class="goal-summary-value">${escapeHtml(effectiveBoardId || "-")}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">来源</span>
        <strong class="goal-summary-value">${escapeHtml(source)}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">runtime board-ref</span>
        <strong class="goal-summary-value">${escapeHtml(runtimeBoardId || "-")}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">registry boardId</span>
        <strong class="goal-summary-value">${escapeHtml(registryBoardId || "-")}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">最近绑定时间</span>
        <strong class="goal-summary-value">${escapeHtml(formatDateTime(linkedAt))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">board-ref 路径</span>
        <strong class="goal-summary-value">${escapeHtml(boardRefPath || "-")}</strong>
      </div>
    </div>
    <div class="goal-detail-actions">
      <button class="button" data-open-goal-board="${escapeHtml(effectiveBoardId)}" ${effectiveBoardId ? "" : "disabled"}>打开关联画布</button>
      <button class="button goal-inline-action-secondary" data-open-goal-board-list="${escapeHtml(goal.id)}">查看画布列表</button>
      <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(boardRefPath)}">打开 board-ref.json</button>
    </div>
  `;
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
  if (!window._canvasApp) {
    showNotice("Canvas 不可用", "前端 Canvas 组件尚未初始化。", "error");
    return;
  }
  switchMode("canvas");
  await window._canvasApp.showBoardList();
  if (goalId) {
    showNotice("已切到画布列表", `可从画布列表继续处理 ${getGoalDisplayName(goalId)} 的主板。`, "info", 2200);
  }
}

async function openGoalCanvasBoard(boardId, goalId) {
  if (!window._canvasApp) {
    showNotice("Canvas 不可用", "前端 Canvas 组件尚未初始化。", "error");
    return;
  }
  const normalizedBoardId = normalizeGoalBoardId(boardId);
  if (!normalizedBoardId) {
    await openGoalCanvasList(goalId);
    return;
  }

  switchMode("canvas");
  await window._canvasApp.openBoard(normalizedBoardId);

  if (window._canvasApp.currentBoardId === normalizedBoardId && window._canvasApp.manager?.board) {
    window._canvasApp._showCanvasView?.();
    return;
  }

  await window._canvasApp.showBoardList();
  showNotice("未找到关联画布", `未能打开 ${normalizedBoardId}，已切换到画布列表。`, "error", 3200);
}

function renderGoalTrackingPanelLoading() {
  const panel = goalsDetailEl?.querySelector("#goalTrackingPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">正在读取 tasks.json / checkpoints.json …</div>`;
}

function renderGoalTrackingPanel(goal, payload) {
  const panel = goalsDetailEl?.querySelector("#goalTrackingPanel");
  if (!panel) return;
  const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  const checkpoints = Array.isArray(payload?.checkpoints) ? payload.checkpoints : [];
  const completedNodeCount = nodes.filter((node) => node.status === "completed").length;
  const runningNodeCount = nodes.filter((node) => node.status === "running").length;
  const blockedNodeCount = nodes.filter((node) => node.status === "blocked").length;
  const waitingCheckpointCount = checkpoints.filter((item) => item.status === "waiting_user" || item.status === "required").length;
  const approvedCheckpointCount = checkpoints.filter((item) => item.status === "approved").length;
  const rejectedCheckpointCount = checkpoints.filter((item) => item.status === "rejected").length;
  const recentNodes = nodes.slice(0, 6);
  const recentCheckpoints = checkpoints
    .slice()
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
    .slice(0, 6);

  panel.innerHTML = `
    <div class="goal-tracking-stats">
      <div class="goal-summary-item">
        <span class="goal-summary-label">节点总数</span>
        <strong class="goal-summary-value">${escapeHtml(String(nodes.length))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">已完成</span>
        <strong class="goal-summary-value">${escapeHtml(String(completedNodeCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">进行中</span>
        <strong class="goal-summary-value">${escapeHtml(String(runningNodeCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">阻塞</span>
        <strong class="goal-summary-value">${escapeHtml(String(blockedNodeCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">Checkpoint</span>
        <strong class="goal-summary-value">${escapeHtml(String(checkpoints.length))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">待处理</span>
        <strong class="goal-summary-value">${escapeHtml(String(waitingCheckpointCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">已批准</span>
        <strong class="goal-summary-value">${escapeHtml(String(approvedCheckpointCount))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">已拒绝</span>
        <strong class="goal-summary-value">${escapeHtml(String(rejectedCheckpointCount))}</strong>
      </div>
    </div>

    <div class="goal-tracking-columns">
      <div class="goal-tracking-column">
        <div class="goal-summary-title">最近节点</div>
        ${recentNodes.length ? `
          <div class="goal-tracking-list">
            ${recentNodes.map((node) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(node.title)}</span>
                  <span class="memory-badge ${node.status === "completed" ? "memory-badge-shared" : ""}">${escapeHtml(node.status)}</span>
                </div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(node.id)}</span>
                  ${node.phase ? `<span>${escapeHtml(node.phase)}</span>` : ""}
                  ${node.owner ? `<span>${escapeHtml(node.owner)}</span>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">tasks.json 中还没有节点。</div>`}
      </div>
      <div class="goal-tracking-column">
        <div class="goal-summary-title">最近 Checkpoint</div>
        ${recentCheckpoints.length ? `
          <div class="goal-tracking-list">
            ${recentCheckpoints.map((item) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                  <span class="memory-badge ${item.status === "approved" ? "memory-badge-shared" : ""}">${escapeHtml(item.status)}</span>
                </div>
                <div class="memory-list-item-snippet">${escapeHtml(item.summary || item.note || "暂无摘要")}</div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(item.id)}</span>
                  ${item.nodeId ? `<span>${escapeHtml(item.nodeId)}</span>` : ""}
                  <span>${escapeHtml(formatDateTime(item.updatedAt))}</span>
                </div>
                <div class="goal-checkpoint-meta">
                  ${item.reviewer ? `<span class="memory-badge">Reviewer ${escapeHtml(item.reviewer)}</span>` : ""}
                  ${item.reviewerRole ? `<span class="memory-badge">${escapeHtml(item.reviewerRole)}</span>` : ""}
                  ${item.requestedBy ? `<span class="memory-badge">发起 ${escapeHtml(item.requestedBy)}</span>` : ""}
                  ${item.decidedBy ? `<span class="memory-badge">审批 ${escapeHtml(item.decidedBy)}</span>` : ""}
                  ${getGoalCheckpointSlaBadge(item)}
                </div>
                <div class="goal-detail-actions goal-checkpoint-actions">
                  ${["waiting_user", "required"].includes(item.status) ? `
                    <button class="button goal-inline-action" data-goal-checkpoint-action="approve" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">批准</button>
                    <button class="button goal-inline-action-secondary" data-goal-checkpoint-action="reject" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">拒绝</button>
                    <button class="button goal-inline-action-secondary" data-goal-checkpoint-action="expire" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">过期</button>
                  ` : ""}
                  ${["rejected", "expired"].includes(item.status) ? `
                    <button class="button goal-inline-action" data-goal-checkpoint-action="reopen" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">重新打开</button>
                  ` : ""}
                </div>
                ${item.history.length ? `
                  <div class="goal-checkpoint-history">
                    ${item.history.slice().reverse().slice(0, 4).map((history) => `
                      <div class="goal-checkpoint-history-item">
                        <span class="memory-badge">${escapeHtml(history.action)}</span>
                        <span>${escapeHtml(formatDateTime(history.at))}</span>
                        ${history.actor ? `<span>${escapeHtml(history.actor)}</span>` : ""}
                        ${history.note ? `<span>${escapeHtml(history.note)}</span>` : ""}
                      </div>
                    `).join("")}
                  </div>
                ` : ""}
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">checkpoints.json 中还没有 checkpoint。</div>`}
      </div>
    </div>
  `;
}

function renderGoalTrackingPanelError(message) {
  const panel = goalsDetailEl?.querySelector("#goalTrackingPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

async function loadGoalTrackingData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = goalsState.trackingSeq + 1;
  goalsState.trackingSeq = seq;
  renderGoalTrackingPanelLoading();

  const [tasksFile, checkpointsFile] = await Promise.all([
    readSourceFile(goal.tasksPath),
    readSourceFile(goalRuntimeFilePath(goal, "checkpoints.json")),
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
  });
}

function renderGoalProgressPanelLoading() {
  const panel = goalsDetailEl?.querySelector("#goalProgressPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">正在读取 progress.md …</div>`;
}

function renderGoalProgressPanel(entries) {
  const panel = goalsDetailEl?.querySelector("#goalProgressPanel");
  if (!panel) return;
  const recentEntries = Array.isArray(entries) ? entries.slice().reverse().slice(0, 18) : [];
  if (!recentEntries.length) {
    panel.innerHTML = `<div class="memory-viewer-empty">progress.md 中还没有时间线记录。</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="goal-progress-timeline">
      ${recentEntries.map((entry) => `
        <div class="goal-progress-item">
          <div class="goal-progress-item-head">
            <span class="goal-tracking-item-title">${escapeHtml(entry.title || entry.event || "timeline")}</span>
            <span class="memory-badge">${escapeHtml(entry.event || "-")}</span>
          </div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(formatDateTime(entry.at))}</span>
            ${entry.nodeId ? `<span>${escapeHtml(entry.nodeId)}</span>` : ""}
            ${entry.status ? `<span>${escapeHtml(entry.status)}</span>` : ""}
            ${entry.checkpointId ? `<span>${escapeHtml(entry.checkpointId)}</span>` : ""}
          </div>
          ${entry.summary ? `<div class="memory-list-item-snippet">${escapeHtml(entry.summary)}</div>` : ""}
          ${entry.note ? `<div class="memory-list-item-snippet">${escapeHtml(entry.note)}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
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

function parseGoalHandoffKeyValueSection(rawContent) {
  const data = {};
  if (typeof rawContent !== "string") return data;
  rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = /^-\s+([^:]+):\s*(.*)$/.exec(line);
      if (!match) return;
      data[match[1].trim().toLowerCase()] = match[2].trim();
    });
  return data;
}

function parseGoalHandoffListSection(rawContent) {
  if (typeof rawContent !== "string") return [];
  return rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .filter((line) => line !== "(none)");
}

function parseGoalHandoffDocument(rawContent) {
  if (typeof rawContent !== "string" || !rawContent.trim()) return null;
  const sections = rawContent.split(/^##\s+/m).filter(Boolean);
  if (!sections.length) return null;
  const parsed = {};
  for (const section of sections) {
    const newlineIndex = section.indexOf("\n");
    const title = (newlineIndex >= 0 ? section.slice(0, newlineIndex) : section).trim().toLowerCase();
    const body = newlineIndex >= 0 ? section.slice(newlineIndex + 1).trim() : "";
    parsed[title] = body;
  }
  const meta = parseGoalHandoffKeyValueSection(parsed["meta"] || "");
  const tracking = parseGoalHandoffKeyValueSection(parsed["tracking"] || "");
  const focus = parseGoalHandoffKeyValueSection(parsed["focus capability"] || "");
  const summary = typeof parsed["summary"] === "string" ? parsed["summary"].trim() : "";
  const nextAction = typeof parsed["next action"] === "string" ? parsed["next action"].trim() : "";
  return {
    generatedAt: meta["generated at"] || "",
    goalStatus: meta["goal status"] || "",
    currentPhase: meta["current phase"] || "",
    resumeMode: meta["resume mode"] || "",
    resumeNode: meta["resume node"] || "",
    activeNode: meta["active node"] || "",
    lastNode: meta["last node"] || "",
    lastRun: meta["last run"] || "",
    summary,
    nextAction,
    focusPlan: focus["plan"] || "",
    focusSummary: focus["summary"] || "",
    tracking: {
      totalNodes: tracking["total nodes"] || "0",
      completedNodes: tracking["completed nodes"] || "0",
      inProgressNodes: tracking["in progress nodes"] || "0",
      blockedNodes: tracking["blocked nodes"] || "0",
      openCheckpoints: tracking["open checkpoints"] || "0",
    },
    openCheckpoints: parseGoalHandoffListSection(parsed["open checkpoints"] || ""),
    blockers: parseGoalHandoffListSection(parsed["blockers"] || ""),
    recentTimeline: parseGoalHandoffListSection(parsed["recent timeline"] || ""),
  };
}

function renderGoalHandoffPanelLoading() {
  const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">正在读取 handoff.md …</div>`;
}

function bindGoalHandoffPanelActions(goal) {
  const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
  if (!panel || !goal) return;
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
  const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
  if (!panel) return;
  panel.innerHTML = `
    <div class="memory-viewer-empty">${escapeHtml(message)}</div>
    <div class="goal-detail-actions">
      <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">生成 handoff</button>
      <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
    </div>
  `;
  bindGoalHandoffPanelActions(goal);
}

function renderGoalHandoffPanel(goal, handoff) {
  const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
  if (!panel || !goal) return;

  if (!handoff || !handoff.generatedAt) {
    panel.innerHTML = `
      <div class="memory-viewer-empty">当前还没有正式 handoff。可在节点切换、暂停前或需要交接时手动生成。</div>
      <div class="goal-detail-actions">
        <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">生成 handoff</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
      </div>
    `;
    bindGoalHandoffPanelActions(goal);
    return;
  }

  panel.innerHTML = `
    <div class="goal-summary-header">
      <div>
        <div class="goal-summary-title">Handoff / 恢复交接</div>
        <div class="goal-summary-text">从 handoff.md 读取当前 goal 的恢复建议、阻塞点与最近交接摘要。</div>
      </div>
      <span class="memory-badge memory-badge-shared">已生成</span>
    </div>
    <div class="goal-summary-grid">
      <div class="goal-summary-item">
        <span class="goal-summary-label">生成时间</span>
        <strong class="goal-summary-value">${escapeHtml(formatDateTime(handoff.generatedAt))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">恢复模式</span>
        <strong class="goal-summary-value">${escapeHtml(handoff.resumeMode || "-")}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">建议节点</span>
        <strong class="goal-summary-value">${escapeHtml(handoff.resumeNode || "-")}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">Open Checkpoint</span>
        <strong class="goal-summary-value">${escapeHtml(String(handoff.openCheckpoints.length))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">阻塞项</span>
        <strong class="goal-summary-value">${escapeHtml(String(handoff.blockers.length))}</strong>
      </div>
      <div class="goal-summary-item">
        <span class="goal-summary-label">上次 Run</span>
        <strong class="goal-summary-value">${escapeHtml(handoff.lastRun || "-")}</strong>
      </div>
    </div>

    <div class="goal-tracking-columns">
      <div class="goal-tracking-column">
        <div class="goal-summary-title">交接摘要</div>
        <div class="memory-list-item-snippet">${escapeHtml(handoff.summary || "暂无摘要")}</div>
        <div class="goal-summary-title">下一步建议</div>
        <div class="memory-list-item-snippet">${escapeHtml(handoff.nextAction || "暂无建议")}</div>
        <div class="goal-summary-title">Tracking Snapshot</div>
        <div class="memory-list-item-meta">
          <span>nodes ${escapeHtml(String(handoff.tracking.totalNodes || "0"))}</span>
          <span>done ${escapeHtml(String(handoff.tracking.completedNodes || "0"))}</span>
          <span>running ${escapeHtml(String(handoff.tracking.inProgressNodes || "0"))}</span>
          <span>blocked ${escapeHtml(String(handoff.tracking.blockedNodes || "0"))}</span>
          <span>checkpoint ${escapeHtml(String(handoff.tracking.openCheckpoints || "0"))}</span>
        </div>
        ${handoff.focusPlan ? `
          <div class="goal-summary-title">Focus Capability</div>
          <div class="memory-list-item-snippet">${escapeHtml(handoff.focusPlan)}</div>
          ${handoff.focusSummary ? `<div class="memory-list-item-snippet">${escapeHtml(handoff.focusSummary)}</div>` : ""}
        ` : ""}
      </div>
      <div class="goal-tracking-column">
        <div class="goal-summary-title">阻塞 / 待处理</div>
        ${handoff.blockers.length || handoff.openCheckpoints.length ? `
          <div class="goal-tracking-list">
            ${handoff.blockers.map((item) => `
              <div class="goal-tracking-item">
                <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
              </div>
            `).join("")}
            ${handoff.openCheckpoints.map((item) => `
              <div class="goal-tracking-item">
                <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">当前 handoff 中没有阻塞或待审批项。</div>`}

        <div class="goal-summary-title">最近 Timeline</div>
        ${handoff.recentTimeline.length ? `
          <div class="goal-tracking-list">
            ${handoff.recentTimeline.map((item) => `
              <div class="goal-tracking-item">
                <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">handoff 中还没有最近时间线摘要。</div>`}
      </div>
    </div>

    <div class="goal-detail-actions">
      <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">刷新 handoff</button>
      <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
    </div>
  `;
  bindGoalHandoffPanelActions(goal);
}

async function loadGoalHandoffData(goal) {
  if (!goal || !goalsDetailEl) return;
  const trackingGoalId = goal.id;
  const seq = (goalsState.handoffSeq || 0) + 1;
  goalsState.handoffSeq = seq;
  renderGoalHandoffPanelLoading();

  const handoffFile = await readSourceFile(goal.handoffPath);
  if (goalsState.handoffSeq !== seq || goalsState.selectedId !== trackingGoalId) return;
  if (!handoffFile) {
    renderGoalHandoffPanelError(goal, "无法读取 handoff.md。若使用了自定义路径，请确认该路径已加入可操作区。");
    return;
  }
  renderGoalHandoffPanel(goal, parseGoalHandoffDocument(handoffFile.content || ""));
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
  const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">正在汇总 review governance / approval workflow …</div>`;
}

function renderGoalReviewGovernancePanelError(message) {
  const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
  if (!panel) return;
  panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

function renderGoalReviewGovernancePanel(goal, data) {
  const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
  if (!panel || !goal) return;
  if (!data) {
    panel.innerHTML = `<div class="memory-viewer-empty">当前还没有 review governance 汇总。</div>`;
    return;
  }
  panel.innerHTML = `
    <div class="goal-summary-header">
      <div>
        <div class="goal-summary-title">Review Governance / Unified Approval</div>
        <div class="goal-summary-text">在现有 goal detail 内汇总 reviewer/template、suggestion review、checkpoint workflow 与 reminder 状态。</div>
      </div>
      <div class="goal-detail-actions">
        <button class="button" data-goal-approval-scan="${escapeHtml(goal.id)}">执行 Approval Scan</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.notificationsPath || goalRuntimeFilePath(goal, "review-notifications.json"))}">打开 Notifications</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.notificationDispatchesPath || goalRuntimeFilePath(goal, "review-notification-dispatches.json"))}">打开 Dispatch Outbox</button>
        ${data.governanceConfigPath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.governanceConfigPath)}">打开 Governance Config</button>` : ""}
      </div>
    </div>
    <div class="goal-summary-grid">
      <div class="goal-summary-item"><span class="goal-summary-label">Review Pending</span><strong class="goal-summary-value">${escapeHtml(String(data.workflowPendingCount))}</strong></div>
      <div class="goal-summary-item"><span class="goal-summary-label">Review Overdue</span><strong class="goal-summary-value">${escapeHtml(String(data.workflowOverdueCount))}</strong></div>
      <div class="goal-summary-item"><span class="goal-summary-label">Checkpoint Pending</span><strong class="goal-summary-value">${escapeHtml(String(data.checkpointWorkflowPendingCount))}</strong></div>
      <div class="goal-summary-item"><span class="goal-summary-label">Checkpoint Overdue</span><strong class="goal-summary-value">${escapeHtml(String(data.checkpointWorkflowOverdueCount))}</strong></div>
      <div class="goal-summary-item"><span class="goal-summary-label">Reviewers</span><strong class="goal-summary-value">${escapeHtml(String(data.reviewers.length))}</strong></div>
      <div class="goal-summary-item"><span class="goal-summary-label">Templates</span><strong class="goal-summary-value">${escapeHtml(String(data.templates.length))}</strong></div>
      <div class="goal-summary-item"><span class="goal-summary-label">Dispatches</span><strong class="goal-summary-value">${escapeHtml(String(data.notificationDispatchCounts?.total || data.notificationDispatches.length || 0))}</strong></div>
    </div>
    <div class="goal-tracking-columns">
      <div class="goal-tracking-column">
        <div class="goal-summary-title">Actionable Suggestion Reviews</div>
        ${data.actionableReviews.length ? `
          <div class="goal-tracking-list">
            ${data.actionableReviews.map((item) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                  <span class="memory-badge">${escapeHtml(item.status)}</span>
                </div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(item.id)}</span>
                  <span>${escapeHtml(item.suggestionType)}</span>
                  ${item.reviewer ? `<span>${escapeHtml(item.reviewer)}</span>` : ""}
                </div>
                <div class="goal-detail-actions">
                  <button class="button goal-inline-action" data-goal-suggestion-decision="accepted" data-goal-suggestion-goal-id="${escapeHtml(goal.id)}" data-goal-suggestion-review-id="${escapeHtml(item.id)}" data-goal-suggestion-type="${escapeHtml(item.suggestionType)}" data-goal-suggestion-id="${escapeHtml(item.suggestionId)}">通过</button>
                  <button class="button goal-inline-action-secondary" data-goal-suggestion-decision="rejected" data-goal-suggestion-goal-id="${escapeHtml(goal.id)}" data-goal-suggestion-review-id="${escapeHtml(item.id)}" data-goal-suggestion-type="${escapeHtml(item.suggestionType)}" data-goal-suggestion-id="${escapeHtml(item.suggestionId)}">拒绝</button>
                  <button class="button goal-inline-action-secondary" data-goal-suggestion-escalate="true" data-goal-suggestion-goal-id="${escapeHtml(goal.id)}" data-goal-suggestion-review-id="${escapeHtml(item.id)}" data-goal-suggestion-type="${escapeHtml(item.suggestionType)}" data-goal-suggestion-id="${escapeHtml(item.suggestionId)}">升级</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">当前没有待处理 suggestion review。</div>`}
        <div class="goal-summary-title">Templates</div>
        ${data.templates.length ? `
          <div class="goal-tracking-list">
            ${data.templates.map((item) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                  <span class="memory-badge">${escapeHtml(item.mode)}</span>
                </div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(item.id)}</span>
                  <span>${escapeHtml(item.target)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">当前 organization governance 尚未配置模板。</div>`}
      </div>
      <div class="goal-tracking-column">
        <div class="goal-summary-title">Actionable Checkpoints</div>
        ${data.actionableCheckpoints.length ? `
          <div class="goal-tracking-list">
            ${data.actionableCheckpoints.map((item) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                  <span class="memory-badge ${item.status === "approved" ? "memory-badge-shared" : ""}">${escapeHtml(item.status)}</span>
                </div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(item.id)}</span>
                  ${item.nodeId ? `<span>${escapeHtml(item.nodeId)}</span>` : ""}
                  ${item.reviewer ? `<span>${escapeHtml(item.reviewer)}</span>` : ""}
                  ${item.slaAt ? `<span>${escapeHtml(formatDateTime(item.slaAt))}</span>` : ""}
                </div>
                <div class="goal-detail-actions">
                  <button class="button goal-inline-action" data-goal-checkpoint-action="approve" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">批准</button>
                  <button class="button goal-inline-action-secondary" data-goal-checkpoint-action="reject" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">拒绝</button>
                  <button class="button goal-inline-action-secondary" data-goal-checkpoint-escalate="true" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">升级</button>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">当前没有待处理 checkpoint workflow。</div>`}
        <div class="goal-summary-title">Recent Notifications</div>
        ${data.notifications.length ? `
          <div class="goal-tracking-list">
            ${data.notifications.slice().reverse().slice(0, 6).map((item) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(item.kind)}</span>
                  <span class="memory-badge">${escapeHtml(item.targetType)}</span>
                </div>
                <div class="memory-list-item-snippet">${escapeHtml(item.message || "")}</div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(item.targetId || "")}</span>
                  ${item.recipient ? `<span>${escapeHtml(item.recipient)}</span>` : ""}
                  ${item.createdAt ? `<span>${escapeHtml(formatDateTime(item.createdAt))}</span>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">当前还没有 reminder / escalation 通知。</div>`}
        <div class="goal-summary-title">Dispatch Channels / Outbox</div>
        ${data.notificationDispatches.length ? `
          <div class="memory-list-item-meta" style="margin-bottom:10px;">
            <span>by channel: ${escapeHtml(Object.entries(data.notificationDispatchCounts?.byChannel || {}).map(([key, value]) => `${key}=${value}`).join(" | ") || "(none)")}</span>
            <span>by status: ${escapeHtml(Object.entries(data.notificationDispatchCounts?.byStatus || {}).map(([key, value]) => `${key}=${value}`).join(" | ") || "(none)")}</span>
          </div>
          <div class="goal-tracking-list">
            ${data.notificationDispatches.slice().reverse().slice(0, 8).map((item) => `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(item.channel)}</span>
                  <span class="memory-badge">${escapeHtml(item.status)}</span>
                </div>
                <div class="memory-list-item-snippet">${escapeHtml(item.message || "")}</div>
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(item.targetType || "")}:${escapeHtml(item.targetId || "")}</span>
                  ${item.recipient ? `<span>${escapeHtml(item.recipient)}</span>` : ""}
                  ${item.routeKey ? `<span>${escapeHtml(item.routeKey)}</span>` : ""}
                  ${item.createdAt ? `<span>${escapeHtml(formatDateTime(item.createdAt))}</span>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-viewer-empty">当前还没有 materialized dispatch / outbox 记录。</div>`}
      </div>
    </div>
  `;
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
  if (!goalsDetailEl) return;
  if (!goal) {
    goalsDetailEl.innerHTML = `<div class="memory-viewer-empty">选择左侧长期任务查看详情。</div>`;
    return;
  }
  const isCurrentConversation = isConversationForGoal(activeConversationId, goal.id);
  const objective = goal.objective ? String(goal.objective).trim() : "";
  const lastNodeId = typeof goal.lastNodeId === "string" && goal.lastNodeId.trim() ? goal.lastNodeId.trim() : "";
  const lastRunId = typeof goal.lastRunId === "string" && goal.lastRunId.trim() ? goal.lastRunId.trim() : "";
  const activeNodeId = typeof goal.activeNodeId === "string" && goal.activeNodeId.trim() ? goal.activeNodeId.trim() : "";
  const runtimeSummaryCard = buildGoalRuntimeSummaryCard(goal, {
    activeNodeId,
    lastNodeId,
    lastRunId,
    isCurrentConversation,
  });
  const recoveryCard = buildGoalRecoveryCard(goal, {
    activeNodeId,
    lastNodeId,
    isCurrentConversation,
  });
  goalsDetailEl.innerHTML = `
    <div class="memory-detail-shell">
      <div class="memory-detail-header">
        <div>
          <div class="memory-detail-title">${escapeHtml(goal.title || goal.id)}</div>
          <div class="memory-list-item-snippet">${escapeHtml(objective || "未填写 objective，可直接打开 NORTHSTAR.md 或 00-goal.md 继续完善。")}</div>
        </div>
        <div class="memory-detail-badges">
          <span class="memory-badge memory-badge-shared">${escapeHtml(formatGoalStatus(goal.status))}</span>
          <span class="memory-badge">${escapeHtml(goal.currentPhase || "-")}</span>
          ${isCurrentConversation ? '<span class="memory-badge memory-badge-shared">current channel</span>' : ""}
        </div>
      </div>

      ${runtimeSummaryCard}
      ${recoveryCard}

      <div class="memory-detail-card goal-handoff-card">
        <div id="goalHandoffPanel">
          <div class="memory-viewer-empty">正在读取 handoff.md …</div>
        </div>
      </div>

      <div class="memory-detail-card goal-governance-card">
        <div id="goalGovernancePanel">
          <div class="memory-viewer-empty">正在汇总 review governance / approval workflow …</div>
        </div>
      </div>

      <div class="memory-detail-grid">
        <div class="memory-detail-card"><span class="memory-detail-label">Goal ID</span><div class="memory-detail-text">${escapeHtml(goal.id)}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">更新时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.updatedAt || goal.createdAt))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">创建时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.createdAt))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Path Source</span><div class="memory-detail-text">${escapeHtml(formatGoalPathSource(goal.pathSource))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">当前 Active Node</span><div class="memory-detail-text">${escapeHtml(activeNodeId || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">上次 Active Node</span><div class="memory-detail-text">${escapeHtml(lastNodeId || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">上次 Run ID</span><div class="memory-detail-text">${escapeHtml(lastRunId || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">最近活跃时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.lastActiveAt))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">最近暂停时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.pausedAt))}</div></div>
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">执行通道</span>
        <div class="memory-detail-pre">${escapeHtml(goal.activeConversationId || goalBaseConversationId(goal.id))}</div>
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">关键路径</span>
        <div class="goal-path-list">
          <button class="button goal-path-button" data-open-source="${escapeHtml(goalDocFilePath(goal, "00-goal.md"))}">打开 00-goal</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goal.northstarPath)}">打开 NORTHSTAR.md</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goal.tasksPath)}">打开任务图</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "capability-plans.json"))}">打开 capability-plans.json</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "checkpoints.json"))}">打开 checkpoints.json</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goal.progressPath)}">打开 progress</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "state.json"))}">打开 state.json</button>
          <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "runtime.json"))}">打开 runtime.json</button>
        </div>
      </div>

      <div class="memory-detail-grid">
        <div class="memory-detail-card"><span class="memory-detail-label">Goal Root</span><div class="memory-detail-pre">${escapeHtml(goal.goalRoot || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Doc Root</span><div class="memory-detail-pre">${escapeHtml(goal.docRoot || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Runtime Root</span><div class="memory-detail-pre">${escapeHtml(goal.runtimeRoot || "-")}</div></div>
      </div>

      <div class="goal-detail-actions">
        <button class="button" data-open-goal-tasks="${escapeHtml(goal.id)}">查看关联 Tasks</button>
        <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">恢复并进入通道</button>
        ${lastNodeId ? `<button class="button" data-goal-resume-last-node="${escapeHtml(goal.id)}" data-goal-last-node-id="${escapeHtml(lastNodeId)}">按上次节点恢复</button>` : ""}
        <button class="button goal-inline-action-secondary" data-goal-pause-detail="${escapeHtml(goal.id)}">暂停</button>
      </div>

      <div class="memory-detail-card goal-canvas-card">
        <div id="goalCanvasPanel">
          <div class="memory-viewer-empty">正在读取 board-ref.json …</div>
        </div>
      </div>

      <div class="memory-detail-card goal-tracking-card">
        <div class="goal-summary-header">
          <div>
            <div class="goal-summary-title">Checkpoint / Node 追踪</div>
            <div class="goal-summary-text">从 tasks.json 与 checkpoints.json 读取当前长期任务的结构化执行进度。</div>
          </div>
        </div>
        <div id="goalTrackingPanel">
          <div class="memory-viewer-empty">正在读取 tasks.json / checkpoints.json …</div>
        </div>
      </div>

      <div class="memory-detail-card goal-capability-card">
        <div class="goal-summary-header">
          <div>
            <div class="goal-summary-title">Capability Plan</div>
            <div class="goal-summary-text">从 capability-plans.json 读取节点执行前规划，以及运行后回写的 actual usage。</div>
          </div>
        </div>
        <div id="goalCapabilityPanel">
          <div class="memory-viewer-empty">正在读取 capability-plans.json …</div>
        </div>
      </div>

      <div class="memory-detail-card goal-progress-card">
        <div class="goal-summary-header">
          <div>
            <div class="goal-summary-title">执行时间线</div>
            <div class="goal-summary-text">从 progress.md 读取节点流转与 checkpoint 审批时间线。</div>
          </div>
        </div>
        <div id="goalProgressPanel">
          <div class="memory-viewer-empty">正在读取 progress.md …</div>
        </div>
      </div>
    </div>
  `;
  bindGoalDetailActions(goal);
  void loadGoalCanvasData(goal);
  void loadGoalTrackingData(goal);
  void loadGoalCapabilityData(goal);
  void loadGoalProgressData(goal);
  void loadGoalHandoffData(goal);
  void loadGoalReviewGovernanceData(goal);
}

async function loadGoals(forceReload = false, preferredGoalId) {
  if (!goalsSection) return;
  if (!ws || !isReady) {
    renderGoalsLoading("未连接");
    return;
  }
  if (forceReload || goalsState.items.length === 0) {
    renderGoalsLoading("加载中...");
  }
  const seq = goalsState.loadSeq + 1;
  goalsState.loadSeq = seq;
  const res = await sendReq({ type: "req", id: makeId(), method: "goal.list" });
  if (seq !== goalsState.loadSeq) return;
  if (!res || !res.ok || !Array.isArray(res.payload?.goals)) {
    renderGoalsEmpty("长期任务列表加载失败。");
    return;
  }
  const items = sortGoals(res.payload.goals);
  goalsState.items = items;
  renderGoalsSummary(items);
  if (items.length === 0) {
    goalsState.selectedId = null;
    renderGoalsEmpty("当前还没有长期任务。");
    return;
  }
  const selectedExists = items.some((goal) => goal.id === goalsState.selectedId);
  goalsState.selectedId = preferredGoalId && items.some((goal) => goal.id === preferredGoalId)
    ? preferredGoalId
    : selectedExists
      ? goalsState.selectedId
      : items[0].id;
  renderGoalList(items);
  renderGoalDetail(getGoalById(goalsState.selectedId));
  renderCanvasGoalContext();
}

async function submitGoalCreateForm() {
  if (!ws || !isReady) {
    showNotice("无法创建长期任务", "未连接到服务器。", "error");
    return;
  }
  const normalizedTitle = goalCreateTitleEl?.value.trim() || "";
  if (!normalizedTitle) {
    showNotice("无法创建长期任务", "标题不能为空。", "error");
    goalCreateTitleEl?.focus();
    return;
  }
  const objective = goalCreateObjectiveEl?.value.trim() || "";
  const goalRoot = goalCreateRootEl?.value.trim() || "";
  const autoResume = goalCreateAutoResumeEl?.checked !== false;
  if (goalCreateSubmitBtn) {
    goalCreateSubmitBtn.disabled = true;
    goalCreateSubmitBtn.textContent = "创建中...";
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
    goalCreateSubmitBtn.textContent = "创建";
  }
  if (!res || !res.ok || !res.payload?.goal?.id) {
    showNotice("长期任务创建失败", res?.error?.message || "未知错误。", "error");
    return;
  }
  const goal = res.payload.goal;
  toggleGoalCreateModal(false);
  showNotice("长期任务已创建", `${goal.title || goal.id} 已创建，准备进入执行通道。`, "success", 2200);
  await loadGoals(true, goal.id);
  if (autoResume) {
    await resumeGoal(goal.id, { silent: true });
  }
}

async function resumeGoal(goalId, options = {}) {
  if (!ws || !isReady) {
    showNotice("无法恢复长期任务", "未连接到服务器。", "error");
    return;
  }
  const nodeId = typeof options.nodeId === "string" && options.nodeId.trim() ? options.nodeId.trim() : undefined;
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.resume",
    params: { goalId, nodeId },
  });
  if (!res || !res.ok) {
    showNotice("长期任务恢复失败", res?.error?.message || "未知错误。", "error");
    return;
  }
  const goal = res.payload?.goal || getGoalById(goalId);
  const conversationId = res.payload?.conversationId || goal?.activeConversationId || goalBaseConversationId(goalId);
  await loadGoals(true, goalId);
  openConversationSession(conversationId, nodeId
    ? `已进入长期任务节点通道：${goal?.title || goalId} / ${nodeId}`
    : `已进入长期任务通道：${goal?.title || goalId}`);
  if (!options.silent) {
    showNotice(
      "已恢复长期任务",
      nodeId
        ? `${goal?.title || goalId} 已按上次节点 ${nodeId} 恢复。`
        : `${goal?.title || goalId} 已切到独立 goal channel。`,
      "success",
      2200,
    );
  }
}

async function pauseGoal(goalId) {
  if (!ws || !isReady) {
    showNotice("无法暂停长期任务", "未连接到服务器。", "error");
    return;
  }
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "goal.pause",
    params: { goalId },
  });
  if (!res || !res.ok) {
    showNotice("长期任务暂停失败", res?.error?.message || "未知错误。", "error");
    return;
  }
  if (isConversationForGoal(activeConversationId, goalId)) {
    activeConversationId = null;
    renderCanvasGoalContext();
    botMsgEl = null;
  }
  const goal = res.payload?.goal || getGoalById(goalId);
  await loadGoals(true, goalId);
  showNotice("已暂停长期任务", `${goal?.title || goalId} 已暂停，普通聊天通道不受影响。`, "info", 2400);
}

async function generateGoalHandoff(goalId) {
  if (!ws || !isReady) {
    showNotice("无法生成 handoff", "未连接到服务器。", "error");
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
    showNotice("handoff 生成失败", res?.error?.message || "未知错误。", "error");
    return;
  }
  if (goal && goalsState.selectedId === goalId) {
    void loadGoalHandoffData(goal);
  }
  showNotice("已生成 handoff", `${goal?.title || goalId} 的恢复交接摘要已更新。`, "success", 2200);
}

function switchMemoryViewerTab(tab) {
  if (memoryViewerState.tab === tab) return;
  memoryViewerState.tab = tab;
  memoryViewerState.items = [];
  memoryViewerState.selectedId = null;
  memoryViewerState.selectedTask = null;
  memoryViewerState.selectedCandidate = null;
  if (tab !== "tasks") {
    memoryViewerState.goalIdFilter = null;
  }
  syncMemoryViewerUi();
  loadMemoryViewer(true);
}

function syncMemoryViewerUi() {
  const isTasks = memoryViewerState.tab === "tasks";
  if (memoryTabTasksBtn) memoryTabTasksBtn.classList.toggle("active", isTasks);
  if (memoryTabMemoriesBtn) memoryTabMemoriesBtn.classList.toggle("active", !isTasks);
  if (memoryTaskFiltersEl) memoryTaskFiltersEl.classList.toggle("hidden", !isTasks);
  if (memoryChunkFiltersEl) memoryChunkFiltersEl.classList.toggle("hidden", isTasks);
  syncMemoryTaskGoalFilterUi();
}

async function loadMemoryViewer(forceSelectFirst = false) {
  if (!memoryViewerSection) return;
  syncMemoryViewerUi();

  if (!ws || !isReady) {
    renderMemoryViewerStats(null);
    renderMemoryViewerListEmpty("未连接到服务器。");
    renderMemoryViewerDetailEmpty("连接完成后可查看任务与记忆。");
    return;
  }

  if (memoryViewerState.tab === "tasks") {
    await Promise.all([
      loadMemoryViewerStats(),
      loadTaskUsageOverview(),
    ]);
    await loadTaskViewer(forceSelectFirst);
  } else {
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    await loadMemoryViewerStats();
    await loadMemoryChunkViewer(forceSelectFirst);
  }
}

async function loadMemoryViewerStats() {
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "memory.stats" });
  if (!res || !res.ok) {
    renderMemoryViewerStats(null);
    return;
  }
  memoryViewerState.stats = res.payload?.status ?? null;
  renderMemoryViewerStats(memoryViewerState.stats);
}

async function loadTaskUsageOverview() {
  const seq = memoryViewerState.usageOverviewSeq + 1;
  memoryViewerState.usageOverviewSeq = seq;
  memoryViewerState.usageOverview = {
    ...memoryViewerState.usageOverview,
    loading: true,
  };
  renderMemoryViewerStats(memoryViewerState.stats);

  const [methodsRes, skillsRes] = await Promise.all([
    sendReq({
      type: "req",
      id: makeId(),
      method: "experience.usage.stats",
      params: { limit: 6, filter: { assetType: "method" } },
    }),
    sendReq({
      type: "req",
      id: makeId(),
      method: "experience.usage.stats",
      params: { limit: 6, filter: { assetType: "skill" } },
    }),
  ]);

  if (memoryViewerState.tab !== "tasks" || memoryViewerState.usageOverviewSeq !== seq) return;

  memoryViewerState.usageOverview = {
    loading: false,
    methods: methodsRes?.ok && Array.isArray(methodsRes.payload?.items) ? methodsRes.payload.items : [],
    skills: skillsRes?.ok && Array.isArray(skillsRes.payload?.items) ? skillsRes.payload.items : [],
  };
  renderMemoryViewerStats(memoryViewerState.stats);
}

async function loadTaskViewer(forceSelectFirst = false) {
  renderMemoryViewerListEmpty("Tasks 加载中…");
  renderMemoryViewerDetailEmpty("正在加载 task 详情…");
  memoryViewerState.selectedTask = null;
  renderMemoryViewerStats(memoryViewerState.stats);

  const params = { limit: 20 };
  const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
  if (query) params.query = query;

  const filter = {};
  if (memoryTaskStatusFilterEl?.value) filter.status = memoryTaskStatusFilterEl.value;
  if (memoryTaskSourceFilterEl?.value) filter.source = memoryTaskSourceFilterEl.value;
  if (memoryViewerState.goalIdFilter) filter.goalId = memoryViewerState.goalIdFilter;
  if (Object.keys(filter).length > 0) params.filter = filter;

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "memory.task.list", params });
  if (!res || !res.ok) {
    memoryViewerState.selectedTask = null;
    renderMemoryViewerListEmpty("Task 列表加载失败。");
    renderMemoryViewerDetailEmpty(res?.error?.message || "无法读取 task 数据。");
    renderMemoryViewerStats(memoryViewerState.stats);
    return;
  }

  const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
  memoryViewerState.items = items;
  renderMemoryViewerStats(memoryViewerState.stats);

  if (!items.length) {
    memoryViewerState.selectedId = null;
    memoryViewerState.selectedTask = null;
    renderTaskList(items);
    renderMemoryViewerDetailEmpty("没有匹配的 task。");
    renderMemoryViewerStats(memoryViewerState.stats);
    return;
  }

  const selectedExists = items.some((item) => item.id === memoryViewerState.selectedId);
  if (forceSelectFirst || !selectedExists) {
    memoryViewerState.selectedId = items[0].id;
  }

  renderTaskList(items);
  await loadTaskDetail(memoryViewerState.selectedId);
}

async function loadTaskDetail(taskId) {
  if (!taskId) {
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    memoryViewerState.pendingUsageRevokeId = null;
    renderMemoryViewerDetailEmpty("请选择一个 task。");
    renderMemoryViewerStats(memoryViewerState.stats);
    return;
  }

  renderMemoryViewerDetailEmpty("Task 详情加载中…");
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "memory.task.get", params: { taskId } });
  if (!res || !res.ok) {
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    memoryViewerState.pendingUsageRevokeId = null;
    renderMemoryViewerDetailEmpty(res?.error?.message || "Task 详情加载失败。");
    renderMemoryViewerStats(memoryViewerState.stats);
    return;
  }

  memoryViewerState.selectedTask = res.payload?.task ?? null;
  if (
    memoryViewerState.selectedCandidate?.taskId &&
    memoryViewerState.selectedTask?.id &&
    memoryViewerState.selectedCandidate.taskId !== memoryViewerState.selectedTask.id
  ) {
    memoryViewerState.selectedCandidate = null;
  }
  memoryViewerState.pendingUsageRevokeId = null;
  renderTaskList(memoryViewerState.items);
  renderTaskDetail(memoryViewerState.selectedTask);
  renderMemoryViewerStats(memoryViewerState.stats);
}

async function loadMemoryChunkViewer(forceSelectFirst = false) {
  renderMemoryViewerListEmpty("Memories 加载中…");
  renderMemoryViewerDetailEmpty("正在加载 memory 详情…");

  const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
  const filter = {};
  if (memoryChunkTypeFilterEl?.value) filter.memoryType = memoryChunkTypeFilterEl.value;
  if (memoryChunkVisibilityFilterEl?.value) filter.scope = memoryChunkVisibilityFilterEl.value;
  if (memoryChunkCategoryFilterEl?.value) {
    if (memoryChunkCategoryFilterEl.value === "uncategorized") {
      filter.uncategorized = true;
    } else {
      filter.category = memoryChunkCategoryFilterEl.value;
    }
  }

  const params = { limit: 20 };
  if (Object.keys(filter).length > 0) params.filter = filter;
  if (query) params.query = query;

  const method = query ? "memory.search" : "memory.recent";
  const id = makeId();
  const res = await sendReq({ type: "req", id, method, params });
  if (!res || !res.ok) {
    renderMemoryViewerListEmpty("Memory 列表加载失败。");
    renderMemoryViewerDetailEmpty(res?.error?.message || "无法读取 memory 数据。");
    return;
  }

  const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
  memoryViewerState.items = items;
  renderMemoryViewerStats(memoryViewerState.stats);

  if (!items.length) {
    memoryViewerState.selectedId = null;
    renderMemoryList(items);
    renderMemoryViewerDetailEmpty("没有匹配的 memory。");
    return;
  }

  const selectedExists = items.some((item) => item.id === memoryViewerState.selectedId);
  if (forceSelectFirst || !selectedExists) {
    memoryViewerState.selectedId = items[0].id;
  }

  renderMemoryList(items);
  await loadMemoryDetail(memoryViewerState.selectedId);
}

async function loadMemoryDetail(chunkId) {
  if (!chunkId) {
    renderMemoryViewerDetailEmpty("请选择一条 memory。");
    return;
  }

  renderMemoryViewerDetailEmpty("Memory 详情加载中…");
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "memory.get", params: { chunkId } });
  if (!res || !res.ok) {
    renderMemoryViewerDetailEmpty(res?.error?.message || "Memory 详情加载失败。");
    return;
  }

  renderMemoryList(memoryViewerState.items);
  renderMemoryDetail(res.payload?.item);
}

async function openTaskFromAudit(taskId) {
  if (!taskId) return;
  if (memoryViewerState.tab !== "tasks") {
    memoryViewerState.tab = "tasks";
    memoryViewerState.items = [];
    memoryViewerState.selectedTask = null;
    syncMemoryViewerUi();
  }

  memoryViewerState.selectedId = taskId;
  await loadTaskViewer(false);

  if (!Array.isArray(memoryViewerState.items) || !memoryViewerState.items.some((item) => item.id === taskId)) {
    memoryViewerState.selectedId = taskId;
    renderTaskList(Array.isArray(memoryViewerState.items) ? memoryViewerState.items : []);
    await loadTaskDetail(taskId);
  }
}

async function openMemoryFromAudit(chunkId) {
  if (!chunkId) return;
  if (memoryViewerState.tab !== "memories") {
    memoryViewerState.tab = "memories";
    memoryViewerState.items = [];
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    syncMemoryViewerUi();
  }

  memoryViewerState.selectedId = chunkId;
  await loadMemoryChunkViewer(false);

  if (!Array.isArray(memoryViewerState.items) || !memoryViewerState.items.some((item) => item.id === chunkId)) {
    memoryViewerState.selectedId = chunkId;
    renderMemoryList(Array.isArray(memoryViewerState.items) ? memoryViewerState.items : []);
    await loadMemoryDetail(chunkId);
  }
}

async function loadCandidateDetail(candidateId) {
  if (!candidateId || !ws || !isReady) return;
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "experience.candidate.get", params: { candidateId } });
  if (!res || !res.ok) {
    showNotice("候选详情加载失败", res?.error?.message || "无法读取 candidate。", "error");
    return;
  }
  memoryViewerState.selectedCandidate = res.payload?.candidate ?? null;
  if (memoryViewerState.tab === "tasks" && memoryViewerState.selectedTask) {
    renderTaskDetail(memoryViewerState.selectedTask);
  } else {
    renderCandidateOnlyDetail(memoryViewerState.selectedCandidate);
  }
}

function renderMemoryViewerStats(stats) {
  if (!memoryViewerStatsEl) return;
  if (!stats) {
    memoryViewerStatsEl.innerHTML = `
      <div class="memory-stat-card"><span class="memory-stat-label">记忆文件</span><strong class="memory-stat-value">--</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">记忆块</span><strong class="memory-stat-value">--</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">向量索引</span><strong class="memory-stat-value">--</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">摘要完成</span><strong class="memory-stat-value">--</strong></div>
    `;
    return;
  }

  if (memoryViewerState.tab === "memories") {
    const items = Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [];
    const currentCategorized = items.filter((item) => Boolean(item?.category)).length;
    const currentUncategorized = items.length - currentCategorized;
    const activeCategoryLabel = getActiveMemoryCategoryLabel();
    const distributionCard = renderMemoryCategoryDistribution(stats);

    memoryViewerStatsEl.innerHTML = `
      <div class="memory-stat-card"><span class="memory-stat-label">当前结果</span><strong class="memory-stat-value">${formatCount(items.length)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">筛选分类</span><strong class="memory-stat-value">${escapeHtml(activeCategoryLabel)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">当前已分类</span><strong class="memory-stat-value">${formatCount(currentCategorized)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">当前未分类</span><strong class="memory-stat-value">${formatCount(currentUncategorized)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">全库已分类</span><strong class="memory-stat-value">${formatCount(stats.categorized)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">全库未分类</span><strong class="memory-stat-value">${formatCount(stats.uncategorized)}</strong></div>
      ${distributionCard}
    `;
    return;
  }

  const selectedTask = memoryViewerState.selectedTask;
  const usedMethods = Array.isArray(selectedTask?.usedMethods) ? selectedTask.usedMethods : [];
  const usedSkills = Array.isArray(selectedTask?.usedSkills) ? selectedTask.usedSkills : [];
  const lastUsedAt = getLatestExperienceUsageTimestamp(usedMethods, usedSkills);
  const activeGoalId = memoryViewerState.goalIdFilter;
  const activeGoalLabel = activeGoalId ? getGoalDisplayName(activeGoalId) : "-";

  memoryViewerStatsEl.innerHTML = `
    <div class="memory-stat-card"><span class="memory-stat-label">当前 Task 结果</span><strong class="memory-stat-value">${formatCount(Array.isArray(memoryViewerState.items) ? memoryViewerState.items.length : 0)}</strong></div>
    <div class="memory-stat-card"><span class="memory-stat-label">当前已用 Method</span><strong class="memory-stat-value">${formatCount(usedMethods.length)}</strong></div>
    <div class="memory-stat-card"><span class="memory-stat-label">当前已用 Skill</span><strong class="memory-stat-value">${formatCount(usedSkills.length)}</strong></div>
    <div class="memory-stat-card"><span class="memory-stat-label">最近采用时间</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(formatDateTime(lastUsedAt))}</strong></div>
    ${activeGoalId ? `<div class="memory-stat-card"><span class="memory-stat-label">Goal Filter</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(activeGoalLabel)}</strong><div class="memory-stat-caption">${escapeHtml(activeGoalId)}</div></div>` : ""}
    ${renderTaskUsageOverviewCard()}
  `;
  bindStatsAuditJumpLinks();
}

function renderTaskList(items) {
  if (!memoryViewerListEl) return;
  if (!items.length) {
    renderMemoryViewerListEmpty("没有可展示的 task。");
    return;
  }

  memoryViewerListEl.innerHTML = items.map((item) => {
    const title = item.title || item.objective || item.summary || item.conversationId || item.id;
    const snippet = item.summary || item.outcome || item.objective || "暂无摘要";
    const isActive = item.id === memoryViewerState.selectedId;
    const goalId = getTaskGoalId(item);
    return `
      <div class="memory-list-item ${isActive ? "active" : ""}" data-task-id="${escapeHtml(item.id)}">
        <div class="memory-list-item-title">${escapeHtml(title)}</div>
        <div class="memory-list-item-meta">
          <span>${escapeHtml(item.status || "unknown")}</span>
          <span>${escapeHtml(item.source || "unknown")}</span>
          ${goalId ? `<span class="memory-badge memory-badge-shared">${escapeHtml(getGoalDisplayName(goalId))}</span>` : ""}
          <span>${escapeHtml(formatDateTime(item.finishedAt || item.startedAt || item.createdAt))}</span>
        </div>
        <div class="memory-list-item-snippet">${escapeHtml(snippet)}</div>
      </div>
    `;
  }).join("");

  memoryViewerListEl.querySelectorAll("[data-task-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const taskId = node.getAttribute("data-task-id");
      if (!taskId) return;
      memoryViewerState.selectedId = taskId;
      renderTaskList(memoryViewerState.items);
      await loadTaskDetail(taskId);
    });
  });
}

function renderMemoryList(items) {
  if (!memoryViewerListEl) return;
  if (!items.length) {
    renderMemoryViewerListEmpty("没有可展示的 memory。");
    return;
  }

  memoryViewerListEl.innerHTML = items.map((item) => {
    const title = summarizeSourcePath(item.sourcePath);
    const summary = item.summary || item.snippet || "暂无摘要";
    const isActive = item.id === memoryViewerState.selectedId;
    const visibility = normalizeMemoryVisibility(item.visibility);
    const category = formatMemoryCategory(item.category);
    return `
      <div class="memory-list-item ${isActive ? "active" : ""}" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-list-item-title">${escapeHtml(title)}</div>
        <div class="memory-list-item-meta">
          <span>${escapeHtml(item.memoryType || "other")}</span>
          <span>${escapeHtml(item.sourceType || "unknown")}</span>
          <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
          <span class="memory-badge">${escapeHtml(category)}</span>
          <span>score ${formatScore(item.score)}</span>
        </div>
        <div class="memory-list-item-snippet">${escapeHtml(summary)}</div>
      </div>
    `;
  }).join("");

  memoryViewerListEl.querySelectorAll("[data-memory-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const chunkId = node.getAttribute("data-memory-id");
      if (!chunkId) return;
      memoryViewerState.selectedId = chunkId;
      renderMemoryList(memoryViewerState.items);
      await loadMemoryDetail(chunkId);
    });
  });
}

function renderTaskDetail(task) {
  if (!memoryViewerDetailEl) return;
  if (!task) {
    renderMemoryViewerDetailEmpty("Task 不存在。");
    return;
  }

  const title = task.title || task.objective || task.summary || task.id;
  const toolCalls = Array.isArray(task.toolCalls) ? task.toolCalls : [];
  const memoryLinks = Array.isArray(task.memoryLinks) ? task.memoryLinks : [];
  const artifactPaths = Array.isArray(task.artifactPaths) ? task.artifactPaths : [];
  const usedMethods = Array.isArray(task.usedMethods) ? task.usedMethods : [];
  const usedSkills = Array.isArray(task.usedSkills) ? task.usedSkills : [];
  const lastUsageAt = getLatestExperienceUsageTimestamp(usedMethods, usedSkills);
  const candidatePanel = renderCandidateDetailPanel(memoryViewerState.selectedCandidate);
  const goalId = getTaskGoalId(task);

  memoryViewerDetailEl.innerHTML = `
    <div class="memory-detail-shell">
      ${candidatePanel}
      <div class="memory-detail-header">
        <div>
          <div class="memory-detail-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(task.id)}</span>
            <span>${escapeHtml(task.conversationId || "-")}</span>
          </div>
        </div>
        <div class="memory-detail-badges">
          <span class="memory-badge">${escapeHtml(task.status || "unknown")}</span>
          <span class="memory-badge">${escapeHtml(task.source || "unknown")}</span>
          ${task.agentId ? `<span class="memory-badge">${escapeHtml(task.agentId)}</span>` : ""}
          ${goalId ? `<span class="memory-badge memory-badge-shared">${escapeHtml(getGoalDisplayName(goalId))}</span>` : ""}
        </div>
      </div>

      <div class="memory-detail-grid">
        <div class="memory-detail-card"><span class="memory-detail-label">开始时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(task.startedAt))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">结束时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(task.finishedAt))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">耗时</span><div class="memory-detail-text">${escapeHtml(formatDuration(task.durationMs))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Token</span><div class="memory-detail-text">${escapeHtml(formatCount(task.tokenTotal))}</div></div>
        ${goalId ? `<div class="memory-detail-card"><span class="memory-detail-label">Goal</span><div class="memory-detail-text">${escapeHtml(getGoalDisplayName(goalId))}</div></div>` : ""}
      </div>

      ${goalId ? `
        <div class="goal-detail-actions">
          <button class="button" data-open-goal-id="${escapeHtml(goalId)}">打开长期任务</button>
          <button class="button" data-open-goal-tasks="${escapeHtml(goalId)}">按该 Goal 过滤 Tasks</button>
        </div>
      ` : ""}

      <div class="memory-detail-grid memory-detail-grid-usage">
        <div class="memory-detail-card"><span class="memory-detail-label">Method 使用数</span><div class="memory-detail-text">${escapeHtml(formatCount(usedMethods.length))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Skill 使用数</span><div class="memory-detail-text">${escapeHtml(formatCount(usedSkills.length))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">最近采用时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(lastUsageAt))}</div></div>
      </div>

      ${task.objective ? `<div class="memory-detail-card"><span class="memory-detail-label">Objective</span><div class="memory-detail-text">${escapeHtml(task.objective)}</div></div>` : ""}
      ${task.summary ? `<div class="memory-detail-card"><span class="memory-detail-label">Summary</span><div class="memory-detail-text">${escapeHtml(task.summary)}</div></div>` : ""}
      ${task.outcome ? `<div class="memory-detail-card"><span class="memory-detail-label">Outcome</span><div class="memory-detail-text">${escapeHtml(task.outcome)}</div></div>` : ""}
      ${task.reflection ? `<div class="memory-detail-card"><span class="memory-detail-label">Reflection</span><div class="memory-detail-text">${escapeHtml(task.reflection)}</div></div>` : ""}

      <div class="memory-detail-card">
        <span class="memory-detail-label">Method Usage (${usedMethods.length})</span>
        ${renderTaskUsageItems(usedMethods, "method")}
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">Skill Usage (${usedSkills.length})</span>
        ${renderTaskUsageItems(usedSkills, "skill")}
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">Tool Calls (${toolCalls.length})</span>
        ${toolCalls.length ? `
          <div class="memory-inline-list">
            ${toolCalls.map((call) => `
              <div class="memory-inline-item">
                <div class="memory-inline-item-head">
                  <span class="memory-badge">${escapeHtml(call.toolName || "unknown")}</span>
                  <span class="memory-badge">${call.success ? "success" : "failed"}</span>
                  <span class="memory-badge">${escapeHtml(formatDuration(call.durationMs))}</span>
                </div>
                ${call.note ? `<div class="memory-detail-text">${escapeHtml(call.note)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">无工具调用记录。</div>`}
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">Linked Memories (${memoryLinks.length})</span>
        ${memoryLinks.length ? `
          <div class="memory-inline-list">
            ${memoryLinks.map((link) => `
              <div class="memory-inline-item">
                <div class="memory-inline-item-head">
                  <span class="memory-badge">${escapeHtml(link.relation || "used")}</span>
                  ${link.memoryType ? `<span class="memory-badge">${escapeHtml(link.memoryType)}</span>` : ""}
                  <button class="memory-path-link" data-open-memory-id="${escapeHtml(link.chunkId || "")}">${escapeHtml(link.chunkId || "open memory")}</button>
                </div>
                ${link.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(link.sourcePath)}">${escapeHtml(link.sourcePath)}</button>` : ""}
                ${link.snippet ? `<div class="memory-detail-text">${escapeHtml(link.snippet)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">暂无关联记忆。</div>`}
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">Artifacts (${artifactPaths.length})</span>
        ${artifactPaths.length ? `
          <div class="memory-inline-list">
            ${artifactPaths.map((artifactPath) => `
              <div class="memory-inline-item">
                <button class="memory-path-link" data-open-source="${escapeHtml(artifactPath)}">${escapeHtml(artifactPath)}</button>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">暂无产物路径。</div>`}
      </div>
    </div>
  `;
  bindMemoryPathLinks();
  bindTaskAuditJumpLinks();
  bindTaskUsageRevokeButtons(task);
}

function renderCandidateOnlyDetail(candidate) {
  if (!memoryViewerDetailEl) return;
  if (!candidate) {
    renderMemoryViewerDetailEmpty("Candidate 不存在。");
    return;
  }
  memoryViewerDetailEl.innerHTML = `
    <div class="memory-detail-shell">
      ${renderCandidateDetailPanel(candidate)}
    </div>
  `;
  bindMemoryPathLinks();
  bindTaskAuditJumpLinks();
}

function renderMemoryDetail(item) {
  if (!memoryViewerDetailEl) return;
  if (!item) {
    renderMemoryViewerDetailEmpty("Memory 不存在。");
    return;
  }

  const visibility = normalizeMemoryVisibility(item.visibility);
  const category = formatMemoryCategory(item.category);
  memoryViewerDetailEl.innerHTML = `
    <div class="memory-detail-shell">
      <div class="memory-detail-header">
        <div>
          <div class="memory-detail-title">${escapeHtml(summarizeSourcePath(item.sourcePath))}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(item.id)}</span>
          </div>
        </div>
        <div class="memory-detail-badges">
          <span class="memory-badge">${escapeHtml(item.memoryType || "other")}</span>
          <span class="memory-badge">${escapeHtml(item.sourceType || "unknown")}</span>
          <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
          <span class="memory-badge">${escapeHtml(category)}</span>
          <span class="memory-badge">score ${formatScore(item.score)}</span>
        </div>
      </div>

      <div class="memory-detail-grid">
        <div class="memory-detail-card"><span class="memory-detail-label">Source Path</span><div class="memory-detail-text">${item.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(item.sourcePath)}" data-open-line="${typeof item.startLine === "number" ? item.startLine : ""}">${escapeHtml(item.sourcePath)}</button>` : "-"}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Lines</span><div class="memory-detail-text">${escapeHtml(formatLineRange(item.startLine, item.endLine))}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Visibility</span><div class="memory-detail-text">${escapeHtml(visibility)}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">分类</span><div class="memory-detail-text">${escapeHtml(category)}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Summary</span><div class="memory-detail-text">${escapeHtml(item.summary || "暂无摘要")}</div></div>
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">Snippet</span>
        <div class="memory-detail-text">${escapeHtml(item.snippet || "暂无内容")}</div>
      </div>

      <div class="memory-detail-card">
        <span class="memory-detail-label">Content</span>
        <pre class="memory-detail-pre">${escapeHtml(item.content || item.snippet || "暂无内容")}</pre>
      </div>

      ${item.metadata ? `
        <div class="memory-detail-card">
          <span class="memory-detail-label">Metadata</span>
          <pre class="memory-detail-pre">${escapeHtml(JSON.stringify(item.metadata, null, 2))}</pre>
        </div>
      ` : ""}
    </div>
  `;
  bindMemoryPathLinks();
}

function renderMemoryViewerListEmpty(message) {
  if (!memoryViewerListEl) return;
  memoryViewerListEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

function renderMemoryViewerDetailEmpty(message) {
  if (!memoryViewerDetailEl) return;
  memoryViewerDetailEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
}

function bindMemoryPathLinks() {
  if (!memoryViewerDetailEl) return;
  memoryViewerDetailEl.querySelectorAll("[data-open-source]").forEach((node) => {
    node.addEventListener("click", async () => {
      const sourcePath = node.getAttribute("data-open-source");
      const lineRaw = node.getAttribute("data-open-line");
      const startLine = lineRaw ? Number.parseInt(lineRaw, 10) : undefined;
      await openSourcePath(sourcePath, { startLine });
    });
  });
}

function bindStatsAuditJumpLinks() {
  if (!memoryViewerStatsEl) return;
  memoryViewerStatsEl.querySelectorAll("[data-open-task-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const taskId = node.getAttribute("data-open-task-id");
      await openTaskFromAudit(taskId);
    });
  });
  memoryViewerStatsEl.querySelectorAll("[data-open-source]").forEach((node) => {
    node.addEventListener("click", async () => {
      const sourcePath = node.getAttribute("data-open-source");
      await openSourcePath(sourcePath);
    });
  });
  memoryViewerStatsEl.querySelectorAll("[data-open-candidate-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const candidateId = node.getAttribute("data-open-candidate-id");
      await loadCandidateDetail(candidateId);
    });
  });
  memoryViewerStatsEl.querySelectorAll("[data-open-goal-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const goalId = node.getAttribute("data-open-goal-id");
      if (!goalId) return;
      switchMode("goals");
      await loadGoals(true, goalId);
    });
  });
}

function bindTaskAuditJumpLinks() {
  if (!memoryViewerDetailEl) return;
  memoryViewerDetailEl.querySelectorAll("[data-open-task-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const taskId = node.getAttribute("data-open-task-id");
      await openTaskFromAudit(taskId);
    });
  });
  memoryViewerDetailEl.querySelectorAll("[data-open-candidate-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const candidateId = node.getAttribute("data-open-candidate-id");
      await loadCandidateDetail(candidateId);
    });
  });
  memoryViewerDetailEl.querySelectorAll("[data-open-goal-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const goalId = node.getAttribute("data-open-goal-id");
      if (!goalId) return;
      switchMode("goals");
      await loadGoals(true, goalId);
    });
  });
  memoryViewerDetailEl.querySelectorAll("[data-open-goal-tasks]").forEach((node) => {
    node.addEventListener("click", async () => {
      const goalId = node.getAttribute("data-open-goal-tasks");
      if (!goalId) return;
      await openGoalTaskViewer(goalId);
    });
  });
  memoryViewerDetailEl.querySelectorAll("[data-close-candidate-panel]").forEach((node) => {
    node.addEventListener("click", () => {
      memoryViewerState.selectedCandidate = null;
      if (memoryViewerState.selectedTask) {
        renderTaskDetail(memoryViewerState.selectedTask);
      } else {
        renderMemoryViewerDetailEmpty("请选择一个 task。");
      }
    });
  });
  memoryViewerDetailEl.querySelectorAll("[data-open-memory-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const chunkId = node.getAttribute("data-open-memory-id");
      await openMemoryFromAudit(chunkId);
    });
  });
}

function bindTaskUsageRevokeButtons(task) {
  if (!memoryViewerDetailEl || !task) return;
  memoryViewerDetailEl.querySelectorAll("[data-revoke-usage-id]").forEach((node) => {
    node.addEventListener("click", async () => {
      const usageId = node.getAttribute("data-revoke-usage-id");
      const taskId = node.getAttribute("data-revoke-task-id") || task.id;
      const assetKey = node.getAttribute("data-revoke-asset-key") || "";
      if (!usageId || !taskId) return;
      if (memoryViewerState.pendingUsageRevokeId) return;

      const confirmed = window.confirm(`确认撤销这条 usage 记录？\n\n${assetKey || usageId}`);
      if (!confirmed) return;

      await revokeTaskUsage(usageId, taskId, assetKey);
    });
  });
}

async function revokeTaskUsage(usageId, taskId, assetKey = "") {
  if (!ws || !isReady) {
    showNotice("无法撤销 usage", "未连接到服务器。", "error");
    return;
  }

  memoryViewerState.pendingUsageRevokeId = usageId;
  if (memoryViewerState.selectedTask?.id === taskId) {
    renderTaskDetail(memoryViewerState.selectedTask);
  }

  try {
    const id = makeId();
    const res = await sendReq({
      type: "req",
      id,
      method: "experience.usage.revoke",
      params: { usageId },
    });

    if (!res || !res.ok || !res.payload?.revoked) {
      showNotice("撤销失败", res?.error?.message || "Usage 未撤销。", "error");
      return;
    }

    showNotice("已撤销 usage", assetKey ? `${assetKey} 已从当前 task 的使用记录中移除。` : "该条经验使用记录已撤销。", "success", 2200);
    await Promise.all([
      loadTaskUsageOverview(),
      loadTaskDetail(taskId),
    ]);
  } catch (error) {
    showNotice("撤销失败", error instanceof Error ? error.message : String(error), "error");
  } finally {
    memoryViewerState.pendingUsageRevokeId = null;
    if (memoryViewerState.selectedTask?.id === taskId) {
      renderTaskDetail(memoryViewerState.selectedTask);
    }
    renderMemoryViewerStats(memoryViewerState.stats);
  }
}

function summarizeSourcePath(sourcePath) {
  if (!sourcePath) return "(unknown source)";
  const normalized = String(sourcePath).replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return normalized;
  return parts.slice(-3).join("/");
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

function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainSeconds}s`;
}

function formatLineRange(startLine, endLine) {
  if (typeof startLine === "number" && typeof endLine === "number") return `${startLine}-${endLine}`;
  if (typeof startLine === "number") return String(startLine);
  return "-";
}

function formatScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "--";
  return score.toFixed(3);
}

function normalizeMemoryVisibility(value) {
  return value === "shared" ? "shared" : "private";
}

function formatMemoryCategory(value) {
  switch (value) {
    case "preference":
      return "偏好";
    case "experience":
      return "经验";
    case "fact":
      return "事实";
    case "decision":
      return "决策";
    case "entity":
      return "实体";
    case "other":
      return "其他";
    default:
      return "未分类";
  }
}

function getActiveMemoryCategoryLabel() {
  const value = memoryChunkCategoryFilterEl?.value || "";
  if (!value) return "全部分类";
  if (value === "uncategorized") return "未分类";
  return formatMemoryCategory(value);
}

function renderTaskUsageOverviewCard() {
  const overview = memoryViewerState.usageOverview || {};
  const methods = Array.isArray(overview.methods) ? overview.methods : [];
  const skills = Array.isArray(overview.skills) ? overview.skills : [];
  const loading = Boolean(overview.loading);

  if (!loading && !methods.length && !skills.length) {
    return `
      <div class="memory-stat-card memory-stat-card-wide">
        <div class="memory-stat-card-head">
          <span class="memory-stat-label">经验消费总览</span>
          <span class="memory-stat-caption">暂无 usage 数据</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="memory-stat-card memory-stat-card-wide">
      <div class="memory-stat-card-head">
        <span class="memory-stat-label">经验消费总览</span>
        <span class="memory-stat-caption">${loading ? "统计更新中…" : "按全局累计使用次数展示"}</span>
      </div>
      <div class="memory-usage-overview-grid">
        ${renderTaskUsageOverviewLane("热门 Methods", methods, "method")}
        ${renderTaskUsageOverviewLane("热门 Skills", skills, "skill")}
      </div>
    </div>
  `;
}

function renderTaskUsageOverviewLane(title, items, tone) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    return `
      <div class="memory-usage-overview-lane">
        <div class="memory-usage-overview-head">
          <span class="memory-usage-overview-title">${escapeHtml(title)}</span>
        </div>
        <div class="memory-usage-overview-empty">暂无记录</div>
      </div>
    `;
  }

  const maxCount = safeItems.reduce((max, item) => Math.max(max, Number(item?.usageCount) || 0), 0);
  return `
    <div class="memory-usage-overview-lane">
      <div class="memory-usage-overview-head">
        <span class="memory-usage-overview-title">${escapeHtml(title)}</span>
        <span class="memory-stat-caption">Top ${formatCount(safeItems.length)}</span>
      </div>
      <div class="memory-usage-overview-list">
        ${safeItems.map((item) => {
          const usageCount = Number(item?.usageCount) || 0;
          const percent = maxCount > 0 ? (usageCount / maxCount) * 100 : 0;
          return `
            <div class="memory-usage-overview-row">
              <div class="memory-usage-overview-row-main">
                <div class="memory-usage-overview-key">${escapeHtml(item?.assetKey || "-")}</div>
                <div class="memory-usage-overview-meta">
                  ${item?.sourceCandidateId ? `<span>candidate ${escapeHtml(item.sourceCandidateId)}</span>` : ""}
                  ${item?.sourceCandidateTitle ? `<span>${escapeHtml(item.sourceCandidateTitle)}</span>` : ""}
                  <span>最近 ${escapeHtml(formatDateTime(item?.lastUsedAt))}</span>
                </div>
                <div class="memory-detail-badges">
                  ${item?.sourceCandidateId ? `<button class="memory-usage-action-btn" data-open-candidate-id="${escapeHtml(item.sourceCandidateId)}">候选详情</button>` : ""}
                  ${item?.lastUsedTaskId ? `<button class="memory-usage-action-btn" data-open-task-id="${escapeHtml(item.lastUsedTaskId)}">最近 Task</button>` : ""}
                  ${item?.sourceCandidatePublishedPath ? `<button class="memory-usage-action-btn" data-open-source="${escapeHtml(item.sourceCandidatePublishedPath)}">打开产物</button>` : ""}
                </div>
              </div>
              <div class="memory-usage-overview-bar-track">
                <div class="memory-usage-overview-bar-fill memory-usage-overview-bar-${tone}" style="width:${Math.max(percent, usageCount > 0 ? 10 : 0).toFixed(2)}%"></div>
              </div>
              <div class="memory-usage-overview-metrics">${formatCount(usageCount)}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderTaskUsageItems(items, assetType) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) {
    return `<div class="memory-detail-text">暂无 ${escapeHtml(assetType)} usage 记录。</div>`;
  }

  return `
    <div class="memory-usage-list">
      ${safeItems.map((item) => `
        <div class="memory-usage-item">
          <div class="memory-usage-item-head">
            <div class="memory-usage-item-key">${escapeHtml(item.assetKey || "-")}</div>
            <div class="memory-usage-item-actions">
            <div class="memory-detail-badges">
              ${item.sourceCandidateStatus ? `<span class="memory-badge">${escapeHtml(item.sourceCandidateStatus)}</span>` : ""}
              ${item.sourceCandidateId ? `<span class="memory-badge">candidate ${escapeHtml(item.sourceCandidateId)}</span>` : ""}
            </div>
            <div class="memory-detail-badges">
              <span class="memory-badge">${escapeHtml(formatUsageVia(item.usedVia))}</span>
              <span class="memory-badge">累计 ${formatCount(item.usageCount)}</span>
            </div>
            ${item.sourceCandidateId ? `<button class="memory-usage-action-btn" data-open-candidate-id="${escapeHtml(item.sourceCandidateId)}">候选详情</button>` : ""}
            ${item.sourceCandidateTaskId ? `<button class="memory-usage-action-btn" data-open-task-id="${escapeHtml(item.sourceCandidateTaskId)}">源 Task</button>` : ""}
            ${item.sourceCandidatePublishedPath ? `<button class="memory-usage-action-btn" data-open-source="${escapeHtml(item.sourceCandidatePublishedPath)}">打开产物</button>` : ""}
            ${item.lastUsedTaskId && item.lastUsedTaskId !== item.taskId ? `<button class="memory-usage-action-btn" data-open-task-id="${escapeHtml(item.lastUsedTaskId)}">最近 Task</button>` : ""}
            <button
              class="memory-usage-action-btn"
                data-revoke-usage-id="${escapeHtml(item.usageId || "")}"
                data-revoke-task-id="${escapeHtml(item.taskId || "")}"
                data-revoke-asset-key="${escapeHtml(item.assetKey || "")}"
                ${memoryViewerState.pendingUsageRevokeId === item.usageId ? "disabled" : ""}
              >${memoryViewerState.pendingUsageRevokeId === item.usageId ? "撤销中…" : "撤销"}</button>
            </div>
          </div>
          <div class="memory-usage-item-meta">
            <span>usage ${escapeHtml(item.usageId || "-")}</span>
            <span>本 task 采用 ${escapeHtml(formatDateTime(item.createdAt))}</span>
            <span>全局最近 ${escapeHtml(formatDateTime(item.lastUsedAt || item.createdAt))}</span>
            ${item.sourceCandidateId ? `<span>candidate ${escapeHtml(item.sourceCandidateId)}</span>` : ""}
            ${item.sourceCandidateTitle ? `<span>${escapeHtml(item.sourceCandidateTitle)}</span>` : ""}
            ${item.sourceCandidateTaskId ? `<span>源 task ${escapeHtml(item.sourceCandidateTaskId)}</span>` : ""}
            ${item.lastUsedTaskId ? `<span>最近 task ${escapeHtml(item.lastUsedTaskId)}</span>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function getLatestExperienceUsageTimestamp(...groups) {
  const timestamps = groups
    .flat()
    .map((item) => item?.createdAt || item?.lastUsedAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return undefined;
  return new Date(Math.max(...timestamps)).toISOString();
}

function formatUsageVia(value) {
  switch (value) {
    case "tool":
      return "tool";
    case "search":
      return "search";
    case "auto_suggest":
      return "auto";
    default:
      return "manual";
  }
}

function renderCandidateDetailPanel(candidate) {
  if (!candidate) return "";
  const snapshot = candidate.sourceTaskSnapshot || {};
  const memoryLinks = Array.isArray(snapshot.memoryLinks) ? snapshot.memoryLinks : [];
  const artifactPaths = Array.isArray(snapshot.artifactPaths) ? snapshot.artifactPaths : [];
  const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];

  return `
    <div class="memory-detail-card">
      <div class="memory-inline-item-head">
        <span class="memory-detail-label">Candidate 详情面板</span>
        <div class="memory-detail-badges">
          <span class="memory-badge">${escapeHtml(candidate.type || "unknown")}</span>
          <span class="memory-badge">${escapeHtml(candidate.status || "unknown")}</span>
          <button class="memory-usage-action-btn" data-close-candidate-panel="1">关闭</button>
        </div>
      </div>
      <div class="memory-detail-text"><strong>${escapeHtml(candidate.title || candidate.id || "未命名候选")}</strong></div>
      <div class="memory-detail-grid">
        <div class="memory-detail-card"><span class="memory-detail-label">Candidate ID</span><div class="memory-detail-text">${escapeHtml(candidate.id || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Source Task</span><div class="memory-detail-text">${candidate.taskId ? `<button class="memory-path-link" data-open-task-id="${escapeHtml(candidate.taskId)}">${escapeHtml(candidate.taskId)}</button>` : "-"}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Slug</span><div class="memory-detail-text">${escapeHtml(candidate.slug || "-")}</div></div>
        <div class="memory-detail-card"><span class="memory-detail-label">Published Path</span><div class="memory-detail-text">${candidate.publishedPath ? `<button class="memory-path-link" data-open-source="${escapeHtml(candidate.publishedPath)}">${escapeHtml(candidate.publishedPath)}</button>` : "-"}</div></div>
      </div>
      ${candidate.summary ? `<div class="memory-detail-text">${escapeHtml(candidate.summary)}</div>` : ""}
      <div class="memory-detail-card">
        <span class="memory-detail-label">来源快照</span>
        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">Conversation</span><div class="memory-detail-text">${escapeHtml(snapshot.conversationId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">状态</span><div class="memory-detail-text">${escapeHtml(snapshot.status || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Source</span><div class="memory-detail-text">${escapeHtml(snapshot.source || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">开始</span><div class="memory-detail-text">${escapeHtml(formatDateTime(snapshot.startedAt))}</div></div>
        </div>
        ${snapshot.objective ? `<div class="memory-detail-text"><strong>Objective:</strong> ${escapeHtml(snapshot.objective)}</div>` : ""}
        ${snapshot.summary ? `<div class="memory-detail-text"><strong>Summary:</strong> ${escapeHtml(snapshot.summary)}</div>` : ""}
      </div>
      <div class="memory-detail-card">
        <span class="memory-detail-label">来源记忆 (${memoryLinks.length})</span>
        ${memoryLinks.length ? `
          <div class="memory-inline-list">
            ${memoryLinks.map((link) => `
              <div class="memory-inline-item">
                <div class="memory-inline-item-head">
                  <span class="memory-badge">${escapeHtml(link.relation || "used")}</span>
                  ${link.memoryType ? `<span class="memory-badge">${escapeHtml(link.memoryType)}</span>` : ""}
                  <button class="memory-path-link" data-open-memory-id="${escapeHtml(link.chunkId || "")}">${escapeHtml(link.chunkId || "open memory")}</button>
                </div>
                ${link.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(link.sourcePath)}">${escapeHtml(link.sourcePath)}</button>` : ""}
                ${link.snippet ? `<div class="memory-detail-text">${escapeHtml(link.snippet)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">无来源记忆链接。</div>`}
      </div>
      <div class="memory-detail-card">
        <span class="memory-detail-label">来源产物 (${artifactPaths.length})</span>
        ${artifactPaths.length ? `
          <div class="memory-inline-list">
            ${artifactPaths.map((artifactPath) => `
              <div class="memory-inline-item">
                <button class="memory-path-link" data-open-source="${escapeHtml(artifactPath)}">${escapeHtml(artifactPath)}</button>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">无来源产物。</div>`}
      </div>
      <div class="memory-detail-card">
        <span class="memory-detail-label">Tool Calls (${toolCalls.length})</span>
        ${toolCalls.length ? `
          <div class="memory-inline-list">
            ${toolCalls.map((call) => `
              <div class="memory-inline-item">
                <div class="memory-inline-item-head">
                  <span class="memory-badge">${escapeHtml(call.toolName || "unknown")}</span>
                  <span class="memory-badge">${call.success ? "success" : "failed"}</span>
                  <span class="memory-badge">${escapeHtml(formatDuration(call.durationMs))}</span>
                </div>
                ${call.note ? `<div class="memory-detail-text">${escapeHtml(call.note)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">无工具调用记录。</div>`}
      </div>
      <div class="memory-detail-card">
        <span class="memory-detail-label">Candidate Content</span>
        <pre class="memory-detail-pre">${escapeHtml(candidate.content || "暂无内容")}</pre>
      </div>
    </div>
  `;
}

function renderMemoryCategoryDistribution(stats) {
  const entries = getMemoryCategoryDistributionEntries(stats);
  if (!entries.length) {
    return `
      <div class="memory-stat-card memory-stat-card-wide">
        <div class="memory-stat-card-head">
          <span class="memory-stat-label">分类分布</span>
          <span class="memory-stat-caption">暂无分类样本</span>
        </div>
      </div>
    `;
  }

  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const activeKey = memoryChunkCategoryFilterEl?.value || "";
  return `
    <div class="memory-stat-card memory-stat-card-wide">
      <div class="memory-stat-card-head">
        <span class="memory-stat-label">分类分布</span>
        <span class="memory-stat-caption">全库 ${formatCount(total)} 条</span>
      </div>
      <div class="memory-category-chart">
        ${entries.map((entry) => {
          const percent = total > 0 ? (entry.count / total) * 100 : 0;
          const isActive = activeKey === entry.key;
          return `
            <div class="memory-category-row ${isActive ? "active" : ""}">
              <div class="memory-category-name">${escapeHtml(entry.label)}</div>
              <div class="memory-category-bar-track">
                <div class="memory-category-bar-fill ${getMemoryCategoryToneClass(entry.key)}" style="width:${Math.max(percent, entry.count > 0 ? 3 : 0).toFixed(2)}%"></div>
              </div>
              <div class="memory-category-metrics">
                <span class="memory-category-count">${formatCount(entry.count)}</span>
                <span class="memory-category-percent">${percent.toFixed(percent >= 10 ? 0 : 1)}%</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function getMemoryCategoryDistributionEntries(stats) {
  const buckets = stats?.categoryBuckets || {};
  const ordered = [
    { key: "preference", label: "偏好", count: buckets.preference || 0 },
    { key: "experience", label: "经验", count: buckets.experience || 0 },
    { key: "fact", label: "事实", count: buckets.fact || 0 },
    { key: "decision", label: "决策", count: buckets.decision || 0 },
    { key: "entity", label: "实体", count: buckets.entity || 0 },
    { key: "other", label: "其他", count: buckets.other || 0 },
    { key: "uncategorized", label: "未分类", count: stats?.uncategorized || 0 },
  ];
  return ordered.filter((entry) => entry.count > 0);
}

function getMemoryCategoryToneClass(key) {
  switch (key) {
    case "preference":
      return "memory-category-bar-preference";
    case "experience":
      return "memory-category-bar-experience";
    case "fact":
      return "memory-category-bar-fact";
    case "decision":
      return "memory-category-bar-decision";
    case "entity":
      return "memory-category-bar-entity";
    case "other":
      return "memory-category-bar-other";
    default:
      return "memory-category-bar-uncategorized";
  }
}

function getVisibilityBadgeClass(visibility) {
  return visibility === "shared" ? "memory-badge-shared" : "memory-badge-private";
}

function formatCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN").format(value);
}

syncMemoryViewerUi();
updateSidebarModeButtons();

// Expose switchMode for canvas.js
window._belldandySwitchMode = switchMode;

// Expose canvas context refresh for canvas.js
window._belldandySyncCanvasContext = renderCanvasGoalContext;

// Expose openFile for canvas.js (method node double-click → editor)
window._belldandyOpenFile = (filePath) => openFile(filePath);

function openConversationSession(conversationId, hintText) {
  if (!conversationId) return;
  activeConversationId = conversationId;
  renderCanvasGoalContext();
  switchMode("chat");
  if (messagesEl) {
    messagesEl.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "system-msg";
    hint.textContent = hintText || `已切换到会话: ${conversationId}`;
    messagesEl.appendChild(hint);
  }
  void loadConversationMeta(conversationId);
}

// Expose loadConversation for canvas.js (session node double-click → chat)
window._belldandyLoadConversation = (conversationId) => {
  openConversationSession(conversationId);
};

// Initialize canvas app (canvas.js creates window._canvasApp)
if (window._canvasApp) {
  window._canvasApp.init((req) => sendReq(req));
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
  });
}
if (authValueEl) {
  authValueEl.addEventListener("input", () => {
    if (transientUrlToken && authValueEl.value.trim() !== transientUrlToken) {
      transientUrlToken = null;
    }
  });
}

const SAFE_ASSISTANT_TAGS = new Set([
  "A", "AUDIO", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "H1", "H2", "H3", "H4", "H5", "H6", "HR",
  "I", "IMG", "LI", "OL", "P", "PRE", "SOURCE", "SPAN", "STRONG", "UL", "VIDEO", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "BUTTON", "SVG", "PATH", "RECT"
]);

const SAFE_ASSISTANT_ATTRS = {
  A: new Set(["href", "title", "target", "rel"]),
  AUDIO: new Set(["src", "controls", "autoplay", "preload", "loop"]),
  IMG: new Set(["src", "alt", "title"]),
  SOURCE: new Set(["src", "type"]),
  VIDEO: new Set(["src", "controls", "autoplay", "muted", "loop", "playsinline", "preload", "poster"]),
  CODE: new Set(["class", "language"]), // For syntax highlighting classes from marked
  PRE: new Set(["class"]),
  DIV: new Set(["class"]),
  SPAN: new Set(["class"]),
  BUTTON: new Set(["class", "title", "onclick"]),
  SVG: new Set(["width", "height", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "xmlns", "class"]),
  PATH: new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
  RECT: new Set(["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"]),
};

let markedConfigured = false;
function configureMarkedOnce() {
  if (markedConfigured || !window.marked) return;
  const renderer = new window.marked.Renderer();
  renderer.code = function (code, language) {
    return `<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="code-block-lang">${language || ''}</span>
    <button class="copy-code-btn" title="复制代码">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> 复制
    </button>
  </div>
  <pre><code class="language-${language}">${escapeHtml(code)}</code></pre>
</div>`;
  };
  window.marked.use({ renderer });
  markedConfigured = true;
}

function stripThinkBlocks(text) {
  if (!text) return "";
  // 移除完整的 think 块
  let stripped = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  // 移除末尾处于未完成状态的 think 块 (适配流式输出)
  stripped = stripped.replace(/<think>[\s\S]*$/, "");
  return stripped;
}

function sanitizeAssistantHtml(rawHtml) {
  if (!rawHtml) return "";
  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  for (const node of Array.from(template.content.childNodes)) {
    sanitizeAssistantNode(node);
  }
  return template.innerHTML;
}

function sanitizeAssistantNode(node) {
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) return;
  if (node.nodeType !== Node.ELEMENT_NODE) {
    node.remove();
    return;
  }

  const el = node;
  const tag = el.tagName;
  if (!SAFE_ASSISTANT_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) {
      el.remove();
      return;
    }
    const children = Array.from(el.childNodes);
    for (const child of children) {
      parent.insertBefore(child, el);
      sanitizeAssistantNode(child);
    }
    parent.removeChild(el);
    return;
  }

  const allowedAttrs = SAFE_ASSISTANT_ATTRS[tag];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (!allowedAttrs || !allowedAttrs.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if ((name === "src" || name === "href") && !isSafeAssistantUrl(attr.value, tag, name)) {
      el.removeAttribute(attr.name);
    }
  }

  if (tag === "A" && el.getAttribute("target") === "_blank") {
    el.setAttribute("rel", "noopener noreferrer");
  }

  for (const child of Array.from(el.childNodes)) {
    sanitizeAssistantNode(child);
  }
}

function isSafeAssistantUrl(value, tag, attrName) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();

  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("#")) {
    return true;
  }

  if (lower.startsWith("blob:")) {
    return true;
  }

  if (attrName === "src" && (tag === "IMG" || tag === "AUDIO" || tag === "VIDEO" || tag === "SOURCE")) {
    if (lower.startsWith("data:image/") || lower.startsWith("data:audio/") || lower.startsWith("data:video/")) {
      return true;
    }
  }

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (attrName === "href") {
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:" || parsed.protocol === "tel:";
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ── Tool Settings (调用设置) ──
const toolSettingsConfirmModal = document.getElementById("toolSettingsConfirmModal");
const toolSettingsConfirmImpactEl = document.getElementById("toolSettingsConfirmImpact");
const toolSettingsConfirmSummaryEl = document.getElementById("toolSettingsConfirmSummary");
const toolSettingsConfirmExpiryEl = document.getElementById("toolSettingsConfirmExpiry");
const toolSettingsConfirmApproveBtn = document.getElementById("toolSettingsConfirmApprove");
const toolSettingsConfirmRejectBtn = document.getElementById("toolSettingsConfirmReject");
const toolSettingsModal = document.getElementById("toolSettingsModal");
const openToolSettingsBtn = document.getElementById("openToolSettings");
const closeToolSettingsBtn = document.getElementById("closeToolSettings");
const saveToolSettingsBtn = document.getElementById("saveToolSettings");
const toolSettingsBody = document.getElementById("toolSettingsBody");

let toolSettingsData = null; // { builtin, mcp, plugins, skills, disabled }
let toolSettingsActiveTab = "builtin";
let toolSettingsLoadSeq = 0;
let pendingToolSettingsConfirm = null;
let toolSettingsConfirmTimer = null;

if (openToolSettingsBtn) {
  openToolSettingsBtn.addEventListener("click", () => toggleToolSettings(true));
}
if (closeToolSettingsBtn) {
  closeToolSettingsBtn.addEventListener("click", () => toggleToolSettings(false));
}
if (saveToolSettingsBtn) {
  saveToolSettingsBtn.addEventListener("click", saveToolSettings);
}
if (toolSettingsConfirmApproveBtn) {
  toolSettingsConfirmApproveBtn.addEventListener("click", () => {
    void submitToolSettingsConfirm("approve");
  });
}
if (toolSettingsConfirmRejectBtn) {
  toolSettingsConfirmRejectBtn.addEventListener("click", () => {
    void submitToolSettingsConfirm("reject");
  });
}

// Tab switching
document.querySelectorAll(".tool-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tool-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    toolSettingsActiveTab = tab.dataset.tab;
    renderToolSettingsTab();
  });
});

function toggleToolSettings(show) {
  if (show) {
    toolSettingsModal.classList.remove("hidden");
    toolSettingsData = null;
    loadToolSettings();
  } else {
    toolSettingsModal.classList.add("hidden");
  }
}

function shouldHandleToolSettingsConfirmPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const targetClientId = payload.targetClientId ? String(payload.targetClientId).trim() : "";
  return !targetClientId || targetClientId === clientId;
}

function normalizeToolSettingsConfirmPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const requestId = payload.requestId ? String(payload.requestId).trim() : "";
  const conversationId = payload.conversationId ? String(payload.conversationId).trim() : "";
  if (!requestId || !conversationId) return null;
  const summary = Array.isArray(payload.summary)
    ? payload.summary.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  return {
    requestId,
    conversationId,
    impact: payload.impact ? String(payload.impact) : "这是全局工具设置变更，会影响当前 Gateway 的其他会话。",
    summary,
    expiresAt: Number(payload.expiresAt || 0),
  };
}

function setToolSettingsConfirmBusy(busy) {
  if (toolSettingsConfirmApproveBtn) toolSettingsConfirmApproveBtn.disabled = busy;
  if (toolSettingsConfirmRejectBtn) toolSettingsConfirmRejectBtn.disabled = busy;
}

function stopToolSettingsConfirmTimer() {
  if (toolSettingsConfirmTimer) {
    clearInterval(toolSettingsConfirmTimer);
    toolSettingsConfirmTimer = null;
  }
}

function formatToolSettingsConfirmExpiry(expiresAt) {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return "";
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return "该确认请求已过期，请重新发起工具开关变更。";
  const remainingSec = Math.ceil(remainingMs / 1000);
  if (remainingSec < 60) return `请在 ${remainingSec} 秒内完成确认。`;
  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  return `请在 ${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒内完成确认。`;
}

function renderToolSettingsConfirmModal() {
  if (!pendingToolSettingsConfirm || !toolSettingsConfirmModal) return;
  if (toolSettingsConfirmImpactEl) {
    toolSettingsConfirmImpactEl.textContent = pendingToolSettingsConfirm.impact;
  }
  if (toolSettingsConfirmSummaryEl) {
    const lines = pendingToolSettingsConfirm.summary.length > 0
      ? pendingToolSettingsConfirm.summary
      : ["本次请求未提供可展示的变更摘要。"];
    toolSettingsConfirmSummaryEl.innerHTML = lines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");
  }
  if (toolSettingsConfirmExpiryEl) {
    toolSettingsConfirmExpiryEl.textContent = formatToolSettingsConfirmExpiry(pendingToolSettingsConfirm.expiresAt);
  }
}

function clearToolSettingsConfirmModal() {
  pendingToolSettingsConfirm = null;
  stopToolSettingsConfirmTimer();
  setToolSettingsConfirmBusy(false);
  if (toolSettingsConfirmModal) toolSettingsConfirmModal.classList.add("hidden");
}

function handleToolSettingsConfirmRequired(payload) {
  if (!shouldHandleToolSettingsConfirmPayload(payload)) return;
  const normalized = normalizeToolSettingsConfirmPayload(payload);
  if (!normalized) return;
  pendingToolSettingsConfirm = normalized;
  setToolSettingsConfirmBusy(false);
  renderToolSettingsConfirmModal();
  if (toolSettingsConfirmModal) toolSettingsConfirmModal.classList.remove("hidden");
  stopToolSettingsConfirmTimer();
  toolSettingsConfirmTimer = setInterval(() => {
    if (!pendingToolSettingsConfirm) {
      stopToolSettingsConfirmTimer();
      return;
    }
    renderToolSettingsConfirmModal();
  }, 1000);
}

function handleToolSettingsConfirmResolved(payload) {
  if (!shouldHandleToolSettingsConfirmPayload(payload)) return;
  const requestId = payload && payload.requestId ? String(payload.requestId).trim() : "";
  if (!pendingToolSettingsConfirm || pendingToolSettingsConfirm.requestId !== requestId) return;
  const approved = payload && payload.decision === "approved";
  clearToolSettingsConfirmModal();
  showNotice(
    approved ? "工具设置已确认" : "工具设置已拒绝",
    approved ? "全局工具开关变更已应用。" : "本次工具开关变更已拒绝。",
    approved ? "success" : "info",
    2600,
  );
}

async function submitToolSettingsConfirm(decision) {
  if (!pendingToolSettingsConfirm) return;
  if (!ws || !isReady) {
    showNotice("无法处理确认", "当前未连接到服务器。", "error");
    return;
  }
  setToolSettingsConfirmBusy(true);
  const currentRequest = pendingToolSettingsConfirm;
  const res = await sendReq({
    type: "req",
    id: makeId(),
    method: "tool_settings.confirm",
    params: {
      requestId: currentRequest.requestId,
      conversationId: currentRequest.conversationId,
      decision,
    },
  });
  if (!res || res.ok === false) {
    setToolSettingsConfirmBusy(false);
    const title = decision === "approve" ? "确认失败" : "拒绝失败";
    showNotice(title, res?.error?.message || "请求未完成。", "error");
    if (res?.error?.code === "not_found") {
      clearToolSettingsConfirmModal();
    }
    return;
  }
  clearToolSettingsConfirmModal();
  showNotice(
    decision === "approve" ? "工具设置已确认" : "工具设置已拒绝",
    decision === "approve" ? "全局工具开关变更已应用。" : "本次工具开关变更已拒绝。",
    decision === "approve" ? "success" : "info",
    2600,
  );
}

async function loadToolSettings() {
  const seq = ++toolSettingsLoadSeq;
  if (!ws || !isReady) {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未连接</div>';
    return;
  }
  toolSettingsBody.innerHTML = '<div class="tool-settings-empty">加载中...</div>';

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "tools.list" });
  if (seq !== toolSettingsLoadSeq) return;
  if (res && res.ok && res.payload) {
    toolSettingsData = res.payload;
    renderToolSettingsTab();
  } else {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">加载失败</div>';
  }
}

function renderToolSettingsTab() {
  if (!toolSettingsData) return;
  const { builtin, mcp, plugins, skills, disabled } = toolSettingsData;

  if (toolSettingsActiveTab === "builtin") {
    renderBuiltinTab(builtin, disabled.builtin || []);
  } else if (toolSettingsActiveTab === "mcp") {
    renderMCPTab(mcp, disabled.mcp_servers || []);
  } else if (toolSettingsActiveTab === "skills") {
    renderSkillsTab(skills || [], disabled.skills || []);
  } else {
    renderPluginsTab(plugins, disabled.plugins || []);
  }
}

function renderBuiltinTab(tools, disabledList) {
  if (!tools || tools.length === 0) {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未启用工具系统 (BELLDANDY_TOOLS_ENABLED=false)</div>';
    return;
  }
  const disabledSet = new Set(disabledList);
  const enabledCount = tools.length - disabledSet.size;

  let html = `<div class="tool-section-header"><span>内置工具</span><span class="tool-section-count">${enabledCount}/${tools.length} 已启用</span></div>`;
  for (const name of tools.sort()) {
    const checked = !disabledSet.has(name);
    html += `<div class="tool-item${checked ? "" : " disabled"}">
      <span class="tool-item-name">${escapeHtml(name)}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-category="builtin" data-name="${escapeHtml(name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  }
  toolSettingsBody.innerHTML = html;
  bindToggleEvents();
}

function renderMCPTab(mcpServers, disabledList) {
  const serverIds = Object.keys(mcpServers || {});
  if (serverIds.length === 0) {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未配置 MCP 服务器</div>';
    return;
  }
  const disabledSet = new Set(disabledList);
  const enabledCount = serverIds.length - disabledSet.size;

  let html = `<div class="tool-section-header"><span>MCP 服务器</span><span class="tool-section-count">${enabledCount}/${serverIds.length} 已启用</span></div>`;
  for (const serverId of serverIds.sort()) {
    const server = mcpServers[serverId];
    const checked = !disabledSet.has(serverId);
    const toolList = (server.tools || []).map(t => {
      // 去掉 mcp_{serverId}_ 前缀显示
      const short = t.replace(`mcp_${serverId}_`, "");
      return escapeHtml(short);
    }).join(", ");

    html += `<div class="mcp-group">
      <div class="mcp-group-header">
        <span class="mcp-group-name">${escapeHtml(serverId)}</span>
        <label class="toggle-switch">
          <input type="checkbox" data-category="mcp_servers" data-name="${escapeHtml(serverId)}" ${checked ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="mcp-group-tools">${toolList || "无工具"}</div>
    </div>`;
  }
  toolSettingsBody.innerHTML = html;
  bindToggleEvents();
}

function renderPluginsTab(pluginList, disabledList) {
  if (!pluginList || pluginList.length === 0) {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未加载插件（将 .js/.mjs 文件放入 ~/.star_sanctuary/plugins/ 目录）</div>';
    return;
  }
  const disabledSet = new Set(disabledList);
  const enabledCount = pluginList.length - disabledSet.size;

  let html = `<div class="tool-section-header"><span>插件</span><span class="tool-section-count">${enabledCount}/${pluginList.length} 已启用</span></div>`;
  for (const name of pluginList.sort()) {
    const checked = !disabledSet.has(name);
    html += `<div class="tool-item${checked ? "" : " disabled"}">
      <span class="tool-item-name">${escapeHtml(name)}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-category="plugins" data-name="${escapeHtml(name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  }
  toolSettingsBody.innerHTML = html;
  bindToggleEvents();
}

function renderSkillsTab(skillList, disabledList) {
  if (!skillList || skillList.length === 0) {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未加载技能（将 SKILL.md 放入 ~/.star_sanctuary/skills/ 目录）</div>';
    return;
  }
  const disabledSet = new Set(disabledList);
  const enabledCount = skillList.length - disabledSet.size;

  const sourceLabel = { bundled: "内置", user: "用户", plugin: "插件" };
  const priorityLabel = { always: "始终注入", high: "高优先", normal: "普通", low: "低优先" };

  let html = `<div class="tool-section-header"><span>技能</span><span class="tool-section-count">${enabledCount}/${skillList.length} 已启用</span></div>`;
  for (const skill of skillList.sort((a, b) => a.name.localeCompare(b.name))) {
    const checked = !disabledSet.has(skill.name);
    const src = sourceLabel[skill.source] || skill.source;
    const pri = priorityLabel[skill.priority] || skill.priority;
    const tags = (skill.tags || []).map(t => `<span class="skill-tag">${escapeHtml(t)}</span>`).join("");
    html += `<div class="tool-item${checked ? "" : " disabled"}">
      <div class="skill-item-info">
        <span class="tool-item-name">${escapeHtml(skill.name)}</span>
        <span class="skill-meta">${src} · ${pri}</span>
        ${skill.description ? `<span class="skill-desc">${escapeHtml(skill.description)}</span>` : ""}
        ${tags ? `<div class="skill-tags">${tags}</div>` : ""}
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-category="skills" data-name="${escapeHtml(skill.name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  }
  toolSettingsBody.innerHTML = html;
  bindToggleEvents();
}

function bindToggleEvents() {
  toolSettingsBody.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => {
      // 更新本地 disabled 数据
      const category = cb.dataset.category;
      const name = cb.dataset.name;
      if (!toolSettingsData || !category || !name) return;

      const list = toolSettingsData.disabled[category] || [];
      if (cb.checked) {
        // 移除 disabled
        toolSettingsData.disabled[category] = list.filter(n => n !== name);
      } else {
        // 添加 disabled
        if (!list.includes(name)) list.push(name);
        toolSettingsData.disabled[category] = list;
      }

      // 更新视觉状态
      const item = cb.closest(".tool-item");
      if (item) {
        item.classList.toggle("disabled", !cb.checked);
      }

      // 更新计数
      renderToolSettingsTab();
    });
  });
}

async function saveToolSettings() {
  if (!ws || !isReady || !toolSettingsData) return;

  saveToolSettingsBtn.textContent = "保存中...";
  saveToolSettingsBtn.disabled = true;

  const id = makeId();
  const res = await sendReq({
    type: "req", id, method: "tools.update",
    params: { disabled: toolSettingsData.disabled },
  });

  if (res && res.ok) {
    saveToolSettingsBtn.textContent = "已保存";
    setTimeout(() => {
      saveToolSettingsBtn.textContent = "保存";
      saveToolSettingsBtn.disabled = false;
    }, 1500);
  } else {
    saveToolSettingsBtn.textContent = "失败";
    saveToolSettingsBtn.disabled = false;
    alert("保存失败: " + (res?.error?.message || "未知错误"));
  }
}

// ─── Voice Input Implementation ───

function initVoiceInput() {
  const voiceBtn = document.getElementById("voiceBtn");
  const voiceDuration = document.getElementById("voiceDuration");
  if (!voiceBtn) return createNoopVoiceInputController();

  let mediaRecorder = null;
  let audioChunks = [];
  let startTime = 0;
  let timerInterval = null;
  let isRecording = false;

  // Check support
  const hasMediaRecorder = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const hasWebSpeech = !!(window.webkitSpeechRecognition || window.SpeechRecognition);

  if (!hasMediaRecorder && !hasWebSpeech) {
    voiceBtn.style.display = "none";
    return createNoopVoiceInputController();
  }

  const controller = {
    isSupported: true,
    isRecording() {
      return isRecording;
    },
    async toggle() {
      if (isRecording) {
        stopRecording();
        return false;
      }
      await startRecording();
      return true;
    },
    updateTitle() {
      const title = describeVoiceShortcutForTitle();
      voiceBtn.title = title;
      voiceBtn.setAttribute("aria-label", title);
    },
  };

  controller.updateTitle();

  voiceBtn.addEventListener("click", () => {
    void controller.toggle();
  });

  async function startRecording() {
    if (isRecording) return;
    try {
      if (hasMediaRecorder) {
        // Mode A: MediaRecorder (Backend STT)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/mp4"; // Safari fallback
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ""; // Let browser choose
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const recorder = mediaRecorder;
          const mime = recorder?.mimeType || "audio/webm";
          const blob = new Blob(audioChunks, { type: mime });
          const reader = new FileReader();
          reader.onloadend = () => {
            // reader.result is a full data URL: "data:audio/webm;base64,..."
            const ext = mime.includes("mp4") ? "m4a" : (mime.includes("wav") ? "wav" : "webm");
            const fileName = `voice_${Date.now()}.${ext}`;
            const content = typeof reader.result === "string" ? reader.result : "";
            const audioBytes = estimateDataUrlBytes(content);

            if (audioBytes > attachmentLimits.maxFileBytes) {
              renderAttachmentsPreview(
                `⚠️ 语音附件未加入：${fileName} 超过单文件上限 ${formatBytes(attachmentLimits.maxFileBytes)}。`
              );
              return;
            }
            if (estimatePendingAttachmentTotalBytes() + audioBytes > attachmentLimits.maxTotalBytes) {
              renderAttachmentsPreview(
                `⚠️ 语音附件未加入：加入后总大小会超过 ${formatBytes(attachmentLimits.maxTotalBytes)}。`
              );
              return;
            }

            pendingAttachments.push({
              name: fileName,
              type: "audio",
              mimeType: mime,
              content, // data URL, consistent with image attachments
            });
            renderAttachmentsPreview();

            sendMessage(); // Auto-send voice message
          };
          reader.readAsDataURL(blob);

          // Stop tracks
          stream.getTracks().forEach(track => track.stop());
          mediaRecorder = null;
        };

        mediaRecorder.start();
        isRecording = true;
        updateUI(true);
      } else if (hasWebSpeech) {
        // Mode B: Web Speech API (Frontend STT)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-CN'; // Default to Chinese, could be configurable
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          isRecording = true;
          updateUI(true, "listening");
        };

        recognition.onresult = (event) => {
          const text = event.results[0][0].transcript;
          if (promptEl.value) promptEl.value += " " + text;
          else promptEl.value = text;
          // Trigger input event to resize
          promptEl.dispatchEvent(new Event("input"));
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error", event.error);
          stopRecording();
        };

        recognition.onend = () => {
          isRecording = false;
          mediaRecorder = null;
          updateUI(false);
        };

        recognition.start();
        // Save reference to stop it later
        mediaRecorder = recognition;
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("无法启动录音: " + (err?.message || String(err)));
      isRecording = false;
      mediaRecorder = null;
      updateUI(false);
    }
  }

  function stopRecording() {
    if (!isRecording) return;
    const activeRecorder = mediaRecorder;

    isRecording = false;
    updateUI(false);

    if (hasMediaRecorder && activeRecorder instanceof MediaRecorder) {
      if (activeRecorder.state !== "inactive") {
        activeRecorder.stop();
      }
    } else if (hasWebSpeech && activeRecorder && typeof activeRecorder.stop === "function") {
      // In Web Speech mode, mediaRecorder holds the recognition instance
      try {
        activeRecorder.stop();
      } catch {
        mediaRecorder = null;
      }
    }
  }

  function updateUI(recording, mode = "recording") {
    if (recording) {
      voiceBtn.classList.add(mode);
      voiceDuration.classList.remove("hidden");
      startTime = Date.now();
      voiceDuration.textContent = "00:00";
      timerInterval = setInterval(() => {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const m = Math.floor(diff / 60).toString().padStart(2, "0");
        const s = (diff % 60).toString().padStart(2, "0");
        voiceDuration.textContent = `${m}:${s}`;
      }, 1000);
    } else {
      voiceBtn.classList.remove("recording", "listening");
      voiceDuration.classList.add("hidden");
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  }

  return controller;
}

