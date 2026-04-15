import os from "node:os";
import path from "node:path";
import { rm, mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationStore } from "@belldandy/agent";

import {
  createFileEmailFollowUpReminderStore,
  resolveEmailFollowUpReminderStorePath,
} from "./email-follow-up-reminder-store.js";
import {
  processDueEmailFollowUpReminders,
  scheduleEmailFollowUpReminder,
} from "./email-follow-up-reminder-runtime.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("email follow-up reminder runtime", () => {
  it("schedules a follow-up reminder and delivers it into the thread conversation", async () => {
    const now = Date.now();
    const stateDir = await mkdtemp(path.join(os.tmpdir(), "ss-email-followup-runtime-"));
    tempDirs.push(stateDir);
    const reminderStore = createFileEmailFollowUpReminderStore(resolveEmailFollowUpReminderStorePath(stateDir));
    const conversationStore = new ConversationStore();
    const broadcastEvent = vi.fn();

    const reminder = await scheduleEmailFollowUpReminder({
      reminderStore,
      event: {
        providerId: "imap",
        accountId: "primary",
        threadId: "<thread-1@example.com>",
        messageId: "<msg-1@example.com>",
        subject: "Need reply",
        receivedAt: now - (24 * 60 * 60 * 1000) - 60_000,
      },
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-1%40example.com%3E",
      requestedAgentId: "default",
      triage: {
        category: "reply_required",
        priority: "high",
        disposition: "reply",
        summary: "needs follow-up",
        rationale: ["direct request"],
        needsReply: true,
        needsFollowUp: true,
        followUpWindowHours: 24,
        suggestedReplyStarter: "Hi Alice,",
        suggestedReplyWarnings: [],
        suggestedReplyChecklist: [],
      },
    });

    expect(reminder?.status).toBe("pending");

    const deliveredCount = await processDueEmailFollowUpReminders({
      reminderStore,
      conversationStore,
      broadcastEvent,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      now,
    });

    expect(deliveredCount).toBe(1);
    const messages = conversationStore.get(reminder!.conversationId)?.messages ?? [];
    expect(messages.at(-1)?.content).toContain("邮件跟进提醒");
    expect(messages.at(-1)?.content).toContain("send_email.threadId: <thread-1@example.com>");
    expect(broadcastEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "chat.final",
      payload: expect.objectContaining({
        conversationId: reminder!.conversationId,
      }),
    }));
    expect((await reminderStore.listRecent(1))[0]?.status).toBe("delivered");
  });
});
