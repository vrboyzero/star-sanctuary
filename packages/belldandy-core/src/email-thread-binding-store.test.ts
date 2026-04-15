import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildEmailThreadSessionKey,
  createFileEmailThreadBindingStore,
  resolveEmailThreadBindingStorePath,
} from "./email-thread-binding-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
});

describe("email thread binding store", () => {
  it("persists and reloads thread bindings", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-email-thread-"));
    tempDirs.push(stateDir);
    const storePath = resolveEmailThreadBindingStorePath(stateDir);
    const store = createFileEmailThreadBindingStore(storePath);

    await store.upsert({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-001@example.com>",
      sessionKey: buildEmailThreadSessionKey({
        providerId: "imap",
        accountId: "primary",
        threadId: "<thread-001@example.com>",
      }),
      conversationId: "email-thread-conv",
      updatedAt: 1713140000000,
      lastMessageId: "<msg-002@example.com>",
      lastSubject: " Re: Project Update ",
      participantAddresses: [" alice@example.com ", "bob@example.com", "ALICE@example.com"],
    });

    const reloaded = createFileEmailThreadBindingStore(storePath);
    await expect(reloaded.getByThread({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-001@example.com>",
    })).resolves.toEqual({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-001@example.com>",
      sessionKey: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
      conversationId: "email-thread-conv",
      updatedAt: 1713140000000,
      lastMessageId: "<msg-002@example.com>",
      lastSubject: "Re: Project Update",
      participantAddresses: ["alice@example.com", "bob@example.com"],
    });
  });

  it("builds a canonical email session key", () => {
    expect(buildEmailThreadSessionKey({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-001@example.com>",
    })).toBe("channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E");
  });
});
