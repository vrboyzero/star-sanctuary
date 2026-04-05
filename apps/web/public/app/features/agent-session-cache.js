function normalizeMessage(message, fallbackRole = "assistant") {
  if (!message || typeof message !== "object") return null;
  const role = message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : fallbackRole;
  return {
    id: typeof message.id === "string" ? message.id : undefined,
    role,
    content: typeof message.content === "string" ? message.content : String(message.content ?? ""),
    timestampMs: typeof message.timestampMs === "number" && Number.isFinite(message.timestampMs)
      ? message.timestampMs
      : Date.now(),
    displayTimeText: typeof message.displayTimeText === "string" ? message.displayTimeText : "",
    isLatest: message.isLatest === true,
    agentId: typeof message.agentId === "string" ? message.agentId : undefined,
    __streaming: message.__streaming === true,
  };
}

function clearLatestFlags(items) {
  for (const item of items) {
    if (item) item.isLatest = false;
  }
}

export function createAgentSessionCacheFeature() {
  const agentConversationMap = new Map();
  const conversationMessagesCache = new Map();

  function bindAgentConversation(agentId, conversationId, options = {}) {
    if (!agentId || !conversationId) return;
    const existing = agentConversationMap.get(agentId) || {};
    const next = {
      mainConversationId: existing.mainConversationId || "",
      lastConversationId: existing.lastConversationId || "",
    };
    if (options.main) {
      next.mainConversationId = conversationId;
    }
    next.lastConversationId = conversationId;
    if (!next.mainConversationId) {
      next.mainConversationId = conversationId;
    }
    agentConversationMap.set(agentId, next);
  }

  function getAgentConversation(agentId) {
    const entry = agentConversationMap.get(agentId);
    return entry?.lastConversationId || entry?.mainConversationId || "";
  }

  function setConversationMessages(conversationId, messages) {
    if (!conversationId) return;
    const normalized = Array.isArray(messages)
      ? messages.map((item) => normalizeMessage(item)).filter(Boolean)
      : [];
    clearLatestFlags(normalized);
    if (normalized.length > 0) {
      normalized[normalized.length - 1].isLatest = true;
    }
    conversationMessagesCache.set(conversationId, normalized);
  }

  function getConversationMessages(conversationId) {
    const items = conversationMessagesCache.get(conversationId);
    return Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  }

  function appendConversationMessage(conversationId, message) {
    if (!conversationId) return null;
    const normalized = normalizeMessage(message);
    if (!normalized) return null;
    const current = getConversationMessages(conversationId);
    clearLatestFlags(current);
    normalized.isLatest = true;
    current.push(normalized);
    conversationMessagesCache.set(conversationId, current);
    return normalized;
  }

  function appendUserMessage(conversationId, content, meta = {}) {
    return appendConversationMessage(conversationId, {
      role: "user",
      content,
      timestampMs: meta.timestampMs,
      displayTimeText: meta.displayTimeText,
      isLatest: true,
      agentId: meta.agentId,
    });
  }

  function appendAssistantDelta(conversationId, delta, meta = {}) {
    if (!conversationId || !delta) return;
    const current = getConversationMessages(conversationId);
    const latest = current[current.length - 1];
    if (latest && latest.role === "assistant" && latest.__streaming === true) {
      latest.content += delta;
      if (typeof meta.timestampMs === "number") {
        latest.timestampMs = meta.timestampMs;
      }
      latest.isLatest = true;
      conversationMessagesCache.set(conversationId, current);
      return;
    }

    clearLatestFlags(current);
    current.push({
      role: "assistant",
      content: delta,
      timestampMs: typeof meta.timestampMs === "number" ? meta.timestampMs : Date.now(),
      displayTimeText: typeof meta.displayTimeText === "string" ? meta.displayTimeText : "",
      isLatest: true,
      agentId: typeof meta.agentId === "string" ? meta.agentId : undefined,
      __streaming: true,
    });
    conversationMessagesCache.set(conversationId, current);
  }

  function finalizeAssistantMessage(conversationId, content, meta = {}) {
    if (!conversationId) return;
    const current = getConversationMessages(conversationId);
    const latest = current[current.length - 1];
    clearLatestFlags(current);
    if (latest && latest.role === "assistant") {
      latest.content = typeof content === "string" ? content : String(content ?? "");
      latest.timestampMs = typeof meta.timestampMs === "number" ? meta.timestampMs : latest.timestampMs;
      latest.displayTimeText = typeof meta.displayTimeText === "string" ? meta.displayTimeText : latest.displayTimeText;
      latest.isLatest = true;
      latest.__streaming = false;
      conversationMessagesCache.set(conversationId, current);
      return;
    }

    current.push({
      role: "assistant",
      content: typeof content === "string" ? content : String(content ?? ""),
      timestampMs: typeof meta.timestampMs === "number" ? meta.timestampMs : Date.now(),
      displayTimeText: typeof meta.displayTimeText === "string" ? meta.displayTimeText : "",
      isLatest: true,
      agentId: typeof meta.agentId === "string" ? meta.agentId : undefined,
      __streaming: false,
    });
    conversationMessagesCache.set(conversationId, current);
  }

  return {
    bindAgentConversation,
    getAgentConversation,
    setConversationMessages,
    getConversationMessages,
    appendConversationMessage,
    appendUserMessage,
    appendAssistantDelta,
    finalizeAssistantMessage,
  };
}
