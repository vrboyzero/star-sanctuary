import { describe, expect, it } from "vitest";

import {
  buildEmailThreadOrganizerEntries,
  buildEmailThreadOrganizerStats,
  mergeEmailThreadOrganizerReminders,
  matchesEmailThreadOrganizerQuery,
  normalizeOutboundAuditFocus,
} from "./email-thread-organizer-view.js";

describe("email thread organizer view", () => {
  it("normalizes outbound audit focus", () => {
    expect(normalizeOutboundAuditFocus("threads")).toBe("threads");
    expect(normalizeOutboundAuditFocus(" THREADS ")).toBe("threads");
    expect(normalizeOutboundAuditFocus("all")).toBe("all");
    expect(normalizeOutboundAuditFocus("anything-else")).toBe("all");
  });

  it("groups inbound audit items by conversation and keeps latest triage summary", () => {
    const entries = buildEmailThreadOrganizerEntries([
      {
        auditKind: "email_inbound",
        conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-1%40example.com%3E",
        providerId: "imap",
        targetAccountId: "primary",
        requestedAgentId: "default",
        threadId: "<thread-1@example.com>",
        messageId: "<message-1@example.com>",
        subject: "Kickoff",
        from: ["Alice <alice@example.com>"],
        contentPreview: "Need your reply today",
        status: "processed",
        triageCategory: "reply_required",
        triagePriority: "high",
        triageDisposition: "reply",
        triageSummary: "需要尽快回复",
        triageNeedsReply: true,
        triageNeedsFollowUp: true,
        triageFollowUpWindowHours: 24,
        suggestedReplyStarter: "Hi Alice,",
        suggestedReplySubject: "Re: Kickoff",
        suggestedReplyDraft: "Hi Alice,\n\nThanks for your email.",
        suggestedReplyQuality: "cautious",
        suggestedReplyConfidence: "high",
        suggestedReplyWarnings: ["先核对时间。"],
        suggestedReplyChecklist: ["确认问题已逐条回应。"],
        timestamp: 100,
      },
      {
        auditKind: "email_inbound",
        conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-1%40example.com%3E",
        providerId: "imap",
        targetAccountId: "primary",
        requestedAgentId: "default",
        threadId: "<thread-1@example.com>",
        messageId: "<message-2@example.com>",
        subject: "Re: Kickoff",
        from: ["Alice <alice@example.com>"],
        contentPreview: "Following up on the plan",
        status: "failed",
        triageCategory: "action_required",
        triagePriority: "high",
        triageDisposition: "follow_up",
        triageSummary: "需要补充处理",
        triageNeedsReply: true,
        triageNeedsFollowUp: true,
        triageFollowUpWindowHours: 12,
        suggestedReplyStarter: "Hi Alice, thanks for following up.",
        suggestedReplySubject: "Re: Kickoff",
        suggestedReplyDraft: "Hi Alice,\n\nI am checking the schedule.",
        suggestedReplyQuality: "review_required",
        suggestedReplyConfidence: "medium",
        suggestedReplyWarnings: ["先核对日期。"],
        suggestedReplyChecklist: ["确认时间和附件。"],
        retryScheduled: true,
        timestamp: 200,
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      auditKind: "email_thread_organizer",
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-1%40example.com%3E",
      latestSubject: "Re: Kickoff",
      latestMessageId: "<message-2@example.com>",
      latestTriageSummary: "需要补充处理",
      latestSuggestedReplyQuality: "review_required",
      messageCount: 2,
      processedCount: 1,
      failedCount: 1,
      retryScheduledCount: 1,
      needsReply: true,
      needsFollowUp: true,
    });
  });

  it("supports organizer search and summary stats", () => {
    const entries = mergeEmailThreadOrganizerReminders(buildEmailThreadOrganizerEntries([
      {
        auditKind: "email_inbound",
        conversationId: "conv-1",
        providerId: "imap",
        targetAccountId: "primary",
        requestedAgentId: "default",
        threadId: "<thread-1@example.com>",
        subject: "Reply Needed",
        from: ["Alice <alice@example.com>"],
        contentPreview: "Need your reply",
        status: "processed",
        triageCategory: "reply_required",
        triageSummary: "请回复",
        triageNeedsReply: true,
        suggestedReplyQuality: "cautious",
        timestamp: 100,
      },
      {
        auditKind: "email_inbound",
        conversationId: "conv-2",
        providerId: "imap",
        targetAccountId: "primary",
        requestedAgentId: "coder",
        threadId: "<thread-2@example.com>",
        subject: "FYI",
        from: ["Ops <ops@example.com>"],
        contentPreview: "Just for tracking",
        status: "failed",
        triageCategory: "informational",
        triageSummary: "仅供记录",
        triageNeedsFollowUp: true,
        suggestedReplyQuality: "review_required",
        retryScheduled: true,
        timestamp: 90,
      },
    ]), [
      {
        providerId: "imap",
        accountId: "primary",
        threadId: "<thread-2@example.com>",
        conversationId: "conv-2",
        status: "pending",
        dueAt: 100,
        deliveryCount: 0,
      },
    ]);

    expect(matchesEmailThreadOrganizerQuery(entries[0], "alice")).toBe(true);
    expect(matchesEmailThreadOrganizerQuery(entries[0], "reply_required")).toBe(true);
    expect(matchesEmailThreadOrganizerQuery(entries[1], "needs_follow_up")).toBe(true);
    expect(buildEmailThreadOrganizerStats(entries)).toEqual({
      threadCount: 2,
      needsReplyCount: 1,
      needsFollowUpCount: 1,
      reminderPendingCount: 1,
      reminderDeliveredCount: 0,
      replyReviewRequiredCount: 1,
      failedThreadCount: 1,
      retryScheduledCount: 1,
    });
  });
});
