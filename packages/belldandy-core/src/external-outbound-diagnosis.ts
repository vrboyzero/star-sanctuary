import type { ExternalOutboundAuditRecord } from "./external-outbound-audit-store.js";

export type ExternalOutboundFailureStage = "resolve" | "delivery" | "confirmation";

export function detectExternalOutboundFailureStage(input: {
  errorCode?: string;
  targetSessionKey?: string;
  delivery?: ExternalOutboundAuditRecord["delivery"];
}): ExternalOutboundFailureStage {
  const code = typeof input.errorCode === "string" ? input.errorCode.trim() : "";
  if (code === "not_found" || code === "conversation_mismatch" || code === "unsupported") {
    return "confirmation";
  }
  if (code === "binding_not_found" || code === "invalid_target" || code === "channel_unavailable") {
    return "resolve";
  }
  if (code === "send_failed" || code === "content_required") {
    return "delivery";
  }
  if (input.delivery === "failed" && !input.targetSessionKey) {
    return "resolve";
  }
  return "delivery";
}
