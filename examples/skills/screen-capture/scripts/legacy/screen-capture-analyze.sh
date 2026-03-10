#!/bin/bash
# screen-capture-analyze.sh - 截图并直接分析

OUTPUT_DIR="/mnt/c/Users/admin/Pictures/Screenshots"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="screenshot_${TIMESTAMP}.png"
WIN_OUTPUT_DIR="C:/Users/admin/Pictures/Screenshots"

mkdir -p "$OUTPUT_DIR"

echo "📸 正在截图..."

# PowerShell 截图
cd /mnt/c
powershell.exe -Command "
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
"

FULL_PATH="${OUTPUT_DIR}/${FILENAME}"
echo ""
echo "文件: $FULL_PATH"
echo "MEDIA: $FULL_PATH"
echo ""

# 分析截图内容
echo "🔍 正在分析截图内容..."

# 获取分析提示词（从参数传入或使用默认）
ANALYZE_PROMPT="${1:-请详细描述这张屏幕截图的内容，包括所有可见的窗口、界面元素和文字}"
echo "分析提示: $ANALYZE_PROMPT"
echo ""

# 压缩图片（Gemini 有大小限制）
convert "$FULL_PATH" -resize 50% -quality 85 "/tmp/analyze_${TIMESTAMP}.jpg" 2>/dev/null || \
  cp "$FULL_PATH" "/tmp/analyze_${TIMESTAMP}.png"

# 将提示词写入临时文件（避免 heredoc 中的引号问题）
echo "$ANALYZE_PROMPT" > "/tmp/analyze_prompt_${TIMESTAMP}.txt"

# 调用 Gemini API 分析
python3 << PYTHON
import base64
import json
import urllib.request
import os

# 读取提示词
with open("/tmp/analyze_${TIMESTAMP}.txt", "r") as f:
    analyze_prompt = f.read().strip()

# 读取图片
img_path = "/tmp/analyze_${TIMESTAMP}.jpg" if os.path.exists("/tmp/analyze_${TIMESTAMP}.jpg") else "/tmp/analyze_${TIMESTAMP}.png"
with open(img_path, "rb") as f:
    img_data = base64.b64encode(f.read()).decode('utf-8')

# API 调用
api_key = "AIzaSyDQ31naXJfe5lnGZfpYklrkIh3CH52hZJM"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

# 构建请求
data = {
    "contents": [{
        "parts": [
            {"text": analyze_prompt},
            {"inlineData": {"mimeType": "image/jpeg", "data": img_data}}
        ]
    }]
}

try:
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    with urllib.request.urlopen(req, timeout=60) as response:
        result = json.loads(response.read().decode('utf-8'))
        if 'candidates' in result and len(result['candidates']) > 0:
            text = result['candidates'][0]['content']['parts'][0]['text']
            print("\n📋 分析结果:\n")
            print(text)
        else:
            print("分析结果为空")
            print(json.dumps(result, indent=2))
except Exception as e:
    print(f"分析失败: {e}")
PYTHON

# 清理临时文件
rm -f "/tmp/analyze_${TIMESTAMP}.txt" "/tmp/analyze_${TIMESTAMP}.jpg" "/tmp/analyze_${TIMESTAMP}.png" 2>/dev/null

echo ""
echo "✅ 完成！"
