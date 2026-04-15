import type { NormalizedEmailInboundEvent } from "./email-inbound-contract.js";

export type EmailReplySuggestionQuality = "ready_with_review" | "cautious" | "review_required";
export type EmailReplySuggestionConfidence = "high" | "medium" | "low";

export type EmailReplySuggestionResult = {
  subject: string;
  draftText: string;
  quality: EmailReplySuggestionQuality;
  confidence: EmailReplySuggestionConfidence;
  warnings: string[];
  checklist: string[];
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function collapseWhitespace(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function resolveSenderLabel(event: NormalizedEmailInboundEvent): string {
  const sender = event.from[0];
  if (!sender) return "there";
  return normalizeString(sender.name) || normalizeString(sender.address) || "there";
}

function buildReplySubject(subject: string): string {
  const normalized = normalizeString(subject);
  if (!normalized) return "Re:";
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

function buildBodyHaystack(event: NormalizedEmailInboundEvent): string {
  return collapseWhitespace([
    event.subject,
    event.snippet,
    event.textBody,
    event.htmlBody,
  ].filter(Boolean).join("\n")).toLowerCase();
}

function includesAny(source: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(source));
}

export function buildEmailReplySuggestion(input: {
  event: NormalizedEmailInboundEvent;
  category: string;
  disposition: string;
  followUpWindowHours?: number;
  needsReply: boolean;
}): EmailReplySuggestionResult | undefined {
  if (input.needsReply !== true) {
    return undefined;
  }

  const event = input.event;
  const senderLabel = resolveSenderLabel(event);
  const subject = normalizeString(event.subject) || "your email";
  const bodyHaystack = buildBodyHaystack(event);

  const hasDateRisk = includesAny(bodyHaystack, [
    /\b\d{1,2}[:/.-]\d{1,2}([:/.-]\d{2,4})?\b/,
    /\b(mon|tue|wed|thu|fri|sat|sun)(day)?\b/,
    /\bjan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t)?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?\b/,
    /\btimezone\b/,
    /今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]|时间|时区|日期/,
  ]);
  const hasMoneyOrLegalRisk = includesAny(bodyHaystack, [
    /\b(invoice|payment|budget|quote|pricing|amount|contract|agreement|nda|legal|terms)\b/,
    /发票|付款|合同|协议|报价|预算|金额|条款|法务/,
    /[$€£¥￥]\s*\d+/,
  ]);
  const hasAttachmentRisk = Array.isArray(event.attachments) && event.attachments.length > 0;
  const hasDirectAskCue = includesAny(bodyHaystack, [
    /\?/,
    /\bplease\b/,
    /\bcan you\b/,
    /\bcould you\b/,
    /\bwould you\b/,
    /\blet me know\b/,
    /请|能否|是否|什么时候|麻烦/,
  ]);
  const lacksEnoughContext = !normalizeString(event.snippet) && !normalizeString(event.textBody) && !normalizeString(event.htmlBody);

  const warnings: string[] = [];
  if (hasMoneyOrLegalRisk) {
    warnings.push("发送前先核对金额、合同或其他商业条款。");
  }
  if (hasDateRisk) {
    warnings.push("发送前先核对日期、时间和时区。");
  }
  if (hasAttachmentRisk) {
    warnings.push("发送前确认是否需要补附件或引用附件内容。");
  }
  if (lacksEnoughContext) {
    warnings.push("原始正文信息较少，建议先打开原邮件确认上下文。");
  }

  const checklist = [
    "确认收件人、线程和 replyToMessageId 是否正确。",
    hasDirectAskCue ? "确认是否已经逐条回应邮件中的明确问题或请求。" : "",
    typeof input.followUpWindowHours === "number"
      ? `如果暂时不能给最终答复，先确认接手并承诺在 ${input.followUpWindowHours}h 内回更完整更新。`
      : "",
    hasAttachmentRisk ? "如果邮件提到附件、文档或补充材料，确认本次回复是否需要一起发送。" : "",
  ].filter(Boolean);

  let quality: EmailReplySuggestionQuality = "ready_with_review";
  let confidence: EmailReplySuggestionConfidence = "medium";
  if (lacksEnoughContext || hasMoneyOrLegalRisk || (hasDateRisk && hasAttachmentRisk)) {
    quality = "review_required";
  } else if (hasDateRisk || hasAttachmentRisk || hasDirectAskCue) {
    quality = "cautious";
  }
  if (!lacksEnoughContext && !hasMoneyOrLegalRisk && !hasDateRisk && !hasAttachmentRisk) {
    confidence = "high";
  } else if (lacksEnoughContext) {
    confidence = "low";
  }

  const acknowledgement = input.category === "action_required"
    ? `Thanks for flagging "${subject}". I have noted the requested action and I'm reviewing the next step.`
    : `Thanks for your email about "${subject}". I have reviewed it and I'm following up now.`;
  const intentLine = hasMoneyOrLegalRisk
    ? "Before I send a final answer, I want to verify the commercial/legal details to make sure the reply stays accurate."
    : hasDateRisk
      ? "I am checking the timing details so I can confirm an accurate schedule in my next update."
      : input.disposition === "reply"
        ? "I will send you a more concrete response shortly once I finish the remaining checks."
        : "I have captured the request and will update you after the next step is completed.";

  const draftText = [
    `Hi ${senderLabel},`,
    "",
    acknowledgement,
    intentLine,
    "",
    "Best,",
  ].join("\n");

  return {
    subject: buildReplySubject(subject),
    draftText,
    quality,
    confidence,
    warnings,
    checklist,
  };
}
