import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  readPortableVersionFile,
  readRuntimeManifest,
  validateInstalledRuntimeVersion,
  type PortableVersionFile,
  type RuntimeManifest,
} from "./runtime-manifest.js";

export type PortableRecoveryPayloadPaths = {
  payloadRoot: string;
  versionFilePath: string;
  runtimeManifestPath: string;
  runtimeFilesDir: string;
};

export type EnsurePortableRuntimeParams = {
  portableRoot: string;
  payloadRoot?: string;
};

export type EnsuredPortableRuntime = {
  recovered: boolean;
  recoveryReason?: string;
  payloadRoot?: string;
  versionFile: PortableVersionFile;
  runtimeManifest: RuntimeManifest;
  runtimeDir: string;
};

type RuntimeSymlinkEntry = {
  linkPath: string;
  targetPath: string;
};

function isFileNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removePath(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function hasPortableRecoveryPayload(payloadRoot: string): boolean {
  const payloadPaths = resolvePortableRecoveryPayloadPaths(payloadRoot);
  return (
    fs.existsSync(payloadPaths.versionFilePath)
    && fs.existsSync(payloadPaths.runtimeManifestPath)
    && fs.existsSync(payloadPaths.runtimeFilesDir)
  );
}

function logPortableRuntime(message: string): void {
  console.log(`[Star Sanctuary Portable] ${message}`);
}

function resolveManifestSymlinkTargetPath(params: {
  linkPath: string;
  target: string;
}): string {
  const { linkPath, target } = params;
  return path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(path.dirname(linkPath), target);
}

function materializeRuntimeSymlinks(runtimeSymlinks: RuntimeSymlinkEntry[]): void {
  const symlinkType: "junction" | "dir" = process.platform === "win32" ? "junction" : "dir";

  for (const runtimeSymlink of runtimeSymlinks) {
    ensureDir(path.dirname(runtimeSymlink.linkPath));
    removePath(runtimeSymlink.linkPath);
    fs.symlinkSync(runtimeSymlink.targetPath, runtimeSymlink.linkPath, symlinkType);
  }
}

function extractPortablePayloadToStage(params: {
  stageDir: string;
  payloadPaths: PortableRecoveryPayloadPaths;
  versionFile: PortableVersionFile;
  runtimeManifest: RuntimeManifest;
  finalRuntimeDir: string;
}): {
  copiedFiles: number;
  symlinkCount: number;
  runtimeSymlinks: RuntimeSymlinkEntry[];
} {
  const { stageDir, payloadPaths, versionFile, runtimeManifest, finalRuntimeDir } = params;
  const stageRuntimeDir = path.join(stageDir, versionFile.runtimeDir);
  const runtimeSymlinks: RuntimeSymlinkEntry[] = [];
  let copiedFiles = 0;

  ensureDir(stageDir);
  ensureDir(stageRuntimeDir);
  fs.copyFileSync(payloadPaths.versionFilePath, path.join(stageDir, "version.json"));
  fs.copyFileSync(payloadPaths.runtimeManifestPath, path.join(stageDir, "runtime-manifest.json"));

  for (const entry of runtimeManifest.files) {
    const destinationPath = path.join(stageRuntimeDir, ...entry.path.split("/"));

    if (entry.type === "file") {
      const compressedAssetPath = path.join(
        payloadPaths.runtimeFilesDir,
        ...entry.path.split("/"),
      ) + ".gz";
      let compressedAsset: Buffer;
      try {
        compressedAsset = fs.readFileSync(compressedAssetPath);
      } catch (error) {
        if (!isFileNotFoundError(error)) {
          throw error;
        }
        throw new Error(`Portable recovery payload is missing ${entry.path}`);
      }
      ensureDir(path.dirname(destinationPath));
      fs.writeFileSync(destinationPath, gunzipSync(compressedAsset));
      copiedFiles += 1;
      continue;
    }

    runtimeSymlinks.push({
      linkPath: path.join(finalRuntimeDir, ...entry.path.split("/")),
      targetPath: resolveManifestSymlinkTargetPath({
        linkPath: path.join(finalRuntimeDir, ...entry.path.split("/")),
        target: entry.target ?? "",
      }),
    });
  }

  return {
    copiedFiles,
    symlinkCount: runtimeSymlinks.length,
    runtimeSymlinks,
  };
}

function replacePortableRuntimeAtomically(params: {
  portableRoot: string;
  stageDir: string;
  finalize?: () => void;
}): void {
  const { portableRoot, stageDir, finalize } = params;
  const runtimeDir = path.join(portableRoot, "runtime");
  const versionFilePath = path.join(portableRoot, "version.json");
  const runtimeManifestPath = path.join(portableRoot, "runtime-manifest.json");
  const stageRuntimeDir = path.join(stageDir, "runtime");
  const stageVersionFilePath = path.join(stageDir, "version.json");
  const stageRuntimeManifestPath = path.join(stageDir, "runtime-manifest.json");
  const backupSuffix = `.corrupt-${Date.now()}`;
  const backupRuntimeDir = `${runtimeDir}${backupSuffix}`;
  const backupVersionFilePath = `${versionFilePath}${backupSuffix}`;
  const backupRuntimeManifestPath = `${runtimeManifestPath}${backupSuffix}`;

  const movedBackups: string[] = [];

  const moveIfExists = (sourcePath: string, targetPath: string): void => {
    removePath(targetPath);
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return;
      }
      throw error;
    }
    movedBackups.push(targetPath);
  };

  moveIfExists(runtimeDir, backupRuntimeDir);
  moveIfExists(versionFilePath, backupVersionFilePath);
  moveIfExists(runtimeManifestPath, backupRuntimeManifestPath);

  try {
    fs.renameSync(stageRuntimeDir, runtimeDir);
    fs.renameSync(stageVersionFilePath, versionFilePath);
    fs.renameSync(stageRuntimeManifestPath, runtimeManifestPath);
    finalize?.();
  } catch (error) {
    try {
      removePath(runtimeDir);
      removePath(versionFilePath);
      removePath(runtimeManifestPath);
    } catch {
      // Best effort cleanup before rollback.
    }

    moveIfExists(backupRuntimeDir, runtimeDir);
    moveIfExists(backupVersionFilePath, versionFilePath);
    moveIfExists(backupRuntimeManifestPath, runtimeManifestPath);
    throw error;
  } finally {
    removePath(stageDir);
  }

  for (const backupPath of movedBackups) {
    try {
      removePath(backupPath);
    } catch {
      // Best effort cleanup only.
    }
  }
}

export function resolvePortableRecoveryPayloadPaths(payloadRoot: string): PortableRecoveryPayloadPaths {
  const resolvedPayloadRoot = path.resolve(payloadRoot);
  return {
    payloadRoot: resolvedPayloadRoot,
    versionFilePath: path.join(resolvedPayloadRoot, "version.json"),
    runtimeManifestPath: path.join(resolvedPayloadRoot, "runtime-manifest.json"),
    runtimeFilesDir: path.join(resolvedPayloadRoot, "runtime-files"),
  };
}

export function ensurePortableRuntime(params: EnsurePortableRuntimeParams): EnsuredPortableRuntime {
  const portableRoot = path.resolve(params.portableRoot);
  const defaultPayloadRoot = path.join(portableRoot, "payload");
  const payloadRoot = params.payloadRoot ? path.resolve(params.payloadRoot) : defaultPayloadRoot;
  const hasRecoveryPayload = hasPortableRecoveryPayload(payloadRoot);

  const versionSourceRoot = hasRecoveryPayload ? payloadRoot : portableRoot;
  const versionFile = readPortableVersionFile(versionSourceRoot);
  const runtimeManifest = readRuntimeManifest(versionSourceRoot);
  const runtimeDir = path.join(portableRoot, versionFile.runtimeDir);

  const validation = validateInstalledRuntimeVersion({
    versionRoot: portableRoot,
    sourceVersionFile: versionFile,
    sourceRuntimeManifest: runtimeManifest,
  });
  if (validation.ok) {
    return {
      recovered: false,
      payloadRoot: hasRecoveryPayload ? payloadRoot : undefined,
      versionFile,
      runtimeManifest,
      runtimeDir,
    };
  }

  if (!hasRecoveryPayload) {
    throw new Error(
      `Portable runtime validation failed (${validation.reason ?? "unknown_reason"}), but no recovery payload was found in ${payloadRoot}.`,
    );
  }

  const stageDir = path.join(portableRoot, `.portable-runtime-recovery-${process.pid}-${Date.now()}`);
  const startedAt = Date.now();
  logPortableRuntime(
    `Recovering runtime at ${runtimeDir} from ${payloadRoot} (reason=${validation.reason ?? "unknown"})`,
  );
  removePath(stageDir);

  try {
    const extraction = extractPortablePayloadToStage({
      stageDir,
      payloadPaths: resolvePortableRecoveryPayloadPaths(payloadRoot),
      versionFile,
      runtimeManifest,
      finalRuntimeDir: runtimeDir,
    });

    replacePortableRuntimeAtomically({
      portableRoot,
      stageDir,
      finalize: () => {
        materializeRuntimeSymlinks(extraction.runtimeSymlinks);
      },
    });

    logPortableRuntime(
      `Recovered runtime: files=${extraction.copiedFiles}, symlinks=${extraction.symlinkCount}, durationMs=${Date.now() - startedAt}`,
    );
  } catch (error) {
    removePath(stageDir);
    throw error;
  }

  const postValidation = validateInstalledRuntimeVersion({
    versionRoot: portableRoot,
    sourceVersionFile: versionFile,
    sourceRuntimeManifest: runtimeManifest,
  });
  if (!postValidation.ok) {
    throw new Error(
      `Portable runtime validation failed after recovery (${postValidation.reason ?? "unknown_reason"}).`,
    );
  }

  logPortableRuntime(`Validated runtime at ${runtimeDir}`);

  return {
    recovered: true,
    recoveryReason: validation.reason,
    payloadRoot,
    versionFile,
    runtimeManifest,
    runtimeDir,
  };
}
