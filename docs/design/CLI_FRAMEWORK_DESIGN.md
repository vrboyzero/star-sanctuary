# Belldandy CLI 框架设计方案

> **状态**：Completed — Phase A-D 全部实现，旧脚本已清理
> **对应 Roadmap**：P1-2（CLI 命令树与 Onboarding Wizard）
> **前置依赖**：无
> **后续解锁**：P2-3（Skills 生态 — `bdd skill` 子命令）、P2-5（Webhooks — `bdd webhook` 子命令）

---

## 1. 现状与问题

### 1.1 当前 CLI 入口

| 入口 | 调用方式 | 参数解析 |
|------|---------|---------|
| `launcher.ts` | `pnpm start` | 无，透传 argv |
| `gateway.ts` | `pnpm dev:gateway` | 无，全靠 env |
| `pairing-approve.ts` | `pnpm pairing:approve <CODE>` | `process.argv[2]` |
| `pairing-revoke.ts` | `pnpm pairing:revoke <ID>` | `process.argv[2]` |
| `pairing-list.ts` | `pnpm pairing:list` | 无 |
| `pairing-pending.ts` | `pnpm pairing:pending` | 无 |
| `pairing-cleanup.ts` | `pnpm pairing:cleanup` | `--dry-run` via `includes()` |
| `pairing-export.ts` | `pnpm pairing:export` | `--out/--json/--include-pending` via `indexOf()` |
| `pairing-import.ts` | `pnpm pairing:import` | `--in/--mode` via `indexOf()` |
| `relay.ts` (browser) | `belldandy-relay` | 无 |

### 1.2 核心问题

1. **无统一入口** — 10 个散装脚本，用户需记忆 `pnpm pairing:approve` 这类非标准调用方式
2. **无 CLI 框架** — 参数解析全部手写，无 `--help`、无校验、无一致的错误输出
3. **无 `bin` 字段** — 不能 `npx belldandy` 或全局安装后直接 `bdd` 调用
4. **公共逻辑重复** — `resolveStateDir` 在 `security/store.ts` 和 `gateway.ts` 各有一份；env 加载逻辑内联在 gateway 829 行代码中
5. **不可扩展** — 未来 P2-3 的 `skill install/list/remove`、P2-5 的 `webhook` 等命令无处挂载

---

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| **统一入口** | 单一 `bdd` 命令 + 子命令树 |
| **零破坏迁移** | 现有 `pnpm start` / `pnpm pairing:*` 保持可用（过渡期） |
| **快速启动** | 懒加载子命令，`bdd pairing list` 不需要加载 agent/memory/tools |
| **可扩展** | 未来包（skills、webhook）可注册子命令，无需修改 CLI 核心 |
| **可测试** | 命令逻辑与 I/O 解耦，可注入 mock |
| **双模输出** | 人类友好（默认）+ `--json` 机器可读 |
| **交互能力** | Onboarding Wizard、确认提示等交互流程 |

---

## 3. 技术选型

### 3.1 CLI 框架：citty

| 维度 | citty | commander | 选择理由 |
|------|-------|-----------|---------|
| 安装体积 | ~7 kB, 0 deps | ~101 kB, 0 deps | citty 更轻量 |
| TypeScript | 原生类型推断 | 需 `@commander-js/extra-typings` | citty 开箱即用 |
| ESM | ESM-first | Dual CJS/ESM | 与项目 ESM-only 一致 |
| 子命令 | `subCommands` + 原生懒加载 | `.command()` 链式 | citty 懒加载更自然 |
| API 风格 | 声明式 `defineCommand` | 命令式链式调用 | 声明式更清晰 |
| 社区 | ~1.5M/周 (UnJS 生态) | ~120M/周 | commander 更大，但 citty 够用 |

**选 citty 的核心理由**：
- 声明式 `defineCommand` + 自动类型推断，不需要额外包
- 原生 `() => import(...)` 懒加载，子命令按需加载
- 7 kB 零依赖，作为 monorepo 中的一个包不增加负担
- UnJS 生态（Nuxt/Nitro 同团队），维护活跃，风格与项目一致

### 3.2 配套工具

| 用途 | 选型 | 理由 |
|------|------|------|
| 终端着色 | `picocolors` | 7 kB，比 chalk 快 2x，只需基础 ANSI 色 |
| 交互提示 | `@clack/prompts` | 美观、TypeScript 友好、支持 group/cancel/spinner |
| 参数校验 | 复用项目已有 `zod`（在 `@belldandy/mcp` 中） | 不引入新依赖 |

### 3.3 新增依赖汇总

```
citty          ~7 kB   0 deps   CLI 框架
picocolors     ~7 kB   0 deps   终端着色
@clack/prompts ~50 kB  1 dep    交互提示（仅 onboard/setup 用）
```

总计 ~64 kB，零传递依赖。

---

## 4. 命令树设计

### 4.1 命名

- 主命令：`belldandy`（正式）/ `bdd`（短别名，通过 package.json `bin` 同时注册）
- 子命令风格：`<noun> <verb>` 或 `<verb>`（与 OpenClaw 和 Docker CLI 风格一致）

### 4.2 完整命令树

```
bdd
├── start                          # 启动 Gateway（带 supervisor）
├── dev                            # 开发模式启动（无 supervisor）
├── doctor                         # 诊断检查（env/依赖/端口/状态目录）
├── setup                          # 交互式 Onboarding Wizard
│
├── pairing                        # 配对管理
│   ├── approve <code>
│   ├── revoke <client-id>
│   ├── list
│   ├── pending
│   ├── cleanup [--dry-run]
│   ├── export [--out <file>] [--json] [--include-pending]
│   └── import [--in <file>] [--mode merge|replace]
│
├── config                         # 配置管理
│   ├── list                       # 列出当前配置
│   ├── get <key>                  # 读取配置项
│   ├── set <key> <value>          # 设置配置项（写入 .env.local）
│   ├── edit                       # 用编辑器打开 .env.local
│   └── path                       # 输出配置文件路径
│
├── relay                          # 浏览器 CDP relay
│   └── start [--port <port>]
│
│  ── [未来扩展] ──
│
├── skill                          # P2-3: 技能管理
│   ├── list
│   ├── install <path|url>
│   ├── remove <name>
│   ├── enable <name>
│   └── disable <name>
│
├── memory                         # 记忆管理
│   ├── search <query>
│   ├── index [--path <dir>]
│   └── status
│
├── cron                           # 定时任务
│   ├── list
│   ├── add
│   ├── remove <id>
│   └── status
│
└── webhook                        # P2-5: Webhook 管理
    ├── list
    ├── add
    └── remove <id>
```

### 4.3 全局选项

| 选项 | 说明 |
|------|------|
| `--json` | 机器可读 JSON 输出（抑制 banner/颜色） |
| `--state-dir <path>` | 覆盖 `BELLDANDY_STATE_DIR`（默认 `~/.belldandy`） |
| `--verbose` | 详细输出 |
| `--version` / `-v` | 版本号 |
| `--help` / `-h` | 帮助信息（citty 自动生成） |

---

## 5. 架构设计

### 5.1 文件结构

```
packages/belldandy-core/src/
├── cli/
│   ├── main.ts                    # 入口：defineCommand root + subCommands
│   ├── shared/
│   │   ├── context.ts             # CLIContext: stateDir, env, output helpers
│   │   ├── output.ts              # 输出工具：json/table/success/error/warn
│   │   └── env-loader.ts          # 从 gateway.ts 提取的 env 加载逻辑
│   ├── commands/
│   │   ├── start.ts               # bdd start
│   │   ├── dev.ts                 # bdd dev
│   │   ├── doctor.ts              # bdd doctor
│   │   ├── setup.ts               # bdd setup (Onboarding Wizard)
│   │   ├── pairing.ts             # bdd pairing <sub>
│   │   ├── config.ts              # bdd config <sub>
│   │   └── relay.ts               # bdd relay start
│   └── wizard/
│       └── onboard.ts             # Onboarding Wizard 交互逻辑
├── bin/
│   ├── bdd.ts                     # bin 入口（极简，仅 import + runMain）
│   ├── launcher.ts                # 保留（bdd start 内部调用）
│   └── gateway.ts                 # 保留（bdd dev 内部调用）
```

### 5.2 入口与懒加载

```typescript
// cli/main.ts
import { defineCommand } from "citty";

export const main = defineCommand({
  meta: { name: "belldandy", version: "0.1.0", description: "Belldandy AI Assistant" },
  args: {
    json:      { type: "boolean", description: "JSON output" },
    stateDir:  { type: "string",  description: "State directory override" },
    verbose:   { type: "boolean", description: "Verbose output" },
  },
  subCommands: {
    start:   () => import("./commands/start.js").then(m => m.default),
    dev:     () => import("./commands/dev.js").then(m => m.default),
    doctor:  () => import("./commands/doctor.js").then(m => m.default),
    setup:   () => import("./commands/setup.js").then(m => m.default),
    pairing: () => import("./commands/pairing.js").then(m => m.default),
    config:  () => import("./commands/config.js").then(m => m.default),
    relay:   () => import("./commands/relay.js").then(m => m.default),
  },
});
```

```typescript
// bin/bdd.ts — bin 入口
import { runMain } from "citty";
import { main } from "../cli/main.js";
runMain(main);
```

### 5.3 CLIContext（借鉴 OpenClaw RuntimeEnv）

```typescript
// cli/shared/context.ts
import pc from "picocolors";

export interface CLIContext {
  stateDir: string;
  json: boolean;
  verbose: boolean;
  log: (msg: string) => void;
  error: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  output: (data: unknown) => void;  // --json 时输出 JSON，否则人类格式
}

export function createCLIContext(args: { json?: boolean; stateDir?: string; verbose?: boolean }): CLIContext {
  const stateDir = args.stateDir ?? process.env.BELLDANDY_STATE_DIR ?? resolveDefaultStateDir();
  const json = args.json ?? false;

  return {
    stateDir,
    json,
    verbose: args.verbose ?? false,
    log:     (msg) => { if (!json) console.log(msg); },
    error:   (msg) => console.error(json ? "" : pc.red(`✗ ${msg}`)),
    success: (msg) => { if (!json) console.log(pc.green(`✓ ${msg}`)); },
    warn:    (msg) => { if (!json) console.log(pc.yellow(`⚠ ${msg}`)); },
    output:  (data) => {
      if (json) {
        console.log(JSON.stringify(data, null, 2));
      } else if (Array.isArray(data)) {
        // 简单表格输出
        data.forEach(row => console.log(row));
      } else {
        console.log(data);
      }
    },
  };
}
```

### 5.4 命令示例：pairing

```typescript
// cli/commands/pairing.ts
import { defineCommand } from "citty";

export default defineCommand({
  meta: { name: "pairing", description: "Manage client pairing" },
  subCommands: {
    approve: () => import("./pairing/approve.js").then(m => m.default),
    revoke:  () => import("./pairing/revoke.js").then(m => m.default),
    list:    () => import("./pairing/list.js").then(m => m.default),
    pending: () => import("./pairing/pending.js").then(m => m.default),
    cleanup: () => import("./pairing/cleanup.js").then(m => m.default),
    export:  () => import("./pairing/export.js").then(m => m.default),
    import:  () => import("./pairing/import.js").then(m => m.default),
  },
});
```

```typescript
// cli/commands/pairing/approve.ts
import { defineCommand } from "citty";
import { approvePairingCode } from "../../../security/store.js";
import { createCLIContext } from "../../shared/context.js";

export default defineCommand({
  meta: { name: "approve", description: "Approve a pending pairing code" },
  args: {
    code: { type: "positional", description: "Pairing code to approve", required: true },
    json: { type: "boolean", description: "JSON output" },
  },
  async run({ args }) {
    const ctx = createCLIContext(args);
    const result = await approvePairingCode(ctx.stateDir, args.code);
    if (result.ok) {
      ctx.output({ status: "approved", clientId: result.clientId });
      ctx.success(`Client ${result.clientId} approved`);
    } else {
      ctx.error(result.error);
      process.exit(1);
    }
  },
});
```

### 5.5 Onboarding Wizard（借鉴 OpenClaw WizardPrompter）

```typescript
// cli/wizard/onboard.ts
import * as p from "@clack/prompts";
import pc from "picocolors";

export interface OnboardAnswers {
  provider: "openai" | "mock";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  host: string;
  port: number;
  authMode: "none" | "token" | "password";
}

export async function runOnboardWizard(): Promise<OnboardAnswers | null> {
  p.intro(pc.cyan("Belldandy Setup"));

  const answers = await p.group({
    provider: () => p.select({
      message: "Agent provider",
      options: [
        { value: "openai", label: "OpenAI-compatible API" },
        { value: "mock",   label: "Mock (testing)" },
      ],
    }),
    baseUrl: ({ results }) => {
      if (results.provider !== "openai") return;
      return p.text({ message: "API Base URL", placeholder: "https://api.openai.com/v1" });
    },
    apiKey: ({ results }) => {
      if (results.provider !== "openai") return;
      return p.password({ message: "API Key" });
    },
    model: ({ results }) => {
      if (results.provider !== "openai") return;
      return p.text({ message: "Model name", placeholder: "gpt-4o" });
    },
    host: () => p.select({
      message: "Bind address",
      options: [
        { value: "127.0.0.1", label: "Localhost only (127.0.0.1)" },
        { value: "0.0.0.0",   label: "LAN access (0.0.0.0)" },
      ],
    }),
    port: () => p.text({
      message: "Port",
      placeholder: "28889",
      defaultValue: "28889",
      validate: (v) => isNaN(Number(v)) ? "Must be a number" : undefined,
    }),
    authMode: ({ results }) => {
      if (results.host === "0.0.0.0") {
        return p.select({
          message: "Auth mode (required for LAN)",
          options: [
            { value: "token",    label: "Token" },
            { value: "password", label: "Password" },
          ],
        });
      }
      return p.select({
        message: "Auth mode",
        options: [
          { value: "none",     label: "None" },
          { value: "token",    label: "Token" },
          { value: "password", label: "Password" },
        ],
      });
    },
  }, {
    onCancel: () => { p.cancel("Setup cancelled."); return process.exit(0); },
  });

  p.outro(pc.green("Configuration saved to .env.local"));
  return answers as OnboardAnswers;
}
```

---

## 6. 迁移策略

### 6.1 分阶段迁移

**Phase A — 搭框架 + 迁移 pairing**（最小可用）

1. 安装 `citty` + `picocolors`
2. 创建 `cli/` 目录结构 + `bin/bdd.ts` 入口
3. 提取 `resolveStateDir` 和 `loadEnvFileIfExists` 到 `cli/shared/`
4. 实现 `bdd pairing *` 全部 7 个子命令
5. 实现 `bdd start` 和 `bdd dev`（包装现有 launcher/gateway）
6. 在 `packages/belldandy-core/package.json` 添加 `bin` 字段
7. 在 root `package.json` 添加 `bdd` 脚本
8. 现有 `pnpm pairing:*` 脚本保留（指向新 CLI，过渡期兼容）

**Phase B — doctor + config**

1. 实现 `bdd doctor`（检查 env、端口、state dir、依赖、模型连通性）
2. 实现 `bdd config list/get/set/edit/path`（读写 `.env.local`）
3. 实现 `bdd relay start`

**Phase C — Onboarding Wizard**

1. 安装 `@clack/prompts`
2. 实现 `bdd setup` 交互式向导
3. 首次运行检测（无 `.env.local` 时自动提示）

**Phase D — 清理**（Phase A-C 稳定后）

1. 删除旧的 `pairing-*.ts` 散装脚本
2. 更新 root `package.json` scripts 指向 `bdd` 命令
3. 更新文档

### 6.2 兼容性保证

- 过渡期内 `pnpm pairing:approve <CODE>` 继续可用（脚本改为调用 `bdd pairing approve`）
- `pnpm start` / `pnpm dev:gateway` 保持不变
- `exit(100)` 重启约定不变，`bdd start` 内部仍使用 launcher.ts 的 fork 机制

---

## 7. bin 注册方案

```jsonc
// packages/belldandy-core/package.json
{
  "bin": {
    "belldandy": "./dist/bin/bdd.js",
    "bdd": "./dist/bin/bdd.js"
  }
}
```

开发期间使用 tsx 直接运行：

```jsonc
// root package.json
{
  "scripts": {
    "bdd": "node --import tsx packages/belldandy-core/src/bin/bdd.ts",
    "start": "node --import tsx packages/belldandy-core/src/bin/bdd.ts start",
    "dev:gateway": "node --import tsx packages/belldandy-core/src/bin/bdd.ts dev"
  }
}
```

---

## 8. 扩展性设计

### 8.1 未来子命令挂载

P2-3 的 `skill` 子命令只需：

```typescript
// cli/main.ts 的 subCommands 中添加一行
skill: () => import("./commands/skill.js").then(m => m.default),
```

命令实现放在 `cli/commands/skill.ts`，业务逻辑在 `@belldandy/skills` 包中。

### 8.2 插件注册命令（远期）

如果未来需要插件动态注册 CLI 命令，可以在 `main.ts` 中扫描 `~/.belldandy/plugins/` 下的 manifest，动态添加 subCommands。但这是 P3 级别的需求，当前不实现。

---

## 9. 从 OpenClaw 借鉴的模式

| 模式 | OpenClaw 实现 | Belldandy 采纳方式 |
|------|-------------|-------------------|
| 懒加载子命令 | `preSubcommand` hook + 动态 import | citty 原生 `() => import(...)` |
| RuntimeEnv 注入 | `{ log, error, exit }` 传入每个命令 | `CLIContext` 对象 |
| `--json` 全局支持 | 每个命令检查 `--json` 抑制 banner | `CLIContext.output()` 统一处理 |
| WizardPrompter 抽象 | 接口 + 实现分离，可 mock | `OnboardAnswers` 类型 + 独立 wizard 模块 |
| Config 预检 preAction | Commander preAction hook | citty `run` 开头调用 `validateConfig()` |
| `--non-interactive` | 所有提示有 CLI flag 等价 | `bdd setup --provider openai --api-key xxx` 非交互模式 |
| Profile 隔离 | `--dev` / `--profile` | `--state-dir` 覆盖（复用已有 env var 机制） |

### 未采纳的模式

| 模式 | 理由 |
|------|------|
| 快速路径路由（跳过 Commander） | citty 本身足够轻量，无需绕过 |
| 自定义 ANSI 表格渲染器 | 当前命令输出简单，不需要复杂表格 |
| Shell 补全生成器 | 可后续按需添加，非 MVP |

---

## 10. doctor 命令设计

```
bdd doctor

检查项：
  ✓ Node.js 版本 (>= 22.12.0)
  ✓ pnpm 版本
  ✓ State 目录 (~/.belldandy/) 存在且可写
  ✓ .env.local 存在
  ✓ 必要 env 变量已配置 (AGENT_PROVIDER, API_KEY 等)
  ✓ 端口 28889 可用
  ✓ 模型连通性测试 (可选, --check-model)
  ✓ Memory DB 可访问
  ✓ MCP 服务器状态 (如已配置)

输出格式：
  ✓ 通过项绿色
  ✗ 失败项红色 + 修复建议
  ⚠ 警告项黄色
  --json 输出结构化结果
```

---

## 11. 风险与应对

| 风险 | 等级 | 应对 |
|------|------|------|
| citty 社区较小，遇到 edge case 无参考 | 低 | citty 代码量极小（~300 行），必要时可 fork 或回退到 commander |
| 迁移期间两套入口并存造成混乱 | 低 | Phase A 完成后立即更新 README，Phase D 清理旧入口 |
| `@clack/prompts` 在 Windows Terminal 兼容性 | 低 | Node 22 + Windows Terminal 已良好支持；降级方案：纯文本提示 |
| gateway.ts 提取 env 加载逻辑可能引入 bug | 中 | 提取后保持函数签名不变，gateway.ts 改为调用提取后的函数，行为等价 |

---

## 12. 验证清单

- [ ] `bdd --help` 显示完整命令树
- [ ] `bdd --version` 显示版本号
- [ ] `bdd pairing list` 输出与原 `pnpm pairing:list` 一致
- [ ] `bdd pairing list --json` 输出合法 JSON
- [ ] `bdd start` 行为与 `pnpm start` 一致（supervisor + 自动重启）
- [ ] `bdd dev` 行为与 `pnpm dev:gateway` 一致
- [ ] `bdd doctor` 正确检测各项状态
- [ ] `bdd setup` 交互式向导正确写入 `.env.local`
- [ ] `bdd setup --provider openai --api-key xxx` 非交互模式可用
- [ ] 旧的 `pnpm pairing:*` 脚本在过渡期仍可用
