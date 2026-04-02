import { applyToolControlChanges, buildToolControlDisabledPayload, summarizeToolControlChanges } from "@belldandy/skills";

import type { PendingToolControlRequest, ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";

export type AgentToolControlMode = "disabled" | "confirm" | "auto";

export type ToolControlPolicyDeps = {
  confirmationStore?: ToolControlConfirmationStore;
  getMode?: () => AgentToolControlMode;
  getConfirmPassword?: () => string | undefined;
};

export type ToolControlPendingRequestSnapshot = {
  requestId: string;
  conversationId: string;
  requestedByAgentId?: string;
  expiresAt: number;
  summary: string[];
  passwordApproved: boolean;
};

export type ToolControlPolicySnapshot = {
  mode: AgentToolControlMode;
  requiresConfirmation: boolean;
  hasConfirmPassword: boolean;
  pendingRequest: ToolControlPendingRequestSnapshot | null;
};

export type ResolvePendingToolControlRequestResult =
  | {
    ok: true;
    pending: PendingToolControlRequest;
    summary: string[];
    policy: ToolControlPolicySnapshot;
  }
  | {
    ok: false;
    code: "invalid_state" | "unsupported" | "not_found" | "conversation_mismatch";
    message: string;
  };

export type ToolControlPasswordApprovalResult = {
  matched: boolean;
  sanitizedText: string;
  approvedRequestId?: string;
};

function getMode(deps: ToolControlPolicyDeps): AgentToolControlMode {
  return deps.getMode?.() ?? "disabled";
}

function hasConfirmPassword(deps: ToolControlPolicyDeps): boolean {
  return Boolean(String(deps.getConfirmPassword?.() ?? "").trim());
}

function toPendingSnapshot(pending: PendingToolControlRequest | undefined): ToolControlPendingRequestSnapshot | null {
  if (!pending) return null;
  return {
    requestId: pending.requestId,
    conversationId: pending.conversationId,
    requestedByAgentId: pending.requestedByAgentId,
    expiresAt: pending.expiresAt,
    summary: summarizeToolControlChanges(pending.changes),
    passwordApproved: Boolean(pending.passwordApprovedAt),
  };
}

export function resolveToolControlPolicySnapshot(
  deps: ToolControlPolicyDeps & { conversationId?: string },
): ToolControlPolicySnapshot {
  const mode = getMode(deps);
  const pending = deps.conversationId
    ? deps.confirmationStore?.getLatestByConversation(deps.conversationId)
    : undefined;
  return {
    mode,
    requiresConfirmation: mode === "confirm",
    hasConfirmPassword: hasConfirmPassword(deps),
    pendingRequest: toPendingSnapshot(pending),
  };
}

export function tryApproveToolControlPasswordInput(
  deps: ToolControlPolicyDeps & {
    conversationId: string;
    userText: string;
  },
): ToolControlPasswordApprovalResult {
  const confirmPassword = String(deps.getConfirmPassword?.() ?? "").trim();
  if (
    getMode(deps) !== "confirm"
    || !confirmPassword
    || !deps.confirmationStore
    || deps.userText.trim() !== confirmPassword
  ) {
    return {
      matched: false,
      sanitizedText: deps.userText,
    };
  }
  const pending = deps.confirmationStore.getLatestByConversation(deps.conversationId);
  if (!pending) {
    return {
      matched: false,
      sanitizedText: deps.userText,
    };
  }
  deps.confirmationStore.markPasswordApproved(pending.requestId);
  return {
    matched: true,
    sanitizedText: "【已提交工具开关确认口令】",
    approvedRequestId: pending.requestId,
  };
}

export function resolvePendingToolControlRequest(
  deps: ToolControlPolicyDeps & {
    requestId: string;
    conversationId?: string;
  },
): ResolvePendingToolControlRequestResult {
  const policy = resolveToolControlPolicySnapshot(deps);
  if (policy.mode !== "confirm") {
    return {
      ok: false,
      code: "invalid_state",
      message: "当前工具开关控制模式不是 confirm。",
    };
  }
  if (!deps.confirmationStore) {
    return {
      ok: false,
      code: "unsupported",
      message: "当前服务未启用工具开关确认处理。",
    };
  }
  const pending = deps.confirmationStore.get(deps.requestId);
  if (!pending) {
    return {
      ok: false,
      code: "not_found",
      message: `未找到待确认请求: ${deps.requestId}`,
    };
  }
  if (deps.conversationId && deps.conversationId !== pending.conversationId) {
    return {
      ok: false,
      code: "conversation_mismatch",
      message: "待确认请求不属于当前会话。",
    };
  }
  return {
    ok: true,
    pending,
    summary: summarizeToolControlChanges(pending.changes),
    policy,
  };
}

export { applyToolControlChanges, buildToolControlDisabledPayload, summarizeToolControlChanges };
