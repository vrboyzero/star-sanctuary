# Agent 快捷创建方案

## 1. 我对需求的理解

这次需求的核心目标，不是单纯“多一个按钮”，而是要把“新建 Agent”这件事从手改 `agents.json`，变成一个更顺手、更低门槛的快捷入口。

希望达到的效果是：

1. 在 WebChat 右侧的 Agent 信息栏顶部，增加一个明显但不突兀的入口按钮。
2. 点击后，弹出一个“新建 Agent”窗口。
3. 用户只需要填写少量关键内容：
   - `id`
   - `displayName`
   - `model`
   - `systemPromptOverride`
4. 其他配置项不让用户手填，而是由系统根据这几个输入，尤其是 `systemPromptOverride` 里的角色描述，自动补齐为一份完整的 Agent 配置。
5. 创建完成后，这个新 Agent 会进入现有 Agent 列表，并写入 `BELLDANDY_STATE_DIR` 下的 `agents.json`。
6. 同时还要在 `BELLDANDY_STATE_DIR/agents/<agentId>/` 下创建对应 Agent 目录及相关初始文件，确保这次创建的是一个完整 Agent，而不是只新增一条配置记录。

你的意思我理解为：

- 这是一个“快捷创建通道”，不是完整高级配置器。
- 用户先说清“这个 Agent 是谁、叫什么、用什么模型、主要职责是什么”。
- 剩下的细节由系统代办，尽量降低理解和操作成本。

---

## 2. 这件事要解决什么问题

当前如果想新建 Agent，用户通常要：

1. 先找到 `agents.json`
2. 手动理解 JSON 结构
3. 自己补齐一整段配置
4. 再检查字段名、格式、模型名、角色设定是否写对

这个流程对熟悉配置文件的人还好，但对普通使用者、策划或内容型用户来说，门槛偏高。

所以这个功能更像是：

“给 Agent 创建提供一个轻量、直观、可引导的入口，让用户用接近表单填写的方式完成配置。”

---

## 3. 页面设计建议

### 3.1 Agent 信息栏顶部按钮

建议在右侧 Agent 信息栏的最顶部，加一个统一入口按钮。

建议按钮文案：

- 中文：`新建 Agent`
- 英文：`Create Agent`

布局建议：

- 放在 Agent 卡片列表上方
- 与当前右侧栏整体样式保持一致
- 不需要做得太大，但要比单张卡片内按钮更显眼
- Agent 卡片整体向下顺延即可，不需要改卡片结构

这个按钮的定位应该是：

“整个 Agent 区域的主入口操作”

而不是某张卡片的附属操作。

---

### 3.2 新建 Agent 弹窗

点击顶部按钮后，打开一个“新建 Agent”弹窗。

建议弹窗标题：

- 中文：`新建 Agent`
- 英文：`Create Agent`

建议弹窗说明文案：

- 中文：`填写基础信息后，系统会根据你的描述自动补齐其余配置。`
- 英文：`Fill in the basic information and the system will complete the remaining configuration for you.`

---

## 4. 弹窗字段设计

### 4.1 `id`

这是 Agent 的唯一标识。

建议说明用语：

- 中文：`唯一标识，用于系统内部识别。建议使用英文、小写，支持数字与中划线，例如 coder、reviewer、ops-helper。`
- 英文：`Unique identifier used by the system. Use lowercase English letters, numbers, and hyphens, for example: coder, reviewer, ops-helper.`

建议交互：

- 必填
- 输入时就做基础校验
- 如果和已有 Agent 重名，要立即提示，避免用户填完后才失败

---

### 4.2 `displayName`

这是展示给用户看的名字。

这里确实需要注意中英文切换。

建议字段标题：

- 中文界面显示：`显示名称（displayName）`
- 英文界面显示：`Display Name (displayName)`

建议说明：

- 中文：`用于右侧 Agent 信息栏、会话展示等界面显示。可以填写中文名，例如“代码专家”“调研助手”。`
- 英文：`Visible name shown in the Agent panel and related views.`

建议交互：

- 必填
- 允许中文、英文、混合命名

---

### 4.3 `model`

这里用下拉框是合理的。

建议来源：

- 使用 `BELLDANDY_STATE_DIR` 下 `models.json` 中可选模型
- 与 WebChat 消息输入区右下角模型选择器保持同一套来源和展示习惯

我这里有一个明确建议：

- 下拉框里除了 `models.json` 里的模型，最好也保留一个 `primary` 选项

原因很简单：

- 很多 Agent 实际上不是绑定某个固定模型，而是跟随主模型配置走
- 这和现有 `agents.json` 的使用习惯是一致的

建议展示方式：

- 显示名称优先展示可读名称
- 同时保留模型 id，避免用户选错

例如：

- `主模型（primary）`
- `DeepSeek V4 Flash (deepseek-v4-flash)`
- `MiniMax (minimax-main)`

---

### 4.4 `systemPromptOverride`

这个字段是这次快捷创建里最关键的一项，因为它承载的是：

- 这个 Agent 是谁
- 它擅长什么
- 它回答时应该是什么风格
- 它主要负责什么工作

所以这个输入框应该明显大一些，最好是多行输入框。

建议字段标题：

- 中文界面显示：`角色描述（systemPromptOverride）`
- 英文界面显示：`Role Description (systemPromptOverride)`

建议说明：

- 中文：`描述这个 Agent 的职责、能力、风格和边界。系统会根据这段描述，自动补齐其他默认配置。`
- 英文：`Describe the Agent's responsibility, strengths, tone, and boundaries. The system will use this description to complete the remaining default configuration.`

建议输入框高度：

- 明显大于普通单行输入框
- 至少能舒适容纳 5 到 8 行文字

建议给一个占位提示，例如：

`你是一名严谨的代码专家，擅长排查前端和 Node.js 问题。回答要简洁、专业，优先给出可执行修改建议。`

---

## 5. 创建流程设计

这里建议把“快捷创建”设计成一个简单、直观的 4 步流程。

### 第 1 步：用户填写基础信息

用户填写：

- `id`
- `displayName`
- `model`
- `systemPromptOverride`

### 第 2 步：系统自动补齐剩余配置

系统根据上述输入，自动生成一份完整 Agent 配置。

这里的“自动补齐”建议理解为：

- 不要求用户自己认识所有字段
- 系统按既定规则补全常用配置
- 对用户隐藏大部分复杂参数

例如可自动处理：

- Agent 的默认类型
- 默认工作区绑定方式
- 默认记忆模式
- 默认角色
- 是否开启工具
- 是否沿用安全的默认工具边界

这部分应该让系统做，但不应该让用户一开始面对一大堆复杂选项。

### 第 3 步：系统创建完整 Agent 资产

这里必须明确：

新建 Agent 不能只理解为“往 `agents.json` 里追加一段内容”。

它应该是一套完整创建动作，至少包含两部分：

1. 写入 `BELLDANDY_STATE_DIR/agents.json`
2. 创建 `BELLDANDY_STATE_DIR/agents/<agentId>/` 下的对应 Agent 目录及相关初始文件

也就是说，这次功能创建的是“完整 Agent 实体”，不是“只生成一个配置项”。

如果目录和初始文件没有一起建出来，就很容易出现一种不好的体验：

- 右侧列表里已经能看到新 Agent
- 但它实际上并不完整
- 后续依赖 Agent 目录或相关文件的能力无法正常工作

所以建议产品和实现都采用统一口径：

- 新建 Agent = 创建配置 + 创建 Agent 目录 + 创建必要初始文件

而不是：

- 新建 Agent = 只改 `agents.json`

建议创建成功后：

- 新 Agent 立即出现在右侧 Agent 列表中
- 列表自动滚动到新 Agent
- 给用户一个清晰的成功提示

### 第 4 步：提示后续动作

这里有一个非常重要的产品点：

当前 `agents.json` 的变更，并不一定代表运行态已经立刻刷新。

所以创建成功后，建议明确告诉用户：

- 配置已经写入
- 是否需要重启服务或刷新运行态
- 新 Agent 什么时候真正可用

如果后端当前就是“改完要重启”，那前端必须说清楚，避免用户以为“创建成功 = 立刻生效”。

---

## 6. 我认为需要提前明确的几个问题

### 6.1 `id` 不能重复

这是必须做的硬限制。

否则会出现：

- 新 Agent 覆盖旧 Agent
- 路由、默认绑定、历史引用混乱
- 用户以为创建成功，实际写坏配置

建议：

- 输入时即时校验
- 保存前再校验一次

---

### 6.2 `model` 下拉框的空状态要考虑

如果 `models.json` 当前为空、读取失败，或者没有可选模型，弹窗不能直接变成“没法用”。

建议兜底策略：

- 至少保留 `primary`
- 如果外部模型列表读取失败，也允许用户继续创建基于 `primary` 的 Agent

这样不会因为模型配置读取问题，把整个创建流程卡死。

---

### 6.3 “自动补齐”不能完全放飞

这是我最重要的建议之一。

你提到“其他内容让主 Agent 依据描述去创建，按完整的 Agent 创建流程进行”，这个方向没问题，但要防止两个风险：

1. 自动生成内容不稳定
2. 自动生成出过宽的权限或不合适的默认值

所以更稳妥的做法是：

- 让系统“在一个安全默认模板上补齐”
- 而不是“完全自由生成一份未知配置”

更通俗地说：

系统可以聪明，但底座要稳。

结合当前实际状态目录，我建议这里再说得更具体一些：

新 Agent 的自动补齐，不应该凭空“脑补”一整套人格与文件结构，而应该优先参考 `BELLDANDY_STATE_DIR` 中已经存在的真实 Agent 资产。

建议参考来源至少包括：

- 根目录下的 `SOUL.md`
- 根目录下的 `IDENTITY.md`
- 已有 Agent 目录中的对应文件，例如 `BELLDANDY_STATE_DIR/agents/coder/`
- 其中已有的 `SOUL.md`
- `IDENTITY.md`
- `DREAM.md`
- `dream-runtime.json`
- 以及相关目录结构，例如 `sessions/`、`memory/`、`dreams/`、`facets/`

这件事的正确理解应该是：

- 主 Agent 不是“自由写作”
- 主 Agent 是“参考现有体系，为新 Agent 生成一份结构一致、风格合理、内容定制化的初始资产”

也就是说，系统应该做的是：

1. 参考现有主 Agent 与成熟 Agent 的结构
2. 继承一套稳定的文件组织方式
3. 根据用户填写的 `displayName` 和 `systemPromptOverride`，生成适合该 Agent 的身份内容与角色内容
4. 再落盘为这个新 Agent 自己的目录和文件

这样做的好处是很明显的：

- 新 Agent 的目录结构会和现有体系一致
- 文件语气和内容组织方式更容易保持统一
- 后续能力不会因为“缺文件”或“结构不对”而异常
- 自动生成结果更可控，不容易跑偏

所以建议默认策略调整为：

- 先以现有 Agent 资产结构作为模板参考
- 先生成一套安全、常规、可解释的基础目录与初始文件
- 再根据描述补充角色内容和少量合理差异
- 不要默认给过激的工具权限或不透明的特殊行为
- 不要跳过 `SOUL.md`、`IDENTITY.md` 等关键人格/身份文件的初始化

---

### 6.4 创建成功后，最好能继续微调

快捷创建通常解决的是“先建起来”，不是“一次就完美”。

所以建议创建成功后，给用户一个顺手的下一步：

- 可以直接定位到新 Agent 的配置
- 或者自动选中新 Agent
- 或者提供“继续编辑”的入口

这样用户如果想做精修，不用再重新找文件。

---

### 6.5 必须提前定义“要创建哪些目录与初始文件”

这是这次需求里非常关键的一点。

因为当前新建 Agent 并不只是 UI 层“显示一个新卡片”，也不只是配置层“多一条 `agents.json` 记录”，而是要在 `BELLDANDY_STATE_DIR/agents/` 下为该 Agent 建立自己的落地空间。

所以在正式开发前，必须先把这件事说清楚：

创建一个新 Agent 时，系统到底要同步创建哪些目录、哪些文件，哪些属于“创建时必须有”，哪些属于“后续运行中可再生成”。

用非技术的话来说，就是要先回答：

“系统最低限度要为这个新 Agent 准备什么，才算真的创建完成？”

如果这件事不提前说清，后面很容易出现分工误解：

- 前端以为自己只负责表单和写配置
- 后端以为目录初始化不在本次范围

最后得到的就会是一个“看起来创建成功，但其实缺东西”的半成品 Agent。

所以本方案建议明确采用下面的范围定义：

- 新建 Agent = 创建配置 + 创建 Agent 目录 + 创建必要初始文件

---

## 7. 我给出的产品建议

### 建议 1：主按钮叫“新建 Agent”，不要叫“快捷创建”

对普通用户来说，“新建 Agent”更直接。

“快捷创建”可以作为内部定义，但不一定适合做前台按钮名。

---

### 建议 2：创建逻辑用“简表单 + 自动补齐”，不要一开始做成高级配置器

这是这次需求最适合的产品形态。

因为它的价值就在于：

- 低门槛
- 快速开始
- 不吓人

如果首版就把所有字段都摊出来，反而失去这个入口的意义。

---

### 建议 3：成功后自动把新 Agent 滚动到可见位置

这是很小但体验很好的动作。

用户创建后，马上能看到它确实出现了，会更安心。

---

### 建议 4：成功提示里明确“已写入配置”和“是否需要重启”

这能显著减少误解。

建议成功提示至少包含两层信息：

1. 这个 Agent 已经创建成功
2. 什么时候开始真正可用

---

### 建议 5：后续可以再扩展“模板创建”

这不是首版必须做，但很适合后续增强。

比如后面可以加入几个模板：

- 通用助手
- 代码专家
- 调研助手
- 审阅助手

这样用户甚至不用从空白描述开始写，会更快。

---

## 8. 建议的首版范围

如果要控制实现成本，我建议首版范围就定为下面这些：

1. Agent 信息栏顶部新增 `新建 Agent` 按钮
2. 点击打开创建弹窗
3. 弹窗包含 4 个字段：
   - `id`
   - `displayName`
   - `model`
   - `systemPromptOverride`
4. `model` 使用现有模型来源
5. `id` 做唯一性校验
6. 系统自动补齐其余配置并写入 `agents.json`
7. 创建成功后：
   - 提示成功
   - 新 Agent 出现在列表中
   - 视情况提示是否需要重启

这样首版就已经是完整闭环了。

---

## 9. 验收口径（非技术版）

如果这个功能做完，我建议按下面标准判断是否达标：

1. 用户不用手改 `agents.json`，也能创建一个新 Agent
2. 用户能看懂每个输入项是什么意思
3. 模型选择不会让人迷路
4. 创建后能马上在右侧看到新 Agent
5. 用户知道它是“已经保存”还是“已经生效”
6. 整个流程对非技术用户来说是顺的，不需要先学 JSON

---

## 10. 一句话结论

这个需求方向是对的，而且很有价值。

我建议把它定义成：

“一个面向普通用户的 Agent 轻量创建入口，用少量基础信息换取一份可落地、可继续微调的完整 Agent 配置。”

这样它既能降低门槛，也不会和后续的高级配置能力冲突。

---

## 11. 代码现状评估

根据当前项目代码和实际状态目录，现状可以归纳为下面几点。

### 11.1 前端已经具备的基础能力

当前 WebChat 前端已经有几块能力可以直接复用：

1. 右侧 Agent 信息栏已经存在，并且当前卡片渲染由独立模块负责。
2. Agent 列表加载已经有现成接口：
   - `agents.roster.get`
   - `agents.list`
3. 模型下拉列表已经有现成接口：
   - `models.list`
4. 中间编辑区已经有现成文件打开、编辑、保存能力。
5. Agent 面板已经具备按钮、弹窗、头像上传等交互形态，可以沿用同一套视觉和行为模式。

前端关键代码位置：

- `apps/web/public/app/features/agent-runtime.js`
- `apps/web/public/app/features/chat-network.js`
- `apps/web/public/app/features/workspace.js`
- `apps/web/public/app.js`
- `apps/web/public/index.html`

这意味着：

- 右侧栏新增顶部按钮是低风险改动
- 创建弹窗可以沿用现有 modal 风格
- 模型下拉不需要重新发明数据源

---

### 11.2 后端已经具备的基础能力

当前后端已经具备以下基础能力：

1. 启动时会从 `BELLDANDY_STATE_DIR/agents.json` 加载 Agent Profiles。
2. `loadAgentProfiles` 已经明确了 `agents.json` 的最低有效字段要求：
   - `id`
   - `model`
3. Agent 名称和头像并不完全依赖 `agents.json`，还会从对应 Agent 目录下的 `IDENTITY.md` 中解析。
4. 头像上传接口已经支持按 `agentId` 写入对应 Agent 的 `IDENTITY.md`。
5. `resolveAgentIdentityDir` 已经统一了“default Agent 用根目录，其他 Agent 用 `agents/<workspaceDir>/`”这一规则。

后端关键代码位置：

- `packages/belldandy-agent/src/agent-profile.ts`
- `packages/belldandy-core/src/bin/gateway.ts`
- `packages/belldandy-core/src/server-methods/agents-system.ts`
- `packages/belldandy-core/src/query-runtime-agent-roster.ts`
- `packages/belldandy-core/src/server-http-routes.ts`
- `packages/belldandy-core/src/server-http-runtime.ts`

这意味着：

- 当前系统已经认可“每个 Agent 有自己目录和身份文件”的结构
- 新建 Agent 如果只写 `agents.json`，会和现有运行模型不匹配

---

### 11.3 当前还缺失的关键能力

本次需求真正缺的，不是前端按钮，而是“创建完整 Agent 资产”的后端能力。

目前代码里已经有：

- 读取 Agent 列表
- 读取模型列表
- 打开配置文件
- 修改头像

但还没有看到现成的：

- `agent.create`
- `agents.create`
- `agent.assets.bootstrap`
- 或其他等价的“新建 Agent 完整流程”入口

也就是说，当前系统还缺少一个正式的创建通道，用来一次性完成：

1. 校验 `id`
2. 生成完整 profile
3. 写入 `agents.json`
4. 创建 `agents/<agentId>/`
5. 初始化 `SOUL.md`、`IDENTITY.md`、`DREAM.md`、`dream-runtime.json`
6. 初始化必要目录，如 `sessions/`、`memory/`、`dreams/`、`facets/`
7. 返回给前端创建结果

这部分是本次实现的核心工作量。

---

## 12. 实施方案

### 12.1 总体策略

建议采用“前端轻表单 + 后端统一创建”的架构。

也就是说：

- 前端负责采集最少必填信息和展示反馈
- 后端负责做真正的 Agent 创建动作

不建议把“生成完整 Agent 资产”的逻辑拆散到前端里做，原因很简单：

1. 前端不适合掌握完整文件初始化逻辑
2. 文件创建和配置写入需要原子性，最好由后端统一完成
3. 以后如果还要接 CLI、脚本或别的入口，也能复用同一套创建能力

---

### 12.2 建议新增的后端能力

建议新增一个明确的 WebSocket 方法，例如：

- `agent.create`

输入建议至少包含：

- `id`
- `displayName`
- `model`
- `systemPromptOverride`

输出建议至少包含：

- 创建是否成功
- 新 Agent 的 `id`
- 是否写入了 `agents.json`
- 是否创建了 Agent 目录
- 创建了哪些关键文件
- 是否需要重启 / 刷新运行态

这样前端只要提交表单，然后根据返回结果更新 UI 即可。

---

### 12.3 后端创建流程建议

建议后端内部按下面顺序执行。

#### 步骤 1：参数校验

需要校验：

- `id` 非空
- `id` 格式合法
- `id` 不与现有 Agent 重复
- `model` 非空
- `displayName` 非空
- `systemPromptOverride` 非空或至少不是纯空白

#### 步骤 2：读取现有参考资产

为了落实前文 6.3 的策略，创建逻辑应先读取参考来源：

- 根目录 `SOUL.md`
- 根目录 `IDENTITY.md`
- 已有成熟 Agent 目录，优先可用 `agents/coder/`

这一步的目的不是照搬内容，而是：

- 学习现有文件结构
- 学习现有字段表达方式
- 学习现有人格/身份文档的组织方式

#### 步骤 3：生成 Agent Profile

生成新的 `agents.json` 条目。

首版建议使用稳定默认模板，再结合用户输入填入关键差异。

建议首版默认值优先保守，例如：

- `kind`: `resident`
- `workspaceBinding`: `current`
- `memoryMode`: `hybrid`
- `toolsEnabled`: `true`
- `defaultRole`: 可按规则推导，若无法可靠推导则使用安全默认值

这一步不要追求“全自动智能推理特别多”，而要优先保证结果稳定、可解释。

#### 步骤 4：创建 Agent 目录

在：

- `BELLDANDY_STATE_DIR/agents/<workspaceDir>/`

创建目录。

这里建议首版将 `workspaceDir` 与 `id` 保持一致，减少歧义。

#### 步骤 5：初始化关键文件

建议首版创建以下关键文件：

- `IDENTITY.md`
- `SOUL.md`
- `DREAM.md`
- `dream-runtime.json`

建议首版创建以下目录：

- `sessions/`
- `memory/`
- `dreams/`
- `facets/`

其中：

- `IDENTITY.md` 用于名称、职责、风格、头像等身份信息
- `SOUL.md` 用于人格、行为约束、工作原则
- `DREAM.md` 作为梦境索引文件初始化
- `dream-runtime.json` 作为运行态 dream 文件初始化

#### 步骤 6：写入 `agents.json`

将新 profile 追加写入 `agents.json`。

这里建议采用：

- 读取
- 修改
- 原子写回

并在写入前后做好失败保护，避免写坏整个配置文件。

#### 步骤 7：返回创建结果

后端返回结构化结果，告诉前端：

- 创建成功
- 新 Agent id
- 创建了哪些文件和目录
- 是否需要重启或刷新 Agent roster

---

### 12.4 前端实施建议

前端建议分三部分改。

#### 一：右侧 Agent 栏顶部入口

在 `agentRightPanel` 顶部加入一个固定的“新建 Agent”按钮。

建议仍由 `agent-runtime.js` 负责渲染，因为当前 Agent 右栏已经由它集中管理。

#### 二：创建弹窗

建议复用现有 modal 结构，不新起一套完全独立的视觉体系。

弹窗中包含：

- `id` 输入框
- `displayName` 输入框
- `model` 下拉框
- `systemPromptOverride` 大文本框

其中 `model` 下拉应直接复用现有 `models.list` 数据来源，而不是单独再做一套解析 `models.json` 的逻辑。

#### 三：提交与刷新

点击“创建”后，前端调用新的后端方法，例如 `agent.create`。

成功后前端应至少执行：

1. 关闭弹窗
2. 重新加载 Agent roster
3. 自动滚动到新 Agent
4. 选中新 Agent 或给出“继续编辑”入口
5. 显示成功提示
6. 如需重启，显示明确说明

---

## 13. 文件级改动计划

### 13.1 前端

建议涉及：

- `apps/web/public/index.html`
  - 增加创建弹窗容器
- `apps/web/public/app/bootstrap/dom.js`
  - 增加新按钮和弹窗字段引用
- `apps/web/public/app/features/agent-runtime.js`
  - 顶部按钮渲染
  - 弹窗打开/关闭
  - 表单校验
  - 调用 `agent.create`
  - 成功后刷新列表与定位
- `apps/web/public/app/features/chat-network.js`
  - 如有必要，封装新请求方法
- `apps/web/public/styles.css`
  - 新按钮和弹窗样式
- `apps/web/public/app/i18n/zh-CN.js`
- `apps/web/public/app/i18n/en-US.js`
  - 新增文案

### 13.2 后端

建议涉及：

- `packages/belldandy-core/src/server-methods/agents-system.ts`
  - 新增 `agent.create`
- `packages/belldandy-core/src/server.ts`
  - 放行新方法到方法分发
- 新增一个专门的 Agent 创建辅助模块
  - 例如：`packages/belldandy-core/src/agent-create.ts`

这个辅助模块建议负责：

- 读取现有 `agents.json`
- 检查 `id`
- 生成 profile
- 创建目录和文件
- 原子写入

这样逻辑不会堆在 `agents-system.ts` 里。

---

## 14. 分阶段实施计划

建议分 3 个阶段实施。

### 阶段 1：后端完整创建能力

目标：

- 新增 `agent.create`
- 能在无前端的情况下通过接口创建完整 Agent

产出：

- `agents.json` 写入
- Agent 目录和关键文件初始化
- 单元测试 / 集成测试

### 阶段 2：前端入口与弹窗

目标：

- 右侧栏顶部按钮
- 创建弹窗
- 表单提交
- 创建成功后刷新与定位

产出：

- WebChat 中可直接创建 Agent

### 阶段 3：体验打磨

目标：

- 文案优化
- 错误提示优化
- 创建成功后的继续编辑路径
- 是否需要重启的清晰反馈

这三阶段里，真正的核心是阶段 1。

如果阶段 1 不稳，阶段 2 做得再漂亮也只是一个“会失败的好看入口”。

---

## 15. 测试与验证计划

### 15.1 后端验证

至少应覆盖：

1. 成功创建新 Agent
2. `id` 重复时报错
3. `agents.json` 写入成功
4. `agents/<id>/` 目录创建成功
5. `IDENTITY.md`、`SOUL.md`、`DREAM.md`、`dream-runtime.json` 初始化成功
6. 创建后 `agents.list` / `agents.roster.get` 能看到新 Agent
7. `IDENTITY.md` 中名称信息能被 roster 正确读取

### 15.2 前端验证

至少应覆盖：

1. 顶部按钮正常显示
2. 点击后弹窗能打开
3. `model` 下拉能加载已有模型
4. `id` 重复时前端有清晰提示
5. 创建成功后 Agent 列表刷新
6. 新 Agent 自动滚动到可见位置
7. 创建后可继续点“编辑”进入 `agents.json`

### 15.3 手动验证

建议至少手动走一遍：

1. 新建一个普通 Agent
2. 检查 `agents.json`
3. 检查 `BELLDANDY_STATE_DIR/agents/<id>/`
4. 检查关键文件是否完整
5. 检查右侧列表是否展示正确名称
6. 检查模型显示是否正确
7. 检查重启前后行为是否符合提示

---

## 16. 风险与注意事项

### 风险 1：只写配置，不建资产

这是本次最大的风险。

如果只改 `agents.json`，前端表面上像成功了，但后续很多能力会缺基础文件支撑。

### 风险 2：自动生成结果过度自由

如果让主 Agent 完全自由生成 `SOUL.md` 和 `IDENTITY.md`，结果可能不稳定。

所以首版一定要：

- 模板驱动
- 规则驱动
- 再叠加少量描述定制

### 风险 3：创建后列表刷新但运行态未生效

如果系统需要重启才真正加载新 Agent，那么前端必须清楚提示，不然用户会误解。

### 风险 4：`workspaceDir` 与 `id` 不一致带来的复杂度

首版建议默认保持一致，避免路径解析和后续维护复杂度上升。

---

## 17. 实施结论

从现有代码基础来看，这个需求是可做的，而且现成复用面已经不少：

- 右侧 Agent 面板已有
- 模型列表已有
- 编辑器已有
- Agent 名称/头像解析路径已有

真正需要新增的核心，是一个后端统一的“完整 Agent 创建”能力。

所以本次实施建议的结论是：

1. 前端入口可以直接在现有 Agent 面板上扩展
2. 模型选择直接复用现有 `models.list`
3. 后端新增 `agent.create` 作为唯一正式创建入口
4. 创建动作必须覆盖 `agents.json`、Agent 目录和关键初始化文件
5. 首版优先做稳定模板化创建，不做完全自由生成

按这个方案推进，风险最可控，也最符合当前项目的真实结构。
