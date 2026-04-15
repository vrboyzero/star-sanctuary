# Star Sanctuary Repo Rules

本文件仅补充仓库级新增规则；系统指令与更高优先级规则仍然优先。

## 工作区边界

- 默认工作目录仅限 `E:\project\star-sanctuary`。
- 同级目录 `openclaw/` 与 `UI-TARS-desktop-main/` 仅作为参考代码，不要在当前任务中写入或改动。

## 常用命令

- 安装依赖：`corepack pnpm install`
- 全量构建：`corepack pnpm build`
- 启动 Gateway：`corepack pnpm start`
- 开发态 Gateway：`corepack pnpm dev:gateway`
- 运行测试：`corepack pnpm test`
- CLI 帮助：`corepack pnpm bdd --help`
- 健康检查：`corepack pnpm bdd doctor`

## 仓库结构速记

- `packages/belldandy-core/`：Gateway、鉴权、pairing、CLI、doctor、配置读写
- `packages/belldandy-agent/`：Agent runtime、会话、工具代理
- `packages/belldandy-skills/`：工具执行框架与 builtin tools
- `packages/belldandy-memory/`：SQLite / FTS / 向量检索
- `packages/belldandy-channels/`：渠道抽象与飞书等实现
- `apps/web/public/`：WebChat 前端，基于原生 JS / CSS
- `apps/browser-extension/`：浏览器扩展

## 关键入口

- Gateway 启动：`packages/belldandy-core/src/bin/gateway.ts`
- HTTP / WebSocket 服务：`packages/belldandy-core/src/server.ts`
- WebChat 前端入口：`apps/web/public/app.js`
- WebChat 功能模块：`apps/web/public/app/features/`

## 运行与配置注意事项

- 持久本地配置优先写 `.env.local`；不要把个人机器上的临时配置直接固化进 `.env`。
- WebChat 的安全能力默认受 pairing 保护；当设置页出现多项配置同时“读取失败”时，先检查当前会话是否尚未完成 pairing，不要直接判断为 assistant mode 或 settings 回归。
- `BELLDANDY_AUTH_MODE=none` 与部分外部能力存在约束；涉及社区 API、对外暴露能力、bind 地址时，先确认鉴权组合是否允许。
- 用户运行态数据通常位于 `~/.star_sanctuary/`；涉及 allowlist、pairing、models、logs、sessions、plugins、skills 等状态时，先区分“仓库代码”与“用户运行态数据”。

## 验证偏好

- 小范围前端 / settings / doctor 改动，优先顺序是：纯函数测试 > 定向模块验证 > 最小浏览器手动验收。
- WebChat 改动除逻辑验证外，尽量补一次真实页面检查，至少确认：
  - 页面能正常加载
  - 无新增 console error
  - 相关 DOM 接线存在
- 当测试命令在当前环境报 `spawn EPERM` 时，默认优先判断为沙箱 / 权限限制；如果该测试对当前任务重要，应按既有流程申请提权后重试，而不是直接把它记为代码失败。
- 但如果提权后不再报 `EPERM`、而是变成超时或真实业务错误，应把它视为新的独立问题单独记录，不要继续笼统写成 `EPERM`。
- 当前 Windows 环境下，Vitest 若在执行前长时间卡住，优先怀疑默认 discovery 被仓库根下的重型临时目录拖慢，而不是先怀疑目标测试本身；当前 `vitest.config.ts` 已明确排除 `tmp/** / .tmp/** / .tmp-codex/** / .playwright-mcp/**`，不要随意删掉这些排除项。
- 当前 Windows 下做定向 Vitest，优先使用 `node .\\node_modules\\vitest\\vitest.mjs run <test-file> --reporter verbose`；不要默认使用 `corepack pnpm test -- <test-file>` 做定向验证，因为当前脚本转发方式可能把无关测试整批带起来。
- 如果标准测试链在当前环境不稳定，不要编造“已通过”；应明确记录：
  - 实际执行的命令
  - 卡点是 `EPERM`、超时还是业务失败
  - 当前替代验证方式
- 这类 Windows Vitest 定位结论的内部说明，统一维护在 [docs/Windows Vitest 定向测试说明.md](/E:/project/star-sanctuary/docs/Windows%20Vitest%20%E5%AE%9A%E5%90%91%E6%B5%8B%E8%AF%95%E8%AF%B4%E6%98%8E.md)。

## 通用技术债规避要求

- 当某个代码文件已经超过 `3000` 行时，新增功能应优先考虑放到外部新文件，只在原文件保留最小接线、注册、转发或装配逻辑。
- 除非是确实无法避免的局部修补，否则尽量不要再把新的主体逻辑继续写进已经超过 `3000` 行的文件。
- 这条要求的目的很直接：
  - 先阻止大文件继续恶化
  - 让后续拆分从被动大重构变成新增功能自然外移

## Webchat 复杂度控制

- 当前 `webchat` 的结构和内容已经较复杂，新增功能时必须克制 UI 膨胀。
- 非重要的新增内容，不要默认继续在 `webchat` 上增加新元素。
- 能减少的非重要内容应优先减少；能并入同类或近似模块的内容，应优先并入，而不是新增并列入口、并列面板或并列控件。
- 如果某项信息主要服务诊断、审计或调试，应优先复用已有区域，例如 `doctor`、长期任务详情、子任务详情、现有设置面板或已有二级弹窗，而不是新增一级导航入口。
