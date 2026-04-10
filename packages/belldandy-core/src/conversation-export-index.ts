import crypto from "node:crypto";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";

const CONVERSATION_DEBUG_DIRNAME = "diagnostics";
const CONVERSATION_EXPORT_INDEX_FILENAME = "conversation-export-index.json";
const CONVERSATION_EXPORTS_DIRNAME = "conversation-exports";
const CONVERSATION_EXPORT_INDEX_VERSION = 1 as const;
const MAX_RECENT_EXPORT_RECORDS = 200;

export type ConversationExportArtifact = "transcript" | "timeline" | "prompt_snapshot";
export type ConversationExportFormat = "json" | "text";

export type ConversationExportIndexRecord = {
  id: string;
  conversationId: string;
  artifact: ConversationExportArtifact;
  format: ConversationExportFormat;
  outputPath: string;
  source: "cli";
  exportedAt: number;
  mode?: string;
  projectionFilter?: Record<string, unknown>;
};

export type ConversationExportIndexLedger = {
  version: typeof CONVERSATION_EXPORT_INDEX_VERSION;
  entries: ConversationExportIndexRecord[];
  updatedAt: number;
};

function createEmptyConversationExportIndex(): ConversationExportIndexLedger {
  return {
    version: CONVERSATION_EXPORT_INDEX_VERSION,
    entries: [],
    updatedAt: Date.now(),
  };
}

async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, targetPath);
}

export function getConversationExportIndexPath(stateDir: string): string {
  return path.join(stateDir, CONVERSATION_DEBUG_DIRNAME, CONVERSATION_EXPORT_INDEX_FILENAME);
}

export function getConversationArtifactExportRoot(input: {
  stateDir: string;
  artifact: ConversationExportArtifact;
}): string {
  const artifactDirName = input.artifact === "prompt_snapshot"
    ? "prompt-snapshots"
    : input.artifact === "timeline"
      ? "timelines"
      : "transcripts";
  return path.join(input.stateDir, CONVERSATION_DEBUG_DIRNAME, CONVERSATION_EXPORTS_DIRNAME, artifactDirName);
}

export async function loadConversationExportIndex(stateDir: string): Promise<ConversationExportIndexLedger> {
  const filePath = getConversationExportIndexPath(stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ConversationExportIndexLedger>;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries.filter((entry): entry is ConversationExportIndexRecord => Boolean(entry) && typeof entry === "object")
      : [];
    return {
      version: CONVERSATION_EXPORT_INDEX_VERSION,
      entries,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return createEmptyConversationExportIndex();
    }
    throw error;
  }
}

export async function recordConversationArtifactExport(input: {
  stateDir: string;
  conversationId: string;
  artifact: ConversationExportArtifact;
  format: ConversationExportFormat;
  outputPath: string;
  mode?: string;
  projectionFilter?: Record<string, unknown>;
}): Promise<ConversationExportIndexRecord> {
  const ledger = await loadConversationExportIndex(input.stateDir);
  const record: ConversationExportIndexRecord = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    artifact: input.artifact,
    format: input.format,
    outputPath: path.resolve(input.outputPath),
    source: "cli",
    exportedAt: Date.now(),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.projectionFilter ? { projectionFilter: input.projectionFilter } : {}),
  };

  await atomicWriteJson(getConversationExportIndexPath(input.stateDir), {
    version: CONVERSATION_EXPORT_INDEX_VERSION,
    updatedAt: record.exportedAt,
    entries: [record, ...ledger.entries].slice(0, MAX_RECENT_EXPORT_RECORDS),
  } satisfies ConversationExportIndexLedger);
  return record;
}

export async function listRecentConversationExports(input: {
  stateDir: string;
  conversationIdPrefix?: string;
  limit?: number;
}): Promise<ConversationExportIndexRecord[]> {
  const ledger = await loadConversationExportIndex(input.stateDir);
  const prefix = input.conversationIdPrefix?.trim() ?? "";
  const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
    ? Math.max(1, Math.floor(input.limit))
    : undefined;
  const filtered = ledger.entries.filter((entry) => !prefix || entry.conversationId.startsWith(prefix));
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
}

export async function pruneConversationArtifactExports(input: {
  stateDir: string;
  artifact: ConversationExportArtifact;
  maxAgeDays: number;
  now?: number;
}): Promise<void> {
  const maxAgeDays = Math.max(0, Math.floor(input.maxAgeDays));
  const exportRoot = getConversationArtifactExportRoot({
    stateDir: input.stateDir,
    artifact: input.artifact,
  });
  const threshold = (typeof input.now === "number" && Number.isFinite(input.now) ? input.now : Date.now())
    - (maxAgeDays * 24 * 60 * 60 * 1000);
  const files = await fs.readdir(exportRoot, { withFileTypes: true }).catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });

  if (files && maxAgeDays > 0) {
    await Promise.all(files.map(async (entry) => {
      if (!entry.isFile()) return;
      const targetPath = path.join(exportRoot, entry.name);
      const stat = await fs.stat(targetPath).catch(() => undefined);
      if (stat && stat.mtimeMs < threshold) {
        await fs.unlink(targetPath).catch(() => undefined);
      }
    }));
  }

  const ledger = await loadConversationExportIndex(input.stateDir);
  const keptEntries: ConversationExportIndexRecord[] = [];
  for (const entry of ledger.entries) {
    const stat = await fs.stat(entry.outputPath).catch(() => undefined);
    if (!stat) {
      continue;
    }
    if (maxAgeDays > 0 && stat.mtimeMs < threshold) {
      continue;
    }
    keptEntries.push(entry);
  }

  await atomicWriteJson(getConversationExportIndexPath(input.stateDir), {
    version: CONVERSATION_EXPORT_INDEX_VERSION,
    updatedAt: Date.now(),
    entries: keptEntries.slice(0, MAX_RECENT_EXPORT_RECORDS),
  } satisfies ConversationExportIndexLedger);
}
