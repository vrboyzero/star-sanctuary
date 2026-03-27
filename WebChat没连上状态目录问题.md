# WebChat没连上状态目录问题

## 故障复盘摘要

本次问题表面上看是“WebChat 没连上状态目录”，但实际是多条数据链路和配置问题叠加造成的误判。

- 根因一：一段时间内 `.env.local` 没有正确覆盖 `.env`，导致运行时配置和用户预期配置不一致。
- 根因二：`start.bat` 注入了 token 相关环境变量，而用户配置文件里实际想使用的是 `authMode=none`，造成鉴权模式认知混乱。
- 根因三：WebChat 文件树虽然已经指向 `stateDir`，但只显示目录和 `.md/.json/.txt`，不会显示 `memory.sqlite`、`sessions/*.jsonl` 等文件。
- 根因四：Memory Viewer 和 Task Viewer 读的是 `memory.sqlite`，不是直接扫描状态目录里的原始 md 文件。
- 根因五：当前状态目录本身缺少 `MEMORY.md`、`memory/` 为空、`tasks=0`，因此记忆视图和任务视图天然会显得“不对劲”。
- 根因六：`BELLDANDY_INJECT_MEMORY=false`，聊天系统提示词不会自动注入 `MEMORY.md`，进一步放大了“没读到状态目录内容”的观感。

最终确认：

- `BELLDANDY_STATE_DIR` 实际已正确生效，Gateway 运行态确实使用 `C:\Users\vrboy\.star_sanctuary`
- 当前 WebChat 实际连接模式是 `authMode=none + pairing`
- 文件树链路本身没有指错目录
- “内容不像状态目录”主要是因为不同 UI 面板读取的不是同一层数据

因此，这次问题更准确的定性应为：

> WebChat 已连接到正确的状态目录，但配置覆盖、鉴权注入、文件树过滤规则以及 memory/task 数据来源差异叠加后，造成了“没连上状态目录”的表象。

## 现象

- WebChat 左侧文件树看不到自己期望的状态目录文件。
- Memory Viewer、Task Viewer、聊天内容看起来都不像是从 `C:\Users\vrboy\.star_sanctuary` 读取出来的。
- Agent 工具却又能够修改状态目录下的文件，因此产生了“Agent 连上了状态目录，但 WebChat 没连上”的错觉。

## 最终结论

这个问题的本质不是 `BELLDANDY_STATE_DIR` 没生效，而是 **WebChat 的不同功能面板读取的是不同数据源**，再叠加一段时间内 `.env.local` 没有正确覆盖 `.env`，导致运行时配置和预期不一致，于是整体上看起来像“没连上状态目录”。

## 问题是如何发生的

### 1. 先出现了配置覆盖顺序问题

最初 Gateway 启动时，`.env.local` 的覆盖没有按预期生效，导致运行时实际拿到的是 `.env` 里的旧值或占位值。

这带来了几个直接后果：

- 主模型和 API 地址实际仍然落到了 `.env` 里的 OpenAI 默认值。
- 启动日志里出现了 `gpt-4o`、`https://api.openai.com/v1`、占位 API key 等信息。
- 用户看到的运行状态，与自己在 `.env.local` 中配置的 MiniMax、浏览器 relay、cron、heartbeat 等不一致。

这一步会让人首先怀疑“状态目录没读对”或“WebChat 没吃到本地配置”。

### 2. 启动脚本又制造了鉴权模式上的误导

`start.bat` 里会注入：

- `BELLDANDY_AUTH_MODE=token`
- `BELLDANDY_AUTH_TOKEN=%SETUP_TOKEN%`

而用户自己的 `.env` 里设置的是：

- `BELLDANDY_AUTH_MODE=none`

后来虽然通过修正环境加载逻辑，最终运行态已经以配置文件为准，实际变成了 `authMode=none`，但脚本层面仍然保留了 token 注入逻辑。  
这造成了“脚本像 token 模式，页面又像 none 模式”的认知冲突。

另外，早期自动打开浏览器的逻辑只要存在 `SETUP_TOKEN` 就会拼接 `?token=...`，即使实际运行模式已经不是 token。  
这进一步强化了“当前应该还是 token 鉴权”的错觉。

### 3. 文件树确实连的是状态目录，但它不是完整文件浏览器

WebChat 文件树走的是 `workspace.list`，它确实以 `stateDir` 为根目录读取文件。  
也就是说，**文件树本身是连上状态目录的**。

但它只显示：

- 目录
- `.md`
- `.json`
- `.txt`

它不会显示很多用户直觉上认为也应当出现的文件，例如：

- `memory.sqlite`
- `sessions/*.jsonl`
- 其他非 `md/json/txt` 文件

所以用户虽然已经连上了状态目录，却仍然会因为看不到某些关键文件而误以为“文件树没指向状态目录”。

### 4. Memory Viewer 读的不是原始 md 文件，而是 `memory.sqlite`

这是整个误解里最关键的一点。

用户直觉上会认为：

- 状态目录里的 `MEMORY.md`
- `memory/` 下的 md
- 当前 persona 文件

应该直接体现在 WebChat 的记忆视图里。

但实际不是。Memory Viewer 读的是 `memory.sqlite` 里的索引结果，而不是直接扫磁盘上的 md 文件。

而当前状态目录里的真实情况是：

- 根目录没有 `MEMORY.md`
- `memory/` 目录为空
- `memory.sqlite` 中只有少量 `chunks`
- 这些 `chunks` 全都来自 `sessions/*.jsonl`

也就是说，记忆视图显示出来的内容本来就只会偏向旧会话切出来的 session chunk，而不会自动等于“状态目录里的所有 md 内容”。

### 5. Task Viewer 为空，不是路径错，而是根本没有 task 数据

Task Viewer 读的是 `memory.sqlite` 中的 `tasks` 表。

当前数据库实际情况是：

- `tasks = 0`

同时配置里：

- `BELLDANDY_TASK_MEMORY_ENABLED` 没有开启

所以当前系统本来就不会把会话过程沉淀成 task 记录。  
结果就是 Task Viewer 为空，而这又会被误读成“状态目录没对上”。

### 6. 聊天系统提示词也没有注入 `MEMORY.md`

当前有效配置里：

- `BELLDANDY_INJECT_MEMORY=false`

这意味着即使后续存在 `MEMORY.md`，它也不会自动进入主聊天的 system prompt。  
所以聊天内容不像“读到了状态目录里的长期记忆”，并不是读取失败，而是因为配置明确关闭了这条注入链路。

### 7. 旧 session chunk 还会继续影响聊天观感

当前 `memory.sqlite` 中仅有的 chunk 主要来自旧的 `sessions/*.jsonl`，其中还残留了较早的 persona 和开场内容。

同时：

- `BELLDANDY_CONTEXT_INJECTION` 默认开启
- `BELLDANDY_CONTEXT_INJECTION_INCLUDE_SESSION=false`

虽然 session 类型不会直接按“最近会话记忆”注入，但 memory 库里目前主体内容本身就是旧 session 切出来的 chunk，仍然会影响 Memory Viewer 的观感，也会让用户觉得“系统还活在旧状态里”。

## 这次误会的核心成因

这次“WebChat 没连上状态目录”的判断，实际上是由下面几件事叠加出来的：

1. `.env.local` 一度没有正确覆盖 `.env`，导致运行时配置和预期配置不一致。
2. `start.bat` 注入 token 鉴权变量，制造了鉴权模式上的表面冲突。
3. 文件树虽然连着状态目录，但只展示有限后缀，用户看不到 `memory.sqlite`、`jsonl` 等关键文件。
4. Memory Viewer 读的是 `memory.sqlite`，不是原始 md 文件。
5. Task Viewer 读的是 `tasks` 表，而当前 `tasks=0`。
6. `BELLDANDY_INJECT_MEMORY=false`，聊天 prompt 不会注入 `MEMORY.md`。
7. 当前状态目录本身缺少 `MEMORY.md`，`memory/` 为空，数据库里主要是旧 session chunk。

## 正确的结论应该怎么表述

更准确的说法不是：

> WebChat 没连上状态目录。

而应该是：

> WebChat 已经连上状态目录，但文件树、记忆视图、任务视图、聊天提示词分别读取不同的数据层；再加上之前环境覆盖顺序错误和启动脚本注入 token，导致整体表现看起来像没有连上状态目录。

## 本次排查后的确认结果

排查后已经确认：

- `BELLDANDY_STATE_DIR` 实际生效，运行态确实使用 `C:\Users\vrboy\.star_sanctuary`
- 当前 WebChat 连接模式实际是 `authMode=none + pairing`
- 自动打开浏览器时不再错误携带 `?token=...`
- `.env.local` 的配置已经可以正确覆盖 `.env`
- 文件树链路本身没有指错目录

## 后续如果再遇到类似问题，优先检查

1. 启动日志里的 `State Dir` 是否正确。
2. 启动日志里的模型、Base URL、鉴权模式是否和 `.env.local` 一致。
3. 文件树显示规则是否过滤掉了用户想看的文件类型。
4. `memory.sqlite` 里到底有没有 `chunks / tasks` 数据。
5. `MEMORY.md`、`memory/` 是否真的存在内容。
6. `BELLDANDY_INJECT_MEMORY`、`BELLDANDY_TASK_MEMORY_ENABLED` 是否按预期开启。
