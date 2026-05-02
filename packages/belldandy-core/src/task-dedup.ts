export type ToolDedupMode = "hard-block" | "warn-only" | "off";
export type ToolDedupGlobalMode = "off" | "graded" | "strict";

const DEFAULT_GRADED_POLICY: Record<string, ToolDedupMode> = {
  service_restart: "hard-block",
  switch_facet: "hard-block",
  switch_faqi: "hard-block",
  method_create: "hard-block",
  run_command: "warn-only",
  file_write: "warn-only",
  file_delete: "warn-only",
};

export function parseToolDedupGlobalMode(raw: string | undefined): ToolDedupGlobalMode {
  switch (String(raw ?? "").trim().toLowerCase()) {
    case "off":
      return "off";
    case "strict":
      return "strict";
    case "graded":
    case "":
      return "graded";
    default:
      return "graded";
  }
}

export function parseToolDedupPolicy(raw: string | undefined): Record<string, ToolDedupMode> {
  const policy: Record<string, ToolDedupMode> = {};
  for (const entry of String(raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;

    const toolName = trimmed.slice(0, idx).trim();
    const mode = trimmed.slice(idx + 1).trim().toLowerCase();
    if (!toolName) continue;
    if (mode === "hard-block" || mode === "warn-only" || mode === "off") {
      policy[toolName] = mode;
    }
  }
  return policy;
}

export function resolveToolDedupMode(
  toolName: string,
  options: {
    globalMode?: ToolDedupGlobalMode;
    policy?: Record<string, ToolDedupMode>;
  } = {},
): ToolDedupMode {
  const globalMode = options.globalMode ?? "graded";
  const policy = options.policy ?? {};

  if (globalMode === "off") {
    return policy[toolName] ?? "off";
  }

  const baseMode = DEFAULT_GRADED_POLICY[toolName] ?? "off";
  const normalizedBaseMode = globalMode === "strict" && baseMode === "warn-only"
    ? "hard-block"
    : baseMode;
  return policy[toolName] ?? normalizedBaseMode;
}

export function summarizeToolDedupPolicy(
  options: {
    globalMode?: ToolDedupGlobalMode;
    policy?: Record<string, ToolDedupMode>;
  } = {},
): string {
  const globalMode = options.globalMode ?? "graded";
  const policy = options.policy ?? {};
  const entries = Object.entries(policy)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tool, mode]) => `${tool}:${mode}`);
  return entries.length > 0
    ? `mode=${globalMode}, policy=${entries.join(",")}`
    : `mode=${globalMode}, policy=<default>`;
}

export function shouldBypassToolDedup(params: Record<string, unknown>): boolean {
  return params?.force === true || params?.retry === true || params?.allowDuplicate === true;
}

export function buildWarnOnlyDuplicateNotice(input: {
  toolName: string;
  actionKey: string;
  finishedAt?: string;
  taskLabel: string;
  withinMinutes: number;
}): string {
  return [
    `[dedup-warning] Tool "${input.toolName}" matched a recently completed action.`,
    `Recent window: ${input.withinMinutes} minutes.`,
    `Matched task: ${input.taskLabel}.`,
    `Matched at: ${input.finishedAt ?? "unknown"}.`,
    `Action key: ${input.actionKey}.`,
    `This execution was skipped once to avoid accidental duplicate work.`,
    `If you really need to rerun it, call the same tool again with retry=true, force=true, or allowDuplicate=true.`,
    `Otherwise, prefer checking current state or reusing existing results before retrying.`,
  ].join("\n");
}

export function buildToolActionKey(toolName: string, params: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case "run_command": {
      const command = firstString(params.command);
      return command ? `command:${normalizeCommandFingerprint(command)}` : undefined;
    }
    case "service_restart":
      return "service_restart:gateway";
    case "file_write":
    case "file_delete": {
      const targetPath = firstString(params.path);
      return targetPath ? `${toolName}:path:${normalizeCommandFingerprint(targetPath)}` : undefined;
    }
    case "method_create": {
      const filename = firstString(params.filename);
      return filename ? `method_create:file:${normalizeCommandFingerprint(filename)}` : undefined;
    }
    case "switch_facet": {
      const facet = firstString(params.facet, params.name);
      return facet ? `switch_facet:${normalizeCommandFingerprint(facet)}` : undefined;
    }
    case "switch_faqi": {
      const faqi = firstString(params.faqi_name, params.name);
      return faqi ? `switch_faqi:${normalizeCommandFingerprint(faqi)}` : undefined;
    }
    default: {
      const marker = firstString(
        params.path,
        params.file,
        params.filename,
        params.command,
        params.url,
        params.name,
        params.target,
      );
      return marker ? `${toolName}:${normalizeCommandFingerprint(marker)}` : undefined;
    }
  }
}

export function normalizeCommandFingerprint(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .replace(/;+$/g, "")
    .toLowerCase();
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
