---
name: screen-capture
description: Windows 屏幕截图技能 - 当前正式主链路为 PowerShell `.ps1` + `.env` + OpenAI 兼容视觉接口，支持 Moonshot/Kimi 等兼容服务。
version: "2.3"
tags: [screenshot, capture, 截图, 屏幕, 截屏, windows, powershell, 图像分析, openai-compatible, moonshot, kimi]
priority: normal
eligibility:
  bin: [powershell]
---

# Screen Capture Skill

## 功能概述

本技能提供 Windows 环境下的屏幕截图与视觉分析功能：
- ✅ **无 UI 截图**：直接读取屏幕像素，不弹出选择框
- ✅ **全屏捕获**：自动检测分辨率（支持多显示器）
- ✅ **自动命名**：时间戳命名，避免覆盖
- ✅ **图像分析**：可配合 vision 模型分析屏幕内容（需服务可用）
- ✅ **`.env` 驱动**：从 `C:\Users\admin\.star_sanctuary\.env` 读取模型配置
- ✅ **OpenAI 兼容接口**：支持 `OPENAI_BASE_URL`，可切 Moonshot / Kimi 等兼容服务
- ✅ **健壮错误处理**：清晰的错误提示和诊断信息
- ✅ **旧链路归档**：历史 `.sh` / Kimi 脚本已整理到 `scripts/legacy/`

## 当前正式主链路（推荐）

经过 2026-03-08 的现场修复与实测，当前推荐使用以下正式链路：

- **截图入口**：`skills/screen-capture/scripts/screen-capture.ps1`
- **截图 + 分析入口**：`skills/screen-capture/scripts/screen-capture-analyze.ps1`
- **Python 分析模块**：`skills/screen-capture/scripts/media-analyze-openai.py`
- **配置文件**：`C:\Users\admin\.star_sanctuary\.env`

当前这条主链路已经验证通过：

- 能成功截图
- 能正确加载 `.env`
- 能读取 `OPENAI_API_KEY`
- 能读取 `OPENAI_BASE_URL`
- 能读取 `OPENAI_VISION_MODEL`
- 能通过 OpenAI 兼容接口返回结构化分析结果
- ✅ **v2.2 新增**：完善的错误处理和用户友好的提示信息
- ✅ **v2.3 新增**：旧链路已物理迁移到 `scripts/legacy/`，正式/兼容边界更清晰

## 快速开始

### 1. 仅截图（正式入口）
```powershell
# 截图保存到默认路径
powershell -NoProfile -ExecutionPolicy Bypass -File "skills/screen-capture/scripts/screen-capture.ps1"

# 截图并指定输出目录
powershell -NoProfile -ExecutionPolicy Bypass -File "skills/screen-capture/scripts/screen-capture.ps1" -OutputDir "C:\Users\admin\Pictures\Screenshots"
```

### 2. 截图并分析（正式入口）

```powershell
# 截图并分析（默认从 C:\Users\admin\.star_sanctuary\.env 读取配置）
powershell -NoProfile -ExecutionPolicy Bypass -File "skills/screen-capture/scripts/screen-capture-analyze.ps1"

# 截图并回答特定问题
powershell -NoProfile -ExecutionPolicy Bypass -File "skills/screen-capture/scripts/screen-capture-analyze.ps1" -Prompt "请用简洁中文总结屏幕主要内容"

# 分析已有图片
powershell -NoProfile -ExecutionPolicy Bypass -File "skills/screen-capture/scripts/screen-capture-analyze.ps1" -InputPath "C:\Users\admin\Pictures\Screenshots\example.png" -Prompt "描述这个界面"
```

### 3. `.env` 配置示例

```dotenv
OPENAI_API_KEY=你的Key
OPENAI_BASE_URL="https://api.moonshot.cn/v1"
OPENAI_VISION_MODEL="kimi-k2.5"
```

说明：

- `OPENAI_API_KEY`：接口密钥
- `OPENAI_BASE_URL`：OpenAI 兼容接口地址，可指向 Moonshot 等服务
- `OPENAI_VISION_MODEL`：当前使用的视觉/多模态模型

## 兼容保留方案（旧链路）

以下旧链路**仍然保留**，用于兼容历史环境或特殊场景，但**不再作为默认推荐路径**。如果旧方案说明与当前正式主链路冲突，**以 `.ps1 + .env + OpenAI 兼容接口` 主链路为准**。

### 旧链路状态说明

| 方案 | 状态 | 当前路径 | 适用场景 | 维护策略 |
|------|------|----------|----------|----------|
| `screen-capture.sh` | ⚠️ 兼容保留 | `skills/screen-capture/scripts/legacy/screen-capture.sh` | WSL / Linux 下的基础截图 | 保留，不作为主入口 |
| `screen-capture-analyze.sh` + Gemini | ⚠️ 兼容保留 | `skills/screen-capture/scripts/legacy/screen-capture-analyze.sh` | 仍需走 Gemini API 的旧环境 | 保留，不优先维护 |
| `screen-capture-analyze-kimi.sh` + 旧 Kimi 脚本 | ⚠️ 兼容保留 | `skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh` | 需要图片/视频分析的旧调用方式 | 保留，不作为正式主链路 |
| `media-analyze-kimi.py` | ⚠️ 兼容保留 | `skills/screen-capture/scripts/legacy/media-analyze-kimi.py` | 旧 Kimi Python 分析模块 | 保留，不作为正式主链路 |

### 方案 A：Gemini 分析（旧方案，兼容保留）
```bash
# 截图并使用 Gemini 分析
./skills/screen-capture/scripts/legacy/screen-capture-analyze.sh

# 截图并回答特定问题
./skills/screen-capture/scripts/legacy/screen-capture-analyze.sh "当前打开了哪些应用程序？"
```

### 方案 B：Kimi 分析（旧方案，兼容保留）
```bash
# 截图并使用 Kimi K2.5 分析
./skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh

# 截图并回答特定问题
./skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh "" "当前打开了哪些应用程序？"

# 分析已有图片/视频文件
./skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh "C:/Users/admin/Pictures/screenshot.png"
./skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh "/mnt/c/Users/admin/Videos/demo.mp4" "总结视频内容"
```

**旧 Kimi 方案特点：**
- ✅ 支持 **视频分析**（mp4, mov, avi, mkv, webm）
- ✅ 支持多种图片格式（jpg, png, webp, gif, bmp）
- ✅ 输出结构化 JSON（description, tags, content）
- ⚠️ 但当前已不是默认主方案，后续新能力将优先补到正式主链路

## 实现原理

使用 PowerShell 调用 .NET Framework 的 `System.Drawing` 库：

```powershell
# 核心代码
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [Point]::Empty, $screen.Size)
$bitmap.Save($filepath, [ImageFormat]::Png)
```

**优势**：
- 直接读取显卡缓冲区，无窗口焦点要求
- 不依赖外部截图工具（如 Snipaste、ShareX）
- 可在自动化脚本中稳定运行

## 脚本说明

本技能包含以下脚本：

### 1. screen-capture.ps1 - 当前正式截图入口
当前推荐入口。仅截图，不做分析。

**v2.2 改进：**
- ✅ 添加详细注释和文档字符串
- ✅ 增强参数校验（自动添加 `.png` 后缀）
- ✅ 完善错误处理（目录创建失败、屏幕区域无效等）
- ✅ 确保资源正确释放（`finally` 块）

### 2. screen-capture-analyze.ps1 - 当前正式截图+分析入口
当前推荐入口。支持：

- 未传 `InputPath` 时先截图
- 通过 `-EnvFile` 加载 `.env`
- 调用 `media-analyze-openai.py`
- 输出 `MEDIA:` 路径与结构化分析结果

**v2.2 改进：**
- ✅ 封装 `.env` 解析为独立函数 `Import-DotEnvFile`
- ✅ 添加环境变量验证函数 `Test-RequiredEnvVars`
- ✅ 增强错误提示（文件不存在、配置缺失等具体提示）
- ✅ 返回加载的配置键列表（便于调试）
- ✅ 添加详细的函数文档注释

### 3. media-analyze-openai.py - 当前正式 Python 分析模块
用于：

- 读取 `.env`
- 获取 `OPENAI_API_KEY`
- 获取 `OPENAI_BASE_URL`
- 获取 `OPENAI_VISION_MODEL`
- 必要时压缩图片
- 调用 OpenAI 兼容 `chat.completions.create`

**v2.2 改进：**
- ✅ 添加模块级文档字符串
- ✅ 封装 `validate_env()` 函数，提供清晰的错误提示
- ✅ 添加 `analyze_image()` 函数，分离 API 调用逻辑
- ✅ 增强错误处理（认证失败、API 错误等具体提示）
- ✅ 添加进度提示（压缩进度、配置加载确认）
- ✅ 使用 emoji 图标提升可读性（❌ 错误、💡 提示、✓ 成功等）
- ✅ 改进命令行帮助信息

### 4. screen-capture.sh - 旧版基础截图入口（兼容保留）
当前路径：`skills/screen-capture/scripts/legacy/screen-capture.sh`

```bash
./skills/screen-capture/scripts/legacy/screen-capture.sh
```

### 5. screen-capture-analyze.sh - 截图+Gemini 分析（旧方案，兼容保留）
当前路径：`skills/screen-capture/scripts/legacy/screen-capture-analyze.sh`

```bash
./skills/screen-capture/scripts/legacy/screen-capture-analyze.sh
```

### 6. screen-capture-analyze-kimi.sh - 截图/文件+Kimi 分析（旧方案，兼容保留）
当前路径：`skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh`

```bash
./skills/screen-capture/scripts/legacy/screen-capture-analyze-kimi.sh
```

### 7. media-analyze-kimi.py - 旧版 Kimi Python 分析模块（兼容保留）
当前路径：`skills/screen-capture/scripts/legacy/media-analyze-kimi.py`

## 配置选项

在 `clawdbot.json` 中配置默认参数：

```json
{
  "skills": {
    "entries": {
      "screen-capture": {
        "config": {
          "defaultOutputDir": "C:\\Users\\admin\\Pictures\\Screenshots",
          "defaultFormat": "png",
          "autoAnalyze": false,
          "compressionQuality": 90
        }
      }
    }
  }
}
```

## 注意事项

### ⚠️ 隐私提醒
- 截图会捕获屏幕上的**所有内容**，包括敏感信息
- 在截图前请确保没有隐私/机密信息暴露
- 建议定期清理截图目录

### ⚠️ 性能考虑
- 全屏截图（3440x1440）通常产生 2-5MB 的 PNG 文件
- 频繁截图可能影响系统性能
- 建议截图间隔 > 5 秒

### ⚠️ 服务依赖
- **当前正式截图功能**：仅依赖 PowerShell + .NET（Windows 自带）✅
- **当前正式分析功能**：依赖 Python 3 + `openai` + `python-dotenv` + `Pillow` + `.env` 中的 OpenAI 兼容配置 ✅
- **Gemini 分析（旧方案）**：依赖 Google API（需要配置 WSL 代理）⚠️
- **Kimi 分析（旧方案）**：依赖 `scripts/legacy/` 下的旧版脚本链路 ⚠️

## 当前正式方案的依赖检查

### Python 依赖
```bash
pip install openai python-dotenv pillow
```

### 关键环境变量
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_VISION_MODEL`

### 默认 `.env` 路径
- `C:\Users\admin\.star_sanctuary\.env`

## 故障排除

### 当前正式分析链路失败

```text
❌ 错误: 未设置 OPENAI_API_KEY
💡 请检查:
   1. .env 文件是否存在且包含 OPENAI_API_KEY
   2. 环境变量是否正确加载
   3. 搜索路径: ..., ~/.star_sanctuary/
```

**解决**：检查 `C:\Users\admin\.star_sanctuary\.env` 中是否已配置 `OPENAI_API_KEY`

## 相关资源

- **方法文档**: `methods/屏幕捕获-使用-基础.md`
- **实现参考**: PowerShell + .NET System.Drawing
- **替代方案**: Snipaste, ShareX, Windows 自带截图工具

## 更新日志

- **v2.3** (2026-03-08): 旧链路目录整理
  - 新建 `scripts/legacy/` 子目录
  - 将旧 `.sh` / Kimi Python 脚本迁移到 `legacy/`
  - 同步更新旧链路路径说明，降低与正式主链路混淆风险
- **v2.2** (2026-03-08): 代码整洁化 - 增强健壮性和错误提示
  - `screen-capture.ps1`: 添加详细文档、参数校验、完善错误处理
  - `screen-capture-analyze.ps1`: 封装 `.env` 解析函数、增强错误提示、添加配置验证
  - `media-analyze-openai.py`: 重构为模块化结构、添加 emoji 图标、改进错误提示
  - 统一使用 `❌` `💡` `✓` `🔄` 等图标提升可读性
  - 所有脚本添加 `#requires -Version 5.1` 声明
- **v2.1** (2026-03-08): 明确旧 `.sh` / Gemini / Kimi 为兼容保留方案
- **v2.0** (2026-03-08): 正式切换到 Windows `.ps1` + `.env` + OpenAI 兼容主链路
- **v1.2** (2026-02-01): 添加 Kimi 分析选项
- **v1.1** (2026-01-30): 添加 Gemini 图像分析功能
- **v1.0** (2026-01-30): 初始版本，支持无 UI 全屏截图
