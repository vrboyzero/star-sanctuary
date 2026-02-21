# 身份上下文系统测试指南

## 修复完成 ✅

已修复 UUID 和身份上下文传递的问题：

### 修复内容

1. **后端解析修复**：
   - `safeParseFrame` 函数：添加 `userUuid` 字段解析
   - `parseMessageSendParams` 函数：添加 `senderInfo` 和 `roomContext` 字段解析

2. **前端优化**：
   - 添加"保存"按钮，点击后自动重新连接 WebSocket
   - 添加完整的调试日志链路

3. **调试日志**：
   - 前端：`[UUID] Saving UUID: xxx`
   - 后端：`[Debug] Parsing connect frame. userUuid from client: xxx`
   - 后端：`[Debug] WebSocket connected. clientId: xxx userUuid: xxx`
   - 后端：`[Debug] ctx.userUuid: xxx`
   - 后端：`[Debug] parseMessageSendParams - senderInfo: xxx roomContext: xxx`

## 测试场景

### 场景1：本地 WebChat（UUID 验证）✅

**环境**：本地 WebChat（`http://localhost:28889`）

**步骤**：
1. 在 UUID 输入框输入 `3224`
2. 点击"保存"按钮
3. 发送消息测试

**预期结果**：
```json
// get_user_uuid 工具返回
{
  "success": true,
  "uuid": "3224",
  "message": "用户UUID: 3224"
}

// get_message_sender_info 工具返回
{
  "success": true,
  "supported": false,
  "environment": "local",
  "message": "当前环境不支持发送者身份验证。身份权力规则不生效。"
}

// get_room_members 工具返回
{
  "success": true,
  "supported": false,
  "environment": "local",
  "message": "当前环境不是多人聊天房间。此工具仅在office.goddess.ai社区等多人聊天环境中可用。"
}
```

**测试状态**：✅ 已通过（从日志确认 UUID 正确传递）

---

### 场景2：office.goddess.ai 社区（完整身份上下文）

**环境**：office.goddess.ai 社区多人聊天房间

**前提条件**：
- office.goddess.ai 后端需要在发送消息时传递完整的身份上下文

**消息格式**：
```json
{
  "text": "消息内容",
  "conversationId": "conversation-uuid",
  "from": "community",
  "agentId": "agent-id",
  "senderInfo": {
    "type": "user",
    "id": "3224",
    "name": "张三"
  },
  "roomContext": {
    "roomId": "room-uuid",
    "environment": "community",
    "members": [
      {
        "type": "user",
        "id": "3224",
        "name": "张三"
      },
      {
        "type": "user",
        "id": "4567",
        "name": "李四"
      },
      {
        "type": "agent",
        "id": "agent-1",
        "name": "Navigator-01",
        "identity": "舰长"
      },
      {
        "type": "agent",
        "id": "agent-2",
        "name": "Assistant-02",
        "identity": "CTO"
      }
    ]
  }
}
```

**预期结果**：

```json
// get_user_uuid 工具返回（注意：社区环境下，userUuid 来自 senderInfo.id）
{
  "success": true,
  "uuid": null,
  "message": "当前环境不支持UUID验证，或用户未提供UUID。身份权力规则不生效。"
}
// 注意：在社区环境下，应该使用 get_message_sender_info 而不是 get_user_uuid

// get_message_sender_info 工具返回
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
    "memberCount": 4
  }
}

// get_room_members 工具返回
{
  "success": true,
  "supported": true,
  "environment": "community",
  "roomId": "room-uuid",
  "cached": false,
  "summary": {
    "totalMembers": 4,
    "userCount": 2,
    "agentCount": 2
  },
  "users": [
    { "name": "张三", "uuid": "3224" },
    { "name": "李四", "uuid": "4567" }
  ],
  "agents": [
    { "name": "Navigator-01", "id": "agent-1", "identity": "舰长" },
    { "name": "Assistant-02", "id": "agent-2", "identity": "CTO" }
  ]
}
```

**测试状态**：⚠️ 待 office.goddess.ai 集成后测试

---

### 场景3：Agent 间对话（身份标签验证）

**环境**：office.goddess.ai 社区，Agent A 向 Agent B 发送消息

**消息格式**：
```json
{
  "text": "执行任务X",
  "conversationId": "conversation-uuid",
  "from": "community",
  "agentId": "agent-b",
  "senderInfo": {
    "type": "agent",
    "id": "agent-a",
    "name": "CEO-Agent",
    "identity": "CEO"
  },
  "roomContext": {
    "roomId": "room-uuid",
    "environment": "community",
    "members": [...]
  }
}
```

**预期结果**：
```json
// get_message_sender_info 工具返回
{
  "success": true,
  "supported": true,
  "environment": "community",
  "sender": {
    "type": "agent",
    "id": "agent-a",
    "name": "CEO-Agent",
    "identity": "CEO"
  },
  "roomContext": {
    "roomId": "room-uuid",
    "environment": "community",
    "memberCount": 5
  }
}
```

**Agent B 的决策逻辑**（基于 SOUL.md）：
```markdown
### 【IDENTITY | 身份标签】
- **当前身份标签**：CTO
- **上级身份标签**：CEO, 董事长
- **下级身份标签**：项目经理, 员工
- **主人UUID**：3224

### 决策流程：
1. 调用 get_message_sender_info 获取发送者信息
2. 检查 sender.type === "agent" && sender.identity === "CEO"
3. 判断：CEO 是上级 → 执行指令
```

**测试状态**：⚠️ 待 office.goddess.ai 集成后测试

---

## 代码修复总结

### 1. 后端修复（关键）

**文件**：`packages/belldandy-core/src/server.ts`

**修复1**：`safeParseFrame` 函数添加 `userUuid` 解析
```typescript
if (type === "connect") {
  const userUuid = typeof obj.userUuid === "string" && obj.userUuid.trim()
    ? obj.userUuid.trim()
    : undefined;
  return {
    type: "connect",
    // ...
    userUuid, // 添加此字段
  };
}
```

**修复2**：`parseMessageSendParams` 函数添加 `senderInfo` 和 `roomContext` 解析
```typescript
function parseMessageSendParams(value: unknown) {
  // ...
  const senderInfo = obj.senderInfo && typeof obj.senderInfo === "object"
    ? obj.senderInfo as any
    : undefined;
  const roomContext = obj.roomContext && typeof obj.roomContext === "object"
    ? obj.roomContext as any
    : undefined;

  return {
    ok: true,
    value: {
      text, conversationId, from, agentId, attachments,
      senderInfo, // 添加此字段
      roomContext, // 添加此字段
    }
  };
}
```

### 2. 前端优化

**文件**：`apps/web/public/index.html` 和 `apps/web/public/app.js`

**修复1**：添加"保存"按钮
```html
<div style="display: flex; gap: 8px; align-items: center;">
  <input id="userUuid" class="input input-sm" placeholder="输入你的UUID（可选）" style="flex: 1;" />
  <button id="saveUuid" class="button" style="padding: 6px 12px; font-size: 12px;">保存</button>
</div>
```

**修复2**：添加保存按钮事件监听器
```javascript
if (saveUuidBtn && userUuidEl) {
  saveUuidBtn.addEventListener("click", () => {
    const uuid = userUuidEl.value.trim();
    console.log("[UUID] Saving UUID:", uuid);
    persistUuid();
    if (ws && isReady) {
      console.log("[UUID] UUID changed, reconnecting...");
      teardown();
      setTimeout(() => connect(), 100);
    }
  });
}
```

**修复3**：添加调试日志
```javascript
function sendConnect() {
  const uuid = userUuidEl ? userUuidEl.value.trim() : "";
  console.log("[UUID] sendConnect - UUID from input:", uuid);
  // ...
  if (uuid) {
    connectFrame.userUuid = uuid;
    console.log("[UUID] Adding UUID to connect frame:", uuid);
  }
  console.log("[UUID] Sending connect frame:", JSON.stringify(connectFrame));
  ws.send(JSON.stringify(connectFrame));
}
```

---

## office.goddess.ai 集成指南

### 后端集成

当 office.goddess.ai 的后端需要向 Belldandy Gateway 发送消息时，需要包含完整的身份上下文：

```typescript
// 示例：用户在社区房间发送消息
const message = {
  text: "消息内容",
  conversationId: conversationId,
  from: "community",
  agentId: agentId,

  // 发送者信息（必需）
  senderInfo: {
    type: "user", // 或 "agent"
    id: user.uuid, // 用户UUID 或 Agent ID
    name: user.displayName,
    identity: undefined, // 仅 Agent 需要
  },

  // 房间上下文（必需）
  roomContext: {
    roomId: room.id,
    environment: "community",
    members: room.members.map(m => ({
      type: m.type, // "user" 或 "agent"
      id: m.id, // UUID 或 Agent ID
      name: m.name,
      identity: m.type === "agent" ? m.identity : undefined,
    })),
  },
};

// 发送到 Belldandy Gateway
await fetch(`${gatewayUrl}/api/message`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(message),
});
```

### 智能注入优化

根据 `IDENTITY-CONTEXT-OPTIMIZATION.md`，系统会自动优化 token 消耗：

- **小型房间（≤10人）**：System Prompt 注入完整成员列表
- **大型房间（>10人）**：System Prompt 仅注入统计信息，Agent 使用 `get_room_members` 工具按需查询

### 缓存机制

`get_room_members` 工具支持缓存：
- 默认缓存 5 分钟（可通过 `BELLDANDY_ROOM_MEMBERS_CACHE_TTL` 环境变量配置）
- 使用 `forceRefresh: true` 参数强制刷新缓存

---

## 总结

✅ **本地 WebChat UUID 验证**：已修复并测试通过
✅ **后端解析逻辑**：已修复 `userUuid`、`senderInfo`、`roomContext` 解析
✅ **工具实现**：`get_user_uuid`、`get_message_sender_info`、`get_room_members` 已实现并注册
⚠️ **office.goddess.ai 集成**：待后端集成后测试

**下一步**：
1. 清理调试日志（可选）
2. office.goddess.ai 后端集成身份上下文传递
3. 在社区环境中测试完整的身份权力规则
