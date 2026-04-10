import type { AgentPromptDelta, BeforeAgentStartResult } from "@belldandy/agent";

import { parseGoalSessionKey } from "./goals/session.js";
import { buildMindProfileRuntimeDigest } from "./mind-profile-runtime-digest.js";
import { buildMindProfileSnapshot } from "./mind-profile-snapshot.js";
import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";

type MindProfileRuntimeSessionKind = "main" | "goal" | "goal_node";

export type MindProfileRuntimePreludeConfig = {
  enabled: boolean;
  maxLines: number;
  maxLineLength: number;
  maxChars: number;
  minSignalCount: number;
};

function truncateText(value: string | undefined, maxLength = 72): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function resolveSessionKind(sessionKey?: string): MindProfileRuntimeSessionKind {
  const goalSession = parseGoalSessionKey(sessionKey);
  if (goalSession?.kind === "goal") return "goal";
  if (goalSession?.kind === "goal_node") return "goal_node";
  return "main";
}

function createMindProfileRuntimeDelta(input: {
  text: string;
  lineCount: number;
  metadata?: Record<string, unknown>;
}): AgentPromptDelta {
  return {
    id: "mind-profile-runtime",
    deltaType: "user-prelude",
    role: "user-prelude",
    source: "mind-profile-runtime",
    text: input.text,
    metadata: {
      blockTag: "mind-profile-runtime",
      lineCount: input.lineCount,
      ...(input.metadata ?? {}),
    },
  };
}

export async function buildMindProfileRuntimePrelude(input: {
  stateDir: string;
  agentId?: string;
  sessionKey?: string;
  currentTurnText?: string;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  config: MindProfileRuntimePreludeConfig;
}): Promise<BeforeAgentStartResult | undefined> {
  const sessionKind = resolveSessionKind(input.sessionKey);
  if (!input.config.enabled || sessionKind !== "main") {
    return undefined;
  }

  const mindProfileSnapshot = await buildMindProfileSnapshot({
    stateDir: input.stateDir,
    residentMemoryManagers: input.residentMemoryManagers,
    agentId: input.agentId,
  });
  const digest = buildMindProfileRuntimeDigest(mindProfileSnapshot, {
    maxLines: input.config.maxLines,
    maxLineLength: input.config.maxLineLength,
    maxChars: input.config.maxChars,
  });
  if (!digest.summary.available || digest.summary.signalCount < input.config.minSignalCount) {
    return undefined;
  }

  const block = `<mind-profile-runtime hint="以下是稳定用户画像与长期记忆的运行时摘要，只作为当前会话的背景锚点；若与当前请求无关，不要机械复述。">\n${digest.lines.map((line) => `- ${line}`).join("\n")}\n</mind-profile-runtime>`;
  return {
    prependContext: block,
    deltas: [
      createMindProfileRuntimeDelta({
        text: block,
        lineCount: digest.summary.lineCount,
        metadata: {
          agentId: input.agentId?.trim() || "default",
          sessionKind,
          signalCount: digest.summary.signalCount,
          charCount: digest.summary.charCount,
          includedSignals: digest.summary.includedSignals,
          headline: digest.summary.headline,
          currentTurnPreview: truncateText(input.currentTurnText, 96) || undefined,
        },
      }),
    ],
  };
}
