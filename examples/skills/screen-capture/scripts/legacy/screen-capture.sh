#!/bin/bash
# screen-capture.sh - Windows 屏幕截图脚本

# 默认配置
DEFAULT_OUTPUT_DIR="/mnt/c/Users/admin/Pictures/Screenshots"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="screenshot_${TIMESTAMP}.png"

# 解析参数
OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}"
CUSTOM_NAME=""
ANALYZE=false
ANALYZE_PROMPT="描述这张屏幕截图的内容"

while [[ $# -gt 0 ]]; do
  case $1 in
    --output|-o)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --name|-n)
      CUSTOM_NAME="$2"
      shift 2
      ;;
    --analyze|-a)
      ANALYZE=true
      if [[ -n "$2" && ! "$2" =~ ^-- ]]; then
        ANALYZE_PROMPT="$2"
        shift 2
      else
        shift 1
      fi
      ;;
    --help|-h)
      echo "用法: screen-capture.sh [选项]"
      echo ""
      echo "选项:"
      echo "  -o, --output <目录>    指定输出目录 (默认: C:\Users\admin\Pictures\Screenshots)"
      echo "  -n, --name <文件名>    指定文件名 (默认: screenshot_时间戳.png)"
      echo "  -a, --analyze [提示]   截图后分析内容"
      echo "  -h, --help             显示帮助"
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      exit 1
      ;;
  esac
done

# 设置最终文件名
if [[ -n "$CUSTOM_NAME" ]]; then
  FILENAME="$CUSTOM_NAME"
fi

# 转换 WSL 路径到 Windows 路径
if [[ "$OUTPUT_DIR" == /mnt/c/* ]]; then
  WIN_OUTPUT_DIR="C:${OUTPUT_DIR#/mnt/c}"
else
  WIN_OUTPUT_DIR="$OUTPUT_DIR"
fi

# 确保目录存在
mkdir -p "$OUTPUT_DIR"

echo "📸 正在截图..."

# 执行 PowerShell 截图
cd /mnt/c
powershell.exe -Command "
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# 获取屏幕尺寸
\$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
Write-Host \"屏幕分辨率: \$(\$screen.Width) x \$(\$screen.Height)\" -ForegroundColor Cyan

# 创建位图
\$bitmap = New-Object System.Drawing.Bitmap(\$screen.Width, \$screen.Height)
\$graphics = [System.Drawing.Graphics]::FromImage(\$bitmap)

# 复制屏幕
\$graphics.CopyFromScreen(\$screen.Location, [System.Drawing.Point]::Empty, \$screen.Size)

# 保存文件
\$filepath = \"${WIN_OUTPUT_DIR}\\${FILENAME}\"
\$bitmap.Save(\$filepath, [System.Drawing.Imaging.ImageFormat]::Png)

# 清理
\$graphics.Dispose()
\$bitmap.Dispose()

Write-Host \"✅ 截图已保存: \$filepath\" -ForegroundColor Green
"

if [[ $? -eq 0 ]]; then
  FULL_PATH="${OUTPUT_DIR}/${FILENAME}"
  echo ""
  echo "文件路径: $FULL_PATH"
  ls -lh "$FULL_PATH" 2>/dev/null | awk '{print "文件大小: " $5}'
  
  # 告诉 Clawdbot：这是一张要附加到对话里的图片
  echo "MEDIA: $FULL_PATH"

  if [[ "$ANALYZE" == true ]]; then
    echo ""
    echo "🔍 正在分析截图内容..."
    echo "提示: $ANALYZE_PROMPT"
    # 这里可以调用图像分析工具
    # clawdbot image "$FULL_PATH" "$ANALYZE_PROMPT"
  fi
else
  echo "❌ 截图失败"
  exit 1
fi
