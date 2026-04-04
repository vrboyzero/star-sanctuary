import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { WebSocket } from "ws";
import type { AgentPromptDelta, AgentRegistry, BelldandyAgent, ConversationStore } from "@belldandy/agent";
import type { DurableExtractionDigestSnapshot, DurableExtractionRecord, DurableExtractionRuntime } from "@belldandy/memory";
import { uploadTokenUsage, type ChatMessageMeta, type GatewayEventFrame, type GatewayResFrame, type MessageSendParams, type TokenUsageUploadConfig } from "@belldandy/protocol";
import type { MemoryRuntimeBudgetGuard, MemoryRuntimeUsageAccounting } from "./memory-runtime-budget.js";
import { runAgentWithLifecycle } from "./query-runtime-agent-run.js";
import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";
import type { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import type { TranscribeOptions, TranscribeResult } from "@belldandy/skills";

type QueryRuntimeLogger = {
  debug: (module: string, message: string, data?: unknown) => void;
  info: (module: string, message: string, data?: unknown) => void;
  warn: (module: string, message: string, data?: unknown) => void;
  error: (module: string, message: string, data?: unknown) => void;
};

type AttachmentPromptLimits = {
  textCharLimit: number;
  totalTextCharLimit: number;
  audioTranscriptAppendCharLimit: number;
};

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

type ToolControlPasswordApproval = {
  sanitizedText: string;
};

export type MessageSendQueryRuntimeContext = {
  request: {
    ws: WebSocket;
    requestId: string;
    params: MessageSendParams;
    clientId: string;
    userUuid?: string;
    stateDir: string;
  };
  runtime: {
    log: QueryRuntimeLogger;
    agentFactory: () => BelldandyAgent;
    agentRegistry?: AgentRegistry;
    conversationStore: ConversationStore;
    runtimeObserver?: QueryRuntimeObserver<"message.send">;
  };
  toolControl: {
    confirmationStore?: ToolControlConfirmationStore;
    getMode?: () => "disabled" | "confirm" | "auto";
    getConfirmPassword?: () => string | undefined;
    tryApprovePasswordInput: (input: {
      confirmationStore?: ToolControlConfirmationStore;
      getMode?: () => "disabled" | "confirm" | "auto";
      getConfirmPassword?: () => string | undefined;
      conversationId: string;
      userText: string;
    }) => ToolControlPasswordApproval;
  };
  media: {
    sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
    ttsEnabled?: () => boolean;
    ttsSynthesize?: (text: string) => Promise<{ webPath: string; htmlAudio: string } | null>;
    getAttachmentPromptLimits: () => AttachmentPromptLimits;
    truncateTextForPrompt: (text: string, limit: number, suffix: string) => { text: string; truncated: boolean };
    formatLocalMessageTime: (timestampMs: number) => string;
  };
  io: {
    broadcastEvent?: (frame: GatewayEventFrame) => void;
    sendEvent: (ws: WebSocket, frame: GatewayEventFrame) => void;
    toChatMessageMeta: (timestampMs: number, isLatest?: boolean) => ChatMessageMeta;
  };
  effects: {
    tokenUsageUploadConfig: TokenUsageUploadConfig;
    durableExtractionRuntime?: DurableExtractionRuntime;
    requestDurableExtraction?: (input: {
      conversationId: string;
      source: string;
      digest: DurableExtractionDigestSnapshot;
    }) => Promise<DurableExtractionRecord | undefined>;
    memoryUsageAccounting: MemoryRuntimeUsageAccounting;
    memoryBudgetGuard: MemoryRuntimeBudgetGuard;
    emitAutoRunTaskTokenResult: (
      conversationStore: ConversationStore,
      payload: {
        conversationId: string;
        inputTokens: number;
        outputTokens: number;
        durationMs: number;
      },
      ws?: WebSocket,
    ) => void;
    refreshConversationDigestAndBroadcast: (
      conversationStore: ConversationStore,
      payload: {
        conversationId: string;
        force?: boolean;
        threshold?: number;
        source: string;
      },
      broadcastEvent?: (frame: GatewayEventFrame) => void,
      durableExtractionRuntime?: DurableExtractionRuntime,
      requestDurableExtraction?: (input: {
        conversationId: string;
        source: string;
        digest: DurableExtractionDigestSnapshot;
      }) => Promise<DurableExtractionRecord | undefined>,
      memoryUsageAccounting?: MemoryRuntimeUsageAccounting,
      memoryBudgetGuard?: MemoryRuntimeBudgetGuard,
    ) => Promise<unknown>;
  };
};

export async function handleMessageSendWithQueryRuntime(
  ctx: MessageSendQueryRuntimeContext,
): Promise<GatewayResFrame> {
  const { request, runtime: runtimeDeps, toolControl, media, io } = ctx;
  const runtime = new QueryRuntime({
    method: "message.send" as const,
    traceId: request.requestId,
    observer: runtimeDeps.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    const requestedAgentId = request.params.agentId;
    const requestedModelId = request.params.modelId;
    const createOpts = requestedModelId ? { modelOverride: requestedModelId } : undefined;
    const conversationId = request.params.conversationId ?? crypto.randomUUID();
    const runId = crypto.randomUUID();
    const effectiveUserUuid = request.params.userUuid ?? request.userUuid;

    queryRuntime.mark("request_validated", {
      conversationId,
      detail: {
        requestedAgentId: requestedAgentId ?? "default",
        requestedModelId: requestedModelId ?? "default",
        runId,
        hasAttachments: Array.isArray(request.params.attachments) && request.params.attachments.length > 0,
      },
    });

    const agent = createAgent({
      agentFactory: runtimeDeps.agentFactory,
      agentRegistry: runtimeDeps.agentRegistry,
      requestedAgentId,
      createOpts,
    });

    queryRuntime.mark("agent_created", {
      conversationId,
      detail: {
        requestedAgentId: requestedAgentId ?? "default",
        requestedModelId: requestedModelId ?? "default",
        runId,
      },
    });

    let userText = request.params.text;
    const normalizedRoomContext = request.params.roomContext
      ? { ...request.params.roomContext, clientId: request.clientId }
      : request.params.from === "web"
        ? { environment: "local" as const, clientId: request.clientId }
        : undefined;

    userText = toolControl.tryApprovePasswordInput({
      confirmationStore: toolControl.confirmationStore,
      getMode: toolControl.getMode,
      getConfirmPassword: toolControl.getConfirmPassword,
      conversationId,
      userText,
    }).sanitizedText;

    const { conversation: existingConv, history } = await runtimeDeps.conversationStore.getConversationHistoryCompacted(conversationId);

    queryRuntime.mark("conversation_loaded", {
      conversationId,
      detail: {
        historyLength: history.length,
        existingAgentId: existingConv?.agentId,
      },
    });

    if (existingConv?.agentId && requestedAgentId && existingConv.agentId !== requestedAgentId) {
      queryRuntime.mark("completed", {
        conversationId,
        detail: {
          rejected: "agent_mismatch",
        },
      });
      return {
        type: "res",
        id: request.requestId,
        ok: false,
        error: {
          code: "agent_mismatch",
          message: `会话已绑定 Agent "${existingConv.agentId}"，不能使用 "${requestedAgentId}"。请新建会话。`,
        },
      };
    }

    const userMessageTimestamp = Date.now();
    const userMessage = runtimeDeps.conversationStore.addMessage(conversationId, "user", userText, {
      agentId: requestedAgentId,
      channel: "webchat",
      timestampMs: userMessageTimestamp,
      clientContext: request.params.clientContext,
    });
    await runtimeDeps.conversationStore.waitForPendingPersistence(conversationId);

    queryRuntime.mark("user_message_persisted", {
      conversationId,
      detail: {
        userTimestampMs: userMessage.timestamp,
      },
    });

    runtimeDeps.log.debug("message", "Processing message.send", {
      conversationId,
      hasUserUuid: Boolean(effectiveUserUuid),
      userUuidSource: request.params.userUuid ? "message.send" : (request.userUuid ? "connect" : "none"),
      payloadKeys: Object.keys(request.params),
    });
    if ("attachments" in request.params) {
      const atts = (request.params as { attachments?: MessageSendParams["attachments"] }).attachments;
      runtimeDeps.log.debug("message", "Attachments field detected", {
        isArray: Array.isArray(atts),
        count: Array.isArray(atts) ? atts.length : undefined,
      });
    } else {
      runtimeDeps.log.debug("message", "No attachments field in payload");
    }

    const preparedPrompt = await preparePromptWithAttachments({
      conversationId,
      promptText: userText,
      attachments: request.params.attachments,
      stateDir: request.stateDir,
      sttTranscribe: media.sttTranscribe,
      log: runtimeDeps.log,
      getAttachmentPromptLimits: media.getAttachmentPromptLimits,
      truncateTextForPrompt: media.truncateTextForPrompt,
    });

    void runAgentInBackground({
      ctx,
      queryRuntime,
      agent,
      conversationId,
      requestedAgentId,
      effectiveUserUuid,
      runId,
      userMessageTimestamp: userMessage.timestamp,
      userText,
      history,
      normalizedRoomContext,
      promptText: preparedPrompt.promptText,
      contentParts: preparedPrompt.contentParts,
      promptDeltas: preparedPrompt.promptDeltas,
      textAttachmentCount: preparedPrompt.textAttachmentCount,
      textAttachmentChars: preparedPrompt.textAttachmentChars,
      audioTranscriptChars: preparedPrompt.audioTranscriptChars,
      attachmentPromptLimits: preparedPrompt.attachmentPromptLimits,
      senderInfo: request.params.senderInfo,
      clientContext: request.params.clientContext,
      from: request.params.from,
    });

    return {
      type: "res",
      id: request.requestId,
      ok: true,
      payload: {
        conversationId,
        runId,
        messageMeta: io.toChatMessageMeta(userMessage.timestamp, true),
      },
    };
  });
}

function createAgent(input: {
  agentFactory: () => BelldandyAgent;
  agentRegistry?: AgentRegistry;
  requestedAgentId?: string;
  createOpts?: { modelOverride: string };
}): BelldandyAgent {
  try {
    if (input.agentRegistry && input.requestedAgentId) {
      return input.agentRegistry.create(input.requestedAgentId, input.createOpts);
    }
    if (input.agentRegistry) {
      return input.agentRegistry.create("default", input.createOpts);
    }
    return input.agentFactory();
  } catch (error: any) {
    if (error?.message === "CONFIG_REQUIRED") {
      throw new MessageSendConfigurationError();
    }
    throw error;
  }
}

export class MessageSendConfigurationError extends Error {
  constructor() {
    super("API Key or configuration missing.");
    this.name = "MessageSendConfigurationError";
  }
}

type MessageSendBackgroundInput = {
  ctx: MessageSendQueryRuntimeContext;
  queryRuntime: QueryRuntime<"message.send">;
  agent: BelldandyAgent;
  conversationId: string;
  requestedAgentId?: string;
  effectiveUserUuid?: string;
  runId: string;
  userMessageTimestamp: number;
  userText: string;
  history: Array<unknown>;
  normalizedRoomContext?: Record<string, unknown>;
  promptText: string;
  contentParts: Array<Record<string, unknown>>;
  promptDeltas: AgentPromptDelta[];
  textAttachmentCount: number;
  textAttachmentChars: number;
  audioTranscriptChars: number;
  attachmentPromptLimits: AttachmentPromptLimits;
  senderInfo?: unknown;
  clientContext?: MessageSendParams["clientContext"];
  from?: string;
};

type MessageSendLatestUsage = {
  inputTokens: number;
  outputTokens: number;
};

type MessageSendRunResult = Awaited<ReturnType<typeof runAgentWithLifecycle>>;

type MessageSendCompletionPolicy = {
  conversationId: string;
  runId: string;
  finalText: string;
  finalTimestampMs: number;
  statusBeforeFinal?: string;
  terminalStage: "completed" | "failed";
  terminalDetail: Record<string, unknown>;
  assistantPersistedDetail?: Record<string, unknown>;
  digestSource: string;
  digestWarningMessage: string;
};

type MessageSendBackgroundRunState = {
  run: {
    getLatestUsage: () => MessageSendLatestUsage | undefined;
    setLatestUsage: (usage: MessageSendLatestUsage | undefined) => void;
    hasEmittedTaskResult: () => boolean;
    markTaskResultEmitted: () => void;
    hasReceivedFinal: () => boolean;
    setReceivedFinal: (value: boolean) => void;
  };
  usageUpload: {
    getLastUploadedUsageTotal: () => number;
    setLastUploadedUsageTotal: (value: number) => void;
  };
};

async function preparePromptWithAttachments(input: {
  conversationId: string;
  promptText: string;
  attachments: MessageSendParams["attachments"];
  stateDir: string;
  sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
  log: QueryRuntimeLogger;
  getAttachmentPromptLimits: () => AttachmentPromptLimits;
  truncateTextForPrompt: (text: string, limit: number, suffix: string) => { text: string; truncated: boolean };
}): Promise<{
  promptText: string;
  contentParts: Array<Record<string, unknown>>;
  textAttachmentCount: number;
  textAttachmentChars: number;
  audioTranscriptChars: number;
  attachmentPromptLimits: AttachmentPromptLimits;
  promptDeltas: AgentPromptDelta[];
}> {
  let promptText = input.promptText;
  const contentParts: Array<Record<string, unknown>> = [];
  const attachmentPromptLimits = input.getAttachmentPromptLimits();
  let textAttachmentCount = 0;
  let textAttachmentChars = 0;
  let audioTranscriptChars = 0;
  const promptDeltas: AgentPromptDelta[] = [];

  if (!input.attachments || input.attachments.length === 0) {
    return {
      promptText,
      contentParts,
      textAttachmentCount,
      textAttachmentChars,
      audioTranscriptChars,
      attachmentPromptLimits,
      promptDeltas,
    };
  }

  input.log.debug("message", "Processing attachments", {
    count: input.attachments.length,
    conversationId: input.conversationId,
  });

  const attachmentDir = path.join(input.stateDir, "storage", "attachments", input.conversationId);
  await fs.mkdir(attachmentDir, { recursive: true });

  const attachmentPrompts: string[] = [];
  for (const [index, att] of input.attachments.entries()) {
    const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const savePath = path.join(attachmentDir, safeName);

    try {
      const buffer = Buffer.from(att.base64, "base64");
      await fs.writeFile(savePath, buffer);

      if (att.type.startsWith("image/")) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${att.type};base64,${att.base64}` },
        });
        attachmentPrompts.push(`\n[用户上传了图片: ${att.name}]`);
        promptDeltas.push(createPromptDelta({
          id: `attachment-image-${index + 1}`,
          deltaType: "attachment",
          role: "attachment",
          text: `[用户上传了图片: ${att.name}]`,
          metadata: { name: att.name, mime: att.type, kind: "image" },
        }));
        continue;
      }

      if (att.type.startsWith("video/")) {
        const absPath = path.resolve(savePath);
        contentParts.push({
          type: "video_url",
          video_url: { url: `file://${absPath}` },
        });
        attachmentPrompts.push(`\n[用户上传了视频: ${att.name}] (System Note: Video content has been injected via multimodal channel. Please analyze it directly.)`);
        promptDeltas.push(createPromptDelta({
          id: `attachment-video-${index + 1}`,
          deltaType: "attachment",
          role: "attachment",
          text: `[用户上传了视频: ${att.name}] (System Note: Video content has been injected via multimodal channel. Please analyze it directly.)`,
          metadata: { name: att.name, mime: att.type, kind: "video" },
        }));
        continue;
      }

      if (att.type.startsWith("audio/")) {
        const audioResult = await buildAudioAttachmentPrompt({
          attachment: att,
          buffer,
          promptText,
          audioTranscriptChars,
          textAttachmentChars,
          sttTranscribe: input.sttTranscribe,
          log: input.log,
          limits: attachmentPromptLimits,
          truncateTextForPrompt: input.truncateTextForPrompt,
        });
        promptText = audioResult.promptText;
        audioTranscriptChars = audioResult.audioTranscriptChars;
        attachmentPrompts.push(...audioResult.prompts);
        promptDeltas.push(...audioResult.promptDeltas);
        continue;
      }

      const isText = att.type.startsWith("text/")
        || att.name.endsWith(".md")
        || att.name.endsWith(".json")
        || att.name.endsWith(".js")
        || att.name.endsWith(".ts")
        || att.name.endsWith(".txt")
        || att.name.endsWith(".log");

      if (isText) {
        const content = buffer.toString("utf-8");
        const remainingChars = Math.max(
          0,
          attachmentPromptLimits.totalTextCharLimit - textAttachmentChars - audioTranscriptChars,
        );
        const fileCharLimit = Math.min(attachmentPromptLimits.textCharLimit, remainingChars);
        if (fileCharLimit <= 0) {
          attachmentPrompts.push(`\n[用户上传了文本附件: ${att.name}（因本次上下文预算已用尽，未注入全文）]`);
          continue;
        }
        const truncated = input.truncateTextForPrompt(content, fileCharLimit, "\n...[Truncated]");
        textAttachmentCount += 1;
        textAttachmentChars += truncated.text.length;
        if (truncated.truncated) {
          input.log.debug("message", "Text attachment truncated by char limit", {
            name: att.name,
            originalChars: content.length,
            keptChars: truncated.text.length,
            charLimit: attachmentPromptLimits.textCharLimit,
            totalCharLimit: attachmentPromptLimits.totalTextCharLimit,
            remainingChars,
          });
        }
        attachmentPrompts.push(`\n\n--- Attachment: ${att.name} ---\n${truncated.text}\n--- End of Attachment ---\n`);
        promptDeltas.push(createPromptDelta({
          id: `attachment-text-${index + 1}`,
          deltaType: "attachment",
          role: "attachment",
          text: `--- Attachment: ${att.name} ---\n${truncated.text}\n--- End of Attachment ---`,
          metadata: {
            name: att.name,
            mime: att.type,
            kind: "text",
            truncated: truncated.truncated,
          },
        }));
        continue;
      }

      attachmentPrompts.push(`\n[User uploaded a file: ${att.name} (type: ${att.type}), saved at: ${savePath}]`);
      promptDeltas.push(createPromptDelta({
        id: `attachment-file-${index + 1}`,
        deltaType: "attachment",
        role: "attachment",
        text: `[User uploaded a file: ${att.name} (type: ${att.type}), saved at: ${savePath}]`,
        metadata: { name: att.name, mime: att.type, kind: "file" },
      }));
    } catch (error) {
      input.log.error("message", `Failed to save attachment ${att.name}`, error);
      attachmentPrompts.push(`\n[Failed to upload file: ${att.name}]`);
      promptDeltas.push(createPromptDelta({
        id: `attachment-error-${index + 1}`,
        deltaType: "attachment",
        role: "attachment",
        text: `[Failed to upload file: ${att.name}]`,
        metadata: { name: att.name, mime: att.type, kind: "error" },
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
    attachmentPromptLimits,
    promptDeltas,
  };
}

async function buildAudioAttachmentPrompt(input: {
  attachment: NonNullable<MessageSendParams["attachments"]>[number];
  buffer: Buffer;
  promptText: string;
  audioTranscriptChars: number;
  textAttachmentChars: number;
  sttTranscribe?: (opts: TranscribeOptions) => Promise<TranscribeResult | null>;
  log: QueryRuntimeLogger;
  limits: AttachmentPromptLimits;
  truncateTextForPrompt: (text: string, limit: number, suffix: string) => { text: string; truncated: boolean };
}): Promise<{
  promptText: string;
  audioTranscriptChars: number;
  prompts: string[];
  promptDeltas: AgentPromptDelta[];
}> {
  const prompts: string[] = [];
  const promptDeltas: AgentPromptDelta[] = [];
  let promptText = input.promptText;
  let audioTranscriptChars = input.audioTranscriptChars;

  if (!input.sttTranscribe) {
    prompts.push(`\n[用户上传了音频: ${input.attachment.name}（STT未配置）]`);
    promptDeltas.push(createPromptDelta({
      id: `audio-transcript-${input.attachment.name}-unconfigured`,
      deltaType: "audio-transcript",
      role: "attachment",
      text: `[用户上传了音频: ${input.attachment.name}（STT未配置）]`,
      metadata: { name: input.attachment.name, mime: input.attachment.type, status: "stt-unconfigured" },
    }));
    return { promptText, audioTranscriptChars, prompts, promptDeltas };
  }

  input.log.debug("stt", "Transcribing audio attachment", { name: input.attachment.name });
  try {
    const sttResult = await input.sttTranscribe({
      buffer: input.buffer,
      fileName: input.attachment.name,
      mime: input.attachment.type,
    });
    if (!sttResult?.text) {
      prompts.push(`\n[用户上传了音频: ${input.attachment.name}（转录失败）]`);
      promptDeltas.push(createPromptDelta({
        id: `audio-transcript-${input.attachment.name}-failed`,
        deltaType: "audio-transcript",
        role: "attachment",
        text: `[用户上传了音频: ${input.attachment.name}（转录失败）]`,
        metadata: { name: input.attachment.name, mime: input.attachment.type, status: "empty" },
      }));
      return { promptText, audioTranscriptChars, prompts, promptDeltas };
    }

    input.log.debug("stt", "Audio transcribed", {
      name: input.attachment.name,
      textLength: sttResult.text.length,
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
      return { promptText, audioTranscriptChars, prompts, promptDeltas };
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
        metadata: { name: input.attachment.name, mime: input.attachment.type, status: "budget-exhausted" },
      }));
      return { promptText, audioTranscriptChars, prompts, promptDeltas };
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
        truncated: truncatedTranscript.truncated,
      },
    }));
    return { promptText, audioTranscriptChars, prompts, promptDeltas };
  } catch (error) {
    input.log.error("stt", `STT failed for ${input.attachment.name}`, error);
    prompts.push(`\n[用户上传了音频: ${input.attachment.name}（转录出错）]`);
    promptDeltas.push(createPromptDelta({
      id: `audio-transcript-${input.attachment.name}-error`,
      deltaType: "audio-transcript",
      role: "attachment",
      text: `[用户上传了音频: ${input.attachment.name}（转录出错）]`,
      metadata: { name: input.attachment.name, mime: input.attachment.type, status: "error" },
    }));
    return { promptText, audioTranscriptChars, prompts, promptDeltas };
  }
}

function buildMessageSendAgentRunInput(
  input: MessageSendBackgroundInput,
  media: MessageSendQueryRuntimeContext["media"],
): any {
  const runInput: any = {
    conversationId: input.conversationId,
    text: input.promptText,
    userInput: input.userText,
    history: input.history,
    agentId: input.requestedAgentId,
    userUuid: input.effectiveUserUuid,
    senderInfo: input.senderInfo,
    roomContext: input.normalizedRoomContext,
    meta: {
      runId: input.runId,
      currentMessageTime: {
        timestampMs: input.userMessageTimestamp,
        displayTimeText: media.formatLocalMessageTime(input.userMessageTimestamp),
        isLatest: true,
        role: "user",
        clientContext: input.clientContext,
      },
    },
  };

  const attachmentStats = buildMessageSendAttachmentStats(input);
  if (attachmentStats) {
    runInput.meta = {
      ...(runInput.meta ?? {}),
      attachmentStats,
    };
  }
  if (input.promptDeltas.length > 0) {
    runInput.meta = {
      ...(runInput.meta ?? {}),
      promptDeltas: input.promptDeltas.map((delta) => ({
        ...delta,
        ...(delta.metadata ? { metadata: { ...delta.metadata } } : {}),
      })),
    };
  }

  if (input.contentParts.length > 0) {
    runInput.content = [
      { type: "text", text: input.promptText },
      ...input.contentParts,
    ];
  }

  return runInput;
}

function buildMessageSendAttachmentStats(
  input: Pick<
    MessageSendBackgroundInput,
    "textAttachmentCount" | "textAttachmentChars" | "audioTranscriptChars" | "attachmentPromptLimits"
  >,
): Record<string, unknown> | undefined {
  if (input.textAttachmentCount <= 0 && input.audioTranscriptChars <= 0) {
    return undefined;
  }

  return {
    textAttachmentCount: input.textAttachmentCount,
    textAttachmentChars: input.textAttachmentChars,
    audioTranscriptChars: input.audioTranscriptChars,
    promptAugmentationChars: input.textAttachmentChars + input.audioTranscriptChars,
    textAttachmentTruncatedCharLimit: input.attachmentPromptLimits.textCharLimit,
    textAttachmentTotalCharLimit: input.attachmentPromptLimits.totalTextCharLimit,
    audioTranscriptAppendCharLimit: input.attachmentPromptLimits.audioTranscriptAppendCharLimit,
  };
}

function createMessageSendBackgroundRunState(): MessageSendBackgroundRunState {
  const runState: {
    latestUsage?: MessageSendLatestUsage;
    didEmitAutoRunTaskResult: boolean;
    receivedFinal: boolean;
  } = {
    latestUsage: undefined,
    didEmitAutoRunTaskResult: false,
    receivedFinal: false,
  };
  const usageUploadState = {
    lastUploadedUsageTotal: 0,
  };

  return {
    run: {
      getLatestUsage: () => runState.latestUsage,
      setLatestUsage: (usage) => {
        runState.latestUsage = usage;
      },
      hasEmittedTaskResult: () => runState.didEmitAutoRunTaskResult,
      markTaskResultEmitted: () => {
        runState.didEmitAutoRunTaskResult = true;
      },
      hasReceivedFinal: () => runState.receivedFinal,
      setReceivedFinal: (value) => {
        runState.receivedFinal = value;
      },
    },
    usageUpload: {
      getLastUploadedUsageTotal: () => usageUploadState.lastUploadedUsageTotal,
      setLastUploadedUsageTotal: (value) => {
        usageUploadState.lastUploadedUsageTotal = value;
      },
    },
  };
}

function emitMessageSendTaskResult(input: {
  ctx: MessageSendQueryRuntimeContext;
  queryRuntime: QueryRuntime<"message.send">;
  conversationId: string;
  durationMs: number;
  state: MessageSendBackgroundRunState;
}): void {
  const latestUsage = input.state.run.getLatestUsage();
  if (input.state.run.hasEmittedTaskResult() || !latestUsage) {
    return;
  }

  input.ctx.effects.emitAutoRunTaskTokenResult(
    input.ctx.runtime.conversationStore,
    {
      conversationId: input.conversationId,
      inputTokens: latestUsage.inputTokens,
      outputTokens: latestUsage.outputTokens,
      durationMs: input.durationMs,
    },
    input.ctx.request.ws,
  );
  input.queryRuntime.mark("task_result_recorded", {
    conversationId: input.conversationId,
    detail: {
      inputTokens: latestUsage.inputTokens,
      outputTokens: latestUsage.outputTokens,
    },
  });
  input.state.run.markTaskResultEmitted();
}

function handleMessageSendUsageEvent(input: {
  ctx: MessageSendQueryRuntimeContext;
  conversationId: string;
  runId: string;
  effectiveUserUuid?: string;
  from?: string;
  state: MessageSendBackgroundRunState;
  item: {
    systemPromptTokens: number;
    contextTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    modelCalls: number;
  };
}): void {
  const latestUsage = {
    inputTokens: Number(input.item.inputTokens ?? 0),
    outputTokens: Number(input.item.outputTokens ?? 0),
  };
  input.state.run.setLatestUsage(latestUsage);

  input.ctx.io.sendEvent(input.ctx.request.ws, {
    type: "event",
    event: "token.usage",
    payload: {
      conversationId: input.conversationId,
      runId: input.runId,
      systemPromptTokens: input.item.systemPromptTokens,
      contextTokens: input.item.contextTokens,
      inputTokens: input.item.inputTokens,
      outputTokens: input.item.outputTokens,
      cacheCreationTokens: input.item.cacheCreationTokens,
      cacheReadTokens: input.item.cacheReadTokens,
      modelCalls: input.item.modelCalls,
    },
  });

  let lastUploadedUsageTotal = input.state.usageUpload.getLastUploadedUsageTotal();
  if (input.ctx.effects.tokenUsageUploadConfig.enabled && input.effectiveUserUuid) {
    const usageTotal = Math.max(0, Number(input.item.inputTokens ?? 0) + Number(input.item.outputTokens ?? 0));
    const deltaTokens = Math.max(0, usageTotal - lastUploadedUsageTotal);
    if (usageTotal > lastUploadedUsageTotal) {
      lastUploadedUsageTotal = usageTotal;
    }
    if (deltaTokens > 0) {
      void uploadTokenUsage({
        config: input.ctx.effects.tokenUsageUploadConfig,
        userUuid: input.effectiveUserUuid,
        conversationId: input.conversationId,
        source: input.from ?? "webchat",
        deltaTokens,
        log: input.ctx.runtime.log,
      });
    }
  }
  input.state.usageUpload.setLastUploadedUsageTotal(lastUploadedUsageTotal);
}

function createMessageSendStreamAdapter(input: {
  ctx: MessageSendQueryRuntimeContext;
  queryRuntime: QueryRuntime<"message.send">;
  conversationId: string;
  runId: string;
  effectiveUserUuid?: string;
  from?: string;
  isTts: boolean;
  state: MessageSendBackgroundRunState;
}): {
  handlers: {
    onStatus: (item: { status: string }) => void;
    onToolCall: (item: { id: string; name: string; arguments?: unknown }) => void;
    onToolResult: (item: { id: string; name: string; success: boolean; output?: unknown; error?: string }) => void;
    onDelta: (item: { delta: string }) => void;
    onUsage: (item: {
      systemPromptTokens: number;
      contextTokens: number;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      modelCalls: number;
    }) => void;
  };
} {
  return {
    handlers: {
      onStatus: (item) => {
        input.ctx.io.sendEvent(input.ctx.request.ws, {
          type: "event",
          event: "agent.status",
          payload: {
            conversationId: input.conversationId,
            runId: input.runId,
            status: item.status,
          },
        });
      },
      onToolCall: (item) => {
        input.queryRuntime.mark("tool_call_emitted", {
          conversationId: input.conversationId,
          detail: {
            toolName: item.name,
          },
        });
        input.ctx.io.sendEvent(input.ctx.request.ws, {
          type: "event",
          event: "tool_call",
          payload: {
            conversationId: input.conversationId,
            runId: input.runId,
            id: item.id,
            name: item.name,
            arguments: item.arguments,
          },
        });
      },
      onToolResult: (item) => {
        input.queryRuntime.mark("tool_result_emitted", {
          conversationId: input.conversationId,
          detail: {
            toolName: item.name,
            success: item.success,
            hasError: Boolean(item.error),
          },
        });
        input.ctx.io.sendEvent(input.ctx.request.ws, {
          type: "event",
          event: "tool_result",
          payload: {
            conversationId: input.conversationId,
            runId: input.runId,
            id: item.id,
            name: item.name,
            success: item.success,
            output: typeof item.output === "string" && item.output.length > 500 ? item.output.slice(0, 500) + "\u2026" : item.output,
          },
        });
      },
      onDelta: (item) => {
        if (!input.isTts) {
          input.ctx.io.sendEvent(input.ctx.request.ws, {
            type: "event",
            event: "chat.delta",
            payload: {
              conversationId: input.conversationId,
              runId: input.runId,
              delta: item.delta,
            },
          });
        }
      },
      onUsage: (item) => {
        handleMessageSendUsageEvent({
          ctx: input.ctx,
          conversationId: input.conversationId,
          runId: input.runId,
          effectiveUserUuid: input.effectiveUserUuid,
          from: input.from,
          state: input.state,
          item,
        });
      },
    },
  };
}

function scheduleMessageSendDigestRefresh(input: {
  ctx: MessageSendQueryRuntimeContext;
  conversationId: string;
  source: string;
  warningMessage: string;
}): void {
  void input.ctx.effects.refreshConversationDigestAndBroadcast(
    input.ctx.runtime.conversationStore,
    {
      conversationId: input.conversationId,
      source: input.source,
    },
    input.ctx.io.broadcastEvent,
    input.ctx.effects.durableExtractionRuntime,
    input.ctx.effects.requestDurableExtraction,
    input.ctx.effects.memoryUsageAccounting,
    input.ctx.effects.memoryBudgetGuard,
  ).catch((error) => {
    input.ctx.runtime.log.warn("conversation.digest", input.warningMessage, {
      conversationId: input.conversationId,
      error: String(error),
    });
  });
}

function sanitizeMessageSendAssistantText(text: string): string {
  return text
    .replace(/<audio[^>]*>.*?<\/audio>/gi, "")
    .replace(/\[Download\]\([^)]*\/generated\/[^)]*\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emitMessageSendFinalFrame(input: {
  ctx: MessageSendQueryRuntimeContext;
  conversationId: string;
  runId: string;
  text: string;
  timestampMs: number;
}): void {
  input.ctx.io.sendEvent(input.ctx.request.ws, {
    type: "event",
    event: "chat.final",
    payload: {
      conversationId: input.conversationId,
      runId: input.runId,
      role: "assistant",
      text: input.text,
      messageMeta: input.ctx.io.toChatMessageMeta(input.timestampMs, true),
    },
  });
}

function applyMessageSendCompletionPolicy(input: {
  ctx: MessageSendQueryRuntimeContext;
  queryRuntime: QueryRuntime<"message.send">;
  policy: MessageSendCompletionPolicy;
}): void {
  const { ctx, queryRuntime, policy } = input;

  if (policy.statusBeforeFinal) {
    ctx.io.sendEvent(ctx.request.ws, {
      type: "event",
      event: "agent.status",
      payload: {
        conversationId: policy.conversationId,
        runId: policy.runId,
        status: policy.statusBeforeFinal,
      },
    });
  }

  if (policy.assistantPersistedDetail) {
    queryRuntime.mark("assistant_persisted", {
      conversationId: policy.conversationId,
      detail: policy.assistantPersistedDetail,
    });
  }

  queryRuntime.mark(policy.terminalStage, {
    conversationId: policy.conversationId,
    detail: policy.terminalDetail,
  });

  emitMessageSendFinalFrame({
    ctx,
    conversationId: policy.conversationId,
    runId: policy.runId,
    text: policy.finalText,
    timestampMs: policy.finalTimestampMs,
  });

  scheduleMessageSendDigestRefresh({
    ctx,
    conversationId: policy.conversationId,
    source: policy.digestSource,
    warningMessage: policy.digestWarningMessage,
  });
}

async function finalizeMessageSendSuccess(input: {
  ctx: MessageSendQueryRuntimeContext;
  queryRuntime: QueryRuntime<"message.send">;
  conversationId: string;
  runId: string;
  requestedAgentId?: string;
  runResult: MessageSendRunResult;
  state: MessageSendBackgroundRunState;
}): Promise<void> {
  const { ctx, queryRuntime, runResult } = input;
  let finalEventText = runResult.fullText;

  if ((ctx.media.ttsEnabled?.() ?? false) && runResult.fullText && ctx.media.ttsSynthesize) {
    ctx.io.sendEvent(ctx.request.ws, {
      type: "event",
      event: "agent.status",
      payload: {
        conversationId: input.conversationId,
        runId: input.runId,
        status: "generating_audio",
      },
    });
    const ttsResult = await ctx.media.ttsSynthesize(runResult.fullText);
    if (ttsResult) {
      finalEventText = ttsResult.htmlAudio + "\n\n" + runResult.fullText;
    }
  }

  if (!runResult.receivedFinal) {
    input.state.run.setReceivedFinal(false);
    queryRuntime.mark("completed", {
      conversationId: input.conversationId,
      detail: {
        receivedFinal: false,
      },
    });
    return;
  }
  input.state.run.setReceivedFinal(true);

  const sanitized = sanitizeMessageSendAssistantText(runResult.fullText);
  let assistantTimestamp = Date.now();
  if (sanitized || runResult.fullText) {
    const assistantMessage = ctx.runtime.conversationStore.addMessage(
      input.conversationId,
      "assistant",
      sanitized || runResult.fullText,
      {
        agentId: input.requestedAgentId,
        timestampMs: assistantTimestamp,
      },
    );
    assistantTimestamp = assistantMessage.timestamp;
    await ctx.runtime.conversationStore.waitForPendingPersistence(input.conversationId);
  }

  applyMessageSendCompletionPolicy({
    ctx,
    queryRuntime,
    policy: {
      conversationId: input.conversationId,
      runId: input.runId,
      finalText: finalEventText || runResult.fullText,
      finalTimestampMs: assistantTimestamp,
      terminalStage: "completed",
      terminalDetail: {
        receivedFinal: input.state.run.hasReceivedFinal(),
        response: "assistant_finalized",
      },
      assistantPersistedDetail: {
        assistantTimestampMs: assistantTimestamp,
        receivedFinal: input.state.run.hasReceivedFinal(),
      },
      digestSource: "message.send",
      digestWarningMessage: "Auto refresh after message.send failed",
    },
  });
}

function finalizeMessageSendFailure(input: {
  ctx: MessageSendQueryRuntimeContext;
  queryRuntime: QueryRuntime<"message.send">;
  conversationId: string;
  runId: string;
  error: unknown;
}): void {
  input.ctx.runtime.log.error("agent", "Agent run failed", input.error);

  const errorTimestamp = Date.now();
  applyMessageSendCompletionPolicy({
    ctx: input.ctx,
    queryRuntime: input.queryRuntime,
    policy: {
      conversationId: input.conversationId,
      runId: input.runId,
      finalText: `Error: ${String(input.error)}`,
      finalTimestampMs: errorTimestamp,
      statusBeforeFinal: "error",
      terminalStage: "failed",
      terminalDetail: {
        error: input.error instanceof Error ? input.error.message : String(input.error),
      },
      digestSource: "message.error",
      digestWarningMessage: "Auto refresh after message failure failed",
    },
  });
}

async function runAgentInBackground(input: MessageSendBackgroundInput): Promise<void> {
  const { ctx, queryRuntime } = input;
  const state = createMessageSendBackgroundRunState();

  try {
    queryRuntime.mark("agent_running", {
      conversationId: input.conversationId,
      detail: {
        historyLength: input.history.length,
      },
    });

    const runInput = buildMessageSendAgentRunInput(input, ctx.media);
    const isTts = ctx.media.ttsEnabled?.() ?? false;
    const streamAdapter = createMessageSendStreamAdapter({
      ctx,
      queryRuntime,
      conversationId: input.conversationId,
      runId: input.runId,
      effectiveUserUuid: input.effectiveUserUuid,
      from: input.from,
      isTts,
      state,
    });
    const runResult = await runAgentWithLifecycle(input.agent, {
      conversationId: input.conversationId,
      runInput,
      onStatus: streamAdapter.handlers.onStatus,
      onToolEvent: (detail) => {
        queryRuntime.mark("tool_event_emitted", {
          conversationId: input.conversationId,
          detail,
        });
      },
      onToolCall: streamAdapter.handlers.onToolCall,
      onToolResult: streamAdapter.handlers.onToolResult,
      onDelta: streamAdapter.handlers.onDelta,
      onUsage: streamAdapter.handlers.onUsage,
      onFailed: (detail) => {
        emitMessageSendTaskResult({
          ctx,
          queryRuntime,
          conversationId: input.conversationId,
          durationMs: detail.durationMs,
          state,
        });
      },
    });

    state.run.setReceivedFinal(runResult.receivedFinal);
    emitMessageSendTaskResult({
      ctx,
      queryRuntime,
      conversationId: input.conversationId,
      durationMs: runResult.durationMs,
      state,
    });

    await finalizeMessageSendSuccess({
      ctx,
      queryRuntime,
      conversationId: input.conversationId,
      runId: input.runId,
      requestedAgentId: input.requestedAgentId,
      runResult,
      state,
    });
  } catch (error) {
    finalizeMessageSendFailure({
      ctx,
      queryRuntime,
      conversationId: input.conversationId,
      runId: input.runId,
      error,
    });
  }
}
