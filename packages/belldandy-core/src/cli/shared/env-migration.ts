import fs from "node:fs/promises";
import path from "node:path";

import { resolveEnvFilePaths } from "@star-sanctuary/distribution";

export type EnvMigrationStatus =
  | "migrated"
  | "dry_run"
  | "no_source"
  | "already_target"
  | "conflict";

export interface EnvMigrationConflict {
  sourcePath: string;
  targetPath: string;
}

export interface EnvMigrationResult {
  status: EnvMigrationStatus;
  sourceEnvDir: string;
  targetEnvDir: string;
  copied: string[];
  backedUp: string[];
  unchanged: string[];
  conflicts: EnvMigrationConflict[];
}

export interface MigrateEnvFilesToStateDirOptions {
  sourceEnvDir: string;
  targetEnvDir: string;
  dryRun?: boolean;
  backupSuffix?: string;
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

function buildBackupPath(filePath: string, suffix: string): string {
  return `${filePath}.migrated-to-state-dir.${suffix}.bak`;
}

export async function migrateEnvFilesToStateDir(
  options: MigrateEnvFilesToStateDirOptions,
): Promise<EnvMigrationResult> {
  const sourceEnvDir = path.resolve(options.sourceEnvDir);
  const targetEnvDir = path.resolve(options.targetEnvDir);
  const dryRun = options.dryRun ?? false;
  const backupSuffix = options.backupSuffix ?? new Date().toISOString().replace(/[:.]/g, "-");

  if (sourceEnvDir === targetEnvDir) {
    return {
      status: "already_target",
      sourceEnvDir,
      targetEnvDir,
      copied: [],
      backedUp: [],
      unchanged: [],
      conflicts: [],
    };
  }

  const sourcePaths = resolveEnvFilePaths({ envDir: sourceEnvDir });
  const targetPaths = resolveEnvFilePaths({ envDir: targetEnvDir });

  const pairs = [
    { sourcePath: sourcePaths.envPath, targetPath: targetPaths.envPath },
    { sourcePath: sourcePaths.envLocalPath, targetPath: targetPaths.envLocalPath },
  ];

  const copied: string[] = [];
  const backedUp: string[] = [];
  const unchanged: string[] = [];
  const conflicts: EnvMigrationConflict[] = [];

  const plannedCopies: Array<{ sourcePath: string; targetPath: string }> = [];
  const plannedBackups: Array<{ sourcePath: string; backupPath: string }> = [];

  for (const pair of pairs) {
    const sourceContent = await readFileIfExists(pair.sourcePath);
    if (sourceContent === null) {
      continue;
    }

    const targetContent = await readFileIfExists(pair.targetPath);
    if (targetContent !== null && targetContent !== sourceContent) {
      conflicts.push({
        sourcePath: pair.sourcePath,
        targetPath: pair.targetPath,
      });
      continue;
    }

    if (targetContent === null) {
      plannedCopies.push(pair);
    } else {
      unchanged.push(pair.targetPath);
    }

    plannedBackups.push({
      sourcePath: pair.sourcePath,
      backupPath: buildBackupPath(pair.sourcePath, backupSuffix),
    });
  }

  if (plannedCopies.length === 0 && plannedBackups.length === 0 && conflicts.length === 0) {
    return {
      status: "no_source",
      sourceEnvDir,
      targetEnvDir,
      copied,
      backedUp,
      unchanged,
      conflicts,
    };
  }

  if (conflicts.length > 0) {
    return {
      status: "conflict",
      sourceEnvDir,
      targetEnvDir,
      copied,
      backedUp,
      unchanged,
      conflicts,
    };
  }

  if (dryRun) {
    return {
      status: "dry_run",
      sourceEnvDir,
      targetEnvDir,
      copied: plannedCopies.map((item) => item.targetPath),
      backedUp: plannedBackups.map((item) => item.backupPath),
      unchanged,
      conflicts,
    };
  }

  await fs.mkdir(targetEnvDir, { recursive: true });

  for (const item of plannedCopies) {
    await fs.copyFile(item.sourcePath, item.targetPath);
    copied.push(item.targetPath);
  }

  for (const item of plannedBackups) {
    await fs.rename(item.sourcePath, item.backupPath);
    backedUp.push(item.backupPath);
  }

  return {
    status: "migrated",
    sourceEnvDir,
    targetEnvDir,
    copied,
    backedUp,
    unchanged,
    conflicts,
  };
}
