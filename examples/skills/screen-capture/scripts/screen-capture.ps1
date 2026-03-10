#requires -Version 5.1
<#
.SYNOPSIS
    屏幕截图工具 - Windows 正式版
.DESCRIPTION
    使用 PowerShell + .NET 捕获屏幕，支持多显示器
.PARAMETER OutputDir
    截图保存目录，默认为 C:\Users\admin\Pictures\Screenshots
.PARAMETER Name
    自定义文件名，默认为 screenshot_时间戳.png
.PARAMETER MultiMonitor
    是否捕获所有显示器，默认为 true
.EXAMPLE
    .\screen-capture.ps1
    .\screen-capture.ps1 -Name "myshot.png" -MultiMonitor:$false
#>
param(
    [string]$OutputDir = 'C:\Users\admin\Pictures\Screenshots',
    [string]$Name = '',
    [switch]$MultiMonitor = $true
)

# 错误处理：严格模式
$ErrorActionPreference = 'Stop'

# 加载依赖
Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
Add-Type -AssemblyName System.Drawing -ErrorAction Stop

# 创建输出目录
if (!(Test-Path $OutputDir)) {
    try {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }
    catch {
        Write-Error "无法创建输出目录 '$OutputDir': $_"
        exit 1
    }
}

# 生成文件名
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
if ([string]::IsNullOrWhiteSpace($Name)) {
    $Name = "screenshot_$timestamp.png"
}

# 确保文件名有 .png 后缀
if (-not $Name.EndsWith('.png', [System.StringComparison]::OrdinalIgnoreCase)) {
    $Name = "$Name.png"
}

$filePath = Join-Path $OutputDir $Name

# 确定截图区域
if ($MultiMonitor) {
    $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
}
else {
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
}

# 验证屏幕区域有效
if ($screen.Width -le 0 -or $screen.Height -le 0) {
    Write-Error "无法获取有效的屏幕区域 (Width=$($screen.Width), Height=$($screen.Height))"
    exit 1
}

# 执行截图
$bitmap = $null
$graphics = $null

try {
    $bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($screen.Left, $screen.Top, 0, 0, $bitmap.Size)
    $bitmap.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # 验证文件已创建
    if (Test-Path $filePath) {
        $fileSize = (Get-Item $filePath).Length
        Write-Output $filePath
    }
    else {
        Write-Error "截图保存失败: 文件未创建"
        exit 1
    }
}
catch {
    Write-Error "截图失败: $_"
    exit 1
}
finally {
    # 确保资源释放
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
}
