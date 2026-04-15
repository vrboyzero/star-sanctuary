import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createFileEmailInboundCheckpointStore,
  resolveEmailInboundCheckpointStorePath,
} from "./email-inbound-checkpoint-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
});

describe("email inbound checkpoint store", () => {
  it("persists lastUid and processed message ids", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-email-inbound-"));
    tempDirs.push(stateDir);
    const storePath = resolveEmailInboundCheckpointStorePath(stateDir);
    const store = createFileEmailInboundCheckpointStore(storePath);

    await store.update({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
      lastUid: 7,
      processedMessageId: "<msg-001@example.com>",
    });
    await store.update({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
      lastUid: 8,
      processedMessageId: "<msg-002@example.com>",
    });

    const reloaded = createFileEmailInboundCheckpointStore(storePath);
    await expect(reloaded.get({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
    })).resolves.toEqual(expect.objectContaining({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
      lastUid: 8,
      processedMessageIds: ["<msg-001@example.com>", "<msg-002@example.com>"],
      failedMessages: [],
    }));
  });

  it("persists and clears failed retry queue entries when a message is eventually processed", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-email-inbound-"));
    tempDirs.push(stateDir);
    const storePath = resolveEmailInboundCheckpointStorePath(stateDir);
    const store = createFileEmailInboundCheckpointStore(storePath);

    const firstFailure = await store.recordFailure({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
      uid: 11,
      messageId: "<msg-fail@example.com>",
      threadId: "<thread-fail@example.com>",
      subject: "Need retry",
      error: "agent unavailable",
    });
    const secondFailure = await store.recordFailure({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
      uid: 11,
      messageId: "<msg-fail@example.com>",
      threadId: "<thread-fail@example.com>",
      subject: "Need retry",
      error: "still unavailable",
    });

    expect(firstFailure.attempts).toBe(1);
    expect(secondFailure.attempts).toBe(2);

    await store.update({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
      lastUid: 11,
      processedMessageId: "<msg-fail@example.com>",
    });

    const reloaded = createFileEmailInboundCheckpointStore(storePath);
    await expect(reloaded.get({
      providerId: "imap",
      accountId: "primary",
      mailbox: "INBOX",
    })).resolves.toEqual(expect.objectContaining({
      lastUid: 11,
      processedMessageIds: ["<msg-fail@example.com>"],
      failedMessages: [],
    }));
  });
});
