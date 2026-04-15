import type { NormalizedEmailInboundEvent } from "./email-inbound-contract.js";
import {
  buildEmailReplySuggestion,
  type EmailReplySuggestionConfidence,
  type EmailReplySuggestionQuality,
} from "./email-reply-suggestion.js";

export type EmailInboundTriageCategory =
  | "reply_required"
  | "action_required"
  | "informational"
  | "low_priority";

export type EmailInboundTriagePriority = "high" | "medium" | "low";

export type EmailInboundTriageDisposition = "reply" | "track" | "review" | "ignore";

export type EmailInboundTriageResult = {
  category: EmailInboundTriageCategory;
  priority: EmailInboundTriagePriority;
  disposition: EmailInboundTriageDisposition;
  summary: string;
  rationale: string[];
  needsReply: boolean;
  needsFollowUp: boolean;
  followUpWindowHours?: number;
  suggestedReplyStarter?: string;
  suggestedReplySubject?: string;
  suggestedReplyDraft?: string;
  suggestedReplyQuality?: EmailReplySuggestionQuality;
  suggestedReplyConfidence?: EmailReplySuggestionConfidence;
  suggestedReplyWarnings: string[];
  suggestedReplyChecklist: string[];
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function collapseWhitespace(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function lowerIncludesAny(source: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

export function buildEmailInboundTriage(event: NormalizedEmailInboundEvent): EmailInboundTriageResult {
  const subject = normalizeString(event.subject);
  const body = collapseWhitespace([
    event.snippet,
    event.textBody,
    event.htmlBody,
  ].filter(Boolean).join("\n"));
  const haystack = `${subject}\n${body}`.toLowerCase();
  const senderAddresses = event.from.map((item) => normalizeString(item.address).toLowerCase()).filter(Boolean);
  const isNoReply = senderAddresses.some((item) => item.includes("noreply") || item.includes("no-reply") || item.includes("do-not-reply"));
  const urgentPatterns = [
    /\burgent\b/, /\basap\b/, /\bimmediately\b/, /\btoday\b/, /\btomorrow\b/, /\bdeadline\b/, /\bdue\b/, /\bblocked\b/,
    /紧急/, /尽快/, /今天/, /明天/, /截止/, /到期/, /阻塞/,
  ];
  const replyPatterns = [
    /\bplease reply\b/, /\blet me know\b/, /\bcan you\b/, /\bcould you\b/, /\bwould you\b/, /\brespond\b/,
    /请回复/, /请尽快/, /麻烦/, /能否/, /是否/, /什么时候/, /\?/,
  ];
  const actionPatterns = [
    /\breview\b/, /\bapprove\b/, /\baction required\b/, /\btodo\b/, /\bfollow up\b/, /\bmeeting\b/, /\bschedule\b/,
    /\binvoice\b/, /\bpayment\b/, /\bcontract\b/, /\bconfirm\b/, /\bdeadline\b/,
    /请处理/, /请确认/, /审批/, /评审/, /付款/, /发票/, /安排/, /跟进/, /处理一下/,
  ];
  const notificationPatterns = [
    /\bfyi\b/, /\bfor your information\b/, /\bnotification\b/, /\breceipt\b/, /\bnewsletter\b/, /\bdigest\b/, /\bsummary\b/,
    /通知/, /回执/, /简报/, /日报/, /周报/, /系统消息/,
  ];

  const hasUrgentCue = lowerIncludesAny(haystack, urgentPatterns);
  const hasReplyCue = !isNoReply && lowerIncludesAny(haystack, replyPatterns);
  const hasActionCue = lowerIncludesAny(haystack, actionPatterns);
  const isNotification = lowerIncludesAny(haystack, notificationPatterns);
  const directRecipients = event.to.length + event.cc.length;
  const isDirectMessage = directRecipients > 0 && directRecipients <= 2;

  let category: EmailInboundTriageCategory = "informational";
  let priority: EmailInboundTriagePriority = "low";
  let disposition: EmailInboundTriageDisposition = "review";
  let needsReply = false;
  let needsFollowUp = false;
  let followUpWindowHours: number | undefined;
  const rationale: string[] = [];

  if (hasUrgentCue || hasActionCue) {
    category = hasReplyCue ? "reply_required" : "action_required";
    priority = hasUrgentCue ? "high" : "medium";
    disposition = hasReplyCue ? "reply" : "track";
    needsReply = hasReplyCue;
    needsFollowUp = true;
    followUpWindowHours = hasUrgentCue ? 24 : 48;
    if (hasUrgentCue) rationale.push("contains urgency or deadline cues");
    if (hasActionCue) rationale.push("contains explicit action or review cues");
    if (hasReplyCue) rationale.push("contains direct reply cues");
  } else if (hasReplyCue || (isDirectMessage && !isNoReply && event.references.length > 0)) {
    category = "reply_required";
    priority = isDirectMessage ? "medium" : "low";
    disposition = "reply";
    needsReply = true;
    needsFollowUp = true;
    followUpWindowHours = isDirectMessage ? 48 : 72;
    rationale.push(hasReplyCue ? "contains direct reply cues" : "belongs to an existing direct mail thread");
  } else if (isNoReply || isNotification) {
    category = isNoReply ? "low_priority" : "informational";
    priority = "low";
    disposition = isNoReply ? "ignore" : "review";
    rationale.push(isNoReply ? "sender looks like a no-reply address" : "looks like FYI/notification traffic");
  } else {
    category = "informational";
    priority = event.attachments.length > 0 ? "medium" : "low";
    disposition = "review";
    rationale.push(event.attachments.length > 0 ? "contains attachments and may need manual review" : "no strong reply or action cue detected");
  }

  const summaryParts = [
    category.replace(/_/g, " "),
    priority,
    disposition,
    needsFollowUp && followUpWindowHours ? `follow up in ${followUpWindowHours}h` : "",
  ].filter(Boolean);

  const replySuggestion = buildEmailReplySuggestion({
    event,
    category,
    disposition,
    followUpWindowHours,
    needsReply,
  });

  return {
    category,
    priority,
    disposition,
    summary: summaryParts.join(" · "),
    rationale,
    needsReply,
    needsFollowUp,
    ...(typeof followUpWindowHours === "number" ? { followUpWindowHours } : {}),
    ...(replySuggestion?.draftText ? { suggestedReplyStarter: replySuggestion.draftText.split("\n")[0] } : {}),
    ...(replySuggestion?.subject ? { suggestedReplySubject: replySuggestion.subject } : {}),
    ...(replySuggestion?.draftText ? { suggestedReplyDraft: replySuggestion.draftText } : {}),
    ...(replySuggestion?.quality ? { suggestedReplyQuality: replySuggestion.quality } : {}),
    ...(replySuggestion?.confidence ? { suggestedReplyConfidence: replySuggestion.confidence } : {}),
    suggestedReplyWarnings: replySuggestion?.warnings ?? [],
    suggestedReplyChecklist: replySuggestion?.checklist ?? [],
  };
}
