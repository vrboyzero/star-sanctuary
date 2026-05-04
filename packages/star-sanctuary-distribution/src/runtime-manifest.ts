import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export type RuntimeManifestFileEntry = {
  path: string;
  type: "file" | "symlink";
  size?: number;
  sha256?: string;
  target?: string;
};

export type RuntimeManifest = {
  productName: string;
  version: string;
  distributionMode?: "slim" | "full";
  platform: string;
  arch: string;
  builtAt: string;
  includeOptionalNative: boolean;
  runtimeDir: string;
  summary: {
    fileCount: number;
    totalSize: number;
  };
  files: RuntimeManifestFileEntry[];
};

export type PortableVersionFile = {
  productName: string;
  version: string;
  distributionMode?: "slim" | "full";
  distributionPolicy?: {
    policyVersion: number;
    mode: "slim" | "full";
    summary: string;
    alwaysIncluded: Array<{
      dependency: string;
      sourcePackage: string;
      reason: string;
    }>;
    optionalDependencies: Array<{
      dependency: string;
      sourcePackage: string;
      packageDir: string;
      enabledIn: string[];
      excludedIn: string[];
      reason: string;
    }>;
    includedOptionalDependencies: string[];
    excludedOptionalDependencies: string[];
    actualRuntimeOptionalDependencies: string[];
  };
  platform: string;
  arch: string;
  builtAt: string;
  includeOptionalNative: boolean;
  runtimeDir: string;
  entryScript: string;
  runtimeSummary?: {
    fileCount: number;
    totalSize: number;
  };
  files?: {
    runtimeManifest?: {
      path: string;
      size: number;
      sha256: string;
    };
  };
};

export type RuntimePayloadPaths = {
  payloadRoot: string;
  versionFilePath: string;
  runtimeManifestPath: string;
  runtimeSourceDir: string;
};

export type RuntimeInstallationValidation = {
  ok: boolean;
  reason?: string;
  expectedKey?: string;
  actualKey?: string;
  missingPaths?: string[];
  invalidPaths?: Array<{ path: string; reason: string }>;
};

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function resolveManifestEntryPath(params: {
  versionRoot: string;
  runtimeDir: string;
  entryPath: string;
}): string {
  const { versionRoot, runtimeDir, entryPath } = params;
  return path.join(versionRoot, runtimeDir, ...entryPath.split("/"));
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

function normalizeResolvedPath(targetPath: string): string {
  const resolvedPath = typeof fs.realpathSync.native === "function"
    ? fs.realpathSync.native(targetPath)
    : fs.realpathSync(targetPath);
  return normalizeRelativePath(path.resolve(resolvedPath));
}

function validateInstalledRuntimeManifestEntries(params: {
  versionRoot: string;
  runtimeManifest: RuntimeManifest;
}): RuntimeInstallationValidation {
  const { versionRoot, runtimeManifest } = params;
  const invalidPaths: Array<{ path: string; reason: string }> = [];

  for (const entry of runtimeManifest.files) {
    const absolutePath = resolveManifestEntryPath({
      versionRoot,
      runtimeDir: runtimeManifest.runtimeDir,
      entryPath: entry.path,
    });

    if (!fs.existsSync(absolutePath)) {
      invalidPaths.push({ path: entry.path, reason: "missing" });
      continue;
    }

    if (entry.type === "file") {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch (error) {
        invalidPaths.push({
          path: entry.path,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (!stat.isFile()) {
        invalidPaths.push({ path: entry.path, reason: "expected_file" });
        continue;
      }

      if (typeof entry.size === "number" && stat.size !== entry.size) {
        invalidPaths.push({
          path: entry.path,
          reason: `size_mismatch:${stat.size}!=${entry.size}`,
        });
        continue;
      }

      if (entry.sha256 && sha256File(absolutePath) !== entry.sha256) {
        invalidPaths.push({ path: entry.path, reason: "sha256_mismatch" });
      }
      continue;
    }

    if (!entry.target) {
      invalidPaths.push({ path: entry.path, reason: "missing_symlink_target" });
      continue;
    }

    try {
      const expectedTargetPath = resolveManifestSymlinkTargetPath({
        linkPath: absolutePath,
        target: entry.target,
      });
      if (process.platform === "win32") {
        const linkStat = fs.lstatSync(absolutePath);
        const targetStat = fs.statSync(expectedTargetPath);
        if (!linkStat.isSymbolicLink() && linkStat.isDirectory() && targetStat.isDirectory()) {
          continue;
        }
      }
      const actualResolvedPath = normalizeResolvedPath(absolutePath);
      const expectedResolvedPath = normalizeResolvedPath(expectedTargetPath);
      if (actualResolvedPath !== expectedResolvedPath) {
        invalidPaths.push({ path: entry.path, reason: "symlink_target_mismatch" });
      }
    } catch (error) {
      invalidPaths.push({
        path: entry.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (invalidPaths.length > 0) {
    return {
      ok: false,
      reason: "runtime_manifest_entry_mismatch",
      invalidPaths,
    };
  }

  return { ok: true };
}

function resolveMaybePath(value: string | undefined): string | undefined {
  return value && value.trim() ? path.resolve(value.trim()) : undefined;
}

export function resolveSingleExePayloadRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = resolveMaybePath(
    env.STAR_SANCTUARY_SINGLE_EXE_PAYLOAD_DIR
    ?? env.BELLDANDY_SINGLE_EXE_PAYLOAD_DIR,
  );
  if (explicit) return explicit;

  const executableDir = path.dirname(process.execPath);
  const candidates = [
    executableDir,
    path.join(executableDir, "payload"),
  ];

  for (const candidate of candidates) {
    const versionFilePath = path.join(candidate, "version.json");
    const runtimeManifestPath = path.join(candidate, "runtime-manifest.json");
    if (fs.existsSync(versionFilePath) && fs.existsSync(runtimeManifestPath)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to resolve single-exe payload root. Set STAR_SANCTUARY_SINGLE_EXE_PAYLOAD_DIR to a portable artifact directory.",
  );
}

export function resolveRuntimePayloadPaths(payloadRoot: string): RuntimePayloadPaths {
  const resolvedPayloadRoot = path.resolve(payloadRoot);
  return {
    payloadRoot: resolvedPayloadRoot,
    versionFilePath: path.join(resolvedPayloadRoot, "version.json"),
    runtimeManifestPath: path.join(resolvedPayloadRoot, "runtime-manifest.json"),
    runtimeSourceDir: path.join(resolvedPayloadRoot, "runtime"),
  };
}

export function readPortableVersionFile(payloadRoot: string): PortableVersionFile {
  const { versionFilePath } = resolveRuntimePayloadPaths(payloadRoot);
  return JSON.parse(fs.readFileSync(versionFilePath, "utf-8")) as PortableVersionFile;
}

export function readRuntimeManifest(payloadRoot: string): RuntimeManifest {
  const { runtimeManifestPath } = resolveRuntimePayloadPaths(payloadRoot);
  return JSON.parse(fs.readFileSync(runtimeManifestPath, "utf-8")) as RuntimeManifest;
}

export function getRuntimeVersionKey(versionFile: PortableVersionFile): string {
  return `${versionFile.version}-${versionFile.platform}-${versionFile.arch}`;
}

export function getCriticalRuntimeRelativePaths(versionFile: PortableVersionFile): string[] {
  const criticalPaths = new Set<string>([
    "version.json",
    "runtime-manifest.json",
    versionFile.entryScript,
    path.join(versionFile.runtimeDir, "packages", "belldandy-core", "dist", "bin", "gateway.js"),
    path.join(versionFile.runtimeDir, "apps", "web", "public", "index.html"),
    path.join(versionFile.runtimeDir, "templates", "AGENTS.md"),
  ]);

  return [...criticalPaths].map((item) => item.split(path.sep).join("/"));
}

export function validateInstalledRuntimeVersion(params: {
  versionRoot: string;
  sourceVersionFile: PortableVersionFile;
  sourceRuntimeManifest?: RuntimeManifest;
}): RuntimeInstallationValidation {
  const { versionRoot, sourceVersionFile, sourceRuntimeManifest } = params;
  const resolvedVersionRoot = path.resolve(versionRoot);
  const installedVersionFilePath = path.join(resolvedVersionRoot, "version.json");
  const installedRuntimeManifestPath = path.join(resolvedVersionRoot, "runtime-manifest.json");

  if (!fs.existsSync(installedVersionFilePath) || !fs.existsSync(installedRuntimeManifestPath)) {
    return { ok: false, reason: "missing_version_metadata" };
  }

  const installedVersionFile = JSON.parse(fs.readFileSync(installedVersionFilePath, "utf-8")) as PortableVersionFile;
  const expectedKey = getRuntimeVersionKey(sourceVersionFile);
  const actualKey = getRuntimeVersionKey(installedVersionFile);
  if (expectedKey !== actualKey) {
    return {
      ok: false,
      reason: "version_key_mismatch",
      expectedKey,
      actualKey,
    };
  }

  if (
    (sourceVersionFile.distributionMode ?? "slim")
      !== (installedVersionFile.distributionMode ?? (installedVersionFile.includeOptionalNative ? "full" : "slim"))
  ) {
    return {
      ok: false,
      reason: "distribution_mode_mismatch",
      expectedKey,
      actualKey,
    };
  }

  const expectedManifestSha = sourceVersionFile.files?.runtimeManifest?.sha256;
  const actualManifestSha = sha256File(installedRuntimeManifestPath);
  if (expectedManifestSha && expectedManifestSha !== actualManifestSha) {
    return {
      ok: false,
      reason: "runtime_manifest_sha_mismatch",
      expectedKey,
      actualKey,
    };
  }

  const missingPaths = getCriticalRuntimeRelativePaths(sourceVersionFile)
    .map((relativePath) => ({
      relativePath,
      absolutePath: path.join(resolvedVersionRoot, relativePath),
    }))
    .filter((entry) => !fs.existsSync(entry.absolutePath))
    .map((entry) => entry.relativePath);

  if (missingPaths.length > 0) {
    return {
      ok: false,
      reason: "missing_runtime_files",
      expectedKey,
      actualKey,
      missingPaths,
    };
  }

  if (sourceRuntimeManifest) {
    const installedRuntimeManifest = JSON.parse(
      fs.readFileSync(installedRuntimeManifestPath, "utf-8"),
    ) as RuntimeManifest;

    if (
      installedRuntimeManifest.runtimeDir !== sourceRuntimeManifest.runtimeDir
      || installedRuntimeManifest.summary.fileCount !== sourceRuntimeManifest.summary.fileCount
      || installedRuntimeManifest.summary.totalSize !== sourceRuntimeManifest.summary.totalSize
    ) {
      return {
        ok: false,
        reason: "runtime_manifest_summary_mismatch",
        expectedKey,
        actualKey,
      };
    }

    const manifestValidation = validateInstalledRuntimeManifestEntries({
      versionRoot: resolvedVersionRoot,
      runtimeManifest: sourceRuntimeManifest,
    });
    if (!manifestValidation.ok) {
      return {
        ...manifestValidation,
        expectedKey,
        actualKey,
      };
    }
  }

  return {
    ok: true,
    expectedKey,
    actualKey,
  };
}
