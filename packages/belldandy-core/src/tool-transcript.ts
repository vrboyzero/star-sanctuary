const DEFAULT_TOOL_TRANSCRIPT_CHAR_LIMIT = 12_000;

export function truncateToolTranscriptContent(
  content: string,
  limit: number = DEFAULT_TOOL_TRANSCRIPT_CHAR_LIMIT,
): string {
  if (!Number.isFinite(limit) || limit <= 0 || content.length <= limit) {
    return content;
  }

  const marker = `\n...[tool transcript truncated, original=${content.length} chars]...\n`;
  if (limit <= marker.length + 32) {
    return content.slice(0, limit);
  }

  const remaining = limit - marker.length;
  const head = Math.max(16, Math.ceil(remaining * 0.65));
  const tail = Math.max(16, remaining - head);
  return `${content.slice(0, head)}${marker}${content.slice(Math.max(head, content.length - tail))}`;
}
