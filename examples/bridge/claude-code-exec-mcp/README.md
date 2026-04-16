# Claude Code Exec MCP 示例

本目录用于把当前已经打通的 `claude_code_exec -> mcp` 试点整理成一套可复用示例。

目标不是替代真实运行态配置，而是提供一套**稳定参考模板**，让你能快速完成这三件事：

1. 配好 `mcp.json`
2. 配好 `agent-bridge.json`
3. 用统一话术和 skill 调起 `claude_code_exec`

如果你不想手动合并 JSON，当前更推荐先用仓库里已提供的最小生成入口：

```powershell
corepack pnpm bdd configure bridge claude-code-exec-mcp
```

它会在当前 `stateDir` 中幂等生成或合并：

1. `mcp.json`
2. `agent-bridge.json`
3. `claude-bridge` / `claude_code_exec` / `claude_code_exec_cli`

这份目录里的示例文件更适合：

1. 想确认最终 JSON 长什么样
2. 想手动改 `serverId` / `targetId`
3. 想对照生成结果做审阅

## 目录内容

- [mcp.example.json](/E:/project/star-sanctuary/examples/bridge/claude-code-exec-mcp/mcp.example.json)
- [agent-bridge.example.json](/E:/project/star-sanctuary/examples/bridge/claude-code-exec-mcp/agent-bridge.example.json)

## 这套示例解决什么问题

它把 `claude_code_exec -> mcp` 收成下面这条固定链路：

1. `bridge_run(targetId="claude_code_exec")`
2. MCP runtime 调 `claude-bridge`
3. 优先按 action 调窄工具：
   - `analyze -> analyze_once`
   - `review -> review_once`
   - `patch -> patch_once`
4. 兼容 action `exec` 时，再走 `task_once`
5. 对应 MCP tool 再调本机 `claude`

当前这条链路已经做过非沙箱真实冒烟，适合：

1. 一次性只读分析
2. 一次性 review / 摘要
3. 小范围一次性改文件
4. 明确想让 Claude Code 作为一次性外部 agent 执行者时

不适合：

1. 多轮交互式开发
2. 需要连续 read / write 的 session

这两类仍然优先走：

1. `codex_session`
2. `claude_code_session`

## 使用步骤

### 1. 配置 `mcp.json`

把 [mcp.example.json](/E:/project/star-sanctuary/examples/bridge/claude-code-exec-mcp/mcp.example.json) 合并到运行态：

- `~/.star_sanctuary/mcp.json`

你至少要替换两个占位符：

1. `__REPLACE_WITH_REPO_ROOT__`
   - 替换成仓库绝对路径
2. `__CLAUDE_COMMAND__`
   - 默认可先填 `claude`
   - 如果 Windows 下 PATH 找不到 Claude，再替换成完整命令路径

可选占位符：

1. `__GIT_BASH_PATH__`
   - 仅当当前机器上 Claude Code 无法自动发现 `bash.exe` 时再显式填写
   - 常见值是 `C:\Program Files\Git\bin\bash.exe`

建议获取命令路径的方法：

```powershell
Get-Command claude | Select-Object -ExpandProperty Source
```

### 2. 配置 `agent-bridge.json`

把 [agent-bridge.example.json](/E:/project/star-sanctuary/examples/bridge/claude-code-exec-mcp/agent-bridge.example.json) 合并到运行态：

- `~/.star_sanctuary/agent-bridge.json`

你至少要替换：

1. `__REPLACE_WITH_WORKSPACE_ROOT__`
   - 替换成实际工作目录

当前推荐保留两个 target：

1. `claude_code_exec`
   - 走 `mcp transport`
2. `claude_code_exec_cli`
   - 作为 CLI 回退路径

当前推荐的正式边界是：

1. `claude_code_exec`
   - 优先按 action 使用更窄的正式动作：
     - `analyze`
     - `review`
     - `patch`
   - 这三类 action 的参数应围绕 `objective / scope / constraints / expectedOutput`
2. `exec`
   - 仍保留为兼容 action
   - 底层走结构化 `task_once`
   - 参数围绕 `mode / objective / scope / constraints / expectedOutput`
3. `exec_once`
   - 仍保留为兼容入口
   - 不再作为正式推荐路径

## 推荐话术

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

## 推荐 skill 用法

当前这套示例配套的 skill 在：

1. [bridge-routing](/E:/project/star-sanctuary/examples/skills/bridge-routing/SKILL.md)
2. [claude-code-exec-mcp](/E:/project/star-sanctuary/examples/skills/claude-code-exec-mcp/SKILL.md)

推荐理解方式：

1. `bridge-routing`
   - 先决定该不该走 `exec`
   - 以及是否需要回退
2. `claude-code-exec-mcp`
   - 在确认使用 `claude_code_exec` 后，提供稳定用法

也就是说：

1. 先选路
2. 再执行

## skill 归属建议

这类 bridge skills 当前**不建议**进 `bundled-skills`。

原因是：

1. 它们高度依赖运行态 target 命名
2. 依赖本地 CLI / IDE 安装情况
3. 后续很容易因项目和机器差异继续增长

当前推荐归宿仍然是：

1. `examples/skills`
2. 用户按需复制到 `~/.star_sanctuary/skills`
3. 或按项目工作区需要继续定制

## 注意事项

1. 运行态 `mcp.json` 与 `agent-bridge.json` 应保存为 UTF-8 无 BOM
2. `claude_code_exec` 适合一次性任务，不适合多轮交互
3. 如果 `claude_code_exec` 失败，不要第一时间判定 Claude 完全不可用，先回退 `claude_code_exec_cli`
4. 如果任务本质上是多轮协作，直接改走 `claude_code_session`
