import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { preparePromptWithAttachments, type AttachmentPromptLimits } from "./attachment-understanding-runner.js";

const TEST_LIMITS: AttachmentPromptLimits = {
  textCharLimit: 200,
  totalTextCharLimit: 500,
  audioTranscriptAppendCharLimit: 120,
};

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

describe("attachment understanding runner", () => {
  it("reuses cached audio transcription for the same attachment fingerprint", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-att-runner-"));
    let sttCalls = 0;
    try {
      const runOnce = async () => preparePromptWithAttachments({
        conversationId: "conv-cache",
        promptText: "summarize",
        attachments: [
          { name: "voice.webm", type: "audio/webm", base64: Buffer.from("same-audio").toString("base64") },
        ],
        stateDir,
        sttTranscribe: async () => {
          sttCalls += 1;
          return {
            text: "cached transcript",
            provider: "mock",
            model: "mock-stt",
          };
        },
        log: noopLogger,
        getAttachmentPromptLimits: () => TEST_LIMITS,
        truncateTextForPrompt: (text, limit, suffix) => ({
          text: text.length > limit ? `${text.slice(0, limit)}${suffix}` : text,
          truncated: text.length > limit,
        }),
        acceptedContentCapabilities: ["text_inline"],
      });

      const first = await runOnce();
      const second = await runOnce();

      expect(sttCalls).toBe(1);
      expect(first.promptText).toContain("cached transcript");
      expect(second.promptText).toContain("cached transcript");
      expect(second.audioTranscriptCacheHits).toBe(1);
      expect(second.promptDeltas).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deltaType: "audio-transcript",
          metadata: expect.objectContaining({
            cacheHit: true,
          }),
        }),
      ]));
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("degrades image attachments when current model capabilities do not include image_input", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-att-runner-"));
    try {
      const result = await preparePromptWithAttachments({
        conversationId: "conv-image-degrade",
        promptText: "describe",
        attachments: [
          { name: "photo.png", type: "image/png", base64: Buffer.from("fake-image").toString("base64") },
        ],
        stateDir,
        log: noopLogger,
        getAttachmentPromptLimits: () => TEST_LIMITS,
        truncateTextForPrompt: (text, limit, suffix) => ({
          text: text.length > limit ? `${text.slice(0, limit)}${suffix}` : text,
          truncated: text.length > limit,
        }),
        acceptedContentCapabilities: ["text_inline"],
      });

      expect(result.contentParts).toEqual([]);
      expect(result.promptText).toContain("当前模型未声明 image_input");
      expect(result.promptDeltas).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deltaType: "attachment",
          metadata: expect.objectContaining({
            kind: "image",
            status: "capability-missing",
          }),
        }),
      ]));
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
