import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  readPortableVersionFile,
  readRuntimeManifest,
  resolveRuntimePayloadPaths,
  validateInstalledRuntimeVersion,
  type PortableVersionFile,
  type RuntimeManifest,
  type RuntimeManifestFileEntry,
} from "./runtime-manifest.js";
import { resolveRuntimeVersionDirInfo, type RuntimeVersionDirInfo } from "./runtime-version-dir.js";
import { getSeaModule, isSeaRuntime } from "./sea.js";

export type EnsureSingleExeRuntimeParams = {
  payloadRoot: string;
  env?: NodeJS.ProcessEnv;
  appHomeDir?: string;
};

export type EnsuredSingleExeRuntime = {
  extracted: boolean;
  versionFile: PortableVersionFile;
  versionDirInfo: RuntimeVersionDirInfo;
  payloadPaths?: ReturnType<typeof resolveRuntimePayloadPaths>;
};

export type EnsureSingleExeRuntimeFromSeaParams = {
  env?: NodeJS.ProcessEnv;
  appHomeDir?: string;
};

type DeferredDirectoryLink = {
  linkPath: string;
  targetPath: string;
  relativePath: string;
};

type RuntimeCopyStats = {
  copiedFiles: number;
  copiedDirectories: number;
  copiedSymlinkFiles: number;
  deferredDirectoryLinks: number;
  skippedBrokenSymlinks: number;
};

type RuntimeSymlinkEntry = {
  linkPath: string;
  targetPath: string;
};

const SINGLE_EXE_SEA_VERSION_ASSET_KEY = "portable/version.json";
const SINGLE_EXE_SEA_RUNTIME_MANIFEST_ASSET_KEY = "portable/runtime-manifest.json";
const SINGLE_EXE_SEA_RUNTIME_ASSET_PREFIX = "portable/runtime/";
export const SINGLE_EXE_NODE_RUNTIME_FILE_NAME = process.platform === "win32" ? "node-runtime.exe" : "node-runtime";
const SINGLE_EXE_SEA_NODE_RUNTIME_ASSET_KEY = `portable/${SINGLE_EXE_NODE_RUNTIME_FILE_NAME}.gz`;

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removePath(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveManifestSymlinkMap(entries: RuntimeManifestFileEntry[]): Map<string, RuntimeManifestFileEntry> {
  return new Map(
    entries
      .filter((entry) => entry.type === "symlink")
      .map((entry) => [normalizeRelativePath(entry.path), entry]),
  );
}

function resolveDeferredDirectoryLink(params: {
  symlinkEntry: RuntimeManifestFileEntry | undefined;
  sourceEntryPath: string;
  sourceRootDir: string;
  finalTargetRootDir: string;
}): DeferredDirectoryLink {
  const { symlinkEntry, sourceEntryPath, sourceRootDir, finalTargetRootDir } = params;
  const relativePath = normalizeRelativePath(path.relative(sourceRootDir, sourceEntryPath));
  const rawTarget = symlinkEntry?.target ?? fs.readlinkSync(sourceEntryPath);
  const resolvedSourceTarget = path.isAbsolute(rawTarget)
    ? path.resolve(rawTarget)
    : path.resolve(path.dirname(sourceEntryPath), rawTarget);

  if (!isWithinRoot(resolvedSourceTarget, sourceRootDir)) {
    throw new Error(`Single-exe runtime symlink escapes payload runtime: ${relativePath} -> ${rawTarget}`);
  }

  return {
    linkPath: path.join(finalTargetRootDir, relativePath),
    targetPath: path.join(finalTargetRootDir, path.relative(sourceRootDir, resolvedSourceTarget)),
    relativePath,
  };
}

function copyRuntimeTree(params: {
  sourceRootDir: string;
  stageTargetRootDir: string;
  finalTargetRootDir: string;
  symlinkEntryMap: Map<string, RuntimeManifestFileEntry>;
}): {
  stats: RuntimeCopyStats;
  deferredDirectoryLinks: DeferredDirectoryLink[];
} {
  const { sourceRootDir, stageTargetRootDir, finalTargetRootDir, symlinkEntryMap } = params;
  const deferredDirectoryLinks: DeferredDirectoryLink[] = [];
  const stats: RuntimeCopyStats = {
    copiedFiles: 0,
    copiedDirectories: 0,
    copiedSymlinkFiles: 0,
    deferredDirectoryLinks: 0,
    skippedBrokenSymlinks: 0,
  };

  function visitDirectory(currentSourceDir: string, currentTargetDir: string): void {
    ensureDir(currentTargetDir);
    stats.copiedDirectories += 1;

    for (const entryName of fs.readdirSync(currentSourceDir)) {
      const sourceEntryPath = path.join(currentSourceDir, entryName);
      const targetEntryPath = path.join(currentTargetDir, entryName);
      const sourceStat = fs.lstatSync(sourceEntryPath);

      if (sourceStat.isSymbolicLink()) {
        const relativePath = normalizeRelativePath(path.relative(sourceRootDir, sourceEntryPath));
        let targetStat: fs.Stats;

        try {
          targetStat = fs.statSync(sourceEntryPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            stats.skippedBrokenSymlinks += 1;
            continue;
          }
          throw error;
        }

        if (targetStat.isDirectory()) {
          deferredDirectoryLinks.push(
            resolveDeferredDirectoryLink({
              symlinkEntry: symlinkEntryMap.get(relativePath),
              sourceEntryPath,
              sourceRootDir,
              finalTargetRootDir,
            }),
          );
          stats.deferredDirectoryLinks += 1;
          continue;
        }

        ensureDir(path.dirname(targetEntryPath));
        fs.copyFileSync(sourceEntryPath, targetEntryPath);
        stats.copiedSymlinkFiles += 1;
        continue;
      }

      if (sourceStat.isDirectory()) {
        visitDirectory(sourceEntryPath, targetEntryPath);
        continue;
      }

      if (!sourceStat.isFile()) continue;

      ensureDir(path.dirname(targetEntryPath));
      fs.copyFileSync(sourceEntryPath, targetEntryPath);
      stats.copiedFiles += 1;
    }
  }

  visitDirectory(sourceRootDir, stageTargetRootDir);

  return {
    stats,
    deferredDirectoryLinks,
  };
}

function materializeDirectoryLinks(directoryLinks: DeferredDirectoryLink[]): void {
  const symlinkType: "junction" | "dir" = process.platform === "win32" ? "junction" : "dir";

  for (const directoryLink of directoryLinks) {
    ensureDir(path.dirname(directoryLink.linkPath));
    removePath(directoryLink.linkPath);
    fs.symlinkSync(directoryLink.targetPath, directoryLink.linkPath, symlinkType);
  }
}

function materializeRuntimeSymlinks(runtimeSymlinks: RuntimeSymlinkEntry[]): void {
  const symlinkType: "junction" | "dir" = process.platform === "win32" ? "junction" : "dir";

  for (const runtimeSymlink of runtimeSymlinks) {
    ensureDir(path.dirname(runtimeSymlink.linkPath));
    removePath(runtimeSymlink.linkPath);
    fs.symlinkSync(runtimeSymlink.targetPath, runtimeSymlink.linkPath, symlinkType);
  }
}

function logSingleExeExtract(message: string): void {
  console.log(`[Star Sanctuary Single-Exe] ${message}`);
}

function copyPayloadToStage(params: {
  stageDir: string;
  payloadPaths: ReturnType<typeof resolveRuntimePayloadPaths>;
  finalVersionDirInfo: RuntimeVersionDirInfo;
}): {
  stats: RuntimeCopyStats;
  deferredDirectoryLinks: DeferredDirectoryLink[];
} {
  const { stageDir, payloadPaths, finalVersionDirInfo } = params;
  const runtimeManifest = readRuntimeManifest(payloadPaths.payloadRoot);
  const symlinkEntryMap = resolveManifestSymlinkMap(runtimeManifest.files);
  const runtimeDirRelativePath = path.relative(
    finalVersionDirInfo.versionRootDir,
    finalVersionDirInfo.runtimeDir,
  );
  ensureDir(stageDir);
  fs.copyFileSync(payloadPaths.versionFilePath, path.join(stageDir, "version.json"));
  fs.copyFileSync(payloadPaths.runtimeManifestPath, path.join(stageDir, "runtime-manifest.json"));
  return copyRuntimeTree({
    sourceRootDir: payloadPaths.runtimeSourceDir,
    stageTargetRootDir: path.join(stageDir, runtimeDirRelativePath),
    finalTargetRootDir: finalVersionDirInfo.runtimeDir,
    symlinkEntryMap,
  });
}

function getSeaAssetText(assetKey: string): string {
  const sea = getSeaModule();
  if (!sea) {
    throw new Error("node:sea is unavailable in the current process.");
  }
  const value = sea.getAsset(assetKey, "utf8");
  return typeof value === "string" ? value : bufferFromSeaAsset(value).toString("utf8");
}

function getSeaAssetBuffer(assetKey: string): Buffer {
  const sea = getSeaModule();
  if (!sea) {
    throw new Error("node:sea is unavailable in the current process.");
  }
  return bufferFromSeaAsset(sea.getRawAsset(assetKey));
}

function bufferFromSeaAsset(value: ArrayBuffer | ArrayBufferView): Buffer {
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from(value);
}

function resolveManifestSymlinkTargetPath(params: {
  linkPath: string;
  target: string;
  runtimeRootDir: string;
  runtimeDirName: string;
}): string {
  const { linkPath, target, runtimeRootDir, runtimeDirName } = params;
  if (path.isAbsolute(target)) {
    const normalizedTarget = target.replace(/\\/g, "/");
    const runtimeMarker = `/${runtimeDirName}/`;
    const runtimeIndex = normalizedTarget.lastIndexOf(runtimeMarker);
    if (runtimeIndex >= 0) {
      const runtimeRelativePath = normalizedTarget.slice(runtimeIndex + runtimeMarker.length);
      return path.join(runtimeRootDir, ...runtimeRelativePath.split("/"));
    }
  }

  return path.resolve(path.dirname(linkPath), target);
}

function copySeaPayloadToStage(params: {
  stageDir: string;
  versionFile: PortableVersionFile;
  runtimeManifest: RuntimeManifest;
  finalVersionDirInfo: RuntimeVersionDirInfo;
}): {
  stats: RuntimeCopyStats;
  runtimeSymlinks: RuntimeSymlinkEntry[];
} {
  const { stageDir, versionFile, runtimeManifest, finalVersionDirInfo } = params;
  const stageRuntimeDir = path.join(stageDir, versionFile.runtimeDir);
  const finalRuntimeDir = finalVersionDirInfo.runtimeDir;
  const stats: RuntimeCopyStats = {
    copiedFiles: 0,
    copiedDirectories: 0,
    copiedSymlinkFiles: 0,
    deferredDirectoryLinks: 0,
    skippedBrokenSymlinks: 0,
  };
  const runtimeSymlinks: RuntimeSymlinkEntry[] = [];

  ensureDir(stageDir);
  ensureDir(stageRuntimeDir);
  fs.writeFileSync(path.join(stageDir, "version.json"), getSeaAssetText(SINGLE_EXE_SEA_VERSION_ASSET_KEY), "utf-8");
  fs.writeFileSync(
    path.join(stageDir, "runtime-manifest.json"),
    getSeaAssetText(SINGLE_EXE_SEA_RUNTIME_MANIFEST_ASSET_KEY),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(stageDir, SINGLE_EXE_NODE_RUNTIME_FILE_NAME),
    gunzipSync(getSeaAssetBuffer(SINGLE_EXE_SEA_NODE_RUNTIME_ASSET_KEY)),
  );

  for (const entry of runtimeManifest.files) {
    const destinationPath = path.join(stageRuntimeDir, ...entry.path.split("/"));

    if (entry.type === "file") {
      ensureDir(path.dirname(destinationPath));
      fs.writeFileSync(
        destinationPath,
        getSeaAssetBuffer(`${SINGLE_EXE_SEA_RUNTIME_ASSET_PREFIX}${entry.path}`),
      );
      stats.copiedFiles += 1;
      continue;
    }

    runtimeSymlinks.push({
      linkPath: path.join(finalRuntimeDir, ...entry.path.split("/")),
      targetPath: resolveManifestSymlinkTargetPath({
        linkPath: path.join(finalRuntimeDir, ...entry.path.split("/")),
        target: entry.target ?? "",
        runtimeRootDir: finalRuntimeDir,
        runtimeDirName: runtimeManifest.runtimeDir,
      }),
    });
    stats.deferredDirectoryLinks += 1;
  }

  return {
    stats,
    runtimeSymlinks,
  };
}

function replaceVersionDirAtomically(params: {
  versionRootDir: string;
  stageDir: string;
  finalize?: () => void;
}): void {
  const { versionRootDir, stageDir, finalize } = params;
  const backupDir = `${versionRootDir}.corrupt-${Date.now()}`;

  if (fs.existsSync(versionRootDir)) {
    fs.renameSync(versionRootDir, backupDir);
  }

  try {
    fs.renameSync(stageDir, versionRootDir);
    finalize?.();
  } catch (error) {
    try {
      if (fs.existsSync(versionRootDir)) {
        removePath(versionRootDir);
      }
    } catch {
      // Best effort cleanup before rollback.
    }

    if (fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, versionRootDir);
    }
    throw error;
  }

  if (fs.existsSync(backupDir)) {
    try {
      removePath(backupDir);
    } catch {
      // Best effort cleanup only.
    }
  }
}

export function ensureSingleExeRuntime(params: EnsureSingleExeRuntimeParams): EnsuredSingleExeRuntime {
  const env = params.env ?? process.env;
  const payloadPaths = resolveRuntimePayloadPaths(params.payloadRoot);
  const versionFile = readPortableVersionFile(params.payloadRoot);
  const runtimeManifest = readRuntimeManifest(params.payloadRoot);
  const versionDirInfo = resolveRuntimeVersionDirInfo(versionFile, {
    env,
    appHomeDir: params.appHomeDir,
  });

  ensureDir(versionDirInfo.runtimeBaseDir);

  const validation = validateInstalledRuntimeVersion({
    versionRoot: versionDirInfo.versionRootDir,
    sourceVersionFile: versionFile,
    sourceRuntimeManifest: runtimeManifest,
  });
  if (validation.ok) {
    return {
      extracted: false,
      versionFile,
      versionDirInfo,
      payloadPaths,
    };
  }

  const stageDir = `${versionDirInfo.versionRootDir}.staging-${process.pid}-${Date.now()}`;
  const startedAt = Date.now();
  logSingleExeExtract(
    `Extracting runtime ${versionDirInfo.versionKey} to ${versionDirInfo.versionRootDir} (reason=${validation.reason ?? "unknown"})`,
  );
  removePath(stageDir);

  try {
    const { stats, deferredDirectoryLinks } = copyPayloadToStage({
      stageDir,
      payloadPaths,
      finalVersionDirInfo: versionDirInfo,
    });

    replaceVersionDirAtomically({
      versionRootDir: versionDirInfo.versionRootDir,
      stageDir,
      finalize: () => {
        materializeDirectoryLinks(deferredDirectoryLinks);
      },
    });

    logSingleExeExtract(
      `Extracted runtime ${versionDirInfo.versionKey}: files=${stats.copiedFiles}, dirs=${stats.copiedDirectories}, linkDirs=${stats.deferredDirectoryLinks}, linkFiles=${stats.copiedSymlinkFiles}, skippedBrokenLinks=${stats.skippedBrokenSymlinks}, durationMs=${Date.now() - startedAt}`,
    );
  } catch (error) {
    removePath(stageDir);
    throw error;
  }

  const postValidation = validateInstalledRuntimeVersion({
    versionRoot: versionDirInfo.versionRootDir,
    sourceVersionFile: versionFile,
    sourceRuntimeManifest: runtimeManifest,
  });
  if (!postValidation.ok) {
    throw new Error(
      `Single-exe runtime validation failed after extract (${postValidation.reason ?? "unknown_reason"}).`,
    );
  }

  logSingleExeExtract(`Validated runtime ${versionDirInfo.versionKey} at ${versionDirInfo.versionRootDir}`);

  return {
    extracted: true,
    versionFile,
    versionDirInfo,
    payloadPaths,
  };
}

export function ensureSingleExeRuntimeFromSea(
  params: EnsureSingleExeRuntimeFromSeaParams = {},
): EnsuredSingleExeRuntime {
  if (!isSeaRuntime()) {
    throw new Error("Single-exe SEA runtime is not available in the current process.");
  }

  const env = params.env ?? process.env;
  const versionFile = JSON.parse(getSeaAssetText(SINGLE_EXE_SEA_VERSION_ASSET_KEY)) as PortableVersionFile;
  const runtimeManifest = JSON.parse(getSeaAssetText(SINGLE_EXE_SEA_RUNTIME_MANIFEST_ASSET_KEY)) as RuntimeManifest;
  const versionDirInfo = resolveRuntimeVersionDirInfo(versionFile, {
    env,
    appHomeDir: params.appHomeDir,
  });

  ensureDir(versionDirInfo.runtimeBaseDir);

  const validation = validateInstalledRuntimeVersion({
    versionRoot: versionDirInfo.versionRootDir,
    sourceVersionFile: versionFile,
    sourceRuntimeManifest: runtimeManifest,
  });
  if (validation.ok) {
    return {
      extracted: false,
      versionFile,
      versionDirInfo,
    };
  }

  const stageDir = `${versionDirInfo.versionRootDir}.staging-${process.pid}-${Date.now()}`;
  const startedAt = Date.now();
  logSingleExeExtract(
    `Extracting embedded runtime ${versionDirInfo.versionKey} to ${versionDirInfo.versionRootDir} (reason=${validation.reason ?? "unknown"})`,
  );
  removePath(stageDir);

  try {
    const { stats, runtimeSymlinks } = copySeaPayloadToStage({
      stageDir,
      versionFile,
      runtimeManifest,
      finalVersionDirInfo: versionDirInfo,
    });

    replaceVersionDirAtomically({
      versionRootDir: versionDirInfo.versionRootDir,
      stageDir,
      finalize: () => {
        materializeRuntimeSymlinks(runtimeSymlinks);
      },
    });

    logSingleExeExtract(
      `Extracted embedded runtime ${versionDirInfo.versionKey}: files=${stats.copiedFiles}, symlinks=${stats.deferredDirectoryLinks}, durationMs=${Date.now() - startedAt}`,
    );
  } catch (error) {
    removePath(stageDir);
    throw error;
  }

  const postValidation = validateInstalledRuntimeVersion({
    versionRoot: versionDirInfo.versionRootDir,
    sourceVersionFile: versionFile,
    sourceRuntimeManifest: runtimeManifest,
  });
  if (!postValidation.ok) {
    throw new Error(
      `Single-exe embedded runtime validation failed after extract (${postValidation.reason ?? "unknown_reason"}).`,
    );
  }

  logSingleExeExtract(`Validated embedded runtime ${versionDirInfo.versionKey} at ${versionDirInfo.versionRootDir}`);

  return {
    extracted: true,
    versionFile,
    versionDirInfo,
  };
}
