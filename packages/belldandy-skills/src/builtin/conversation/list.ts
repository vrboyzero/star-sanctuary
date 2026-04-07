import crypto from "node:crypto";

import type { Tool, ToolCallResult } from "../../types.js";
import { withToolContract } from "../../tool-contract.js";
import {
  formatConversationList,
  isConversationAllowed,
  normalizeOptionalString,
  normalizeAllowedConversationKinds,
  parseBoolean,
  parsePositiveInt,
} from "./shared.js";

export const conversationListTool: Tool = withToolContract({
  definition: {
    name: "conversation_list",
    description: "List recent readable conversations in the current workspace scope so you can locate a target conversation before reading its history.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of conversations to return. Default: 10.",
        },
        conversation_id_prefix: {
          type: "string",
          description: "Optional conversation ID prefix filter.",
        },
        agent_id: {
          type: "string",
          description: "Optional exact agent ID filter.",
        },
        has_messages_only: {
          type: "boolean",
          description: "When true, only return conversations that currently have persisted messages.",
        },
        exclude_heartbeat: {
          type: "boolean",
          description: "When true, exclude heartbeat-* runtime conversations from the result.",
        },
        exclude_subtasks: {
          type: "boolean",
          description: "When true, exclude sub_* subtask conversations from the result.",
        },
        exclude_goal_sessions: {
          type: "boolean",
          description: "When true, exclude goal:* goal conversations from the result.",
        },
      },
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "conversation_list";
    const conversationStore = context.conversationStore;

    if (!conversationStore?.listPersistedConversations) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: "Conversation listing is not available in the current runtime.",
        durationMs: Date.now() - start,
      };
    }

    try {
      const limit = parsePositiveInt(args.limit, 10, { min: 1, max: 50 });
      const conversationIdPrefix = normalizeOptionalString(args.conversation_id_prefix);
      const agentId = normalizeOptionalString(args.agent_id);
      const hasMessagesOnly = parseBoolean(args.has_messages_only);
      const excludeHeartbeat = parseBoolean(args.exclude_heartbeat);
      const excludeSubtasks = parseBoolean(args.exclude_subtasks);
      const excludeGoalSessions = parseBoolean(args.exclude_goal_sessions);
      const allowedConversationKinds = normalizeAllowedConversationKinds(context.allowedConversationKinds);
      const listed = await conversationStore.listPersistedConversations({
        ...(conversationIdPrefix ? { conversationIdPrefix } : {}),
      });

      const filtered = listed
        .filter((item) => isConversationAllowed(item.conversationId, allowedConversationKinds))
        .filter((item) => excludeHeartbeat !== true || !item.conversationId.startsWith("heartbeat-"))
        .filter((item) => excludeSubtasks !== true || !item.conversationId.startsWith("sub_"))
        .filter((item) => excludeGoalSessions !== true || !item.conversationId.startsWith("goal:"))
        .filter((item) => !agentId || item.agentId === agentId)
        .filter((item) => hasMessagesOnly !== true || item.hasMessages)
        .slice(0, limit);

      return {
        id,
        name,
        success: true,
        output: formatConversationList(filtered),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        id,
        name,
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
    }
  },
}, {
  family: "memory",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["local-safe", "web-safe"],
  activityDescription: "List persisted conversations available to the current workspace runtime",
  resultSchema: {
    kind: "text",
    description: "Conversation list text including ids, timestamps, and availability metadata.",
  },
  outputPersistencePolicy: "conversation",
});
