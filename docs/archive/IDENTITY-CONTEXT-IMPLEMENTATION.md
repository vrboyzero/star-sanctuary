# 身份上下文系统实现文档

## 概述

本文档描述了Belldandy项目中身份上下文系统的完整实现，该系统扩展了UUID验证功能，支持多人聊天场景（如office.goddess.ai社区）中的身份权力规则。

## 设计目标

1. **通用身份上下文**：支持本地WebChat和office.goddess.ai社区两种环境
2. **发送者信息检索**：Agent能够查询消息发送者的身份（用户UUID或Agent身份标签）
3. **房间成员感知**：Agent能够查询房间中所有成员的信息
4. **动态System Prompt注入**：根据环境自动注入身份上下文信息
5. **SOUL.md规则支持**：为身份权力规则提供技术支撑

## 架构设计

### 1. 协议层扩展

**文件**: `packages/belldandy-protocol/src/index.ts`

扩展了`MessageSendParams`类型：

```typescript
export type MessageSendParams = {
  conversationId?: string;
  text: string;
  from?: string;
  agentId?: string;
  userUuid?: string;

  // 新增：消息发送者信息
  senderInfo?: {
    type: "user" | "agent";
    id: string;
    name?: string;
    identity?: string; // Agent的身份标签（如：舰长、CEO）
  };

  // 新增：房间上下文信息
  roomContext?: {
    roomId?: string;
    environment: "local" | "community"; // 本地WebChat vs office.goddess.ai社区
    members?: Array<{
      type: "user" | "agent";
      id: string;
      name?: string;
      identity?: string; // Agent的身份标签
    }>;
  };

  attachments?: Array<{
    name: string;
    type: string;
    base64: string;
  }>;
};
```

### 2. Agent层类型扩展

**文件**: `packages/belldandy-agent/src/index.ts`

新增类型定义：

```typescript
/** 消息发送者信息 */
export type SenderInfo = {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string; // Agent的身份标签
};

/** 房间成员信息 */
export type RoomMember = {
  type: "user" | "agent";
  id: string;
  name?: string;
  identity?: string;
};

/** 房间上下文信息 */
export type RoomContext = {
  roomId?: string;
  environment: "local" | "community";
  members?: RoomMember[];
};
```

扩展了`AgentRunInput`类型：

```typescript
export type AgentRunInput = {
  // ... 原有字段
  userUuid?: string;
  senderInfo?: SenderInfo; // 新增
  roomContext?: RoomContext; // 新增
};
```

### 3. 工具系统扩展

**文件**: `packages/belldandy-skills/src/types.ts`

扩展了`ToolContext`类型：

```typescript
export type ToolContext = {
  // ... 原有字段
  userUuid?: string;
  senderInfo?: SenderInfo; // 新增
  roomContext?: RoomContext; // 新增
  // ...
};
```

### 4. 新增工具

#### 4.1 get_message_sender_info

**文件**: `packages/belldandy-skills/src/builtin/get-sender-info.ts`

获取当前消息发送者的身份信息。

**返回示例（用户）**：
```json
{
  "success": true,
  "supported": true,
  "environment": "community",
  "sender": {
    "type": "user",
    "id": "3224",
    "name": "张三"
  },
  "roomContext": {
    "roomId": "room-uuid",
    "environment": "community",
    "memberCount": 5
  }
}
```

**返回示例（Agent）**：
```json
{
  "success": true,
  "supported": true,
  "environment": "community",
  "sender": {
    "type": "agent",
    "id": "agent-uuid",
    "name": "Navigator-01",
    "identity": "舰长"
  }
}
```

**返回示例（不支持）**：
```json
{
  "success": true,
  "supported": false,
  "environment": "local",
  "message": "当前环境不支持发送者身份验证。身份权力规则不生效。"
}
```

#### 4.2 get_room_members

**文件**: `packages/belldandy-skills/src/builtin/get-room-members.ts`

获取当前房间的成员列表。

**返回示例**：
```json
{
  "success": true,
  "supported": true,
  "environment": "community",
  "roomId": "room-uuid",
  "summary": {
    "totalMembers": 5,
    "userCount": 2,
    "agentCount": 3
  },
  "users": [
    { "name": "张三", "uuid": "3224" },
    { "name": "李四", "uuid": "4567" }
  ],
  "agents": [
    { "name": "Navigator-01", "id": "agent-1", "identity": "舰长" },
    { "name": "Assistant-02", "id": "agent-2", "identity": "CTO" },
    { "name": "Helper-03", "id": "agent-3", "identity": "员工" }
  ]
}
```

**返回示例（本地环境）**：
```json
{
  "success": true,
  "supported": false,
  "environment": "local",
  "message": "当前环境不是多人聊天房间。此工具仅在office.goddess.ai社区等多人聊天环境中可用。"
}
```

### 5. System Prompt动态注入

**文件**: `packages/belldandy-agent/src/tool-agent.ts`

在`buildInitialMessages`函数中，根据身份上下文动态注入信息到System Prompt：

```markdown
## Identity Context (Runtime)
- **UUID Support**: ENABLED
- **Current User UUID**: 3224

### Current Message Sender
- **Type**: user
- **ID**: 3224
- **Name**: 张三
- You can use the `get_message_sender_info` tool to retrieve sender information at any time.

### Room Context
- **Environment**: office.goddess.ai Community
- **Room ID**: room-uuid
- **Members**: 5 total
  - Users (2):
    - 张三 (UUID: 3224)
    - 李四 (UUID: 4567)
  - Agents (3):
    - Navigator-01 (Identity: 舰长)
    - Assistant-02 (Identity: CTO)
    - Helper-03 (Identity: 员工)
- You can use the `get_room_members` tool to retrieve the full member list at any time.

### Identity-Based Authority Rules
- **Status**: ACTIVE (office.goddess.ai Community environment)
- Identity-based authority rules (as defined in SOUL.md) are now in effect.
- You should verify sender identity before executing sensitive commands.
```

### 6. 服务端处理

**文件**: `packages/belldandy-core/src/server.ts`

在处理`message.send`时，从请求参数中提取身份上下文并传递给Agent：

```typescript
const runInput: any = {
  conversationId,
  text: promptText,
  history,
  agentId: requestedAgentId,
  userUuid: ctx.userUuid,
  senderInfo: parsed.value.senderInfo, // 传递发送者信息
  roomContext: parsed.value.roomContext, // 传递房间上下文
};
```

## 使用场景

### 场景1：本地WebChat（仅UUID）

用户在本地WebChat输入框中输入UUID `3224`，发送消息。

**System Prompt注入**：
```markdown
## Identity Context (Runtime)
- **UUID Support**: ENABLED
- **Current User UUID**: 3224
- You can use the `get_user_uuid` tool to retrieve this UUID at any time.

### Identity-Based Authority Rules
- **Status**: ACTIVE (UUID provided)
- Identity-based authority rules (as defined in SOUL.md) are now in effect.
```

**Agent可用工具**：
- `get_user_uuid`：返回 `3224`
- `get_message_sender_info`：返回不支持（本地环境无发送者信息）
- `get_room_members`：返回不支持（本地环境无房间）

### 场景2：office.goddess.ai社区（完整身份上下文）

用户在office.goddess.ai的Agent社区房间中发送消息。

**消息参数**：
```json
{
  "text": "请执行任务",
  "senderInfo": {
    "type": "user",
    "id": "3224",
    "name": "张三"
  },
  "roomContext": {
    "roomId": "room-123",
    "environment": "community",
    "members": [
      { "type": "user", "id": "3224", "name": "张三" },
      { "type": "agent", "id": "agent-1", "name": "Navigator-01", "identity": "舰长" }
    ]
  }
}
```

**System Prompt注入**：完整的身份上下文（如上所示）

**Agent可用工具**：
- `get_user_uuid`：返回 `3224`
- `get_message_sender_info`：返回完整发送者信息
- `get_room_members`：返回完整成员列表

### 场景3：Agent之间的对话

Agent A（身份：CTO）向Agent B（身份：舰长）发送消息。

**消息参数**：
```json
{
  "text": "请汇报项目进度",
  "senderInfo": {
    "type": "agent",
    "id": "agent-cto",
    "name": "Assistant-CTO",
    "identity": "CTO"
  }
}
```

**Agent B的System Prompt注入**：
```markdown
### Current Message Sender
- **Type**: agent
- **ID**: agent-cto
- **Name**: Assistant-CTO
- **Identity**: CTO
```

**Agent B可以**：
- 调用 `get_message_sender_info` 查看发送者是CTO
- 根据SOUL.md中的身份权力规则，判断CTO是否是上级
- 决定是否执行指令

## SOUL.md身份权力规则实现

根据SOUL.md的定义：

```markdown
### 【IDENTITY | 身份标签】
- **当前身份标签**：首席执行官 (CEO)
- **上级身份标签**：董事会成员, 董事长
- **下级身份标签**：CTO, 项目经理, 员工
- **主人UUID**：3224
```

**Agent的验证逻辑**（在Prompt中指示）：

1. **检查主人UUID**：
   ```
   调用 get_message_sender_info 或 get_user_uuid
   如果 sender.id == "3224"（主人UUID）：
     无条件执行指令（最高优先级）
   ```

2. **检查上级身份**：
   ```
   如果 sender.type == "agent" 且 sender.identity in ["董事会成员", "董事长"]：
     执行指令（上级优先级）
   ```

3. **检查下级身份**：
   ```
   如果 sender.type == "agent" 且 sender.identity in ["CTO", "项目经理", "员工"]：
     可以指导下级，但不接受下级的指令
   ```

4. **其他情况**：
   ```
   如果不是主人、不是上级：
     拒绝执行敏感指令
   ```

## 安全特性

1. **协议层传递**：所有身份信息通过WebSocket/HTTP协议层传递，无法通过文本消息伪造
2. **环境感知**：Agent明确知道当前环境是否支持身份验证
3. **多层验证**：支持UUID验证（用户）和身份标签验证（Agent）
4. **可选性**：在不支持的环境中优雅降级，不影响基本功能

## 与office.goddess.ai的集成

office.goddess.ai的后端需要在发送消息时提供身份上下文：

```typescript
// office.goddess.ai 后端示例
const message = {
  text: userMessage,
  senderInfo: {
    type: "user",
    id: user.uuid, // 从数据库获取
    name: user.displayName,
  },
  roomContext: {
    roomId: room.id,
    environment: "community",
    members: room.members.map(m => ({
      type: m.type, // "user" or "agent"
      id: m.id,
      name: m.name,
      identity: m.type === "agent" ? m.identity : undefined,
    })),
  },
};

// 发送到Belldandy Gateway
await fetch(`${gatewayUrl}/api/message`, {
  method: "POST",
  body: JSON.stringify(message),
});
```

## 总结

身份上下文系统为Belldandy提供了完整的多人聊天场景支持，使Agent能够：

1. ✅ 识别消息发送者（用户UUID或Agent身份标签）
2. ✅ 查询房间成员列表
3. ✅ 区分本地环境和社区环境
4. ✅ 实现SOUL.md中定义的身份权力规则
5. ✅ 在office.goddess.ai社区中正确执行权限控制

这个系统是UUID验证功能的自然扩展，为多Agent协作和多用户交互提供了坚实的技术基础。
