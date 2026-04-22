export type AutoTaskReportFlags = {
  timeEnabled: boolean;
  tokenEnabled: boolean;
};

export type AutoTaskReportTokenSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AutoTaskReportRecord = AutoTaskReportFlags & {
  conversationId: string;
  durationMs?: number;
  token?: AutoTaskReportTokenSummary;
};

export const AUTO_TASK_REPORT_COUNTER_NAME = "__auto_task_report__";

const records = new Map<string, AutoTaskReportRecord>();
const TRAILING_AUTO_TASK_REPORT_BLOCK_RE = /\n{2,}执行统计\n(?:[-•] 耗时：[^\n]+\n)?(?:[-•] Token：IN [^\n]+\n?)?$/u;
const THINK_BLOCK_RE = /<think\b[^>]*>[\s\S]*?<\/think>/giu;

function parseEnvBoolean(value: string | undefined): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, parsed);
}

function normalizeTokenSummary(input: {
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
}): AutoTaskReportTokenSummary | undefined {
  const inputTokens = normalizeNonNegativeNumber(input.inputTokens);
  const outputTokens = normalizeNonNegativeNumber(input.outputTokens);
  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }
  const fallbackTotal = inputTokens + outputTokens;
  const totalTokens = normalizeNonNegativeNumber(input.totalTokens) ?? fallbackTotal;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function hasReportData(record: AutoTaskReportRecord | undefined): record is AutoTaskReportRecord {
  return Boolean(record && (record.durationMs !== undefined || record.token));
}

export function getAutoTaskReportFlags(): AutoTaskReportFlags {
  return {
    timeEnabled: parseEnvBoolean(process.env.BELLDANDY_AUTO_TASK_TIME_ENABLED),
    tokenEnabled: parseEnvBoolean(process.env.BELLDANDY_AUTO_TASK_TOKEN_ENABLED),
  };
}

export function beginAutoTaskReport(
  conversationId: string,
  flags: AutoTaskReportFlags = getAutoTaskReportFlags(),
): AutoTaskReportRecord | undefined {
  if (!conversationId) {
    return undefined;
  }
  if (!flags.timeEnabled && !flags.tokenEnabled) {
    records.delete(conversationId);
    return undefined;
  }
  const record: AutoTaskReportRecord = {
    conversationId,
    timeEnabled: flags.timeEnabled,
    tokenEnabled: flags.tokenEnabled,
  };
  records.set(conversationId, record);
  return { ...record };
}

export function recordAutoTaskReportDuration(conversationId: string, durationMs: unknown): void {
  if (!conversationId) {
    return;
  }
  const normalizedDuration = normalizeNonNegativeNumber(durationMs);
  if (normalizedDuration === undefined) {
    return;
  }
  const existing = records.get(conversationId) ?? beginAutoTaskReport(conversationId);
  if (!existing) {
    return;
  }
  records.set(conversationId, {
    ...existing,
    durationMs: normalizedDuration,
  });
}

export function recordAutoTaskReportToken(input: {
  conversationId: string;
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
}): void {
  if (!input.conversationId) {
    return;
  }
  const token = normalizeTokenSummary(input);
  if (!token) {
    return;
  }
  const existing = records.get(input.conversationId) ?? beginAutoTaskReport(input.conversationId);
  if (!existing) {
    return;
  }
  records.set(input.conversationId, {
    ...existing,
    token,
  });
}

export function consumeAutoTaskReport(conversationId: string): AutoTaskReportRecord | undefined {
  if (!conversationId) {
    return undefined;
  }
  const record = records.get(conversationId);
  if (!record) {
    return undefined;
  }
  records.delete(conversationId);
  return {
    ...record,
    ...(record.token ? { token: { ...record.token } } : {}),
  };
}

export function resolveAutoTaskReportForOutput(input: {
  conversationId: string;
  durationMs?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
}): AutoTaskReportRecord | undefined {
  const flags = getAutoTaskReportFlags();
  const consumed = consumeAutoTaskReport(input.conversationId);
  const base = consumed ?? (
    flags.timeEnabled || flags.tokenEnabled
      ? {
          conversationId: input.conversationId,
          timeEnabled: flags.timeEnabled,
          tokenEnabled: flags.tokenEnabled,
        }
      : undefined
  );
  if (!base) {
    return undefined;
  }

  let next = {
    ...base,
    timeEnabled: base.timeEnabled || flags.timeEnabled,
    tokenEnabled: base.tokenEnabled || flags.tokenEnabled,
  };

  if (next.timeEnabled && next.durationMs === undefined) {
    const fallbackDuration = normalizeNonNegativeNumber(input.durationMs);
    if (fallbackDuration !== undefined) {
      next = {
        ...next,
        durationMs: fallbackDuration,
      };
    }
  }

  if (next.tokenEnabled && !next.token) {
    const fallbackToken = normalizeTokenSummary({
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    });
    if (fallbackToken) {
      next = {
        ...next,
        token: fallbackToken,
      };
    }
  }

  return hasReportData(next) ? next : undefined;
}

export function sanitizeVisibleAssistantText(text: string): string {
  return String(text ?? "")
    .replace(THINK_BLOCK_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appendAutoTaskReport(text: string, report: AutoTaskReportRecord | undefined): string {
  if (!hasReportData(report)) {
    return text;
  }

  const lines: string[] = [];
  if (report.durationMs !== undefined) {
    lines.push(`- 耗时：${(report.durationMs / 1000).toFixed(2)}s`);
  }
  if (report.token) {
    lines.push(`- Token：IN ${report.token.inputTokens} / OUT ${report.token.outputTokens} / TOTAL ${report.token.totalTokens}`);
  }
  if (lines.length === 0) {
    return text;
  }

  let cleanedText = text.trimEnd();
  while (TRAILING_AUTO_TASK_REPORT_BLOCK_RE.test(cleanedText)) {
    cleanedText = cleanedText.replace(TRAILING_AUTO_TASK_REPORT_BLOCK_RE, "").trimEnd();
  }

  const block = ["执行统计", ...lines].join("\n");
  return cleanedText ? `${cleanedText}\n\n${block}` : block;
}

export function clearAutoTaskReportsForTest(): void {
  records.clear();
}
