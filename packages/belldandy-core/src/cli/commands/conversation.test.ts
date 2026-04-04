import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConversationStore } from "@belldandy/agent";
import { afterEach, expect, test, vi } from "vitest";

import exportCommand from "./conversation/export.js";
import exportsCommand from "./conversation/exports.js";
import listCommand from "./conversation/list.js";
import promptSnapshotCommand from "./conversation/prompt-snapshot.js";
import timelineCommand from "./conversation/timeline.js";
import {
  getConversationPromptSnapshotArtifactPath,
  loadConversationPromptSnapshotArtifact,
  persistConversationPromptSnapshot,
  renderConversationPromptSnapshotText,
} from "../../conversation-prompt-snapshot.js";

afterEach(() => {
  vi.restoreAllMocks();
});

test("bdd conversation export applies filters and stable output-dir naming", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const store = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "cli-export-conversation";
  store.addMessage(conversationId, "user", "hello export");
  store.addMessage(conversationId, "assistant", "hello export back");
  await store.waitForPendingPersistence(conversationId);
  const outputDir = path.join(stateDir, "artifacts");

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await exportCommand.run?.({
      args: {
        "state-dir": stateDir,
        "conversation-id": conversationId,
        mode: "metadata_only",
        "event-types": "assistant_message_finalized",
        "restore-view": "canonical",
        pretty: true,
        json: true,
        "output-dir": outputDir,
      },
    } as never);

    expect(logSpy).toHaveBeenCalled();
    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.output).toContain(`conversation-${conversationId}.transcript.metadata_only.json`);

    const written = JSON.parse(await fs.promises.readFile(parsed.output, "utf-8"));
    expect(written.manifest).toMatchObject({
      conversationId,
      redactionMode: "metadata_only",
    });
    expect(written.events).toHaveLength(1);
    expect(written.projectionFilter).toMatchObject({
      eventTypes: ["assistant_message_finalized"],
      restoreView: "canonical",
    });
    expect(written.restore.rawMessages).toEqual([]);
    expect(written.restore.compactedView).toEqual([]);
    expect(written.restore.canonicalExtractionView).toHaveLength(2);
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd conversation timeline applies kind filter and stable directory output", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const store = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "cli-timeline-conversation";
  store.addMessage(conversationId, "user", "timeline message one");
  store.addMessage(conversationId, "assistant", "timeline message two");
  await store.waitForPendingPersistence(conversationId);
  const outputDir = path.join(stateDir, "artifacts");

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await timelineCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
        "conversation-id": conversationId,
        "preview-chars": "32",
        kinds: "restore_result",
        limit: "1",
        "output-dir": outputDir,
      },
    } as never);

    expect(logSpy).toHaveBeenCalled();
    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.output).toContain(`conversation-${conversationId}.timeline.json`);

    const written = JSON.parse(await fs.promises.readFile(parsed.output, "utf-8"));
    expect(written.manifest).toMatchObject({
      conversationId,
      source: "conversation.timeline.get",
    });
    expect(written.items).toHaveLength(1);
    expect(written.items[0]?.kind).toBe("restore_result");
    expect(written.projectionFilter).toMatchObject({
      kinds: ["restore_result"],
      limit: 1,
    });
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd conversation list returns exportable conversations filtered by prefix", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const store = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  store.addMessage("conv-list-a", "user", "A");
  store.addMessage("conv-list-b", "user", "B");
  store.addMessage("other-c", "user", "C");
  await store.waitForPendingPersistence("conv-list-a");
  await store.waitForPendingPersistence("conv-list-b");
  await store.waitForPendingPersistence("other-c");

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await listCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
        "conversation-id-prefix": "conv-list-",
        limit: "2",
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations.every((item: any) => String(item.conversationId).startsWith("conv-list-"))).toBe(true);
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd conversation exports returns recent export index filtered by prefix", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const store = new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
  const conversationId = "conv-export-index";
  store.addMessage(conversationId, "user", "hello export index");
  await store.waitForPendingPersistence(conversationId);
  const outputDir = path.join(stateDir, "artifacts");
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  try {
    await exportCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
        "conversation-id": conversationId,
        "output-dir": outputDir,
      },
    } as never);
    logSpy.mockClear();

    await exportsCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
        "conversation-id-prefix": "conv-export-",
        limit: "5",
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.exports).toHaveLength(1);
    expect(parsed.exports[0]).toMatchObject({
      conversationId,
      artifact: "transcript",
      format: "json",
    });
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd conversation prompt-snapshot exports persisted prompt snapshot and records export index", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const conversationId = "conv-prompt-snapshot-cli";
  const runId = "run-cli-1";
  const outputDir = path.join(stateDir, "artifacts");
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  await persistConversationPromptSnapshot({
    stateDir,
    snapshot: {
      agentId: "default",
      conversationId,
      runId,
      createdAt: 1712000000000,
      systemPrompt: "hook-system-prompt\n## Identity Context (Runtime)\n- Current User UUID: test-user",
      messages: [
        { role: "system", content: "hook-system-prompt\n## Identity Context (Runtime)\n- Current User UUID: test-user" },
        { role: "user", content: "hello" },
      ],
      hookSystemPromptUsed: true,
      prependContext: "<recent-memory>ctx</recent-memory>",
      deltas: [
        {
          id: "prepend-context",
          deltaType: "user-prelude",
          role: "user-prelude",
          text: "<recent-memory>ctx</recent-memory>",
        },
        {
          id: "runtime-identity-context",
          deltaType: "runtime-identity",
          role: "system",
          text: "## Identity Context (Runtime)\n- Current User UUID: test-user",
        },
      ],
      providerNativeSystemBlocks: [
        {
          id: "provider-native-static-capability",
          blockType: "static-capability",
          text: "hook-system-prompt",
          sourceSectionIds: [],
          sourceDeltaIds: [],
          cacheControlEligible: true,
        },
        {
          id: "provider-native-dynamic-runtime",
          blockType: "dynamic-runtime",
          text: "## Identity Context (Runtime)\n- Current User UUID: test-user",
          sourceSectionIds: [],
          sourceDeltaIds: ["runtime-identity-context"],
          cacheControlEligible: false,
        },
      ],
      inputMeta: {
        truncationReason: {
          code: "max_chars_limit",
          maxChars: 1200,
          droppedSectionCount: 2,
          droppedSectionIds: ["methodology", "workspace-dir"],
          droppedSectionLabels: ["methodology", "workspace-dir"],
          message: "Dropped methodology, workspace-dir to fit 1200 char limit.",
        },
      },
    },
  });

  try {
    await promptSnapshotCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
        "conversation-id": conversationId,
        "run-id": runId,
        "output-dir": outputDir,
      },
    } as never);

    const output = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = JSON.parse(output);
    expect(parsed.output).toContain(`conversation-${conversationId}.prompt_snapshot.${runId}.json`);

    const written = JSON.parse(await fs.promises.readFile(parsed.output, "utf-8"));
    expect(written.manifest).toMatchObject({
      conversationId,
      runId,
      source: "runtime.prompt_snapshot",
    });
    expect(written.summary).toMatchObject({
      includesHookSystemPrompt: true,
      hasPrependContext: true,
      deltaCount: 2,
      deltaEstimatedTokens: expect.any(Number),
      systemPromptEstimatedTokens: expect.any(Number),
      providerNativeSystemBlockCount: 2,
      providerNativeSystemBlockEstimatedTokens: expect.any(Number),
    });
    expect(written.snapshot.deltas).toHaveLength(2);
    expect(written.snapshot.deltas[0]).toMatchObject({
      estimatedChars: expect.any(Number),
      estimatedTokens: expect.any(Number),
    });
    expect(written.snapshot.providerNativeSystemBlocks).toHaveLength(2);
    expect(written.snapshot.providerNativeSystemBlocks[0]).toMatchObject({
      estimatedChars: expect.any(Number),
      estimatedTokens: expect.any(Number),
    });

    logSpy.mockClear();
    await exportsCommand.run?.({
      args: {
        json: true,
        "state-dir": stateDir,
        "conversation-id-prefix": "conv-prompt-",
        limit: "5",
      },
    } as never);
    const exportsOutput = String(logSpy.mock.calls.at(-1)?.[0] ?? "");
    const exportsParsed = JSON.parse(exportsOutput);
    expect(exportsParsed.exports).toHaveLength(1);
    expect(exportsParsed.exports[0]).toMatchObject({
      conversationId,
      artifact: "prompt_snapshot",
      format: "json",
    });
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd conversation prompt-snapshot text output includes token breakdown", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const conversationId = "conv-prompt-snapshot-cli-text";
  const runId = "run-cli-text-1";
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  await persistConversationPromptSnapshot({
    stateDir,
    snapshot: {
      agentId: "default",
      conversationId,
      runId,
      createdAt: 1712000000000,
      systemPrompt: "hook-system-prompt",
      messages: [
        { role: "system", content: "hook-system-prompt" },
        { role: "user", content: "hello" },
      ],
      hookSystemPromptUsed: true,
      deltas: [
        {
          id: "attachment-1",
          deltaType: "attachment",
          role: "attachment",
          text: "[Attachment]",
        },
      ],
      providerNativeSystemBlocks: [
        {
          id: "provider-native-static-capability",
          blockType: "static-capability",
          text: "hook-system-prompt",
          sourceSectionIds: [],
          sourceDeltaIds: [],
          cacheControlEligible: true,
        },
      ],
      inputMeta: {
        truncationReason: {
          code: "max_chars_limit",
          maxChars: 1200,
          droppedSectionCount: 2,
          droppedSectionIds: ["methodology", "workspace-dir"],
          droppedSectionLabels: ["methodology", "workspace-dir"],
          message: "Dropped methodology, workspace-dir to fit 1200 char limit.",
        },
      },
    },
  });

  try {
    await promptSnapshotCommand.run?.({
      args: {
        "state-dir": stateDir,
        "conversation-id": conversationId,
        "run-id": runId,
      },
    } as never);

    const output = String(logSpy.mock.calls.map((call) => String(call[0] ?? "")).join("\n"));
    expect(output).toContain("Prompt Observability");
    expect(output).toContain("systemPromptEstimatedTokens:");
    expect(output).toContain("deltaEstimatedTokens:");
    expect(output).toContain("providerNativeSystemBlockEstimatedTokens:");
    expect(output).toContain("includesHookSystemPrompt: yes");
    expect(output).toContain("providerNativeSystemBlockCount: 1");
    expect(output).toContain("truncationReasonCode: max_chars_limit");
    expect(output).toContain("truncationDroppedSectionIds: methodology, workspace-dir");
    expect(output).toContain("estimatedTokens=");
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("bdd conversation prompt-snapshot load normalizes legacy inputMeta fields without rewriting history files", async () => {
  const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-cli-conversation-"));
  const conversationId = "conv-prompt-snapshot-legacy-normalize";
  const runId = "run-legacy-normalize-1";
  const artifactPath = getConversationPromptSnapshotArtifactPath({
    stateDir,
    conversationId,
    runId,
  });
  const promptTokenBreakdown = {
    systemPromptEstimatedChars: 18,
    systemPromptEstimatedTokens: 5,
    sectionEstimatedChars: 18,
    sectionEstimatedTokens: 5,
    droppedSectionEstimatedChars: 32,
    droppedSectionEstimatedTokens: 8,
    deltaEstimatedChars: 42,
    deltaEstimatedTokens: 11,
    providerNativeSystemBlockEstimatedChars: 0,
    providerNativeSystemBlockEstimatedTokens: 0,
  };
  const truncationReason = {
    code: "max_chars_limit",
    maxChars: 1200,
    droppedSectionCount: 1,
    droppedSectionIds: ["methodology"],
    droppedSectionLabels: ["methodology"],
    message: "Dropped methodology to fit 1200 char limit.",
  };

  try {
    await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.promises.writeFile(artifactPath, JSON.stringify({
      schemaVersion: 1,
      manifest: {
        conversationId,
        runId,
        agentId: "default",
        createdAt: 1712000003000,
        persistedAt: 1712000003001,
        source: "runtime.prompt_snapshot",
      },
      summary: {
        messageCount: 2,
        systemPromptChars: 79,
        includesHookSystemPrompt: false,
        hasPrependContext: true,
        deltaCount: 0,
        deltaChars: 0,
        systemPromptEstimatedTokens: 5,
        deltaEstimatedTokens: 11,
        providerNativeSystemBlockCount: 0,
        providerNativeSystemBlockChars: 0,
        providerNativeSystemBlockEstimatedTokens: 0,
      },
      snapshot: {
        systemPrompt: "legacy system prompt\n## Identity Context (Runtime)\n- Current User UUID: test-user",
        messages: [
          { role: "system", content: "legacy system prompt\n## Identity Context (Runtime)\n- Current User UUID: test-user" },
          { role: "user", content: "hello" },
        ],
        inputMeta: {
          promptTokenBreakdown,
          truncationReason,
        },
        hookSystemPromptUsed: false,
        prependContext: "<recent-memory>ctx</recent-memory>",
      },
    }, null, 2), "utf-8");

    const loaded = await loadConversationPromptSnapshotArtifact({
      stateDir,
      conversationId,
      runId,
    });
    expect(loaded).toBeDefined();
    expect(loaded?.summary.tokenBreakdown).toEqual(promptTokenBreakdown);
    expect(loaded?.summary.truncationReason).toEqual(truncationReason);
    expect(loaded?.summary.deltaCount).toBe(2);
    expect(loaded?.snapshot.deltas).toEqual([
      expect.objectContaining({
        id: "runtime-identity-context",
        deltaType: "runtime-identity",
        source: "snapshot-normalize",
      }),
      expect.objectContaining({
        id: "prepend-context",
        deltaType: "user-prelude",
        source: "snapshot-normalize",
      }),
    ]);
    expect(loaded?.snapshot.inputMeta).toMatchObject({
      promptTokenBreakdown,
      truncationReason,
    });

    const rendered = renderConversationPromptSnapshotText(loaded!);
    expect(rendered).toContain("systemPromptEstimatedTokens: 5");
    expect(rendered).toContain("deltaEstimatedTokens: 11");
    expect(rendered).toContain("truncationReasonCode: max_chars_limit");
    expect(rendered).toContain("truncationDroppedSectionIds: methodology");

    const rawWritten = JSON.parse(await fs.promises.readFile(artifactPath, "utf-8"));
    expect(rawWritten.summary.tokenBreakdown).toBeUndefined();
    expect(rawWritten.summary.truncationReason).toBeUndefined();
  } finally {
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
