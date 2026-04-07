# Setup 2.0 设计稿

## 1. Goal

为 `SS / Belldandy` 提供一条统一、可扩展、低误配率的安装与配置主路径，替代当前分散的：

- `bdd setup`
- 社区独立 wizard
- 手工编辑 `.env.local`
- 手工补 `models.json`

Setup 2.0 的目标不是“暴露所有配置”，而是：

- 让第一次安装更容易跑通
- 让高风险配置更早暴露并被确认
- 让后续扩展配置有统一入口
- 不破坏 SS 当前 `Goals / Resident / Review / Memory` 主线

---

## 2. 设计原则

1. 统一入口

- 首次安装、基础更新、模块补配置，都从同一条 setup 主路径进入。

2. 分层收敛

- `QuickStart` 只解决“最快跑起来”。
- `Advanced` 才展开完整配置。

3. 模块化展开

- 不一次问完所有问题。
- 先完成基础运行，再按模块进入二级配置。

4. 最小惊扰

- 检测已有配置时优先 `沿用 / 修改`，不默认重置。

5. 安全前置

- 对 LAN、webhook、外部暴露等高风险项，先提示风险再继续。

6. 可验证

- 写入配置前先做预检。
- 写入后给出明确的后续验证命令。

---

## 3. Scope

### 3.1 In Scope

- `bdd setup` 统一为 Setup 2.0 主入口
- `QuickStart / Advanced` 双路径
- 风险确认
- 已有配置检测与部分重置
- 运行场景选择
- 基础 provider 配置
- Gateway 基础配置
- workspace / state dir 确认
- 模块化扩展配置入口
- community 配置并入主向导
- 基础 webhook / cron / heartbeat 配置入口
- 最终预检与总结页

### 3.2 Out of Scope

- 一次性引入 OC 全量 provider/plugin 平台
- 第一期做完复杂渠道向导
- 第一期覆盖所有 resident / goals / memory 细粒度参数
- 第一期实现完整 GUI 配置中心

---

## 4. User Story

### 4.1 新用户

作为第一次安装 SS 的用户，我希望只通过一条 setup 流程就把系统跑起来，而不需要分别记住：

- 哪些环境变量要写
- community 还要再跑一个向导
- 哪些配置必须手工补 JSON

### 4.2 老用户

作为已有配置的用户，我希望 setup 能识别现有状态，并允许我：

- 直接沿用现有配置
- 只修改一部分
- 安全地做局部 reset

### 4.3 运维 / 高级用户

作为需要配置 LAN、webhook、cron 的用户，我希望 setup 在写配置前就提示风险和缺项，而不是等启动失败后再靠 `doctor` 兜底。

---

## 5. 当前问题

当前 SS 的 setup 主要覆盖：

- `provider=openai|mock`
- `baseUrl/apiKey/model`
- `host/port`
- `auth mode`

问题在于：

1. 主 setup 只覆盖基础最小集，后续配置入口分散。
2. community 配置是另一套独立 wizard，首次安装路径不统一。
3. provider/fallback/model 仍偏手工，不具备产品化选择面。
4. 没有运行场景分流，本地/LAN/远程路径混在一起。
5. 对 webhook / cron / heartbeat 缺少统一配置入口。
6. 对已有配置的处理能力偏弱，容易退化为“手工改 env”。

---

## 6. 核心流程

### 6.1 入口页

展示：

- Setup 说明
- 当前是否检测到已有配置
- 入口模式选择

可选：

1. `QuickStart`
2. `Advanced`

规则：

- `QuickStart` 默认只支持本地单机
- 如用户选择远程模式，则自动切到 `Advanced`

### 6.2 风险确认

触发条件：

- 选择 `LAN 可访问`
- 选择启用 webhook
- 选择后续启用外部渠道

确认内容：

- SS 默认适合单操作者边界
- 外部暴露必须启用鉴权
- 不建议无鉴权开放到 LAN / 公网

### 6.3 现有配置检测

检测对象：

- `.env.local`
- `models.json`
- community config
- state dir / workspace

给用户三个动作：

1. `沿用现有值`
2. `修改现有值`
3. `重置部分配置`

若选择 reset，再选择范围：

1. `仅基础配置`
2. `基础配置 + 会话/凭据`
3. `全量 reset`

### 6.4 运行场景选择

可选：

1. `本地单机`
2. `局域网可访问`
3. `远程 / 反向代理后访问`

作用：

- 影响 host 默认值
- 影响 auth 是否强制开启
- 影响 webhook/public URL 的提示与后续步骤

### 6.5 核心 Agent Provider 配置

第一阶段支持：

1. `mock`
2. `OpenAI-compatible`

若选择 `OpenAI-compatible`，填写：

- `baseUrl`
- `apiKey`
- `model`

2.0 应新增：

- 基础连通性探测
- 模型建议或最小 model picker
- 失败时直接回到当前步骤修正

### 6.6 Gateway 基础配置

配置项：

- `host`
- `port`
- `auth mode`
- `auth secret`

规则：

- 若 `host=0.0.0.0`，则必须启用 `token` 或 `password`

### 6.7 Workspace / State 目录确认

`QuickStart`：

- 使用默认目录

`Advanced`：

- 可调整 workspace
- 可调整 state dir
- 明确 models/plugins/skills/generated 等默认落点

### 6.8 模块化扩展配置入口

基础配置完成后，展示模块列表，让用户勾选是否继续：

1. `模型与 fallback`
2. `Community`
3. `Webhook`
4. `Cron / Heartbeat`
5. `渠道接入`
6. `Skills / Plugins`
7. `Memory / Embedding`

规则：

- 不勾选则跳过
- 模块独立展开，不影响基础流程闭环

### 6.9 模型与 fallback 子流程

用于补齐当前主 setup 缺口。

可配置：

- primary model
- `models.json` fallback
- 是否为 compaction / memory summary 指定独立模型
- 后续 provider 扩展预留入口

第一阶段不要求做成 OC 全量 provider 平台，但要留好结构。

### 6.10 Community 子流程

把当前独立 community wizard 并入 setup 主流程。

基础项：

- 是否启用 community
- endpoint
- agent name
- api key
- 是否配置 room
- room name / password

保留独立 community 命令，但 setup 内提供统一入口。

### 6.11 Webhook 子流程

基础项：

- 是否启用 webhook
- webhook token
- 是否启用幂等处理
- 是否启用 request guard

第一阶段只做基础开关，不在 setup 内展开复杂策略编辑。

### 6.12 Cron / Heartbeat 子流程

基础项：

- 是否启用 heartbeat
- heartbeat active hours
- 是否启用 cron
- 是否创建第一个 cron job

不要求第一阶段把所有 cron 细节放进 setup。

### 6.13 最终预检

在落盘前做统一校验：

- provider 连通性
- 必填字段缺失
- LAN 暴露是否缺鉴权
- webhook 是否缺 token
- community 是否缺关键字段
- 目录是否可写

失败策略：

- 返回对应模块修正
- 不直接写入半成品配置

### 6.14 写入与总结页

输出：

- 写入了哪些文件
- 敏感字段脱敏显示
- 下一步推荐命令

例如：

- `bdd doctor`
- `bdd start`
- `bdd configure models`
- `bdd configure community`

---

## 7. QuickStart 与 Advanced 的差异

### 7.1 QuickStart

目标：

- 5 分钟内可启动

范围：

- 只配置本地单机
- 只问最少问题
- 默认目录
- 默认跳过高级模块

包含：

- provider
- 基础 API 配置
- 本地 host/port
- 基础 auth
- 写配置
- doctor/start 提示

### 7.2 Advanced

目标：

- 一次完成更完整的部署与模块配置

范围：

- 运行场景选择
- 目录确认
- 模块化扩展配置
- 预检和更细的风险提示

---

## 8. CLI 设计建议

### 8.1 主入口

统一保留：

- `bdd setup`

建议增加：

- `bdd setup --flow quickstart`
- `bdd setup --flow advanced`
- `bdd setup --non-interactive`

### 8.2 后续模块入口

建议新增统一二级入口：

- `bdd configure models`
- `bdd configure community`
- `bdd configure webhook`
- `bdd configure cron`

这样 `setup` 负责首次安装主路径，`configure` 负责后续补配置。

---

## 9. 实现阶段拆分

### Phase 1

目标：

- 把入口统一起来

包含：

- `QuickStart / Advanced`
- 风险确认
- 已有配置检测
- 运行场景选择
- provider 基础配置
- gateway 基础配置
- community 并入
- 最终 summary + doctor/start 提示

不包含：

- 完整 model picker
- fallback 编辑
- webhook request guard 参数化
- 复杂 cron 向导

### Phase 2

目标：

- 补齐最缺的模块化配置面

包含：

- 模型与 fallback 子流程
- webhook 子流程
- cron / heartbeat 子流程
- 基础预检探测

### Phase 3

目标：

- 为更大规模扩展留接口

包含：

- provider 元数据化 onboarding
- 更完整的 model picker
- skills/plugins 配置入口
- 更强的自动化探测与修复提示

---

## 10. 技术约束

1. 第一阶段优先复用现有 `bdd setup` 与 `community wizard` 代码，不做一次性重写。
2. 不把新的主体逻辑继续堆进超大文件；模块化步骤优先外移。
3. setup 只负责“可安全写入的配置”，不要在第一阶段绑定过多启动后动态逻辑。
4. 对敏感字段必须脱敏显示，不能在 summary 中回显原文。
5. 非交互模式必须保留，并与交互模式使用一致的校验规则。

---

## 11. 验证标准

### Smoke

1. 全新用户运行 `bdd setup` 可以完成 QuickStart 并成功写入配置。
2. 已有用户运行 `bdd setup` 可以识别旧配置并选择沿用或修改。
3. `host=0.0.0.0` 且 `auth=none` 时会被阻止继续。
4. 启用 community 时可以在主流程内完成最小必填配置。

### Manual

1. QuickStart 路径问题数明显少于当前版本。
2. Advanced 路径能覆盖本地/LAN/远程三类主要场景。
3. 用户在不打开文档的情况下，也能从 summary 页知道下一步怎么做。

### Regression Focus

1. 现有非交互 `bdd setup --provider ...` 行为不回退。
2. 现有 community 独立 wizard 仍可继续单独使用。
3. 现有 `.env.local` 写入逻辑不破坏。

---

## 12. 风险与取舍

### 风险

1. 如果第一版就把所有模块都塞进 setup，交互会过长，反而降低完成率。
2. 如果把 provider 平台抽象一次性做太大，会拖慢 2.0 落地。
3. 如果继续保持 community 独立入口，2.0 的“统一主路径”目标会被削弱。

### 取舍

1. 第一阶段优先统一路径，不追求配置覆盖率最大化。
2. 第一阶段优先把 `community` 并进主流程。
3. `models.json fallback` 放到第二阶段，比放在第一阶段更稳妥。

---

## 13. 当前建议确认项

在进入实现前，建议最终确认以下决策：

1. `QuickStart` 是否只支持本地单机。
2. `community` 是否并入主 setup。
3. `models.json fallback` 是否放到 Phase 2。
4. `webhook / cron` 是否在第一阶段只保留基础开关。
5. 是否新增 `bdd configure <module>` 作为后续统一入口。

---

## 14. 一句话结论

Setup 2.0 应先解决“统一入口、减少误配、让首次可跑通”，而不是第一版就把 SS 的所有高级能力都做进一个巨型向导。
