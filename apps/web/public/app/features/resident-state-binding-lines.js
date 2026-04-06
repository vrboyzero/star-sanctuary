function normalizeObject(value) {
  return value && typeof value === "object" ? value : null;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function tr(t, key, params, fallback) {
  return typeof t === "function" ? t(key, params ?? {}, fallback) : fallback;
}

export function buildResidentStateBindingLines(value, t) {
  const binding = normalizeObject(value);
  if (!binding) return [];

  const workspaceScopeSummary = normalizeString(binding.workspaceScopeSummary) || normalizeString(binding.summary);
  const stateScopeSummary = normalizeString(binding.stateScopeSummary) || normalizeString(binding.summary);
  const lines = [];

  if (workspaceScopeSummary) {
    lines.push(
      `${tr(t, "residentStateBinding.workspaceScope", {}, "workspace scope")}: ${workspaceScopeSummary}`,
    );
  }
  if (stateScopeSummary && stateScopeSummary !== workspaceScopeSummary) {
    lines.push(
      `${tr(t, "residentStateBinding.stateScope", {}, "state scope")}: ${stateScopeSummary}`,
    );
  }

  return lines;
}
