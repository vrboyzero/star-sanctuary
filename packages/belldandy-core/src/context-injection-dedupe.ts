type HistoryMessageLike = {
  role?: string;
  content?: unknown;
};

type TextPartLike = {
  type?: string;
  text?: unknown;
};

type MemoryCandidateLike = {
  id?: string;
  sourcePath?: string;
  summary?: string;
  snippet?: string;
};

type TaskCandidateLike = {
  taskId?: string;
  title?: string;
  objective?: string;
  summary?: string;
};

const RECENT_HISTORY_WINDOW = 6;
const MIN_DEDUPE_TEXT_CHARS = 24;
const BODY_SIGNATURE_CHARS = 160;

function normalizeTextForDedupe(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentToText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const part = item as TextPartLike;
        return part.type === "text" && typeof part.text === "string" ? part.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function extractRecentHistoryTexts(history?: unknown[]): string[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  return history
    .slice(-RECENT_HISTORY_WINDOW)
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      return contentToText((item as HistoryMessageLike).content);
    })
    .map((text) => normalizeTextForDedupe(text))
    .filter((text) => text.length >= MIN_DEDUPE_TEXT_CHARS);
}

function buildBodySignature(text: string): string {
  const normalized = normalizeTextForDedupe(text);
  if (!normalized) return "";
  return normalized.slice(0, BODY_SIGNATURE_CHARS);
}

function isNearDuplicateText(candidate: string, historyTexts: string[]): boolean {
  const normalizedCandidate = normalizeTextForDedupe(candidate);
  if (normalizedCandidate.length < MIN_DEDUPE_TEXT_CHARS) {
    return false;
  }

  return historyTexts.some((historyText) => {
    const shorterLength = Math.min(historyText.length, normalizedCandidate.length);
    const longerLength = Math.max(historyText.length, normalizedCandidate.length);
    if (shorterLength < MIN_DEDUPE_TEXT_CHARS) return false;
    if (shorterLength / longerLength < 0.6) return false;
    return historyText.includes(normalizedCandidate) || normalizedCandidate.includes(historyText);
  });
}

function resolveMemoryBody(candidate: MemoryCandidateLike): string {
  return String(candidate.summary ?? candidate.snippet ?? "").trim();
}

function resolveTaskBody(candidate: TaskCandidateLike): string {
  return String(candidate.summary ?? candidate.objective ?? candidate.title ?? "").trim();
}

export function createContextInjectionDeduper(history?: unknown[]) {
  const recentHistoryTexts = extractRecentHistoryTexts(history);
  const seenMemoryIds = new Set<string>();
  const seenTaskIds = new Set<string>();
  const seenSourceBodyKeys = new Set<string>();
  const seenBodySignatures = new Set<string>();

  const rememberBody = (body: string) => {
    const signature = buildBodySignature(body);
    if (signature) {
      seenBodySignatures.add(signature);
    }
  };

  return {
    shouldIncludeMemory(candidate: MemoryCandidateLike): boolean {
      const body = resolveMemoryBody(candidate);
      if (!body) return false;

      const memoryId = String(candidate.id ?? "").trim();
      if (memoryId && seenMemoryIds.has(memoryId)) {
        return false;
      }

      const bodySignature = buildBodySignature(body);
      if (bodySignature && seenBodySignatures.has(bodySignature)) {
        return false;
      }

      const sourceKey = String(candidate.sourcePath ?? "").trim().toLocaleLowerCase();
      const sourceBodyKey = sourceKey && bodySignature
        ? `${sourceKey}|${bodySignature}`
        : "";
      if (sourceBodyKey && seenSourceBodyKeys.has(sourceBodyKey)) {
        return false;
      }

      if (isNearDuplicateText(body, recentHistoryTexts)) {
        return false;
      }

      if (memoryId) {
        seenMemoryIds.add(memoryId);
      }
      if (sourceBodyKey) {
        seenSourceBodyKeys.add(sourceBodyKey);
      }
      rememberBody(body);
      return true;
    },

    shouldIncludeTask(candidate: TaskCandidateLike): boolean {
      const body = resolveTaskBody(candidate);
      if (!body) return false;

      const taskId = String(candidate.taskId ?? "").trim();
      if (taskId && seenTaskIds.has(taskId)) {
        return false;
      }

      const bodySignature = buildBodySignature(body);
      if (bodySignature && seenBodySignatures.has(bodySignature)) {
        return false;
      }

      if (isNearDuplicateText(body, recentHistoryTexts)) {
        return false;
      }

      if (taskId) {
        seenTaskIds.add(taskId);
      }
      rememberBody(body);
      return true;
    },
  };
}
