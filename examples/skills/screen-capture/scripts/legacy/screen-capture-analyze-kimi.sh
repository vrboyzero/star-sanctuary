#!/bin/bash
# screen-capture-analyze-kimi.sh - 截图并使用 Moonshot Kimi K2.5 分析
# 支持图片分析，也可用于分析已有图片/视频文件

# 保存脚本所在目录（必须在任何 cd 之前）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

OUTPUT_DIR="/mnt/c/Users/admin/Pictures/Screenshots"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="screenshot_${TIMESTAMP}.png"
WIN_OUTPUT_DIR="C:/Users/admin/Pictures/Screenshots"

# 检查是否传入文件路径（分析已有文件）或执行截图
ANALYZE_FILE="${1:-}"
ANALYZE_PROMPT="${2:-请详细描述这张屏幕截图的内容，包括所有可见的窗口、界面元素和文字}"

# 如果没有传入文件路径，执行截图
if [ -z "$ANALYZE_FILE" ]; then
    echo "📸 正在截图..."
    
    mkdir -p "$OUTPUT_DIR"
    
    # 使用 subshell 执行 PowerShell，避免改变当前目录
    (cd /mnt/c && powershell.exe -Command "
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
\$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
\$bitmap = New-Object System.Drawing.Bitmap(\$screen.Width, \$screen.Height)
\$graphics = [System.Drawing.Graphics]::FromImage(\$bitmap)
\$graphics.CopyFromScreen(\$screen.Location, [System.Drawing.Point]::Empty, \$screen.Size)
\$filepath = \"${WIN_OUTPUT_DIR}\\${FILENAME}\"
\$bitmap.Save(\$filepath, [System.Drawing.Imaging.ImageFormat]::Png)
\$graphics.Dispose()
\$bitmap.Dispose()
Write-Host \"✅ 截图已保存\"
")
    
    FULL_PATH="${OUTPUT_DIR}/${FILENAME}"
    echo ""
    echo "文件: $FULL_PATH"
    echo "MEDIA: $FULL_PATH"
    echo ""
else
    # 分析已有文件
    FULL_PATH="$ANALYZE_FILE"
    echo "📁 分析文件: $FULL_PATH"
    
    # 转换为 WSL 路径（如果是 Windows 路径）
    if [[ "$FULL_PATH" =~ ^[A-Za-z]: ]]; then
        # 转换 Windows 路径为 WSL 路径
        DRIVE=$(echo "$FULL_PATH" | cut -d: -f1 | tr '[:upper:]' '[:lower:]')
        PATH_PART=$(echo "$FULL_PATH" | cut -d: -f2- | sed 's/\\/\//g')
        FULL_PATH="/mnt/${DRIVE}${PATH_PART}"
    fi
    
    if [ ! -f "$FULL_PATH" ]; then
        echo "❌ 文件不存在: $FULL_PATH"
        exit 1
    fi
fi

# 分析内容
echo "🔍 正在使用 Kimi K2.5 分析..."
echo "分析提示: $ANALYZE_PROMPT"
echo ""

# 调用 Python 脚本进行分析 (使用 -u 强制无缓冲输出)
python3 -u "${SCRIPT_DIR}/media-analyze-kimi.py" "$FULL_PATH" "$ANALYZE_PROMPT"

echo ""
echo "✅ 完成！"
