function normalizeCode(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function detectExternalOutboundFailureStage({ errorCode, targetSessionKey, delivery } = {}) {
  const code = normalizeCode(errorCode);
  if (code === "not_found" || code === "conversation_mismatch" || code === "unsupported") {
    return "confirmation";
  }
  if (code === "binding_not_found" || code === "invalid_target" || code === "channel_unavailable") {
    return "resolve";
  }
  if (code === "send_failed" || code === "content_required") {
    return "delivery";
  }
  if (delivery === "failed" && !normalizeCode(targetSessionKey)) {
    return "resolve";
  }
  return "delivery";
}

export function formatExternalOutboundFailureStageLabel(stage, t = (_key, _params, fallback) => fallback ?? "") {
  if (stage === "resolve") return t("externalOutbound.failureStageResolve", {}, "目标解析失败");
  if (stage === "delivery") return t("externalOutbound.failureStageDelivery", {}, "渠道投递失败");
  if (stage === "confirmation") return t("externalOutbound.failureStageConfirmation", {}, "确认处理失败");
  return stage || "-";
}

export function formatExternalOutboundErrorCodeLabel(code, t = (_key, _params, fallback) => fallback ?? "") {
  const normalized = normalizeCode(code);
  if (normalized === "binding_not_found") return t("externalOutbound.errorCodeBindingNotFound", {}, "没有可用 binding");
  if (normalized === "invalid_target") return t("externalOutbound.errorCodeInvalidTarget", {}, "目标 sessionKey 与渠道不匹配");
  if (normalized === "channel_unavailable") return t("externalOutbound.errorCodeChannelUnavailable", {}, "目标渠道当前不可用");
  if (normalized === "send_failed") return t("externalOutbound.errorCodeSendFailed", {}, "渠道发送失败");
  if (normalized === "content_required") return t("externalOutbound.errorCodeContentRequired", {}, "发送内容为空");
  if (normalized === "not_found") return t("externalOutbound.errorCodeNotFound", {}, "确认请求不存在或已过期");
  if (normalized === "conversation_mismatch") return t("externalOutbound.errorCodeConversationMismatch", {}, "确认请求不属于当前会话");
  if (normalized === "unsupported") return t("externalOutbound.errorCodeUnsupported", {}, "当前服务未启用确认处理");
  return normalized || "-";
}

export function buildExternalOutboundDiagnosis(input, t = (_key, _params, fallback) => fallback ?? "") {
  const failureStage = detectExternalOutboundFailureStage(input || {});
  const stageLabel = formatExternalOutboundFailureStageLabel(failureStage, t);
  const errorCode = normalizeCode(input?.errorCode);
  const codeLabel = formatExternalOutboundErrorCodeLabel(errorCode, t);
  const errorMessage = normalizeCode(input?.error);
  const summaryParts = [stageLabel];
  if (errorCode) {
    summaryParts.push(`${errorCode} / ${codeLabel}`);
  }
  if (errorMessage) {
    summaryParts.push(errorMessage);
  }
  return {
    failureStage,
    stageLabel,
    codeLabel,
    summary: summaryParts.join(" · "),
  };
}
