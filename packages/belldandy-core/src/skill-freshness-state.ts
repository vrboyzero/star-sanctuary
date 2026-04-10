import fs from "node:fs/promises";
import path from "node:path";

export interface SkillFreshnessManualMark {
  skillKey: string;
  sourceCandidateId?: string;
  reason?: string;
  markedAt: string;
  markedBy?: string;
}

interface SkillFreshnessStateFile {
  version: 1;
  manualStaleMarks: SkillFreshnessManualMark[];
}

const STATE_VERSION = 1 as const;

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizeSkillKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeManualMark(input: Partial<SkillFreshnessManualMark> | null | undefined): SkillFreshnessManualMark | null {
  const skillKey = normalizeSkillKey(input?.skillKey);
  if (!skillKey) {
    return null;
  }
  const markedAt = normalizeString(input?.markedAt) ?? new Date().toISOString();
  return {
    skillKey,
    ...(normalizeString(input?.sourceCandidateId) ? { sourceCandidateId: normalizeString(input?.sourceCandidateId) } : {}),
    ...(normalizeString(input?.reason) ? { reason: normalizeString(input?.reason) } : {}),
    ...(normalizeString(input?.markedBy) ? { markedBy: normalizeString(input?.markedBy) } : {}),
    markedAt,
  };
}

function normalizeStateFile(value: unknown): SkillFreshnessStateFile {
  const marks = Array.isArray((value as { manualStaleMarks?: unknown[] } | null | undefined)?.manualStaleMarks)
    ? (value as { manualStaleMarks: unknown[] }).manualStaleMarks
      .map((item) => normalizeManualMark(item as Partial<SkillFreshnessManualMark>))
      .filter((item): item is SkillFreshnessManualMark => Boolean(item))
    : [];
  return {
    version: STATE_VERSION,
    manualStaleMarks: marks,
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

export function resolveSkillFreshnessStatePath(stateDir: string): string {
  return path.join(path.resolve(stateDir), "diagnostics", "skill-freshness-state.json");
}

export async function readSkillFreshnessState(stateDir: string): Promise<SkillFreshnessStateFile> {
  const filePath = resolveSkillFreshnessStatePath(stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) as unknown : {};
    return normalizeStateFile(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {
        version: STATE_VERSION,
        manualStaleMarks: [],
      };
    }
    throw error;
  }
}

export function findSkillFreshnessManualMark(
  state: { manualStaleMarks?: SkillFreshnessManualMark[] } | null | undefined,
  input: { skillKey?: string; sourceCandidateId?: string },
): SkillFreshnessManualMark | undefined {
  const skillKey = normalizeSkillKey(input.skillKey);
  const sourceCandidateId = normalizeString(input.sourceCandidateId);
  return (state?.manualStaleMarks ?? []).find((item) => {
    if (sourceCandidateId && item.sourceCandidateId === sourceCandidateId) {
      return true;
    }
    return Boolean(skillKey) && item.skillKey === skillKey;
  });
}

export async function updateSkillFreshnessManualMark(
  stateDir: string,
  input: {
    skillKey: string;
    sourceCandidateId?: string;
    reason?: string;
    markedBy?: string;
    stale: boolean;
  },
): Promise<{ state: SkillFreshnessStateFile; mark?: SkillFreshnessManualMark }> {
  const skillKey = normalizeSkillKey(input.skillKey);
  if (!skillKey) {
    throw new Error("skillKey is required");
  }

  const nextState = await readSkillFreshnessState(stateDir);
  const sourceCandidateId = normalizeString(input.sourceCandidateId);
  nextState.manualStaleMarks = nextState.manualStaleMarks.filter((item) => {
    if (sourceCandidateId && item.sourceCandidateId === sourceCandidateId) {
      return false;
    }
    return item.skillKey !== skillKey;
  });

  let mark: SkillFreshnessManualMark | undefined;
  if (input.stale) {
    mark = {
      skillKey,
      ...(sourceCandidateId ? { sourceCandidateId } : {}),
      ...(normalizeString(input.reason) ? { reason: normalizeString(input.reason) } : {}),
      ...(normalizeString(input.markedBy) ? { markedBy: normalizeString(input.markedBy) } : {}),
      markedAt: new Date().toISOString(),
    };
    nextState.manualStaleMarks.unshift(mark);
  }

  await writeJsonAtomic(resolveSkillFreshnessStatePath(stateDir), nextState);
  return { state: nextState, ...(mark ? { mark } : {}) };
}
