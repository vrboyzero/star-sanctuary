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
const agentSelectEl = document.getElementById("agentSelect");

// 文件树和编辑器 DOM 元素
const sidebarEl = document.getElementById("sidebar");
const sidebarTitleEl = document.querySelector(".sidebar-title");
const fileTreeEl = document.getElementById("fileTree");
const refreshTreeBtn = document.getElementById("refreshTree");
const chatSection = document.getElementById("chatSection");
const editorSection = document.getElementById("editorSection");
const editorPath = document.getElementById("editorPath");
const editorTextarea = document.getElementById("editorTextarea");
const composerSection = document.getElementById("composerSection");
const editorActions = document.getElementById("editorActions");
const cancelEditBtn = document.getElementById("cancelEdit");
const saveEditBtn = document.getElementById("saveEdit");

const STORE_KEY = "belldandy.webchat.auth";
const CLIENT_KEY = "belldandy.webchat.clientId";
const WORKSPACE_ROOTS_KEY = "belldandy.webchat.workspaceRoots";
const AGENT_ID_KEY = "belldandy.webchat.agentId";
const UUID_KEY = "belldandy.webchat.userUuid"; // UUID存储键

let ws = null;
let isReady = false;
let activeConversationId = null;
let botMsgEl = null;
const pendingReq = new Map();
const clientId = resolveClientId();
let queuedText = null;

// 身份信息（从 hello-ok 获取）
let agentName = "Agent";
let agentAvatar = "🤖";
let userName = "User";
let userAvatar = "👤";

// 编辑器状态
let editorMode = false;
let currentEditPath = null;
let originalContent = null;
// Tree Mode: "root" | "facets"
let currentTreeMode = "root";
const expandedFolders = new Set();

// 附件状态
const attachmentsPreviewEl = document.getElementById("attachmentsPreview");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
let pendingAttachments = []; // { name, type, mimeType, content }

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
    console.log("[UUID] Saving UUID:", uuid);
    persistUuid();
    // 如果 WebSocket 已连接，重新连接以更新 UUID
    if (ws && isReady) {
      console.log("[UUID] UUID changed, reconnecting...");
      teardown();
      setTimeout(() => connect(), 100);
    } else {
      console.log("[UUID] WebSocket not connected, will use UUID on next connect");
    }
  });
}

// 监听 UUID 输入框的变化，自动保存并重新连接（备用方案）
if (userUuidEl) {
  userUuidEl.addEventListener("blur", () => {
    persistUuid();
    // 如果 WebSocket 已连接，重新连接以更新 UUID
    if (ws && isReady) {
      console.log("[UUID] UUID changed (blur), reconnecting...");
      teardown();
      setTimeout(() => connect(), 100);
    }
  });
}

// [NEW] Allow ?token=... param to override/set auth
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get("token");
if (urlToken) {
  authModeEl.value = "token";
  authValueEl.value = urlToken;
}

setStatus("disconnected");

connectBtn.addEventListener("click", () => connect());
sendBtn.addEventListener("click", () => sendMessage());
promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  // Auto-resize on keydown (for Shift+Enter immediately)
  setTimeout(() => {
    promptEl.style.height = "0";
    promptEl.style.height = promptEl.scrollHeight + "px";
  }, 0);
});

promptEl.addEventListener("input", () => {
  // Auto-resize
  promptEl.style.height = "0";
  promptEl.style.height = promptEl.scrollHeight + "px";
});

// Initialize Voice Input
initVoiceInput();

connect();

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
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ mode: authModeEl.value, value: authValueEl.value }),
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

// 从服务器加载可操作区配置值
async function loadWorkspaceRootsFromServer() {
  if (!ws || !isReady || !workspaceRootsEl) return;

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "config.read",
  });

  if (res && res.ok && res.payload && res.payload.config) {
    const serverValue = res.payload.config["BELLDANDY_EXTRA_WORKSPACE_ROOTS"];
    if (serverValue && serverValue !== "[REDACTED]") {
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

if (agentSelectEl) {
  agentSelectEl.addEventListener("change", () => {
    localStorage.setItem(AGENT_ID_KEY, agentSelectEl.value);

    // 切换 Agent = 新建会话（隔离上下文）
    activeConversationId = null;
    botMsgEl = null;
    messagesEl.innerHTML = "";
    const displayName = agentSelectEl.options[agentSelectEl.selectedIndex]?.text || agentSelectEl.value;
    appendMessage("system", `已切换到 ${displayName}`);
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
      ["tuSys", "tuCtx", "tuIn", "tuOut", "tuAll"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "--";
      });
      flushQueuedText();

      // 若服务端告知 AI 模型尚未配置（无 API Key），自动弹出设置面板引导用户
      if (frame.configOk === false) {
        setTimeout(() => {
          toggleSettings(true);
          // 在聊天区显示一条引导消息
          const guideMsg = appendMessage("bot", "👋 欢迎使用 Belldandy！\n\n检测到 AI 模型尚未配置。请在右侧设置面板填入你的 API Key，然后点击 Save 保存。");
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
    "Syncing with Belldandy Gateway...",
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
  console.log("[UUID] sendConnect - UUID from input:", uuid); // 添加调试日志
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
    console.log("[UUID] Adding UUID to connect frame:", uuid); // 添加调试日志
  } else {
    console.log("[UUID] No UUID to send in connect frame"); // 添加调试日志
  }

  console.log("[UUID] Sending connect frame:", JSON.stringify(connectFrame)); // 添加调试日志
  ws.send(JSON.stringify(connectFrame));
}

async function sendMessage() {
  const text = promptEl.value.trim();
  if (!text && !pendingAttachments.length) return;
  promptEl.value = "";

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

  const displayText = text || (pendingAttachments.length ? "[语音消息]" : "");
  appendMessage("me", displayText + (pendingAttachments.length ? ` [${pendingAttachments.length} 附件]` : ""));
  botMsgEl = appendMessage("bot", "");

  // 准备附件数据
  const attachments = pendingAttachments.map(att => {
    let base64 = "";
    if (typeof att.content === "string" && att.content.startsWith("data:")) {
      // Data URL (Image): strip prefix
      base64 = att.content.split(",")[1];
    } else {
      // Text content: convert to base64 (UTF-8 safe)
      try {
        base64 = window.btoa(unescape(encodeURIComponent(att.content)));
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

  pendingAttachments = [];
  renderAttachmentsPreview();

  // Canvas context injection: when user sends from canvas view, prepend board snapshot
  let finalText = text;
  const canvasSection = document.getElementById("canvasSection");
  if (canvasSection && !canvasSection.classList.contains("hidden") && window._canvasApp?.currentBoardId && window._canvasApp.manager?.board) {
    const snapshot = window._canvasApp.getCanvasSnapshot();
    if (snapshot) {
      finalText = `[当前画布上下文]\n${snapshot}\n\n[用户消息]\n${text}`;
    }
  }

  const id = makeId();
  const uuid = userUuidEl ? userUuidEl.value.trim() : ""; // 获取UUID
  const params = {
    conversationId: activeConversationId || undefined,
    text: finalText,
    from: "web",
    agentId: agentSelectEl?.value || undefined,
    attachments,
  };

  // 如果有UUID，添加到params
  if (uuid) {
    params.userUuid = uuid;
  }

  const payload = await sendReq({
    type: "req",
    id,
    method: "message.send",
    params,
  });

  if (payload && payload.ok === false) {
    if (payload.error && payload.error.code === "pairing_required") {
      const msg = payload.error.message ? String(payload.error.message) : "Pairing required.";
      botMsgEl.textContent = `${msg}\n\n请在项目目录下打开新终端，执行：\n  corepack pnpm bdd pairing approve <CODE>\n（将 <CODE> 替换为上方的配对码，然后再发送一次消息）`;
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
  }
}

// ... existing handleEvent ...

// --- Settings Logic ---
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettings");
const closeSettingsBtn = document.getElementById("closeSettings");
const saveSettingsBtn = document.getElementById("saveSettings");
const restartBtn = document.getElementById("restartBtn");

// Initialize Recommend API Link
const recommendApiLink = document.getElementById("recommendApiLink");
if (recommendApiLink && window.BELLDANDY_WEB_CONFIG?.recommendApiUrl) {
  recommendApiLink.href = window.BELLDANDY_WEB_CONFIG.recommendApiUrl;
}

const cfgApiKey = document.getElementById("cfgApiKey");
const cfgBaseUrl = document.getElementById("cfgBaseUrl");
const cfgModel = document.getElementById("cfgModel");
const cfgHeartbeat = document.getElementById("cfgHeartbeat");
const doctorStatusEl = document.getElementById("doctorStatus");

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

function toggleSettings(show) {
  if (show) {
    settingsModal.classList.remove("hidden");
    loadConfig();
    runDoctor();
  } else {
    settingsModal.classList.add("hidden");
  }
}

async function loadConfig() {
  if (!ws || !isReady) return;
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "config.read" });
  if (res && res.ok && res.payload && res.payload.config) {
    const c = res.payload.config;
    cfgApiKey.value = c["BELLDANDY_OPENAI_API_KEY"] || "";
    cfgBaseUrl.value = c["BELLDANDY_OPENAI_BASE_URL"] || "";
    cfgModel.value = c["BELLDANDY_OPENAI_MODEL"] || "";
    cfgHeartbeat.value = c["BELLDANDY_HEARTBEAT_INTERVAL"] || "";
  }
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
  if (cfgApiKey.value.trim()) updates["BELLDANDY_OPENAI_API_KEY"] = cfgApiKey.value.trim();
  if (cfgBaseUrl.value.trim()) updates["BELLDANDY_OPENAI_BASE_URL"] = cfgBaseUrl.value.trim();
  else if (!cfgBaseUrl.value) updates["BELLDANDY_OPENAI_BASE_URL"] = "https://api.openai.com/v1"; // Default?

  if (cfgModel.value.trim()) updates["BELLDANDY_OPENAI_MODEL"] = cfgModel.value.trim();
  if (cfgHeartbeat.value.trim()) updates["BELLDANDY_HEARTBEAT_INTERVAL"] = cfgHeartbeat.value.trim();

  // Set Provider to openai if key present (Lenient mode auto-enable)
  if (cfgApiKey.value.trim()) {
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
    botMsgEl.textContent =
      `需要配对（Pairing）。配对码：${code}\n\n` +
      `请在项目目录下打开新终端，执行：\n` +
      `  corepack pnpm bdd pairing approve ${code}\n` +
      `然后再发送一次消息。`;
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
  if (event === "chat.delta") {
    const delta = payload && payload.delta ? String(payload.delta) : "";
    if (!delta) return;
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");

    // [FIX] Use innerHTML to support audio tags and basic formatting
    // Note: Simple appending might break HTML structure during streaming, but strictly speaking
    // for <audio> tags at the start/end it usually works. 
    // Ideally we should re-render the whole markdown, but for now we trust the backend sends valid chunks.
    // However, += on innerHTML is bad for performance and can break open tags.
    // For now, let's just use the accumulative buffer logic if possible, or naive append.
    // Since we don't have the full text here easily without state, we might need to rely on the fact 
    // that `botMsgEl` is accumulating. 
    // BUT! `textContent +=` works for text. `innerHTML +=` re-parses everything.
    // Let's assume the delta is just text or complete tags for now.
    botMsgEl.innerHTML += delta;

    // 强制滚动到底部（测试模式）
    forceScrollToBottom();
    return;
  }
  if (event === "chat.final") {
    const text = payload && payload.text ? String(payload.text) : "";
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");

    // [FIX] Use innerHTML to support audio tags and basic formatting
    botMsgEl.innerHTML = text;

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

  for (const file of files) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    const isImage = allowedTypes.image.includes(ext);
    const isVideo = allowedTypes.video.includes(ext);
    const isText = allowedTypes.text.includes(ext);

    if (!isImage && !isVideo && !isText) {
      console.warn(`不支持的文件类型: ${file.name}`);
      continue;
    }

    try {
      // Images and Videos are read as Base64 Data URL
      const content = await readFileContent(file, isImage || isVideo);
      pendingAttachments.push({
        name: file.name,
        type: isImage ? "image" : (isVideo ? "video" : "text"),
        mimeType: file.type || (isImage ? "image/png" : (isVideo ? "video/mp4" : "text/plain")),
        content
      });
    } catch (err) {
      console.error(`读取文件失败: ${file.name}`, err);
    }
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

// 渲染附件预览
function renderAttachmentsPreview() {
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

if (switchRootBtn) {
  switchRootBtn.addEventListener("click", () => switchTreeMode("root"));
}
if (switchFacetBtn) {
  switchFacetBtn.addEventListener("click", () => switchTreeMode("facets"));
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
    return;
  }

  currentTreeMode = mode;
  expandedFolders.clear();

  // 更新 UI 样式
  if (switchRootBtn) {
    if (mode === "root") {
      switchRootBtn.style.background = "rgba(255,255,255,0.1)";
      switchRootBtn.style.opacity = "1";
    } else {
      switchRootBtn.style.background = "transparent";
      switchRootBtn.style.opacity = "0.7";
    }
  }
  if (switchFacetBtn) {
    if (mode === "facets") {
      switchFacetBtn.style.background = "rgba(255,255,255,0.1)";
      switchFacetBtn.style.opacity = "1";
    } else {
      switchFacetBtn.style.background = "transparent";
      switchFacetBtn.style.opacity = "0.7";
    }
  }

  // 确保侧边栏展开
  if (!sidebarExpanded) {
    toggleSidebar();
  } else {
    loadFileTree();
  }
}

// 打开 .env 文件进行编辑
async function openEnvFile() {
  if (!ws || !isReady) {
    alert("未连接到服务器");
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
    alert(`无法读取配置文件: ${msg}`);
    return;
  }

  currentEditPath = ".env";
  originalContent = res.payload.content;

  if (editorPath) editorPath.textContent = ".env (环境配置)";
  if (editorTextarea) editorTextarea.value = res.payload.content;

  switchMode("editor");
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
    alert("未连接到服务器");
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
    alert(`无法读取文件: ${msg}`);
    return;
  }

  currentEditPath = filePath;
  originalContent = res.payload.content;

  if (editorPath) editorPath.textContent = filePath;
  if (editorTextarea) editorTextarea.value = res.payload.content;

  switchMode("editor");

  // 刷新文件树以更新 active 状态
  loadFileTree();
}

// 保存文件
async function saveFile() {
  if (!ws || !isReady) {
    alert("未连接到服务器");
    return;
  }

  if (!currentEditPath) {
    alert("没有正在编辑的文件");
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
    alert(`保存失败: ${msg}`);
    return;
  }

  if (saveEditBtn) saveEditBtn.textContent = "已保存";

  setTimeout(() => {
    if (saveEditBtn) saveEditBtn.textContent = "保存";
    switchMode("chat");
    currentEditPath = null;
    originalContent = null;
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
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.remove("hidden");
  } else if (mode === "canvas") {
    if (chatSection) chatSection.classList.add("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (canvasSection) canvasSection.classList.remove("hidden");
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  } else {
    // chat (default)
    if (chatSection) chatSection.classList.remove("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (canvasSection) canvasSection.classList.add("hidden");
    if (composerSection) composerSection.classList.remove("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  }
}

// Expose switchMode for canvas.js
window._belldandySwitchMode = switchMode;

// Expose openFile for canvas.js (method node double-click → editor)
window._belldandyOpenFile = (filePath) => openFile(filePath);

// Expose loadConversation for canvas.js (session node double-click → chat)
window._belldandyLoadConversation = (conversationId) => {
  activeConversationId = conversationId;
  switchMode("chat");
  if (messagesEl) {
    messagesEl.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "system-msg";
    hint.textContent = `已切换到会话: ${conversationId}`;
    messagesEl.appendChild(hint);
  }
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

// ── Tool Settings (调用设置) ──
const toolSettingsModal = document.getElementById("toolSettingsModal");
const openToolSettingsBtn = document.getElementById("openToolSettings");
const closeToolSettingsBtn = document.getElementById("closeToolSettings");
const saveToolSettingsBtn = document.getElementById("saveToolSettings");
const toolSettingsBody = document.getElementById("toolSettingsBody");

let toolSettingsData = null; // { builtin, mcp, plugins, skills, disabled }
let toolSettingsActiveTab = "builtin";

if (openToolSettingsBtn) {
  openToolSettingsBtn.addEventListener("click", () => toggleToolSettings(true));
}
if (closeToolSettingsBtn) {
  closeToolSettingsBtn.addEventListener("click", () => toggleToolSettings(false));
}
if (saveToolSettingsBtn) {
  saveToolSettingsBtn.addEventListener("click", saveToolSettings);
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
    loadToolSettings();
  } else {
    toolSettingsModal.classList.add("hidden");
  }
}

async function loadToolSettings() {
  if (!ws || !isReady) {
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未连接</div>';
    return;
  }
  toolSettingsBody.innerHTML = '<div class="tool-settings-empty">加载中...</div>';

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "tools.list" });
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
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未加载插件（将 .js/.mjs 文件放入 ~/.belldandy/plugins/ 目录）</div>';
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
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未加载技能（将 SKILL.md 放入 ~/.belldandy/skills/ 目录）</div>';
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
  if (!voiceBtn) return;

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
    return;
  }

  voiceBtn.addEventListener("click", async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  async function startRecording() {
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
          const mime = mediaRecorder.mimeType || "audio/webm";
          const blob = new Blob(audioChunks, { type: mime });
          const reader = new FileReader();
          reader.onloadend = () => {
            // reader.result is a full data URL: "data:audio/webm;base64,..."
            const ext = mime.includes("mp4") ? "m4a" : (mime.includes("wav") ? "wav" : "webm");
            const fileName = `voice_${Date.now()}.${ext}`;

            pendingAttachments.push({
              name: fileName,
              type: "audio",
              mimeType: mime,
              content: reader.result, // data URL, consistent with image attachments
            });
            renderAttachmentsPreview();

            // Auto-send if prompt is empty, or just let user send
            // For better UX, we could auto-submit, but let's let user confirm for now (or auto-submit if separate setting)
            sendMessage(); // Auto-send voice message
          };
          reader.readAsDataURL(blob);

          // Stop tracks
          stream.getTracks().forEach(track => track.stop());
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
          promptEl.dispatchEvent(new Event('input'));
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error", event.error);
          stopRecording();
        };

        recognition.onend = () => {
          stopRecording();
        };

        recognition.start();
        // Save reference to stop it later
        mediaRecorder = recognition;
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("无法启动录音: " + err.message);
      isRecording = false;
      updateUI(false);
    }
  }

  function stopRecording() {
    if (!isRecording) return;

    if (hasMediaRecorder && mediaRecorder instanceof MediaRecorder) {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } else if (hasWebSpeech && mediaRecorder) {
      // In Web Speech mode, mediaRecorder holds the recognition instance
      mediaRecorder.stop();
    }

    isRecording = false;
    updateUI(false);
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
}
