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

function cloneShortcut(shortcut) {
  return shortcut ? { ...shortcut } : null;
}

export function createVoiceFeature({
  storageKey,
  disabledValue,
  defaultShortcut,
  promptEl,
  composerSection,
  voiceButtonEl,
  voiceDurationEl,
  getIsSettingsOpen,
  syncPromptHeight,
  estimateDataUrlBytes,
  estimatePendingAttachmentTotalBytes,
  getAttachmentLimits,
  formatBytes,
  addAttachment,
  renderAttachmentsPreview,
  onSendMessage,
  t = (_key, _params, fallback) => fallback ?? "",
  getSpeechRecognitionLocale = () => "zh-CN",
}) {
  let shortcutBinding = loadVoiceShortcutSetting();
  let shortcutCaptureActive = false;
  let shortcutInputEl = null;
  let shortcutStatusEl = null;
  let shortcutDefaultBtn = null;
  let shortcutClearBtn = null;
  let voiceInputController = initVoiceInput();

  function getDefaultVoiceShortcut() {
    return cloneShortcut(defaultShortcut);
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
      const raw = localStorage.getItem(storageKey);
      if (!raw) return getDefaultVoiceShortcut();
      if (raw === disabledValue) return null;
      return normalizeVoiceShortcut(JSON.parse(raw)) || getDefaultVoiceShortcut();
    } catch {
      return getDefaultVoiceShortcut();
    }
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
    if (!shortcut) return t("voice.shortcutDisabled", {}, "Disabled");
    const parts = [];
    if (shortcut.ctrlKey) parts.push("Ctrl");
    if (shortcut.altKey) parts.push("Alt");
    if (shortcut.shiftKey) parts.push("Shift");
    if (shortcut.metaKey) parts.push("Meta");
    parts.push(formatVoiceShortcutKey(shortcut.code));
    return parts.join("+");
  }

  function describeVoiceShortcutForTitle() {
    return shortcutBinding
      ? t("voice.titleWithShortcut", { shortcut: formatVoiceShortcut(shortcutBinding) }, "Voice input (click or {shortcut} to toggle recording)")
      : t("voice.titleWithoutShortcut", {}, "Voice input (click to toggle recording)");
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

  function renderVoiceShortcutSetting(message = "") {
    if (shortcutInputEl) {
      shortcutInputEl.value = formatVoiceShortcut(shortcutBinding);
    }
    if (shortcutStatusEl) {
      if (shortcutCaptureActive) {
        shortcutStatusEl.textContent = message || t("voice.shortcutCapture", {}, "Press a new shortcut. Esc cancels, Backspace/Delete disables it.");
      } else if (message) {
        shortcutStatusEl.textContent = message;
      } else {
        shortcutStatusEl.textContent = t(
          "voice.shortcutStatus",
          {
            current: formatVoiceShortcut(shortcutBinding),
            default: formatVoiceShortcut(defaultShortcut),
          },
          "Local shortcut, current: {current}. Default {default}. This is not written to server config.",
        );
      }
    }
  }

  function persistVoiceShortcutSetting(shortcut) {
    const normalized = normalizeVoiceShortcut(shortcut);
    shortcutBinding = shortcut === null ? null : (normalized || getDefaultVoiceShortcut());
    try {
      if (shortcutBinding === null) {
        localStorage.setItem(storageKey, disabledValue);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(shortcutBinding));
      }
    } catch {
      // ignore local persistence failures
    }
    renderVoiceShortcutSetting();
    voiceInputController.updateTitle();
  }

  function shouldHandleVoiceShortcut(event) {
    if (!shortcutBinding || !voiceInputController.isSupported) return false;
    if (!matchesVoiceShortcut(event, shortcutBinding)) return false;
    if (event.defaultPrevented || event.repeat || event.isComposing) return false;
    if (shortcutCaptureActive) return false;
    if (getIsSettingsOpen?.()) return false;
    if (!composerSection || composerSection.classList.contains("hidden")) return false;
    return true;
  }

  function bindSettingsUI({ inputEl, statusEl, defaultBtn, clearBtn }) {
    shortcutInputEl = inputEl || null;
    shortcutStatusEl = statusEl || null;
    shortcutDefaultBtn = defaultBtn || null;
    shortcutClearBtn = clearBtn || null;

    if (shortcutInputEl) {
      shortcutInputEl.addEventListener("focus", () => {
        shortcutCaptureActive = true;
        renderVoiceShortcutSetting(
          t("voice.shortcutCapture", {}, "Press a new shortcut. Esc cancels, Backspace/Delete disables it."),
        );
      });
      shortcutInputEl.addEventListener("blur", () => {
        shortcutCaptureActive = false;
        renderVoiceShortcutSetting();
      });
      shortcutInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          shortcutCaptureActive = false;
          renderVoiceShortcutSetting();
          return;
        }
        event.preventDefault();
        event.stopPropagation();

        if (event.key === "Escape") {
          shortcutCaptureActive = false;
          shortcutInputEl.blur();
          renderVoiceShortcutSetting();
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          persistVoiceShortcutSetting(null);
          shortcutCaptureActive = false;
          shortcutInputEl.blur();
          renderVoiceShortcutSetting();
          return;
        }

        const nextShortcut = buildVoiceShortcutFromEvent(event);
        if (!nextShortcut) {
          renderVoiceShortcutSetting(
            t("voice.shortcutCapture", {}, "Press a new shortcut. Esc cancels, Backspace/Delete disables it."),
          );
          return;
        }

        persistVoiceShortcutSetting(nextShortcut);
        shortcutCaptureActive = false;
        shortcutInputEl.blur();
        renderVoiceShortcutSetting(
          t("voice.shortcutSaved", { shortcut: formatVoiceShortcut(nextShortcut) }, "Shortcut saved as {shortcut}."),
        );
      });
    }

    if (shortcutDefaultBtn) {
      shortcutDefaultBtn.addEventListener("click", () => {
        persistVoiceShortcutSetting(getDefaultVoiceShortcut());
        renderVoiceShortcutSetting(
          t("voice.shortcutRestored", { shortcut: formatVoiceShortcut(shortcutBinding) }, "Restored default shortcut {shortcut}."),
        );
      });
    }

    if (shortcutClearBtn) {
      shortcutClearBtn.addEventListener("click", () => {
        persistVoiceShortcutSetting(null);
        renderVoiceShortcutSetting();
      });
    }
  }

  function onSettingsToggle(show) {
    if (show) {
      renderVoiceShortcutSetting();
      return;
    }
    shortcutCaptureActive = false;
  }

  function handleGlobalKeydown(event) {
    if (!shouldHandleVoiceShortcut(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    void voiceInputController.toggle();
    return true;
  }

  function initVoiceInput() {
    if (!voiceButtonEl) return createNoopVoiceInputController();

    let mediaRecorder = null;
    let audioChunks = [];
    let startTime = 0;
    let timerInterval = null;
    let isRecording = false;

    const hasMediaRecorder = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    const hasWebSpeech = !!(window.webkitSpeechRecognition || window.SpeechRecognition);

    if (!hasMediaRecorder && !hasWebSpeech) {
      voiceButtonEl.style.display = "none";
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
        voiceButtonEl.title = title;
        voiceButtonEl.setAttribute("aria-label", title);
      },
    };

    controller.updateTitle();
    voiceButtonEl.addEventListener("click", () => {
      void controller.toggle();
    });

    async function startRecording() {
      if (isRecording) return;
      try {
        if (hasMediaRecorder) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          let mimeType = "audio/webm;codecs=opus";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/mp4";
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = "";
            }
          }

          mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          audioChunks = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            const recorder = mediaRecorder;
            const mime = recorder?.mimeType || "audio/webm";
            const blob = new Blob(audioChunks, { type: mime });
            const reader = new FileReader();
            reader.onloadend = () => {
              const ext = mime.includes("mp4") ? "m4a" : (mime.includes("wav") ? "wav" : "webm");
              const fileName = `voice_${Date.now()}.${ext}`;
              const content = typeof reader.result === "string" ? reader.result : "";
              const audioBytes = estimateDataUrlBytes(content);
              const attachmentLimits = getAttachmentLimits();

              if (audioBytes > attachmentLimits.maxFileBytes) {
                renderAttachmentsPreview(
                  `⚠️ 语音附件未加入：${fileName} 超过单文件上限 ${formatBytes(attachmentLimits.maxFileBytes)}。`,
                );
                return;
              }
              if (estimatePendingAttachmentTotalBytes() + audioBytes > attachmentLimits.maxTotalBytes) {
                renderAttachmentsPreview(
                  `⚠️ 语音附件未加入：加入后总大小会超过 ${formatBytes(attachmentLimits.maxTotalBytes)}。`,
                );
                return;
              }

              addAttachment({
                name: fileName,
                type: "audio",
                mimeType: mime,
                content,
              });
              renderAttachmentsPreview();
              onSendMessage?.();
            };
            reader.readAsDataURL(blob);

            stream.getTracks().forEach((track) => track.stop());
            mediaRecorder = null;
          };

          mediaRecorder.start();
          isRecording = true;
          updateUI(true);
          return;
        }

        if (hasWebSpeech) {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const recognition = new SpeechRecognition();
          recognition.lang = getSpeechRecognitionLocale();
          recognition.interimResults = false;
          recognition.maxAlternatives = 1;

          recognition.onstart = () => {
            isRecording = true;
            updateUI(true, "listening");
          };

          recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            if (promptEl.value) promptEl.value += ` ${text}`;
            else promptEl.value = text;
            syncPromptHeight?.();
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
          mediaRecorder = recognition;
        }
      } catch (err) {
        console.error("Failed to start recording:", err);
        alert(t("voice.startFailed", { message: err?.message || String(err) }, "Failed to start recording: {message}"));
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
        return;
      }

      if (hasWebSpeech && activeRecorder && typeof activeRecorder.stop === "function") {
        try {
          activeRecorder.stop();
        } catch {
          mediaRecorder = null;
        }
      }
    }

    function updateUI(recording, mode = "recording") {
      if (!voiceDurationEl) return;
      if (recording) {
        voiceButtonEl.classList.add(mode);
        voiceDurationEl.classList.remove("hidden");
        startTime = Date.now();
        voiceDurationEl.textContent = "00:00";
        timerInterval = setInterval(() => {
          const diff = Math.floor((Date.now() - startTime) / 1000);
          const m = Math.floor(diff / 60).toString().padStart(2, "0");
          const s = (diff % 60).toString().padStart(2, "0");
          voiceDurationEl.textContent = `${m}:${s}`;
        }, 1000);
      } else {
        voiceButtonEl.classList.remove("recording", "listening");
        voiceDurationEl.classList.add("hidden");
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      }
    }

    return controller;
  }

  return {
    bindSettingsUI,
    handleGlobalKeydown,
    onSettingsToggle,
    refreshLocale() {
      renderVoiceShortcutSetting();
      voiceInputController.updateTitle();
    },
  };
}
