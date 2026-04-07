import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  getConversationPromptSnapshotDirectory,
  persistConversationPromptSnapshot,
  renderConversationPromptSnapshotText,
  type ConversationPromptSnapshotArtifact,
} from "./conversation-prompt-snapshot.js";

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

test("persistConversationPromptSnapshot keeps only the latest persisted runs per regular conversation", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-prompt-snapshot-regular-"));
  const conversationId = "agent-default-main";

  try {
    for (let index = 1; index <= 22; index += 1) {
      await persistConversationPromptSnapshot({
        stateDir,
        snapshot: buildSnapshot({
          conversationId,
          runId: `run-${index}`,
          createdAt: index,
        }),
      });
    }

    const files = await fs.readdir(getConversationPromptSnapshotDirectory(stateDir, conversationId));
    expect(files).toHaveLength(20);
    expect(files).not.toContain("run-run-1.prompt-snapshot.json");
    expect(files).not.toContain("run-run-2.prompt-snapshot.json");
    expect(files).toContain("run-run-22.prompt-snapshot.json");
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});

test("persistConversationPromptSnapshot keeps only the latest persisted heartbeat snapshots globally", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-prompt-snapshot-heartbeat-"));

  try {
    for (let index = 1; index <= 7; index += 1) {
      await persistConversationPromptSnapshot({
        stateDir,
        snapshot: buildSnapshot({
          conversationId: `heartbeat-${index}`,
          runId: `heartbeat-run-${index}`,
          createdAt: index,
        }),
      });
    }

    await expect(fs.access(getConversationPromptSnapshotDirectory(stateDir, "heartbeat-1"))).rejects.toThrow();
    await expect(fs.access(getConversationPromptSnapshotDirectory(stateDir, "heartbeat-2"))).rejects.toThrow();

    for (let index = 3; index <= 7; index += 1) {
      const files = await fs.readdir(getConversationPromptSnapshotDirectory(stateDir, `heartbeat-${index}`));
      expect(files).toHaveLength(1);
      expect(files[0]).toBe(`run-heartbeat-run-${index}.prompt-snapshot.json`);
    }
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});

test("persistConversationPromptSnapshot removes aged prompt snapshots based on retention days", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-prompt-snapshot-age-"));
  const oldConversationId = "agent-old";
  const currentConversationId = "agent-current";
  const now = Date.now();
  const tenDaysAgo = new Date(now - (10 * 24 * 60 * 60 * 1000));

  try {
    const oldPersisted = await persistConversationPromptSnapshot({
      stateDir,
      snapshot: buildSnapshot({
        conversationId: oldConversationId,
        runId: "run-old",
        createdAt: 1,
      }),
      retention: {
        maxAgeDays: 30,
      },
    });
    await fs.utimes(oldPersisted.outputPath, tenDaysAgo, tenDaysAgo);

    await persistConversationPromptSnapshot({
      stateDir,
      snapshot: buildSnapshot({
        conversationId: currentConversationId,
        runId: "run-current",
        createdAt: 2,
      }),
      retention: {
        defaultMaxRunsPerConversation: 20,
        heartbeatMaxRuns: 5,
        maxAgeDays: 7,
        now,
      },
    });

    await expect(fs.access(oldPersisted.outputPath)).rejects.toThrow();
    await expect(fs.access(getConversationPromptSnapshotDirectory(stateDir, oldConversationId))).rejects.toThrow();
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});

function buildSnapshot(input: {
  conversationId: string;
  runId: string;
  createdAt: number;
}) {
  return {
    agentId: "default",
    conversationId: input.conversationId,
    runId: input.runId,
    createdAt: input.createdAt,
    systemPrompt: `system:${input.runId}`,
    messages: [{ role: "system" as const, content: `system:${input.runId}` }],
  };
}
