import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExperienceCandidate } from "@belldandy/memory";
import type { SkillRegistry } from "./skill-registry.js";

export function getUserSkillsDir(stateDir: string): string {
  return path.join(stateDir, "skills");
}

export async function publishSkillCandidate(
  candidate: ExperienceCandidate,
  stateDir: string,
  registry?: SkillRegistry | null,
): Promise<string> {
  const skillsDir = getUserSkillsDir(stateDir);
  await fs.mkdir(skillsDir, { recursive: true });

  const filePath = await resolveSkillPublishPath(skillsDir, candidate);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, candidate.content, "utf-8");

  if (registry) {
    await registry.loadUserSkills(skillsDir);
  }

  return filePath;
}

async function resolveSkillPublishPath(skillsDir: string, candidate: ExperienceCandidate): Promise<string> {
  if (candidate.publishedPath) {
    return candidate.publishedPath;
  }

  const baseDirName = toSafeSkillDirName(candidate.slug, candidate.taskId);
  const taskToken = normalizeAsciiToken(candidate.taskId, "task");
  const candidateToken = normalizeAsciiToken(candidate.id, "candidate");
  const candidateDirs = [
    baseDirName,
    `${baseDirName}-${taskToken}`,
    `${baseDirName}-${candidateToken}`,
  ];

  for (const dirName of candidateDirs) {
    const filePath = path.join(skillsDir, dirName, "SKILL.md");
    if (!(await pathExists(filePath))) {
      return filePath;
    }
  }

  return path.join(skillsDir, `${baseDirName}-${candidateToken}-${Date.now()}`, "SKILL.md");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toSafeSkillDirName(slug: string, taskId: string): string {
  const normalized = String(slug ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalized) {
    return normalized;
  }

  return `skill-${normalizeAsciiToken(taskId, "task")}`;
}

function normalizeAsciiToken(value: string, fallback: string): string {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}
