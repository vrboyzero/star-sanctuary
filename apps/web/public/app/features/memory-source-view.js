export function normalizeResidentSourceScope(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "shared" || normalized === "hybrid" || normalized === "private") {
      return normalized;
    }
  }
  return "private";
}

export function getResidentSourceBadgeClass(sourceView) {
  const scope = normalizeResidentSourceScope(typeof sourceView === "string" ? sourceView : sourceView?.scope);
  if (scope === "shared") return "memory-badge-shared";
  if (scope === "hybrid") return "memory-badge-hybrid";
  return "memory-badge-private";
}

export function formatResidentSourceScopeLabel(sourceView) {
  const scope = normalizeResidentSourceScope(typeof sourceView === "string" ? sourceView : sourceView?.scope);
  return scope;
}

export function formatResidentSourceSummary(sourceView) {
  if (sourceView && typeof sourceView.summary === "string" && sourceView.summary.trim()) {
    return sourceView.summary.trim();
  }
  const scope = formatResidentSourceScopeLabel(sourceView);
  if (scope === "hybrid") {
    return "hybrid 来源（private + shared）";
  }
  return `${scope} 来源`;
}

function getExplainability(sourceView) {
  const explainability = sourceView?.explainability;
  return explainability && typeof explainability === "object" ? explainability : null;
}

export function formatResidentSourceExplainability(sourceView) {
  const info = getExplainability(sourceView);
  if (!info?.code) {
    return formatResidentSourceSummary(sourceView);
  }

  const claimSuffix = typeof info.claimedByAgentId === "string" && info.claimedByAgentId.trim()
    ? ` 当前由 ${info.claimedByAgentId.trim()} 认领审批。`
    : "";

  switch (info.code) {
    case "shared_pending_private":
      return `这是 private 原件；shared 审批仍在 pending，因此当前只有私有侧可见。${claimSuffix}`.trim();
    case "shared_pending_hidden":
      return `这是 shared 副本；审批仍在 pending，正常 shared/hybrid 读取默认不会显示它。${claimSuffix}`.trim();
    case "shared_approved_private":
      return "这是 private 原件；同源 shared 副本已批准，在 hybrid 查询里两层都可能命中。";
    case "shared_approved_shared":
      return "这是 shared 副本；因为审批已通过，所以会进入正常 shared/hybrid 读取结果。";
    case "shared_rejected_private":
      return "这是 private 原件；shared 审批已被驳回，因此共享层不会再作为有效来源参与读取。";
    case "shared_rejected_hidden":
      return "这是 shared 副本；审批已被驳回，正常 shared/hybrid 读取默认不会显示它。";
    case "shared_revoked_private":
      return "这是 private 原件；shared 资格已撤销，后续读取应回到 private 侧。";
    case "shared_revoked_hidden":
      return "这是 shared 副本；共享资格已撤销，正常 shared/hybrid 读取默认不会显示它。";
    case "shared_only":
      return "这是直接位于 shared 层的记忆，不依赖 promotion 审批副本。";
    case "aggregate_mixed":
      return "当前结果同时引用 private 与 shared 两层记忆。";
    case "aggregate_shared_only":
      return "当前结果主要由 shared 记忆支撑。";
    case "aggregate_private_only":
      return "当前结果主要由 private 记忆支撑。";
    case "private_only":
    default:
      return "这是当前 Agent 的私有记忆。";
  }
}

export function formatResidentSourceConflictSummary(sourceView) {
  const info = getExplainability(sourceView);
  if (!info?.code) {
    return "当前没有额外的 private/shared 冲突说明。";
  }

  const privateCount = Number(info.privateCount) || 0;
  const sharedCount = Number(info.sharedCount) || 0;
  if (privateCount > 0 && sharedCount > 0) {
    return `当前结果同时命中 private ${privateCount} 条与 shared ${sharedCount} 条同源/同组来源；若语义接近，应结合共享治理与时间线判断优先参考哪一侧。`;
  }
  if (info.code === "shared_approved_private" || info.code === "shared_approved_shared") {
    return "该记忆已存在 private/shared 两层镜像，只是本次结果未同时命中两个副本。";
  }
  if (
    info.code === "shared_pending_private"
    || info.code === "shared_pending_hidden"
    || info.code === "shared_rejected_private"
    || info.code === "shared_rejected_hidden"
    || info.code === "shared_revoked_private"
    || info.code === "shared_revoked_hidden"
  ) {
    return "共享侧存在审批或撤销状态，因此当前不会形成可见的 private/shared 双副本冲突。";
  }
  if (info.code === "aggregate_mixed") {
    return "该结果由多层记忆共同支撑，若不同来源表达不一致，需要结合来源路径和共享治理继续判断。";
  }
  return "当前没有检测到同一次结果中的 private/shared 冲突。";
}

export function formatResidentSourceAuditSummary(sourceView) {
  const info = getExplainability(sourceView);
  if (!info) {
    return "-";
  }

  const parts = [];
  if (typeof info.governanceStatus === "string" && info.governanceStatus && info.governanceStatus !== "none") {
    parts.push(`status=${info.governanceStatus}`);
  }
  if (typeof info.requestedByAgentId === "string" && info.requestedByAgentId.trim()) {
    parts.push(`requestedBy=${info.requestedByAgentId.trim()}`);
  }
  if (typeof info.requestedAt === "string" && info.requestedAt.trim()) {
    parts.push(`requestedAt=${info.requestedAt.trim()}`);
  }
  if (typeof info.reviewerAgentId === "string" && info.reviewerAgentId.trim()) {
    parts.push(`reviewer=${info.reviewerAgentId.trim()}`);
  }
  if (typeof info.reviewedAt === "string" && info.reviewedAt.trim()) {
    parts.push(`reviewedAt=${info.reviewedAt.trim()}`);
  }
  if (typeof info.claimedByAgentId === "string" && info.claimedByAgentId.trim()) {
    parts.push(`claimedBy=${info.claimedByAgentId.trim()}`);
  }
  if (typeof info.claimedAt === "string" && info.claimedAt.trim()) {
    parts.push(`claimedAt=${info.claimedAt.trim()}`);
  }
  if (typeof info.reason === "string" && info.reason.trim()) {
    parts.push(`reason=${info.reason.trim()}`);
  }
  if (typeof info.decisionNote === "string" && info.decisionNote.trim()) {
    parts.push(`note=${info.decisionNote.trim()}`);
  }
  if (parts.length === 0) {
    return "当前没有额外的 shared 审计信息。";
  }
  return parts.join(" | ");
}
