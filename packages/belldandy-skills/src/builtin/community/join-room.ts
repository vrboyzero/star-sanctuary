import type { Tool, ToolContext, ToolCallResult } from "../../types.js";

/**
 * join_room 工具工厂函数
 *
 * 接受 CommunityChannel 实例，动态加入社区房间：
 * 1. 通过房间名称查询房间 ID（GET /rooms/by-name/:name）
 * 2. 更新 agentConfig.room（设置房间名称和密码）
 * 3. 持久化到 community.json（进程重启后自动重连）
 * 4. 建立 WebSocket 连接
 */

export interface JoinRoomChannelAdapter {
  joinRoom(agentName: string, roomName: string, password?: string): Promise<void>;
}

export function createJoinRoomTool(channel?: JoinRoomChannelAdapter): Tool {
  return {
    definition: {
      name: "join_room",
      description: "加入 office.goddess.ai 社区聊天室，与其他 Agent 或用户协作。使用房间名称（如 dev-room）而非 UUID 加入。加入后会自动连接并持久化配置（重启后自动重连）。",
      parameters: {
        type: "object",
        properties: {
          agent_name: {
            type: "string",
            description: "要使用的 Agent 名称（必须已在 community.json 中配置 apiKey）",
          },
          room_name: {
            type: "string",
            description: "要加入的房间名称（如 dev-room、research-room），不是 UUID",
          },
          password: {
            type: "string",
            description: "房间密码（如果房间需要）",
          },
        },
        required: ["agent_name", "room_name"],
      },
    },
    async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
      const startTime = Date.now();
      const agentName = input.agent_name as string;
      const roomName = input.room_name as string;
      const password = input.password as string | undefined;

      if (!agentName || typeof agentName !== "string") {
        return {
          id: "",
          name: "join_room",
          success: false,
          output: JSON.stringify({
            success: false,
            message: "agent_name 参数必填且必须是字符串",
          }),
          error: "Invalid agent_name parameter",
          durationMs: Date.now() - startTime,
        };
      }

      if (!roomName || typeof roomName !== "string") {
        return {
          id: "",
          name: "join_room",
          success: false,
          output: JSON.stringify({
            success: false,
            message: "room_name 参数必填且必须是字符串",
          }),
          error: "Invalid room_name parameter",
          durationMs: Date.now() - startTime,
        };
      }

      if (!channel) {
        return {
          id: "",
          name: "join_room",
          success: false,
          output: JSON.stringify({
            success: false,
            message: "社区渠道未初始化。请确保 community.json 已配置并启动 Gateway。",
          }),
          error: "Community channel not available",
          durationMs: Date.now() - startTime,
        };
      }

      try {
        await channel.joinRoom(agentName, roomName, password);

        return {
          id: "",
          name: "join_room",
          success: true,
          output: JSON.stringify({
            success: true,
            agentName,
            roomName,
            message: password
              ? `Agent ${agentName} 已加入房间 "${roomName}"（使用密码）`
              : `Agent ${agentName} 已加入房间 "${roomName}"`,
            note: "配置已持久化到 community.json，重启后会自动重连此房间",
          }, null, 2),
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          id: "",
          name: "join_room",
          success: false,
          output: JSON.stringify({
            success: false,
            message: "加入房间时发生异常",
            error: errorMessage,
            troubleshooting: [
              "检查 agent_name 是否已在 community.json 中配置",
              "检查 room_name 是否正确（使用房间名称，不是 UUID）",
              "检查是否已连接到其他房间（需先离开）",
              "检查网络连接和社区服务状态",
            ],
          }, null, 2),
          error: errorMessage,
          durationMs: Date.now() - startTime,
        };
      }
    },
  };
}
