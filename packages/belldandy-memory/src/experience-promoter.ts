import { randomUUID } from "node:crypto";
import type {
  ExperienceCandidate,
  ExperienceCandidateType,
  ExperiencePromoteResult,
  ExperienceSourceTaskDetail,
  ExperienceSourceTaskSnapshot,
} from "./experience-types.js";
import { MemoryStore } from "./store.js";

export class ExperiencePromoter {
  constructor(private readonly store: MemoryStore) { }

  promoteTask(taskId: string, type: ExperienceCandidateType): ExperiencePromoteResult | null {
    const existing = this.store.findExperienceCandidateByTaskAndType(taskId, type);
    if (existing) {
      return { candidate: existing, reusedExisting: true };
    }

    const task = this.store.getTask(taskId);
    if (!task) return null;

    const detail: ExperienceSourceTaskDetail = {
      ...task,
      memoryLinks: this.store.listTaskMemoryLinks(taskId),
    };
    const snapshot = buildSnapshot(detail);
    const title = buildCandidateTitle(type, detail);
    const slug = buildCandidateSlug(type, detail);
    const summary = buildCandidateSummary(detail);
    const now = new Date().toISOString();

    const candidate: ExperienceCandidate = {
      id: `exp_${randomUUID().slice(0, 8)}`,
      taskId,
      type,
      status: "draft",
      title,
      slug,
      content: type === "method"
        ? buildMethodDraft(title, summary, detail, snapshot, now)
        : buildSkillDraft(title, summary, detail, snapshot),
      summary,
      qualityScore: scoreCandidate(detail),
      sourceTaskSnapshot: snapshot,
      createdAt: now,
    };

    this.store.createExperienceCandidate(candidate);
    return { candidate, reusedExisting: false };
  }
}

function buildSnapshot(task: ExperienceSourceTaskDetail): ExperienceSourceTaskSnapshot {
  return {
    taskId: task.id,
    conversationId: task.conversationId,
    agentId: task.agentId,
    source: task.source,
    status: task.status,
    title: task.title,
    objective: task.objective,
    summary: task.summary,
    reflection: task.reflection,
    outcome: task.outcome,
    toolCalls: task.toolCalls?.length ? task.toolCalls : undefined,
    artifactPaths: task.artifactPaths?.length ? task.artifactPaths : undefined,
    memoryLinks: task.memoryLinks?.length ? task.memoryLinks : undefined,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
  };
}

function buildCandidateTitle(type: ExperienceCandidateType, task: ExperienceSourceTaskDetail): string {
  const base = pickTaskHeadline(task);
  return type === "method" ? `${base} 方法候选` : `${base} 技能草稿`;
}

function buildCandidateSlug(type: ExperienceCandidateType, task: ExperienceSourceTaskDetail): string {
  const base = pickTaskHeadline(task);
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return slug ? `${type}-${slug}` : `${type}-${task.id.toLowerCase()}`;
}

function buildCandidateSummary(task: ExperienceSourceTaskDetail): string {
  const source = firstNonEmpty(
    task.summary,
    task.reflection,
    task.outcome,
    task.objective,
    task.title,
    `基于任务 ${task.id} 生成的经验候选`,
  );
  return collapseWhitespace(source).slice(0, 180);
}

function buildMethodDraft(
  title: string,
  summary: string,
  task: ExperienceSourceTaskDetail,
  snapshot: ExperienceSourceTaskSnapshot,
  now: string,
): string {
  const toolNames = uniqueStrings(task.toolCalls?.map((item) => item.toolName));
  const artifacts = uniqueStrings(task.artifactPaths);
  const memoryRefs = snapshot.memoryLinks ?? [];
  const reflection = firstNonEmpty(task.reflection, task.summary, task.outcome, "待补充复盘结论。");

  const lines = [
    "---",
    `summary: "${escapeQuoted(summary)}"`,
    'status: "draft"',
    'version: "0.1.0-draft"',
    `createdAt: "${now}"`,
    `updatedAt: "${now}"`,
    "readWhen:",
    '  - "遇到相似任务时"',
    "tags:",
    '  - "task-derived"',
    `  - "${task.source}"`,
    "---",
    "",
    `# ${title}`,
    "",
    "## 来源任务",
    `- Task ID: ${task.id}`,
    `- Source: ${task.source}`,
    `- Status: ${task.status}`,
    `- Conversation: ${task.conversationId}`,
    task.finishedAt ? `- Finished: ${task.finishedAt}` : "",
    "",
    "## 目标与背景",
    firstNonEmpty(task.objective, task.title, "待补充任务目标。"),
    "",
    "## 建议步骤",
    ...buildMethodSteps(task),
    "",
    "## 工具与产物",
    toolNames.length > 0 ? `- Tools: ${toolNames.join(", ")}` : "- Tools: 待补充",
    artifacts.length > 0 ? `- Artifacts: ${artifacts.join(", ")}` : "- Artifacts: 无",
    "",
    "## 复盘要点",
    reflection,
  ];

  if (memoryRefs.length > 0) {
    lines.push("", "## 相关记忆");
    for (const item of memoryRefs.slice(0, 8)) {
      const meta = [item.relation, item.sourcePath].filter(Boolean).join(" | ");
      lines.push(`- ${meta || item.chunkId}`);
      if (item.snippet) {
        lines.push(`  ${collapseWhitespace(item.snippet).slice(0, 160)}`);
      }
    }
  }

  return lines.filter(Boolean).join("\n");
}

function buildMethodSteps(task: ExperienceSourceTaskDetail): string[] {
  const lines: string[] = [];
  const toolNames = uniqueStrings(task.toolCalls?.map((item) => item.toolName));
  if (toolNames.length > 0) {
    toolNames.forEach((toolName, index) => {
      lines.push(`${index + 1}. 使用 \`${toolName}\` 完成对应子步骤，并记录关键输出。`);
    });
  } else {
    lines.push("1. 明确任务目标、输入条件和边界。");
    lines.push("2. 按最小闭环执行，并保留关键产物路径。");
  }

  if (task.outcome) {
    lines.push(`${lines.length + 1}. 对照结果复盘执行偏差，并收敛出可复用结论。`);
  }
  return lines;
}

function buildSkillDraft(
  title: string,
  summary: string,
  task: ExperienceSourceTaskDetail,
  snapshot: ExperienceSourceTaskSnapshot,
): string {
  const toolNames = uniqueStrings(task.toolCalls?.map((item) => item.toolName));
  const lines = [
    "---",
    `name: "${escapeQuoted(title)}"`,
    `description: "${escapeQuoted(summary)}"`,
    'version: "0.1.0-draft"',
    'tags: ["task-derived", "draft", "' + task.source + '"]',
    "priority: normal",
    ...(toolNames.length > 0 ? [
      "eligibility:",
      "  tools:",
      ...toolNames.map((toolName) => `    - "${escapeQuoted(toolName)}"`),
    ] : []),
    "---",
    "",
    "# 适用场景",
    firstNonEmpty(task.objective, task.title, "处理与该任务相近的问题时。"),
    "",
    "# 使用指引",
    "1. 先回顾来源任务中的目标、产物和复盘结论。",
    toolNames.length > 0
      ? `2. 优先按这些工具顺序执行：${toolNames.join(", ")}。`
      : "2. 优先使用当前项目中已有的工具链完成最小闭环。",
    "3. 遇到异常时，优先参考复盘段落修正执行路径。",
    "",
    "# 来源任务",
    `- Task ID: ${task.id}`,
    `- Conversation: ${task.conversationId}`,
    `- Status: ${task.status}`,
    snapshot.memoryLinks?.length ? `- Memory Links: ${snapshot.memoryLinks.length}` : "- Memory Links: 0",
    "",
    "# 经验提要",
    firstNonEmpty(task.reflection, task.summary, task.outcome, "待补充。"),
  ];
  return lines.join("\n");
}

function scoreCandidate(task: ExperienceSourceTaskDetail): number {
  let score = 10;
  if (task.title || task.objective) score += 15;
  if (task.summary) score += 20;
  if (task.reflection) score += 20;
  if (task.outcome) score += 10;
  if (task.toolCalls?.length) score += 15;
  if (task.artifactPaths?.length) score += 5;
  if (task.memoryLinks?.length) score += 5;
  return Math.min(100, score);
}

function pickTaskHeadline(task: ExperienceSourceTaskDetail): string {
  return firstNonEmpty(
    task.title,
    task.objective,
    task.summary,
    task.reflection,
    task.id,
  );
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function uniqueStrings(values?: Array<string | undefined>): string[] {
  return [...new Set((values ?? []).map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
