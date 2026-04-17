import fs from "node:fs/promises";
import path from "node:path";

import type { CameraNativeDesktopHelperConfig } from "./camera-native-desktop-contract.js";

export const STAR_SANCTUARY_RUNTIME_DIR_ENV = "STAR_SANCTUARY_RUNTIME_DIR";
export const BELLDANDY_RUNTIME_DIR_ENV = "BELLDANDY_RUNTIME_DIR";

export type NativeDesktopLaunchPathSource = "absolute" | "cwd" | "process_cwd" | "runtime_dir";

export type NativeDesktopLaunchPathResolution = {
  rawValue: string;
  resolvedPath: string;
  source: NativeDesktopLaunchPathSource;
};

export type NativeDesktopHelperEntryArg = {
  index: number;
  value: string;
};

export type NativeDesktopHelperEntryResolution = NativeDesktopHelperEntryArg & {
  resolvedPath: string;
  source: NativeDesktopLaunchPathSource;
};

export type NativeDesktopHelperLaunchResolution = {
  runtimeDir?: string;
  resolvedCommandPath?: NativeDesktopLaunchPathResolution;
  helperEntry?: NativeDesktopHelperEntryResolution;
  effectiveCommand: string;
  effectiveArgs: string[];
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveLaunchPath(value: string, baseDir: string): string {
  if (path.isAbsolute(value)) {
    return path.normalize(value);
  }
  return path.resolve(baseDir, value);
}

export function looksLikeNativeDesktopLaunchPath(value: string): boolean {
  return (
    value.includes("/")
    || value.includes("\\")
    || /^[a-zA-Z]:[\\/]/u.test(value)
    || /^\.\.?([\\/]|$)/u.test(value)
    || /\.(?:[cm]?js|[cm]?ts|tsx|exe|cmd|bat)$/iu.test(value)
  );
}

export function isLikelyNodeCommand(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return (
    base === "node"
    || base === "node.exe"
    || base === "nodejs"
    || base === "nodejs.exe"
    || base === "star-sanctuary"
    || base === "star-sanctuary.exe"
    || base === "belldandy"
    || base === "belldandy.exe"
  );
}

export function readNativeDesktopRuntimeDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const runtimeDir = normalizeString(
    env[STAR_SANCTUARY_RUNTIME_DIR_ENV] ?? env[BELLDANDY_RUNTIME_DIR_ENV],
  );
  return runtimeDir ? path.resolve(runtimeDir) : undefined;
}

export function findNativeDesktopHelperEntryArg(
  args: readonly string[],
): NativeDesktopHelperEntryArg | undefined {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const candidate = args[index];
    if (typeof candidate !== "string" || candidate.startsWith("-")) {
      continue;
    }
    if (!looksLikeNativeDesktopLaunchPath(candidate)) {
      continue;
    }
    return {
      index,
      value: candidate,
    };
  }
  return undefined;
}

export function resolveNativeDesktopLaunchPathCandidates(
  value: string,
  options: {
    cwd?: string;
    runtimeDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): NativeDesktopLaunchPathResolution[] {
  if (path.isAbsolute(value)) {
    return [{
      rawValue: value,
      resolvedPath: path.normalize(value),
      source: "absolute",
    }];
  }

  const runtimeDir = options.runtimeDir ?? readNativeDesktopRuntimeDir(options.env);
  const primaryBaseDir = path.resolve(options.cwd ?? process.cwd());
  const primarySource: NativeDesktopLaunchPathSource = options.cwd ? "cwd" : "process_cwd";
  const candidates: NativeDesktopLaunchPathResolution[] = [{
    rawValue: value,
    resolvedPath: resolveLaunchPath(value, primaryBaseDir),
    source: primarySource,
  }];

  if (runtimeDir) {
    const normalizedRuntimeDir = path.resolve(runtimeDir);
    if (normalizedRuntimeDir !== primaryBaseDir) {
      candidates.push({
        rawValue: value,
        resolvedPath: resolveLaunchPath(value, normalizedRuntimeDir),
        source: "runtime_dir",
      });
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.resolvedPath)) {
      return false;
    }
    seen.add(candidate.resolvedPath);
    return true;
  });
}

export async function findExistingNativeDesktopLaunchPath(
  value: string,
  options: {
    cwd?: string;
    runtimeDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<NativeDesktopLaunchPathResolution | null> {
  const candidates = resolveNativeDesktopLaunchPathCandidates(value, options);
  for (const candidate of candidates) {
    try {
      await fs.stat(candidate.resolvedPath);
      return candidate;
    } catch {
      // Ignore missing candidates and keep searching.
    }
  }
  return null;
}

export async function resolveNativeDesktopHelperLaunch(
  config: CameraNativeDesktopHelperConfig,
  options: {
    runtimeDir?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<NativeDesktopHelperLaunchResolution> {
  const runtimeDir = options.runtimeDir ?? readNativeDesktopRuntimeDir(options.env);
  const effectiveArgs = [...(config.args ?? [])];
  let effectiveCommand = config.command;
  let resolvedCommandPath: NativeDesktopLaunchPathResolution | undefined;

  if (looksLikeNativeDesktopLaunchPath(config.command)) {
    const existingCommandPath = await findExistingNativeDesktopLaunchPath(config.command, {
      cwd: config.cwd,
      runtimeDir,
      env: options.env,
    });
    resolvedCommandPath = existingCommandPath
      ?? resolveNativeDesktopLaunchPathCandidates(config.command, {
        cwd: config.cwd,
        runtimeDir,
        env: options.env,
      })[0];
    effectiveCommand = resolvedCommandPath.resolvedPath;
  }

  let helperEntry: NativeDesktopHelperEntryResolution | undefined;
  if (isLikelyNodeCommand(config.command)) {
    const helperEntryArg = findNativeDesktopHelperEntryArg(effectiveArgs);
    if (helperEntryArg) {
      const existingHelperEntry = await findExistingNativeDesktopLaunchPath(helperEntryArg.value, {
        cwd: config.cwd,
        runtimeDir,
        env: options.env,
      });
      const resolvedHelperEntry = existingHelperEntry
        ?? resolveNativeDesktopLaunchPathCandidates(helperEntryArg.value, {
          cwd: config.cwd,
          runtimeDir,
          env: options.env,
        })[0];
      helperEntry = {
        ...helperEntryArg,
        resolvedPath: resolvedHelperEntry.resolvedPath,
        source: resolvedHelperEntry.source,
      };
      effectiveArgs[helperEntry.index] = helperEntry.resolvedPath;
    }
  }

  return {
    ...(runtimeDir ? { runtimeDir } : {}),
    ...(resolvedCommandPath ? { resolvedCommandPath } : {}),
    ...(helperEntry ? { helperEntry } : {}),
    effectiveCommand,
    effectiveArgs,
  };
}
