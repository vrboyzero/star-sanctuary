#requires -Version 5.1
<#
.SYNOPSIS
    屏幕截图 + AI 分析工具 - Windows 正式版
.DESCRIPTION
    先截图，然后调用 OpenAI 兼容接口进行图像分析
.PARAMETER InputPath
    输入图片路径，为空则自动截图
.PARAMETER Prompt
    AI 分析提示词
.PARAMETER OutputDir
    截图保存目录
.PARAMETER EnvFile
    .env 配置文件路径
.EXAMPLE
    .\screen-capture-analyze.ps1
    .\screen-capture-analyze.ps1 -Prompt "找出图中的错误信息"
#>
param(
    [string]$InputPath = '',
    [string]$Prompt = '请详细描述这张屏幕截图的内容，包括所有可见窗口、界面元素和文字',
    [string]$OutputDir = 'C:\Users\admin\Pictures\Screenshots',
    [string]$EnvFile = 'C:\Users\admin\.belldandy\.env'
)

$ErrorActionPreference = 'Stop'

#region 函数定义

<#
.SYNOPSIS
    安全地加载 .env 文件
.DESCRIPTION
    解析 .env 文件并设置环境变量，支持引号值和注释
.PARAMETER Path
    .env 文件路径
.OUTPUTS
    加载的键名列表（用于调试）
#>
function Import-DotEnvFile {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $loadedKeys = @()

    # 检查文件存在性
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "EnvFile 路径不能为空"
    }

    $envPath = Resolve-Path -Path $Path -ErrorAction SilentlyContinue
    if (!$envPath -or !(Test-Path $envPath)) {
        throw ".env 文件不存在: $Path`n请检查文件路径，或创建该文件并添加必要配置。"
    }

    # 解析文件
    $lineNum = 0
    Get-Content -Path $envPath | ForEach-Object {
        $lineNum++
        $line = $_.Trim()

        # 跳过空行和注释
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            return
        }

        # 解析 KEY=VALUE
        $eqIndex = $line.IndexOf('=')
        if ($eqIndex -lt 0) {
            Write-Warning "第 $lineNum 行格式错误（缺少等号）: $line"
            return
        }

        $key = $line.Substring(0, $eqIndex).Trim()
        $value = $line.Substring($eqIndex + 1).Trim()

        # 去除引号
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or 
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            if ($value.Length -ge 2) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        if ([string]::IsNullOrWhiteSpace($key)) {
            Write-Warning "第 $lineNum 行键名为空"
            return
        }

        # 设置环境变量
        [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
        $loadedKeys += $key
    }

    return $loadedKeys
}

<#
.SYNOPSIS
    检查必要的环境变量
#>
function Test-RequiredEnvVars {
    param(
        [string[]]$Required = @('OPENAI_API_KEY')
    )

    $missing = @()
    foreach ($var in $Required) {
        $value = [System.Environment]::GetEnvironmentVariable($var, 'Process')
        if ([string]::IsNullOrWhiteSpace($value)) {
            $missing += $var
        }
    }

    if ($missing.Count -gt 0) {
        $msg = "缺少必要的环境变量: $($missing -join ', ')`n"
        $msg += "请检查 .env 文件是否包含这些配置。"
        throw $msg
    }
}

#endregion

# 定位脚本路径
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$captureScript = Join-Path $scriptDir 'screen-capture.ps1'
$analyzerScript = Join-Path $scriptDir 'media-analyze-openai.py'

# 检查依赖脚本存在
if (!(Test-Path $captureScript)) {
    Write-Error "找不到截图脚本: $captureScript"
    exit 1
}
if (!(Test-Path $analyzerScript)) {
    Write-Error "找不到分析脚本: $analyzerScript"
    exit 1
}

# 加载 .env 配置
try {
    $loaded = Import-DotEnvFile -Path $EnvFile
    if ($loaded.Count -eq 0) {
        Write-Warning "从 $EnvFile 加载了 0 个配置项，请检查文件内容"
    }
}
catch {
    Write-Error $_
    exit 1
}

# 检查必要环境变量
try {
    Test-RequiredEnvVars
}
catch {
    Write-Error $_
    exit 1
}

# 如果没有输入路径，先截图
if ([string]::IsNullOrWhiteSpace($InputPath)) {
    try {
        $InputPath = powershell -ExecutionPolicy Bypass -File $captureScript -OutputDir $OutputDir
        $InputPath = $InputPath.Trim()
    }
    catch {
        Write-Error "截图失败: $_"
        exit 1
    }
}

# 验证输入文件
if ([string]::IsNullOrWhiteSpace($InputPath)) {
    Write-Error "截图失败: 未返回文件路径"
    exit 1
}

if (!(Test-Path $InputPath)) {
    Write-Error "文件不存在: $InputPath"
    exit 1
}

# 输出媒体路径（供上游使用）
Write-Output "MEDIA: $InputPath"

# 调用 Python 分析
try {
    $pythonOutput = python $analyzerScript $InputPath $Prompt 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Error "AI 分析失败 (exit code: $exitCode)`n$pythonOutput"
        exit 1
    }

    Write-Output $pythonOutput
}
catch {
    Write-Error "调用分析脚本失败: $_"
    exit 1
}
