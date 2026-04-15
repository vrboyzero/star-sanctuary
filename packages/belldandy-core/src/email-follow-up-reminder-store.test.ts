import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createFileEmailFollowUpReminderStore,
  resolveEmailFollowUpReminderStorePath,
} from "./email-follow-up-reminder-store.js";
import { rm } from "node:fs/promises";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("email follow-up reminder store", () => {
  it("upserts pending reminders and marks them delivered/resolved", async () => {
    const stateDir = await import("node:fs/promises").then((fs) => fs.mkdtemp(path.join(os.tmpdir(), "ss-email-followup-")));
    tempDirs.push(stateDir);
    const store = createFileEmailFollowUpReminderStore(resolveEmailFollowUpReminderStorePath(stateDir));

    const pending = await store.upsert({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-1@example.com>",
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-1%40example.com%3E",
      requestedAgentId: "default",
      messageId: "<msg-1@example.com>",
      subject: "Follow up",
      triageSummary: "needs follow-up",
      suggestedReplyStarter: "Hi Alice,",
      followUpWindowHours: 24,
      sourceReceivedAt: 1_700_000_000_000,
      dueAt: 1_700_086_400_000,
    });

    expect(pending.status).toBe("pending");
    expect((await store.listDue(1_700_086_400_000))).toHaveLength(1);

    const delivered = await store.markDelivered({
      id: pending.id,
      deliveredAt: 1_700_086_500_000,
    });
    expect(delivered?.status).toBe("delivered");
    expect(delivered?.deliveryCount).toBe(1);
    expect((await store.listDue(1_700_086_500_000))).toHaveLength(0);

    const resolved = await store.resolveByThread({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-1@example.com>",
      resolvedAt: 1_700_086_600_000,
      resolutionSource: "email_outbound",
    });
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.resolutionSource).toBe("email_outbound");
    expect((await store.listRecent(1))[0]?.status).toBe("resolved");
  });
});
