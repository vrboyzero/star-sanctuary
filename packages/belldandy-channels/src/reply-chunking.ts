import {
  resolveChannelReplyChunkingPolicy,
  type ChunkMode,
  type OutboundChunkTarget,
  type ReplyChunkingConfig,
} from "./reply-chunking-config.js";

export interface OutboundChunkingStrategy {
  target: OutboundChunkTarget;
  accountId?: string;
  textLimit: number;
  chunkMode: ChunkMode;
  source: "default" | "config";
}

const DEFAULT_STRATEGIES: Record<OutboundChunkTarget, Pick<OutboundChunkingStrategy, "textLimit" | "chunkMode">> = {
  discord: { textLimit: 1800, chunkMode: "newline" },
  qq: { textLimit: 1500, chunkMode: "newline" },
  feishu: { textLimit: 3000, chunkMode: "newline" },
  community: { textLimit: 3500, chunkMode: "newline" },
};

export function resolveOutboundChunkingStrategy(params: {
  target: OutboundChunkTarget;
  accountId?: string;
  config?: ReplyChunkingConfig;
}): OutboundChunkingStrategy {
  const defaults = DEFAULT_STRATEGIES[params.target];
  const policy = resolveChannelReplyChunkingPolicy(params.config, params.target, params.accountId);
  return {
    target: params.target,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    textLimit: policy?.textLimit ?? defaults.textLimit,
    chunkMode: policy?.chunkMode ?? defaults.chunkMode,
    source: policy ? "config" : "default",
  };
}

export function chunkMarkdownForOutbound(
  text: string,
  target: OutboundChunkTarget,
  options?: {
    accountId?: string;
    config?: ReplyChunkingConfig;
    overrideLimit?: number;
    overrideChunkMode?: ChunkMode;
  },
): string[] {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const resolved = resolveOutboundChunkingStrategy({
    target,
    accountId: options?.accountId,
    config: options?.config,
  });
  const limit = Math.max(1, Math.floor(options?.overrideLimit ?? resolved.textLimit));
  const chunkMode = options?.overrideChunkMode ?? resolved.chunkMode;

  if (normalized.length <= limit) return [normalized];
  if (chunkMode === "length") return chunkMarkdownByLength(normalized, limit);
  return chunkMarkdownByParagraph(normalized, limit);
}

function chunkMarkdownByParagraph(text: string, limit: number): string[] {
  const blocks = splitMarkdownBlocks(text);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const block of blocks) {
    if (!block.trim()) continue;
    if (block.length > limit) {
      pushCurrent();
      chunks.push(...splitOversizedMarkdownBlock(block, limit));
      continue;
    }

    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > limit) {
      pushCurrent();
      current = block;
      continue;
    }
    current = candidate;
  }

  pushCurrent();
  return chunks.length ? chunks : [text];
}

function chunkMarkdownByLength(text: string, limit: number): string[] {
  if (isFencedCodeBlock(text)) {
    return splitFencedCodeBlock(text, limit);
  }

  const blocks = splitMarkdownBlocks(text);
  if (blocks.length <= 1) {
    return chunkPlainText(text, limit);
  }

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const block of blocks) {
    if (!block.trim()) continue;
    const separator = current ? "\n\n" : "";
    const candidate = `${current}${separator}${block}`;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) pushCurrent();
    if (block.length > limit) {
      chunks.push(...splitOversizedMarkdownBlock(block, limit));
      continue;
    }
    current = block;
  }

  pushCurrent();
  return chunks.length ? chunks : chunkPlainText(text, limit);
}

function splitMarkdownBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  const pushCurrent = () => {
    const value = current.join("\n").trim();
    if (value) blocks.push(value);
    current = [];
  };

  for (const line of lines) {
    const fence = getFenceMarker(line);
    if (!inFence && fence) {
      pushCurrent();
      inFence = true;
      fenceMarker = fence;
      current.push(line);
      continue;
    }
    if (inFence) {
      current.push(line);
      if (fence && line.trim().startsWith(fenceMarker)) {
        pushCurrent();
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (!line.trim()) {
      pushCurrent();
      continue;
    }
    current.push(line);
  }

  pushCurrent();
  return blocks;
}

function splitOversizedMarkdownBlock(block: string, limit: number): string[] {
  if (isFencedCodeBlock(block)) {
    return splitFencedCodeBlock(block, limit);
  }
  return chunkPlainText(block, limit);
}

function isFencedCodeBlock(block: string): boolean {
  const lines = block.split("\n");
  if (lines.length < 2) return false;
  const opening = getFenceMarker(lines[0] ?? "");
  if (!opening) return false;
  return Boolean(getFenceMarker(lines[lines.length - 1] ?? ""));
}

function splitFencedCodeBlock(block: string, limit: number): string[] {
  const lines = block.split("\n");
  const opening = lines[0] ?? "```";
  const closing = getFenceMarker(lines[lines.length - 1] ?? "") ?? "```";
  const contentLines = lines.slice(1, -1);
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const wrapped = current
      ? `${opening}\n${current}\n${closing}`
      : `${opening}\n${closing}`;
    chunks.push(wrapped);
    current = "";
  };

  const available = Math.max(1, limit - opening.length - closing.length - 2);
  for (const line of contentLines) {
    const pieces = chunkPlainText(line, available, { preserveWhitespace: true });
    if (pieces.length === 0) {
      const candidate = current ? `${current}\n` : "";
      if (candidate && `${opening}\n${candidate}\n${closing}`.length > limit) {
        pushCurrent();
      }
      current = candidate;
      continue;
    }
    for (const piece of pieces) {
      const candidate = current ? `${current}\n${piece}` : piece;
      if (candidate && `${opening}\n${candidate}\n${closing}`.length > limit) {
        pushCurrent();
        current = piece;
        continue;
      }
      current = candidate;
    }
  }

  if (current || chunks.length === 0) {
    pushCurrent();
  }

  return chunks;
}

function chunkPlainText(
  text: string,
  limit: number,
  options?: { preserveWhitespace?: boolean },
): string[] {
  if (!text) return [];
  if (text.length <= limit) return [options?.preserveWhitespace ? text : text.trim()];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const breakIndex = resolveBreakIndex(window);
    const chunk = remaining.slice(0, breakIndex);
    const normalizedChunk = options?.preserveWhitespace ? chunk : chunk.trim();
    if (normalizedChunk) chunks.push(normalizedChunk);
    remaining = options?.preserveWhitespace
      ? remaining.slice(breakIndex).replace(/^\n/, "")
      : remaining.slice(breakIndex).trimStart();
  }
  const tail = options?.preserveWhitespace ? remaining : remaining.trim();
  if (tail) chunks.push(tail);
  return chunks;
}

function resolveBreakIndex(window: string): number {
  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph > 0) return paragraph;
  const newline = window.lastIndexOf("\n");
  if (newline > 0) return newline;
  const space = window.lastIndexOf(" ");
  if (space > 0) return space;
  return window.length;
}

function getFenceMarker(line: string): string | null {
  const trimmed = line.trim();
  const match = /^(?<marker>`{3,}|~{3,})/.exec(trimmed);
  return match?.groups?.marker ?? null;
}
