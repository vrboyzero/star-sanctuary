import { expect, test } from "vitest";

import { ToolControlConfirmationStore } from "./tool-control-confirmation-store.js";
import {
  resolvePendingToolControlRequest,
  resolveToolControlPolicySnapshot,
  tryApproveToolControlPasswordInput,
} from "./tool-control-policy.js";

test("resolveToolControlPolicySnapshot exposes pending request summary", () => {
  const confirmationStore = new ToolControlConfirmationStore();
  confirmationStore.create({
    requestId: "REQ001",
    conversationId: "conv-1",
    requestedByAgentId: "default",
    changes: {
      enableBuiltin: [],
      disableBuiltin: ["alpha_builtin"],
      enableMcpServers: [],
      disableMcpServers: ["demo"],
      enablePlugins: [],
      disablePlugins: [],
    },
  });

  const snapshot = resolveToolControlPolicySnapshot({
    confirmationStore,
    getMode: () => "confirm",
    getConfirmPassword: () => "secret",
    conversationId: "conv-1",
  });

  expect(snapshot).toMatchObject({
    mode: "confirm",
    requiresConfirmation: true,
    hasConfirmPassword: true,
    pendingRequest: {
      requestId: "REQ001",
      conversationId: "conv-1",
      summary: ["关闭 builtin: alpha_builtin", "关闭 MCP: demo"],
      passwordApproved: false,
    },
  });
});

test("tryApproveToolControlPasswordInput marks latest conversation request as approved", () => {
  const confirmationStore = new ToolControlConfirmationStore();
  confirmationStore.create({
    requestId: "REQ002",
    conversationId: "conv-2",
    changes: {
      enableBuiltin: [],
      disableBuiltin: ["alpha_builtin"],
      enableMcpServers: [],
      disableMcpServers: [],
      enablePlugins: [],
      disablePlugins: [],
    },
  });

  const result = tryApproveToolControlPasswordInput({
    confirmationStore,
    getMode: () => "confirm",
    getConfirmPassword: () => "星河123",
    conversationId: "conv-2",
    userText: "星河123",
  });

  expect(result).toMatchObject({
    matched: true,
    sanitizedText: "【已提交工具开关确认口令】",
    approvedRequestId: "REQ002",
  });
  expect(confirmationStore.get("REQ002")?.passwordApprovedAt).toBeTypeOf("number");
});

test("resolvePendingToolControlRequest validates mode and conversation ownership", () => {
  const confirmationStore = new ToolControlConfirmationStore();
  confirmationStore.create({
    requestId: "REQ003",
    conversationId: "conv-3",
    changes: {
      enableBuiltin: [],
      disableBuiltin: ["alpha_builtin"],
      enableMcpServers: [],
      disableMcpServers: [],
      enablePlugins: [],
      disablePlugins: [],
    },
  });

  const mismatch = resolvePendingToolControlRequest({
    confirmationStore,
    getMode: () => "confirm",
    requestId: "REQ003",
    conversationId: "conv-other",
  });
  expect(mismatch).toMatchObject({
    ok: false,
    code: "conversation_mismatch",
  });

  const invalidMode = resolvePendingToolControlRequest({
    confirmationStore,
    getMode: () => "auto",
    requestId: "REQ003",
    conversationId: "conv-3",
  });
  expect(invalidMode).toMatchObject({
    ok: false,
    code: "invalid_state",
  });
});
