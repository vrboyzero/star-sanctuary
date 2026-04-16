---
name: claude-code-session-bridge
description: |
  使用 bridge target `claude_code_session` 驱动交互式 Claude Code 会话。
  适用场景：
  (1) 多轮开发协作，
  (2) 需要持续 read / write 的 Claude Code session，
  (3) 需要由 bridge 吸收启动确认页和启动噪声。
version: "1.0"
tags: [bridge, claude, claude-code, session, pty, 交互式会话, 桥接]
priority: normal
eligibility:
  tools: [bridge_target_list, bridge_session_start, bridge_session_read, bridge_session_write, bridge_session_status, bridge_session_close, bridge_session_list]
---

# Claude Code Session Bridge

这个 skill 用来指导 Agent 稳定使用 `claude_code_session`。

它和 `codex_session` 一样，最重要的原则是：

1. **首回合任务优先放进 `bridge_session_start.prompt`**

当前 bridge 已经把 Claude 启动期的确认页、自举输入和一部分启动噪声下沉到了 target 配置里。  
因此推荐调用节奏不是：

1. `start`
2. 立刻第一条 `write`

而是：

1. `start(prompt=...)`
2. `read(waitMs=较长值)`
3. 再进入后续 `write / read`

## 什么时候用

适合：

1. 多轮开发任务
2. 持续协作式代码工作
3. 需要让 Claude Code 保持一个连续上下文

不适合：

1. 只需要一次性结果的任务
2. 只读摘要、单次 review 这类更适合 `exec` 的任务
3. 需要控制用户已经手动打开的 Claude 终端窗口

## 当前稳定范式

当前已验证的更稳路径是：

1. 在 `bridge_session_start.prompt` 里直接放首回合任务
2. 读取一轮较长等待的输出
3. 等首回合结束，再进入正常多轮

也就是：

1. `start(prompt) -> read -> write/read -> close`

## 为什么要这样做

因为 `claude_code_session` 仍然带有明显启动期特征：

1. 启动自举
2. 启动噪声
3. 首屏准备时间

如果首回合用 `start -> write`，真实表现更像：

1. 文本被塞进输入框
2. 但不一定真正触发了第一轮任务

所以当前不把 `start -> 第一条 write` 作为推荐范式。

## 推荐调用模板

### 首回合

```text
请使用 bridge target `claude_code_session` 在当前仓库工作。
首回合任务直接随 start 提交：
<这里写第一条完整任务>
限制：
- <限制1>
- <限制2>
```

### 后续多轮

```text
继续在刚才的 claude session 里做下一步：
- <next step>
```

## Prompt 结构建议

首回合 prompt 仍建议完整写出：

1. 目标
2. 范围
3. 是否允许改文件
4. 输出要求
5. 明确限制

越完整，越能减少启动阶段误解。

## 使用边界

1. bridge 会自己启动新会话
2. bridge 不能接管用户已手动打开的外部 Claude 窗口
3. transcript / artifact 会自动落盘
4. Gateway 重启后恢复的是 metadata，不是活 PTY 连接

## 回退规则

1. 如果任务只需要一次性结果，优先考虑 `claude_code_exec`
2. 如果会话异常，关闭后重新 `start`
3. 如果恢复后是 `runtime-lost`，直接新开，不继续往旧会话写

## NEVER

1. 不要把 `start -> 第一条 write` 当成默认首回合策略
2. 不要忽略启动阶段的 `read`
3. 不要把一次性任务硬塞进 session
4. 不要假设 bridge 可以控制用户手动打开的 Claude 窗口
5. 不要把恢复出来的 `runtime-lost` 会话继续当活会话使用
