# Star Sanctuary 包内 README 中文稿（Windows x64）

本文用于收口包内 README 的中文口径，面向真实发布包用户。  
当前按 `Windows x64` 的 `Portable` 与 `Single-Exe` 两类产物分别给出。

## 一、Portable 中文版

### 标题

`Star Sanctuary Portable`

### 正文

这是 `Star Sanctuary` 的 Windows 便携版。

移动或复制时，请保持当前目录中的所有文件和文件夹完整，不要只拷贝其中一部分。

快速开始：

1. 双击 `start.bat`
2. 如果你更习惯 PowerShell，也可以运行 `start.ps1`
3. 如果浏览器没有自动打开，请在 `star-sanctuary.exe` 启动后手动访问 `http://127.0.0.1:28889/`

目录说明：

- `.env` / `.env.local`：放在 `start.bat` 同级目录
- `runtime/`：当前运行时目录
- `launcher/`：启动与运行时校验入口
- `payload/`：运行时损坏后的自动恢复源
- 用户状态、会话、日志、工作区数据：默认位于 `~/.star_sanctuary`，除非设置了 `BELLDANDY_STATE_DIR`

模式说明：

- `Slim` 便携版：保留浏览器控制、网页抓取和 SQLite memory；不默认附带 `fastembed` 和 `node-pty`
- `Full` 便携版：在以上基础上额外附带 `fastembed` 和 `node-pty`
- 默认始终包含：`better-sqlite3`、`sqlite-vec`、`puppeteer-core`、`jsdom`、`@mozilla/readability`、`turndown`

自检建议：

- 首次启动或自动修复时，等待接近 1 分钟都属于正常范围
- 如果启动失败，优先用 `start.ps1` 启动一次，让控制台保留最后的错误信息
- 如果运行时修复持续失败，请关闭所有 `star-sanctuary.exe` 进程，保留 `payload/`，备份 `.env*` 后删除 `runtime/`，再重新运行 `start.bat`
- 如果应用已经启动但浏览器没有自动打开，请手动访问 `http://127.0.0.1:28889/`
- 不要删除 `launcher/`、`payload/`、`version.json`、`runtime-manifest.json`

求助时请附带：

- 当前目录下的 `version.json`
- 当前目录下的 `runtime-manifest.json`
- 你使用的是 `slim` 还是 `full`
- `start.ps1` 最后一段控制台输出

共享 `.env` 或 `.env.local` 前，请先删除其中的敏感信息。

## 二、Single-Exe 中文版

### 标题

`Star Sanctuary Single-Exe`

### 正文

这是 `Star Sanctuary` 的 Windows 单文件启动版。

快速开始：

1. 双击 `star-sanctuary-single.exe`
2. 首次启动时，程序会把运行时缓存自动解包到 `%LOCALAPPDATA%\\StarSanctuary\\runtime\\<version>-win32-x64`
3. 如果浏览器没有自动打开，请在程序启动后手动访问 `http://127.0.0.1:28889/`

目录说明：

- 当前目录保存程序本体
- 解包后的运行时缓存位于 `%LOCALAPPDATA%\\StarSanctuary\\runtime\\<version>-win32-x64`
- `.env` / `.env.local`、状态数据、会话、日志、工作区数据默认位于 `~/.star_sanctuary`，除非你使用高级环境变量覆盖

模式说明：

- `Slim` 单文件版：保留浏览器控制、网页抓取和 SQLite memory；不默认附带 `fastembed` 和 `node-pty`
- `Full` 单文件版：在以上基础上额外附带 `fastembed` 和 `node-pty`
- 默认始终包含：`better-sqlite3`、`sqlite-vec`、`puppeteer-core`、`jsdom`、`@mozilla/readability`、`turndown`

自检建议：

- 首次启动、升级后首次启动、或自动修复时，等待接近 1 分钟都属于正常范围
- 如果第一次启动失败，请先完全退出程序，再启动一次；启动器会自动校验并尝试修复解包后的运行时
- 如果需要安全重置，请关闭所有 Star Sanctuary 进程，删除 `%LOCALAPPDATA%\\StarSanctuary\\runtime\\<version>-win32-x64`，然后重新运行 `star-sanctuary-single.exe`
- 如果应用已经启动但浏览器没有自动打开，请手动访问 `http://127.0.0.1:28889/`
- 报错时可先查看当前目录中的 `single-exe.json`，确认版本、模式和嵌入运行时信息

求助时请附带：

- 当前目录下的 `single-exe.json`
- 说明 `%LOCALAPPDATA%\\StarSanctuary\\runtime\\<version>-win32-x64` 是首次解包还是自动恢复后的结果
- 最后一段可见报错或控制台信息

共享 `.env` 或 `.env.local` 前，请先删除其中的敏感信息。

## 三、对外收口建议

如果后续要把这份中文稿正式并入构建产物，建议策略是：

- 包内继续保留英文 README，便于技术支持和字段对照
- 下载页、发布页、帮助中心优先使用中文
- 如需直接面向国内普通用户，也可以在包内同时放一份中文版 README

