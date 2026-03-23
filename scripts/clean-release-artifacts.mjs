import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workspaceRoot = process.cwd();
const artifactsRoot = path.join(workspaceRoot, "artifacts");
const keepCache = !process.argv.includes("--purge-cache");

const TOP_LEVEL_KEEP_NAMES = new Set(["portable", "single-exe"]);
if (keepCache) {
  TOP_LEVEL_KEEP_NAMES.add("_cache");
}

const TOP_LEVEL_REMOVE_PATTERNS = [
  /^portable-(env|state)(?:-|$)/i,
  /^single-exe-(home|state)(?:-|$)/i,
  /^portable-.*\.(stdout|stderr)\.log$/i,
  /^single-exe-.*\.(stdout|stderr)\.log$/i,
  /\.cleanup-\d+-/i,
];

const RELEASE_DIR_KEEP_PATTERN = /^(?:star-sanctuary-single-exe-)?(win32|linux|darwin)-[a-z0-9]+(?:-full)?(?:-v[0-9A-Za-z._-]+)?$/i;
const RELEASE_DIR_REMOVE_PATTERNS = [
  /\.failed-\d/i,
  /\.previous-/i,
  /\.cleanup-\d+-/i,
];

const RELEASE_PACKAGE_EXTRA_REMOVE_PATTERNS = [
  /-report\.json$/i,
  /\.cleanup-\d+-/i,
];

function getCleanupHoldingRoot() {
  return path.join(artifactsRoot, "_cache", ".cleanup-holding");
}

function createTombstonePath(targetPath) {
  const tombstoneName = `.${path.basename(targetPath)}.cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  if (!keepCache) {
    return path.join(path.dirname(targetPath), tombstoneName);
  }

  const cleanupHoldingRoot = getCleanupHoldingRoot();
  fs.mkdirSync(cleanupHoldingRoot, { recursive: true });
  return path.join(cleanupHoldingRoot, tombstoneName);
}

function removePathNow(targetPath) {
  fs.rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: 2,
    retryDelay: 100,
  });
}

function runWindowsCommand(command) {
  return spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
    stdio: "pipe",
    windowsHide: true,
    timeout: 8000,
  });
}

function quoteWindowsPath(targetPath) {
  return `"${targetPath.replace(/"/g, '""')}"`;
}

function removePathWithWindowsShell(targetPath) {
  const quotedPath = quoteWindowsPath(targetPath);
  runWindowsCommand(`attrib -r ${quotedPath} /s /d >nul 2>nul`);
  runWindowsCommand(`attrib -r ${quotedPath}\\* /s /d >nul 2>nul`);
  const result = runWindowsCommand(`rmdir /s /q ${quotedPath}`);
  return !result.error && (result.status === 0 || !fs.existsSync(targetPath));
}

function isInsideCleanupHolding(targetPath) {
  const cleanupHoldingRoot = path.resolve(getCleanupHoldingRoot()) + path.sep;
  const resolvedTargetPath = path.resolve(targetPath);
  return resolvedTargetPath.startsWith(cleanupHoldingRoot);
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { removed: false, skipped: false };
  }

  const stat = fs.lstatSync(targetPath);

  if (process.platform === "win32" && stat.isDirectory()) {
    try {
      if (removePathWithWindowsShell(targetPath)) {
        return { removed: true, skipped: false, parked: null };
      }
      if (isInsideCleanupHolding(targetPath)) {
        return { removed: false, skipped: true, parked: null, error: new Error("windows-shell-remove-failed") };
      }
      const tombstonePath = createTombstonePath(targetPath);
      fs.renameSync(targetPath, tombstonePath);
      if (removePathWithWindowsShell(tombstonePath)) {
        return { removed: true, skipped: false, parked: null };
      }
      if (!fs.existsSync(targetPath) && fs.existsSync(tombstonePath) && keepCache) {
        return { removed: true, skipped: false, parked: tombstonePath };
      }
      return { removed: false, skipped: true, parked: null, error: new Error("windows-shell-remove-failed") };
    } catch (error) {
      return { removed: false, skipped: true, parked: null, error };
    }
  }

  try {
    removePathNow(targetPath);
    return { removed: true, skipped: false, parked: null };
  } catch (error) {
    if (process.platform === "win32" && error?.code === "EPERM") {
      try {
        if (removePathWithWindowsShell(targetPath)) {
          return { removed: true, skipped: false, parked: null };
        }
        const tombstonePath = createTombstonePath(targetPath);
        fs.renameSync(targetPath, tombstonePath);
        if (removePathWithWindowsShell(tombstonePath)) {
          return { removed: true, skipped: false, parked: null };
        }
        if (!fs.existsSync(targetPath) && fs.existsSync(tombstonePath) && keepCache) {
          return { removed: true, skipped: false, parked: tombstonePath };
        }
        return { removed: false, skipped: true, parked: null, error };
      } catch (retryError) {
        return { removed: false, skipped: true, parked: null, error: retryError };
      }
    }

    return { removed: false, skipped: true, parked: null, error };
  }
}

function rel(targetPath) {
  return path.relative(workspaceRoot, targetPath);
}

function matchesAnyPattern(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function isTopLevelRemovable(entryName) {
  return matchesAnyPattern(entryName, TOP_LEVEL_REMOVE_PATTERNS);
}

function isReleaseVariantDir(entryName) {
  return RELEASE_DIR_KEEP_PATTERN.test(entryName);
}

function cleanTopLevelArtifacts() {
  const removed = [];
  const parked = [];
  const skipped = [];

  for (const entry of fs.readdirSync(artifactsRoot, { withFileTypes: true })) {
    const entryPath = path.join(artifactsRoot, entry.name);
    if (!keepCache && entry.name === "_cache") {
      const result = removePath(entryPath);
      if (result.removed) {
        removed.push(entryPath);
        if (result.parked) {
          parked.push(result.parked);
        }
        continue;
      }
      if (result.skipped) {
        skipped.push({ path: entryPath, error: result.error });
      }
      continue;
    }
    if (TOP_LEVEL_KEEP_NAMES.has(entry.name)) continue;
    if (!isTopLevelRemovable(entry.name)) continue;
    const result = removePath(entryPath);
    if (result.removed) {
      removed.push(entryPath);
      if (result.parked) {
        parked.push(result.parked);
      }
      continue;
    }
    if (result.skipped) {
      skipped.push({ path: entryPath, error: result.error });
    }
  }

  return { removed, parked, skipped };
}

function cleanCleanupHoldingRoot() {
  const cleanupHoldingRoot = getCleanupHoldingRoot();
  if (!keepCache || !fs.existsSync(cleanupHoldingRoot)) {
    return { removed: [], parked: [], skipped: [] };
  }

  const removed = [];
  const parked = [];
  const skipped = [];

  for (const entry of fs.readdirSync(cleanupHoldingRoot, { withFileTypes: true })) {
    const entryPath = path.join(cleanupHoldingRoot, entry.name);
    const result = removePath(entryPath);
    if (result.removed) {
      removed.push(entryPath);
      if (result.parked) {
        parked.push(result.parked);
      }
      continue;
    }
    if (result.skipped) {
      skipped.push({ path: entryPath, error: result.error });
    }
  }

  if (fs.existsSync(cleanupHoldingRoot) && fs.readdirSync(cleanupHoldingRoot).length === 0) {
    fs.rmdirSync(cleanupHoldingRoot);
  }

  return { removed, parked, skipped };
}

function cleanReleaseContainer(containerName) {
  const containerRoot = path.join(artifactsRoot, containerName);
  if (!fs.existsSync(containerRoot)) {
    return { removed: [], keptVariants: [], skipped: [] };
  }

  const removed = [];
  const keptVariants = [];
  const parked = [];
  const skipped = [];

  for (const entry of fs.readdirSync(containerRoot, { withFileTypes: true })) {
    const entryPath = path.join(containerRoot, entry.name);

    if (entry.isDirectory() && isReleaseVariantDir(entry.name)) {
      keptVariants.push(entryPath);
      continue;
    }

    if (matchesAnyPattern(entry.name, RELEASE_DIR_REMOVE_PATTERNS)) {
      const result = removePath(entryPath);
      if (result.removed) {
        removed.push(entryPath);
        if (result.parked) {
          parked.push(result.parked);
        }
        continue;
      }
      if (result.skipped) {
        skipped.push({ path: entryPath, error: result.error });
      }
      continue;
    }
  }

  return { removed, keptVariants, parked, skipped };
}

function cleanReleaseVariantDir(variantDir) {
  const removed = [];
  const parked = [];
  const skipped = [];

  for (const entry of fs.readdirSync(variantDir, { withFileTypes: true })) {
    const entryPath = path.join(variantDir, entry.name);

    if (entry.isDirectory() && entry.name === "build") {
      const result = removePath(entryPath);
      if (result.removed) {
        removed.push(entryPath);
        if (result.parked) {
          parked.push(result.parked);
        }
        continue;
      }
      if (result.skipped) {
        skipped.push({ path: entryPath, error: result.error });
      }
      continue;
    }

    if (matchesAnyPattern(entry.name, RELEASE_PACKAGE_EXTRA_REMOVE_PATTERNS)) {
      const result = removePath(entryPath);
      if (result.removed) {
        removed.push(entryPath);
        if (result.parked) {
          parked.push(result.parked);
        }
        continue;
      }
      if (result.skipped) {
        skipped.push({ path: entryPath, error: result.error });
      }
    }
  }

  return { removed, parked, skipped };
}

function main() {
  if (!fs.existsSync(artifactsRoot)) {
    console.log("[clean:release-artifacts] artifacts directory does not exist, nothing to clean.");
    return;
  }

  const cleanupHoldingResult = cleanCleanupHoldingRoot();
  const topLevelResult = cleanTopLevelArtifacts();
  const portableResult = cleanReleaseContainer("portable");
  const singleExeResult = cleanReleaseContainer("single-exe");
  const variantResults = [
    ...portableResult.keptVariants.map(cleanReleaseVariantDir),
    ...singleExeResult.keptVariants.map(cleanReleaseVariantDir),
  ];

  const removedInsideReleaseDirs = variantResults.flatMap((result) => result.removed);
  const parkedPaths = [
    ...cleanupHoldingResult.parked,
    ...topLevelResult.parked,
    ...portableResult.parked,
    ...singleExeResult.parked,
    ...variantResults.flatMap((result) => result.parked),
  ];
  const skippedPaths = [
    ...cleanupHoldingResult.skipped,
    ...topLevelResult.skipped,
    ...portableResult.skipped,
    ...singleExeResult.skipped,
    ...variantResults.flatMap((result) => result.skipped),
  ];

  const removedPaths = [
    ...cleanupHoldingResult.removed,
    ...topLevelResult.removed,
    ...portableResult.removed,
    ...singleExeResult.removed,
    ...removedInsideReleaseDirs,
  ];

  for (const removedPath of removedPaths) {
    console.log(`[clean:release-artifacts] removed ${rel(removedPath)}`);
  }
  for (const parkedPath of parkedPaths) {
    console.warn(`[clean:release-artifacts] parked ${rel(parkedPath)}`);
  }
  for (const skipped of skippedPaths) {
    const errorCode = skipped.error?.code ?? "UNKNOWN";
    console.warn(`[clean:release-artifacts] skipped ${rel(skipped.path)} (${errorCode})`);
  }

  const keptRoots = [
    ...portableResult.keptVariants,
    ...singleExeResult.keptVariants,
    ...(keepCache && fs.existsSync(path.join(artifactsRoot, "_cache"))
      ? [path.join(artifactsRoot, "_cache")]
      : []),
  ];
  for (const keptPath of keptRoots) {
    console.log(`[clean:release-artifacts] kept ${rel(keptPath)}`);
  }

  console.log(
    `[clean:release-artifacts] done, removed ${removedPaths.length} path(s), parked ${parkedPaths.length} path(s), skipped ${skippedPaths.length} path(s), cache ${keepCache ? "kept" : "purged if present"}.`,
  );
}

main();
