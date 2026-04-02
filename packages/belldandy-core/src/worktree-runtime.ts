import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { AgentLaunchSpec } from "@belldandy/agent";

const execFile = promisify(execFileCallback);

export type WorktreeRuntimeStatus =
  | "not_requested"
  | "pending"
  | "created"
  | "failed"
  | "missing"
  | "removed"
  | "remove_failed";

export type SubTaskWorktreeRuntimeSummary = {
  requestedCwd?: string;
  resolvedCwd?: string;
  worktreePath?: string;
  worktreeRepoRoot?: string;
  worktreeBranch?: string;
  worktreeStatus?: WorktreeRuntimeStatus;
  worktreeError?: string;
};

export type PreparedSubTaskLaunchSpec = {
  launchSpec: AgentLaunchSpec;
  summary: SubTaskWorktreeRuntimeSummary;
};

export type PersistedSubTaskWorktreeRuntime = {
  cwd?: string;
  resolvedCwd?: string;
  isolationMode?: string;
  worktreePath?: string;
  worktreeRepoRoot?: string;
  worktreeBranch?: string;
};

type RuntimeLogger = {
  info?: (message: string, data?: unknown) => void;
  warn?: (message: string, data?: unknown) => void;
  error?: (message: string, data?: unknown) => void;
  debug?: (message: string, data?: unknown) => void;
};

function sanitizeTaskBranch(taskId: string): string {
  return `belldandy-${taskId}`
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "belldandy-subtask";
}

function buildGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
  };
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile("git", args, {
    cwd,
    env: buildGitEnv(),
    windowsHide: true,
  });
  return String(stdout ?? "").trim();
}

async function resolveExistingPath(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class SubTaskWorktreeRuntime {
  private readonly worktreesDir: string;
  private readonly logger?: RuntimeLogger;

  constructor(stateDir: string, logger?: RuntimeLogger) {
    this.worktreesDir = path.join(stateDir, "subtasks", "worktrees");
    this.logger = logger;
  }

  private isManagedWorktreePath(targetPath: string): boolean {
    const relative = path.relative(this.worktreesDir, path.resolve(targetPath));
    return !(relative.startsWith("..") || path.isAbsolute(relative));
  }

  private async resolveReconciledCwd(runtime: PersistedSubTaskWorktreeRuntime): Promise<string | undefined> {
    const worktreePath = runtime.worktreePath ? path.resolve(runtime.worktreePath) : undefined;
    if (!worktreePath) return runtime.resolvedCwd ? path.resolve(runtime.resolvedCwd) : undefined;

    const repoRoot = runtime.worktreeRepoRoot ? path.resolve(runtime.worktreeRepoRoot) : undefined;
    const requestedCwd = runtime.cwd ? path.resolve(runtime.cwd) : undefined;
    const previousResolvedCwd = runtime.resolvedCwd ? path.resolve(runtime.resolvedCwd) : undefined;

    if (requestedCwd && repoRoot) {
      const relativeCwd = path.relative(repoRoot, requestedCwd);
      if (!(relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd))) {
        const relativeTarget = relativeCwd && relativeCwd !== "." ? path.join(worktreePath, relativeCwd) : worktreePath;
        if (await resolveExistingPath(relativeTarget)) {
          return relativeTarget;
        }
      }
    }

    if (previousResolvedCwd && await resolveExistingPath(previousResolvedCwd)) {
      return previousResolvedCwd;
    }

    return await resolveExistingPath(worktreePath) ? worktreePath : previousResolvedCwd;
  }

  async prepareTaskLaunch(taskId: string, launchSpec: AgentLaunchSpec): Promise<PreparedSubTaskLaunchSpec> {
    const baseCwd = launchSpec.cwd ? path.resolve(launchSpec.cwd) : undefined;
    if (launchSpec.isolationMode !== "worktree") {
      return {
        launchSpec,
        summary: {
          resolvedCwd: baseCwd,
          worktreeStatus: "not_requested",
        },
      };
    }

    if (!baseCwd) {
      throw new Error("isolationMode=worktree requires launchSpec.cwd.");
    }

    await fs.mkdir(this.worktreesDir, { recursive: true });

    const repoRoot = await runGit(["rev-parse", "--show-toplevel"], baseCwd)
      .catch((error) => {
        throw new Error(
          `Failed to resolve git repository for worktree isolation: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    if (!repoRoot) {
      throw new Error("Failed to resolve git repository root for worktree isolation.");
    }

    const relativeCwd = path.relative(repoRoot, baseCwd);
    if (relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd)) {
      throw new Error(`Launch cwd is outside of the resolved repository root: ${baseCwd}`);
    }

    const worktreePath = path.join(this.worktreesDir, taskId);
    const worktreeBranch = sanitizeTaskBranch(taskId);

    if (await resolveExistingPath(worktreePath)) {
      throw new Error(`Worktree path already exists for task ${taskId}: ${worktreePath}`);
    }

    this.logger?.info?.("Creating subtask worktree runtime.", {
      taskId,
      repoRoot,
      baseCwd,
      worktreePath,
      worktreeBranch,
    });

    try {
      await runGit(["worktree", "add", "-b", worktreeBranch, worktreePath, "HEAD"], repoRoot);
    } catch (error) {
      throw new Error(`Failed to create git worktree: ${error instanceof Error ? error.message : String(error)}`);
    }

    const relativeTarget = relativeCwd && relativeCwd !== "." ? path.join(worktreePath, relativeCwd) : worktreePath;
    const resolvedCwd = await resolveExistingPath(relativeTarget) ? relativeTarget : worktreePath;
    return {
      launchSpec: {
        ...launchSpec,
        cwd: resolvedCwd,
      },
      summary: {
        resolvedCwd,
        worktreePath,
        worktreeRepoRoot: repoRoot,
        worktreeBranch,
        worktreeStatus: "created",
      },
    };
  }

  async reconcileTaskRuntime(
    taskId: string,
    runtime: PersistedSubTaskWorktreeRuntime,
  ): Promise<SubTaskWorktreeRuntimeSummary> {
    const requestedCwd = runtime.cwd ? path.resolve(runtime.cwd) : undefined;
    const previousResolvedCwd = runtime.resolvedCwd ? path.resolve(runtime.resolvedCwd) : undefined;
    const worktreePath = runtime.worktreePath ? path.resolve(runtime.worktreePath) : undefined;
    const worktreeRepoRoot = runtime.worktreeRepoRoot ? path.resolve(runtime.worktreeRepoRoot) : undefined;

    if (runtime.isolationMode !== "worktree") {
      return {
        requestedCwd,
        resolvedCwd: requestedCwd ?? previousResolvedCwd,
        worktreeStatus: "not_requested",
      };
    }

    if (!worktreePath) {
      return {
        requestedCwd,
        resolvedCwd: previousResolvedCwd ?? requestedCwd,
        worktreeRepoRoot,
        worktreeBranch: runtime.worktreeBranch,
        worktreeStatus: "failed",
        worktreeError: "Missing persisted worktree path for worktree-isolated task.",
      };
    }

    if (!this.isManagedWorktreePath(worktreePath)) {
      return {
        requestedCwd,
        resolvedCwd: previousResolvedCwd ?? requestedCwd,
        worktreePath,
        worktreeRepoRoot,
        worktreeBranch: runtime.worktreeBranch,
        worktreeStatus: "failed",
        worktreeError: `Persisted worktree path is outside the managed subtask runtime root: ${worktreePath}`,
      };
    }

    if (!(await resolveExistingPath(worktreePath))) {
      return {
        requestedCwd,
        resolvedCwd: previousResolvedCwd ?? requestedCwd,
        worktreePath,
        worktreeRepoRoot,
        worktreeBranch: runtime.worktreeBranch,
        worktreeStatus: "missing",
        worktreeError: `Persisted worktree path is missing: ${worktreePath}`,
      };
    }

    const resolvedCwd = await this.resolveReconciledCwd({
      ...runtime,
      cwd: requestedCwd,
      resolvedCwd: previousResolvedCwd,
      worktreePath,
      worktreeRepoRoot,
    });

    this.logger?.info?.("Reconciled persisted subtask worktree runtime.", {
      taskId,
      worktreePath,
      requestedCwd,
      resolvedCwd,
    });

    return {
      requestedCwd,
      resolvedCwd,
      worktreePath,
      worktreeRepoRoot,
      worktreeBranch: runtime.worktreeBranch,
      worktreeStatus: "created",
    };
  }

  async cleanupTaskRuntime(
    taskId: string,
    runtime: PersistedSubTaskWorktreeRuntime,
  ): Promise<SubTaskWorktreeRuntimeSummary> {
    const requestedCwd = runtime.cwd ? path.resolve(runtime.cwd) : undefined;
    const previousResolvedCwd = runtime.resolvedCwd ? path.resolve(runtime.resolvedCwd) : undefined;
    const worktreePath = runtime.worktreePath ? path.resolve(runtime.worktreePath) : undefined;
    const worktreeRepoRoot = runtime.worktreeRepoRoot ? path.resolve(runtime.worktreeRepoRoot) : undefined;
    const worktreeBranch = runtime.worktreeBranch?.trim() || undefined;

    if (runtime.isolationMode !== "worktree") {
      return {
        requestedCwd,
        resolvedCwd: requestedCwd ?? previousResolvedCwd,
        worktreeStatus: "not_requested",
      };
    }

    if (worktreePath && !this.isManagedWorktreePath(worktreePath)) {
      return {
        requestedCwd,
        resolvedCwd: previousResolvedCwd ?? requestedCwd,
        worktreePath,
        worktreeRepoRoot,
        worktreeBranch,
        worktreeStatus: "remove_failed",
        worktreeError: `Refusing to remove unmanaged worktree path: ${worktreePath}`,
      };
    }

    const worktreeExists = worktreePath ? await resolveExistingPath(worktreePath) : false;
    const repoRootExists = worktreeRepoRoot ? await resolveExistingPath(worktreeRepoRoot) : false;

    this.logger?.info?.("Cleaning up subtask worktree runtime.", {
      taskId,
      worktreePath,
      worktreeRepoRoot,
      worktreeBranch,
      worktreeExists,
      repoRootExists,
    });

    try {
      if (worktreeExists && worktreePath && worktreeRepoRoot && repoRootExists) {
        await runGit(["worktree", "remove", "--force", worktreePath], worktreeRepoRoot);
      } else if (worktreeExists && worktreePath) {
        await fs.rm(worktreePath, { recursive: true, force: true });
      }

      if (worktreeRepoRoot && repoRootExists) {
        await runGit(["worktree", "prune"], worktreeRepoRoot).catch(() => "");
        if (worktreeBranch) {
          const branchListing = await runGit(["branch", "--list", worktreeBranch], worktreeRepoRoot).catch(() => "");
          if (branchListing.trim()) {
            await runGit(["branch", "-D", worktreeBranch], worktreeRepoRoot);
          }
        }
        await runGit(["worktree", "prune"], worktreeRepoRoot).catch(() => "");
      }
    } catch (error) {
      return {
        requestedCwd,
        resolvedCwd: previousResolvedCwd ?? requestedCwd,
        worktreePath,
        worktreeRepoRoot,
        worktreeBranch,
        worktreeStatus: "remove_failed",
        worktreeError: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      requestedCwd,
      resolvedCwd: previousResolvedCwd ?? requestedCwd,
      worktreePath,
      worktreeRepoRoot,
      worktreeBranch,
      worktreeStatus: "removed",
    };
  }
}
