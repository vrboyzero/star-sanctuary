import type { Tool, ToolContext, ToolCallResult } from "../types.js";
import { withToolContract } from "../tool-contract.js";

/**
 * get_user_uuid - 获取当前环境中的用户UUID
 *
 * 用于身份权力验证。如果环境不支持UUID或用户未提供UUID，返回null。
 *
 * 安全特性：
 * - 防冒充：UUID来自底层协议层面（WebSocket握手），无法通过文本伪造
 * - 环境感知：明确告知Agent当前环境是否支持UUID验证
 */
export const getUserUuidTool: Tool = withToolContract({
  definition: {
    name: "get_user_uuid",
    description: "获取当前环境中的用户UUID。用于身份权力验证（如SOUL.md中定义的主人UUID匹配）。如果环境不支持UUID或用户未提供UUID，返回null。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
    const userUuid = ctx.userUuid;

    if (!userUuid) {
      return {
        id: "",
        name: "get_user_uuid",
        success: true,
        output: JSON.stringify({
          success: true,
          uuid: null,
          message: "当前环境不支持UUID验证，或用户未提供UUID。身份权力规则不生效。",
        }),
        durationMs: 0,
      };
    }

    return {
      id: "",
      name: "get_user_uuid",
      success: true,
      output: JSON.stringify({
        success: true,
        uuid: userUuid,
        message: `用户UUID: ${userUuid}`,
      }),
      durationMs: 0,
    };
  },
}, {
  family: "other",
  isReadOnly: true,
  isConcurrencySafe: true,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["local-safe", "web-safe"],
  activityDescription: "Read the current user's UUID from runtime context",
  resultSchema: {
    kind: "text",
    description: "User UUID JSON text.",
  },
  outputPersistencePolicy: "conversation",
});
