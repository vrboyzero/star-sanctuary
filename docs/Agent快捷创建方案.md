# Agent 快捷创建方案（可实施修订稿）

## 1. 目标

本方案的目标，是把“新建 Agent”从手改 `agents.json`，收敛成一个可直接在 WebChat 内完成的轻量创建入口。

## 1.1 当前实施进度（2026-05-03）

当前首版已经落地，状态如下：

### 已完成

1. 后端 `agent.create` 已实现，并已接入：
   - `packages/belldandy-core/src/server-methods/agents-system.ts`
   - `packages/belldandy-core/src/server.ts`
   - `packages/belldandy-core/src/server-websocket-runtime.ts`
2. 创建成功后会：
   - 追加写入 `agents.json`
   - 初始化 `agents/<id>/` 与 `agents/<id>/facets/`
   - 写入最小必要文件 `IDENTITY.md` 与 `SOUL.md`
3. WebChat 右侧 Agent 面板已增加顶部 `新建 Agent` 按钮与创建弹窗。
4. 弹窗已支持：
   - `id`
   - `displayName`
   - `model`
   - `systemPromptOverride`
5. 模型下拉已复用 `models.list`，失败时会 fallback 到 `primary`。
6. 创建成功后会显示稳定 notice，并提供：
   - `立即重启`
   - 直接打开 `agents.json` 对应条目
7. 创建失败 / 校验失败 notice 已改为持久显示，支持手动关闭。
8. 弹窗点击外部空白区域不会自动关闭。
9. 已补后端与前端测试，并做过实际 UI 联调。
10. Agent 面板样式已完成一轮可用性打磨：
   - 顶部按钮加宽
   - 与卡片间距收紧
   - 按钮增加内部淡蓝强调

### 已确认修复

1. 首次接线后出现过一个前端回归：
   - `app.js` 未解构 `agentCreate*` DOM 引用
   - 导致页面初始化报错
   - 进一步表现为右侧 Agent 信息打不开、输入框模型下拉消失
2. 该问题已经修复，当前不再阻塞 WebChat 正常使用。

### 本轮顺带完成的相关能力

1. `models.json` 条目已支持 `options` 原样透传到 OpenAI-compatible 请求体。
2. 已用本地 Ollama 实际验证 `options.num_ctx` 会真实带出。

### 未完成 / 明确保留

1. 仍然不支持新 Agent 在当前运行态热加载生效。
2. 创建成功后，当前 roster 不会立刻新增该 Agent；仍需重启 Gateway。
3. 当前前端文案主要依赖 fallback 字符串，尚未补齐独立 i18n 词条文件。
4. 首版仍未扩展到 `DREAM.md`、`memory/`、`sessions/` 等更大范围状态预制。

首版重点不是做“高级配置器”，而是提供一条低门槛、可落地、和当前代码结构一致的创建闭环：

1. 在 WebChat 右侧 Agent 面板顶部增加“新建 Agent”入口。
2. 用户填写少量基础字段：
   - `id`
   - `displayName`
   - `model`
   - `systemPromptOverride`
3. 后端基于稳定默认模板补齐 profile。
4. 后端写入 `BELLDANDY_STATE_DIR/agents.json`，并初始化最小必要的 Agent 目录与文件。
5. 前端明确提示：
   - 配置已保存
   - 当前运行态是否已生效
   - 是否需要立即重启 Gateway

---

## 2. 现状约束

本方案必须基于当前代码事实设计，不能假设系统已经支持运行态热加载。

### 2.1 当前前端已具备的可复用能力

已存在：

1. Agent 右侧面板与卡片渲染。
2. Agent 列表读取接口：
   - `agents.roster.get`
   - `agents.list`
3. 模型列表读取接口：
   - `models.list`
4. 已有 modal / notice / 配置文件编辑入口。
5. 已有 `system.restart` 可供前端触发重启。

前端相关位置：

- `apps/web/public/app/features/agent-runtime.js`
- `apps/web/public/app/features/chat-network.js`
- `apps/web/public/index.html`
- `apps/web/public/styles.css`

### 2.2 当前后端已具备的可复用能力

已存在：

1. `agents.json` 的 profile 加载能力。
2. Agent roster / catalog 查询能力。
3. per-agent workspace 目录约定：
   - 非 default Agent 使用 `BELLDANDY_STATE_DIR/agents/<workspaceDir>/`
4. Agent workspace 基础目录初始化能力：
   - `ensureAgentWorkspace`
5. per-agent 文件读取采用“Agent 目录优先，根目录 fallback”的现有机制。

后端相关位置：

- `packages/belldandy-agent/src/agent-profile.ts`
- `packages/belldandy-agent/src/workspace.ts`
- `packages/belldandy-core/src/bin/gateway.ts`
- `packages/belldandy-core/src/query-runtime-agent-roster.ts`
- `packages/belldandy-core/src/server-methods/agents-system.ts`
- `packages/belldandy-core/src/server-websocket-runtime.ts`

### 2.3 当前必须承认的限制

这是本修订稿和原稿最大的差异点。

#### 限制 1：新 Agent 不会在当前运行态自动生效

当前 Gateway 在启动时加载 `agents.json` 并构建 registry。  
因此首版不能承诺：

- “创建成功后立即出现在当前运行中的 Agent roster”
- “创建成功后无需重启即可直接使用”

首版应采用更明确、更稳妥的产品口径：

- 创建成功 = 配置和目录已落盘
- 运行态生效 = 需要重启 Gateway

#### 限制 2：不能凭空扩大发布范围

当前 agent workspace 的真实机制不是“创建一整套完全独立的大量运行目录”，而是：

1. 创建 `agents/<workspaceDir>/`
2. 创建 `facets/`
3. 对若干工作区文件按“Agent 目录优先，根目录 fallback”加载

因此首版不应把以下内容定义为“创建时必须有”：

- `dream-runtime.json`
- `DREAM.md`
- `dreams/`
- `memory/`
- `sessions/`

这些要么属于别的运行时能力，要么可以延迟创建，要么当前代码并未把它们作为新 Agent 的最低创建门槛。

#### 限制 3：不能依赖运行机已有 Agent 资产做主模板

首版不应依赖读取当前机器 `BELLDANDY_STATE_DIR/agents/coder/` 之类的运行态内容来“生成新 Agent”。

这样做的问题是：

- 环境相关
- 不可预测
- 难测试
- 难复现

首版应优先使用仓库内现有模板与固定规则做初始化，再将用户输入叠加进去。

---

## 3. 首版产品定义

### 3.1 入口位置

在右侧 Agent 信息栏顶部增加主按钮：

- 中文：`新建 Agent`
- 英文：`Create Agent`

这个按钮是整个 Agent 区域的主入口，不挂在单张卡片内部。

### 3.2 弹窗字段

弹窗保留 4 个字段：

1. `id`
2. `displayName`
3. `model`
4. `systemPromptOverride`

不在首版暴露更多高级字段。

### 3.3 成功后的产品口径

首版创建成功后，提示文案必须明确区分两件事：

1. 已保存：
   - `agents.json` 已写入
   - Agent 目录已初始化
2. 未生效：
   - 当前 Gateway 需重启后，新 Agent 才会进入运行态列表

建议成功提示提供两个动作：

1. `立即重启`
2. `稍后重启`

如果用户选择“立即重启”，前端调用现有 `system.restart`。

---

## 4. 字段设计与校验

### 4.1 `id`

这是唯一标识，必须做后端硬校验，不能只靠前端提示。

建议规则：

- 必填
- 仅允许：
  - 小写英文字母
  - 数字
  - 中划线 `-`
- 不能与已有 Agent 重名
- 不允许为 `default`

建议正则：

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

原因：

- 当前 `workspaceDir` 默认回退到 `id`
- 非法 `id` 会直接影响目录路径和后续检索

### 4.2 `displayName`

- 必填
- 允许中文、英文、混合
- 用于右侧面板与会话展示

### 4.3 `model`

直接复用 `models.list` 作为下拉数据源。

说明：

1. 当前模型目录接口已经和主界面模型选择器对齐。
2. `primary` 属于现有模型选择语义的一部分，首版不需要额外发明第二套来源。

兜底策略：

- 如果 `models.list` 读取失败，前端允许只显示一个兜底选项：`primary`

### 4.4 `systemPromptOverride`

- 必填
- 多行文本框
- 用于描述 Agent 的职责、能力、边界、风格

它是本次快捷创建中唯一承载“个性化差异”的主输入。

---

## 5. 首版创建范围

### 5.1 创建结果的准确定义

首版“新建 Agent”定义为：

1. 向 `agents.json` 追加一条合法 profile
2. 创建 `BELLDANDY_STATE_DIR/agents/<workspaceDir>/`
3. 创建 `BELLDANDY_STATE_DIR/agents/<workspaceDir>/facets/`
4. 创建最小必要的 Agent 专属覆盖文件

### 5.2 首版必须创建的文件

建议首版只创建下面两类“高价值且和当前机制直接匹配”的文件：

1. `IDENTITY.md`
2. `SOUL.md`

说明：

- `IDENTITY.md` 直接影响 roster 中的名称 / 头像解析。
- `SOUL.md` 直接影响该 Agent 的人格和规则覆盖。
- 这两份文件最适合承载用户填写的 `displayName` 与 `systemPromptOverride`。

### 5.3 首版不强制创建的内容

以下内容首版明确不作为“创建成功”的必要条件：

- `DREAM.md`
- `dream-runtime.json`
- `dreams/`
- `sessions/`
- `memory/`
- `HEARTBEAT.md`
- `BOOTSTRAP.md`
- Agent 目录下独立的 `AGENTS.md`
- Agent 目录下独立的 `TOOLS.md`
- Agent 目录下独立的 `USER.md`

原因：

1. 这些内容不是当前新 Agent 最低运行门槛。
2. 当前代码对多项内容已有根目录 fallback。
3. 首版需要控制范围，避免把“快捷创建”扩大成“完整状态空间预制器”。

### 5.4 文件初始化策略

首版采用：

- 仓库模板 / 固定模板驱动
- 用户输入做少量定制覆盖

不采用：

- 读取当前机器已有 Agent 目录作为主模板
- 自由生成大量不可解释的文件结构

当前实际模板回退顺序已经落地为：

1. 优先读取 `stateDir/experience-templates/`
2. 如果未提供，再回退到仓库内模板目录 `packages/belldandy-agent/src/templates/`
3. 如果模板文件缺失或读取失败，再回退到 `agent-create.ts` 中的代码兜底模板

当前约定的 stateDir 模板文件名为：

1. `experience-templates/agent-identity.md`
2. `experience-templates/agent-soul.md`

仓库回退模板对应为：

1. `packages/belldandy-agent/src/templates/IDENTITY.md`
2. `packages/belldandy-agent/src/templates/SOUL.md`

这样做的目的有三点：

1. 普通用户可以在自己的 `stateDir` 下做本地覆盖，不需要改仓库代码。
2. 仓库本身仍然有一套可维护的默认模板，不依赖运行机上已有 Agent 资产。
3. 即使模板文件不存在，快捷创建仍然不会因为缺模板而整体失败。

建议写入策略：

#### `IDENTITY.md`

至少包含：

- 名字：`displayName`
- 一段简短身份说明

#### `SOUL.md`

至少包含：

- 简要人格定位
- 将 `systemPromptOverride` 作为可解释的职责说明嵌入

当前模板替换规则已经落地为两层：

1. 如果模板中包含占位符，则优先替换占位符：
   - `{{agentId}}`
   - `{{displayName}}`
   - `{{model}}`
   - `{{systemPromptOverride}}`
2. 如果模板没有这些占位符，则按现有 markdown 字段尽量填充：
   - `IDENTITY.md` 优先写 `名字`、`职责`
   - `SOUL.md` 优先写 `名称`、`角色定位`

如果模板既没有占位符，也没有可替换字段，系统还会追加一段“快捷创建补充”内容，避免用户填写的角色描述被吞掉。

---

## 6. Profile 自动补齐策略

首版以“稳定默认模板 + 少量规则推导”为原则。

建议默认 profile：

```json
{
  "id": "<id>",
  "displayName": "<displayName>",
  "model": "<model>",
  "systemPromptOverride": "<systemPromptOverride>",
  "kind": "resident",
  "workspaceBinding": "current",
  "workspaceDir": "<id>",
  "memoryMode": "hybrid",
  "defaultRole": "default",
  "toolsEnabled": true
}
```

说明：

1. `workspaceDir` 首版与 `id` 保持一致。
2. 不在首版引入复杂权限推导。
3. 不在首版自动推断 `coder / researcher / verifier` 等 role。
4. 若后续需要模板化角色，可作为二期增强。

---

## 7. 后端实施方案

### 7.1 新增方法

新增 WebSocket 方法：

- `agent.create`

请求参数：

```json
{
  "id": "coder-lite",
  "displayName": "代码助手",
  "model": "primary",
  "systemPromptOverride": "你是一名严谨的代码助手，擅长排查前端和 Node.js 问题。"
}
```

返回建议：

```json
{
  "agentId": "coder-lite",
  "configWritten": true,
  "workspaceCreated": true,
  "createdFiles": [
    "IDENTITY.md",
    "SOUL.md"
  ],
  "createdDirectories": [
    "agents/coder-lite",
    "agents/coder-lite/facets"
  ],
  "requiresRestart": true
}
```

### 7.2 后端执行步骤

#### 步骤 1：参数校验

校验：

1. `id` 非空
2. `id` 格式合法
3. `id !== "default"`
4. `id` 未被现有 profile 占用
5. `displayName` 非空
6. `model` 非空
7. `systemPromptOverride` 非空白

#### 步骤 2：读取并修改 `agents.json`

建议：

1. 读取现有 `agents.json`
2. 解析为对象
3. 追加新 profile
4. 原子写回

要求：

- 写入失败时不能留下半写文件
- 报错时给前端明确错误码

#### 步骤 3：初始化 Agent 目录

调用现有目录初始化能力，确保：

1. `agents/<workspaceDir>/`
2. `agents/<workspaceDir>/facets/`

#### 步骤 4：写入最小必要文件

创建或写入：

1. `IDENTITY.md`
2. `SOUL.md`

原则：

- 只写当前新 Agent 自己需要覆盖的内容
- 不复制整套根目录文件
- 保持和现有 fallback 机制兼容

#### 步骤 5：返回结构化结果

返回：

1. 是否成功
2. 创建了哪些目录
3. 创建了哪些文件
4. 是否需要重启

### 7.3 必须补充的接线点

这部分是原稿里漏掉的关键项。

除了新增后端实现外，还必须同步：

1. `packages/belldandy-core/src/server-methods/agents-system.ts`
   - 增加 `agent.create`
2. `packages/belldandy-core/src/server.ts`
   - 方法分发接入
3. `packages/belldandy-core/src/server-websocket-runtime.ts`
   - 将 `agent.create` 加入允许方法列表

否则前端无法调用。

---

## 8. 前端实施方案

### 8.1 UI 改动

建议涉及：

- `apps/web/public/index.html`
- `apps/web/public/app/features/agent-runtime.js`
- `apps/web/public/app/features/chat-network.js`
- `apps/web/public/styles.css`
- `apps/web/public/app/i18n/zh-CN.js`
- `apps/web/public/app/i18n/en-US.js`

### 8.2 前端流程

#### 步骤 1：顶部按钮

在 Agent 面板顶部增加“新建 Agent”按钮。

#### 步骤 2：弹窗

弹窗包含：

1. `id`
2. `displayName`
3. `model`
4. `systemPromptOverride`

#### 步骤 3：加载模型

打开弹窗时调用 `models.list`。

如果失败：

- 仅显示 `primary`

#### 步骤 4：提交创建

点击“创建”后，调用：

- `agent.create`

#### 步骤 5：成功反馈

成功后：

1. 关闭弹窗
2. 提示“配置已写入”
3. 提示“需重启 Gateway 后生效”
4. 提供“立即重启”按钮
5. 提供“编辑配置”入口，可直接打开 `agents.json`

### 8.3 首版不要承诺的前端行为

首版不要承诺：

1. 当前列表立即出现新 Agent
2. 自动滚动到新 Agent
3. 无重启直接可聊天

这些行为只有在后端补充运行态热加载后才成立。

---

## 9. 测试与验证计划

### 9.1 后端测试

至少覆盖：

1. 成功创建新 Agent
2. `id` 重复时报错
3. `id` 非法时报错
4. `agents.json` 成功写入
5. `agents/<id>/` 和 `facets/` 成功创建
6. `IDENTITY.md` 和 `SOUL.md` 成功写入
7. 返回值中 `requiresRestart === true`

### 9.2 前端验证

至少覆盖：

1. 顶部按钮展示正常
2. 弹窗可打开
3. `models.list` 可正常加载
4. `models.list` 失败时能 fallback 到 `primary`
5. 表单校验正常
6. 创建成功后成功提示正确
7. 点击“立即重启”可调用 `system.restart`

### 9.3 手动验证

建议手动走一遍：

1. 创建一个新 Agent
2. 检查 `agents.json` 是否新增 profile
3. 检查 `agents/<id>/` 与 `facets/` 是否创建
4. 检查 `IDENTITY.md` / `SOUL.md` 内容是否合理
5. 在不重启时确认新 Agent 尚未进入当前 roster
6. 重启后确认新 Agent 可出现在 Agent 列表

---

## 10. 风险与边界

### 风险 1：用户误以为“创建成功 = 立即可用”

解决方式：

- 成功提示中明确写“已保存，重启后生效”

### 风险 2：接口接入不完整

解决方式：

- 明确把 `server-websocket-runtime.ts` 加入改动清单

### 风险 3：创建范围扩大导致实现失控

解决方式：

- 首版只做：
  - profile 写入
  - 最小目录创建
  - `IDENTITY.md`
  - `SOUL.md`

### 风险 4：生成内容不稳定

解决方式：

- 首版不用自由生成
- 使用固定模板 + 用户输入填充

---

## 11. 分阶段建议

### 阶段 1：后端创建能力

状态：已完成

1. `agent.create`
2. `agents.json` 原子写入
3. Agent 目录初始化
4. `IDENTITY.md` / `SOUL.md` 写入
5. 测试补齐

### 阶段 2：前端入口

状态：已完成

1. 顶部按钮
2. 创建弹窗
3. 模型下拉
4. 提交调用
5. 成功提示

### 阶段 3：重启闭环

状态：部分完成

1. 成功后“立即重启”
2. 重启倒计时提示
3. 重连后重新加载 roster

说明：

1. 前两项已实现。
2. 第 3 项目前仍主要依赖现有 Gateway 重启后的页面重连 / 手动刷新链路，不属于这次快捷创建首版单独增强的范围。

---

## 12. 下一步计划（2026-05-03）

在首版已经可用的前提下，当前确认值得继续推进的后续项如下：

### 12.1 统一模板解析方式

目标：

1. 让 Agent 快捷创建读取仓库模板时，不再手写 `packages/belldandy-agent/src/templates/...` 路径。
2. 改为复用发布包兼容的统一模板目录解析方式。

原因：

1. 现有 workspace 模板加载已经通过 `resolveWorkspaceTemplateDir(...)` 统一处理源码运行、Portable、Single-Exe 等形态。
2. 快捷创建如果继续直接拼 `src/templates` 路径，在发布包场景下存在路径失效风险。

计划：

1. `agent-create.ts` 改为通过统一模板目录解析器获取仓库模板目录。
2. 保留 `stateDir/experience-templates/` 优先级不变。
3. 保留代码兜底模板，避免模板缺失时创建失败。
4. 补对应测试，覆盖源码路径与 stateDir 覆盖逻辑。

### 12.2 补完整重启后 roster 自动刷新

目标：

1. 用户点击“立即重启”后，页面恢复连接时自动重新拉取 Agent roster。
2. 尽量减少“重启成功了，但新 Agent 仍没显示出来”的感知割裂。

已完成：

1. 保持现有 `hello-ok -> loadAgentList()` 重连刷新链路不变。
2. 创建成功后，前端会在 `sessionStorage` 记录一个临时的待恢复 `agentId`。
3. Gateway 重启并重连成功后，`loadAgentList()` 会在 roster 中优先恢复该 `agentId` 的选中状态。
4. 一旦新 Agent 已成功出现在 roster 中，对应待恢复标记会被清除，避免后续连接持续抢占当前选中项。
5. 整体实现仍复用原有页面初始化 / WebSocket 恢复流程，没有新增第二套同步机制。

### 12.3 补正式 i18n 词条

目标：

1. 去掉 Agent 快捷创建链路中过多依赖 fallback 字符串的现状。
2. 让弹窗、notice、重启动作文案进入正式 i18n 维护面。

已完成：

1. 快捷创建链路中创建按钮、弹窗字段、校验失败、创建成功、立即重启、重启失败、头像相关提示、编辑/详情按钮等文案，已改为直接使用正式 i18n key。
2. `zh-CN` 与 `en-US` 已同步补齐缺失词条，不再依赖这条链路内部的 fallback 字符串兜底。
3. 继续处理相关提示文案也已补齐正式 key，包括：
   - `agentPanel.openContinuationConversationHint`
   - `agentPanel.openContinuationSessionHint`
4. 相关前端测试已改为直接走真实词典，避免“词条缺失但 fallback 仍让测试通过”的假阳性。
5. 已完成回归验证，确认创建成功、失败提示、重启提示与继续处理提示文案正常。

### 12.4 本轮执行顺序

本轮按下面顺序推进：

1. 先完成“统一模板解析方式”
2. 再做“重启后 roster 自动刷新”  已完成
3. 最后做“正式 i18n 词条收口”  已完成

---

## 13. 首版验收口径

首版完成后，按以下标准验收：

1. 用户无需手改 `agents.json` 即可创建 Agent
2. 创建请求会被后端严格校验
3. 成功后 `agents.json` 与 Agent 目录都已落盘
4. 前端会明确告知“已保存”和“需重启生效”
5. 用户可直接触发重启完成生效闭环

---

## 14. 一句话结论

这项需求可以做，且首版应定义为：

“一个面向普通用户的 Agent 轻量创建入口，负责完成 profile 落盘、最小 Agent 资产初始化，以及重启生效闭环；不在首版承诺运行态热加载和大范围状态预制。”
