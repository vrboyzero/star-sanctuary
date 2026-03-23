# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2026-03-13

聚焦发布分发能力增强与安装体验补强，作为 `v0.1.1` 后的首个补丁版本发布。

### Distribution / Packaging

- 新增 `star-sanctuary-distribution` 包，提供 portable 包与 single-exe 两条分发链路
- 增加 portable / single-exe 的 build、prefetch、smoke、verify 生命周期脚本
- 补充发布产物清理脚本与工作区构建校验，降低发版过程中的脏产物干扰
- Docker 构建链路补齐 `protocol` 与 `distribution` 依赖拷贝，修复镜像内运行缺包问题

### WebChat / Gateway

- WebChat 设置页增加更多关键配置项与中文说明，降低首次配置门槛
- Gateway 服务补充与标准包分发相关的运行时适配
- 新增 `skill-eligibility` 测试与相关运行时调整，提升技能装载判定稳定性

### Documentation

- `README.md` 与 `README.en.md` 增加安装说明
- 补充标准包、单文件可执行版与安装流程相关文档

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
