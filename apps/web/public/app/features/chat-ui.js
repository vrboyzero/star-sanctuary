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
  escapeHtml,
}) {
  const { messagesEl, chatSection } = refs;
  let markedConfigured = false;
  let copyDelegationBound = false;

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

  function forceScrollToBottom() {
    if (!chatSection) return;
    chatSection.scrollTop = chatSection.scrollHeight;
  }

  function appendMessage(kind, text) {
    if (!messagesEl) return null;

    const wrapper = document.createElement("div");
    wrapper.className = `msg-wrapper ${kind}`;

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";

    const profile = kind === "bot" ? getAgentProfile?.() : getUserProfile?.();
    const avatarSrc = profile?.avatar || "";
    if (isImagePath(avatarSrc)) {
      avatar.style.backgroundImage = `url(${avatarSrc})`;
      avatar.classList.add("avatar-image");
    } else {
      avatar.textContent = avatarSrc;
    }

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "msg-content-wrapper";

    const nameEl = document.createElement("div");
    nameEl.className = "msg-name";
    nameEl.textContent = profile?.name || "";

    const bubble = document.createElement("div");
    bubble.className = `msg ${kind}`;
    bubble.textContent = text;

    contentWrapper.appendChild(nameEl);
    contentWrapper.appendChild(bubble);

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
      wrapper.title = "点击查看原图";
      wrapper.addEventListener("click", () => openMediaModal(originalSrc, "image"));
      img.replaceWith(wrapper);
    });

    msgEl.querySelectorAll("video").forEach((video) => {
      const originalSrc = video.src || video.querySelector("source")?.src;
      if (!originalSrc) return;

      const wrapper = document.createElement("div");
      wrapper.className = "media-thumbnail video-thumbnail";
      wrapper.title = "点击播放视频";

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
      button.innerHTML = "已复制";
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
          await copyTextWithFeedback(msgBtn, bubble.textContent || "");
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
    sanitizeAssistantHtml,
    stripThinkBlocks,
  };
}
