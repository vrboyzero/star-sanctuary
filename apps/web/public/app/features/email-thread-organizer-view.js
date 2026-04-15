function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSenderList(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function summarizeSender(item) {
  const senders = normalizeSenderList(item?.from);
  return senders.join(", ");
}

function toOrganizerKey(item, index = 0) {
  const conversationId = normalizeString(item?.conversationId);
  if (conversationId) {
    return conversationId;
  }
  const providerId = normalizeString(item?.providerId) || "imap";
  const accountId = normalizeString(item?.targetAccountId || item?.accountId) || "default";
  const threadId = normalizeString(item?.threadId || item?.providerThreadId || item?.messageId) || `message-${index}`;
  return `provider=${providerId}:account=${accountId}:thread=${threadId}`;
}

function buildReminderLookupKey(input) {
  const conversationId = normalizeString(input?.conversationId);
  if (conversationId) {
    return conversationId;
  }
  const providerId = normalizeString(input?.providerId) || "imap";
  const accountId = normalizeString(input?.targetAccountId || input?.accountId) || "default";
  const threadId = normalizeString(input?.threadId || input?.providerThreadId || input?.messageId) || "";
  if (!threadId) return "";
  return `provider=${providerId}:account=${accountId}:thread=${threadId}`;
}

function createOrganizerEntry(item, index = 0) {
  const timestamp = Number(item?.timestamp) || 0;
  const senderSummary = summarizeSender(item);
  return {
    auditKind: "email_thread_organizer",
    id: toOrganizerKey(item, index),
    conversationId: normalizeString(item?.conversationId),
    providerId: normalizeString(item?.providerId),
    targetAccountId: normalizeString(item?.targetAccountId || item?.accountId),
    requestedAgentId: normalizeString(item?.requestedAgentId),
    threadId: normalizeString(item?.threadId || item?.providerThreadId),
    latestTimestamp: timestamp,
    latestStatus: normalizeString(item?.status),
    latestSubject: normalizeString(item?.subject),
    latestPreview: normalizeString(item?.contentPreview || item?.bodyPreview),
    latestMessageId: normalizeString(item?.messageId),
    latestSender: senderSummary,
    latestInReplyToMessageId: normalizeString(item?.inReplyToMessageId),
    latestReferences: Array.isArray(item?.references) ? item.references.filter(Boolean) : [],
    latestTriageCategory: normalizeString(item?.triageCategory),
    latestTriagePriority: normalizeString(item?.triagePriority),
    latestTriageDisposition: normalizeString(item?.triageDisposition),
    latestTriageSummary: normalizeString(item?.triageSummary),
    latestSuggestedReplyStarter: normalizeString(item?.suggestedReplyStarter),
    latestSuggestedReplySubject: normalizeString(item?.suggestedReplySubject),
    latestSuggestedReplyDraft: normalizeString(item?.suggestedReplyDraft),
    latestSuggestedReplyQuality: normalizeString(item?.suggestedReplyQuality),
    latestSuggestedReplyConfidence: normalizeString(item?.suggestedReplyConfidence),
    latestSuggestedReplyWarnings: Array.isArray(item?.suggestedReplyWarnings) ? item.suggestedReplyWarnings.filter(Boolean) : [],
    latestSuggestedReplyChecklist: Array.isArray(item?.suggestedReplyChecklist) ? item.suggestedReplyChecklist.filter(Boolean) : [],
    latestTriageFollowUpWindowHours: Number(item?.triageFollowUpWindowHours) || 0,
    needsReply: item?.triageNeedsReply === true,
    needsFollowUp: item?.triageNeedsFollowUp === true,
    createdBinding: item?.createdBinding === true,
    messageCount: 1,
    processedCount: item?.status === "processed" ? 1 : 0,
    failedCount: item?.status === "failed" ? 1 : 0,
    duplicateCount: item?.status === "skipped_duplicate" ? 1 : 0,
    invalidCount: item?.status === "invalid_event" ? 1 : 0,
    retryScheduledCount: item?.retryScheduled === true ? 1 : 0,
    retryExhaustedCount: item?.retryExhausted === true ? 1 : 0,
  };
}

function mergeOrganizerEntry(target, item) {
  target.messageCount += 1;
  if (item?.status === "processed") target.processedCount += 1;
  if (item?.status === "failed") target.failedCount += 1;
  if (item?.status === "skipped_duplicate") target.duplicateCount += 1;
  if (item?.status === "invalid_event") target.invalidCount += 1;
  if (item?.retryScheduled === true) target.retryScheduledCount += 1;
  if (item?.retryExhausted === true) target.retryExhaustedCount += 1;
  if (item?.createdBinding === true) target.createdBinding = true;

  const timestamp = Number(item?.timestamp) || 0;
  if (timestamp < target.latestTimestamp) {
    return target;
  }

  const senderSummary = summarizeSender(item);
  target.latestTimestamp = timestamp;
  target.latestStatus = normalizeString(item?.status);
  target.latestSubject = normalizeString(item?.subject);
  target.latestPreview = normalizeString(item?.contentPreview || item?.bodyPreview);
  target.latestMessageId = normalizeString(item?.messageId);
  target.latestSender = senderSummary;
  target.latestInReplyToMessageId = normalizeString(item?.inReplyToMessageId);
  target.latestReferences = Array.isArray(item?.references) ? item.references.filter(Boolean) : [];
  target.latestTriageCategory = normalizeString(item?.triageCategory);
  target.latestTriagePriority = normalizeString(item?.triagePriority);
  target.latestTriageDisposition = normalizeString(item?.triageDisposition);
  target.latestTriageSummary = normalizeString(item?.triageSummary);
  target.latestSuggestedReplyStarter = normalizeString(item?.suggestedReplyStarter);
  target.latestSuggestedReplySubject = normalizeString(item?.suggestedReplySubject);
  target.latestSuggestedReplyDraft = normalizeString(item?.suggestedReplyDraft);
  target.latestSuggestedReplyQuality = normalizeString(item?.suggestedReplyQuality);
  target.latestSuggestedReplyConfidence = normalizeString(item?.suggestedReplyConfidence);
  target.latestSuggestedReplyWarnings = Array.isArray(item?.suggestedReplyWarnings) ? item.suggestedReplyWarnings.filter(Boolean) : [];
  target.latestSuggestedReplyChecklist = Array.isArray(item?.suggestedReplyChecklist) ? item.suggestedReplyChecklist.filter(Boolean) : [];
  target.latestTriageFollowUpWindowHours = Number(item?.triageFollowUpWindowHours) || 0;
  target.needsReply = item?.triageNeedsReply === true;
  target.needsFollowUp = item?.triageNeedsFollowUp === true;
  target.conversationId = normalizeString(item?.conversationId) || target.conversationId;
  target.providerId = normalizeString(item?.providerId) || target.providerId;
  target.targetAccountId = normalizeString(item?.targetAccountId || item?.accountId) || target.targetAccountId;
  target.requestedAgentId = normalizeString(item?.requestedAgentId) || target.requestedAgentId;
  target.threadId = normalizeString(item?.threadId || item?.providerThreadId) || target.threadId;
  return target;
}

export function normalizeOutboundAuditFocus(value) {
  return normalizeString(value).toLowerCase() === "threads" ? "threads" : "all";
}

export function buildEmailThreadOrganizerEntries(items) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const grouped = new Map();
  normalizedItems.forEach((item, index) => {
    if (item?.auditKind !== "email_inbound") return;
    const key = toOrganizerKey(item, index);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, createOrganizerEntry(item, index));
      return;
    }
    mergeOrganizerEntry(current, item);
  });
  return [...grouped.values()].sort((left, right) => right.latestTimestamp - left.latestTimestamp);
}

export function mergeEmailThreadOrganizerReminders(entries, reminders) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const reminderMap = new Map();
  for (const reminder of Array.isArray(reminders) ? reminders : []) {
    const key = buildReminderLookupKey(reminder);
    if (!key) continue;
    reminderMap.set(key, reminder);
  }
  return normalizedEntries.map((entry) => {
    const key = buildReminderLookupKey(entry);
    const reminder = reminderMap.get(key);
    if (!reminder) return entry;
    return {
      ...entry,
      reminderStatus: normalizeString(reminder.status),
      reminderDueAt: Number(reminder.dueAt) || 0,
      reminderDeliveryCount: Number(reminder.deliveryCount) || 0,
      reminderLastDeliveredAt: Number(reminder.lastDeliveredAt) || 0,
      reminderResolvedAt: Number(reminder.resolvedAt) || 0,
      reminderResolutionSource: normalizeString(reminder.resolutionSource),
    };
  });
}

export function matchesEmailThreadOrganizerQuery(entry, query) {
  const normalized = normalizeString(query).toLowerCase();
  if (!normalized) return true;
  const haystack = [
    entry?.conversationId,
    entry?.providerId,
    entry?.targetAccountId,
    entry?.requestedAgentId,
    entry?.threadId,
    entry?.latestSubject,
    entry?.latestPreview,
    entry?.latestMessageId,
    entry?.latestSender,
    entry?.latestTriageCategory,
    entry?.latestTriagePriority,
    entry?.latestTriageDisposition,
    entry?.latestTriageSummary,
    entry?.latestSuggestedReplyStarter,
    entry?.latestSuggestedReplySubject,
    entry?.latestSuggestedReplyDraft,
    entry?.latestSuggestedReplyQuality,
    entry?.latestSuggestedReplyConfidence,
    Array.isArray(entry?.latestSuggestedReplyWarnings) ? entry.latestSuggestedReplyWarnings.join(" | ") : "",
    Array.isArray(entry?.latestSuggestedReplyChecklist) ? entry.latestSuggestedReplyChecklist.join(" | ") : "",
    entry?.reminderStatus,
    entry?.reminderResolutionSource,
    entry?.needsReply === true ? "needs_reply" : "",
    entry?.needsFollowUp === true ? "needs_follow_up" : "",
    entry?.reminderStatus === "pending" ? "reminder_pending" : "",
    entry?.reminderStatus === "delivered" ? "reminder_delivered" : "",
    entry?.reminderStatus === "resolved" ? "reminder_resolved" : "",
    entry?.retryScheduledCount ? "retry_scheduled" : "",
    entry?.retryExhaustedCount ? "retry_exhausted" : "",
  ]
    .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
    .join("\n");
  return haystack.includes(normalized);
}

export function buildEmailThreadOrganizerStats(entries) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  return {
    threadCount: normalizedEntries.length,
    needsReplyCount: normalizedEntries.filter((item) => item?.needsReply === true).length,
    needsFollowUpCount: normalizedEntries.filter((item) => item?.needsFollowUp === true).length,
    reminderPendingCount: normalizedEntries.filter((item) => item?.reminderStatus === "pending").length,
    reminderDeliveredCount: normalizedEntries.filter((item) => item?.reminderStatus === "delivered").length,
    replyReviewRequiredCount: normalizedEntries.filter((item) => item?.latestSuggestedReplyQuality === "review_required").length,
    failedThreadCount: normalizedEntries.filter((item) => Number(item?.failedCount) > 0).length,
    retryScheduledCount: normalizedEntries.filter((item) => Number(item?.retryScheduledCount) > 0).length,
  };
}
