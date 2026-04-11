import fs from "node:fs";
import path from "node:path";

import type { ToolPolicy } from "@belldandy/skills";

type GatewayToolPolicyLogger = {
  info: (module: string, message: string, data?: unknown) => void;
  warn: (module: string, message: string, data?: unknown) => void;
};

function normalizeStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.map((value) => String(value)).map((value) => value.trim()).filter(Boolean);
}

function normalizeExecPolicy(input: unknown): ToolPolicy["exec"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  const nonInteractive = obj.nonInteractive;
  return {
    quickTimeoutMs: typeof obj.quickTimeoutMs === "number" ? obj.quickTimeoutMs : undefined,
    longTimeoutMs: typeof obj.longTimeoutMs === "number" ? obj.longTimeoutMs : undefined,
    quickCommands: normalizeStringArray(obj.quickCommands),
    longCommands: normalizeStringArray(obj.longCommands),
    extraSafelist: normalizeStringArray(obj.extraSafelist),
    extraBlocklist: normalizeStringArray(obj.extraBlocklist),
    nonInteractive: nonInteractive && typeof nonInteractive === "object"
      ? {
        enabled: typeof (nonInteractive as { enabled?: unknown }).enabled === "boolean"
          ? (nonInteractive as { enabled: boolean }).enabled
          : undefined,
        additionalFlags: normalizeStringArray((nonInteractive as { additionalFlags?: unknown }).additionalFlags),
        defaultFlags: normalizeStringArray((nonInteractive as { defaultFlags?: unknown }).defaultFlags),
        rules: (nonInteractive as { rules?: unknown }).rules && typeof (nonInteractive as { rules?: unknown }).rules === "object"
          ? (nonInteractive as { rules: Record<string, string[] | string> }).rules
          : undefined,
      }
      : undefined,
  };
}

function normalizeFileWritePolicy(input: unknown): ToolPolicy["fileWrite"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    allowedExtensions: normalizeStringArray(obj.allowedExtensions),
    allowDotFiles: typeof obj.allowDotFiles === "boolean" ? obj.allowDotFiles : undefined,
    allowBinary: typeof obj.allowBinary === "boolean" ? obj.allowBinary : undefined,
  };
}

function normalizeToolsPolicy(input: unknown): Partial<ToolPolicy> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const obj = input as Record<string, unknown>;
  return {
    allowedPaths: normalizeStringArray(obj.allowedPaths),
    deniedPaths: normalizeStringArray(obj.deniedPaths),
    allowedDomains: normalizeStringArray(obj.allowedDomains),
    deniedDomains: normalizeStringArray(obj.deniedDomains),
    maxTimeoutMs: typeof obj.maxTimeoutMs === "number" ? obj.maxTimeoutMs : undefined,
    maxResponseBytes: typeof obj.maxResponseBytes === "number" ? obj.maxResponseBytes : undefined,
    exec: normalizeExecPolicy(obj.exec),
    fileWrite: normalizeFileWritePolicy(obj.fileWrite),
  };
}

export function mergePolicy(base: ToolPolicy, override?: Partial<ToolPolicy>): ToolPolicy {
  if (!override) return base;
  return {
    ...base,
    ...override,
    exec: {
      ...(base.exec ?? {}),
      ...(override.exec ?? {}),
      nonInteractive: {
        ...(base.exec?.nonInteractive ?? {}),
        ...(override.exec?.nonInteractive ?? {}),
      },
    },
    fileWrite: {
      ...(base.fileWrite ?? {}),
      ...(override.fileWrite ?? {}),
    },
  };
}

export function loadToolsPolicy(filePath: string, log: GatewayToolPolicyLogger): Partial<ToolPolicy> | undefined {
  try {
    const resolved = path.resolve(filePath);
    const raw = fs.readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeToolsPolicy(parsed);
    if (!normalized) {
      log.warn("tools", `BELLDANDY_TOOLS_POLICY_FILE is not a valid object: ${resolved}`);
      return undefined;
    }
    log.info("tools", `Loaded tools policy from ${resolved}`);
    return normalized;
  } catch (error) {
    log.warn("tools", `Failed to load tools policy: ${String(error)}`);
    return undefined;
  }
}
