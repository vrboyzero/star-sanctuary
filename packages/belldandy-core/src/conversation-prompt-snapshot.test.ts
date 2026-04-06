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

test("renderConversationPromptSnapshotText includes explainability sidecar when provided", () => {
  const artifact: ConversationPromptSnapshotArtifact = {
    schemaVersion: 1,
    manifest: {
      conversationId: "agent:coder:main",
      runId: "run-2",
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
    },
  };

  const rendered = renderConversationPromptSnapshotText(artifact, {
    residentStateBinding: {
      workspaceScopeSummary: "custom workspace scope (repo-a) rooted at E:/state/workspaces/repo-a",
      stateScopeSummary: "private=E:/state/workspaces/repo-a/agents/coder; sessions=E:/state/workspaces/repo-a/agents/coder/sessions; shared=E:/state/workspaces/repo-a/team-memory",
    },
    launchExplainability: {
      catalogDefault: {
        role: "coder",
        permissionMode: "confirm",
        allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
        maxToolRiskLevel: "high",
        handoffStyle: "structured",
      },
      effectiveLaunch: {
        source: "catalog_default",
        agentId: "coder",
        profileId: "coder",
        role: "coder",
        permissionMode: "confirm",
        allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
        maxToolRiskLevel: "high",
        handoffStyle: "structured",
      },
    },
  });

  expect(rendered).toContain("Resident State Binding");
  expect(rendered).toContain("workspace scope: custom workspace scope (repo-a) rooted at E:/state/workspaces/repo-a");
  expect(rendered).toContain("Launch Explainability");
  expect(rendered).toContain("catalog default: role=coder");
  expect(rendered).toContain("effective launch: source=catalog_default, agent=coder");
});
