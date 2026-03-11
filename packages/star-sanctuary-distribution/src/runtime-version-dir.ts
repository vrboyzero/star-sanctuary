import os from "node:os";
import path from "node:path";

import type { PortableVersionFile } from "./runtime-manifest.js";
import { getRuntimeVersionKey } from "./runtime-manifest.js";

export type RuntimeVersionDirInfo = {
  appHomeDir: string;
  runtimeBaseDir: string;
  versionKey: string;
  versionRootDir: string;
  runtimeDir: string;
  versionFilePath: string;
  runtimeManifestPath: string;
};

function resolveMaybePath(value: string | undefined): string | undefined {
  return value && value.trim() ? path.resolve(value.trim()) : undefined;
}

function slugifyProductName(productName: string): string {
  const normalized = productName.replace(/[^A-Za-z0-9]+/g, "");
  return normalized || "StarSanctuary";
}

export function resolveSingleExeAppHomeDir(
  params: { env?: NodeJS.ProcessEnv; productName?: string } = {},
): string {
  const env = params.env ?? process.env;
  const productName = params.productName ?? "Star Sanctuary";
  const explicit = resolveMaybePath(
    env.STAR_SANCTUARY_SINGLE_EXE_HOME
    ?? env.BELLDANDY_SINGLE_EXE_HOME,
  );
  if (explicit) return explicit;

  const productSlug = slugifyProductName(productName);
  if (process.platform === "win32") {
    const localAppData = resolveMaybePath(env.LOCALAPPDATA);
    if (localAppData) {
      return path.join(localAppData, productSlug);
    }
  }

  return path.join(os.homedir(), ".star_sanctuary", productSlug);
}

export function resolveRuntimeVersionDirInfo(
  versionFile: PortableVersionFile,
  params: { env?: NodeJS.ProcessEnv; appHomeDir?: string } = {},
): RuntimeVersionDirInfo {
  const appHomeDir = path.resolve(
    params.appHomeDir
      ?? resolveSingleExeAppHomeDir({ env: params.env, productName: versionFile.productName }),
  );
  const runtimeBaseDir = path.join(appHomeDir, "runtime");
  const versionKey = getRuntimeVersionKey(versionFile);
  const versionRootDir = path.join(runtimeBaseDir, versionKey);

  return {
    appHomeDir,
    runtimeBaseDir,
    versionKey,
    versionRootDir,
    runtimeDir: path.join(versionRootDir, versionFile.runtimeDir),
    versionFilePath: path.join(versionRootDir, "version.json"),
    runtimeManifestPath: path.join(versionRootDir, "runtime-manifest.json"),
  };
}
