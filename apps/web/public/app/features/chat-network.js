function buildWebSocketUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}`;
}

function ensureDisconnectHint(statusEl) {
  if (!statusEl?.parentElement) return;
  if (document.getElementById("status-hint")) return;

  const hint = document.createElement("div");
  hint.id = "status-hint";
  hint.style.color = "#ff6b6b";
  hint.style.fontSize = "12px";
  hint.style.marginTop = "4px";
  hint.textContent = "If this persists in WSL, try accessing via IP (e.g. 172.x.x.x) instead of localhost.";
  statusEl.parentElement.appendChild(hint);
}

function normalizeTokenValue(value) {
  if (value.startsWith("setup-")) return value;
  if (/^\d+-\d+$/.test(value)) return `setup-${value}`;
  return value;
}

export function createChatNetworkFeature({
  refs,
  keys,
  getTransientUrlToken,
  getSocket,
  setSocket,
  getReady,
  setReady,
  persistConnectionFields,
  setStatus,
  safeJsonParse,
  makeId,
  debugLog,
  onHelloOk,
  onEvent,
}) {
  const {
    statusEl,
    sendBtn,
    authModeEl,
    authValueEl,
    workspaceRootsEl,
    userUuidEl,
    agentSelectEl,
    modelSelectEl,
  } = refs;

  const {
    storeKey,
    workspaceRootsKey,
    uuidKey,
    agentIdKey,
    modelIdKey,
    clientId,
  } = keys;

  const pendingReq = new Map();

  function isConnected() {
    return Boolean(getSocket() && getReady());
  }

  function teardown() {
    const socket = getSocket();
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore close failures
      }
    }
    setSocket(null);
    setReady(false);
  }

  function sendConnect() {
    const socket = getSocket();
    if (!socket) return;

    const mode = authModeEl?.value || "none";
    const rawValue = authValueEl?.value.trim() || "";
    const uuid = userUuidEl ? userUuidEl.value.trim() : "";
    debugLog?.("[UUID] sendConnect", { hasUuid: Boolean(uuid) });

    const auth =
      mode === "token"
        ? { mode: "token", token: normalizeTokenValue(rawValue) }
        : mode === "password"
          ? { mode: "password", password: rawValue }
          : { mode: "none" };

    const connectFrame = {
      type: "connect",
      role: "web",
      clientId,
      auth,
      clientName: "belldandy-webchat",
      clientVersion: "0.0.0",
    };

    if (uuid) {
      connectFrame.userUuid = uuid;
      debugLog?.("[UUID] Adding UUID to connect frame");
    } else {
      debugLog?.("[UUID] No UUID to send in connect frame");
    }

    socket.send(JSON.stringify(connectFrame));
  }

  function sendReq(frame) {
    const socket = getSocket();
    if (!socket) return Promise.resolve(null);

    socket.send(JSON.stringify(frame));
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

  async function loadAgentList() {
    if (!isConnected() || !agentSelectEl) return;

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "agents.list",
    });

    if (!res || !res.ok || !Array.isArray(res.payload?.agents)) return;

    const agents = res.payload.agents;
    if (agents.length <= 1) {
      agentSelectEl.classList.add("hidden");
      return;
    }

    agentSelectEl.innerHTML = "";
    for (const agent of agents) {
      const opt = document.createElement("option");
      opt.value = agent.id;
      opt.textContent = agent.displayName;
      agentSelectEl.appendChild(opt);
    }

    const saved = localStorage.getItem(agentIdKey);
    if (saved && agents.some((agent) => agent.id === saved)) {
      agentSelectEl.value = saved;
    }

    agentSelectEl.classList.remove("hidden");
  }

  async function loadModelList() {
    if (!isConnected() || !modelSelectEl) return;

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "models.list",
    });

    if (!res || !res.ok || !Array.isArray(res.payload?.models)) return;

    const models = res.payload.models;
    const currentDefault = typeof res.payload.currentDefault === "string" && res.payload.currentDefault.trim()
      ? res.payload.currentDefault.trim()
      : "primary";

    const defaultModel = models.find((model) => model.id === currentDefault);
    const defaultLabel = defaultModel?.displayName || defaultModel?.model || "默认模型";

    modelSelectEl.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = `默认模型 (${defaultLabel})`;
    modelSelectEl.appendChild(defaultOpt);

    for (const model of models) {
      if (!model || typeof model !== "object") continue;
      if (model.id === currentDefault) continue;
      const opt = document.createElement("option");
      opt.value = model.id;
      opt.textContent = model.displayName || model.model || model.id;
      modelSelectEl.appendChild(opt);
    }

    const saved = localStorage.getItem(modelIdKey);
    if (saved && [...modelSelectEl.options].some((opt) => opt.value === saved)) {
      modelSelectEl.value = saved;
    } else {
      modelSelectEl.value = "";
    }

    modelSelectEl.classList.toggle("hidden", modelSelectEl.options.length <= 1);
  }

  function connect() {
    persistConnectionFields({
      storeKey,
      workspaceRootsKey,
      uuidKey,
      authModeEl,
      authValueEl,
      workspaceRootsEl,
      userUuidEl,
      transientUrlToken: getTransientUrlToken?.(),
    });

    teardown();

    const socket = new WebSocket(buildWebSocketUrl());
    setSocket(socket);
    setReady(false);

    if (sendBtn) {
      sendBtn.disabled = true;
    }
    setStatus("connecting");

    socket.addEventListener("open", () => {
      setStatus("connected (awaiting challenge)");
    });

    socket.addEventListener("close", () => {
      const url = buildWebSocketUrl();
      setStatus(`disconnected (retrying ${url} in 3s...)`);
      ensureDisconnectHint(statusEl);
      setReady(false);
      if (sendBtn) {
        sendBtn.disabled = true;
      }
      setTimeout(() => {
        const currentSocket = getSocket();
        if (!currentSocket || currentSocket.readyState === WebSocket.CLOSED) {
          connect();
        }
      }, 3000);
    });

    socket.addEventListener("message", (evt) => {
      const frame = safeJsonParse(evt.data);
      if (!frame || typeof frame !== "object") return;

      if (frame.type === "connect.challenge") {
        sendConnect();
        return;
      }

      if (frame.type === "hello-ok") {
        setReady(true);
        if (sendBtn) {
          sendBtn.disabled = false;
        }
        setStatus("ready");
        onHelloOk?.(frame);
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
        onEvent?.(frame.event, frame.payload || {});
      }
    });
  }

  return {
    connect,
    isConnected,
    loadAgentList,
    loadModelList,
    sendReq,
    teardown,
  };
}
