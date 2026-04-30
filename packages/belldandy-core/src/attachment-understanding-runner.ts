import fs from "node:fs/promises";
import path from "node:path";

import type { AgentPromptDelta } from "@belldandy/agent";
import type { MessageSendParams } from "@belldandy/protocol";
import {
  readImageUnderstandConfig,
  readVideoUnderstandConfig,
  transcribeSpeechWithCache,
  understandImageFile,
  understandVideoFile,
  type ImageUnderstandResult,
  type TranscribeOptions,
  type TranscribeResult,
  type VideoUnderstandResult,
} from "@belldandy/skills";

import {
  createAttachmentFingerprint,
  readCachedImageUnderstanding,
  readCachedVideoUnderstanding,
  writeCachedImageUnderstanding,
  writeCachedVideoUnderstanding,
} from "./attachment-understanding-cache.js";
import { hasMediaCapability, type MediaCapability } from "./media-capability-registry.js";

export type AttachmentPromptLimits = {
  textCharLimit: number;
  totalTextCharLimit: number;
  audioTranscriptAppendCharLimit: number;
};

type QueryRuntimeLogger = {
  debug: (module: string, message: string, data?: unknown) => void;
  info: (module: string, message: string, data?: unknown) => void;
  warn: (module: string, message: string, data?: unknown) => void;
  error: (module: string, message: string, data?: unknown) => void;
};

type AttachmentKind = "image" | "video" | "audio" | "text" | "file";

type NormalizedAttachment = {
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  kind: AttachmentKind;
  buffer: Buffer;
  savePath: string;
  fingerprint: string;
};

export type PreparedAttachmentPrompt = {
  promptText: string;
  contentParts: Array<Record<string, unknown>>;
  textAttachmentCount: number;
  textAttachmentChars: number;
  audioTranscriptChars: number;
  audioTranscriptCacheHits: number;
  attachmentPromptLimits: AttachmentPromptLimits;
  promptDeltas: AgentPromptDelta[];
};

export async function preparePromptWithAttachments(input: {
  conversationId: string;
  promptText: string;
  attachments: MessageSendParams["attachments"];
  stateDir: string;
  sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
  log: QueryRuntimeLogger;
  getAttachmentPromptLimits: () => AttachmentPromptLimits;
  truncateTextForPrompt: (text: string, limit: number, suffix: string) => { text: string; truncated: boolean };
  acceptedContentCapabilities?: readonly MediaCapability[];
}): Promise<PreparedAttachmentPrompt> {
  let promptText = input.promptText;
  const contentParts: Array<Record<string, unknown>> = [];
  const attachmentPromptLimits = input.getAttachmentPromptLimits();
  let textAttachmentCount = 0;
  let textAttachmentChars = 0;
  let audioTranscriptChars = 0;
  let audioTranscriptCacheHits = 0;
  const promptDeltas: AgentPromptDelta[] = [];

  if (!input.attachments || input.attachments.length === 0) {
    return {
      promptText,
      contentParts,
      textAttachmentCount,
      textAttachmentChars,
      audioTranscriptChars,
      audioTranscriptCacheHits,
      attachmentPromptLimits,
      promptDeltas,
    };
  }

  input.log.debug("message", "Processing attachments", {
    count: input.attachments.length,
    conversationId: input.conversationId,
  });

  const attachmentDir = path.join(
    input.stateDir,
    "storage",
    "attachments",
  );
  await fs.mkdir(attachmentDir, { recursive: true });

  const attachmentPrompts: string[] = [];
  for (const [index, attachment] of input.attachments.entries()) {
    try {
      const normalized = await normalizeAttachment({
        attachment,
        attachmentDir,
      });

      if (normalized.kind === "image") {
        const imageHandled = await buildImageAttachmentPrompt({
          index,
          attachment,
          fingerprint: normalized.fingerprint,
          savePath: normalized.savePath,
          stateDir: input.stateDir,
          log: input.log,
          promptPath: toAttachmentPromptPath(input.stateDir, normalized.savePath),
          acceptedContentCapabilities: input.acceptedContentCapabilities,
        });
        attachmentPrompts.push(...imageHandled.prompts);
        if (imageHandled.contentPart) contentParts.push(imageHandled.contentPart);
        promptDeltas.push(...imageHandled.promptDeltas);
        continue;
      }

      if (normalized.kind === "video") {
        const videoHandled = await buildVideoAttachmentPrompt({
          index,
          attachment,
          fingerprint: normalized.fingerprint,
          savePath: normalized.savePath,
          stateDir: input.stateDir,
          log: input.log,
          promptPath: toAttachmentPromptPath(input.stateDir, normalized.savePath),
          acceptedContentCapabilities: input.acceptedContentCapabilities,
        });
        attachmentPrompts.push(...videoHandled.prompts);
        if (videoHandled.contentPart) contentParts.push(videoHandled.contentPart);
        promptDeltas.push(...videoHandled.promptDeltas);
        continue;
      }

      if (normalized.kind === "audio") {
        const audioResult = await buildAudioAttachmentPrompt({
          attachment,
          fingerprint: normalized.fingerprint,
          buffer: normalized.buffer,
          promptText,
          audioTranscriptChars,
          textAttachmentChars,
          stateDir: input.stateDir,
          sttTranscribe: input.sttTranscribe,
          log: input.log,
          limits: attachmentPromptLimits,
          truncateTextForPrompt: input.truncateTextForPrompt,
        });
        promptText = audioResult.promptText;
        audioTranscriptChars = audioResult.audioTranscriptChars;
        audioTranscriptCacheHits += audioResult.audioTranscriptCacheHits;
        attachmentPrompts.push(...audioResult.prompts);
        promptDeltas.push(...audioResult.promptDeltas);
        continue;
      }

      if (normalized.kind === "text") {
        const textResult = buildTextAttachmentPrompt({
          index,
          attachment,
          fingerprint: normalized.fingerprint,
          content: normalized.buffer.toString("utf-8"),
          textAttachmentChars,
          audioTranscriptChars,
          limits: attachmentPromptLimits,
          log: input.log,
          truncateTextForPrompt: input.truncateTextForPrompt,
        });
        textAttachmentCount += textResult.didCount ? 1 : 0;
        textAttachmentChars += textResult.addedChars;
        attachmentPrompts.push(textResult.prompt);
        if (textResult.promptDelta) promptDeltas.push(textResult.promptDelta);
        continue;
      }

      const promptPath = toAttachmentPromptPath(input.stateDir, normalized.savePath);
      attachmentPrompts.push(`\n[User uploaded a file: ${attachment.name} (type: ${attachment.type}), workspace path: ${promptPath}]`);
      promptDeltas.push(createPromptDelta({
        id: `attachment-file-${index + 1}`,
        deltaType: "attachment",
        role: "attachment",
        text: `[User uploaded a file: ${attachment.name} (type: ${attachment.type}), workspace path: ${promptPath}]`,
        metadata: {
          name: attachment.name,
          mime: attachment.type,
          kind: "file",
          fingerprint: normalized.fingerprint,
          path: promptPath,
        },
      }));
    } catch (error) {
      input.log.error("message", `Failed to save attachment ${attachment.name}`, error);
      attachmentPrompts.push(`\n[Failed to upload file: ${attachment.name}]`);
      promptDeltas.push(createPromptDelta({
        id: `attachment-error-${index + 1}`,
        deltaType: "attachment",
        role: "attachment",
        text: `[Failed to upload file: ${attachment.name}]`,
        metadata: { name: attachment.name, mime: attachment.type, kind: "error" },
      }));
    }
  }

  if (attachmentPrompts.length > 0) {
    promptText += "\n" + attachmentPrompts.join("\n");
  }

  return {
    promptText,
    contentParts,
    textAttachmentCount,
    textAttachmentChars,
    audioTranscriptChars,
    audioTranscriptCacheHits,
    attachmentPromptLimits,
    promptDeltas,
  };
}

async function normalizeAttachment(input: {
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  attachmentDir: string;
}): Promise<NormalizedAttachment> {
  const safeName = input.attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const buffer = Buffer.from(input.attachment.base64, "base64");
  const fingerprint = createAttachmentFingerprint({
    buffer,
    mime: input.attachment.type,
  });
  const savePath = await resolveAttachmentSavePath({
    attachmentDir: input.attachmentDir,
    safeName,
    buffer,
    fingerprint,
  });
  await fs.writeFile(savePath, buffer);
  return {
    attachment: input.attachment,
    kind: inferAttachmentKind(input.attachment),
    buffer,
    savePath,
    fingerprint,
  };
}

async function resolveAttachmentSavePath(input: {
  attachmentDir: string;
  safeName: string;
  buffer: Buffer;
  fingerprint: string;
}): Promise<string> {
  const preferredPath = path.join(input.attachmentDir, input.safeName);
  const existing = await fs.readFile(preferredPath).catch(() => undefined);
  if (!existing || Buffer.compare(existing, input.buffer) === 0) {
    return preferredPath;
  }

  const parsed = path.parse(input.safeName);
  const fingerprintSuffix = input.fingerprint.slice(0, 12) || "attachment";
  const dedupedName = `${parsed.name}__${fingerprintSuffix}${parsed.ext}`;
  return path.join(input.attachmentDir, dedupedName);
}

async function buildImageAttachmentPrompt(input: {
  index: number;
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  savePath: string;
  stateDir: string;
  log: QueryRuntimeLogger;
  promptPath: string;
  acceptedContentCapabilities?: readonly MediaCapability[];
}): Promise<{
  prompts: string[];
  contentPart?: Record<string, unknown>;
  promptDeltas: AgentPromptDelta[];
}> {
  const prompts: string[] = [];
  const promptDeltas: AgentPromptDelta[] = [];
  let contentPart: Record<string, unknown> | undefined;

  if (hasMediaCapability(input.acceptedContentCapabilities, "image_input")) {
    prompts.push(`\n[用户上传了图片: ${input.attachment.name}]`);
    contentPart = {
      type: "image_url",
      image_url: { url: `data:${input.attachment.type};base64,${input.attachment.base64}` },
    };
    promptDeltas.push(createPromptDelta({
      id: `attachment-image-${input.index + 1}`,
      deltaType: "attachment",
      role: "attachment",
      text: `[用户上传了图片: ${input.attachment.name}]`,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        kind: "image",
        fingerprint: input.fingerprint,
      },
    }));
  } else {
    prompts.push(`\n[用户上传了图片: ${input.attachment.name}（当前模型未声明 image_input，未走多模态注入）; workspace path: ${input.promptPath}]`);
    promptDeltas.push(createPromptDelta({
      id: `attachment-image-${input.index + 1}-degraded`,
      deltaType: "attachment",
      role: "attachment",
      text: `[用户上传了图片: ${input.attachment.name}（当前模型未声明 image_input，未走多模态注入）; workspace path: ${input.promptPath}]`,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        kind: "image",
        fingerprint: input.fingerprint,
        status: "capability-missing",
        path: input.promptPath,
      },
    }));
  }

  const understanding = await maybeUnderstandImageAttachment({
    attachment: input.attachment,
    fingerprint: input.fingerprint,
    savePath: input.savePath,
    stateDir: input.stateDir,
    log: input.log,
  });
  if (understanding) {
    const rendered = renderImageUnderstandingText(understanding.result);
    prompts.push(`\n${rendered}`);
    promptDeltas.push(createPromptDelta({
      id: `attachment-image-understanding-${input.index + 1}`,
      deltaType: "attachment",
      role: "attachment",
      text: rendered,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        kind: "image_understanding",
        fingerprint: input.fingerprint,
        cacheHit: understanding.cacheHit,
        model: understanding.result.model,
        provider: understanding.result.provider,
      },
    }));
  }

  return {
    prompts,
    contentPart,
    promptDeltas,
  };
}

async function maybeUnderstandImageAttachment(input: {
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  savePath: string;
  stateDir: string;
  log: QueryRuntimeLogger;
}): Promise<{ result: ImageUnderstandResult; cacheHit: boolean } | undefined> {
  const config = readImageUnderstandConfig();
  if (!config.enabled || !config.autoOnAttachment) {
    return undefined;
  }

  try {
    const cached = await readCachedImageUnderstanding({
      stateDir: input.stateDir,
      fingerprint: input.fingerprint,
    });
    if (cached?.result) {
      return {
        result: cached.result,
        cacheHit: true,
      };
    }

    const result = await understandImageFile({
      filePath: input.savePath,
      mimeType: input.attachment.type,
    });
    await writeCachedImageUnderstanding({
      stateDir: input.stateDir,
      fingerprint: input.fingerprint,
      mime: input.attachment.type,
      result,
    });
    return {
      result,
      cacheHit: false,
    };
  } catch (error) {
    input.log.warn("message", "Image attachment auto understanding failed", {
      name: input.attachment.name,
      mime: input.attachment.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function renderImageUnderstandingText(result: ImageUnderstandResult): string {
  const lines = [`[图片识别摘要: ${truncateInlineText(result.summary, 320)}]`];
  if (result.tags.length > 0) {
    lines.push(`[图片标签: ${result.tags.slice(0, 8).join("，")}]`);
  }
  if (result.keyRegions.length > 0) {
    lines.push(`[图片重点区域: ${result.keyRegions.slice(0, 3).map((item) => `${truncateInlineText(item.label, 24)} ${truncateInlineText(item.summary, 48)}`).join("；")}]`);
  }
  if (result.ocrText) {
    lines.push(`[图片可见文字: ${truncateInlineText(result.ocrText, 800)}]`);
  }
  return lines.join("\n");
}

function truncateInlineText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

async function buildVideoAttachmentPrompt(input: {
  index: number;
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  savePath: string;
  stateDir: string;
  log: QueryRuntimeLogger;
  promptPath: string;
  acceptedContentCapabilities?: readonly MediaCapability[];
}): Promise<{
  prompts: string[];
  contentPart?: Record<string, unknown>;
  promptDeltas: AgentPromptDelta[];
}> {
  const baseHandled = handleVideoAttachment({
    index: input.index,
    attachment: input.attachment,
    fingerprint: input.fingerprint,
    savePath: input.savePath,
    promptPath: input.promptPath,
    acceptedContentCapabilities: input.acceptedContentCapabilities,
  });
  const prompts = [baseHandled.prompt];
  const promptDeltas = [baseHandled.promptDelta];

  const understanding = await maybeUnderstandVideoAttachment({
    attachment: input.attachment,
    fingerprint: input.fingerprint,
    savePath: input.savePath,
    stateDir: input.stateDir,
    log: input.log,
  });
  if (understanding) {
    const rendered = renderVideoUnderstandingText(understanding.result);
    prompts.push(`\n${rendered}`);
    promptDeltas.push(createPromptDelta({
      id: `attachment-video-understanding-${input.index + 1}`,
      deltaType: "attachment",
      role: "attachment",
      text: rendered,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        kind: "video_understanding",
        fingerprint: input.fingerprint,
        cacheHit: understanding.cacheHit,
        model: understanding.result.model,
        provider: understanding.result.provider,
      },
    }));
  }

  return {
    prompts,
    contentPart: baseHandled.contentPart,
    promptDeltas,
  };
}

async function maybeUnderstandVideoAttachment(input: {
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  savePath: string;
  stateDir: string;
  log: QueryRuntimeLogger;
}): Promise<{ result: VideoUnderstandResult; cacheHit: boolean } | undefined> {
  const config = readVideoUnderstandConfig();
  if (!config.enabled || !config.autoOnAttachment) {
    return undefined;
  }

  try {
    const cached = await readCachedVideoUnderstanding({
      stateDir: input.stateDir,
      fingerprint: input.fingerprint,
    });
    if (cached?.result) {
      return {
        result: cached.result,
        cacheHit: true,
      };
    }

    const result = await understandVideoFile({
      filePath: input.savePath,
      mimeType: input.attachment.type,
    });
    await writeCachedVideoUnderstanding({
      stateDir: input.stateDir,
      fingerprint: input.fingerprint,
      mime: input.attachment.type,
      result,
    });
    return {
      result,
      cacheHit: false,
    };
  } catch (error) {
    input.log.warn("message", "Video attachment auto understanding failed", {
      name: input.attachment.name,
      mime: input.attachment.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function renderVideoUnderstandingText(result: VideoUnderstandResult): string {
  const lines = [`[视频识别摘要: ${truncateInlineText(result.summary, 320)}]`];
  if (result.tags.length > 0) {
    lines.push(`[视频标签: ${result.tags.slice(0, 8).join("，")}]`);
  }
  if (result.timeline.length > 0) {
    lines.push(`[视频关键片段: ${result.timeline.slice(0, 3).map((item) => `${item.timestamp} ${truncateInlineText(item.summary, 48)}`).join("；")}]`);
  }
  if (result.ocrText) {
    lines.push(`[视频可见文字: ${truncateInlineText(result.ocrText, 800)}]`);
  }
  return lines.join("\n");
}

function handleVideoAttachment(input: {
  index: number;
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  savePath: string;
  promptPath: string;
  acceptedContentCapabilities?: readonly MediaCapability[];
}): {
  prompt: string;
  contentPart?: Record<string, unknown>;
  promptDelta: AgentPromptDelta;
} {
  if (hasMediaCapability(input.acceptedContentCapabilities, "video_input")) {
    const absPath = path.resolve(input.savePath);
    return {
      prompt: `\n[用户上传了视频: ${input.attachment.name}] (System Note: Video content has been injected via multimodal channel. Please analyze it directly.)`,
      contentPart: {
        type: "video_url",
        video_url: { url: `file://${absPath}` },
      },
      promptDelta: createPromptDelta({
        id: `attachment-video-${input.index + 1}`,
        deltaType: "attachment",
        role: "attachment",
        text: `[用户上传了视频: ${input.attachment.name}] (System Note: Video content has been injected via multimodal channel. Please analyze it directly.)`,
        metadata: {
          name: input.attachment.name,
          mime: input.attachment.type,
          kind: "video",
          fingerprint: input.fingerprint,
        },
      }),
    };
  }

  return {
    prompt: `\n[用户上传了视频: ${input.attachment.name}（当前模型未声明 video_input，未走多模态注入）; workspace path: ${input.promptPath}]`,
    promptDelta: createPromptDelta({
      id: `attachment-video-${input.index + 1}-degraded`,
      deltaType: "attachment",
      role: "attachment",
      text: `[用户上传了视频: ${input.attachment.name}（当前模型未声明 video_input，未走多模态注入）; workspace path: ${input.promptPath}]`,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        kind: "video",
        fingerprint: input.fingerprint,
        status: "capability-missing",
        path: input.promptPath,
      },
    }),
  };
}

function buildTextAttachmentPrompt(input: {
  index: number;
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  content: string;
  textAttachmentChars: number;
  audioTranscriptChars: number;
  limits: AttachmentPromptLimits;
  log: QueryRuntimeLogger;
  truncateTextForPrompt: (text: string, limit: number, suffix: string) => { text: string; truncated: boolean };
}): {
  prompt: string;
  promptDelta?: AgentPromptDelta;
  didCount: boolean;
  addedChars: number;
} {
  const remainingChars = Math.max(
    0,
    input.limits.totalTextCharLimit - input.textAttachmentChars - input.audioTranscriptChars,
  );
  const fileCharLimit = Math.min(input.limits.textCharLimit, remainingChars);
  if (fileCharLimit <= 0) {
    return {
      prompt: `\n[用户上传了文本附件: ${input.attachment.name}（因本次上下文预算已用尽，未注入全文）]`,
      didCount: false,
      addedChars: 0,
    };
  }

  const truncated = input.truncateTextForPrompt(input.content, fileCharLimit, "\n...[Truncated]");
  if (truncated.truncated) {
    input.log.debug("message", "Text attachment truncated by char limit", {
      name: input.attachment.name,
      originalChars: input.content.length,
      keptChars: truncated.text.length,
      charLimit: input.limits.textCharLimit,
      totalCharLimit: input.limits.totalTextCharLimit,
      remainingChars,
    });
  }

  return {
    prompt: `\n\n--- Attachment: ${input.attachment.name} ---\n${truncated.text}\n--- End of Attachment ---\n`,
    promptDelta: createPromptDelta({
      id: `attachment-text-${input.index + 1}`,
      deltaType: "attachment",
      role: "attachment",
      text: `--- Attachment: ${input.attachment.name} ---\n${truncated.text}\n--- End of Attachment ---`,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        kind: "text",
        fingerprint: input.fingerprint,
        truncated: truncated.truncated,
      },
    }),
    didCount: true,
    addedChars: truncated.text.length,
  };
}

async function buildAudioAttachmentPrompt(input: {
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  fingerprint: string;
  buffer: Buffer;
  promptText: string;
  audioTranscriptChars: number;
  textAttachmentChars: number;
  stateDir: string;
  sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
  log: QueryRuntimeLogger;
  limits: AttachmentPromptLimits;
  truncateTextForPrompt: (text: string, limit: number, suffix: string) => { text: string; truncated: boolean };
}): Promise<{
  promptText: string;
  audioTranscriptChars: number;
  audioTranscriptCacheHits: number;
  prompts: string[];
  promptDeltas: AgentPromptDelta[];
}> {
  const prompts: string[] = [];
  const promptDeltas: AgentPromptDelta[] = [];
  let promptText = input.promptText;
  let audioTranscriptChars = input.audioTranscriptChars;
  let audioTranscriptCacheHits = 0;

  if (!input.sttTranscribe) {
    prompts.push(`\n[用户上传了音频: ${input.attachment.name}（STT未配置）]`);
    promptDeltas.push(createPromptDelta({
      id: `audio-transcript-${input.attachment.name}-unconfigured`,
      deltaType: "audio-transcript",
      role: "attachment",
      text: `[用户上传了音频: ${input.attachment.name}（STT未配置）]`,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        status: "stt-unconfigured",
        fingerprint: input.fingerprint,
      },
    }));
    return { promptText, audioTranscriptChars, audioTranscriptCacheHits, prompts, promptDeltas };
  }

  input.log.debug("stt", "Transcribing audio attachment", { name: input.attachment.name });
  try {
    const { result: sttResult, cacheHit } = await transcribeSpeechWithCache({
      stateDir: input.stateDir,
      buffer: input.buffer,
      fileName: input.attachment.name,
      mime: input.attachment.type,
      transcribe: input.sttTranscribe,
    });
    if (cacheHit) {
      audioTranscriptCacheHits += 1;
      input.log.debug("stt", "Audio transcript cache hit", {
        name: input.attachment.name,
        fingerprint: input.fingerprint,
      });
    }

    if (!sttResult?.text) {
      prompts.push(`\n[用户上传了音频: ${input.attachment.name}（转录失败）]`);
      promptDeltas.push(createPromptDelta({
        id: `audio-transcript-${input.attachment.name}-failed`,
        deltaType: "audio-transcript",
        role: "attachment",
        text: `[用户上传了音频: ${input.attachment.name}（转录失败）]`,
        metadata: {
          name: input.attachment.name,
          mime: input.attachment.type,
          status: "empty",
          fingerprint: input.fingerprint,
        },
      }));
      return { promptText, audioTranscriptChars, audioTranscriptCacheHits, prompts, promptDeltas };
    }

    input.log.debug("stt", "Audio transcribed", {
      name: input.attachment.name,
      textLength: sttResult.text.length,
      cacheHit,
    });

    if (!promptText.trim()) {
      const truncatedTranscript = input.truncateTextForPrompt(
        sttResult.text,
        input.limits.totalTextCharLimit,
        "\n...[Transcript truncated]",
      );
      promptText = truncatedTranscript.text;
      audioTranscriptChars += truncatedTranscript.text.length;
      if (truncatedTranscript.truncated) {
        input.log.debug("stt", "Primary audio transcript truncated by total prompt limit", {
          name: input.attachment.name,
          originalChars: sttResult.text.length,
          keptChars: truncatedTranscript.text.length,
          totalCharLimit: input.limits.totalTextCharLimit,
        });
      }
      return { promptText, audioTranscriptChars, audioTranscriptCacheHits, prompts, promptDeltas };
    }

    const remainingChars = Math.max(
      0,
      input.limits.totalTextCharLimit - input.textAttachmentChars - audioTranscriptChars,
    );
    const transcriptCharLimit = Math.min(input.limits.audioTranscriptAppendCharLimit, remainingChars);
    if (transcriptCharLimit <= 0) {
      prompts.push(`\n[用户上传了音频: ${input.attachment.name}（转录已完成，但因本次上下文预算已用尽未注入全文）]`);
      promptDeltas.push(createPromptDelta({
        id: `audio-transcript-${input.attachment.name}-skipped`,
        deltaType: "audio-transcript",
        role: "attachment",
        text: `[用户上传了音频: ${input.attachment.name}（转录已完成，但因本次上下文预算已用尽未注入全文）]`,
        metadata: {
          name: input.attachment.name,
          mime: input.attachment.type,
          status: "budget-exhausted",
          fingerprint: input.fingerprint,
          cacheHit,
        },
      }));
      return { promptText, audioTranscriptChars, audioTranscriptCacheHits, prompts, promptDeltas };
    }

    const truncatedTranscript = input.truncateTextForPrompt(
      sttResult.text,
      transcriptCharLimit,
      "\n...[Transcript truncated]",
    );
    audioTranscriptChars += truncatedTranscript.text.length;
    if (truncatedTranscript.truncated) {
      input.log.debug("stt", "Audio transcript truncated for appended context", {
        name: input.attachment.name,
        originalChars: sttResult.text.length,
        keptChars: truncatedTranscript.text.length,
        appendCharLimit: input.limits.audioTranscriptAppendCharLimit,
        remainingChars,
      });
    }

    const transcriptText = `[语音转录: "${truncatedTranscript.text}"]`;
    prompts.push(`\n${transcriptText}`);
    promptDeltas.push(createPromptDelta({
      id: `audio-transcript-${input.attachment.name}`,
      deltaType: "audio-transcript",
      role: "attachment",
      text: transcriptText,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        fingerprint: input.fingerprint,
        truncated: truncatedTranscript.truncated,
        cacheHit,
      },
    }));
    return { promptText, audioTranscriptChars, audioTranscriptCacheHits, prompts, promptDeltas };
  } catch (error) {
    input.log.error("stt", `STT failed for ${input.attachment.name}`, error);
    prompts.push(`\n[用户上传了音频: ${input.attachment.name}（转录出错）]`);
    promptDeltas.push(createPromptDelta({
      id: `audio-transcript-${input.attachment.name}-error`,
      deltaType: "audio-transcript",
      role: "attachment",
      text: `[用户上传了音频: ${input.attachment.name}（转录出错）]`,
      metadata: {
        name: input.attachment.name,
        mime: input.attachment.type,
        status: "error",
        fingerprint: input.fingerprint,
      },
    }));
    return { promptText, audioTranscriptChars, audioTranscriptCacheHits, prompts, promptDeltas };
  }
}

function inferAttachmentKind(attachment: NonNullable<MessageSendParams["attachments"]>[number]): AttachmentKind {
  const lowerName = attachment.name.toLowerCase();
  if (attachment.type.startsWith("image/")) return "image";
  if (attachment.type.startsWith("video/")) return "video";
  if (attachment.type.startsWith("audio/")) return "audio";
  if (
    attachment.type.startsWith("text/")
    || lowerName.endsWith(".md")
    || lowerName.endsWith(".json")
    || lowerName.endsWith(".js")
    || lowerName.endsWith(".ts")
    || lowerName.endsWith(".txt")
    || lowerName.endsWith(".log")
  ) {
    return "text";
  }
  return "file";
}

function createPromptDelta(input: {
  id: string;
  deltaType: AgentPromptDelta["deltaType"];
  role: AgentPromptDelta["role"];
  text: string;
  metadata?: Record<string, unknown>;
}): AgentPromptDelta {
  return {
    id: input.id,
    deltaType: input.deltaType,
    role: input.role,
    source: "message.send",
    text: input.text.trim(),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function toAttachmentPromptPath(stateDir: string, savePath: string): string {
  const relative = path.relative(stateDir, savePath);
  if (!relative || relative.startsWith("..")) {
    return savePath;
  }
  return relative.replace(/\\/g, "/");
}
