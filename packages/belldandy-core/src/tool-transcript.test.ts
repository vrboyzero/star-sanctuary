import { describe, expect, it } from "vitest";

import { truncateToolTranscriptContent } from "./tool-transcript.js";

describe("truncateToolTranscriptContent", () => {
  it("keeps short tool transcript content unchanged", () => {
    expect(truncateToolTranscriptContent("short output", 100)).toBe("short output");
  });

  it("truncates oversized tool transcript content while preserving head and tail", () => {
    const content = `HEAD:${"A".repeat(120)}:TAIL`;
    const truncated = truncateToolTranscriptContent(content, 120);

    expect(truncated).not.toBe(content);
    expect(truncated).toContain("HEAD:");
    expect(truncated).toContain(":TAIL");
    expect(truncated).toContain("[tool transcript truncated");
  });
});
