export const GOVERNANCE_DETAIL_MODE_COMPACT = "compact";
export const GOVERNANCE_DETAIL_MODE_FULL = "full";
export const GOVERNANCE_DETAIL_MODE_CHANGED_EVENT = "belldandy:governance-detail-mode-changed";

function getRuntimeRoot() {
  if (typeof globalThis === "object" && globalThis) {
    return globalThis;
  }
  return null;
}

export function normalizeGovernanceDetailMode(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === GOVERNANCE_DETAIL_MODE_FULL) {
    return GOVERNANCE_DETAIL_MODE_FULL;
  }
  return GOVERNANCE_DETAIL_MODE_COMPACT;
}

export function getGovernanceDetailMode() {
  const runtimeRoot = getRuntimeRoot();
  return normalizeGovernanceDetailMode(runtimeRoot?.BELLDANDY_WEB_CONFIG?.governanceDetailMode);
}

export function isCompactGovernanceDetailMode() {
  return getGovernanceDetailMode() === GOVERNANCE_DETAIL_MODE_COMPACT;
}

export function renderGovernanceFullOnly(html) {
  return isCompactGovernanceDetailMode() ? "" : html;
}

export function setGovernanceDetailMode(value) {
  const mode = normalizeGovernanceDetailMode(value);
  const runtimeRoot = getRuntimeRoot();
  if (!runtimeRoot) {
    return mode;
  }
  const previousMode = normalizeGovernanceDetailMode(runtimeRoot?.BELLDANDY_WEB_CONFIG?.governanceDetailMode);
  const currentConfig = runtimeRoot.BELLDANDY_WEB_CONFIG && typeof runtimeRoot.BELLDANDY_WEB_CONFIG === "object"
    ? runtimeRoot.BELLDANDY_WEB_CONFIG
    : {};
  runtimeRoot.BELLDANDY_WEB_CONFIG = {
    ...currentConfig,
    governanceDetailMode: mode,
  };
  if (
    previousMode !== mode
    && typeof runtimeRoot.dispatchEvent === "function"
    && typeof CustomEvent === "function"
  ) {
    runtimeRoot.dispatchEvent(new CustomEvent(GOVERNANCE_DETAIL_MODE_CHANGED_EVENT, {
      detail: {
        governanceDetailMode: mode,
      },
    }));
  }
  return mode;
}
