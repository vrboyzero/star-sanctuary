import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readImageUnderstandConfigMock,
  understandImageFileMock,
  readVideoUnderstandConfigMock,
  understandVideoFileMock,
  transcribeSpeechWithCacheMock,
  createMediaFingerprintMock,
  readCachedImageUnderstandingMock,
  writeCachedImageUnderstandingMock,
  readCachedVideoUnderstandingMock,
  writeCachedVideoUnderstandingMock,
  audioCacheStore,
  imageCacheStore,
  videoCacheStore,
} = vi.hoisted(() => ({
  readImageUnderstandConfigMock: vi.fn(),
  understandImageFileMock: vi.fn(),
  readVideoUnderstandConfigMock: vi.fn(),
  understandVideoFileMock: vi.fn(),
  audioCacheStore: new Map<string, unknown>(),
  imageCacheStore: new Map<string, unknown>(),
  videoCacheStore: new Map<string, unknown>(),
  createMediaFingerprintMock: vi.fn((input: { buffer: Buffer; mime?: string }) => {
    const safeMime = (input.mime ?? "").replace(/[^a-z0-9]+/gi, "_");
    return `${safeMime}_${input.buffer.toString("hex")}`;
  }),
  transcribeSpeechWithCacheMock: vi.fn(async (input: {
    stateDir: string;
    buffer: Buffer;
    fileName: string;
    mime?: string;
    transcribe?: (opts: { buffer: Buffer; fileName: string; mime?: string }) => Promise<unknown>;
  }) => {
    const fingerprint = createMediaFingerprintMock({
      buffer: input.buffer,
      mime: input.mime,
    });
    const cacheKey = `${input.stateDir}:${fingerprint}`;
    const cached = audioCacheStore.get(cacheKey) as { result?: unknown } | undefined;
    if (cached?.result) {
      return {
        result: cached.result,
        cacheHit: true,
        fingerprint,
      };
    }
    const result = input.transcribe ? await input.transcribe({
      buffer: input.buffer,
      fileName: input.fileName,
      mime: input.mime,
    }) : null;
    if (result) {
      audioCacheStore.set(cacheKey, {
        version: 1,
        fingerprint,
        mime: input.mime,
        createdAt: new Date().toISOString(),
        result,
      });
    }
    return {
      result,
      cacheHit: false,
      fingerprint,
    };
  }),
  readCachedImageUnderstandingMock: vi.fn(async (input: { stateDir: string; fingerprint: string }) => {
    return imageCacheStore.get(`${input.stateDir}:${input.fingerprint}`) as any;
  }),
  writeCachedImageUnderstandingMock: vi.fn(async (input: { stateDir: string; fingerprint: string; mime?: string; result: unknown }) => {
    imageCacheStore.set(`${input.stateDir}:${input.fingerprint}`, {
      version: 1,
      fingerprint: input.fingerprint,
      mime: input.mime,
      createdAt: new Date().toISOString(),
      result: input.result,
    });
  }),
  readCachedVideoUnderstandingMock: vi.fn(async (input: { stateDir: string; fingerprint: string }) => {
    return videoCacheStore.get(`${input.stateDir}:${input.fingerprint}`) as any;
  }),
  writeCachedVideoUnderstandingMock: vi.fn(async (input: { stateDir: string; fingerprint: string; mime?: string; result: unknown }) => {
    videoCacheStore.set(`${input.stateDir}:${input.fingerprint}`, {
      version: 1,
      fingerprint: input.fingerprint,
      mime: input.mime,
      createdAt: new Date().toISOString(),
      result: input.result,
    });
  }),
}));

vi.mock("@belldandy/skills", () => ({
  readImageUnderstandConfig: readImageUnderstandConfigMock,
  understandImageFile: understandImageFileMock,
  readVideoUnderstandConfig: readVideoUnderstandConfigMock,
  understandVideoFile: understandVideoFileMock,
  transcribeSpeechWithCache: transcribeSpeechWithCacheMock,
  createMediaFingerprint: createMediaFingerprintMock,
  readCachedImageUnderstanding: readCachedImageUnderstandingMock,
  writeCachedImageUnderstanding: writeCachedImageUnderstandingMock,
  readCachedVideoUnderstanding: readCachedVideoUnderstandingMock,
  writeCachedVideoUnderstanding: writeCachedVideoUnderstandingMock,
}));

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
  beforeEach(() => {
    readImageUnderstandConfigMock.mockReset();
    understandImageFileMock.mockReset();
    readVideoUnderstandConfigMock.mockReset();
    understandVideoFileMock.mockReset();
    transcribeSpeechWithCacheMock.mockClear();
    createMediaFingerprintMock.mockClear();
    readCachedImageUnderstandingMock.mockClear();
    writeCachedImageUnderstandingMock.mockClear();
    readCachedVideoUnderstandingMock.mockClear();
    writeCachedVideoUnderstandingMock.mockClear();
    audioCacheStore.clear();
    imageCacheStore.clear();
    videoCacheStore.clear();
    readImageUnderstandConfigMock.mockReturnValue({
      enabled: false,
      autoOnAttachment: true,
    });
    readVideoUnderstandConfigMock.mockReturnValue({
      enabled: false,
      autoOnAttachment: true,
    });
  });

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

  it("automatically appends image understanding and reuses cached results", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-att-runner-image-"));
    readImageUnderstandConfigMock.mockReturnValue({
      enabled: true,
      autoOnAttachment: true,
    });
    understandImageFileMock.mockResolvedValue({
      summary: "一张展示终端界面的截图。",
      tags: ["screenshot", "terminal"],
      ocrText: "hello world",
      content: "一张展示终端界面的截图，包含 hello world 文本。",
      keyRegions: [
        { label: "终端窗口", summary: "主体是终端内容区域。", ocrText: "" },
        { label: "输出行", summary: "中部有 hello world 文本。", ocrText: "hello world" },
      ],
      targetDetail: undefined,
      focusMode: "overview",
      focusTarget: undefined,
      provider: "openai",
      model: "gpt-4.1-mini",
      mimeType: "image/png",
      sourcePath: path.join(stateDir, "storage", "attachments", "photo.png"),
    });

    try {
      const runOnce = async () => preparePromptWithAttachments({
        conversationId: "conv-image-auto",
        promptText: "describe",
        attachments: [
          { name: "photo.png", type: "image/png", base64: Buffer.from("same-image").toString("base64") },
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

      const first = await runOnce();
      const second = await runOnce();

      expect(understandImageFileMock).toHaveBeenCalledTimes(1);
      expect(first.promptText).toContain("[图片识别摘要: 一张展示终端界面的截图。]");
      expect(first.promptText).toContain("[图片标签: screenshot，terminal]");
      expect(first.promptText).toContain("[图片重点区域: 终端窗口 主体是终端内容区域。；输出行 中部有 hello world 文本。]");
      expect(first.promptText).toContain("[图片可见文字: hello world]");
      expect(second.promptDeltas).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deltaType: "attachment",
          metadata: expect.objectContaining({
            kind: "image_understanding",
            cacheHit: true,
            model: "gpt-4.1-mini",
          }),
        }),
      ]));
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("automatically appends video understanding and reuses cached results", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-att-runner-video-"));
    readVideoUnderstandConfigMock.mockReturnValue({
      enabled: true,
      autoOnAttachment: true,
    });
    understandVideoFileMock.mockResolvedValue({
      summary: "一段展示产品旋转效果的短视频。",
      tags: ["product", "rotation"],
      ocrText: "DEMO",
      content: "视频里展示了产品旋转效果，并出现 DEMO 文本。",
      durationText: "约 12 秒",
      timeline: [
        { timestamp: "00:02", summary: "镜头展示产品正面。", ocrText: "" },
        { timestamp: "00:07", summary: "产品开始旋转。", ocrText: "DEMO" },
      ],
      targetMoment: undefined,
      focusMode: "overview",
      targetTimestamp: undefined,
      provider: "openai",
      model: "kimi-k2.5",
      mimeType: "video/mp4",
      sourcePath: path.join(stateDir, "storage", "attachments", "clip.mp4"),
    });

    try {
      const runOnce = async () => preparePromptWithAttachments({
        conversationId: "conv-video-auto",
        promptText: "describe",
        attachments: [
          { name: "clip.mp4", type: "video/mp4", base64: Buffer.from("same-video").toString("base64") },
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

      const first = await runOnce();
      const second = await runOnce();

      expect(understandVideoFileMock).toHaveBeenCalledTimes(1);
      expect(first.promptText).toContain("[视频识别摘要: 一段展示产品旋转效果的短视频。]");
      expect(first.promptText).toContain("[视频标签: product，rotation]");
      expect(first.promptText).toContain("[视频关键片段: 00:02 镜头展示产品正面。；00:07 产品开始旋转。]");
      expect(first.promptText).toContain("[视频可见文字: DEMO]");
      expect(second.promptDeltas).toEqual(expect.arrayContaining([
        expect.objectContaining({
          deltaType: "attachment",
          metadata: expect.objectContaining({
            kind: "video_understanding",
            cacheHit: true,
            model: "kimi-k2.5",
          }),
        }),
      ]));
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
