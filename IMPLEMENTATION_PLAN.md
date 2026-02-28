# Belldandy 实施计划

> **注意**：已完成的 Phase 详细实施记录已归档至 [`docs/archive/IMPLEMENTATION_LOG.md`](file:///e:/project/belldandy/docs/archive/IMPLEMENTATION_LOG.md)。
> 本文档仅保留 **架构总览**、**Roadmap**、**未完成规划** 与 **风险评估**。

## 1. 范围与约束

- **开发目录**：`e:\project\Belldandy`
- **参考目录（只读）**：`E:\project\belldandy\openclaw`（不修改、不编码）
- **参考目录（只读）**：`E:\project\belldandy\UI-TARS-desktop-main`（不修改、不编码）

## 1.1 技术栈与工程形态

- Runtime：Node.js
- 语言：TypeScript（ESM）
- 包管理：pnpm workspace
- 测试：vitest

## 2. 总体架构草图

```mermaid
flowchart TB
  subgraph Channels
    WebChat[WebChat UI]
    TG[Telegram Bot (phase 2)]
  end

  WebChat -->|WS| GW[Gateway]
  TG -->|inbound/outbound| GW

  GW -->|RPC/Invoke| AG[Agent Runtime]
  AG -->|tools| SK[Skills/Tools]
  AG -->|retrieve| MEM[Memory Index]

  GW -->|events chat/agent/presence| WebChat
```

## 2.5 Phase 总览与索引

> (✅ = 已完成并归档至 IMPLEMENTATION_LOG.md)

- **Phase 0**：文档与边界 ✅
- **Phase 1-3**：工程骨架、UI、配置工具 ✅
- **Phase 4**：Skills + Memory + 向量检索 ✅ (SQLite 引擎已迁移至 better-sqlite3，FTS5 全文索引开箱即用)
- **Phase 5**：SOUL / Persona 人格系统 ✅
- **Phase 6-7**：飞书、Heartbeat ✅
- **Phase 8-15**：高级能力 (Moltbot 对标、浏览器、多媒体、方法论) ✅
- **Phase 16**：子 Agent 编排 (Sub-Agent Orchestration) ✅
- **Phase 17-23**：MCP、日志、安全、WebChat增强、工具集 ✅
- **Phase 24**：自动更新机制（Self-Update Tool）[规划中]
- **Phase 25**：Agents 后续迭代 Step 1-3 ✅ | Step 4-5 [待实施]
- **Phase M**：记忆系统优化 ✅
- **Phase M-Next**：记忆系统架构升级 ✅
- **Phase N**：远程 Gateway 与部署工具链 ✅

---

## 3. Roadmap (基于 OpenClaw 对标)

> 依据 `openclawVSBelldandy实现对比说明.md` 规划的开发优先级。

### 3.1 近期（优先级 P1）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P1-1 | 安全加固 ✅ | §10 安全 | 落实安全路线图中的 P0/P1/P2 项。 | **已完成 (Phase 19)** |
| P1-2 | CLI 命令树与 Onboarding Wizard ✅ | §1 核心平台 | 设计统一 CLI 入口及交互式向导。 | **Phase A-D 全部完成** |
| P1-3 | 渠道扩展（一线 IM 最小支撑） | §3 Channels | 新增 Telegram + Slack/Discord 渠道。 | 可先实现 MVP，后续补全路由。 |
| P1-4 | 定时任务 / Cron 工具 ✅ | §8 定时任务 | 通用 Cron 工具与配置。 | **方案 A (轻量 MVP) 已完成** |
| P1-5 | 会话模型梳理与多 Agent 预备 ✅ | §2 会话模型 | 梳理 Store 结构，为多 Agent 预留配置位。 | **已完成**：AgentProfile + AgentRegistry + ConversationStore 元数据扩展。 |

### 3.2 中期（优先级 P2）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P2-1 | Multi-Agent 路由与 Session 编排 ✅ | §2 会话模型 | 引入多 Agent / 多 workspace 配置。 | **P2-1a/b/c/d 全部完成**。 |
| P2-2 | Channels 路由引擎升级 | §3 Channels | Mention gating、群聊路由规则。 | 结合安全策略。 |
| P2-3 | Skills 生态与「技能注册中心」 ✅ | §5 工具 / Skills | 设计 ClawHub 式技能 registry。 | **已完成**。详见 LOG §27。 |
| P2-4 | Canvas / 可视化工作区（基础版）✅ | §7 浏览器/Canvas | 基础 Canvas / Board 功能。 | **已完成**。详见 LOG §28。 |
| P2-5 | Webhooks 与外部触发 | §8 定时任务 | Webhook 入口和邮件/通知触发。 | 注意安全/鉴权。 |
| P2-6 | Nodes 风格的 Memory/Knowledge Graph | §6 记忆 | 增加知识图谱工具。 | 与方法论结合。 |

### 3.3 远期（优先级 P3）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P3-1 | Apps & Nodes | §4 Apps & Nodes | 原生客户端 (macOS/iOS/Android)。 | 工程量大，暂缓。 |
| P3-2 | 远程 Gateway 与部署工具链 ✅ | §1 / §11 平台与运维 | Remote gateway, Docker, Tailscale。 | **已完成**。详见 LOG §29。 |
| P3-3 | 高阶 Canvas & 多节点视觉 ✅ | §7 浏览器/Canvas | 多节点协同视图，多相机流。 | **已完成**。详见 LOG §28。 |
| P3-4 | IDE 协议桥接（ACP 或等价） | §9 MCP/ACP | 评估 ACP/OpenClaw 协议桥接。 | 优先级较低。 |
| P3-5 | 自身自动更新机制 (Self-Update) | §11 平台与运维 | 自动 `git pull` + `pnpm install` + `restart`。 | 需解决文件锁问题。 |

---

## 4. 待实现/规划中的详细 Phase

### Phase 4.7：记忆检索增强 (Memory Retrieval Enhancement) [Proposed]
- **Context Injection**：每次对话开始时，自动注入最近对话摘要。
- **Auto-Recall**：NLP 检测关键词自动触发 `memory_search`。

### Phase 4.8：记忆系统深度优化 [部分完成]

- [x] **Metadata Filtering**：支持 `channel`/`topic` 过滤。✅
- [x] **Rule Rerank**：规则重排序。✅
- [ ] **Query Rewrite**：LLM 改写查询消歧。
- [ ] **LLM Rerank**：引入 Reranker 优化排序。

### Phase 10.5: OS 计算机操作能力 (OS Computer Use) [Planned]
- **High-Fidelity Vision**：`nut-js` + `Jimp`，处理 DPI。
- **Precision Control**：Box-to-Pixel 映射，拟人化键鼠。
- **Visual Feedback**：ScreenMarker 透明置顶窗口。

### Phase 25 Step 4-5 [待实施]
- **Step 4**：WebChat 前端展示子 Agent 状态（`sub_agent.status` 事件 + 状态卡片 UI）。
- **Step 5**：条件分支编排（`orchestrate` 工具，DAG 描述，拓扑排序 + 条件判断）。

### Phase 15+: 实时视觉流 (WebRTC) [低优先级]
- **Tech**：WebRTC + PeerJS，低延迟高帧率视觉流。

---

## 5. 风险点与应对

- **Prompt Injection**：System Prompt 分层，工具调用二次约束。
- **工具滥用风险**：严格白名单，敏感信息脱敏。
- **敏感信息泄露**：日志不回显 Token/Key。
- **错误处理不一致**：统一错误分级 (P0-P3)。

### 5.1 安全加固路线图（剩余项）

> P0-P2 大部分已在 Phase 19 完成。

- **P2**：web_fetch SSRF 细节修补 (DNS Rebinding 防护) ✅
- **P3**：浏览器自动化的域名/页面访问控制 ✅

---

## 6. 未来增强规划

- **高级语音**：ElevenLabs 集成，自动摘要优化。
- **高级图像**：提示词工程，画廊生成。

---

## 7. 后续开发需求汇总

> 整合自各文档中尚未完成的工作项，按所属项目分类，再按优先级排列。

### 7.1 Belldandy（核心 Agent 系统）

#### P1 — 近期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P1-1 | 渠道扩展：Telegram + Slack/Discord | Channel 接口已就绪，需实现具体渠道适配 | Roadmap P1-3 |
| B-P1-3 | 记忆检索增强 (Phase 4.7) | Context Injection、Auto-Recall | Phase 4.7 |

#### P2 — 中期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P2-2 | 记忆系统深度优化 (Phase 4.8) | Query Rewrite、LLM Rerank | Phase 4.8 |
| B-P2-3 | Channels 路由引擎升级 | Mention gating、群聊路由规则，结合安全策略 | Roadmap P2-2 |
| B-P2-5 | Webhooks & 外部触发 | Webhook 入口、邮件/通知触发，注意鉴权 | Roadmap P2-5 |
| B-P2-6 | Knowledge Graph (Nodes) | 知识图谱工具，与方法论系统结合 | Roadmap P2-6 |
| B-P2-7 | Cron 方案 B 升级 | cron 表达式（`croner`）、Session 隔离、渠道定向推送、执行历史 | 说明文档 §2.5 |
| B-P2-8 | Heartbeat 消息去重 | 防止 Agent 在无法执行操作时反复发送同一条提醒（24h 内重复内容静默） | 说明文档 §2 |
| B-P2-9 | Phase 25 Step 4 | WebChat 前端展示子 Agent 状态 | Phase 25 |

#### P3 — 远期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P3-1 | OS 计算机操作能力 (Phase 10.5) | nut-js + Jimp 视觉层、Box-to-Pixel 控制层、ScreenMarker 反馈 | Phase 10.5 |
| B-P3-2 | 原生客户端 (macOS/iOS/Android) | 工程量大，暂缓 | Roadmap P3-1 |
| B-P3-3 | IDE 协议桥接 (ACP) | 评估 ACP/OpenClaw 协议桥接 | Roadmap P3-4 |
| B-P3-4 | 自动更新机制 (Phase 24) | git pull + pnpm install + restart，需解决文件锁 | Roadmap P3-5 |
| B-P3-5 | 实时视觉流 (WebRTC) (Phase 15+) | 低延迟高帧率视觉流，WebRTC + PeerJS | Phase 15+ |
| B-P3-6 | 高级语音 (ElevenLabs) | 更高质量 TTS Provider | §6 |
| B-P3-7 | 高级图像 | 提示词工程、画廊生成 | §6 |
| B-P3-8 | Phase 25 Step 5 | 条件分支编排（DAG orchestrate 工具） | Phase 25 |

#### 低优先级 — 锦上添花

| 编号 | 项目 | 说明 |
|------|------|------|
| B-L1 | Local Embedding | 本地向量计算（node-llama-cpp / transformers.js），摆脱 API 依赖 |
| B-L2 | SOUL_EVIL 彩蛋 | 特定条件下加载反转人格，趣味性 |
| B-L3 | Memory Flush 缓冲机制 | 写入 Buffer + 空闲 Compaction，当前数据量下收益不大 |

---

### 7.2 office.goddess.ai（主页 / Workshop 模组工坊 / Agent 社区）

#### Agent 社区 ✅ 已完成

> 详见 `office.goddess.ai/COMMUNITY-PLAN.md`，25 项任务全部完成。

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础设施：5 张新表 + 迁移、屏蔽词过滤、配置常量、Agent API Key 认证中间件 | ✅ |
| Phase 2 | Agent CRUD + API Key 管理 + Agent 登录接口 + 前端管理页 | ✅ |
| Phase 3 | 房间 CRUD + 加入/离开 + HTTP 消息发送 + 前端社区大厅 + 创建房间弹窗 | ✅ |
| Phase 4 | WebSocket 实时通信 + 消息广播 + 心跳 + 前端聊天页 + 消息气泡组件 | ✅ |
| Phase 5 | 成员侧栏 + Agent 模式禁言 + 屏蔽词提示 + 断线重连 + 历史消息分页 | ✅ |

#### 待验证

| 编号 | 项目 | 说明 |
|------|------|------|
| W-V1 | Workshop 全流程联调 | 发布 → 列表 → 搜索 → 详情 → 下载 → 编辑 → 删除，需启动前后端手动验证 |
| C-V1 | Agent 社区全流程联调 | Agent 注册 → API Key 生成 → 创建房间 → 加入 → WebSocket 聊天 → 屏蔽词拦截，需启动前后端手动验证 |

#### 后续迭代

| 编号 | 项目 | 说明 | 优先级 |
|------|------|------|--------|
| W-1 | 支付流程接入 | 收益分成系统，对接支付网关 | P2 |
| W-2 | 作品评分与评论 | 用户评价体系 | P2 |
| W-3 | 作品版本历史 | 支持多版本管理与回滚 | P2 |
| W-4 | Markdown 描述渲染 | 引入 Markdown 渲染库替代纯文本 | P2 |
| W-5 | 作品封面图上传 | 提升视觉吸引力 | P2 |
| W-6 | 下载去重 | 同用户不重复计数 | P3 |
| W-7 | 全文搜索优化 (FTS5) | 提升搜索质量与性能 | P3 |
| W-8 | 作品审核流程 | 发布前审核机制，内容安全 | P3 |

---

## Phase M：记忆系统优化

- **M-1 元数据过滤 (Metadata Filtering)**: ✅ 已完成
- **M-2 查询重写 (Query Rewrite)**: ⏳ 待实现
- **M-3 规则重排序 (Rule Rerank)**: ✅ 已完成
- **M-3 LLM 重排序 (LLM Rerank)**: ⏳ 待实现

## Phase M-Next：记忆系统架构升级

- **M-N0 启用 Embedding Cache**: ✅ 已完成
- **M-N1 统一 MemoryStore 实例**: ✅ 已完成
- **M-N2 L0 摘要层**: ✅ 已完成
- **M-N3 会话记忆自动提取 (Memory Evolution)**: ✅ 已完成
- **M-N4 源路径聚合检索**: ✅ 已完成
- **自适应检索 / 噪声过滤 / Task-aware Embedding / 长度归一化 / 内容语义分类 / MMR 去重 / Scope 隔离**: ✅ 已完成（2026-02-25/26）

### M-Next Bugfix：memory_search 检索失效修复（2026-02-26）

**问题现象**：Agent 调用 `memory_search` 工具检索聊天记录时，始终返回 "No relevant results found"。

**根因分析**：

| 问题 | 原因 | 影响 |
|------|------|------|
| FTS5 索引不完整 | `ensureFtsRebuiltIfNeeded()` 只在索引完全为空时触发 rebuild，但实际索引数量（223）远少于 chunks 数量（834） | 关键词搜索漏掉 73% 的数据 |
| 中文分词失效 | `tokenizeForSearch()` 把整个中文字符串当作一个 token（如 "之前聊过的AI"），FTS5 无法匹配 | 中文查询几乎全部失败 |
| RRF 分数量级不一致 | 混合搜索的 RRF 分数（~0.01）远低于纯关键词搜索的 BM25 分数（~0.6），被 reranker 的 `minScore=0.15` 过滤 | 有向量时搜索结果被全部丢弃 |
| vecDims 未初始化 | `MemoryStore` 构造时没有从现有 `chunks_vec` 表读取维度，导致 `getChunkVector()` 返回 null | MMR 去重无法获取向量 |

**修复内容**：

| 文件 | 修改 |
|------|------|
| `packages/belldandy-memory/src/store.ts` | FTS rebuild 阈值改为 5% 差异触发；中文分词改为 2-gram + OR 连接；RRF 分数归一化到 0.3-1.0 范围；构造函数自动读取现有 `chunks_vec` 维度 |
| `packages/belldandy-memory/src/adaptive-retrieval.ts` | 添加 "记忆/回忆/历史/搜索/查找/查询" 到强制检索关键词 |

**验证方式**：

```bash
# 重建后重启 Gateway
corepack pnpm build && corepack pnpm start

# Agent 测试查询
memory_search("之前聊过的AI")  # 应返回相关聊天记录
memory_search("记忆")          # 应返回记忆相关内容
```

## Phase N：远程 Gateway 与部署工具链

- ✅ Docker 容器化（Dockerfile + docker-compose.yml + 部署脚本 + 文档）
- ✅ Tailscale 集成（Sidecar 模式）
- ✅ Nix 支持（flake.nix）
- ✅ 官方 Docker Hub 镜像 + CI/CD 自动构建

---

## Phase D：Daemon 模式与进程管理 [规划中]

> **目标**：实现类似 `openclaw gateway start` 的持久化运行功能，支持后台运行、进程管理、云端部署。

### D-1 当前状态

| 功能 | 状态 |
|------|------|
| 前台运行 + 自动重启 (exit code 100) | ✅ 已实现 (`bdd start`) |
| 后台运行 (detached) | ❌ 缺失 |
| PID 文件管理 | ❌ 缺失 |
| 日志重定向到文件 | ❌ 缺失 |
| `bdd stop` 命令 | ❌ 缺失 |
| `bdd status` 命令 | ❌ 缺失 |

**问题**：`start.ts` 和 `launcher.ts` 存在重复实现，需合并。

### D-2 实现方案

#### D-2.1 新增 daemon 管理模块

文件：`packages/belldandy-core/src/cli/daemon.ts`

```typescript
// 核心函数
startDaemon(): Promise<number>    // detached 模式启动，返回 PID
stopDaemon(): Promise<boolean>    // 读 PID，发 SIGTERM，清理 PID 文件
getDaemonStatus(): DaemonStatus   // 检查进程存活状态
```

**关键实现**：

```typescript
// daemon 模式启动
const logFile = path.join(BELLDANDY_HOME, 'logs', 'gateway.log');
const logFd = fs.openSync(logFile, 'a');

const child = fork(GATEWAY_SCRIPT, [], {
  detached: true,
  stdio: ['ignore', logFd, logFd, 'ipc'],
  execArgv: ext === ".ts" ? ["--import", "tsx"] : [],
});

// 写入 PID 文件
fs.writeFileSync(PID_FILE, String(child.pid));

// 允许父进程退出
child.unref();
```

#### D-2.2 命令改动

| 命令 | 改动 |
|------|------|
| `bdd start` | 添加 `--daemon` / `-d` 参数，默认仍前台运行 |
| `bdd stop` | **新增** - 停止后台进程 |
| `bdd status` | **新增** - 查看运行状态 |

#### D-2.3 文件管理

```
~/.belldandy/
├── gateway.pid          # PID 文件
└── logs/
    └── gateway.log      # daemon 模式日志输出
```

#### D-2.4 清理

删除 `packages/belldandy-core/src/bin/launcher.ts`，逻辑合并到 `start.ts`。

### D-3 用法示例

```bash
bdd start              # 前台运行（当前行为，不变）
bdd start -d           # 后台运行（daemon 模式）
bdd start --daemon     # 同上
bdd stop               # 停止后台进程
bdd status             # 查看状态：Running (PID 12345) / Stopped
```

### D-4 跨平台说明

| 平台 | 行为 |
|------|------|
| Linux/macOS | 标准 detached + unref，真正的后台进程 |
| Windows | detached 模式可工作，但关闭终端窗口后进程可能被终止；生产部署建议用 Windows Service 或 NSSM |

### D-5 实现清单

- [x] **D-5.1** 新增 `packages/belldandy-core/src/cli/daemon.ts` - daemon 管理核心模块
- [x] **D-5.2** 修改 `packages/belldandy-core/src/cli/commands/start.ts` - 添加 `--daemon` 参数
- [x] **D-5.3** 新增 `packages/belldandy-core/src/cli/commands/stop.ts` - 停止命令
- [x] **D-5.4** 新增 `packages/belldandy-core/src/cli/commands/status.ts` - 状态查询命令
- [x] **D-5.5** 修改 `packages/belldandy-core/src/cli/main.ts` - 注册新命令
- [x] **D-5.6** 删除 `packages/belldandy-core/src/bin/launcher.ts` - 消除重复实现
- [x] **D-5.7** 更新 `CLAUDE.md` 命令文档

### D-6 未来增强：平台路由模式（可选）[未实现]

> **背景**：当前 `bdd start -d` 使用 Node.js fork + detach 方式实现后台运行，简单易用但不支持开机自启。
> 参考 openclaw 的实现，可以添加平台路由模式，将服务注册为操作系统原生服务，获得更强的系统集成能力。

#### D-6.1 命令结构

```bash
bdd daemon install    # 安装为系统服务（支持开机自启）
bdd daemon uninstall  # 卸载系统服务
bdd daemon start      # 启动系统服务
bdd daemon stop       # 停止系统服务
bdd daemon restart    # 重启系统服务
bdd daemon status     # 查看系统服务状态
```

#### D-6.2 各平台实现方式

| 平台 | 服务管理器 | 配置文件位置 | 特性 |
|------|-----------|-------------|------|
| macOS | launchd | `~/Library/LaunchAgents/ai.belldandy.gateway.plist` | RunAtLoad, KeepAlive |
| Linux | systemd | `~/.config/systemd/user/belldandy-gateway.service` | enable, Restart=always |
| Windows | schtasks | `~/.belldandy/gateway.cmd` | ONLOGON 触发器 |

#### D-6.3 统一接口设计

```typescript
// packages/belldandy-core/src/cli/platform-service.ts

interface GatewayService {
  label: string;  // "LaunchAgent" | "systemd" | "Scheduled Task"

  install(opts: InstallOptions): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;

  isInstalled(): Promise<boolean>;
  getStatus(): Promise<ServiceStatus>;
}

// 平台路由
function resolveGatewayService(): GatewayService {
  switch (process.platform) {
    case 'darwin': return new LaunchdService();
    case 'linux':  return new SystemdService();
    case 'win32':  return new SchtasksService();
    default: throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
```

#### D-6.4 文件结构

```
packages/belldandy-core/src/cli/
├── daemon.ts                    # 当前实现（fork + detach）
├── platform-service/            # 平台路由模式（新增）
│   ├── index.ts                 # resolveGatewayService()
│   ├── types.ts                 # GatewayService 接口定义
│   ├── launchd.ts               # macOS: launchctl bootstrap/bootout
│   ├── launchd-plist.ts         # macOS: plist 文件生成/解析
│   ├── systemd.ts               # Linux: systemctl --user
│   ├── systemd-unit.ts          # Linux: .service unit 文件生成
│   └── schtasks.ts              # Windows: schtasks /Create /Run
└── commands/
    └── daemon-cmd.ts            # bdd daemon 子命令（新增）
```

#### D-6.5 与当前实现的对比

| 维度 | `bdd start -d`（当前） | `bdd daemon install`（未来） |
|------|----------------------|----------------------------|
| 实现方式 | Node.js fork + detach | OS 原生服务管理器 |
| 开机自启 | ❌ | ✅ |
| 进程保活 | ❌ | ✅ (KeepAlive/Restart) |
| 使用复杂度 | 低（一条命令） | 中（需先 install） |
| 实现复杂度 | 低 | 高（三套平台代码） |
| 适用场景 | 开发/临时使用 | 生产部署/长期运行 |

#### D-6.6 实现清单（待实现）

- [ ] **D-6.6.1** 新增 `platform-service/types.ts` - 统一接口定义
- [ ] **D-6.6.2** 新增 `platform-service/index.ts` - 平台路由
- [ ] **D-6.6.3** 新增 `platform-service/launchd.ts` - macOS launchd 实现
- [ ] **D-6.6.4** 新增 `platform-service/launchd-plist.ts` - plist 文件处理
- [ ] **D-6.6.5** 新增 `platform-service/systemd.ts` - Linux systemd 实现
- [ ] **D-6.6.6** 新增 `platform-service/systemd-unit.ts` - unit 文件处理
- [ ] **D-6.6.7** 新增 `platform-service/schtasks.ts` - Windows schtasks 实现
- [ ] **D-6.6.8** 新增 `commands/daemon-cmd.ts` - daemon 子命令
- [ ] **D-6.6.9** 修改 `main.ts` - 注册 daemon 子命令
- [ ] **D-6.6.10** 更新文档

#### D-6.7 优先级说明

此功能为 **可选增强**，当前 `bdd start -d` 已满足大部分使用场景。建议在以下情况下实现：

1. 用户反馈需要开机自启功能
2. 需要在生产服务器上长期稳定运行
3. 需要与系统服务管理工具集成