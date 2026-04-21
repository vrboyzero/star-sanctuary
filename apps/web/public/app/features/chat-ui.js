const SAFE_ASSISTANT_TAGS = new Set([
  "A", "AUDIO", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "H1", "H2", "H3", "H4", "H5", "H6", "HR",
  "I", "IMG", "LI", "OL", "P", "PRE", "SOURCE", "SPAN", "STRONG", "UL", "VIDEO", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "BUTTON", "SVG", "PATH", "RECT",
]);

const SAFE_ASSISTANT_ATTRS = {
  A: new Set(["href", "title", "target", "rel"]),
  AUDIO: new Set(["src", "controls", "autoplay", "preload", "loop"]),
  IMG: new Set(["src", "alt", "title"]),
  SOURCE: new Set(["src", "type"]),
  VIDEO: new Set(["src", "controls", "autoplay", "muted", "loop", "playsinline", "preload", "poster"]),
  CODE: new Set(["class", "language"]),
  PRE: new Set(["class"]),
  DIV: new Set(["class"]),
  SPAN: new Set(["class"]),
  BUTTON: new Set(["class", "title", "onclick"]),
  SVG: new Set(["width", "height", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "xmlns", "class"]),
  PATH: new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]),
  RECT: new Set(["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width"]),
};

export function createChatUiFeature({
  refs,
  getAgentProfile,
  getUserProfile,
  getCurrentAgentId,
  escapeHtml,
  showNotice,
  getAvatarUploadHeaders,
  onAvatarUploaded,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const { messagesEl, chatSection } = refs;
  let markedConfigured = false;
  let copyDelegationBound = false;
  let avatarUploadInput = null;
  let avatarUploadBusy = false;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatLocalTimeShort(timestampMs) {
    if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) return "";
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  function formatLocalTimeLong(timestampMs) {
    if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) return "";
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) return "";
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absOffset = Math.abs(offsetMinutes);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    const offsetText = minutes > 0 ? `GMT${sign}${hours}:${pad2(minutes)}` : `GMT${sign}${hours}`;
    return `${formatLocalTimeShort(timestampMs)} ${offsetText}`;
  }

  function clearLatestMarkers() {
    if (!messagesEl) return;
    messagesEl.querySelectorAll(".msg-wrapper[data-latest='true']").forEach((node) => {
      node.setAttribute("data-latest", "false");
      const bubble = node.querySelector(".msg[data-latest='true']");
      if (bubble instanceof HTMLElement) {
        bubble.setAttribute("data-latest", "false");
      }
      const badge = node.querySelector(".msg-latest-badge");
      if (badge) {
        badge.classList.add("hidden");
      }
    });
  }

  function ensureMetaRow(bubble) {
    if (!(bubble instanceof HTMLElement)) return null;
    const wrapper = bubble.closest(".msg-wrapper");
    const contentWrapper = bubble.closest(".msg-content-wrapper");
    if (!(wrapper instanceof HTMLElement) || !(contentWrapper instanceof HTMLElement)) return null;

    let metaRow = contentWrapper.querySelector(".msg-meta");
    if (!(metaRow instanceof HTMLElement)) {
      metaRow = document.createElement("div");
      metaRow.className = "msg-meta";

      const actionsEl = document.createElement("div");
      actionsEl.className = "msg-meta-actions";
      metaRow.appendChild(actionsEl);

      const timeEl = document.createElement("span");
      timeEl.className = "msg-time";
      metaRow.appendChild(timeEl);

      const latestEl = document.createElement("span");
      latestEl.className = "msg-latest-badge hidden";
      latestEl.textContent = t("chat.latestBadge", {}, "Latest");
      metaRow.appendChild(latestEl);

      bubble.insertAdjacentElement("afterend", metaRow);
    }

    return metaRow;
  }

  function updateMessageMeta(bubble, meta = {}) {
    if (!(bubble instanceof HTMLElement)) return;
    const wrapper = bubble.closest(".msg-wrapper");
    if (!(wrapper instanceof HTMLElement)) return;

    const metaRow = ensureMetaRow(bubble);
    if (!(metaRow instanceof HTMLElement)) return;

    const timeEl = metaRow.querySelector(".msg-time");
    const latestEl = metaRow.querySelector(".msg-latest-badge");
    const actionsEl = metaRow.querySelector(".msg-meta-actions");
    const timestampMs = typeof meta.timestampMs === "number" && Number.isFinite(meta.timestampMs)
      ? meta.timestampMs
      : undefined;
    const displayTimeText = typeof meta.displayTimeText === "string" && meta.displayTimeText.trim()
      ? meta.displayTimeText.trim()
      : (timestampMs !== undefined ? formatLocalTimeLong(timestampMs) : "");
    const displayTimeShort = timestampMs !== undefined ? formatLocalTimeShort(timestampMs) : "";
    const isLatest = meta.isLatest === true;

    if (timestampMs !== undefined) {
      wrapper.dataset.timestampMs = String(timestampMs);
      bubble.dataset.timestampMs = String(timestampMs);
    }

    if (timeEl instanceof HTMLElement) {
      const shortText = displayTimeShort || displayTimeText || "";
      timeEl.textContent = shortText;
      timeEl.title = displayTimeText || shortText;
      timeEl.classList.toggle("hidden", !shortText);
    }

    if (actionsEl instanceof HTMLElement) {
      actionsEl.classList.toggle("hidden", !actionsEl.childElementCount);
    }

    if (isLatest) {
      clearLatestMarkers();
    }
    wrapper.setAttribute("data-latest", isLatest ? "true" : "false");
    bubble.setAttribute("data-latest", isLatest ? "true" : "false");
    if (latestEl instanceof HTMLElement) {
      latestEl.classList.toggle("hidden", !isLatest);
    }
  }

  function renderAssistantMessage(bubble, rawText) {
    if (!(bubble instanceof HTMLElement)) return;
    const strippedText = stripThinkBlocks(rawText || "");
    configureMarkedOnce();
    const parsedHtml = window.marked ? window.marked.parse(strippedText) : strippedText;
    const sanitizedHtml = sanitizeAssistantHtml(parsedHtml);
    const body = ensureAssistantMessageBody(bubble);
    if (!(body instanceof HTMLElement)) return;
    body.innerHTML = sanitizedHtml;
    processMediaInMessage(body);
    updateAssistantMessageAccessibility(bubble, body, strippedText);
  }

  function ensureAssistantMessageBody(bubble) {
    if (!(bubble instanceof HTMLElement)) return null;
    let body = bubble.querySelector(":scope > .msg-body");
    if (!(body instanceof HTMLElement)) {
      bubble.replaceChildren();
      body = document.createElement("div");
      body.className = "msg-body";
      body.setAttribute("role", "article");
      body.setAttribute("aria-live", "polite");
      body.setAttribute("aria-atomic", "true");
      bubble.appendChild(body);
    }
    return body;
  }

  function normalizeMessageText(value) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim();
  }

  function updateAssistantMessageAccessibility(bubble, body, fallbackText = "") {
    if (!(bubble instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
    const normalizedText = normalizeMessageText(body.textContent || fallbackText);
    bubble.dataset.messageText = normalizedText;
    body.dataset.messageText = normalizedText;
    if (normalizedText) {
      body.setAttribute("aria-label", normalizedText);
    } else {
      body.removeAttribute("aria-label");
    }
  }

  function isImagePath(value) {
    if (!value || typeof value !== "string") return false;
    if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("//")) {
      return true;
    }
    if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
      return true;
    }
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico"];
    const lowerValue = value.toLowerCase();
    return imageExts.some((ext) => lowerValue.includes(ext));
  }

  function applyAvatarVisual(avatarEl, avatarSrc) {
    if (!avatarEl) return;
    avatarEl.style.backgroundImage = "";
    avatarEl.classList.remove("avatar-image");
    avatarEl.textContent = "";

    if (isImagePath(avatarSrc)) {
      avatarEl.style.backgroundImage = `url(${avatarSrc})`;
      avatarEl.classList.add("avatar-image");
      return;
    }

    avatarEl.textContent = avatarSrc || "";
  }

  function refreshAvatar(kind, avatarSrc) {
    if (!messagesEl) return;
    const selector = kind === "bot" ? ".msg-wrapper.bot .msg-avatar" : ".msg-wrapper.me .msg-avatar";
    messagesEl.querySelectorAll(selector).forEach((avatarEl) => {
      applyAvatarVisual(avatarEl, avatarSrc);
      avatarEl.title = kind === "bot"
        ? t("chat.avatarAgentTitle", {}, "Change agent avatar")
        : t("chat.avatarUserTitle", {}, "Change user avatar");
      avatarEl.classList.add("avatar-clickable");
    });
  }

  function ensureAvatarUploadInput() {
    if (avatarUploadInput) return avatarUploadInput;
    avatarUploadInput = document.createElement("input");
    avatarUploadInput.type = "file";
    avatarUploadInput.accept = "image/png,image/jpeg,image/gif,image/webp";
    avatarUploadInput.className = "hidden";
    document.body.appendChild(avatarUploadInput);
    return avatarUploadInput;
  }

  function buildUploadHeaders() {
    if (typeof getAvatarUploadHeaders !== "function") return {};
    const headers = getAvatarUploadHeaders();
    return headers && typeof headers === "object" ? headers : {};
  }

  async function uploadAvatar(role, file) {
    if (avatarUploadBusy) return;
    avatarUploadBusy = true;

    try {
      const formData = new FormData();
      formData.append("role", role);
      if (role === "agent") {
        const agentId = typeof getCurrentAgentId === "function" ? getCurrentAgentId() : "";
        if (agentId && agentId !== "default") {
          formData.append("agentId", agentId);
        }
      }
      formData.append("file", file, file.name || "avatar.png");

      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        body: formData,
        headers: buildUploadHeaders(),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        const message = payload?.error?.message || t("chat.avatarUploadFailedMessage", {}, "Failed to upload avatar.");
        showNotice?.(t("chat.avatarUploadFailedTitle", {}, "Avatar upload failed"), message, "error", 3800);
        return;
      }

      const avatarPath = typeof payload.avatarPath === "string" ? payload.avatarPath : "";
      if (!avatarPath) {
        showNotice?.(
          t("chat.avatarUploadFailedTitle", {}, "Avatar upload failed"),
          t("chat.avatarMissingPathMessage", {}, "The server did not return an avatar path."),
          "error",
          3800,
        );
        return;
      }

      onAvatarUploaded?.({
        role,
        agentId: role === "agent" && typeof getCurrentAgentId === "function" ? getCurrentAgentId() : undefined,
        avatarPath,
        mdPath: typeof payload.mdPath === "string" ? payload.mdPath : "",
      });

      showNotice?.(
        t("chat.avatarUpdatedTitle", {}, "Avatar updated"),
        role === "agent"
          ? t("chat.avatarAgentUpdatedMessage", {}, "The agent avatar has been written to the corresponding IDENTITY.md.")
          : t("chat.avatarUserUpdatedMessage", {}, "The user avatar has been written to USER.md."),
        "success",
        2200,
      );
    } catch (error) {
      showNotice?.(
        t("chat.avatarUploadFailedTitle", {}, "Avatar upload failed"),
        error instanceof Error ? error.message : String(error),
        "error",
        3800,
      );
    } finally {
      avatarUploadBusy = false;
    }
  }

  function openAvatarPicker(kind) {
    const input = ensureAvatarUploadInput();
    input.value = "";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const role = kind === "bot" ? "agent" : "user";
      await uploadAvatar(role, file);
    };
    input.click();
  }

  function forceScrollToBottom() {
    if (!chatSection) return;
    chatSection.scrollTop = chatSection.scrollHeight;
  }

  function appendMessage(kind, text, meta = {}) {
    if (!messagesEl) return null;

    if (kind === "system") {
      const systemEl = document.createElement("div");
      systemEl.className = "system-msg";
      systemEl.textContent = text;
      messagesEl.appendChild(systemEl);
      forceScrollToBottom();
      return systemEl;
    }

    const wrapper = document.createElement("div");
    wrapper.className = `msg-wrapper ${kind}`;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar avatar-clickable";

    const profile = kind === "bot" ? getAgentProfile?.() : getUserProfile?.();
    const avatarSrc = profile?.avatar || "";
    applyAvatarVisual(avatar, avatarSrc);
    avatar.title = kind === "bot"
      ? t("chat.avatarAgentTitle", {}, "Change agent avatar")
      : t("chat.avatarUserTitle", {}, "Change user avatar");
    avatar.addEventListener("click", (event) => {
      event.stopPropagation();
      openAvatarPicker(kind);
    });

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "msg-content-wrapper";

    const nameEl = document.createElement("div");
    nameEl.className = "msg-name";
    nameEl.textContent = profile?.name || "";

    const bubble = document.createElement("div");
    bubble.className = `msg ${kind}`;
    bubble.textContent = text;
    if (kind === "bot") {
      bubble.dataset.messageText = "";
    }

    contentWrapper.appendChild(nameEl);
    contentWrapper.appendChild(bubble);

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentWrapper);
    messagesEl.appendChild(wrapper);

    if (kind === "bot") {
      const metaRow = ensureMetaRow(bubble);
      const metaActionsEl = metaRow?.querySelector(".msg-meta-actions");

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-msg-btn";
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg> ${escapeHtml(t("chat.copy", {}, "Copy"))}
      `;
      copyBtn.title = t("chat.copyFullTitle", {}, "Copy full message");
      metaActionsEl?.appendChild(copyBtn);
    }

    updateMessageMeta(bubble, meta);
    forceScrollToBottom();
    return bubble;
  }

  function openMediaModal(src, type) {
    const modal = document.createElement("div");
    modal.className = "media-modal";
    modal.addEventListener("click", () => modal.remove());

    const content = document.createElement("div");
    content.className = "media-modal-content";
    content.addEventListener("click", (event) => event.stopPropagation());

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

  function processMediaInMessage(msgEl) {
    if (!msgEl) return;

    msgEl.querySelectorAll("img").forEach((img) => {
      const originalSrc = img.src;
      const wrapper = document.createElement("div");
      wrapper.className = "media-thumbnail";
      wrapper.style.backgroundImage = `url(${originalSrc})`;
      wrapper.title = t("chat.mediaOpenImage", {}, "Open full image");
      wrapper.addEventListener("click", () => openMediaModal(originalSrc, "image"));
      img.replaceWith(wrapper);
    });

    msgEl.querySelectorAll("video").forEach((video) => {
      const originalSrc = video.src || video.querySelector("source")?.src;
      if (!originalSrc) return;

      const wrapper = document.createElement("div");
      wrapper.className = "media-thumbnail video-thumbnail";
      wrapper.title = t("chat.mediaOpenVideo", {}, "Play video");

      const playIcon = document.createElement("div");
      playIcon.className = "play-icon";
      playIcon.textContent = "▶";
      wrapper.appendChild(playIcon);

      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 150;
      const ctx = canvas.getContext("2d");
      video.addEventListener("loadeddata", () => {
        if (!ctx) return;
        try {
          ctx.drawImage(video, 0, 0, 200, 150);
          wrapper.style.backgroundImage = `url(${canvas.toDataURL()})`;
        } catch {
          // Cross-origin / codec restrictions can block thumbnail extraction.
        }
      }, { once: true });

      wrapper.addEventListener("click", () => openMediaModal(originalSrc, "video"));
      video.replaceWith(wrapper);
    });
  }

  function configureMarkedOnce() {
    if (markedConfigured || !window.marked) return;
    const renderer = new window.marked.Renderer();
    renderer.code = function (code, language) {
      return `<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="code-block-lang">${language || ""}</span>
    <button class="copy-code-btn" title="${escapeHtml(t("chat.copyCodeTitle", {}, "Copy code"))}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> ${escapeHtml(t("chat.copy", {}, "Copy"))}
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
    let stripped = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
    stripped = stripped.replace(/<think>[\s\S]*$/, "");
    return stripped;
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

  function sanitizeAssistantHtml(rawHtml) {
    if (!rawHtml) return "";
    const template = document.createElement("template");
    template.innerHTML = rawHtml;
    for (const node of Array.from(template.content.childNodes)) {
      sanitizeAssistantNode(node);
    }
    return template.innerHTML;
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

  async function copyTextWithFeedback(button, text) {
    if (!button) return;
    try {
      await navigator.clipboard.writeText(text);
      const originalHtml = button.innerHTML;
      button.innerHTML = escapeHtml(t("chat.copied", {}, "Copied"));
      setTimeout(() => {
        button.innerHTML = originalHtml;
      }, 2000);
    } catch (error) {
      console.error("复制失败", error);
    }
  }

  function initCopyButtonDelegation() {
    if (copyDelegationBound) return;
    copyDelegationBound = true;

    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const codeBtn = target.closest(".copy-code-btn");
      if (codeBtn) {
        const wrapper = codeBtn.closest(".code-block-wrapper");
        const codeEl = wrapper?.querySelector("code");
        if (codeEl) {
          await copyTextWithFeedback(codeBtn, codeEl.textContent || "");
        }
        return;
      }

      const msgBtn = target.closest(".copy-msg-btn");
      if (msgBtn) {
        const wrapper = msgBtn.closest(".msg-content-wrapper");
        const bubble = wrapper?.querySelector(".msg");
        if (bubble) {
          const messageText = bubble.dataset.messageText || bubble.querySelector(".msg-body")?.dataset.messageText || bubble.textContent || "";
          await copyTextWithFeedback(msgBtn, messageText);
        }
      }
    });
  }

  return {
    appendMessage,
    configureMarkedOnce,
    forceScrollToBottom,
    initCopyButtonDelegation,
    openMediaModal,
    processMediaInMessage,
    refreshAvatar,
    renderAssistantMessage,
    sanitizeAssistantHtml,
    stripThinkBlocks,
    updateMessageMeta,
  };
}
