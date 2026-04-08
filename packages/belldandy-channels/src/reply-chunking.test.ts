import { describe, expect, it } from "vitest";

import { chunkMarkdownForOutbound, resolveOutboundChunkingStrategy } from "./reply-chunking.js";
import { normalizeReplyChunkingConfig } from "./reply-chunking-config.js";

describe("reply chunking", () => {
  it("keeps short outbound text unchanged", () => {
    expect(chunkMarkdownForOutbound("hello", "discord", { overrideLimit: 50 })).toEqual(["hello"]);
  });

  it("resolves explicit channel/account runtime strategy", () => {
    const config = normalizeReplyChunkingConfig({
      channels: {
        community: {
          textLimit: 3200,
          chunkMode: "newline",
          accounts: {
            alpha: {
              textLimit: 900,
              chunkMode: "length",
            },
          },
        },
      },
    });

    expect(resolveOutboundChunkingStrategy({
      target: "community",
      accountId: "alpha",
      config,
    })).toEqual({
      target: "community",
      accountId: "alpha",
      textLimit: 900,
      chunkMode: "length",
      source: "config",
    });
  });

  it("prefers paragraph boundaries for plain text", () => {
    const text = [
      "Paragraph A line 1",
      "Paragraph A line 2",
      "",
      "Paragraph B line 1",
      "Paragraph B line 2",
    ].join("\n");

    expect(chunkMarkdownForOutbound(text, "community", { overrideLimit: 45 })).toEqual([
      "Paragraph A line 1\nParagraph A line 2",
      "Paragraph B line 1\nParagraph B line 2",
    ]);
  });

  it("keeps fenced code blocks balanced when a block must be split", () => {
    const lines = Array.from({ length: 12 }, (_, index) => `console.log("line-${index}-xxxxxxxx");`);
    const text = `Intro\n\n\`\`\`ts\n${lines.join("\n")}\n\`\`\`\n\nTail`;
    const chunks = chunkMarkdownForOutbound(text, "discord", { overrideLimit: 90 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(90);
      expect(((chunk.match(/```/g) ?? []).length) % 2).toBe(0);
    }
  });
});
