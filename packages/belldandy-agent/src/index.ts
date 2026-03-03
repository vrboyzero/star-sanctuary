import type { JsonObject } from "@belldandy/protocol";

export { OpenAIChatAgent, type OpenAIChatAgentOptions } from "./openai.js";
export { ToolEnabledAgent, type ToolEnabledAgentOptions } from "./tool-agent.js";

// Failover（模型容灾）
export {
  FailoverClient,
  loadModelFallbacks,
  classifyFailoverReason,
  isRetryableReason,
  type ModelProfile,
  type FailoverReason,
  type FailoverAttempt,
  type FailoverResult,
  type FailoverLogger,
  type ModelConfigFile,
} from "./failover-client.js";

// Workspace & System Prompt (SOUL/Persona)
export {
  ensureWorkspace,
  loadWorkspaceFiles,
  ensureAgentWorkspace,
  loadAgentWorkspaceFiles,
  needsBootstrap,
  createBootstrapFile,
  removeBootstrapFile,
  extractIdentityInfo,
  SOUL_FILENAME,
  IDENTITY_FILENAME,
  USER_FILENAME,
  BOOTSTRAP_FILENAME,
  AGENTS_FILENAME,
  TOOLS_FILENAME,
  HEARTBEAT_FILENAME,
  type WorkspaceFile,
  type WorkspaceFileName,
  type WorkspaceLoadResult,
  type IdentityInfo,
} from "./workspace.js";

export {
  buildSystemPrompt,
  buildWorkspaceContext,
  type SystemPromptParams,
} from "./system-prompt.js";

export {
  ConversationStore,
  type Conversation,
  type ConversationMessage,
  type ConversationStoreOptions,
} from "./conversation.js";

export type AgentContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }; // url format: "data:image/jpeg;base64,{base64_image}"

/** 消息发送者信息 */
export type SenderInfo = {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string; // Agent的身份标签（如：舰长、CEO）
};

/** 房间成员信息 */
export type RoomMember = {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string; // Agent的身份标签
};

/** 房间上下文信息 */
export type RoomContext = {
  roomId?: string;
  environment: "local" | "community"; // 本地WebChat vs office.goddess.ai社区
  members?: RoomMember[];
};

export type AgentRunInput = {
  conversationId: string;
  /**
   * Legacy text field. If `content` is provided, it takes precedence.
   * If only `text` is provided, it will be treated as `{ type: "text", text }`.
   */
  text: string;
  /**
   * Multimodal content parts (text, image, etc).
   * Compatible with OpenAI's content array format.
   */
  content?: string | Array<AgentContentPart>;
  meta?: JsonObject;
  /** 当前 Agent ID（传递给 ToolExecutor 用于 per-agent workspace 定位） */
  agentId?: string;
  /** 对话历史（role 必须是 user 或 assistant） */
  history?: Array<{ role: "user" | "assistant"; content: string | Array<AgentContentPart> }>;
  /** 用户UUID（用于身份权力验证） */
  userUuid?: string;
  /** 消息发送者信息（用于身份上下文） */
  senderInfo?: SenderInfo;
  /** 房间上下文信息（用于多人聊天场景） */
  roomContext?: RoomContext;
};

export type AgentDelta = {
  type: "delta";
  delta: string;
};

export type AgentFinal = {
  type: "final";
  text: string;
};

export type AgentStatus = {
  type: "status";
  status: "running" | "done" | "error";
};

export type AgentToolCall = {
  type: "tool_call";
  id: string;
  name: string;
  arguments: JsonObject;
};

export type AgentToolResult = {
  type: "tool_result";
  id: string;
  name: string;
  success: boolean;
  output: string;
  error?: string;
};

export type AgentUsage = {
  type: "usage";
  /** 系统提示词 token 估算 */
  systemPromptTokens: number;
  /** 上下文（历史+当前消息）token 估算 */
  contextTokens: number;
  /** API 实际 input tokens（ReAct 循环累加） */
  inputTokens: number;
  /** API 实际 output tokens（ReAct 循环累加） */
  outputTokens: number;
  /** Anthropic cache 创建 tokens */
  cacheCreationTokens: number;
  /** Anthropic cache 读取 tokens */
  cacheReadTokens: number;
  /** 本次 run 的模型调用次数 */
  modelCalls: number;
};

export type AgentStreamItem =
  | AgentDelta
  | AgentFinal
  | AgentStatus
  | AgentToolCall
  | AgentToolResult
  | AgentUsage;

export interface BelldandyAgent {
  run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}

export class MockAgent implements BelldandyAgent {
  async *run(input: AgentRunInput): AsyncIterable<AgentStreamItem> {
    yield { type: "status", status: "running" };
    const response = `Belldandy(MVP) 收到：${input.text}`;
    const chunks = splitText(response, 6);
    let out = "";
    for (const delta of chunks) {
      out += delta;
      await sleep(60);
      yield { type: "delta", delta };
    }
    yield { type: "final", text: out };
    yield { type: "status", status: "done" };
  }
}

function splitText(text: string, size: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + Math.max(1, size)));
    i += Math.max(1, size);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 钩子系统
export * from "./hooks.js";
export { createHookRunner, type HookRunner, type HookRunnerLogger, type HookRunnerOptions } from "./hook-runner.js";

// 多模态预处理（视频上传等）
export { buildUrl, uploadFileToMoonshot, preprocessMultimodalContent, type PreprocessResult, type VideoUploadConfig } from "./multimodal.js";

// Anthropic 原生协议支持（prompt caching、消息/工具转换）
export {
  convertMessagesToAnthropic,
  convertToolsToAnthropic,
  buildAnthropicRequest,
  parseAnthropicResponse,
  type AnthropicUsage,
  type AnthropicRequestPayload,
  type ParsedAnthropicResponse,
} from "./anthropic.js";

// Agent Profile（多 Agent 预备）
export {
  buildDefaultProfile,
  loadAgentProfiles,
  resolveModelConfig,
  type AgentProfile,
  type AgentConfigFile,
} from "./agent-profile.js";

// Agent Registry（多 Agent 注册表）
export {
  AgentRegistry,
  type AgentFactoryFn,
  type AgentCreateOptions,
} from "./agent-registry.js";

// Sub-Agent Orchestrator（子 Agent 编排）
export {
  SubAgentOrchestrator,
  type SubAgentSession,
  type SubAgentSessionStatus,
  type SubAgentEvent,
  type SpawnOptions,
  type SpawnResult,
  type OrchestratorOptions,
  type OrchestratorLogger,
  type OrchestratorHookRunner,
} from "./orchestrator.js";

// 对话压缩
export {
  compactMessages,
  compactIncremental,
  needsCompaction,
  needsInLoopCompaction,
  estimateTokens,
  estimateMessagesTokens,
  createEmptyCompactionState,
  type CompactionOptions,
  type CompactionResult,
  type CompactionState,
  type SummarizerFn,
} from "./compaction.js";
