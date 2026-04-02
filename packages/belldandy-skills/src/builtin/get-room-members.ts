import type { Tool, ToolContext, ToolCallResult } from "../types.js";
import { withToolContract } from "../tool-contract.js";

/**
 * get_room_members - 获取当前房间的成员列表
 *
 * 用于身份权力验证。返回房间中所有成员的信息，包括用户和Agent。
 *
 * 使用场景：
 * - 在 office.goddess.ai 社区中，查看房间中有哪些用户和Agent
 * - 检查房间中是否有主人（通过UUID匹配）
 * - 检查房间中是否有上级Agent（通过identity身份标签匹配）
 * - 实现SOUL.md中定义的身份权力规则
 *
 * 安全特性：
 * - 信息来自底层协议层面（WebSocket/HTTP），无法通过文本伪造
 * - 仅在多人聊天环境中可用（office.goddess.ai社区）
 *
 * 缓存机制：
 * - 成员列表会缓存在会话中，默认有效期5分钟
 * - 使用 forceRefresh 参数可强制刷新缓存
 */
export const getRoomMembersTool: Tool = withToolContract({
  definition: {
    name: "get_room_members",
    description: "获取当前房间的成员列表，包括所有用户（带UUID）和Agent（带身份标签）。用于身份权力验证和多人对话场景。仅在office.goddess.ai社区等多人聊天环境中可用。支持缓存机制，默认缓存5分钟。",
    parameters: {
      type: "object",
      properties: {
        forceRefresh: {
          type: "boolean",
          description: "是否强制刷新缓存，默认false（使用缓存）",
        },
      },
      required: [],
    },
  },
  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolCallResult> {
    const roomContext = ctx.roomContext;
    const forceRefresh = input.forceRefresh === true;
    const conversationStore = ctx.conversationStore;

    // 如果没有房间上下文，说明不在多人聊天环境中
    if (!roomContext || roomContext.environment === "local") {
      return {
        id: "",
        name: "get_room_members",
        success: true,
        output: JSON.stringify({
          success: true,
          supported: false,
          environment: "local",
          message: "当前环境不是多人聊天房间。此工具仅在office.goddess.ai社区等多人聊天环境中可用。",
        }),
        durationMs: 0,
      };
    }

    // 如果没有成员列表
    if (!roomContext.members || roomContext.members.length === 0) {
      return {
        id: "",
        name: "get_room_members",
        success: true,
        output: JSON.stringify({
          success: true,
          supported: true,
          environment: roomContext.environment,
          roomId: roomContext.roomId,
          members: [],
          message: "房间成员列表为空或未提供。",
        }),
        durationMs: 0,
      };
    }

    // 尝试从缓存获取（如果不是强制刷新）
    let members = roomContext.members;
    let cached = false;

    if (!forceRefresh && conversationStore) {
      const cachedMembers = conversationStore.getRoomMembersCache(ctx.conversationId);
      if (cachedMembers) {
        members = cachedMembers;
        cached = true;
      }
    }

    // 如果没有使用缓存，更新缓存
    if (!cached && conversationStore) {
      // 从环境变量读取 TTL，默认 5 分钟
      const ttl = parseInt(process.env.BELLDANDY_ROOM_MEMBERS_CACHE_TTL || "300000", 10);
      conversationStore.setRoomMembersCache(ctx.conversationId, roomContext.members, ttl);
    }

    // 分类成员
    const users = members.filter(m => m.type === "user");
    const agents = members.filter(m => m.type === "agent");

    const result = {
      success: true,
      supported: true,
      environment: roomContext.environment,
      roomId: roomContext.roomId,
      cached, // 标记是否使用了缓存
      summary: {
        totalMembers: members.length,
        userCount: users.length,
        agentCount: agents.length,
      },
      users: users.map(u => ({
        name: u.name || "Unknown",
        uuid: u.id,
      })),
      agents: agents.map(a => ({
        name: a.name || "Unknown",
        id: a.id,
        identity: a.identity || "Unknown",
      })),
    };

    return {
      id: "",
      name: "get_room_members",
      success: true,
      output: JSON.stringify(result, null, 2),
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
  safeScopes: ["web-safe"],
  activityDescription: "Read member identities for the current multi-user room",
  resultSchema: {
    kind: "text",
    description: "Room member JSON text.",
  },
  outputPersistencePolicy: "conversation",
});
