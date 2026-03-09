# Agent官网接口实现方案

## 1. 目标

在**复用现有 `community.json` 配置**的前提下，让 Agent 不仅能进入 `office.goddess.ai` 社区聊天室，还能直接操作官网的：

- **工坊 Workshop**
  - 查看技能、方法、应用、模组等内容
  - 按关键词搜索
  - 下载工坊作品
  - 上传/发布工坊作品
- **家园 Homestead / Town Square**
  - 获取自己的家园信息
  - 获取仓库/家园中的物品数据
  - 在地块上放置仓库物品
  - 收回地块上的物品

本方案目标是：

1. **不引入第二套独立配置文件**
2. **不把用户 JWT 写进 `community.json`**
3. 尽量复用现有的 `office.goddess.ai` 后端接口和 Belldandy 的工具注册机制
4. 对现有聊天室能力保持**向后兼容**

---

## 1.1 当前完成进度（截至 2026-03-09）

### 已完成

#### A. 官网服务端已接入统一操作者 helper

已完成统一操作者解析：

- 在 `office.goddess.ai/server/src/middleware/auth.ts` 新增 `OfficeActor`
- 新增 `resolveOfficeActor(c)`
- 统一输出：
  - `authType`
  - `ownerUserId`
  - `agentId?`

当前语义：

- 用户 JWT 请求 → `ownerUserId = userId`
- Agent API Key 请求 → `ownerUserId = agentOwnerId`

这部分已经落地，且与现有 `internal/token-usage` 的 owner 归属语义**一致但不耦合**。

#### B. 工坊受保护路由已切到 mixed auth

已完成下列路由改造：

- `POST /api/workshop/items`
- `PUT /api/workshop/items/:id`
- `DELETE /api/workshop/items/:id`
- `GET /api/workshop/mine`

改造结果：

- 用户 JWT 仍可正常访问
- Agent 现在也可通过 `X-API-Key + X-Agent-ID` 访问
- 作品归属仍落在官网用户，不改变现有数据模型

#### C. 家园核心路由已切到 mixed auth

已完成下列路由改造：

- `GET /api/town-square/my-homestead`
- `POST /api/town-square/claim`
- `PUT /api/town-square/homestead/name`
- `PUT /api/town-square/homestead/message`
- `GET /api/town-square/neighbors`
- `GET /api/town-square/inventory`
- `POST /api/town-square/place`
- `POST /api/town-square/recall`
- `POST /api/town-square/mount`
- `POST /api/town-square/unmount`
- `POST /api/town-square/open-blind-box`

改造结果：

- Agent 已可用官网 API 读写家园数据
- 原有用户态逻辑保持兼容
- 家园事务、碰撞校验、上限校验等业务逻辑未被拆分成两套

#### D. Belldandy 侧官网工具已完成首批接入

已新增统一官网客户端：

- `packages/belldandy-skills/src/builtin/office/client.ts`

已新增工坊工具：

- `office_workshop_search`
- `office_workshop_get_item`
- `office_workshop_download`
- `office_workshop_publish`

已新增家园工具：

- `office_homestead_get`
- `office_homestead_inventory`
- `office_homestead_claim`
- `office_homestead_place`
- `office_homestead_recall`

已完成导出与注册：

- `packages/belldandy-skills/src/index.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

这些工具已经：

- 直接复用 `community.json` 的 `endpoint + agent_name + apiKey`
- 自动注入 `X-API-Key + X-Agent-ID`
- 支持工坊上传/下载
- 支持工作区路径边界校验
- 支持下载后 SHA-256 校验（当服务端返回 `fileHash` 时）

#### E. 编译验证已通过

已通过以下构建验证：

- `office.goddess.ai/server` build 通过
- `packages/belldandy-skills` build 通过
- `packages/belldandy-core` build 通过

### 当前状态判断

截至 **2026-03-09**，这套方案已经从“设计阶段”进入到：

> **核心链路已落地，可进入联调与实测阶段。**

也就是说：

- 服务端鉴权适配已完成
- Belldandy 工具已接入
- 现在主要剩下联调、回归验证、体验补强和工具扩展

---

## 1.2 后续计划

### 第一优先级：联调验证

建议优先验证以下真实链路：

#### 工坊链路

1. 使用 `office_workshop_search` 按分类和关键词搜索
2. 使用 `office_workshop_get_item` 查看详情
3. 使用 `office_workshop_download` 下载到本地目录
4. 使用 `office_workshop_publish` 上传一个测试作品

重点检查：

- Agent 是否能稳定通过 `community.json` 识别官网身份
- 上传文件是否都能通过路径白名单校验
- 下载文件是否落到预期目录
- `apps` 分类在 manifest / appRunType 场景下是否都符合服务端要求

#### 家园链路

1. 使用 `office_homestead_get` 获取家园信息
2. 使用 `office_homestead_inventory` 获取仓库物品
3. 使用 `office_homestead_place` 放置物品
4. 使用 `office_homestead_recall` 收回物品
5. 未领取用户场景下验证 `office_homestead_claim`

重点检查：

- Agent 模式下 owner userId 是否稳定命中正确用户
- 放置坐标越界、碰撞、上限等错误提示是否足够清晰
- 返回给模型的数据量是否合适，是否需要进一步裁剪

### 第一优先级执行结果（2026-03-09 已完成）

本轮已完成一轮**真实联调**，不是仅靠构建通过判断。

#### A. 工坊只读联调结果

已验证：

- `office_workshop_search`
- `office_workshop_get_item`

联调结果：

- `office_workshop_search` 按 `skills` 分类查询成功，返回 2 条作品
- `office_workshop_search` 全量查询成功，返回 10 条作品
- `office_workshop_get_item` 成功读取单条作品详情，包括：
  - `id`
  - `title`
  - `summary`
  - `description`
  - `author`
  - `fileName`
  - `tags`

说明：

- `community.json -> office 工具 -> X-API-Key/X-Agent-ID -> 官网 mixed auth` 读取链路已确认打通

#### B. 工坊写操作联调结果

已验证：

- `office_workshop_download`
- `office_workshop_publish`

联调结果：

##### 下载

- 成功下载作品：`translator-facet.json`
- 下载目录写入成功
- 本地 SHA-256 已完成计算
- 因该测试作品 `fileHash = null`，所以未进行服务端哈希比对
- 官网作品下载计数已真实增加：
  - 联调前：`454`
  - 联调后：`455`

##### 发布

- 成功发布 1 条测试工坊作品
- 返回结果包含新作品 ID
- 发布后已通过删除接口完成回滚
- 再次按测试标题关键词搜索，结果为 0，说明回滚成功

##### 清理结果

- 已删除测试发布的工坊作品
- 已删除本地下载目录中的测试文件
- 已删除本地发布用测试文件

说明：

- 工坊读写链路已通过真实联调验证
- 当前 `office_workshop_publish` 可用于实际工作流

#### C. 家园只读联调结果

已验证：

- `office_homestead_get`
- `office_homestead_inventory`

联调结果：

- 成功读取主人当前家园：`a10001`
- 成功读取家园详细信息，包括：
  - `name`
  - `ownerDisplayName`
  - `prosperity`
  - `level`
  - `gridSize`
  - `placementLimits`
  - `placedCounts`
  - `placedItems`
- 成功读取仓库信息

说明：

- 家园读取链路在 Agent 模式下工作正常

#### D. 家园写操作联调结果

已验证：

- `office_homestead_claim`
- `office_homestead_place`
- `office_homestead_recall`

联调结果：

##### claim

- 对已有家园用户调用 `office_homestead_claim` 成功
- 返回当前家园状态，未出现兼容性问题

##### place / recall

- 为了验证放置/收回链路，联调中先通过一次 `internal token-usage` 掉落，给主人仓库新增了一个可放置物品
- 随后成功将该物品放置到 `(2, 2)`
- 放置成功后：
  - `prosperity` 从 `8` 增加到 `13`
- 再调用 `office_homestead_recall` 成功回收
- 回收后：
  - `prosperity` 从 `13` 回到 `8`

说明：

- 家园写链路已通过真实联调验证
- 坐标放置与回收的事务逻辑在 Agent 模式下工作正常

#### E. 本轮联调后的遗留状态

本轮联调已完成大部分清理，但仍保留 1 个**可预期遗留项**：

- 主人仓库中保留了 1 个联调用掉落物品

该物品信息：

- `inventoryId = 3`
- 名称：`银叶小树`

原因：

- 当前没有“安全删除仓库物品”的用户态接口
- 该物品已在 `place -> recall` 后回到仓库，不影响家园地块状态

结论：

- 当前遗留的是**仓库中多了 1 个物品**，不是错误状态，也不是脏摆放状态

#### F. 联调结论

截至 **2026-03-09**，第一优先级“真实联调验证”可判断为：

> **已完成，且核心官网链路已经可用。**

当前已经确认可工作的能力：

- 工坊搜索
- 工坊详情查看
- 工坊下载
- 工坊上传/发布
- 家园详情获取
- 仓库读取
- 家园领取
- 家园放置
- 家园收回

---

### 第二优先级：补工具测试

建议新增定向测试，至少覆盖：

- `community.json` 加载与 Agent 查找失败场景
- 上传路径越界拦截
- 下载哈希校验逻辑
- 分类别名归一化逻辑
- 常见 API 错误归一化输出

### 第二优先级执行结果（2026-03-09 已完成）

本轮已完成 office 工具的**定向单元测试补齐**。

#### A. 已新增测试文件

- `packages/belldandy-skills/src/builtin/office/office.test.ts`

#### B. 已覆盖的测试点

本轮共新增 **7 个测试用例**，覆盖如下：

1. **分类别名归一化**
   - 验证：
     - `技能 -> skills`
     - `方法论 -> methods`
     - `模组 -> plugins`

2. **工坊搜索请求构造**
   - 验证 `office_workshop_search`：
     - 会正确归一化分类
     - 会附带 `X-API-Key`
     - 会附带 `X-Agent-ID`

3. **工坊下载写文件与哈希校验**
   - 验证 `office_workshop_download`：
     - 能把文件写入目标目录
     - 能进行本地 SHA-256 校验

4. **工坊发布路径越界拦截**
   - 验证 `office_workshop_publish`：
     - 当 `file_path` 越出工作区时会被拒绝
     - 且不会发出 HTTP 请求

5. **工坊发布成功路径**
   - 验证 `office_workshop_publish`：
     - 能正确构造 `multipart/form-data`
     - 能以 `community.json` 中的 Agent 身份发起请求

6. **家园读取成功路径**
   - 验证 `office_homestead_get`：
     - 默认读取 `/api/town-square/my-homestead`

7. **家园放置请求体正确性**
   - 验证 `office_homestead_place`：
     - 请求地址正确
     - `inventoryId/x/y` 请求体正确

#### C. 已执行测试命令

已实际运行：

- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/builtin/office/office.test.ts`

执行结果：

- `1` 个测试文件通过
- `7` 个测试全部通过

#### D. 第二优先级结论

截至 **2026-03-09**，第二优先级可判断为：

> **已完成，且 office 工具的核心输入/输出与安全边界已有基础测试保护。**

当前已被测试覆盖并锁住的关键点：

- `community.json` 身份读取链路
- Agent 鉴权头拼装
- 工坊分类中文别名归一化
- 下载落盘与哈希校验
- 上传路径边界校验
- 家园核心写接口 payload 构造

同时也说明：

- 这组工具现在不只是“能跑通”
- 还具备了最小但有效的回归保护

### 第三优先级：体验增强

建议后续补充：

- `community.json` 可选 `office.downloadDir`
- `community.json` 可选 `office.uploadRoots`
- 家园更多工具：
  - `office_homestead_mount`
  - `office_homestead_unmount`
  - `office_homestead_open_blind_box`
- 工坊更多工具：
  - `office_workshop_mine`
  - `office_workshop_update`
  - `office_workshop_delete`

### 第三优先级执行结果（2026-03-09 已完成）

本轮已完成第三优先级中的**首批扩展能力实现**，并补齐了对应测试。

#### A. 已完成的家园扩展工具

已新增：

- `office_homestead_mount`
- `office_homestead_unmount`
- `office_homestead_open_blind_box`

对应能力说明：

- `office_homestead_mount`
  - 将装饰物挂载到已放置宿主物品上
- `office_homestead_unmount`
  - 将已挂载物从宿主上拆下并回收到仓库
- `office_homestead_open_blind_box`
  - 打开仓库中的盲盒物品并返回奖励结果

这三项均直接复用了现有官网服务端接口：

- `/api/town-square/mount`
- `/api/town-square/unmount`
- `/api/town-square/open-blind-box`

#### B. 已完成的工坊管理工具

已新增：

- `office_workshop_mine`
- `office_workshop_update`
- `office_workshop_delete`

对应能力说明：

- `office_workshop_mine`
  - 查看当前 Agent 主人用户在工坊中的作品列表
- `office_workshop_update`
  - 更新作品标题、简介、描述、版本、价格、标签或状态
- `office_workshop_delete`
  - 删除当前主人用户发布的工坊作品

这三项均直接复用了现有官网服务端接口：

- `/api/workshop/mine`
- `PUT /api/workshop/items/:id`
- `DELETE /api/workshop/items/:id`

#### C. 导出与注册状态

本轮新增工具已完成：

- `packages/belldandy-skills/src/builtin/office/index.ts` 导出
- `packages/belldandy-skills/src/index.ts` 总导出
- `packages/belldandy-core/src/bin/gateway.ts` 注册

说明：

- 这些工具已进入 Gateway 默认工具集合
- 启动后即可被 Agent 调用

#### D. 第三优先级新增测试覆盖

本轮在 `packages/belldandy-skills/src/builtin/office/office.test.ts` 中继续补充了定向测试，新增覆盖：

1. `office_workshop_mine`
2. `office_workshop_update`
3. `office_workshop_delete`
4. `office_homestead_mount`
5. `office_homestead_unmount`
6. `office_homestead_open_blind_box`

目前该测试文件总计：

- `14` 个测试全部通过

已实际执行：

- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/builtin/office/office.test.ts`

结果：

- `1` 个测试文件通过
- `14` 个测试全部通过

#### E. 第三优先级结论

截至 **2026-03-09**，第三优先级可判断为：

> **已完成第一批落地实现，且核心扩展能力已有测试保护。**

这意味着当前 Agent 官网能力已经覆盖：

- 工坊：
  - 搜索
  - 详情
  - 下载
  - 发布
  - 我的作品
  - 更新
  - 删除
- 家园：
  - 获取家园
  - 获取仓库
  - claim
  - 放置
  - 收回
  - 挂载
  - 取消挂载
  - 开盲盒

### 第四优先级：审计增强（二期）

建议二期考虑增加：

- 工坊作品写操作审计字段：
  - `createdByAgentId`
  - `updatedByAgentId`
- 家园关键操作日志中记录 `agentId`

这样可以区分：

- 是用户本人操作
- 还是哪个 Agent 代主人操作

### 第四优先级执行结果（2026-03-09 已完成）

本轮已完成第四优先级中的**低风险审计增强与配置体验收尾**，未引入数据库 schema 变更。

#### A. 官网服务端已补轻量审计日志

已在 `office.goddess.ai/server/src/middleware/auth.ts` 增加：

- `auditOfficeAgentAction(scope, action, actor, details)`

当前策略：

- 仅当 `authType = agent` 时输出审计日志
- 不记录敏感信息，不记录正文内容本身
- 只记录轻量结构化字段，如：
  - `scope`
  - `action`
  - `ownerUserId`
  - `agentId`
  - `itemId` / `inventoryId` / `homesteadId`

已接入的写操作：

- 工坊：
  - `publish`
  - `update`
  - `delete`
- 家园：
  - `claim`
  - `update_name`
  - `update_message`
  - `place`
  - `recall`
  - `mount`
  - `unmount`
  - `open_blind_box`

这意味着当前已经可以在服务端日志中区分：

- 用户本人直接操作
- Agent 代主人执行的官网写操作

#### B. `community.json` 体验增强已落地

已在 `packages/belldandy-channels/src/community.ts` 为 Agent 配置补齐可选 `office` 字段：

- `office.downloadDir`
- `office.uploadRoots`

其中：

- `downloadDir`：作为工坊默认下载目录
- `uploadRoots`：作为工坊发布/读取本地文件时的额外白名单根目录

对应工具侧能力已接入：

- `packages/belldandy-skills/src/builtin/office/client.ts`
  - 新增 `getUploadRoots()`
  - 新增 `resolveUploadPath()`
  - 默认下载目录支持读取 `office.downloadDir`
- `packages/belldandy-skills/src/builtin/office/workshop.ts`
  - `office_workshop_publish` 已接入 `office.uploadRoots`
  - `manifest_path` 也使用同一白名单策略

这使得 Agent 可以：

- 默认下载到用户指定目录
- 从工作区外、但在 `community.json` 明确声明的素材目录上传工坊文件

#### C. 社区向导已避免覆盖 `office` 配置

已调整：

- `packages/belldandy-core/src/community/wizard.ts`

当前行为：

- 当用户通过社区向导更新已有 Agent 的 `apiKey` / `room` 时
- 会保留原有 `office` 配置

这样可以避免手动维护的 `downloadDir` / `uploadRoots` 被向导更新操作意外覆盖。

#### D. 定向测试与构建验证已通过

本轮新增并通过了以下测试：

- `packages/belldandy-skills/src/builtin/office/office.test.ts`
  - 新增 `office.downloadDir` 默认下载目录测试
  - 新增 `office.uploadRoots` 工作区外上传白名单测试
- `packages/belldandy-core/src/community/wizard.test.ts`
  - 新增更新已有 Agent 时保留 `office` 配置测试

本轮实际验证结果：

- `office.test.ts` + `wizard.test.ts`：共 `20` 条测试通过
- `@belldandy/channels` build 通过
- `@belldandy/skills` build 通过
- `@belldandy/core` build 通过
- `office.goddess.ai/server` build 通过

#### E. 本轮明确未做的高风险项

本轮**没有**执行以下高风险变更：

- 未新增数据库审计字段
- 未修改 `workshop_items` 表结构
- 未执行新的数据库迁移

原因是：

- 当前轻量日志已经足够支撑联调、排障和归因
- 避免在未单独评审数据模型前引入 schema 兼容与迁移风险

如果后续确实需要“持久化到数据库”的审计能力，再单独做一轮表结构设计与迁移评审会更稳。

### 当前建议的执行顺序

推荐按以下顺序推进：

1. 先做真实联调
2. 再补工具测试
3. 再补 mount / unmount / blind box 等扩展能力
4. 最后再做审计字段与体验增强

当前实际进度：

- 第 1 步：**已完成**
- 第 2 步：**已完成**
- 第 3 步：**已完成第一批实现**
- 第 4 步：**已完成低风险审计增强与配置体验收尾**
- 如需继续，下一步建议进入：**数据库持久审计字段评审（独立高风险事项）**

---

## 2. 现状结论

### 2.1 `community.json` 目前已经具备官网访问所需的核心身份信息

当前 `C:\Users\admin\.belldandy\community.json` 示例：

```json
{
  "endpoint": "http://localhost:3001",
  "agents": [
    {
      "name": "贝露丹蒂",
      "apiKey": "gro_xxx",
      "room": {
        "name": "Aira"
      }
    }
  ],
  "reconnect": {
    "enabled": true,
    "maxRetries": 10,
    "backoffMs": 5000
  }
}
```

这里已经包含：

- `endpoint`：官网/社区服务地址
- `agents[].name`：Agent 名称
- `agents[].apiKey`：官网 API Key

这三个字段已经足够让服务端识别：

- 当前是哪一个 Agent
- Agent 属于哪个官网用户
- 请求应访问哪一个 `office.goddess.ai` 实例

所以：

**MVP 不需要新增认证配置字段**，只需要复用现有字段即可。

---

### 2.2 聊天室能力已经是“配置 -> 渠道 -> 工具”的成熟链路

现有实现链路：

1. `packages/belldandy-channels/src/community-config.ts`
   - 负责加载/保存 `community.json`
2. `packages/belldandy-channels/src/community.ts`
   - 使用 `X-API-Key` + `X-Agent-ID` 调用 `office.goddess.ai` 社区接口
   - 管理 WebSocket / join_room / leave_room
3. `packages/belldandy-core/src/bin/gateway.ts`
   - 启动时加载 `community.json`
   - 注册 `join_room` / `leave_room` 工具

这说明 Belldandy 已经具备一个很明确的扩展方向：

> **继续复用 `community.json`，新增“官网 HTTP 工具集”即可。**

---

### 2.3 官网后端已经有“Agent API Key 鉴权”能力，但目前只主要用于聊天室

`office.goddess.ai/server/src/middleware/auth.ts` 已支持三种鉴权方式：

- `authRequired`：用户 JWT
- `agentAuthRequired`：`X-API-Key + X-Agent-ID`
- `mixedAuthRequired`：用户 JWT 或 Agent API Key 二选一

目前 `rooms.ts` 已经在使用 `mixedAuthRequired`，所以这是一条**已经在仓库中被验证过的模式**。

结论：

> **工坊和家园不需要新发明第三套鉴权；推荐直接复用 `mixedAuthRequired` / `agentAuthRequired`。**

---

### 2.4 工坊与家园的读写接口已存在，但大多数写接口仍绑定用户 JWT

#### 工坊现有接口

后端已存在：

- `GET /api/workshop/items`：列表/搜索/分页
- `GET /api/workshop/items/:id`：详情
- `GET /api/workshop/items/:id/download`：下载
- `POST /api/workshop/items`：发布（当前 `authRequired`）
- `GET /api/workshop/mine`：我的作品（当前 `authRequired`）

前端 `src/lib/api.ts` 也已有对应 `workshopApi`。

#### 家园现有接口

后端已存在：

- `GET /api/town-square/homestead/:id`：公开查看指定家园
- `GET /api/town-square/my-homestead`：我的家园（当前 `authRequired`）
- `GET /api/town-square/inventory`：仓库（当前 `authRequired`）
- `POST /api/town-square/place`：放置（当前 `authRequired`）
- `POST /api/town-square/recall`：收回（当前 `authRequired`）

前端 `src/lib/api.ts` 也已有对应 `townSquareApi`。

结论：

> **官网本身已经具备工坊/家园 API，Belldandy 侧主要缺的是 Agent 复用入口，而不是业务接口本身。**

---

## 3. 设计原则

### 3.1 配置层原则

- 继续使用 `community.json` 作为**唯一官网连接配置**
- 不在 `community.json` 中存储用户 JWT
- `room` 仍只负责聊天室，不影响官网工具使用

### 3.2 服务端原则

- 尽量复用既有 `/api/workshop/*` 与 `/api/town-square/*`
- 尽量改为 **mixed auth**，而不是复制一套 `/api/agent/*`
- 对前端现有返回结构保持兼容

### 3.3 Agent 工具原则

- 工具对大模型暴露的是**任务语义**，不是裸 HTTP 细节
- 工具内部统一处理：
  - 从 `community.json` 找 Agent
  - 注入 `X-API-Key` / `X-Agent-ID`
  - 路径校验
  - 文件上传/下载
  - 错误信息归一化

### 3.4 安全原则

- 上传文件路径只能落在允许的工作区根目录内
- 下载路径只能落在允许目录内
- 不回显 API Key
- 不把浏览器登录态复制到本地配置中

---

## 4. 推荐方案：复用现有接口，新增 Agent 官网客户端与工具

## 4.1 方案对比

### 方案 A：新增独立 `/api/agent/workshop/*`、`/api/agent/homestead/*`

优点：

- 与前端用户接口完全隔离
- Agent 语义可以做得很强

缺点：

- 服务端逻辑复制严重
- 工坊/家园规则要维护两套
- 后续 UI 和 Agent 容易出现行为漂移

### 方案 B：复用现有官网接口，给写接口增加 mixed auth

优点：

- 改动集中，复用率高
- 业务规则只有一套
- Agent 与官网页面行为更一致

缺点：

- 需要把部分路由内部从“只认 userId”改造成“认 ownerUserId”

### 推荐结论

**推荐方案 B。**

原因：当前 `rooms.ts` 已经采用了 `mixedAuthRequired`，说明该架构已经被接受；工坊/家园继续沿用这条路径，成本最低、可维护性最好。

---

## 5. `community.json` 复用方案

## 5.1 MVP：零新增字段

MVP 直接复用：

- `endpoint`
- `agents[].name`
- `agents[].apiKey`

工具内部按如下逻辑工作：

1. 读取 `community.json`
2. 根据 `agent_name` 找到 `agents[]`
3. 以 `endpoint` 作为官网地址
4. 请求时自动注入：
   - `X-API-Key: <apiKey>`
   - `X-Agent-ID: <agentName>`

这样就能与当前聊天室的身份体系保持一致。

---

## 5.2 建议的可选扩展字段（向后兼容）

如果后续希望减少工具调用参数，可以给每个 Agent 增加一个**可选**的 `office` 块：

```json
{
  "endpoint": "http://localhost:3001",
  "agents": [
    {
      "name": "贝露丹蒂",
      "apiKey": "gro_xxx",
      "room": { "name": "Aira" },
      "office": {
        "downloadDir": "./downloads/office",
        "uploadRoots": [
          "./packages",
          "./apps",
          "./workspace"
        ],
        "defaultWorkshopCategory": "skills",
        "autoClaimHomestead": false
      }
    }
  ]
}
```

建议说明：

- `downloadDir`：默认下载目录
- `uploadRoots`：允许上传的本地目录白名单
- `defaultWorkshopCategory`：缺省分类
- `autoClaimHomestead`：访问家园接口时如未领取，是否自动调用 claim

注意：

- 这是**可选增强**，不是首期必须项
- 没有它也可以实现全部核心功能

---

## 6. 服务端改造设计

## 6.1 抽出统一“操作者上下文”解析

当前问题：

- `workshop.ts`、`town-square.ts` 里的写接口大多直接 `const userId = c.get("userId")`
- 一旦切换到 `mixedAuthRequired`，Agent 请求下 `userId` 不存在，只会有：
  - `agentId`
  - `agentOwnerId`
  - `authType`

因此建议新增一个统一 helper，例如：

```ts
type OfficeActor = {
  authType: "user" | "agent";
  userId: string;
  agentId?: string;
};

function resolveOfficeActor(c: Context): OfficeActor
```

规则：

- `authType === "user"` → `userId = c.get("userId")`
- `authType === "agent"` → `userId = c.get("agentOwnerId")`
- `agentId = c.get("agentId")`（若有）

这样所有工坊/家园的归属判断都可以统一基于 **owner userId**，不会破坏现有数据模型。

---

## 6.2 工坊路由改造

### 需要改造的接口

- `POST /api/workshop/items`
- `PUT /api/workshop/items/:id`
- `DELETE /api/workshop/items/:id`
- `GET /api/workshop/mine`

### 改造方式

把这些接口从：

- `authRequired`

改为：

- `mixedAuthRequired`

并把原先的 `userId` 逻辑改为：

- `const actor = resolveOfficeActor(c)`
- 使用 `actor.userId` 作为作品归属判断依据

### 关键细节

#### 发布作品

当前 `authorId` 存的是用户 ID，不是 Agent ID。建议**继续保持不变**：

- `authorId = actor.userId`

原因：

- 工坊作品本质归属于官网用户
- 现有表结构和前端展示都围绕作者用户设计

但建议补充**审计字段**（二期可做）：

- `createdByAgentId` nullable
- `updatedByAgentId` nullable

这样能记录“是谁代用户发的”。

#### 我的作品

`GET /mine` 在 Agent 模式下返回：

- 该 Agent 所属用户的作品列表

不需要改响应结构。

#### 下载

`GET /items/:id/download` 现在是公开接口；MVP 可以保持不变。

Agent 侧仍可通过统一客户端访问它；如果将来需要区分“谁下载了”，再额外扩展统计维度即可。

---

## 6.3 家园路由改造

### 需要改造的接口

- `GET /api/town-square/my-homestead`
- `POST /api/town-square/claim`
- `GET /api/town-square/inventory`
- `POST /api/town-square/place`
- `POST /api/town-square/recall`

建议顺手纳入（可选增强）：

- `POST /api/town-square/mount`
- `POST /api/town-square/unmount`
- `POST /api/town-square/open-blind-box`

### 改造方式

同样改为：

- `mixedAuthRequired`

并统一通过 `resolveOfficeActor(c)` 获取归属用户。

### 关键细节

#### 我的家园 / 仓库

Agent 模式下：

- `my-homestead` 返回 Agent 所属用户的家园
- `inventory` 返回该用户家园仓库

#### 放置 / 收回

所有原本基于 `userId` 找家园、查仓库、做更新的逻辑，都改用：

- `actor.userId`

这样可以最大限度复用现有事务逻辑和碰撞/上限校验逻辑。

#### 未领取家园时的处理

推荐支持两种模式：

1. **严格模式（默认）**：返回 `尚未领取家园`
2. **自动领取模式（可选）**：当 `office.autoClaimHomestead=true` 时，Agent 先自动调用 `claim`

MVP 建议先保守：

- 工具拿到 404 后提示用户/Agent 先调用 `homestead_claim`

---

## 6.4 为什么不建议把工坊/家园做成浏览器自动化

不推荐以“让 Agent 打开网页点按钮”为主路径，原因：

- 已有稳定后端 API，直接调用更可靠
- 浏览器 UI 变化会让 Agent 工具脆弱
- 上传/下载/坐标放置本来就是结构化操作，更适合 API

浏览器自动化可以作为兜底，但不应作为主实现。

---

## 7. Agent 侧实现设计

## 7.1 新增统一官网客户端 `OfficeSiteClient`

建议新增一个共享客户端，职责：

1. 读取 `community.json`
2. 按 `agent_name` 找到对应 Agent 配置
3. 组装请求头：
   - `X-API-Key`
   - `X-Agent-ID`
4. 封装：
   - JSON 请求
   - multipart/form-data 上传
   - 二进制下载
5. 做本地路径白名单校验
6. 统一错误信息

### 推荐放置位置

推荐新增：

- `packages/belldandy-skills/src/builtin/office/client.ts`

理由：

- 它服务的是“Agent 工具调用”场景
- 与 `join_room` / `leave_room` 同属工具基础设施层
- 不需要把 `channels` 包变成一个过于宽泛的 HTTP SDK 包

---

## 7.2 工坊工具设计

建议首批提供 4 个工具。

### 工具 1：`office_workshop_search`

用途：查看工坊内容、按关键词搜索。

建议参数：

- `agent_name` 必填
- `category` 可选：`skills | methods | apps | plugins | facets | mcp`
- `keyword` 可选
- `sort` 可选：`newest | popular | price_asc | price_desc`
- `free` 可选
- `page` / `limit` 可选

后端映射：

- `GET /api/workshop/items`

返回给模型的结果建议裁剪为：

- `id`
- `category`
- `title`
- `summary`
- `version`
- `price`
- `tags`
- `downloads`
- `author`

---

### 工具 2：`office_workshop_get_item`

用途：查看单个工坊作品详情。

建议参数：

- `agent_name` 必填
- `item_id` 必填

后端映射：

- `GET /api/workshop/items/:id`

适合让 Agent 在下载/发布前先读取元数据。

---

### 工具 3：`office_workshop_download`

用途：下载工坊作品到本地目录。

建议参数：

- `agent_name` 必填
- `item_id` 必填
- `target_dir` 可选
- `overwrite` 可选

后端映射：

- `GET /api/workshop/items/:id/download`

工具内部逻辑建议：

1. 先调详情接口拿到 `fileName` / `fileHash`
2. 再下载二进制
3. 保存到 `target_dir`
4. 如有 `fileHash` 则本地校验 SHA-256
5. 返回保存路径、文件大小、哈希校验结果

---

### 工具 4：`office_workshop_publish`

用途：上传/发布技能、方法、应用等作品。

建议参数：

- `agent_name` 必填
- `category` 必填
- `title` 必填
- `summary` 必填
- `description` 必填
- `file_path` 必填
- `version` 可选
- `price` 可选
- `tags` 可选
- `app_run_type` 可选
- `app_run_url` 可选
- `manifest_path` 可选

后端映射：

- `POST /api/workshop/items`

工具内部逻辑建议：

1. 校验 `file_path` 必须落在工作区白名单内
2. 按分类决定是否需要 `manifest`
3. 若提供 `manifest_path`，读取文件文本后随表单上传
4. 组装 `multipart/form-data`
5. 返回新作品 `id`、分类、标题、状态

#### 分类别名建议

为提高模型可用性，工具层建议做一层中英文/业务别名归一化：

- `技能` → `skills`
- `方法` / `方法论` → `methods`
- `应用` → `apps`
- `模组` → 默认映射 `plugins`

必要时可以再扩展：

- `MCP` → `mcp`
- `Facet` → `facets`

---

## 7.3 家园工具设计

建议首批提供 5 个工具。

### 工具 1：`office_homestead_get`

用途：获取家园信息。

建议参数：

- `agent_name` 必填
- `homestead_id` 可选
- `mine` 可选，默认 `true`

后端映射：

- `mine=true` → `GET /api/town-square/my-homestead`
- `homestead_id` 有值 → `GET /api/town-square/homestead/:id`

---

### 工具 2：`office_homestead_inventory`

用途：获取仓库物品数据。

建议参数：

- `agent_name` 必填

后端映射：

- `GET /api/town-square/inventory`

返回给模型时建议突出：

- `inventoryId`
- `itemId`
- `name`
- `type`
- `quantity`
- `prosperity`
- `sizeX` / `sizeY`

这样模型在后续放置时更容易推理。

---

### 工具 3：`office_homestead_place`

用途：在家园地块上放置仓库中的物品。

建议参数：

- `agent_name` 必填
- `inventory_id` 必填
- `x` 必填
- `y` 必填

后端映射：

- `POST /api/town-square/place`

返回内容建议包括：

- `message`
- `prosperity`
- `placedItems`（可裁剪）
- `inventoryItems`（可裁剪）

---

### 工具 4：`office_homestead_recall`

用途：收回地块上的物品。

建议参数：

- `agent_name` 必填
- `inventory_id` 必填

后端映射：

- `POST /api/town-square/recall`

---

### 工具 5：`office_homestead_claim`

用途：首次领取家园。

建议参数：

- `agent_name` 必填

后端映射：

- `POST /api/town-square/claim`

虽然你这次重点提的是查看/放置/收回，但这个工具建议一并做上；否则首次使用 Agent 家园能力时会卡在 404。

---

## 7.4 工具注册方式

参考现有 `join_room` / `leave_room`，建议在 `gateway.ts` 中：

1. 启动时加载 `community.json`
2. 构造 `OfficeSiteClient` 或 client factory
3. 注册上述 office 工具

建议注册时机：

- 与 CommunityChannel 同一初始化段落即可
- 即使 `room` 没配置，也应允许 office 工具工作

因为官网工具依赖的是：

- `endpoint`
- `apiKey`
- `agent_name`

而不是 `room`。

---

## 8. 推荐代码落点

## 8.1 Belldandy 侧

- `packages/belldandy-channels/src/community-config.ts`
  - 可选：为 `CommunityAgentConfig` 增加 `office` 可选字段说明
- `packages/belldandy-skills/src/builtin/office/client.ts`
  - 新增官网客户端
- `packages/belldandy-skills/src/builtin/office/workshop-search.ts`
- `packages/belldandy-skills/src/builtin/office/workshop-get-item.ts`
- `packages/belldandy-skills/src/builtin/office/workshop-download.ts`
- `packages/belldandy-skills/src/builtin/office/workshop-publish.ts`
- `packages/belldandy-skills/src/builtin/office/homestead-get.ts`
- `packages/belldandy-skills/src/builtin/office/homestead-inventory.ts`
- `packages/belldandy-skills/src/builtin/office/homestead-place.ts`
- `packages/belldandy-skills/src/builtin/office/homestead-recall.ts`
- `packages/belldandy-skills/src/builtin/office/homestead-claim.ts`
- `packages/belldandy-skills/src/index.ts`
  - 导出新工具
- `packages/belldandy-core/src/bin/gateway.ts`
  - 注册新工具

## 8.2 官网后端侧

- `office.goddess.ai/server/src/middleware/auth.ts`
  - 可选：抽 `resolveOfficeActor()` 或配套 helper
- `office.goddess.ai/server/src/routes/workshop.ts`
  - 发布/编辑/删除/我的作品切 mixed auth
- `office.goddess.ai/server/src/routes/town-square.ts`
  - 我的家园/claim/库存/place/recall 切 mixed auth

---

## 9. 分阶段实施建议

## Phase 1：只读能力（低风险，建议先做）

目标：先让 Agent “能看、能搜、能读、能下”。

内容：

- `office_workshop_search`
- `office_workshop_get_item`
- `office_workshop_download`
- `office_homestead_get`
- `office_homestead_inventory`

特点：

- 服务端几乎不用改，或只改极少部分
- 能先验证 `community.json` 复用链路是否顺畅

---

## Phase 2：核心写能力（本次目标主体）

目标：让 Agent 能真正操作官网资源。

内容：

- 工坊上传/发布
- 家园放置
- 家园收回
- 家园 claim

服务端改造：

- `workshop.ts` 写接口切 mixed auth
- `town-square.ts` 写接口切 mixed auth
- 落地 `resolveOfficeActor()`

---

## Phase 3：增强能力（二期）

内容：

- 家园 `mount` / `unmount`
- 盲盒开启
- 工坊“我的作品”管理增强
- 上传来源审计（记录 `agentId`）
- 中文分类别名/更强的工具提示词

---

## 10. 验证方案

## 10.1 配置兼容验证

验证点：

- 老的 `community.json` 不新增任何字段时，聊天室功能仍正常
- 新工具能通过同一个 `community.json` 找到 `endpoint` / `agent_name` / `apiKey`

---

## 10.2 服务端鉴权验证

验证点：

1. 用户 JWT 请求工坊/家园写接口仍可用
2. `X-API-Key + X-Agent-ID` 请求可用
3. 无效 API Key 返回 401
4. Agent 越权访问其他用户资源时返回 401/403

---

## 10.3 工坊能力验证

验证用例：

1. Agent 搜索 `skills` 分类，带关键词
2. Agent 读取某个作品详情
3. Agent 下载某个作品到本地目录
4. Agent 上传一个 `methods` 作品
5. Agent 上传一个 `apps` 作品（带 manifest）

预期：

- 搜索结果与官网页面一致
- 下载文件存在且哈希匹配
- 上传成功后能在 `mine` 或搜索列表中看到

---

## 10.4 家园能力验证

验证用例：

1. Agent 获取自己的家园信息
2. Agent 获取仓库列表
3. Agent 选择 `inventoryId` 放置到 `(x, y)`
4. Agent 收回该物品

预期：

- `placedItems` / `inventoryItems` 数量变化正确
- `prosperity` 更新与现有页面一致
- 越界坐标、碰撞坐标能得到明确错误

---

## 11. 风险点与规避

## 风险 1：现有路由大量直接依赖 `userId`

影响：

- 切 mixed auth 后容易漏改，导致 Agent 调用报错

规避：

- 先抽统一 `resolveOfficeActor()`
- 再逐个接口替换

---

## 风险 2：上传能力可能带来本地文件泄露风险

影响：

- 模型若能任意指定路径，可能上传超出工作区的文件

规避：

- 强制 `file_path` 落在工作区或 `uploadRoots` 白名单内
- 默认不允许绝对路径跨根目录上传

---

## 风险 3：家园首次未领取导致工具链中断

影响：

- `inventory` / `place` 等直接返回 404

规避：

- 同期提供 `office_homestead_claim`
- 或让工具在错误提示中明确下一步动作

---

## 风险 4：作品归属只记录用户，不记录 Agent

影响：

- 后续审计时无法分辨是谁代发的

规避：

- MVP 先保持兼容
- 二期增加 `createdByAgentId` / `updatedByAgentId`

---

## 12. 最终推荐落地顺序

### 第一步（最推荐）

先完成：

- `OfficeSiteClient`
- `office_workshop_search`
- `office_workshop_get_item`
- `office_workshop_download`
- `office_homestead_get`
- `office_homestead_inventory`

先把“读链路”跑通。

### 第二步

服务端切 `mixedAuthRequired`，完成：

- `office_workshop_publish`
- `office_homestead_claim`
- `office_homestead_place`
- `office_homestead_recall`

### 第三步

补审计、挂载、盲盒等增强功能。

---

## 13. 一句话结论

**最佳实现路径不是新建第二套官网配置，也不是走浏览器点页面，而是直接复用 `community.json` 中的 `endpoint + agent_name + apiKey`，把 `office.goddess.ai` 的工坊/家园写接口升级为 mixed auth，再在 Belldandy 中新增一组官网工具。**
