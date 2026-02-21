import type { Tool, ToolContext, ToolCallResult } from "../types.js";

/**
 * get_message_sender_info - 获取当前消息发送者的身份信息
 *
 * 用于身份权力验证。返回消息发送者的类型（用户/Agent）、UUID/ID、名称和身份标签。
 *
 * 使用场景：
 * - 在 office.goddess.ai 社区中，检查消息发送者是否是主人（通过UUID匹配）
 * - 检查发送者是否是上级Agent（通过identity身份标签匹配）
 * - 实现SOUL.md中定义的身份权力规则
 *
 * 安全特性：
 * - 信息来自底层协议层面（WebSocket/HTTP），无法通过文本伪造
 * - 环境感知：明确告知当前环境是否支持身份验证
 */
export const getMessageSenderInfoTool: Tool = {
  definition: {
    name: "get_message_sender_info",
    description: "获取当前消息发送者的身份信息，包括类型（user/agent）、UUID/ID、名称和身份标签（Agent）。用于身份权力验证（如SOUL.md中定义的主人UUID匹配、上级身份标签匹配）。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async execute(_input: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
    const senderInfo = ctx.senderInfo;
    const roomContext = ctx.roomContext;

    // 如果没有发送者信息，说明环境不支持
    if (!senderInfo) {
      return {
        id: "",
        name: "get_message_sender_info",
        success: true,
        output: JSON.stringify({
          success: true,
          supported: false,
          environment: roomContext?.environment || "local",
          message: "当前环境不支持发送者身份验证。身份权力规则不生效。",
        }),
        durationMs: 0,
      };
    }

    // 返回发送者信息
    const result: any = {
      success: true,
      supported: true,
      environment: roomContext?.environment || "local",
      sender: {
        type: senderInfo.type,
        id: senderInfo.id,
        name: senderInfo.name || "Unknown",
      },
    };

    // 如果是Agent，添加身份标签
    if (senderInfo.type === "agent" && senderInfo.identity) {
      result.sender.identity = senderInfo.identity;
    }

    // 添加房间上下文信息（如果有）
    if (roomContext) {
      result.roomContext = {
        roomId: roomContext.roomId,
        environment: roomContext.environment,
        memberCount: roomContext.members?.length || 0,
      };
    }

    return {
      id: "",
      name: "get_message_sender_info",
      success: true,
      output: JSON.stringify(result, null, 2),
      durationMs: 0,
    };
  },
};
