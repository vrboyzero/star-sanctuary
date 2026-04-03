import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConversationStore } from "@belldandy/agent";
import { afterEach, expect, test, vi } from "vitest";

import exportCommand from "./conversation/export.js";
import exportsCommand from "./conversation/exports.js";
import listCommand from "./conversation/list.js";
import timelineCommand from "./conversation/timeline.js";

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
