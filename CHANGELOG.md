# Changelog

All notable changes to this project will be documented in this file.

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
