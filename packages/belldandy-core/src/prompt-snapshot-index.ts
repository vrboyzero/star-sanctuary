import fs from "node:fs/promises";
import path from "node:path";

const RENAME_RETRIES = 3;
const RENAME_RETRY_DELAY_MS = 50;

type PromptSnapshotIndexSessionKind =
  | "agent_main"
  | "goal"
  | "goal_node"
  | "subtask"
  | "cron"
  | "heartbeat"
  | "community"
  | "external"
  | "other";

type PromptSnapshotIndexEntry = {
  directoryName: string;
  conversationId: string;
  sessionKind: PromptSnapshotIndexSessionKind;
  snapshotCount: number;
  latestRunId?: string;
  latestCreatedAt: number;
  latestPersistedAt?: number;
  latestFileName: string;
};

type PromptSnapshotIndexLedger = {
  version: 1;
  generatedAt: number;
  entries: PromptSnapshotIndexEntry[];
};

export function getPromptSnapshotIndexJsonPath(rootDirectory: string): string {
  return path.join(rootDirectory, "_index.json");
}

export async function loadPromptSnapshotIndex(rootDirectory: string): Promise<PromptSnapshotIndexLedger | undefined> {
  const raw = await fs.readFile(getPromptSnapshotIndexJsonPath(rootDirectory), "utf-8").catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as PromptSnapshotIndexLedger;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function resolveSessionKind(conversationId: string): PromptSnapshotIndexSessionKind {
  if (/^goal:[^:]+:node:[^:]+:run:[^:]+$/.test(conversationId)) return "goal_node";
  if (/^goal:[^:]+$/.test(conversationId)) return "goal";
  if (/^agent:[^:]+:main$/.test(conversationId) || /^agent-[a-z0-9._-]+-main$/i.test(conversationId)) return "agent_main";
  if (/^sub[_:-]/i.test(conversationId)) return "subtask";
  if (/^cron[-:]/i.test(conversationId)) return "cron";
  if (/^heartbeat[-:]/i.test(conversationId)) return "heartbeat";
  if (/^community[-:]/i.test(conversationId)) return "community";
  if (/^oc[_:-]/i.test(conversationId)) return "external";
  return "other";
}

function formatIsoTimestamp(timestamp: number | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return "-";
  }
  return new Date(timestamp).toISOString();
}

function renderPromptSnapshotIndexText(index: PromptSnapshotIndexLedger): string {
  const lines: string[] = [
    "Prompt Snapshot Index",
    `generatedAt: ${formatIsoTimestamp(index.generatedAt)}`,
    `entries: ${index.entries.length}`,
    "",
  ];

  for (const entry of index.entries) {
    lines.push(
      `${formatIsoTimestamp(entry.latestCreatedAt)} | ${entry.sessionKind} | ${entry.conversationId} | run=${entry.latestRunId ?? "-"} | snapshots=${entry.snapshotCount} | dir=${entry.directoryName} | latest=${entry.latestFileName}`,
    );
  }
  return lines.join("\n");
}

async function readPromptSnapshotIndexEntry(input: {
  rootDirectory: string;
  directoryName: string;
}): Promise<PromptSnapshotIndexEntry | undefined> {
  const directory = path.join(input.rootDirectory, input.directoryName);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!entries || entries.length <= 0) {
    return undefined;
  }

  let latest:
    | {
      fileName: string;
      createdAt: number;
      persistedAt?: number;
      runId?: string;
      conversationId: string;
    }
    | undefined;
  let snapshotCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".prompt-snapshot.json")) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const raw = await fs.readFile(filePath, "utf-8").catch(() => undefined);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as {
        manifest?: {
          conversationId?: string;
          runId?: string;
          createdAt?: number;
          persistedAt?: number;
        };
      };
      const conversationId = typeof parsed.manifest?.conversationId === "string" && parsed.manifest.conversationId.trim()
        ? parsed.manifest.conversationId.trim()
        : input.directoryName;
      const createdAt = typeof parsed.manifest?.createdAt === "number" && Number.isFinite(parsed.manifest.createdAt)
        ? parsed.manifest.createdAt
        : 0;
      const persistedAt = typeof parsed.manifest?.persistedAt === "number" && Number.isFinite(parsed.manifest.persistedAt)
        ? parsed.manifest.persistedAt
        : undefined;
      snapshotCount += 1;
      if (!latest || createdAt >= latest.createdAt) {
        latest = {
          fileName: entry.name,
          createdAt,
          persistedAt,
          runId: typeof parsed.manifest?.runId === "string" ? parsed.manifest.runId : undefined,
          conversationId,
        };
      }
    } catch {
      continue;
    }
  }

  if (!latest || snapshotCount <= 0) {
    return undefined;
  }

  return {
    directoryName: input.directoryName,
    conversationId: latest.conversationId,
    sessionKind: resolveSessionKind(latest.conversationId),
    snapshotCount,
    ...(latest.runId ? { latestRunId: latest.runId } : {}),
    latestCreatedAt: latest.createdAt,
    ...(typeof latest.persistedAt === "number" ? { latestPersistedAt: latest.persistedAt } : {}),
    latestFileName: latest.fileName,
  };
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  let lastErr: NodeJS.ErrnoException | null = null;
  for (let attempt = 0; attempt < RENAME_RETRIES; attempt += 1) {
    try {
      await fs.rename(tempPath, targetPath);
      return;
    } catch (error) {
      lastErr = error as NodeJS.ErrnoException;
      if (attempt < RENAME_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAY_MS));
      }
    }
  }

  if (process.platform === "win32" && lastErr && (lastErr.code === "EPERM" || lastErr.code === "EBUSY")) {
    try {
      await fs.writeFile(targetPath, content, "utf-8");
      await fs.unlink(tempPath).catch(() => {});
      return;
    } catch (fallbackError) {
      await fs.unlink(tempPath).catch(() => {});
      throw fallbackError;
    }
  }

  await fs.unlink(tempPath).catch(() => {});
  throw lastErr;
}

export async function writePromptSnapshotIndex(input: {
  rootDirectory: string;
  now?: number;
}): Promise<void> {
  const rootEntries = await fs.readdir(input.rootDirectory, { withFileTypes: true }).catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!rootEntries) {
    return;
  }

  const items = await Promise.all(rootEntries.map(async (entry) => {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      return undefined;
    }
    return readPromptSnapshotIndexEntry({
      rootDirectory: input.rootDirectory,
      directoryName: entry.name,
    });
  }));
  const index: PromptSnapshotIndexLedger = {
    version: 1,
    generatedAt: typeof input.now === "number" && Number.isFinite(input.now) ? input.now : Date.now(),
    entries: items
      .filter((item): item is PromptSnapshotIndexEntry => Boolean(item))
      .sort((left, right) => right.latestCreatedAt - left.latestCreatedAt),
  };

  await atomicWriteText(
    getPromptSnapshotIndexJsonPath(input.rootDirectory),
    JSON.stringify(index, null, 2),
  );
  await atomicWriteText(
    path.join(input.rootDirectory, "_index.txt"),
    renderPromptSnapshotIndexText(index),
  );
}
