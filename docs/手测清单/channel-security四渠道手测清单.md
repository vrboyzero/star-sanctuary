# Channel Security 四渠道手测清单

## 1. 目标

- 验证 `channel-security.json` 在四个渠道上的最小安全闭环是否成立：
  - `DM allowlist` 阻断是否正常
  - `channel-security-approvals.json` 待审批链是否正常
  - 批准后是否会把 `senderId` 正确写回 `allowFrom`
  - `group / channel / room` 的 `mentionRequired` 是否正常
- 覆盖以下四个渠道：
  - `feishu`
  - `discord`
  - `qq`
  - `community`

## 2. 手测前准备

1. 确认当前配置文件存在且内容已更新：
   - [channel-security.json](/C:/Users/admin/.star_sanctuary/channel-security.json)
   - [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json)
2. 重启 Gateway / 主服务，确保最新配置已加载。
3. 准备一个明显的测试文本，所有渠道统一使用，便于日志检索。例如：
   - `channel-security test 2026-04-12`
4. 开始前确认 `channel-security-approvals.json` 当前是空的：

```json
{
  "version": 1,
  "pending": []
}
```

5. 如需排查，准备同时观察日志目录：
   - [logs](/C:/Users/admin/.star_sanctuary/logs)

## 3. 飞书 Feishu

### 3.1 DM 审批流

1. 用一个**不在** `channels.feishu.allowFrom` 里的飞书账号，给机器人发送一条 DM。
2. 预期：
   - 机器人不回复
   - [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json) 新增一条 `channel=feishu` 的 pending
3. 记录该条 pending 的：
   - `id`
   - `senderId`
   - `chatId`
4. 通过 WebChat / 配置接口执行批准，或手工把该 `senderId` 加入 [channel-security.json](/C:/Users/admin/.star_sanctuary/channel-security.json) 的 `channels.feishu.allowFrom`
5. 再发同样一条 DM。
6. 预期：
   - 这次消息进入系统
   - pending 被移除
   - `channels.feishu.allowFrom` 保留该 sender

### 3.2 群聊 mention gate

1. 在飞书群里发送一条**不 `@` 机器人**的消息。
2. 预期：
   - 不回复
3. 在同一个群里发送一条**显式 `@机器人`** 的消息。
4. 预期：
   - 消息进入系统

## 4. Discord

### 4.1 DM 审批流

1. 用一个**不在** `channels.discord.allowFrom` 里的 Discord 账号，给 Bot 发送一条 DM。
2. 预期：
   - 机器人不回复
   - [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json) 新增一条 `channel=discord` 的 pending
3. 批准该 pending，或手工把 `senderId` 加到 `channels.discord.allowFrom`。
4. 再发同样一条 DM。
5. 预期：
   - 这次消息进入系统

### 4.2 Guild Channel mention gate

1. 在 Discord server 的频道里发送一条**不 mention Bot** 的消息。
2. 预期：
   - 不回复
3. 再发送一条**mention Bot** 的消息。
4. 预期：
   - 消息进入系统

## 5. QQ

### 5.1 DM 审批流

1. 用一个**不在** `channels.qq.allowFrom` 里的 QQ 账号，给机器人发送一条 DM。
2. 预期：
   - 机器人不回复
   - [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json) 新增一条 `channel=qq` 的 pending
3. 批准该 pending，或手工把 `senderId` 加到 `channels.qq.allowFrom`。
4. 再发同样一条 DM。
5. 预期：
   - 这次消息进入系统

### 5.2 群聊 / 频道 mention gate

1. 在 QQ 群里发送一条**不 `@` 机器人**的消息。
2. 预期：
   - 不回复
3. 再发送一条**`@机器人`** 的消息。
4. 预期：
   - 消息进入系统

如果当前 QQ 接入同时存在 `channel` 场景，也可额外补测：

1. 在 QQ 频道里发一条不 `@` 的消息。
2. 预期：
   - 不回复
3. 再发一条 `@机器人` 的消息。
4. 预期：
   - 消息进入系统

## 6. Community

### 6.1 Room mention gate

1. 在当前 Community 房间中发送一条**不提及 `贝露丹蒂`** 的消息。
2. 预期：
   - 不回复
   - 不会新增 pending，因为这不是 DM allowlist 场景
3. 再发送一条**显式提及 `@贝露丹蒂`** 的消息。
4. 预期：
   - 消息进入系统

### 6.2 可选：Community DM 审批流

如果当前环境可直接制造 Community DM，则补做以下步骤：

1. 通过 Community 的 DM 入口，发送一条来自**未加白 sender** 的消息。
2. 预期：
   - 不放行
   - [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json) 新增一条 `channel=community` 的 pending
   - 该条记录通常会带 `accountId=贝露丹蒂`
3. 批准该 pending。
4. 预期：
   - `senderId` 被写回到：
   - `channels.community.accounts.贝露丹蒂.allowFrom`
5. 再发送同样一条 DM。
6. 预期：
   - 这次消息进入系统

## 7. 每个渠道的最小观察点

手测时，建议至少同时检查这三处：

- 渠道客户端里是否真的回复 / 不回复
- [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json) 是否新增 / 清除 pending
- [channel-security.json](/C:/Users/admin/.star_sanctuary/channel-security.json) 的 `allowFrom` 是否被正确回写

## 8. 通过标准

### 8.1 Feishu

- DM 首次被拦截并产生 pending
- 批准后再次发送 DM 能放行
- 群聊不 `@` 不放行，`@` 后放行

### 8.2 Discord

- DM 首次被拦截并产生 pending
- 批准后再次发送 DM 能放行
- 频道不 mention 不放行，mention 后放行

### 8.3 QQ

- DM 首次被拦截并产生 pending
- 批准后再次发送 DM 能放行
- 群聊不 `@` 不放行，`@` 后放行

### 8.4 Community

- room 不提及 `贝露丹蒂` 不放行
- room 提及后放行
- 如果补测 DM，则 pending 和账号级回写都正确

## 9. 失败时先看什么

### 9.1 pending 没新增

优先检查：

- 是否真的走的是 `dm` 场景
- 该 sender 是否已经在 `allowFrom`
- 服务是否已重启
- 该渠道是否真的启用了 `dmPolicy=allowlist`

### 9.2 不 mention 也放行

优先检查：

- `mentionRequired` 是否配置到了正确的 chatKind
- 是否其实命中了其他更宽松的业务规则
- 当前消息是否被系统识别成带 mentions

### 9.3 批准后仍不放行

优先检查：

- 是否加错了 `senderId`
- 是否批准到了错误的 `accountId`
- 是否修改后忘了重启服务
- 是否渠道侧实际上发起的是另一个 sender / 会话

### 9.4 Community 回写位置不对

预期回写位置应为：

- 普通渠道：
  - `channels.<channel>.allowFrom`
- Community 带账号：
  - `channels.community.accounts.<accountId>.allowFrom`

如果你看到它被错误写到了 `channels.community.allowFrom`，那就是 bug。

## 10. 当前已知本地基线

你当前本地配置的几个关键前提是：

- [channel-security.json](/C:/Users/admin/.star_sanctuary/channel-security.json) 已启用四渠道默认安全策略
- [channel-security-approvals.json](/C:/Users/admin/.star_sanctuary/channel-security-approvals.json) 已初始化
- Feishu 当前已预填一个常用 sender：
  - `ou_c89a02bd4b81b79ce0b416fae9e039ec`
- Community 当前账号名为：
  - `贝露丹蒂`

因此手测时要注意：

- 如果你用的正好是这个已加白的 Feishu sender，那么它不会再触发 pending
- 想验证 Feishu 的审批流，最好换一个**未加白**账号

## 11. 通过后建议动作

四渠道最小手测通过后，建议立即做两件事：

1. 把常用 sender 按真实使用情况补充到各渠道 `allowFrom`
2. 把真实测试过的 sender / room / channel 记录进内部说明或操作手册，减少后续排障成本
