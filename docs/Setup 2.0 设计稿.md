# Setup 2.0 设计稿（含 D0 / D1）

## 0. 文档定位

本文统一覆盖第三阶段计划中的：

- `D0` 一行命令安装器 / bootstrap installer
- `D1` 安装与配置向导 2.0

职责边界：

- `D0` 负责让用户获得可运行的 `bdd`
- `D1` 负责在 `bdd` 已可运行后完成首次配置与后续补配置
- `artifacts/` 保留为内部构建中间产物与小白特供 exe/portable 包来源，不作为默认安装协议

---

## 1. 总目标

为 `SS / Belldandy` 提供一条统一、可扩展、低误配率的默认安装与配置主路径，替代当前分散的：

- 手工下载包并自行判断运行方式
- `bdd setup`
- 社区独立 wizard
- 手工编辑 `.env.local`
- 手工补 `models.json`

Setup 2.0 的目标不是“暴露所有配置”或“支持所有安装方式”，而是：

- 让用户先通过一行命令获得可运行的 `bdd`
- 让第一次完成配置并跑通更容易
- 让高风险配置更早暴露并被确认
- 让后续扩展配置有统一入口
- 不破坏 SS 当前 `Goals / Resident / Review / Memory` 主线

---

## 2. 分层与边界

### 2.1 D0 与 D1 的职责分工

- `D0` 解决“`bdd` 从哪里来”
- `D1` 解决“`bdd` 启动后怎么完成首次配置”

也就是说：

- `D0` 的完成点是“用户已经获得可运行的 `bdd`，并可直接进入 `bdd setup`”
- `D1` 的完成点是“用户已完成配置并知道下一步如何验证/启动”

### 2.2 `artifacts/` 的定位

`artifacts/` 继续保留为：

- 内部构建中间产物
- 小白特供 exe/portable 包来源

但不应作为：

- 默认 installer 下载源
- 默认安装协议
- Setup 2.0 的主入口定义

### 2.3 默认安装源

默认安装源应为：

- GitHub Releases 的源码包（`zipball / tarball`）
- 配套 GitHub Releases metadata API（用于解析最新 tag 与源码包下载地址）

原因：

1. 当前大型 `portable / single-exe` 包不会放在 GitHub 上
2. 默认用户路径仍需要以 GitHub 上可稳定获取的内容为准
3. 一行命令仍然可以把“下载源码包 -> 检查 Node/corepack -> install/build -> setup”串成一条主链
4. `artifacts/` 与官网大包下载继续作为独立分发路径，不属于本轮 Setup 2.0 默认协议

---

## 3. 统一设计原则

1. 默认路径优先稳定

- 默认安装源只走 GitHub Releases 源码包这一套清晰协议，不把源码构建、测试产物、内部脚本混在一起

2. 跨平台同口径

- `Windows / macOS / Linux` 都走同一套“源码包 + 本地 bootstrap + shim”逻辑

3. 安装与配置分层

- `D0` 只负责“把 `bdd` 带到本机并可运行”
- `D1` 只负责“安装后的配置与首次引导”

4. 分层收敛

- `QuickStart` 只解决“最快跑起来”
- `Advanced` 才展开完整配置

5. 模块化展开

- 不一次问完所有问题
- 先完成基础运行，再按模块进入二级配置

6. 安全前置

- 安装阶段默认做 release metadata、源码包解压结果、Node 版本与 build 前置条件检查
- 配置阶段对 LAN、webhook、外部暴露等高风险项先提示风险再继续

7. 可验证

- 写入配置前先做预检
- 写入后给出明确的后续验证命令

---

## 4. Scope

### 4.1 In Scope

- `D0 install.ps1`
- `D0 install.sh`
- GitHub Releases 源码包与 metadata API
- `Windows / macOS / Linux` 平台识别
- 下载与基础完整性校验
- 用户目录安装布局
- `bdd` shim 写入
- 安装完成后直接进入 `bdd setup`
- `D1 bdd setup` 统一为 Setup 2.0 主入口
- `QuickStart / Advanced` 双路径
- 风险确认
- 已有配置检测与部分重置
- 运行场景选择
- 基础 provider 配置
- Gateway 基础配置
- workspace / state dir 确认
- 模块化扩展配置入口
- `models.json` fallback 最小子流程（`Advanced`）
- community 配置的 `Advanced` 统一入口
- 基础 webhook / cron / heartbeat 配置入口
- 最终预检与总结页

### 4.2 Out of Scope

- 把 `artifacts/` 目录路径暴露成对外安装协议
- 把官网 `portable / single-exe` 大包下载链路并入当前默认 installer
- 在 installer 中直接展开完整 Setup 2.0 配置问题树
- 一次性引入 OC 全量 provider/plugin 平台
- 第一期做完复杂渠道向导
- 第一期覆盖所有 resident / goals / memory 细粒度参数
- 第一期实现完整 GUI 配置中心
- 第一阶段就做完整 GUI 安装器
- 第一阶段就做自动升级守护进程

---

## 5. User Story

### 5.1 普通用户

作为第一次接触 SS 的用户，我希望只复制一条命令到终端，就能把 `bdd` 安装好并直接进入后续配置，而不需要：

- 先手工去下载 zip/exe
- 先判断该选 `Portable`、`Single-Exe` 还是源码包
- 先自己处理安装目录、PATH 或运行时位置
- 再额外记忆哪些环境变量或 JSON 要补

### 5.2 老用户

作为已有配置的用户，我希望 setup 能识别现有状态，并允许我：

- 直接沿用现有配置
- 只修改一部分
- 安全地做局部 reset

### 5.3 运维 / 高级用户

作为需要配置 LAN、webhook、cron 的用户，我希望 setup 在写配置前就提示风险和缺项，而不是等启动失败后再靠 `doctor` 兜底。

### 5.4 维护者

作为维护者，我希望 installer 统一复用 GitHub Releases tag / metadata，而不是让每个平台脚本各自内嵌版本和下载地址，避免版本更新时多处漂移。

---

## 6. D0 Bootstrap Installer

### 6.1 Goal

为 `SS / Belldandy` 提供一条跨平台的一行命令安装路径，让用户无需预先手工下载源码包或自己判断构建步骤，就能完成：

1. 下载
2. 解压
3. 检查 `Node / corepack`
4. 执行 `pnpm install`
5. 执行 `pnpm build`
6. 写入 `bdd` 可执行 shim 与重复启动入口
7. 自动进入 `bdd setup`

### 6.2 用户入口

建议入口：

```powershell
irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash
```

当前建议补充写法：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -NoSetup
```

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -InstallDir "$env:LOCALAPPDATA\StarSanctuary" -NoSetup
```

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --no-setup
```

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --install-dir "$HOME/.local/share/star-sanctuary" --no-setup
```

当前前提：

- 用户机器需已安装 `Node.js v22.12+`
- Node 发行版需包含 `corepack`
- installer 默认会自行通过 `corepack` 准备 `pnpm`

### 6.3 安装流程

1. 检测 `platform / arch`
2. 拉取 GitHub Releases metadata，解析目标 tag
3. 下载对应 release 的源码包到临时目录
4. 解压到 staging 目录
5. 检查 `Node.js` 版本与 `corepack`
6. 通过 `corepack` 准备 `pnpm`
7. 执行 `pnpm install`
8. 执行 `pnpm build`
9. 安装到用户目录并生成 `bdd` shim
10. 保留后续可直接重复启动的 `start.bat / start.sh`
11. 输出安装位置与版本
12. 自动进入 `bdd setup`

补充要求：

- `start.bat / start.sh` 作为后续重复启动入口保留
- `Windows` 安装器默认生成桌面快捷方式，并指向 `start.bat`
- `start.ps1` 可继续作为 Windows 次级入口存在，但不替代 `start.bat`
- installer 默认复用当前仓库 `start.bat / start.sh` 的核心检查逻辑，而不是另外维护一套完全独立的源码启动脚本

### 6.4 失败策略

- 下载失败：提示重试与 GitHub release/tag 检查
- 解压失败：阻止继续安装
- `Node.js` 不存在或版本过低：阻止继续安装，并提示先安装 `Node.js v22.12+`
- `corepack` 不存在：阻止继续安装，并提示使用带 `corepack` 的 Node 发行版
- `pnpm install / build` 失败：保留旧安装不覆盖当前版本
- shim 写入失败：提示手工 PATH 方案
- `bdd setup` 失败：保留已安装源码工作区，不回滚到半安装状态

### 6.5 安装布局建议

安装目录：

- `Windows`：`%LOCALAPPDATA%\\StarSanctuary`
- `macOS / Linux`：`~/.local/share/star-sanctuary`

目录结构建议：

```text
<install-root>/
  current/
  backups/
  install-info.json
  start.bat / start.sh
  bdd.cmd / bdd
```

安装目录 env 约束：

- `<install-root>` 本身就是安装形态的固定 `envDir`
- 安装后的 `.env / .env.local` 默认应落在 `<install-root>/`，而不是 `<install-root>/current/`
- 安装器生成的 `bdd.cmd / bdd / start.bat / start.sh / start.ps1` 都应显式注入：
  - `STAR_SANCTUARY_RUNTIME_MODE / BELLDANDY_RUNTIME_MODE`
  - `STAR_SANCTUARY_RUNTIME_DIR / BELLDANDY_RUNTIME_DIR`
  - `STAR_SANCTUARY_ENV_DIR / BELLDANDY_ENV_DIR`
- 即使用户从其它工作目录启动，或当前工作目录里本身存在 `.env.local`，安装形态也不应回退到 `legacy_root`，而应继续落到安装根 `envDir`
- distribution runtime 侧也应识别“`install-info.json` + `current/`”的已安装源码布局，并优先把 `envDir` 解析到安装根

shim：

- `Windows`：`bdd.cmd`
- `macOS / Linux`：`bdd`

shim 的职责应尽量薄，只做：

- 定位 `current/` 目录
- 调起 `corepack pnpm --dir current bdd`

重复启动入口：

- 安装目录中保留 `start.bat / start.sh`
- 用户后续再次启动时，可直接运行 `start.bat / start.sh`
- `Windows` 若已生成桌面快捷方式，则桌面快捷方式应指向同一 `start.bat`
- `install-info.json` 应至少记录 `currentDir` 与 `envDir`，用于后续 runtime 识别安装态目录结构

### 6.6 CLI / 参数建议

默认模式：

- 无参数时安装 latest release 对应的源码包

建议参数：

- `--version <semver>`
- `--install-dir <path>`
- `--no-setup`
- `--repo-owner <owner>`
- `--repo-name <name>`

高级模式：

- 允许高级用户指定其它 release tag、fork owner 或 repo name
- 默认路径仍基于 GitHub Releases 的源码包 bootstrap，不额外定义第二套源码模式参数

### 6.7 技术约束

1. 默认安装链路必须与 GitHub Releases tag / metadata 解耦，不能把版本 URL 硬编码到多个脚本里。
2. 默认安装路径必须跨平台统一到“安装后可直接运行 `bdd`”。
3. 安装器不应依赖用户机器已有全局 `pnpm`，而应优先通过 `corepack` 准备。
4. 默认 installer 允许依赖用户机器已有 `Node.js`，但必须在最前面做明确版本检查与错误提示。
5. `artifacts/` 相关路径不得写进默认用户安装说明。

---

## 7. D1 Setup 2.0

### 7.1 Goal

为 `SS / Belldandy` 提供一条统一、可扩展、低误配率的首次配置与后续补配置主路径，替代当前分散的：

- `bdd setup`
- 社区独立 wizard
- 手工编辑 `.env.local`
- 手工补 `models.json`

`D1 / Setup 2.0` 的目标不是“暴露所有配置”，而是：

- 让第一次完成配置并跑通更容易
- 让高风险配置更早暴露并被确认
- 让后续扩展配置有统一入口
- 不破坏 SS 当前 `Goals / Resident / Review / Memory` 主线

### 7.2 当前问题

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
7. 当前配对提示仍要求用户回到终端执行 `bdd pairing approve <code>`，没有在 WebChat 内完成闭环。

### 7.3 核心流程

#### 7.3.1 入口页

展示：

- Setup 说明
- 当前是否检测到已有配置
- 入口模式选择

可选：

1. `QuickStart`
2. `Advanced`

规则：

- `QuickStart` 只问最少问题，但不限制必须是本地单机
- `QuickStart` 仍支持 `本地单机 / 局域网可访问 / 远程 / 反向代理后访问` 三类运行场景的基础默认值
- 如用户需要模块化扩展配置、目录调整或更细风险确认，再进入 `Advanced`

#### 7.3.2 风险确认

触发条件：

- 选择 `LAN 可访问`
- 选择启用 webhook
- 选择后续启用外部渠道

确认内容：

- SS 默认适合单操作者边界
- 外部暴露必须启用鉴权
- 不建议无鉴权开放到 LAN / 公网

#### 7.3.3 现有配置检测

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

#### 7.3.4 运行场景选择

可选：

1. `本地单机`
2. `局域网可访问`
3. `远程 / 反向代理后访问`

作用：

- 影响 host 默认值
- 影响 auth 是否强制开启
- 影响 webhook/public URL 的提示与后续步骤

#### 7.3.5 核心 Agent Provider 配置

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

补充规则：

- 初次模型配置继续复用当前 WebChat 设置弹窗，不额外拆出新的独立配置入口
- 如果默认模型尚未设置完成，则每次打开 WebChat 都应自动弹出设置弹窗，直到补齐为止

#### 7.3.6 Gateway 基础配置

配置项：

- `host`
- `port`
- `auth mode`
- `auth secret`

规则：

- 若 `host=0.0.0.0`，则必须启用 `token` 或 `password`

#### 7.3.7 Workspace / State 目录确认

`QuickStart`：

- 使用默认目录

`Advanced`：

- 可调整 workspace
- 可调整 state dir
- 明确 models/plugins/skills/generated 等默认落点

#### 7.3.8 模块化扩展配置入口

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

#### 7.3.9 模型与 fallback 子流程

用于补齐当前主 setup 缺口。

可配置：

- primary model
- `models.json` fallback
- 是否为 compaction / memory summary 指定独立模型
- 后续 provider 扩展预留入口

规则：

- `QuickStart` 默认不展开该子流程
- `Advanced` 可进入最小 `models.json fallback` 配置
- 第一阶段不要求做成 OC 全量 provider 平台，但要留好结构
- 更完整的 model picker 与 provider 元数据化 onboarding 后置

#### 7.3.10 Community 子流程

不作为 `QuickStart` 基础主链阻塞项。

基础项：

- 是否启用 community
- endpoint
- agent name
- api key
- 是否配置 room
- room name / password

规则：

- `QuickStart` 默认跳过 `community`
- `Advanced` 中提供统一入口，允许用户在首次配置阶段顺手补齐
- 保留独立 community 命令与现有 wizard，作为后续补配置路径

#### 7.3.11 Webhook 子流程

基础项：

- 是否启用 webhook
- webhook token
- 是否启用幂等处理
- 是否启用 request guard

第一阶段只做基础开关，不在 setup 内展开复杂策略编辑。

#### 7.3.12 Cron / Heartbeat 子流程

基础项：

- 是否启用 heartbeat
- heartbeat active hours
- 是否启用 cron
- 是否创建第一个 cron job

不要求第一阶段把所有 cron 细节放进 setup。

#### 7.3.13 最终预检

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

#### 7.3.14 写入与总结页

输出：

- 写入了哪些文件
- 敏感字段脱敏显示
- 下一步推荐命令

例如：

- `bdd doctor`
- `bdd start`
- `bdd configure models`
- `bdd configure community`

#### 7.3.15 WebChat 配对闭环

默认用户流应为：

| 步骤 | 操作 |
|---|---|
| 1 | 打开 WebChat `http://127.0.0.1:28889/` |
| 2 | 页面弹出配对码提示 |
| 3 | 在 WebChat 内完成批准操作，例如设置页或配对弹窗中的直接批准入口 |

规则：

- 默认用户流不应要求重新打开终端执行 `bdd pairing approve <code>`
- CLI `bdd pairing approve` 保留，作为高级用户或诊断路径
- WebChat 内的批准入口应复用现有设置页、配对弹窗或轻量二级入口，不新增不必要的一层导航
- 如果当前 WebChat 会话尚未完成配对，则每次打开 WebChat 都应自动弹出设置弹窗，并聚焦到可批准配对的位置

### 7.4 QuickStart 与 Advanced 的差异

#### 7.4.1 QuickStart

目标：

- 5 分钟内可启动

范围：

- 只问最少问题
- 支持 `本地单机 / 局域网可访问 / 远程 / 反向代理后访问` 的基础场景
- 默认目录
- 默认跳过高级模块与可选扩展子流程

包含：

- provider
- 基础 API 配置
- 基础 host/port
- 基础 auth
- 写配置
- doctor/start 提示

默认不包含：

- `community`
- `models.json fallback`
- 复杂 webhook / cron 细项

#### 7.4.2 Advanced

目标：

- 一次完成更完整的部署与模块配置

范围：

- 运行场景选择
- 目录确认
- 模块化扩展配置
- 预检和更细的风险提示

### 7.5 CLI 设计建议

主入口：

- `D0` 负责默认下载安装
- 安装完成后直接把控制权交给 `bdd setup`
- `bdd setup` 作为 `D1` 主入口
- 配对批准默认通过 WebChat 内完成，而不是要求用户切回终端

建议增加：

- `bdd setup --flow quickstart`
- `bdd setup --flow advanced`
- `bdd setup --non-interactive`

后续模块入口：

- `bdd configure models`
- `bdd configure community`
- `bdd configure webhook`
- `bdd configure cron`

这样 `setup` 负责安装后的首次配置主路径，`configure` 负责后续补配置。

### 7.6 技术约束

1. 第一阶段优先复用现有 `bdd setup` 与 `community wizard` 代码，不做一次性重写。
2. 不把新的主体逻辑继续堆进超大文件；模块化步骤优先外移。
3. setup 只负责“可安全写入的配置”，不要在第一阶段绑定过多启动后动态逻辑。
4. 对敏感字段必须脱敏显示，不能在 summary 中回显原文。
5. 非交互模式必须保留，并与交互模式使用一致的校验规则。

---

## 8. 实现阶段拆分

### 8.1 Phase 1

目标：

- 形成最小默认安装与首次配置闭环

包含：

- `D0 GitHub release metadata 解析`
- `D0 install.ps1`
- `D0 install.sh`
- `Windows / macOS / Linux` 最小平台识别
- 下载 release 源码包、bootstrap、shim、`start.bat / start.sh`、`bdd setup`
- `D1 QuickStart / Advanced`
- 风险确认
- 已有配置检测
- 运行场景选择
- provider 基础配置
- gateway 基础配置
- `Advanced` 下的最小 `models.json fallback` 子流程
- `Advanced` 下的 `community` 统一入口
- WebChat 内配对批准入口
- 最终 summary + doctor/start 提示

不包含：

- `self-update`
- `uninstall`
- `repair`
- 完整 model picker
- webhook request guard 参数化
- 复杂 cron 向导

### 8.2 Phase 2

目标：

- 补齐安装生命周期与最缺的模块化配置面

包含：

- `bdd self-update`
- `bdd uninstall`
- `bdd repair`
- channel 切换
- 更完整的模型与 fallback 配置面
- webhook 子流程
- cron / heartbeat 子流程
- 基础预检探测

### 8.3 Phase 3

目标：

- 为更大规模扩展留接口

包含：

- provider 元数据化 onboarding
- 更完整的 model picker
- skills/plugins 配置入口
- 更强的自动化探测与修复提示

### 8.4 当前进度（2026-04-13）

- `D0` 已完成第一阶段收口：源码包 bootstrap installer、安装到启动闭环稳定性、升级交接与安装诊断口径已形成可交付主链；主线已从 `D0` 切走，后续只保留观察与补盲。`D1` 已完成 `bdd setup` 第一版 `QuickStart / Advanced` 主流程与第一版 WebChat 配对闭环。
- 当前已完成：
  - 已新增仓库级 `install.ps1 / install.sh`，默认协议改为“GitHub release 源码包 + 本地 `Node/corepack/pnpm/build` bootstrap + 进入 `bdd setup`”。
  - `install.ps1` 已完成一轮真实 Windows 手测：
    - 在独立安装目录中成功完成源码包下载、依赖安装、构建、落盘 `bdd.cmd / start.bat / install-info.json`
    - `bdd.cmd --help` 已可正常执行
    - `start.bat` 已可在临时端口成功拉起 Gateway，并通过 `/health` 返回 `200`
  - `install.sh` 已按与 Windows 相同的安装顺序、回滚语义与 wrapper 行为完成静态对称性修补，并已补过一轮 `WSL Ubuntu` 真实 PTY 复核。
  - 安装器生成的 `bdd.cmd / bdd / start.bat / start.sh / start.ps1` 已显式固定安装态 `runtimeDir/envDir`，安装后的 `.env / .env.local` 默认落在 `<install-root>/`，而不是 `current/`。
  - 安装器生成的 `bdd.cmd / bdd / start.bat / start.sh / start.ps1` 现已直接执行安装态 `current/packages/belldandy-core/dist/bin/bdd.js`，不再回退到仓库根 `start.*` 或 `corepack pnpm ... bdd` 开发链。
  - distribution runtime 已补“`install-info.json` + `current/`”安装态识别；即使当前工作目录里存在 `.env.local`，安装形态下的 `bdd setup` 也会优先写回安装根 `envDir`，而不是误命中源码仓库 `legacy_root`。
  - `start.bat / start.sh` 已完成跨平台启动上下文对齐：保留源码态可用性，同时在安装态下自动回推安装根 `envDir`。
  - 已补一轮 `install-state` smoke：
    - 会在隔离安装根下生成 `start.bat / start.sh / bdd.cmd / bdd / install-info.json`
    - 会校验四个 wrapper 的安装态 `runtimeDir/envDir` contract
    - 会验证重复启动后 `/health` 可达，且安装根 `.env` 会自动生成
    - Windows 当前已原生覆盖 `start.bat / bdd.cmd`；`start.sh / bdd` 在 Windows 宿主下先走 contract 级语义执行，待后续真实 Unix 环境继续补原生 smoke
  - 已补一轮 `install-journey` smoke：
    - 已覆盖 `setup -> doctor -> start -> /health` 一条龙主链
    - 会在隔离安装根下执行非交互 `bdd setup --json --flow quickstart --scenario local --provider mock`
    - 会额外校验 `doctor` 看到的 `Environment directory` 与 `.env.local` 都指向安装根，而不是源码仓库
    - Windows 当前已原生覆盖 `bdd.cmd + start.bat`；Unix wrapper 在 Windows 宿主下先走 semantic 路径，避免把宿主差异误判为安装态回归
  - 已补一轮 `install-lifecycle` smoke：
    - 已覆盖“初次 setup/start 成功 -> 重复安装刷新 wrapper/current -> 升级后再次启动”最小 lifecycle
    - 重复安装与升级阶段都会保留安装根 `.env / .env.local` 与隔离 `stateDir`，并再次通过 `doctor` 与 `/health`
    - 当前会额外校验自定义 `.env.local` marker、state marker 与 `install-info.json version/tag` 升级语义，避免刷新安装态时误清用户配置
  - 已补一轮真实 installer script rerun smoke：
    - 当前会真实调用 `install.ps1` 两次，而不只是刷新安装态 fixture
    - installer 已补本地测试入口：`-SourceDir + -SkipInstallBuild`，用于在不走 GitHub 下载与真实依赖安装的前提下验证 rerun 语义
    - 当前已确认第二次安装时会创建 `backups/current-*`、重写 `install-info.json`，并保留安装根 `.env.local` 与隔离 `stateDir`
  - 已补一轮真实 installer rollback smoke：
    - 已新增 `install-script-rollback` smoke，覆盖 `after_backup / after_promote / before_install_build / before_setup`
    - 当前会真实调用 `install.ps1`，并在 failpoint 触发后验证 `current/`、`install-info.json` 与安装根 wrapper 会一起回滚
    - 当前已确认 rollback 后可继续 `start -> /health -> doctor`，且安装根 `.env.local` 与隔离 `stateDir` 不丢失
  - 已补一轮 WSL 下真实 `install.sh` rerun / rollback smoke：
    - 已新增 `install-script-lifecycle:wsl` 与 `install-script-rollback:wsl`
    - 当前会通过 `wsl.exe -d Ubuntu bash -lc ...` 真实调用 `install.sh`
    - 为避免宿主 Windows `node_modules` 的原生模块污染 Linux 运行时，当前改用最小 fake source fixture 验证 `install.sh` 的 rerun / rollback 语义本身
  - 已补一轮 WSL 下真实 `install.sh` staging source build smoke：
    - 已新增 `install-script-build:wsl`
    - `install.sh` 现已支持：`--source-dir` 在 `--skip-install-build` 下继续走 symlink 语义，在真实 install/build 时改为复制 source 到 `current/`，避免污染原 source
    - 当前会先准备 Linux-safe staging source，再由 `WSL Ubuntu` 真实完成 `pnpm install / pnpm build -> bdd setup --json -> start -> /health -> doctor`
    - 当前已额外确认 `packages/belldandy-memory` 下的 `better-sqlite3` 可在 Linux 安装产物中成功加载
  - 已补一轮 Windows 下真实 `install.ps1` staging source build smoke：
    - 已新增 `install-script-build`
    - 当前会先准备 Windows staging source，再由 `install.ps1` 真实完成 `pnpm install / pnpm build -> bdd setup --json -> start.bat -> /health -> doctor`
    - 当前已额外确认 `packages/belldandy-memory` 下的 `better-sqlite3` 可在 Windows 安装产物中成功加载
    - `@belldandy/browser` 已补稳定 `bin/relay.mjs` shim，当前 Windows build smoke 中已不再出现 `Failed to create bin ... belldandy-relay` 的 install warn
  - 已补一轮更接近真实外部故障的 Windows rollback smoke：
    - 已新增 `install-script-rollback:real`
    - 当前已覆盖四类非 failpoint 样本：复制后 source 缺 `package.json`、`corepack prepare` 失败、`pnpm install` 直连 tarball 依赖获取失败、以及 registry 不可达导致的依赖元数据获取失败；另有 source 缺 `packages/belldandy-core/dist/bin/bdd.js` 导致 `bdd setup` 启动失败
    - 当前已确认上述真实异常后都会恢复 `current/`、`install-info.json`、安装根 wrapper、`.env.local` 与 `stateDir`
  - 已补一轮升级后 `setup / skip-setup` 交接策略：
    - fresh install 在未显式 `NoSetup` / `--no-setup` 时仍默认进入 `bdd setup`
    - 升级时若安装根已存在 `.env.local`，当前会默认跳过 `bdd setup`，保留既有配置并给出显式 rerun setup 提示
    - 已新增 `-ForceSetup / --force-setup`，用于升级后显式重跑 `bdd setup`
    - 已新增 `install-script-upgrade-handoff` smoke，当前已验证“升级自动 skip setup”与“force-setup 失败后 rollback 恢复”两条路径
  - 已收一轮 `pnpm approve-builds` 的 install/build 口径：
    - `pnpm-workspace.yaml` 已显式沉淀 `ignoredBuiltDependencies: node-pty / onnxruntime-node / protobufjs`
    - 当前默认安装主链不再出现 `Run "pnpm approve-builds"` 噪音提示
    - 当前保留的语义是：`node-pty` 继续走 `child_process` fallback，local embedding 继续维持 optional 口径，飞书 SDK 相关 build script 不作为默认 install/build 阻塞项
    - Windows / WSL 两条真实 build smoke 当前都已确认安装日志中不再出现该 warning
  - 已收一轮 `start/install/build` 缺能力提示：
    - `start.bat / start.sh` 在安装产物缺失、尚未构建或核心入口不存在时，当前会直接给出更明确的 install/build 指引
    - `install.ps1 / install.sh` 在 `Node / corepack / pnpm` 等前置能力缺失时，当前会优先返回更干净的缺能力提示，而不是直接抛底层错误
  - 已补 `doctor` optional capability 摘要：
    - `bdd doctor`、`system.doctor` 当前会统一汇总 optional capability 的 `ok / warn / missing`
    - 当前可直接看到 `node-pty / onnxruntime-node / protobufjs` 等 optional 依赖的缺失是否仅属可降级能力，而不是主链阻塞
  - 已补“升级后首次启动提醒 / setup 指引”最小版：
    - 升级 handoff 在默认 skip setup 时，安装总结当前会显式输出 `First start:` 提示
    - 安装根会生成一次性 `first-start-notice`，首次执行 `start.bat / start.sh` 时会打印 `Post-install note` 后自动清理
    - `install-script-upgrade-handoff` smoke 当前已额外确认上述一次性提示链路成立
  - `bdd setup` 已完成第一版 2.0 主流程收口：
    - 已支持 `QuickStart / Advanced`
    - 已支持 `local / lan / remote`
    - 已支持已有配置 `reuse / modify / reset`
    - 已补非交互 flag 到答案模型的统一转换与 summary 输出
    - 已修正 `.env.local` 托管键覆盖式写入，避免从远程 OpenAI/token 切回本地 mock/none 时残留旧键
  - `D1` 的 `Advanced` 模块化入口第一版已落地：
    - 已支持 `community / models / webhook / cron` 四个最小模块
    - 已新增 `bdd configure community|models|webhook|cron` 作为后续统一补配置入口
    - `community` 已按 `authMode` 分流 Community HTTP API 开关与 token 复用 / 独立 token 逻辑
    - `models` 已支持最小 `models.json fallback` 配置写入
    - `webhook` 已支持最小单条 rule 的 add/update/clear
    - `cron` 已支持 `.env.local` 内 `BELLDANDY_CRON_ENABLED / BELLDANDY_HEARTBEAT_*` 基础开关
    - `community / models / webhook / cron` 进入前均已补当前配置摘要，减少盲改
    - `community` 已支持显式选择已有 agent 进行更新，也已支持删除单个 agent
    - `models` 已支持显式选择已有 fallback 进行编辑，也已支持删除单个 fallback，而不再只能“清空全部”
    - `webhook` 已支持显式选择已有 rule 进行编辑，也已支持删除单个 rule，而不再只能“清空全部”
    - `cron` 在关闭 heartbeat 时会自动清理旧的 `BELLDANDY_HEARTBEAT_INTERVAL`，避免残留半旧配置
    - `models` 已完成第一轮更完整编辑能力收口：
      - `protocol / wireApi` 已从自由文本改为受限选择，降低误填率
      - 已补高级字段：`requestTimeoutMs / maxRetries / retryBackoffMs / proxyUrl`
      - 已补第一版 `Organize fallbacks`：
        - 支持按 `id / displayName / model` 排序
        - 支持批量删除多个 fallback
        - 支持批量编辑多个 fallback 的高级字段：`protocol / wireApi / requestTimeoutMs / maxRetries / retryBackoffMs / proxyUrl`
      - 已补更强的 provider / protocol 维度诊断摘要：
        - 可汇总 provider bucket 分布、同 provider 重复 fallback、generic provider bucket
        - 可提示继承全局 `protocol`、`protocol=anthropic + wireApi` 无效组合、`wireApi=responses` 兼容性提醒
        - 可提示 auth/runtime 缺失与 provider/model 路由重复
      - 已补轻量 `preferred provider` 配置入口：
        - 可直接在 `bdd configure models` 中编辑 `BELLDANDY_MODEL_PREFERRED_PROVIDERS`
        - 确认前会预览当前顺序、下一次生效顺序、命中/未命中的 fallback provider bucket 与 picker grouping 变化
      - 编辑已有 fallback 时，若修改 `id`，当前已按“重命名”语义处理，不再残留旧条目
      - 已补重复 `fallback id` 校验，避免静默覆盖其他 profile
    - `community` 已完成第一轮高级字段接线：
      - 已补 `reconnect.enabled / maxRetries / backoffMs`
      - 已补 agent 级 `office.downloadDir / uploadRoots`
      - 当前配置摘要已可直接看到 `reconnect` 与 `office` 概况
      - 编辑已有 agent 时，若调整名称，当前已按“重命名”语义处理，不再残留旧 agent
      - 已补第一版 `Organize agents`：
        - 支持按 `agent name / room name / office readiness` 排序
        - 支持批量删除多个 agent
        - 支持批量编辑多个 agent 的 `room`
        - 支持批量编辑或清空多个 agent 的 `office`
      - 已补一轮更完整 Community API / auth 风险提示：
        - 当前会结合 `BELLDANDY_HOST / BELLDANDY_AUTH_MODE / BELLDANDY_COMMUNITY_API_ENABLED / BELLDANDY_COMMUNITY_API_TOKEN`
        - 可提示公网暴露、HTTP 明文、gateway token 复用、password 模式下的独立 token 要求、无 agent、遗留 token 等场景
      - 已补一轮更强 reconnect / office 诊断反馈：
        - 可提示 `maxRetries=0`、过小/过大的 `backoffMs`
        - 可提示缺少 `room`、缺少 `office`、仅 `downloadDir`、仅 `uploadRoots`
        - 可提示多个 agent 共享同一 room
    - `webhook` 已完成第一轮增强：
      - 已补 `promptTemplate` 编辑 / 清空
      - 当前配置摘要已可标记某条 rule 是否使用自定义 `promptTemplate`
      - 编辑已有 rule 时，若修改 `id`，当前已按“重命名”语义处理，不再残留旧 rule
      - 已补重复 `webhook id` 校验
      - 已补样例驱动的 payload schema / 请求预览：
        - 输入 `Preview payload JSON` 后，当前会额外显示 `Webhook payload schema`
        - 当前会显示更细的 `Webhook payload schema`，展开顶层字段与一层嵌套字段路径，并附基础样例值 / array item 数量
        - 当前会显示更细的 `Webhook request preview`，包含 route / agent / conversation handling / payload keys / template coverage / request body preview / resolved prompt preview
        - 当前支持直接输入 `JSON[]` 做多样例对比预览，会显示 common/union keys、各 sample schema highlights 与逐 sample request preview
      - 已补一轮更细的批量整理能力：
        - organize 时当前可先按 `enabled / disabled / custom template / JSON fallback` 过滤
        - 当前可直接 `Apply to all matched webhooks`
      - 已补内建批量策略预设：
          - `Disable enabled JSON fallback webhooks`
          - `Enable disabled custom-template webhooks`
        - `Remove disabled JSON fallback webhooks`
        - 当前可将命中结果命名保存为自定义策略，并支持再次应用
        - 保存策略时当前会额外显示命中摘要与风险提示（例如当前命中数量、template mix、fallback / nested placeholder 风险）
        - 当前可管理已保存策略：`rename / remove / clear all`
        - 执行前当前会额外显示 `Webhook organize preview`，汇总命中数量、变更影响、template mix 与 agent coverage
        - 当前会自动保存最近一次 `Webhook organize preview`
        - 当前可选择 `Save matched webhooks as selection`
        - 当前可直接 `Reuse last preview result / Reuse last selected webhooks`
    - `cron` 已完成第一轮增强：
      - 已补 `BELLDANDY_HEARTBEAT_ACTIVE_HOURS`
      - 已补 `cron-jobs.json` 的最小单条 job 编辑入口：
        - 支持 add/update/remove one job
        - 已覆盖 `every / dailyAt / weeklyAt / at`
        - 已覆盖 `systemEvent / goalApprovalScan`
      - 当前配置摘要已可看到已有 cron jobs 的最小概况
    - `community / webhook / cron` 已进入第二轮体验收口：
      - `community` 已补第一版风险提示与诊断 note：
        - `http://` 非本地 endpoint 风险
        - 已有 agent 但关闭 reconnect 的风险
        - Community API 复用 gateway auth 的风险
      - `webhook` 已补第一版批量整理与诊断反馈：
        - 支持批量 enable/disable/remove
        - 已补 enabled/disabled/custom template 统计
        - 已补“空白 `promptTemplate` 将回退到 `JSON.stringify(payload)`”提示
        - 已补模板 `{{placeholder}}` 摘要、字段来源说明、preview 缺字段提示与不支持嵌套字段 warning
      - `cron` 已补第一版批量整理与诊断反馈：
      - 支持批量 enable/disable/remove jobs
      - 已补批量整理前的常用 filter：
        - `enabled / disabled / failed / skipped / ok`
        - `silent / goalApprovalScan / systemEvent / missing next run`
      - 已补组合条件筛选：
        - 可叠加 `enabled state / last status / payload kind`
        - 可叠加 `silent / missing next run / failure delivery off / one-shot`
      - 已补批量策略预设：
        - `Disable silent failed jobs`
        - `Disable jobs missing next run`
        - `Disable silent goal scans`
        - `Enable disabled goal scans`
        - `Remove disabled one-shot jobs`
      - 已补命中结果复用与策略沉淀：
        - 当前可直接复用上一次选中的 job 集继续做下一轮 organize
        - 组合条件现已可保存为自定义 strategy，并持久化到 `cron-organize-state.json`
        - 后续可直接从 saved custom strategy 重新命中并执行同类批量动作
      - 已补 saved strategy 管理：
        - 已支持 rename / remove one / clear all
        - 可直接在 `bdd configure cron -> organize` 内维护 `cron-organize-state.json`
      - 已补批量策略建议：
        - 会根据当前 `cron-jobs.json` 自动给出可命中的预设策略与命中数
        - 当前会在进入 `cron` 模块时直接显示 `Cron organize suggestions`
        - 建议文案现已带运行历史摘要，例如 failures / skips / missing next run / slow runs / examples
      - 已补批量命中预览 / dry-run：
        - 在真正写入前会先显示 `Cron organize preview`
        - 当前可直接选择 `Review and pick jobs / Apply to all matched jobs / Dry-run only`
        - dry-run 不会写回 `cron-jobs.json`，只返回本轮命中与影响摘要
      - 已补 preview 结果复用：
        - 上一轮 preview / dry-run 的命中结果会持久化到 `cron-organize-state.json`
        - 下一轮可直接选择 `Reuse last preview result`，复用上一轮 action + matched jobs
      - 已补 preview 结果复用后的更细编排：
        - 复用上一轮 preview 结果时，当前可直接保留原 action
        - 也可直接切换为 `enable / disable / remove` 后继续 apply 或 dry-run
      - 已补 preview / selection 之间的桥接沉淀：
        - preview 阶段当前可直接选择 `Save matched jobs as selection`
        - 保存后无需重走 filter / conditions，下一轮可直接走 `Reuse last selected jobs`
      - 已补 enabled/disabled job 统计
      - 已补 `next run missing`、runtime disabled、heartbeat 全天运行等诊断提示
      - 已补 earliest next run、recent failures、delivery summary 与“一次性 job 保留 / silent job / goalApprovalScan failure 无通知”风险提示
        - 已补单 job `run now`：
          - gateway runtime 可达时，直接走真实 `cron.run_now`
          - runtime 不可达时，回退为写回 `nextRunAtMs=now` 的排队模式
        - 已补单 job `recovery hint`，可针对 failed/skipped/silent/one-shot job 给出定向恢复建议
        - 已补单 job `recovery run / replay`：
          - 可通过真实 `cron.recovery.run` 对最近 failed cron run 触发 targeted recovery
          - 可回放 background continuation ledger 中的最近失败 / recovery outcome / recovery replay 摘要
    - 已补第一轮输入校验收口：
      - `community endpoint / fallback base URL` 必须为合法 `http(s)` URL
      - `webhook id` 限制为安全 path segment
      - `heartbeat interval` 与 gateway 当前实际解析规则保持一致
  - `bdd configure <module>` 已补显式 completion banner，自动化可稳定等待：
    - `Community configuration saved`
    - `Models configuration saved`
    - `Webhook configuration saved`
    - `Cron configuration saved`
    - 如用户在模块内一路 `Skip`，则输出 `configuration unchanged`，不再误报 `saved`
  - 初次模型配置继续复用当前 WebChat 设置弹窗，不新增独立配置入口。
  - 如果默认模型尚未设置完成，则每次打开 WebChat 都会自动弹出设置弹窗，直到补齐为止。
  - 如果当前 WebChat 会话尚未完成配对，则每次打开 WebChat 都会自动弹出设置弹窗，并聚焦到可批准配对的位置。
  - pairing 批准已可在 WebChat 内直接完成，不再要求默认用户流切回终端执行命令。
  - pairing pending 已按当前 `clientId` 收口为“当前会话只保留最新一条待批准配对码”，避免旧码残留。
- 当前已验证：
  - `install.ps1` 已完成一轮真实 Windows 安装与启动烟测。
  - `install.sh` 已完成严格静态审查，并已完成一轮真实 `WSL Ubuntu (Linux)` 安装 / setup / 启动手测：
    - `install.sh --version v0.2.4 --no-setup` 已跑通
    - 完整 `install.sh --version v0.2.4` 已成功把 `.env.local` 写入安装根
    - 安装态 `start.sh` 已成功拉起 gateway，并通过 `/health` 返回 `200`
    - `bdd doctor --json` 已确认 `Environment directory` 与 `.env.local` 都指向安装根
    - 已额外完成一轮真实 `PTY` 驱动的安装态 `bdd setup` 冒烟，确认配置写入安装根后可自然 `exit 0`
  - 已补对应定向测试，并已通过 `runtime-paths` 与 `setup` 共享逻辑测试。
  - 已完成 `corepack pnpm build`。
  - 已完成：
    - `node .\\packages\\star-sanctuary-distribution\\scripts\\smoke-install-journey.mjs`
    - `node .\\packages\\star-sanctuary-distribution\\scripts\\smoke-install-lifecycle.mjs`
    - `node .\\packages\\star-sanctuary-distribution\\scripts\\smoke-install-script-lifecycle.mjs`
    - `node .\\packages\\star-sanctuary-distribution\\scripts\\smoke-install-script-rollback.mjs`
    - `node .\\packages\\star-sanctuary-distribution\\scripts\\smoke-install-script-lifecycle-wsl.mjs`
    - `node .\\packages\\star-sanctuary-distribution\\scripts\\smoke-install-script-rollback-wsl.mjs`
  - 已完成一轮真实 CLI 冒烟，确认“仅显式提供安装态 `runtimeDir`、不显式提供 `envDir`”时，`bdd setup` 仍会写入安装根而不是源码仓库目录。
  - 已完成一轮隔离 `envDir / stateDir` 的真实交互冒烟，确认：
    - `bdd setup --flow advanced --scenario local`
    - `bdd configure community`
    - `bdd configure webhook`
    - `bdd configure cron`
    - 以上流程均只写入隔离目录，不会误写回仓库根
  - 已完成一轮补 banner 后的真实交互 smoke，确认 `bdd configure community|webhook|cron` 可被固定成功文案稳定命中。
  - 已完成一轮 `configuration unchanged` 的真实交互 smoke，确认 `bdd configure community|models|webhook|cron` 在一路 `Skip` 时都会稳定输出 `configuration unchanged`，且不会误写隔离配置文件。
  - 已补 `Advanced` 校验与 `configure` completion 的定向自动化测试，并通过对应 `vitest`。
  - 已补 `models` 第一轮增强的定向 helper 测试：
    - fallback 批量删除
    - fallback 排序
    - 可选整数 / URL 高级字段校验
    - fallback 批量高级字段编辑
    - provider / protocol 诊断摘要
    - preferred provider 轻量配置预览与摘要
    - 已通过精确 `vitest` 文件级验证
  - 已补 `Advanced` 定向交互 smoke 自动化测试，并通过：
    - `community`：`reconnect + office` 更新落盘
    - `community`：Community API 复用 gateway auth 风险提示
    - `models`：批量编辑 fallback 高级字段
    - `models`：轻量更新 preferred provider 顺序
    - `webhook`：`promptTemplate` 编辑、rule 重命名、模板字段来源/缺字段/不支持嵌套字段提示
    - `webhook`：批量 disable
    - `cron`：`HEARTBEAT_ACTIVE_HOURS` 与最小 job add/update 落盘
    - `cron`：批量 disable jobs + organize filter / combined conditions / strategy preset / last hit reuse + automation diagnostics 摘要
    - `cron`：单 job `run now`
    - `cron`：单 job `recovery run / replay`
    - `cron`：单 job `recovery hint`
  - 已补一轮 runtime 级 `cron.run_now` 定向验证，并通过：
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.doctor.test.ts`
  - 已补一轮 runtime 级 `cron.recovery.run` 与 recovery replay 定向验证，并复用同一组 `server.doctor / advanced-modules.smoke` 自动化通过
  - 已完成一轮 `Advanced UX` 隔离真实交互 smoke，确认新分支已跑通：
    - `bdd configure community` 已命中“选择已有 agent 更新”与“删除单个 agent”
    - `bdd configure models` 已命中“删除单个 fallback”
    - `bdd configure webhook` 已命中“删除单个 rule”
    - 以上流程均已检查隔离 `stateDir` 落盘结果，与交互选择一致
  - 已完成一轮真实手测，确认“打开 WebChat -> 自动弹设置 -> 批准 pairing -> pending 清空”的主链闭环成立。
  - 已完成一轮基于真实模型凭据的隔离端到端手测：
    - 使用隔离 `envDir / stateDir` 从仓库 `# MinMax-M2.5配置` 写入真实模型配置
    - `bdd doctor --json` 已确认 `OpenAI Base URL / API Key / Model` 都通过
    - gateway 已成功启动，`/health` 返回 `200`
    - WebChat 已成功打开并以 `MiniMax-M2.7-highspeed` 作为默认模型完成真实发送
    - 通过消息区“复制全文”已确认 assistant 实际回复内容为 `E2E smoke ok`
  - 已完成一轮 WebChat assistant 正文自动化可观测性修补与真实 smoke：
    - assistant 消息 DOM 已补稳定 `.msg-body` 语义节点，并为正文同步 `role="article"`、`aria-label` 与 `data-message-text`
    - Playwright 自动化快照现已可直接读到 assistant 正文，不再依赖“复制全文”旁路取证
    - 真实 smoke 中已确认最新 assistant 回复可直接在快照中呈现为 `article "Belldandy(MVP) 收到：只回复：E2E smoke ok"`
- 当前仍未完成：
  - `Linux / WSL` 侧当前剩余边界主要是“非 TTY 自动化驱动 `bdd setup`”的交互兼容性；真实 `PTY`/手工终端主链已确认可自然退出。
  - `install.sh` 的“真实仓库源码 + Linux 侧依赖安装/构建”版本闭环当前也已在 `WSL Ubuntu` 下完成，但仍不能直接复用宿主 Windows 工作区的 `node_modules`。
  - 当前若直接在 WSL 里复用宿主 Windows 工作区的 `node_modules`，仍会遇到 `better-sqlite3 invalid ELF header` 这类跨平台原生模块污染问题；现阶段口径是先 staging source，再在 Linux 安装根内独立 `pnpm install/build`。
  - `macOS` 当前暂无验证环境，仍应标记为“未验证”，但不再作为本阶段阻塞项。
  - 前端侧 assistant 富文本消息的自动化稳定性覆盖已完成一轮更完整收口：
    - 已补 `chat-ui` 定向自动化，覆盖长 Markdown、代码块、表格、图片/视频缩略图、复制反馈、media modal、流式增量渲染、完成态音频播放与基础安全清洗
    - 当前剩余更适合作为观察与补充项，而不是继续作为当前主优先级：
      - 更接近真实浏览器的 smoke
      - 更长流式消息下的滚动/重排稳定性
      - 富媒体快照稳定性持续观察
  - `models` 已完成第一轮“更完整 fallback 编辑 / 整理”收口，但仍未进入：
    - primary model / compaction / memory summary 等更完整模型配置面
    - 更深的 provider 探测 / 连通性校验 / runtime 级失败诊断
    - 如后续继续增强，优先应围绕现有 picker / catalog / doctor 的轻量联动，而不是扩成新的完整模型控制台
  - `community / webhook / cron` 的第二轮 CLI 收口已推进到“暂不阻塞主线”的状态；后续若继续补，优先视作增强项，而不是 `D1 Advanced` 第一版必须完成项
  - `community` 当前剩余更适合放入观察与小修：
    - Community API / auth 风险文案继续打磨
    - reconnect / office 诊断继续细化
  - `webhook` 当前剩余更适合放入增强 backlog：
    - 内建样例集 / 常见 webhook 场景模板
  - `cron` 当前剩余更适合放入增强 backlog：
    - 更细的策略建议演进与组合

### 8.5 后续计划

1. `D0` 第一阶段已收口，主线正式从 `D0` 切走：
  - 当前已形成相对完整的“`install -> setup -> start -> /health -> doctor`”可交付主链
  - installer 主链、install/start/health/lifecycle/rollback/build/upgrade-handoff、`pnpm approve-builds` 口径、`start/install/build` 缺能力提示，以及 `doctor` optional capability 摘要都已补齐
  - 升级后首次启动的一次性提醒链路也已落地：安装总结 `First start:`、安装根 `first-start-notice`、首次 `start.*` 的 `Post-install note`
  - 后续不再继续扩 `D0` 功能面；默认仅保留：
    - `macOS` 有真实环境时再做实机验证
    - 真实外部失败样本驱动的小修
    - 安装日志 / 文案 / warning 级别的收口补盲
2. 前端侧 assistant 富文本消息的自动化稳定性覆盖已完成一轮更完整推进，当前转入观察与补充：
   - 已覆盖长 Markdown、代码块 / 表格、图片 / 视频缩略图、复制反馈、media modal、流式增量渲染、完成态音频播放与基础安全清洗
   - 后续若继续补，优先是更接近真实浏览器的 smoke、长流式消息滚动稳定性与富媒体快照稳定性观察
3. `D1 Advanced` 第一版模块体验暂时收口，转入观察与小修：
   - `models`：批量高级字段编辑、更强诊断摘要与轻量 preferred provider 配置入口已补齐，后续继续保持观察，不扩成完整模型配置中心
   - `community`：后续若再补，优先是 Community API / auth 风险文案与 reconnect / office 诊断细化
   - `webhook`：后续若再补，优先是内建样例集 / 常见 webhook 场景模板
   - `cron`：后续若再补，优先是更细的策略建议演进与组合
4. `Linux / WSL` 侧“非 TTY 自动化驱动 bdd setup”暂时降为观察项；若后续真的要做脚本化首装，再单独补自动化兼容层，而不是继续改动真实终端主链。
5. `macOS` 保持未验证标记，待未来有真实环境时再补，不作为当前阶段继续推进的前置条件。
6. `H4` 当前改为观察与小修项，不再作为本轮主线：
   - `H4-1` 与 `H4-2` 的最小可观测闭环和统一 diagnostics 口径已成立
   - 后续默认只观察真实 fallback / degrade 信号质量、告警文案与 runtime 证据闭环，不继续向更深 provider runtime 重构扩面

### 8.6 当前可用安装命令

Windows PowerShell 默认安装：

```powershell
irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1 | iex
```

Windows PowerShell 指定版本并跳过 setup：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -NoSetup
```

Windows PowerShell 指定安装目录：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -InstallDir "$env:LOCALAPPDATA\StarSanctuary" -NoSetup
```

Linux / macOS 默认安装：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash
```

Linux / macOS 指定版本并跳过 setup：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --no-setup
```

Linux / macOS 指定安装目录：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --install-dir "$HOME/.local/share/star-sanctuary" --no-setup
```

---

## 9. 验证标准

### Smoke

1. `Windows / macOS / Linux` 都能通过一条命令完成安装。
2. 安装完成后可直接执行 `bdd --help`。
3. 安装完成后可自动进入 `bdd setup`。
4. 安装目录中保留 `start.bat / start.sh` 作为重复启动入口。
5. `Windows` 默认创建桌面快捷方式，且桌面快捷方式能正确启动到同一入口。
6. 全新用户运行 `bdd setup` 可以完成 QuickStart 并成功写入配置。
7. 已有用户运行 `bdd setup` 可以识别旧配置并选择沿用或修改。
8. `host=0.0.0.0` 且 `auth=none` 时会被阻止继续。
9. 启用 `Advanced` 时，可以在 setup 内完成 `community` 的最小必填配置。
10. 配对码可在 WebChat 内直接完成批准，不要求额外终端命令。

### Manual

1. 默认用户无需理解 `Portable / Single-Exe / 源码包` 差异。
2. 安装失败时有明确的下一步提示。
3. `artifacts/` 不再出现在默认安装路径说明里。
4. 用户在 WebChat 内就能完成配对批准，不需要切回命令行。
5. QuickStart 路径问题数明显少于当前版本。
6. Advanced 路径能覆盖本地/LAN/远程三类主要场景。
7. 用户在不打开文档的情况下，也能从 summary 页知道下一步怎么做。

### Regression Focus

1. 原有 `Portable / Single-Exe` 发布路径继续可用。
2. 小白特供 exe 包不因 `D0` 被废弃。
3. 开发者仍可继续走源码构建路径。
4. `start.bat / start.sh` 仍可作为后续重复启动入口。
5. 现有非交互 `bdd setup --provider ...` 行为不回退。
6. 现有 community 独立 wizard 仍可继续单独使用。
7. 现有 `.env.local` 写入逻辑不破坏。
8. CLI `bdd pairing approve` 仍保留为兼容与诊断路径。

---

## 10. 风险与取舍

### 风险

1. 如果一开始就把源码安装作为默认路径，失败率会明显变高。
2. 如果没有统一的 GitHub Releases metadata 解析逻辑，后续版本升级会让脚本与发布地址频繁漂移。
3. 如果把 installer 和 setup 混做成一个超长脚本，验证与回滚都会变差。
4. 如果第一版就把所有模块都塞进 setup，交互会过长，反而降低完成率。
5. 如果要求默认用户机器先具备完整构建环境但错误提示不清晰，安装失败会集中暴露在 `Node / corepack / build` 阶段。
6. 如果继续保持 community 独立入口，2.0 的“统一主路径”目标会被削弱。
7. 如果配对批准仍依赖终端命令，默认用户流会在 WebChat 内被打断。
8. 如果重复启动入口不稳定，安装完成后的长期使用体验会明显变差。

### 取舍

1. 默认路径优先选择 GitHub Releases 源码包 bootstrap，而不是官网大包下载链。
2. `artifacts/` 继续保留，但只作为内部/特供产物，不作为默认安装协议。
3. `D0` 先解决“从 GitHub release 源码包装上并进入 setup”，后续再补更新与卸载。
4. 第一阶段优先统一路径，不追求配置覆盖率最大化。
5. `community` 不进入 `QuickStart`，但在 `Advanced` 中提供统一入口，并保留独立补配置命令。
6. `models.json fallback` 不进入 `QuickStart`，但可先放进 `Advanced` 的最小子流程；更完整模型面后置。
7. 默认用户流优先走 WebChat 内配对批准，CLI 批准命令只保留为兼容与诊断路径。
8. `start.bat / start.sh` 保留为重复启动入口；`Windows` 桌面快捷方式默认创建，并指向同一入口。

---

## 11. 已确认决策（2026-04-12）

1. 默认下载源确定为 GitHub Releases 的源码包与 metadata API，而不是 GitHub 上的 `portable / single-exe` 大包。
2. 不再单独定义 `--from-source`；默认 installer 本身就是“release 源码包 bootstrap + 本机构建”路径。
3. 默认安装目录统一收敛到用户目录。
4. 安装完成后默认立即进入 `bdd setup`。
5. WebChat 内的配对批准入口默认两者都保留：设置页作为稳定主入口，配对弹窗负责即时提醒与就地批准。
6. `start.bat / start.sh` 在所有正式安装形态中都作为标准重复启动入口落盘。
7. `Windows` 桌面快捷方式默认创建，并指向同一 `start.bat` 入口。
8. `QuickStart` 不只支持本地单机；它应支持本地、局域网、远程/反向代理后的基础场景，但仍只问最少问题。
9. `community` 不进入 `QuickStart`，但在 `Advanced` 中提供统一入口；同时保留后续独立配置路径。
10. `models.json fallback` 不放进 `QuickStart`，但可进入 `Advanced` 的最小子流程；更完整模型面后置。
11. `webhook / cron` 在第一阶段只保留基础开关。
12. 新增 `bdd configure <module>` 作为后续统一入口。

---

## 12. 一句话结论

Setup 2.0 应先用 `D0` 解决“用户如何一行命令从 GitHub release 源码包完成 bootstrap 并获得可运行的 `bdd`”，再用 `D1` 解决“如何统一完成首次配置并减少误配”，而不是把官网大包下载、内部 `artifacts/` 路径和所有高级能力混成一条不稳定的大脚本。
