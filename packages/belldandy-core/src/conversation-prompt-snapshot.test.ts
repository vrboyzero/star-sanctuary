import { expect, test } from "vitest";

import { renderConversationPromptSnapshotText, type ConversationPromptSnapshotArtifact } from "./conversation-prompt-snapshot.js";

test("renderConversationPromptSnapshotText includes resident metadata summary when present", () => {
  const artifact: ConversationPromptSnapshotArtifact = {
    schemaVersion: 1,
    manifest: {
      conversationId: "agent:coder:main",
      runId: "run-1",
      agentId: "coder",
      createdAt: 123,
      persistedAt: 456,
      source: "runtime.prompt_snapshot",
    },
    summary: {
      messageCount: 1,
      systemPromptChars: 18,
      includesHookSystemPrompt: false,
      hasPrependContext: false,
      deltaCount: 0,
      deltaChars: 0,
      systemPromptEstimatedTokens: 5,
      deltaEstimatedTokens: 0,
      providerNativeSystemBlockCount: 0,
      providerNativeSystemBlockChars: 0,
      providerNativeSystemBlockEstimatedTokens: 0,
      tokenBreakdown: {
        systemPromptEstimatedChars: 18,
        systemPromptEstimatedTokens: 5,
        sectionEstimatedChars: 0,
        sectionEstimatedTokens: 0,
        droppedSectionEstimatedChars: 0,
        droppedSectionEstimatedTokens: 0,
        deltaEstimatedChars: 0,
        deltaEstimatedTokens: 0,
        providerNativeSystemBlockEstimatedChars: 0,
        providerNativeSystemBlockEstimatedTokens: 0,
      },
    },
    snapshot: {
      systemPrompt: "system prompt body",
      messages: [{ role: "system", content: "system prompt body" }],
      hookSystemPromptUsed: false,
      inputMeta: {
        residentProfile: {
          memoryMode: "hybrid",
          sessionNamespace: "coder-main",
        },
        memoryPolicy: {
          writeTarget: "private",
          readTargets: ["private", "shared"],
        },
      },
    },
  };

  const rendered = renderConversationPromptSnapshotText(artifact);
  expect(rendered).toContain("Resident Metadata");
  expect(rendered).toContain("\"memoryMode\": \"hybrid\"");
  expect(rendered).toContain("\"writeTarget\": \"private\"");
});
