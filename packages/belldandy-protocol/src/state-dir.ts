import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STATE_DIR_ENV_KEY = "BELLDANDY_STATE_DIR";
export const LEGACY_STATE_DIR_BASENAME = ".belldandy";
export const DEFAULT_STATE_DIR_BASENAME = ".star_sanctuary";
export const LEGACY_STATE_DIR_DISPLAY = `~/${LEGACY_STATE_DIR_BASENAME}`;
export const DEFAULT_STATE_DIR_DISPLAY = `~/${DEFAULT_STATE_DIR_BASENAME}`;

export type PathExists = (filePath: string) => boolean;

function defaultExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export function resolveNamedCompatDir(params: {
  rootDir: string;
  preferredBaseName: string;
  legacyBaseName: string;
  exists?: PathExists;
}): string {
  const exists = params.exists ?? defaultExists;
  const preferredDir = path.join(params.rootDir, params.preferredBaseName);
  if (exists(preferredDir)) return preferredDir;

  const legacyDir = path.join(params.rootDir, params.legacyBaseName);
  if (exists(legacyDir)) return legacyDir;

  return preferredDir;
}

export function resolveDefaultStateDir(params?: {
  homeDir?: string;
  exists?: PathExists;
}): string {
  return resolveNamedCompatDir({
    rootDir: params?.homeDir ?? os.homedir(),
    preferredBaseName: DEFAULT_STATE_DIR_BASENAME,
    legacyBaseName: LEGACY_STATE_DIR_BASENAME,
    exists: params?.exists,
  });
}

export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  params?: { homeDir?: string; exists?: PathExists },
): string {
  const explicit = env[STATE_DIR_ENV_KEY]?.trim();
  if (explicit) return explicit;
  return resolveDefaultStateDir(params);
}

export function resolveWorkspaceStateDir(
  workspaceRoot: string,
  exists?: PathExists,
): string {
  return resolveNamedCompatDir({
    rootDir: workspaceRoot,
    preferredBaseName: DEFAULT_STATE_DIR_BASENAME,
    legacyBaseName: LEGACY_STATE_DIR_BASENAME,
    exists,
  });
}
