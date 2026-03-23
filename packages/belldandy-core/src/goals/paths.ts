import path from "node:path";
import { resolveStateDir } from "@belldandy/protocol";
import type { GoalPathSource, GoalPaths } from "./types.js";

export function getGoalsRoot(stateDir: string): string {
  return path.join(stateDir, "goals");
}

export function getGoalsRegistryPath(stateDir: string): string {
  return path.join(getGoalsRoot(stateDir), "index.json");
}

export function getGoalsDocsRoot(stateDir: string): string {
  return path.join(stateDir, "docs", "long-tasks");
}

export function normalizeGoalSlug(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const normalized = trimmed
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "goal";
}

export function normalizeGoalId(input: string): string {
  return normalizeGoalSlug(input).replace(/[^a-z0-9_-]+/g, "-");
}

export function ensureAbsoluteGoalRoot(goalRoot: string): string {
  const trimmed = goalRoot.trim();
  if (!trimmed) {
    throw new Error("goalRoot cannot be empty.");
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error(`goalRoot must be an absolute path. Received: ${goalRoot}`);
  }
  return path.resolve(trimmed);
}

export function resolveGoalPaths(input: {
  stateDir?: string;
  slug: string;
  goalId: string;
  goalRoot?: string;
}): GoalPaths & { pathSource: GoalPathSource } {
  const stateDir = input.stateDir || resolveStateDir(process.env);
  const registryPath = getGoalsRegistryPath(stateDir);
  const defaultGoalsRoot = getGoalsRoot(stateDir);
  const docsRoot = getGoalsDocsRoot(stateDir);
  const docRoot = path.join(docsRoot, input.slug);
  const resolvedGoalRoot = input.goalRoot
    ? ensureAbsoluteGoalRoot(input.goalRoot)
    : path.join(defaultGoalsRoot, input.goalId);

  return {
    registryPath,
    defaultGoalsRoot,
    docsRoot,
    goalRoot: resolvedGoalRoot,
    runtimeRoot: resolvedGoalRoot,
    docRoot,
    northstarPath: path.join(docRoot, "NORTHSTAR.md"),
    tasksPath: path.join(docRoot, "tasks.json"),
    progressPath: path.join(docRoot, "progress.md"),
    handoffPath: path.join(docRoot, "handoff.md"),
    pathSource: input.goalRoot ? "user-configured" : "default",
  };
}

