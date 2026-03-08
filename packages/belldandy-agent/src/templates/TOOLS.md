---
summary: "本地工具配置与环境说明"
read_when:
  - 需要使用特定工具时
  - 需要了解环境配置时
---
# TOOLS.md - 本地工具说明

技能定义了工具*如何*工作。这个文件用于记录*你的*具体配置——你的环境特有的信息。

## 文件操作权限（系统提供）

当 `BELLDANDY_TOOLS_ENABLED=true` 时，你可用的文件相关工具与范围如下。

**开放权限（可用工具）：**
- **读文件**：`file_read` — 读取工作区内或 `BELLDANDY_EXTRA_WORKSPACE_ROOTS` 配置目录下的文件；禁止读取 .env、密钥等敏感文件。
- **写文件**：`file_write` — 写入上述范围内的文件。
- **删文件**：`file_delete` — 删除上述范围内的文件。
- **列目录**：`list_files` — 列出主工作区或 `BELLDANDY_EXTRA_WORKSPACE_ROOTS` 配置根目录下指定目录的文件和子目录；path 可为相对主工作区的路径或允许范围内的绝对路径（如 C:/、E:/ 下），可选 recursive、depth。

**范围与限制：**
- 主工作区：`~/.star_sanctuary`（或 `BELLDANDY_STATE_DIR` 指定目录）。
- 额外根目录：由 .env 中 `BELLDANDY_EXTRA_WORKSPACE_ROOTS` 指定（逗号分隔，如 `C:/,E:/,D:/`）；`file_read` / `file_write` / `file_delete` / `list_files` 均可在主工作区与这些根下操作。
- 路径：可使用相对路径或上述范围内的绝对路径；禁止越界访问。
- 策略：`policy.deniedPaths` 会禁止访问含 .git、node_modules、.env 等路径。

需要查看某目录下有什么文件时，请使用 `list_files` 工具，不要声称无法列目录。

---

## 什么应该放在这里

比如：
- 你喜欢的工作方式
- 常用的项目路径
- SSH 主机和别名
- 设备昵称
- 任何环境相关的信息

## 示例

```markdown
### 工作目录
- 主项目 → ~/workspace/star_sanctuary
- 笔记 → ~/Documents/notes

### 常用命令
- 启动开发服务器 → pnpm dev:gateway
- 运行测试 → pnpm test

### 偏好
- 代码风格：TypeScript, ESM
- 编辑器：VS Code

### 工具与方法（示例）
- 部署脚本: 使用本机 `deploy.sh`，搭配方法 `Project-deploy-basic.md`
- 日志排查: 使用 `pnpm logs`，搭配方法 `Logs-debug-simple.md`
```

## 为什么分开？

技能是通用的。你的设置是你独有的。分开它们意味着你可以更新技能而不丢失你的笔记，也可以分享技能而不泄露你的基础设施。同时，方法（methods）记录的是"怎么做"的通用步骤，而这个文件记录的是"在这台机器上具体用哪些工具"。两者合在一起，才是完整的做事方式。

---

添加任何能帮助你完成工作的信息。这是你的速查表。
