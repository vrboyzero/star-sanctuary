import type { Tool, ToolContext, ToolCallResult } from "../../types.js";

/**
 * leave_room 工具工厂函数
 *
 * 接受 CommunityChannel 实例，确保离开时：
 * 1. 发送告别消息（可选）
 * 2. 调用 HTTP API 删除 room_members 记录
 * 3. 清空 agentConfig.room（阻止重连）
 * 4. 持久化到 community.json（进程重启后也不重连）
 * 5. 关闭 WebSocket 连接
 */

export interface LeaveRoomChannelAdapter {
  leaveRoom(roomId: string): Promise<void>;
  sendProactiveMessage(content: string, chatId: string): Promise<boolean>;
}

export function createLeaveRoomTool(channel?: LeaveRoomChannelAdapter): Tool {
  return {
    definition: {
      name: "leave_room",
      description: "离开当前社区聊天室（永久离开，需重新加入才能回来）。仅在office.goddess.ai社区等多人聊天环境中可用。可选发送告别消息。",
      parameters: {
        type: "object",
        properties: {
          farewell_message: {
            type: "string",
            description: "离开前发送的告别消息（可选）",
          },
        },
        required: [],
      },
    },
    async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
      const startTime = Date.now();
      const roomContext = ctx.roomContext;
      const farewellMessage = input.farewell_message as string | undefined;

      // 检查是否在社区环境中
      if (!roomContext || roomContext.environment === "local") {
        return {
          id: "",
          name: "leave_room",
          success: false,
          output: JSON.stringify({
            success: false,
            supported: false,
            message: "当前环境不是多人聊天房间。此工具仅在office.goddess.ai社区等多人聊天环境中可用。",
          }),
          error: "Not in a community room",
          durationMs: Date.now() - startTime,
        };
      }

      const { roomId } = roomContext;
      if (!roomId) {
        return {
          id: "",
          name: "leave_room",
          success: false,
          output: JSON.stringify({ success: false, message: "房间ID未提供" }),
          error: "Room ID not provided",
          durationMs: Date.now() - startTime,
        };
      }

      if (!channel) {
        return {
          id: "",
          name: "leave_room",
          success: false,
          output: JSON.stringify({ success: false, message: "社区渠道未初始化" }),
          error: "Community channel not available",
          durationMs: Date.now() - startTime,
        };
      }

      try {
        // 1. 可选：发送告别消息（在离开前发送，此时还在房间里）
        if (farewellMessage) {
          try {
            await channel.sendProactiveMessage(farewellMessage, roomId);
          } catch (err) {
            ctx.logger?.warn(`发送告别消息失败: ${err}`);
          }
        }

        // 2. 调用 CommunityChannel.leaveRoom()
        //    内部会：清空 agentConfig.room → 持久化配置 → 关闭 WS
        //    ws.on('close') 触发时检测到 room 为空，不会重连
        await channel.leaveRoom(roomId);

        return {
          id: "",
          name: "leave_room",
          success: true,
          output: JSON.stringify({
            success: true,
            roomId,
            message: farewellMessage
              ? `已发送告别消息并离开房间 ${roomId}`
              : `已离开房间 ${roomId}`,
            note: "重新加入需要通过 bdd community 命令重新配置房间",
          }, null, 2),
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: "",
          name: "leave_room",
          success: false,
          output: JSON.stringify({
            success: false,
            message: "离开房间时发生异常",
            error: errorMessage,
          }),
          error: errorMessage,
          durationMs: Date.now() - startTime,
        };
      }
    },
  };
}
