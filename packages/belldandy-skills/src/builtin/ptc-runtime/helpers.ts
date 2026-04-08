type WriteTextFn = (relativePath: string, content: string) => string;
type WriteJsonFn = (relativePath: string, value: unknown) => string;

type MarkdownReportSection = {
  title?: string;
  body?: string;
};

type MarkdownReportInput =
  | string
  | {
    title?: string;
    summary?: string;
    sections?: MarkdownReportSection[];
  };

type RecordLike = Record<string, unknown>;

type FlattenedMcpItem = {
  type: "text" | "image" | "resource" | "unknown";
  text?: string;
  uri?: string;
  mimeType?: string;
  truncated: boolean;
  note?: string;
};

function safeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(value: string, maxChars = 240): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function normalizeRows(value: unknown): RecordLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecordLike => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function normalizeFieldList(rows: RecordLike[], fields?: unknown): string[] {
  if (Array.isArray(fields)) {
    const explicit = fields
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
    if (explicit.length > 0) return [...new Set(explicit)];
  }

  const discovered = new Set<string>();
  for (const row of rows.slice(0, 100)) {
    for (const key of Object.keys(row)) {
      discovered.add(key);
    }
  }
  return Array.from(discovered);
}

function buildTopValues(values: unknown[], limit: number): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = truncate(stringifyValue(value), 80);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit);
}

function summarizeRecords(records: unknown, options?: { fields?: unknown; topValues?: unknown }) {
  const rows = normalizeRows(records);
  const topValuesLimit = typeof options?.topValues === "number" && Number.isFinite(options.topValues)
    ? Math.max(1, Math.min(20, Math.floor(options.topValues)))
    : 5;
  const fields = normalizeFieldList(rows, options?.fields);

  const fieldSummaries = fields.map((field) => {
    const values = rows.map((row) => row[field]);
    const presentValues = values.filter((value) => typeof value !== "undefined");
    const numericValues = presentValues.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const uniqueCount = new Set(presentValues.map((value) => stringifyValue(value))).size;
    return {
      field,
      present: presentValues.length,
      missing: rows.length - presentValues.length,
      unique: uniqueCount,
      topValues: buildTopValues(presentValues, topValuesLimit),
      numeric: numericValues.length > 0 ? {
        count: numericValues.length,
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
        sum: numericValues.reduce((sum, value) => sum + value, 0),
        average: numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length,
      } : undefined,
    };
  });

  return {
    total: rows.length,
    fieldCount: fields.length,
    fields: fieldSummaries,
  };
}

function groupCount(records: unknown, field: unknown, options?: { limit?: unknown }) {
  const rows = normalizeRows(records);
  const fieldName = typeof field === "string" ? field.trim() : "";
  if (!fieldName) {
    throw new Error("groupCount 需要非空字段名。");
  }
  const limit = typeof options?.limit === "number" && Number.isFinite(options.limit)
    ? Math.max(1, Math.min(100, Math.floor(options.limit)))
    : 20;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = stringifyValue(row[fieldName] ?? "(undefined)");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit);
}

function pick(records: unknown, fields: unknown) {
  const rows = normalizeRows(records);
  const selectedFields = normalizeFieldList(rows, fields);
  return rows.map((row) => {
    const next: RecordLike = {};
    for (const field of selectedFields) {
      next[field] = row[field];
    }
    return next;
  });
}

function sortBy(records: unknown, field: unknown, direction?: unknown) {
  const rows = normalizeRows(records);
  const fieldName = typeof field === "string" ? field.trim() : "";
  if (!fieldName) {
    throw new Error("sortBy 需要非空字段名。");
  }
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = left[fieldName];
    const rightValue = right[fieldName];
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * dir;
    }
    return stringifyValue(leftValue).localeCompare(stringifyValue(rightValue)) * dir;
  });
}

function flattenMcpItems(value: unknown): FlattenedMcpItem[] {
  const items: FlattenedMcpItem[] = [];

  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== "object") return;

    const record = current as Record<string, unknown>;
    if (Array.isArray(record.content)) {
      visit(record.content);
    }
    if (Array.isArray(record.contents)) {
      visit(record.contents);
    }
    if (record.diagnostics && typeof record.diagnostics === "object") {
      const diagnostics = record.diagnostics as Record<string, unknown>;
      if (typeof diagnostics.persistedWebPath === "string") {
        items.push({
          type: "unknown",
          truncated: Boolean(diagnostics.truncated),
          note: `persisted:${diagnostics.persistedWebPath}`,
        });
      }
    }

    const type = typeof record.type === "string" ? record.type : undefined;
    if (!type) return;

    if (type === "text") {
      items.push({
        type: "text",
        text: typeof record.text === "string"
          ? record.text
          : typeof record.content === "string"
            ? record.content
            : undefined,
        truncated: Boolean(record.truncated),
        note: typeof record.note === "string" ? record.note : undefined,
      });
      return;
    }

    if (type === "resource") {
      items.push({
        type: "resource",
        text: typeof record.text === "string" ? record.text : undefined,
        uri: typeof record.uri === "string" ? record.uri : undefined,
        mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
        truncated: Boolean(record.truncated),
        note: typeof record.note === "string" ? record.note : undefined,
      });
      return;
    }

    if (type === "image") {
      items.push({
        type: "image",
        mimeType: typeof record.mimeType === "string" ? record.mimeType : undefined,
        truncated: Boolean(record.truncated),
        note: typeof record.note === "string" ? record.note : undefined,
      });
      return;
    }

    items.push({
      type: "unknown",
      truncated: Boolean(record.truncated),
      note: typeof record.note === "string" ? record.note : undefined,
    });
  };

  visit(value);
  return items;
}

function summarizeMcpResults(value: unknown) {
  const items = flattenMcpItems(value);
  const textItems = items.filter((item) => item.type === "text");
  const resourceItems = items.filter((item) => item.type === "resource");
  const imageItems = items.filter((item) => item.type === "image");
  const truncatedItems = items.filter((item) => item.truncated).length;
  const notes = items.map((item) => item.note).filter((note): note is string => Boolean(note));
  const persistedWebPaths = notes
    .filter((note) => note.startsWith("persisted:"))
    .map((note) => note.slice("persisted:".length));
  const textPreview = [...textItems, ...resourceItems]
    .map((item) => item.text?.trim())
    .filter((text): text is string => Boolean(text))
    .slice(0, 5)
    .map((text) => truncate(text, 240));

  return {
    totalItems: items.length,
    textItems: textItems.length,
    resourceItems: resourceItems.length,
    imageItems: imageItems.length,
    truncatedItems,
    notedItems: notes.length,
    persistedWebPaths,
    resourceUris: resourceItems.map((item) => item.uri).filter((uri): uri is string => Boolean(uri)),
    mimeTypes: Array.from(new Set(items.map((item) => item.mimeType).filter((mime): mime is string => Boolean(mime)))),
    notes: notes.filter((note) => !note.startsWith("persisted:")).slice(0, 10),
    textPreview,
  };
}

function normalizeColumns(rows: RecordLike[], columns?: unknown): string[] {
  if (Array.isArray(columns)) {
    const explicit = columns
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
    if (explicit.length > 0) return [...new Set(explicit)];
  }
  return normalizeFieldList(rows);
}

function toMarkdownTable(rowsInput: unknown, columnsInput?: unknown): string {
  const rows = normalizeRows(rowsInput);
  const columns = normalizeColumns(rows, columnsInput);
  if (columns.length === 0) return "";
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => stringifyValue(row[column] ?? "")).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function renderMarkdownReport(input: MarkdownReportInput): string {
  if (typeof input === "string") return input;

  const lines: string[] = [];
  if (input.title) {
    lines.push(`# ${input.title}`, "");
  }
  if (input.summary) {
    lines.push(input.summary, "");
  }
  for (const section of input.sections ?? []) {
    if (!section.title && !section.body) continue;
    if (section.title) {
      lines.push(`## ${section.title}`);
    }
    if (section.body) {
      lines.push(section.body);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function summarizeRowFieldValue(value: unknown, field: string): string {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : undefined;
  return truncate(stringifyValue(record?.[field] ?? ""), 120);
}

function createPtcTemplates(options: {
  writeText: WriteTextFn;
  writeJson: WriteJsonFn;
}) {
  const writeMarkdownReport = (relativePath: string, input: MarkdownReportInput) =>
    options.writeText(relativePath, renderMarkdownReport(input));

  const writeJsonReport = (relativePath: string, value: unknown) =>
    options.writeJson(relativePath, value);

  return Object.freeze({
    mcpResultReport: (
      value: unknown,
      input?: {
        title?: string;
        markdownPath?: string;
        jsonPath?: string;
      },
    ) => {
      const summary = summarizeMcpResults(value);
      const flattened = flattenMcpItems(value).slice(0, 20);
      const report = {
        kind: "mcp_result_report" as const,
        title: input?.title ?? "MCP Result Report",
        summary,
        flattenedItems: safeClone(flattened),
      };

      let markdownPath: string | undefined;
      let jsonPath: string | undefined;

      if (typeof input?.markdownPath === "string" && input.markdownPath.trim()) {
        markdownPath = writeMarkdownReport(input.markdownPath, {
          title: input.title ?? "MCP Result Report",
          sections: [
            { title: "Summary", body: `\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`` },
            { title: "Flattened Items", body: `\`\`\`json\n${JSON.stringify(flattened, null, 2)}\n\`\`\`` },
          ],
        });
      }

      if (typeof input?.jsonPath === "string" && input.jsonPath.trim()) {
        jsonPath = writeJsonReport(input.jsonPath, report);
      }

      return {
        ...report,
        markdownPath,
        jsonPath,
      };
    },
    recordCollectionReport: (
      records: unknown,
      input?: {
        title?: string;
        fields?: unknown;
        groupBy?: unknown;
        sortBy?: unknown;
        sortDirection?: unknown;
        topRows?: unknown;
        markdownPath?: string;
        jsonPath?: string;
      },
    ) => {
      const rows = normalizeRows(records);
      const summary = summarizeRecords(rows, { fields: input?.fields });
      const topRowsLimit = typeof input?.topRows === "number" && Number.isFinite(input.topRows)
        ? Math.max(1, Math.min(20, Math.floor(input.topRows)))
        : 5;
      const sortedRows = input?.sortBy ? sortBy(rows, input.sortBy, input.sortDirection) : [...rows];
      const previewRows = input?.fields ? pick(sortedRows.slice(0, topRowsLimit), input.fields) : sortedRows.slice(0, topRowsLimit);
      const grouped = input?.groupBy ? groupCount(rows, input.groupBy, { limit: topRowsLimit }) : undefined;
      const report = {
        kind: "record_collection_report" as const,
        title: input?.title ?? "Record Collection Report",
        total: rows.length,
        summary,
        grouped,
        previewRows: safeClone(previewRows),
      };

      let markdownPath: string | undefined;
      let jsonPath: string | undefined;

      if (typeof input?.markdownPath === "string" && input.markdownPath.trim()) {
        const sections: MarkdownReportSection[] = [
          { title: "Summary", body: `\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`` },
          { title: "Preview Rows", body: toMarkdownTable(previewRows) || `\`\`\`json\n${JSON.stringify(previewRows, null, 2)}\n\`\`\`` },
        ];
        if (grouped) {
          sections.splice(1, 0, {
            title: `Group By ${String(input.groupBy)}`,
            body: toMarkdownTable(grouped, ["value", "count"]),
          });
        }
        markdownPath = writeMarkdownReport(input.markdownPath, {
          title: input.title ?? "Record Collection Report",
          sections,
        });
      }

      if (typeof input?.jsonPath === "string" && input.jsonPath.trim()) {
        jsonPath = writeJsonReport(input.jsonPath, report);
      }

      return {
        ...report,
        markdownPath,
        jsonPath,
      };
    },
    compareRecordSets: (
      datasets: unknown,
      input?: {
        title?: string;
        metricField?: unknown;
        groupBy?: unknown;
        markdownPath?: string;
        jsonPath?: string;
      },
    ) => {
      const datasetEntries = Object.entries(
        datasets && typeof datasets === "object" && !Array.isArray(datasets)
          ? datasets as Record<string, unknown>
          : {},
      );

      const metricField = typeof input?.metricField === "string" ? input.metricField.trim() : "";
      const groupBy = typeof input?.groupBy === "string" ? input.groupBy.trim() : "";
      const datasetSummaries = datasetEntries.map(([name, value]) => {
        const rows = normalizeRows(value);
        const numericValues = metricField
          ? rows.map((row) => row[metricField]).filter((item): item is number => typeof item === "number" && Number.isFinite(item))
          : [];
        return {
          dataset: name,
          total: rows.length,
          metricField: metricField || undefined,
          metricAverage: numericValues.length > 0
            ? numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length
            : undefined,
          metricMin: numericValues.length > 0 ? Math.min(...numericValues) : undefined,
          metricMax: numericValues.length > 0 ? Math.max(...numericValues) : undefined,
          groupTop: groupBy ? groupCount(rows, groupBy, { limit: 3 }) : undefined,
          firstRow: rows[0] ? safeClone(rows[0]) : undefined,
        };
      });

      const comparisonRows = datasetSummaries.map((item) => ({
        dataset: item.dataset,
        total: item.total,
        metricAverage: item.metricAverage,
        metricMin: item.metricMin,
        metricMax: item.metricMax,
        groupTop: item.groupTop?.map((entry) => `${entry.value}:${entry.count}`).join(", "),
        firstRow: metricField ? summarizeRowFieldValue(item.firstRow, metricField) : truncate(stringifyValue(item.firstRow ?? ""), 120),
      }));

      const report = {
        kind: "record_set_comparison" as const,
        title: input?.title ?? "Record Set Comparison",
        metricField: metricField || undefined,
        groupBy: groupBy || undefined,
        datasets: safeClone(datasetSummaries),
        comparisonRows,
      };

      let markdownPath: string | undefined;
      let jsonPath: string | undefined;

      if (typeof input?.markdownPath === "string" && input.markdownPath.trim()) {
        markdownPath = writeMarkdownReport(input.markdownPath, {
          title: input.title ?? "Record Set Comparison",
          sections: [
            { title: "Comparison Table", body: toMarkdownTable(comparisonRows) || `\`\`\`json\n${JSON.stringify(comparisonRows, null, 2)}\n\`\`\`` },
            { title: "Dataset Details", body: `\`\`\`json\n${JSON.stringify(datasetSummaries, null, 2)}\n\`\`\`` },
          ],
        });
      }

      if (typeof input?.jsonPath === "string" && input.jsonPath.trim()) {
        jsonPath = writeJsonReport(input.jsonPath, report);
      }

      return {
        ...report,
        markdownPath,
        jsonPath,
      };
    },
  });
}

export function createPtcHelpers(options: {
  writeText: WriteTextFn;
  writeJson: WriteJsonFn;
}) {
  return Object.freeze({
    mcp: Object.freeze({
      flattenItems: (value: unknown) => safeClone(flattenMcpItems(value)),
      summarizeResults: (value: unknown) => safeClone(summarizeMcpResults(value)),
    }),
    records: Object.freeze({
      summarize: (records: unknown, opts?: { fields?: unknown; topValues?: unknown }) =>
        safeClone(summarizeRecords(records, opts)),
      groupCount: (records: unknown, field: unknown, opts?: { limit?: unknown }) =>
        safeClone(groupCount(records, field, opts)),
      pick: (records: unknown, fields: unknown) =>
        safeClone(pick(records, fields)),
      sortBy: (records: unknown, field: unknown, direction?: unknown) =>
        safeClone(sortBy(records, field, direction)),
    }),
    report: Object.freeze({
      toMarkdownTable: (rows: unknown, columns?: unknown) => toMarkdownTable(rows, columns),
      writeMarkdownReport: (relativePath: string, input: MarkdownReportInput) =>
        options.writeText(relativePath, renderMarkdownReport(input)),
      writeJsonReport: (relativePath: string, value: unknown) =>
        options.writeJson(relativePath, value),
    }),
    templates: createPtcTemplates(options),
  });
}
