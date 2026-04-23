# Changelog

All notable changes to this project will be documented in this file.

## [0.3.3] - 2026-04-23

聚焦 embedding 开关生效链路修复，避免“配置已关闭向量检索却仍初始化 embedding provider”的启动噪音与误报。

### Memory / Embedding

- 修复 `BELLDANDY_EMBEDDING_ENABLED=false` 时的透传链路，`gateway` 会把解析后的开关传递到 scoped memory manager
- `MemoryManager` 新增 `embeddingEnabled` 选项；当显式关闭时强制使用 null embedding provider，不再初始化 OpenAI/local embedding provider
- 在 embedding 显式关闭场景下，保持关键词检索路径可用，避免首启阶段因 embedding 认证失败造成干扰日志

### Tests

- 新增 `MemoryManager` 回归测试，覆盖“有 OpenAI key 但 embedding 被显式禁用”场景，断言使用 null provider 且检索路径正常

## [0.3.2] - 2026-04-23

聚焦默认渠道模板防误触发修复，避免新手安装后因占位值被当成真实凭证导致 WS 连接异常刷屏。

### Channels / Default Env

- 将完整默认模板中的飞书与 QQ 渠道凭证占位值改为空字符串：
  - `BELLDANDY_FEISHU_APP_ID=""`
  - `BELLDANDY_FEISHU_APP_SECRET=""`
  - `BELLDANDY_QQ_APP_ID=""`
  - `BELLDANDY_QQ_APP_SECRET=""`
- 保持“未配置即不启动渠道”语义，避免占位文本触发飞书/QQ通道启动并引发重连异常日志

## [0.3.1] - 2026-04-23

聚焦安装器首启体验收口与默认配置模板稳态修复，降低新手安装后因环境模板差异导致的启动与配置摩擦。

### Install / Onboarding

- `bdd setup` 启动时会先补齐 `stateDir/.env` 与 `stateDir/.env.local` 默认模板，再写入交互配置，避免首次运行出现“精简配置文件”导致的体验分叉
- 安装链路默认模板改为新手安全策略：`BELLDANDY_EMBEDDING_ENABLED` 默认关闭，避免未配置独立 embedding 线路时触发向量检索报错刷屏

### Default Env Template

- 模板中的开发机固定路径已改为通用占位或注释示例（例如 `BELLDANDY_STATE_DIR`、`BELLDANDY_EXTRA_WORKSPACE_ROOTS`、`BELLDANDY_TOOLS_POLICY_FILE`、`BELLDANDY_CAMERA_NATIVE_HELPER_CWD`、`BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH`）
- Obsidian 相关默认 Vault 路径改为空值，避免把开发机目录写入用户首启配置
- 修复 `runtime.env.local` 模板发布可见性（加入版本控制），确保安装器与运行时均可读取完整双文件模板

### Stability

- 保持主要能力默认可用（工具、心跳、调度等），在不阻塞安装/启动前提下减少新用户初次配置门槛

## [0.3.0] - 2026-04-23

聚焦 Agent 运行时能力跃迁、WebChat 能力工作台升级、跨渠道桥接拓展与系统级稳定性收口，作为 `v0.2.4` 后的次版本发布。

### Agent Runtime / Intelligence

- 新增并收口 Agent 梦境能力阶段实现，补齐运行链路与相关治理体验
- 完成 prompt runtime 与 continuation runtime 一体化收口，增强多轮任务执行一致性
- 增强方法与技能经验沉淀流程，支持主动/被动生成策略并收紧生成门槛
- 新增任务开始/结束时间与 token 消耗自动统计，便于运行态追踪与复盘
- 增强会话恢复与记忆链路稳定性，包括 TTL 后会话恢复与 Prompt Snapshot 去重存储

### Web / UX

- WebChat 新增经验能力工作台与能力获取/审批界面，支持更直观地查看方法与技能候选
- 左侧内容栏、上方操作栏、右侧 Agent 信息栏支持隐藏/展开，提升界面空间管理能力
- 优化搜索与筛选栏、记忆查看与经验界面布局，改善高密度信息浏览体验
- 修复多项 WebChat 交互与联动问题，包括邮件线程组织衔接与配置可用性细节

### Channels / Integration

- 完成 CLI Bridge 与对应 MCP 服务接入，增强本地代理与工具链协同能力
- 完成邮件收发 MVP，并补齐相关对话流与组织链路修复
- 推进外接摄像头调用能力改造并落地第一阶段可用版本
- 增强 Agent 与社区地址链路稳定性，减少跨渠道通信异常

### Stability / Performance / Refactor

- 进行一轮全量性能优化与服务卡点治理，降低高负载场景下的阻塞风险
- 完成核心大文件拆分与技术债偿还，关键文件收敛到可维护规模并保持行为一致
- 补齐与强化多 Agent 并行执行、诊断与治理相关能力，提升并发任务可控性
- 修复 bridge 恢复、运行态加载、状态目录配置补齐等关键稳定性问题

### Documentation

- 更新 Setup 2.0、渠道安全策略与多项说明文档，统一当前实现与使用口径
- 持续收口中英文说明文档与项目规范，降低使用与维护偏差

## [0.2.4] - 2026-03-31

聚焦 WebChat 控制台增强、Cron 调度能力扩展与页面自适应收口，作为 `v0.2.3` 后的补丁版本发布。

### Web / UX

- WebChat 右侧新增 Agent 信息栏，支持直接查看当前 Agent 相关状态
- 设置面板补充社交渠道配置入口，并扩展中英文界面文案
- 增加自动任务文件查看与编辑接口，便于在 WebChat 内直接处理相关配置
- 完成 WebChat 页面自适应与间距调整，改善不同窗口宽度下的布局表现

### Cron / Automation

- Cron 能力扩展为支持一次性定时、固定间隔、每日固定时刻和每周固定时刻
- 补齐调度存储、类型定义与技能工具侧适配，适合巡检、扫描、提醒类任务
- 为 Cron 调度链路增加 store、scheduler 与技能工具测试，降低回归风险

### Documentation

- 更新自动任务 / Cron 相关说明文档，统一当前能力口径
- 同步收口 WebChat 自适应相关文档描述

## [0.2.3] - 2026-03-29

聚焦 WebChat 双主题深度视觉升级（翡翠暗影与春华绽放），包含轻量级 CSS 背景动效与亮度对比度修复。作为 `v0.2.2` 后的补丁版本发布。

### Web / UX

- **双主题视觉风格重建**：深度重设了 WebChat 亮暗双主题的色彩体系（暗主题 "Elegance in Darkness"，亮主题 "Spring Blossom"）
- **轻量级背景动效**：增加了纯 CSS 实现的现代感背景动画（暗模式悬浮粒子碎片，亮模式花瓣呼吸装饰），无需 JS 参与，兼顾性能与美感
- **明亮主题对比度修复**：修复了亮主题模式下，bot 气泡代码块内滚动条由于全局透明色继承导致几乎不可见的问题，改为独立且高对比度的滚动条展现
- 优化了全局样式的响应性色彩搭配，在各面板区块中保持出色的阅读易用性

## [0.2.2] - 2026-03-27

聚焦环境变量目录统一、默认 `.env` 自动补齐与 WebChat 连接状态修复，作为 `v0.2.1` 后的补丁版本发布。

### Configuration / Runtime

- Gateway 与 CLI 统一复用同一套 `envDir` / `.env` 加载逻辑，减少启动链路和命令行链路之间的行为漂移
- 默认配置目录改为优先落在状态目录；当检测到 legacy 根目录 `.env` / `.env.local` 时继续兼容旧路径
- 启动时若当前实际 `envDir/.env` 缺失，会自动补齐一份默认 `.env`，降低首次初始化和误删配置后的恢复成本
- 新增 `bdd config migrate-to-state-dir` 手动迁移命令，并在 `doctor` / 启动日志中提示 legacy 根目录配置状态

### Web / UX

- 修复 WebChat 在状态目录配置场景下的连接状态问题，避免界面误判“未连接”
- 微调 WebChat 明亮主题下的代码块背景表现，改善可读性

### Documentation / Tooling

- 更新中英文 README、使用手册与初始化配置实现计划，补齐默认 `.env` 自动生成、`envDir` 判定与迁移命令说明
- 同步更新用户升级手册中的版本示例，统一到 `v0.2.2` 发布口径

## [0.2.1] - 2026-03-27

聚焦 WebChat 体验增强、源码版启动修复与发布配置收口，作为 `v0.2.0` 后的补丁版本发布。

### Web / UX

- WebChat 新增中英双语切换能力，补齐前端国际化资源与语言状态管理
- WebChat 新增白天 / 夜间主题切换，统一页面与画布相关样式表现
- 调整部分聊天、目标、记忆、工具设置等界面细节，改善页面一致性与可读性

### Core / Runtime

- 默认主人 UUID 改为空值，避免标准分发环境继续带入开发期默认身份
- 修复 `start.bat` 的 BOM 乱码与依赖探测问题，避免 Windows 源码版在另一台机器上因失效 `node_modules` 卡在启动阶段
- 同步增强 `start.sh` 的依赖探测逻辑，保持源码启动链路一致

### Release / Distribution

- 停止跟踪仓库内 `.env`，避免把开发机本地环境变量与绝对路径配置带入分发或同步到远端
- `.gitignore` 与 README 中补充本地环境文件使用说明，统一为基于 `.env.example` 生成本机配置

## [0.2.0] - 2026-03-24

聚焦跨平台状态目录隔离与发布主线同步，作为 `v0.1.3` 后的次版本更新发布。

### Core / Runtime

- 增加 Windows 与 WSL 平台状态目录分离能力，避免跨平台共享状态目录带来的配置与运行冲突
- 扩展状态目录判定与协议层导出，补齐对应测试，确保不同运行环境下目录解析结果稳定

### Web / UX

- 调整首页与样式细节，同步更新中英文 README 中与平台状态目录相关的说明
- `.env.example` 补充示例配置，便于不同平台部署时快速校对环境变量

## [0.1.3] - 2026-03-23

聚焦长期任务系统初版落地、WebChat 体验增强、服务端技术债清理与发布文档收口，作为 `v0.1.2` 后的功能增强版本发布。

### Long-term Goals / Governance

- 新增超长期任务 / Long-term Goals 初版能力，支持 goal 创建、恢复、暂停、任务图编排与执行
- 增加 task graph、checkpoint、capability plan、handoff、retrospective、experience suggest 等长期任务核心链路
- 增加 suggestion review / publish 工作流，支持 method / skill 建议进入正式审阅与发布流程
- 增加 cross-goal flow patterns 聚合与 review governance summary，补齐跨任务复盘与治理视角
- 增加 `goalApprovalScan` 等 cron 扫描能力，支持对审批与审阅工作流进行周期巡检

### WebChat / UX

- WebChat 进行了模块化整理，拆分出聊天、设置、记忆、工作区、语音、目标面板等前端功能模块，降低后续维护成本
- 新增长期任务详情、治理面板、能力面板、追踪面板等界面入口，便于直接在 WebChat 中查看 goal 运行态
- 新增用户头像与 Agent 头像选用能力，改善对话身份辨识
- 为对话消息补充 Agent 可识别的时间戳与最新标签，改善长对话和自动化协同时的上下文判断
- 修复 WebChat 启动时连接后端失败的问题，并补充 WebChat 模块结构校验脚本

### Core / Runtime

- 服务端、Agent 编排、工具调用与上下文注入链路完成一轮技术债处理，增强稳定性与可维护性
- 优化服务端性能与 token 消耗控制，减少上下文注入与对话编排中的重复开销
- 改进 goal、memory、MCP、community / Discord / QQ 等多条运行链路的异常处理与测试覆盖
- 补强 webhook 幂等、工具转录、心跳、调度器等基础能力的边界处理

### Distribution / Packaging

- 完成 `v0.1.2` 标准 `Single-Exe` 产物整理与相关分发文档收口
- 更新 single-exe 用户指南与发布清理脚本，进一步统一当前标准包发布口径

### Documentation

- `README.md`、`README.en.md` 与长期任务相关文档同步更新，增加长期任务快速入口与使用说明
- 新增长期任务使用指南、双 Git 仓库发布操作说明等文档，补齐当前发布与协作流程说明
- 对项目说明文档进行一轮收口和精简，使对外文档与当前实现状态更一致

## [0.1.2] - 2026-03-13

聚焦发布分发能力增强与安装体验补强，作为 `v0.1.1` 后的首个补丁版本发布。

### Distribution / Packaging

- 新增 `star-sanctuary-distribution` 包，提供 portable 包与 single-exe 两条分发链路
- 增加 portable / single-exe 的 build、prefetch、smoke、verify 生命周期脚本
- 补充发布产物清理脚本与工作区构建校验，降低发版过程中的脏产物干扰
- Docker 构建链路补齐 `protocol` 与 `distribution` 依赖拷贝，修复镜像内运行缺包问题
- 收口当前标准包发布口径：
  - `Portable` 保留 `Slim` / `Full`
  - `Single-Exe` 当前收口为 `Windows x64 + Full`
- `Single-Exe Full` 产物目录补齐中英双语 README 与元数据文件
- `Single-Exe Full` 最终用户包默认不再携带 `build/` 中间目录
- `build:single-exe`、`smoke:single-exe`、`verify:single-exe-*` 默认收口到 `Full`

### WebChat / Gateway

- WebChat 设置页增加更多关键配置项与中文说明，降低首次配置门槛
- Gateway 服务补充与标准包分发相关的运行时适配
- 新增 `skill-eligibility` 测试与相关运行时调整，提升技能装载判定稳定性

### Documentation

- `README.md` 与 `README.en.md` 增加安装说明
- 补充标准包、单文件可执行版与安装流程相关文档
- 同步更新下载页、升级手册、打包清单与 Single-Exe 新版实现计划，统一到当前发布口径

## [0.1.1] - 2026-03-10

首次正式发布。Star Sanctuary 是一个 local-first 的个人育成型 AI 助手与 Agent 工作台。

### Core / Gateway

- 本地 Gateway 服务，默认监听 `127.0.0.1:28889`
- 前台运行、后台守护进程、健康检查 `GET /health`
- `bdd` CLI 提供 `start / stop / status / doctor / setup / pairing / config / relay / community` 等命令
- `start.bat` / `start.sh` 一键启动，自动检查环境、安装依赖、构建、生成 Token 并打开浏览器
- 鉴权模式支持 `none / token / password`，拒绝公网 + 无鉴权的不安全组合
- 默认状态目录 `~/.star_sanctuary`，兼容旧目录 `~/.belldandy`

### Agent 运行时

- OpenAI 兼容 Provider，支持 `chat_completions` 与 `responses` 双线路
- 主模型 + `models.json` fallback 模型队列
- 上下文自动压缩（Compaction）
- 多 Agent Profile、Agent Registry、按渠道/规则路由到不同 Agent
- FACET 模组机制，支持人格/职能模组切换

### WebChat

- 实时流式对话、配置管理、工具开关、工作区读写
- 客户端首次连接需 Pairing 配对，支持批准/撤销/导入/导出

### 记忆与长期工作区

- SQLite + FTS5 + sqlite-vec 混合检索
- Embedding 向量检索、会话持久化
- 内置工作区文件：`SOUL.md`、`IDENTITY.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`AGENTS.md` 等
- Methods 方法论系统（SOP 沉淀与复用）
- Logs 日志回放、Memory 文件目录
- `agents/{agentId}` 子工作区与 `facets/` 模组

### 工具系统

- 文件读写、目录遍历、补丁应用
- 网页抓取、网络搜索
- 系统命令、进程管理、终端、代码解释器
- 记忆搜索、日志读取、方法论读写、会话委派、并行子任务
- 浏览器打开/导航/点击/输入/截图/快照
- TTS、STT、图像生成、摄像头拍照
- 定时器、Token 计数器、Cron 调度、服务重启
- Skills 检索、Canvas 工作区、身份上下文
- 社区房间、官网工坊/家园工具

### 渠道与集成

- WebChat 渠道
- 飞书、QQ、Discord 渠道接入
- Community 社区长连接与 HTTP API (`POST /api/message`)
- Webhook API (`POST /api/webhook/:id`)，支持独立 Token、幂等保护
- Channels Router 路由引擎，按渠道/房间/关键词/@ 规则分发

### 浏览器自动化

- Browser Relay Server
- Chrome 扩展 (MV3) 配套
- 支持在已登录态下控制浏览器页面

### 官网生态

- 社区接入与房间连接 (`bdd community`)
- Workshop 工具：搜索、查看、下载、发布、更新、删除
- Homestead 工具：查看家园、库存、领取、摆放、回收、挂载、开盲盒

### 部署

- Docker / Docker Compose 部署
- Tailscale 远程访问
- Nix 部署
- `bdd doctor` 健康检查

### 基础设施

- 版本单一源头：根 `package.json` `version` 字段，构建前自动生成 `version.generated.ts`
- `/health` 与 WebSocket `hello-ok` 返回版本号
- 异步更新检查（GitHub Releases）
- Docker 构建链路支持版本注入
- GitHub Release 自动提取 CHANGELOG 对应版本段落
- `scripts/release.sh` 一键发版脚本

