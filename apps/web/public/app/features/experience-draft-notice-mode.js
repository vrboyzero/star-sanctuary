export const EXPERIENCE_DRAFT_NOTICE_MODE_CHANGED_EVENT = "belldandy:experience-draft-notice-mode-changed";

function getRuntimeRoot() {
  if (typeof globalThis === "object" && globalThis) {
    return globalThis;
  }
  return null;
}

export function normalizeExperienceDraftGenerateNoticeEnabled(value) {
  if (value === false) return false;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  return true;
}

export function isExperienceDraftGenerateNoticeEnabled() {
  const runtimeRoot = getRuntimeRoot();
  return normalizeExperienceDraftGenerateNoticeEnabled(
    runtimeRoot?.BELLDANDY_WEB_CONFIG?.experienceDraftGenerateNoticeEnabled,
  );
}

export function setExperienceDraftGenerateNoticeEnabled(value) {
  const enabled = normalizeExperienceDraftGenerateNoticeEnabled(value);
  const runtimeRoot = getRuntimeRoot();
  if (!runtimeRoot) {
    return enabled;
  }
  const previousEnabled = normalizeExperienceDraftGenerateNoticeEnabled(
    runtimeRoot?.BELLDANDY_WEB_CONFIG?.experienceDraftGenerateNoticeEnabled,
  );
  const currentConfig = runtimeRoot.BELLDANDY_WEB_CONFIG && typeof runtimeRoot.BELLDANDY_WEB_CONFIG === "object"
    ? runtimeRoot.BELLDANDY_WEB_CONFIG
    : {};
  runtimeRoot.BELLDANDY_WEB_CONFIG = {
    ...currentConfig,
    experienceDraftGenerateNoticeEnabled: enabled,
  };
  if (
    previousEnabled !== enabled
    && typeof runtimeRoot.dispatchEvent === "function"
    && typeof CustomEvent === "function"
  ) {
    runtimeRoot.dispatchEvent(new CustomEvent(EXPERIENCE_DRAFT_NOTICE_MODE_CHANGED_EVENT, {
      detail: {
        experienceDraftGenerateNoticeEnabled: enabled,
      },
    }));
  }
  return enabled;
}
