---
name: codex-session-bridge
description: |
  使用 bridge target `codex_session` 驱动交互式 Codex 会话。
  适用场景：
  (1) 多轮开发协作，
  (2) 需要持续 read / write 的 coding session，
  (3) 一次性 `codex_exec` 不够用、需要保持上下文连续。
version: "1.0"
tags: [bridge, codex, session, pty, agent-cli, 交互式会话, 桥接]
priority: normal
eligibility:
  tools: [bridge_target_list, bridge_session_start, bridge_session_read, bridge_session_write, bridge_session_status, bridge_session_close, bridge_session_list]
---

# Codex Session Bridge

这个 skill 用来指导 Agent 稳定使用 `codex_session`。

当前最重要的规则只有一条：

1. **首回合任务优先放进 `bridge_session_start.prompt`**

不要把第一条任务放到 `start` 之后立刻 `write`。  
当前真实验证里，更稳的路径是：

1. `bridge_session_start(prompt=...)`
2. `bridge_session_read(waitMs=较长值)`
3. 首回合完成后，再进入正常 `write / read`

## 什么时候用

适合：

1. 多轮开发任务
2. 持续读写同一个 coding CLI 会话
3. 需要上下文连续的排障、改文件、验证
4. 一次性 `codex_exec` 不够表达完整任务

不适合：

1. 只需要一次结果的任务
2. 只读摘要、一次性 review 这类 `exec` 更合适的任务
3. 需要控制用户已手动打开的外部终端

## 首回合范式

推荐固定理解成：

1. 启动会话时直接把第一条任务作为 `prompt`
2. 然后做一次较长等待的 `read`
3. 看到首回合结果后，再继续后续 write/read

简化成一句话：

1. `start(prompt) -> read -> write/read -> close`

## 推荐调用模板

### 首回合

```text
请使用 bridge target `codex_session` 在当前仓库工作。
首回合任务直接随 start 提交：
<这里写第一条完整任务>
限制：
- <限制1>
- <限制2>
```

### 后续多轮

后续再补充：

```text
继续在刚才的 codex session 里做下一步：
- <next step>
```

## Prompt 结构建议

首回合 prompt 尽量写全：

1. 当前目标
2. 工作范围
3. 是否允许修改
4. 需要什么输出
5. 禁止做什么

这样可以减少：

1. 启动噪声干扰
2. 首回合没真正提交
3. 读到一堆 boot 输出但任务没开始

## 推荐等待策略

`codex_session` 首回合的 `read` 不要太短。

当前推荐：

1. 首回合 `read(waitMs=较长值)`
2. 后续再按正常节奏读写

如果 target 自带 `recommendedReadWaitMs`，优先尊重 target 返回建议。

## 关闭与审计

使用结束后应：

1. 查询状态或读取最后输出
2. 主动 `bridge_session_close`

当前 bridge 会为会话落：

1. transcript
2. summary
3. registry metadata

所以它适合做可审计开发协作，但不要假设 Gateway 重启后还能继续复用旧 PTY 连接。

## 回退规则

1. 如果任务只需要一次性结果，改用 `codex_exec`
2. 如果会话状态异常，关闭后重新 `start`
3. 如果旧会话恢复为 `runtime-lost`，不要继续写入，直接新开

## NEVER

1. 不要把首条任务放到 `start` 之后立刻第一条 `write`
2. 不要把一次性任务硬塞进 session
3. 不要假设可以接管用户已经手动打开的 Codex 窗口
4. 不要忽略 `read`，否则看不到真实执行结果
5. 不要把 `runtime-lost` 的旧会话当成可继续交互的活会话
