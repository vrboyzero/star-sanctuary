# Star Sanctuary 下载说明（Windows x64）

本文用于对外发布页 / 下载页说明，口径以当前已完成的 Windows x64 发布形态为准。

## 1. 这是什么

`Star Sanctuary` 是一个面向普通用户的本地 AI 助手应用包。

当前已提供两种 Windows x64 下载形态：

- `Portable` 便携目录版
- `Single-Exe` 单文件启动版

当前发布口径下：

- `Portable` 提供 `Slim` / `Full`
- `Single-Exe` 当前仅提供 `Full`

## 2. 我该下载哪个版本

### 2.1 先看安装形态

#### Portable 便携目录版

适合：

- 希望解压后直接使用的人
- 希望更容易看到运行目录和文件结构的人
- 希望在包内直接保留 `runtime/`、`launcher/`、`payload/` 这些恢复文件的人

特点：

- 下载后需要先解压
- 双击 `start.bat` 启动
- 包目录需要整体保留，不要随意删内部文件

#### Single-Exe 单文件启动版（当前仅 Full）

适合：

- 希望下载后直接双击一个 `.exe` 的人
- 不想关心运行目录结构的人

特点：

- 下载后双击 `star-sanctuary-single.exe` 即可启动
- 首次运行会自动把运行时解包到本机缓存目录
- 程序本体是单文件，但运行时仍会在本机生成缓存

### 2.2 再看能力档位

#### Slim

适合：

- 大多数普通用户
- 主要使用网页界面、本地浏览器控制、网页抓取、基础记忆能力的人

当前默认包含：

- 浏览器控制
- 网页抓取 / 网页提取
- SQLite memory
- `better-sqlite3`
- `sqlite-vec`
- `puppeteer-core`
- `jsdom`
- `@mozilla/readability`
- `turndown`

不包含：

- `fastembed`
- `node-pty`

#### Full

适合：

- 需要更完整本地能力的人
- 需要原生 PTY 终端能力的人
- 需要本地 embedding 能力的人

在 `Slim` 基础上额外包含：

- `fastembed`
- `node-pty`

### 2.3 最短建议

如果你不确定：

- 优先下载 `Portable Slim`

如果你明确想要“一个 exe 直接双击”：

- 下载 `Single-Exe Full`

如果你已经知道自己需要原生 PTY 或本地 embedding：

- 下载 `Portable Full` 或 `Single-Exe Full`

## 3. 如何启动

### Portable

1. 下载压缩包并解压到一个普通目录。
2. 保持目录内文件完整，不要单独移动其中某几个文件。
3. 双击 `start.bat`。
4. 如果系统更适合 PowerShell，也可以运行 `start.ps1`。

### Single-Exe

1. 下载 `star-sanctuary-single.exe` 所在目录包。
2. 双击 `star-sanctuary-single.exe`。
3. 首次运行时，程序会自动准备本机运行时缓存。

## 4. 首次启动会发生什么

首次启动、升级后首次启动、或运行时自动修复时，可能需要等待约 1 分钟。

这是正常现象，原因通常包括：

- 准备本地运行时
- 校验运行时完整性
- 自动修复损坏文件
- 启动本地服务并等待网页可访问

如果浏览器没有自动打开，可以手动访问：

- `http://127.0.0.1:28889/`

## 5. 文件和数据默认放在哪里

### Portable

包目录内通常会看到：

- `runtime/`
- `launcher/`
- `payload/`
- `.env.example`
- `README-portable.md`
- `version.json`
- `runtime-manifest.json`

含义：

- `runtime/`：当前运行时
- `launcher/`：启动和校验入口
- `payload/`：运行时损坏后的恢复源

### Single-Exe

程序本体在下载目录中。

运行时缓存默认在：

- `%LOCALAPPDATA%\StarSanctuary\runtime\<version>-win32-x64`

### 用户数据

默认用户目录在：

- `~/.star_sanctuary`

这里通常会存放：

- 配置
- 会话
- 日志
- 工作区数据
- 本地状态数据

## 6. 配置怎么改

常见配置方式：

- 在包目录旁边放 `.env`
- 或放 `.env.local`

当前口径下：

- Portable：`.env` / `.env.local` 放在 `start.bat` 同级目录
- Single-Exe：默认仍使用用户环境和默认状态目录；高级用户可通过环境变量覆盖路径

如果你只是普通使用者，通常不需要改高级路径变量。

## 7. 出问题时怎么自检

先看这几个最常见场景。

### 7.1 双击后没自动打开浏览器

先手动访问：

- `http://127.0.0.1:28889/`

### 7.2 Portable 启动失败

建议顺序：

1. 用 `start.ps1` 启动一次，让控制台保持打开。
2. 查看最后一段报错。
3. 关闭所有 `star-sanctuary.exe` 进程。
4. 备份 `.env` 和 `.env.local`。
5. 保留 `payload/`，删除 `runtime/`。
6. 再次运行 `start.bat`。

不要删除这些文件或目录：

- `launcher/`
- `payload/`
- `version.json`
- `runtime-manifest.json`

### 7.3 Single-Exe 启动失败

建议顺序：

1. 先完全退出程序。
2. 再运行一次 `star-sanctuary-single.exe`。
3. 如果仍失败，关闭所有 Star Sanctuary 进程。
4. 删除本机运行时缓存目录：
   - `%LOCALAPPDATA%\StarSanctuary\runtime\<version>-win32-x64`
5. 再次运行 `star-sanctuary-single.exe`。

## 8. 反馈问题时请附带什么

为了更快定位问题，请附带：

- 你下载的是哪一种包：`Portable` 或 `Single-Exe`
- 你使用的是哪一种模式：
  - `Portable Slim`
  - `Portable Full`
  - `Single-Exe Full`
- 你的系统环境：`Windows x64`
- 最后一段报错或控制台输出

建议附带文件：

- Portable：
  - `version.json`
  - `runtime-manifest.json`
- Single-Exe：
  - `single-exe.json`

如果需要提供 `.env`，请先自行删掉密钥、口令、Token 等敏感信息。

## 9. 当前发布口径

当前适合对外明确说明的范围是：

- 已提供 `Windows x64`
- 已提供 `Portable` / `Single-Exe`
- `Portable` 已提供 `Slim` / `Full`
- `Single-Exe` 当前仅提供 `Full`
- 已覆盖首次启动、自动恢复、基础自检说明

当前不建议对外写死的内容：

- 其他平台下载承诺
- 安装向导版
- 自动升级承诺
- 杀软兼容承诺

