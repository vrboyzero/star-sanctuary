---
name: claude-code-exec-mcp
description: |
  使用 bridge target `claude_code_exec` 通过 MCP wrapper 调用 Claude Code 执行一次性开发任务。
  适用场景：
  (1) 只读分析、review、摘要、报告生成，
  (2) 小范围、一次性文件修改，
  (3) 想优先走结构化 `mcp transport`，必要时回退 `claude_code_exec_cli`。
version: "1.0"
tags: [bridge, claude, claude-code, mcp, exec, agent-cli, 一次性执行, 桥接]
priority: normal
eligibility:
  tools: [bridge_target_list, bridge_run]
---

# Claude Code Exec MCP

这个 skill 用来指导 Agent 在 **一次性任务** 场景下，优先使用 bridge target `claude_code_exec`。

当前仓库里的推荐路径是：

1. 优先 `claude_code_exec`
   - 这条路径当前走 `mcp transport`
   - 优先按 action 使用：
     - `analyze`
     - `review`
     - `patch`
   - 兼容 action `exec` 时，底层再走 `claude-bridge/task_once`
2. 如果 MCP 路径不可用，再回退 `claude_code_exec_cli`

它不是交互式 session skill。需要多轮连续协作时，不要继续用这个 skill，改用 `claude-code-session-bridge`。

## 什么时候用

优先用于这些场景：

1. 只读分析
2. 代码 review
3. 生成摘要、变更说明、检查报告
4. 一次性的小范围文件修改
5. 明确希望由 Claude Code 作为一次性外部 agent 执行者

不要用于这些场景：

1. 需要多轮连续对话
2. 需要持续 read / write 的交互式开发
3. 需要观察 TUI 启动过程
4. 明显会超过一次性调用边界的大任务

## 推荐决策顺序

1. 先确认 bridge target 是否存在
   - 可先用 `bridge_target_list`
2. 如果有 `claude_code_exec`
   - 优先用它
3. 如果 `claude_code_exec` 当前不可用
   - 回退 `claude_code_exec_cli`
4. 如果任务本质上需要多轮协作
   - 改走 `claude_code_session`

## 推荐调用原则

对 `bridge_run`，输入要尽量结构化、范围明确：

1. 明确 `targetId = claude_code_exec`
2. 明确任务范围
3. 明确只读或可修改
4. 明确输出物

当前更推荐把输入组织成结构化字段：

1. 首选更窄 action：
   - `analyze`
   - `review`
   - `patch`
2. 对这些 action，输入围绕：
   - `objective`
   - `scope`
   - `constraints`
   - `expectedOutput`
3. 只有兼容 action `exec` 时，才再传：
   - `mode`
   - `objective`
   - `scope`
   - `constraints`
   - `expectedOutput`

`exec_once` 仍保留为兼容入口，但不再作为正式推荐边界。

## 推荐话术模板

### 只读分析

```text
请优先使用 bridge target `claude_code_exec`；如果当前 MCP 路径不可用，再回退 `claude_code_exec_cli`。
任务：在当前项目里做一次只读分析。
范围：
- <file-or-dir>
- <file-or-dir>
限制：
- 不要修改文件
- 不要运行 git
输出：
- 给出 3 到 5 条结论
```

### 一次性小改动

```text
请优先使用 bridge target `claude_code_exec`；如果当前 MCP 路径不可用，再回退 `claude_code_exec_cli`。
任务：只修改一个小文件并说明改动。
范围：
- <file>
限制：
- 不要改无关文件
- 改完后给出简短验证说明
```

## 输出预期

一次性执行后，优先期待这些结果：

1. 明确完成或失败状态
2. 简短文本结果
3. 必要时 artifact 路径
4. 若失败，看到错误摘要，而不是卡在交互界面

## 回退规则

如果 `claude_code_exec` 失败，按这个顺序处理：

1. 先看是不是 MCP 路径问题
2. 若只是 `claude_code_exec` 不可用，回退 `claude_code_exec_cli`
3. 若任务本身不适合一次性执行，切换到 `claude_code_session`

## NEVER

1. 不要把它当成多轮 session 用
2. 不要在一次性任务里依赖交互式确认页
3. 不要让结构化输入缺少范围和限制
4. 不要在明知需要连续协作时仍坚持 `exec`
5. 不要把 MCP 路径失败误判成“Claude 完全不可用”
