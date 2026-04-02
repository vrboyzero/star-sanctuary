/**
 * 对话压缩（Compaction）模块 — 三层渐进式压缩
 *
 * Tier 0: System Prompt（固定，不压缩）
 * Tier 1: Archival Summary（超浓缩，跨会话级归档摘要）
 * Tier 2: Rolling Summary（滚动摘要，增量更新）
 * Tier 3: Working Memory（最近 N 条完整消息）
 *
 * 当对话历史超过 token 阈值时，溢出的消息增量合入 Rolling Summary；
 * 当 Rolling Summary 过大时，进一步压缩为 Archival Summary。
 */

// ─── Types ───────────────────────────────────────────────────────────────

export type CompactionOptions = {
  /** 触发压缩的 token 阈值（默认 12000） */
  tokenThreshold?: number;
  /** 压缩后保留的最近消息条数（默认 10） */
  keepRecentCount?: number;
  /** 安全余量系数（默认 1.2，即估算值 * 1.2） */
  safetyMargin?: number;
  /** 上下文窗口使用比例触发点（默认 0.75，用于 ReAct 循环内压缩） */
  triggerFraction?: number;
  /** Rolling Summary 超过此 token 数时触发归档压缩（默认 2000） */
  archivalThreshold?: number;
  /** 是否启用压缩（默认 true） */
  enabled?: boolean;
};

/**
 * 三层压缩持久化状态
 */
export type CompactionState = {
  /** Tier 2: 滚动摘要 */
  rollingSummary: string;
  /** Tier 1: 归档摘要 */
  archivalSummary: string;
  /** 已被压缩的消息总数 */
  compactedMessageCount: number;
  /** 上次压缩时间戳 */
  lastCompactedAt: number;
};

export type CompactionResult = {
  /** 压缩后的消息列表 */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** 是否执行了压缩 */
  compacted: boolean;
  /** 压缩前估算 token 数 */
  originalTokens: number;
  /** 压缩后估算 token 数 */
  compactedTokens: number;
  /** 更新后的压缩状态 */
  state: CompactionState;
  /** 本次压缩的层级（未压缩时为 undefined） */
  tier?: "rolling" | "archival";
};

/**
 * 摘要生成函数签名
 */
export type SummarizerFn = (prompt: string) => Promise<string>;

// ─── Token 估算 ─────────────────────────────────────────────────────────

const SAFETY_MARGIN = 1.2;

/**
 * 简单 token 估算：
 * - 英文/代码：约 4 字符 = 1 token
 * - 中文/日文：约 2 字符 = 1 token
 * - 混合内容取加权平均
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount / 2 + nonCjkCount / 4);
}

/**
 * 估算消息列表的总 token 数（含安全余量）
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
  margin: number = SAFETY_MARGIN,
): number {
  const raw = messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0);
  return Math.ceil(raw * margin);
}

// ─── 空状态 ──────────────────────────────────────────────────────────────

export function createEmptyCompactionState(): CompactionState {
  return {
    rollingSummary: "",
    archivalSummary: "",
    compactedMessageCount: 0,
    lastCompactedAt: 0,
  };
}

// ─── 工具结果压缩 ────────────────────────────────────────────────────────

/**
 * 压缩工具调用相关的消息内容，保留关键信息，丢弃冗长输出
 */
function compressToolContent(content: string): string {
  // 工具结果通常很长（网页、文件内容、命令输出），截取关键部分
  if (content.length <= 500) return content;

  // 保留前 400 字符 + 末尾 100 字符，中间用省略标记
  const head = content.slice(0, 400);
  const tail = content.slice(-100);
  return `${head}\n... [${content.length - 500} chars omitted] ...\n${tail}`;
}

/**
 * 对即将合入摘要的消息做预压缩（特别是工具结果）
 */
function precompressMessages(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  return messages.map(m => ({
    role: m.role,
    content: m.content.length > 500 ? compressToolContent(m.content) : m.content,
  }));
}

// ─── 摘要 Prompt 构建 ───────────────────────────────────────────────────

function buildRollingSummaryPrompt(
  existingSummary: string,
  newMessages: Array<{ role: string; content: string }>,
): string {
  const msgText = newMessages
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  if (existingSummary) {
    return [
      "You are a conversation summarizer. Your task is to update an existing summary with new conversation content.",
      "",
      "## Existing Summary",
      existingSummary,
      "",
      "## New Conversation Content",
      msgText,
      "",
      "## Instructions",
      "Extend the existing summary by incorporating the new conversation content. Preserve:",
      "- Key decisions and their reasoning",
      "- Action results (tool calls, file operations, etc.)",
      "- User preferences and requirements",
      "- Important context that would be needed to continue the conversation",
      "- Error states and their resolutions",
      "",
      "Keep the summary concise (under 800 tokens). Use bullet points for clarity.",
      "Output ONLY the updated summary, no preamble.",
    ].join("\n");
  }

  return [
    "You are a conversation summarizer. Create a concise summary of the following conversation.",
    "",
    "## Conversation",
    msgText,
    "",
    "## Instructions",
    "Summarize the conversation, preserving:",
    "- Key decisions and their reasoning",
    "- Action results (tool calls, file operations, etc.)",
    "- User preferences and requirements",
    "- Important context that would be needed to continue the conversation",
    "- Error states and their resolutions",
    "",
    "Keep the summary concise (under 800 tokens). Use bullet points for clarity.",
    "Output ONLY the summary, no preamble.",
  ].join("\n");
}

function buildArchivalPrompt(rollingSummary: string): string {
  return [
    "You are a conversation summarizer. Compress the following detailed summary into an ultra-concise archival summary.",
    "",
    "## Detailed Summary",
    rollingSummary,
    "",
    "## Instructions",
    "Create an ultra-concise archival summary (under 400 tokens) that preserves ONLY:",
    "- Final conclusions and decisions (not the deliberation process)",
    "- Established user preferences",
    "- Critical context needed for future interactions",
    "- Key outcomes of completed tasks",
    "",
    "Drop all intermediate steps, failed attempts, and verbose details.",
    "Output ONLY the archival summary, no preamble.",
  ].join("\n");
}

// ─── 降级摘要 ────────────────────────────────────────────────────────────

/**
 * 降级摘要：不调用模型，直接截取关键信息
 */
function buildFallbackSummary(
  messages: Array<{ role: string; content: string }>,
): string {
  const MAX_SUMMARY_CHARS = 2000;
  const lines: string[] = [];
  let totalChars = 0;

  for (const msg of messages) {
    const prefix = msg.role === "user" ? "User" : "Assistant";
    const snippet = msg.content.length > 200
      ? msg.content.slice(0, 200) + "..."
      : msg.content;
    const line = `- ${prefix}: ${snippet}`;

    if (totalChars + line.length > MAX_SUMMARY_CHARS) {
      lines.push(`... (${messages.length - lines.length} more messages omitted)`);
      break;
    }

    lines.push(line);
    totalChars += line.length;
  }

  return lines.join("\n");
}

function buildFallbackArchival(rollingSummary: string): string {
  // 简单截断到 1000 字符
  if (rollingSummary.length <= 1000) return rollingSummary;
  return rollingSummary.slice(0, 1000) + "\n... [archival truncated]";
}

// ─── 核心压缩逻辑 ────────────────────────────────────────────────────────

/**
 * 增量压缩：将溢出的消息合入 Rolling Summary，必要时触发归档压缩。
 *
 * @param messages 当前完整消息列表
 * @param state 当前压缩状态（可为空状态）
 * @param options 压缩配置
 * @param summarizer 可选的模型摘要函数
 */
export async function compactIncremental(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  state: CompactionState,
  options?: CompactionOptions & { summarizer?: SummarizerFn; force?: boolean },
): Promise<CompactionResult> {
  const threshold = options?.tokenThreshold ?? 12000;
  const keepRecent = options?.keepRecentCount ?? 10;
  const margin = options?.safetyMargin ?? SAFETY_MARGIN;
  const archivalThreshold = options?.archivalThreshold ?? 2000;
  const force = options?.force === true;

  const originalTokens = estimateMessagesTokens(messages, margin);

  // 不需要压缩
  if ((!force && originalTokens <= threshold) || messages.length <= keepRecent) {
    return {
      messages,
      compacted: false,
      originalTokens,
      compactedTokens: originalTokens,
      state,
    };
  }

  // 分割：溢出消息 + 保留消息
  const splitIndex = messages.length - keepRecent;
  const overflowMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // 预压缩工具结果等长内容
  const compressed = precompressMessages(overflowMessages);

  // ── Tier 2: 更新 Rolling Summary ──
  let newRollingSummary: string;
  if (options?.summarizer) {
    try {
      const prompt = buildRollingSummaryPrompt(state.rollingSummary, compressed);
      newRollingSummary = await options.summarizer(prompt);
    } catch {
      // 模型不可用，降级为文本截断
      const fallback = buildFallbackSummary(compressed);
      newRollingSummary = state.rollingSummary
        ? `${state.rollingSummary}\n\n---\n\n${fallback}`
        : fallback;
    }
  } else {
    const fallback = buildFallbackSummary(compressed);
    newRollingSummary = state.rollingSummary
      ? `${state.rollingSummary}\n\n---\n\n${fallback}`
      : fallback;
  }

  // ── Tier 1: 检查是否需要归档压缩 ──
  let newArchivalSummary = state.archivalSummary;
  let tier: "rolling" | "archival" = "rolling";
  const rollingSummaryTokens = estimateTokens(newRollingSummary);

  if (rollingSummaryTokens > archivalThreshold) {
    tier = "archival";
    if (options?.summarizer) {
      try {
        const archivalPrompt = buildArchivalPrompt(newRollingSummary);
        newArchivalSummary = await options.summarizer(archivalPrompt);
      } catch {
        newArchivalSummary = buildFallbackArchival(newRollingSummary);
      }
    } else {
      newArchivalSummary = buildFallbackArchival(newRollingSummary);
    }
    // 归档后清空 Rolling Summary
    newRollingSummary = "";
  }

  // 构建新状态
  const newState: CompactionState = {
    rollingSummary: newRollingSummary,
    archivalSummary: newArchivalSummary,
    compactedMessageCount: state.compactedMessageCount + overflowMessages.length,
    lastCompactedAt: Date.now(),
  };

  // 构建压缩后的消息列表
  const compactedMessages = buildCompactedMessages(newState, recentMessages);
  const compactedTokens = estimateMessagesTokens(compactedMessages, margin);

  return {
    messages: compactedMessages,
    compacted: true,
    originalTokens,
    compactedTokens,
    state: newState,
    tier,
  };
}

/**
 * 根据压缩状态 + 最近消息，构建发送给模型的消息列表
 */
export function buildCompactedMessages(
  state: CompactionState,
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  const result: Array<{ role: "user" | "assistant"; content: string }> = [];

  // 拼接摘要上下文
  const summaryParts: string[] = [];
  if (state.archivalSummary) {
    summaryParts.push(`[Archival Summary]\n${state.archivalSummary}`);
  }
  if (state.rollingSummary) {
    summaryParts.push(`[Recent Context Summary]\n${state.rollingSummary}`);
  }

  if (summaryParts.length > 0) {
    const totalCompacted = state.compactedMessageCount;
    result.push({
      role: "user",
      content: `[Conversation context (${totalCompacted} earlier messages compressed)]\n\n${summaryParts.join("\n\n")}`,
    });
    result.push({
      role: "assistant",
      content: "Understood. I have the context from our previous conversation. Let me continue from where we left off.",
    });
  }

  result.push(...recentMessages);
  return result;
}

// ─── 兼容性包装 ──────────────────────────────────────────────────────────

/**
 * 兼容旧版 API：无状态压缩（内部创建临时状态）
 */
export async function compactMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options?: CompactionOptions & {
    summarizer?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  },
): Promise<CompactionResult> {
  // 将旧版 summarizer 适配为新版 SummarizerFn
  let newSummarizer: SummarizerFn | undefined;
  if (options?.summarizer) {
    const oldSummarizer = options.summarizer;
    newSummarizer = async (prompt: string) => {
      return oldSummarizer([{ role: "user", content: prompt }]);
    };
  }

  const { summarizer: _ignored, ...restOptions } = options ?? {};
  const result = await compactIncremental(
    messages,
    createEmptyCompactionState(),
    newSummarizer ? { ...restOptions, summarizer: newSummarizer } : restOptions,
  );
  return result;
}

/**
 * 判断消息列表是否需要压缩
 */
export function needsCompaction(
  messages: Array<{ role: string; content: string }>,
  options?: CompactionOptions,
): boolean {
  if (options?.enabled === false) return false;
  const threshold = options?.tokenThreshold ?? 12000;
  const keepRecent = options?.keepRecentCount ?? 10;
  const margin = options?.safetyMargin ?? SAFETY_MARGIN;

  if (messages.length <= keepRecent) return false;
  return estimateMessagesTokens(messages, margin) > threshold;
}

/**
 * 判断 ReAct 循环内是否需要压缩（基于上下文窗口使用比例）
 */
export function needsInLoopCompaction(
  estimatedTokens: number,
  maxContextTokens: number,
  triggerFraction: number = 0.75,
): boolean {
  if (maxContextTokens <= 0) return false;
  return estimatedTokens > maxContextTokens * triggerFraction;
}
