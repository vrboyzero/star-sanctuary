---
name: bridge-routing
description: |
  为 Star Sanctuary 的 bridge target 做总入口路由判断。
  适用场景：
  (1) 需要先判断该用 `codex_exec`、`codex_exec_cli`、`claude_code_exec`、`claude_code_exec_cli`、`codex_session` 还是 `claude_code_session`，
  (2) 需要统一处理一次性任务、多轮任务和回退策略，
  (3) 不希望每次都手工记 bridge 使用规则。
version: "1.0"
tags: [bridge, routing, codex, claude, mcp, session, exec, 桥接, 路由]
priority: normal
eligibility:
  tools: [bridge_target_list, bridge_run, bridge_session_start, bridge_session_read, bridge_session_write, bridge_session_status, bridge_session_close, bridge_session_list]
---

# Bridge Routing

这个 skill 是 bridge 的总入口路由规则。

它不直接替代 bridge 工具，也不直接替代具体 target skill。  
它的作用是先回答一个问题：

1. **这次任务应该走哪个 bridge target？**

当前优先覆盖的目标有：

1. `codex_exec`
2. `codex_exec_cli`
3. `claude_code_exec`
4. `claude_code_exec_cli`
5. `codex_session`
6. `claude_code_session`

## 总原则

先按任务形态分流：

1. 一次性、范围明确、希望快速拿结果
   - 默认优先 `codex_exec`
2. 一次性，且用户明确指定 Claude 或更适合 Claude Code
   - 优先 `claude_code_exec`
3. 一次性，但当前首选 MCP 路径不可用
   - 回退对应的 `_cli` target
3. 多轮协作、持续读写、需要保持上下文
   - 优先 `codex_session`
4. 明确要用 Claude Code 做多轮协作
   - 选 `claude_code_session`

不要把 session 当成默认入口。  
只有任务明显需要连续上下文时，才从 `exec` 升级到 `session`。

## 推荐路由顺序

每次开始前，按这个顺序判断：

1. 先看 task 是一次性还是多轮
2. 再看当前可用 target
3. 再决定是否需要回退

固定顺序如下：

1. 如果任务是一次性
   - 先试 `codex_exec`
2. 如果任务是一次性且明确要求 Claude
   - 先试 `claude_code_exec`
3. 如果当前首选的一次性 MCP 路径不可用
   - 回退对应的 `_cli` target
4. 如果任务明显需要多轮连续协作
   - 直接用 `codex_session`
5. 如果任务明确指定 Claude 或需要改用 Claude session
   - 用 `claude_code_session`

对 `codex_exec` / `claude_code_exec`，当前更推荐：

1. 只读分析走 `action=analyze`
2. 一次性 review 走 `action=review`
3. 小范围改单文件走 `action=patch`
4. 只有兼容老路径时，才继续使用 `action=exec`

## 快速决策表

| 任务类型 | 首选 | 回退 | 备注 |
| --- | --- | --- | --- |
| 只读分析 | `codex_exec` | `codex_exec_cli` | 默认先走一次性 |
| 指定 Claude 的只读分析 | `claude_code_exec` | `claude_code_exec_cli` | 明确要用 Claude 时走这条 |
| 一次性 review / 摘要 | `codex_exec` | `codex_exec_cli` | 尽量不进 session |
| 指定 Claude 的一次性 review / 摘要 | `claude_code_exec` | `claude_code_exec_cli` | 适合明确要用 Claude 的情况 |
| 小范围一次性改文件 | `codex_exec` | `codex_exec_cli` | 任务边界要写清楚 |
| 多轮开发协作 | `codex_session` | 重新 start 新 session | 首回合用 `start.prompt` |
| 多轮 Claude 协作 | `claude_code_session` | 重新 start 新 session | 首回合也用 `start.prompt` |

## 路由规则

### 规则 1：能一次性完成，就不要先进 session

优先判定为 `exec` 的信号：

1. 用户只要分析结果
2. 用户只要 review 结论
3. 用户只要求一次性改一个小点
4. 输出形式更像“报告”而不是“持续协作”

这时优先：

1. `codex_exec`
2. 明确指定 Claude 时改用 `claude_code_exec`
3. 失败再回退对应的 `_cli` target

### 规则 2：需要连续上下文时，再切到 session

优先判定为 `session` 的信号：

1. 用户要求“继续刚才那轮”
2. 任务天然要分多步推进
3. 需要反复 read / write
4. 一次性 `exec` 明显不够表达任务

这时优先：

1. `codex_session`
2. 明确要用 Claude 时，选 `claude_code_session`

### 规则 3：首回合都优先随 start 提交

对当前已验证的 session target：

1. `codex_session`
2. `claude_code_session`

首回合都应该优先：

1. `bridge_session_start.prompt`

而不是：

1. `start`
2. 立刻第一条 `write`

推荐固定节奏：

1. `start(prompt)`
2. `read`
3. 再进入正常 `write/read`

### 规则 4：先回退 target，不先放弃 bridge

如果一次性路径失败：

1. 先看 `codex_exec` 是否只是 MCP 路径问题
2. 如果当前用的是 `claude_code_exec`，也先看是不是 MCP 路径问题
3. 能回退就回退对应的 `_cli` target
4. 不要第一时间直接放弃对应 CLI

如果 session 路径失败：

1. 先关闭异常会话
2. 再新开 session
3. 不要继续往 `runtime-lost` 的旧会话写

## 推荐执行流程

### 一次性任务

1. `bridge_target_list`
2. 判断当前更适合 `codex_exec` 还是 `claude_code_exec`
3. `bridge_run(targetId=<preferred-exec-target>, ...)`
4. 如果失败且属于 target 路径问题，再试对应的 `_cli` target

### 多轮任务

1. `bridge_target_list`
2. 选择 `codex_session` 或 `claude_code_session`
3. 用 `bridge_session_start.prompt` 提交首回合
4. `bridge_session_read`
5. 后续 `write/read`
6. 结束后 `close`

## 推荐话术模板

### 自动路由到 exec

```text
请先判断这次任务适合 bridge 的哪条路径。
如果是一次性任务，默认优先使用 `codex_exec`；如果我明确要求 Claude，则改用 `claude_code_exec`；
如果当前 MCP 路径不可用，再回退对应的 `_cli` target。
任务：<task>
限制：<limits>
```

### 自动路由到 session

```text
请先判断这次任务是否需要多轮 bridge session。
如果需要连续协作，优先使用 `codex_session`；
如果我明确要求 Claude，再改用 `claude_code_session`。
首回合任务直接随 start 提交：
<task>
```

## 何时切换到具体 skill

这个总入口 skill 适合先做路由判断。  
一旦路由确定，优先切换到对应细分 skill 的规则：

1. `codex-exec-mcp`
2. `claude-code-exec-mcp`
3. `codex-session-bridge`
4. `claude-code-session-bridge`

也就是说：

1. `bridge-routing` 负责“先选路”
2. 具体 skill 负责“怎么稳定走这条路”

## NEVER

1. 不要默认所有任务都先进 session
2. 不要把 `codex_exec` 失败直接等同于“Codex 完全不可用”
3. 不要忘记 `codex_exec_cli` 这个回退路径
4. 不要对 `codex_session` 或 `claude_code_session` 用 `start -> 第一条 write` 当默认首回合
5. 不要把用户已经手动打开的终端当成可被 bridge 接管的会话
