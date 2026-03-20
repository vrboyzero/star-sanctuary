import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { getGoalsRegistryPath } from "./paths.js";
import type { GoalRegistry, GoalRegistryEntry } from "./types.js";

function createEmptyRegistry(): GoalRegistry {
  return {
    version: 1,
    goals: [],
    updatedAt: new Date().toISOString(),
  };
}

async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, targetPath);
}

export async function loadGoalRegistry(stateDir: string): Promise<GoalRegistry> {
  const registryPath = getGoalsRegistryPath(stateDir);
  try {
    const raw = await fs.readFile(registryPath, "utf-8");
    const parsed = JSON.parse(raw) as GoalRegistry;
    if (parsed.version !== 1 || !Array.isArray(parsed.goals)) {
      throw new Error("Invalid goals registry schema.");
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return createEmptyRegistry();
    }
    throw err;
  }
}

export async function saveGoalRegistry(stateDir: string, registry: GoalRegistry): Promise<void> {
  const registryPath = getGoalsRegistryPath(stateDir);
  await atomicWriteJson(registryPath, {
    ...registry,
    version: 1,
    updatedAt: new Date().toISOString(),
  } satisfies GoalRegistry);
}

export async function upsertGoalRegistryEntry(stateDir: string, entry: GoalRegistryEntry): Promise<GoalRegistry> {
  const registry = await loadGoalRegistry(stateDir);
  const nextGoals = registry.goals.filter((goal) => goal.id !== entry.id);
  nextGoals.push(entry);
  const nextRegistry: GoalRegistry = {
    version: 1,
    goals: nextGoals.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    updatedAt: new Date().toISOString(),
  };
  await saveGoalRegistry(stateDir, nextRegistry);
  return nextRegistry;
}

export async function getGoalRegistryEntry(stateDir: string, goalId: string): Promise<GoalRegistryEntry | null> {
  const registry = await loadGoalRegistry(stateDir);
  return registry.goals.find((goal) => goal.id === goalId) ?? null;
}

export async function listGoalRegistryEntries(stateDir: string): Promise<GoalRegistryEntry[]> {
  const registry = await loadGoalRegistry(stateDir);
  return [...registry.goals].sort((a, b) => {
    const left = a.lastActiveAt || a.updatedAt;
    const right = b.lastActiveAt || b.updatedAt;
    return right.localeCompare(left);
  });
}

