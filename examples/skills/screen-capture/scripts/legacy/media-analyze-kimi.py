#!/usr/bin/env python3
# media-analyze-kimi.py - 使用 Moonshot Kimi K2.5 分析单个媒体文件

import os
import sys
import json
import base64
import mimetypes
import tempfile
from pathlib import Path
from io import BytesIO

try:
    from openai import OpenAI
    from dotenv import load_dotenv
except ImportError:
    print("Error: 需要安装 openai 和 python-dotenv")
    print("请运行: pip3 install openai python-dotenv --break-system-packages")
    sys.exit(1)

# 尝试导入 PIL 用于图片压缩
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

def compress_image(input_path: Path, max_size_mb: float = 1.0) -> Path:
    """压缩图片到指定大小以下，返回临时文件路径"""
    file_size_mb = input_path.stat().st_size / (1024 * 1024)
    if file_size_mb <= max_size_mb:
        return input_path
    
    if not PIL_AVAILABLE:
        print(f"  ⚠️  PIL 不可用，使用原图 ({file_size_mb:.1f}MB)")
        return input_path
    
    print(f"  📐 原图 {file_size_mb:.1f}MB，正在压缩...")
    
    try:
        # 打开图片
        with Image.open(input_path) as img:
            # 转换为 RGB (JPEG 不支持透明)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # 计算缩放比例 (目标最大 1920 宽度)
            max_width = 1920
            if img.width > max_width:
                ratio = max_width / img.width
                new_size = (max_width, int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
            
            # 创建临时文件
            temp_file = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
            temp_path = Path(temp_file.name)
            temp_file.close()
            
            # 保存为 JPEG，质量 85%
            img.save(temp_path, 'JPEG', quality=85, optimize=True)
        
        compressed_size = temp_path.stat().st_size / (1024 * 1024)
        print(f"  ✅ 压缩后: {compressed_size:.1f}MB")
        return temp_path
    except Exception as e:
        print(f"  ⚠️  压缩失败，使用原图: {e}")
        return input_path

# 加载环境变量 - 尝试多个位置
script_dir = Path(__file__).parent.absolute()
env_paths = [
    script_dir / ".env",
    script_dir.parent / ".env",
    Path.home() / ".clawdbot" / ".env",
    Path("/home/vrboyzero/.clawdbot/.env"),
    Path("/home/vrboyzero/workspace/Belldandy/moltbot/.env"),
]

env_loaded = False
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        env_loaded = True
        break

if not env_loaded:
    print("Warning: 未找到 .env 文件，依赖已设置的环境变量")

# Configuration
API_KEY = os.getenv("MOONSHOT_API_KEY")
BASE_URL = "https://api.moonshot.cn/v1"
MODEL_NAME = "moonshot-v1-128k-vision-preview"

# Extensions
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'}
VIDEO_EXTS = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}

def encode_image(image_path: Path) -> str:
    """将图片编码为 base64"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def upload_file(client, file_path: Path) -> str:
    """上传文件到 Moonshot API 并返回 file_id"""
    print(f"  📤 正在上传文件: {file_path.name}...")
    try:
        file_object = client.files.create(
            file=open(file_path, "rb"),
            purpose="file-extract"
        )
        return file_object.id
    except Exception as e:
        print(f"  ❌ 上传失败: {e}")
        return None

def analyze_media(file_path: str, prompt: str):
    """分析单个媒体文件"""
    file_path = Path(file_path)
    
    if not API_KEY:
        print("Error: 未设置 MOONSHOT_API_KEY 环境变量")
        print("请在 .env 文件中设置: MOONSHOT_API_KEY=your_key_here")
        sys.exit(1)
    
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"
    
    ext = file_path.suffix.lower()
    is_image = ext in IMAGE_EXTS
    is_video = ext in VIDEO_EXTS
    
    if not is_image and not is_video:
        print(f"❌ 不支持的文件类型: {ext}")
        print(f"支持的图片: {', '.join(IMAGE_EXTS)}")
        print(f"支持的视频: {', '.join(VIDEO_EXTS)}")
        sys.exit(1)
    
    file_type = "图片" if is_image else "视频"
    print(f"📄 文件: {file_path.name}")
    print(f"📦 类型: {file_type} ({mime_type})")
    print("")
    
    # 构建消息
    messages = []
    
    system_prompt = (
        "你是 Kimi，一个强大的多模态助手。请分析提供的媒体文件。"
        "请返回一个纯 JSON 对象（不要使用 Markdown 代码块），包含以下字段："
        "1. 'description': 详细的视觉描述。"
        "2. 'tags': 一个包含 3-5 个相关标签或分类的列表。"
        "3. 'content': 提取的文本、关键信息或场景摘要。"
    )
    
    user_content = [{"type": "text", "text": prompt}]
    file_id = None
    
    temp_compressed = None
    try:
        if is_image:
            # 图片：先压缩，再使用 base64 嵌入
            print("  🖼️  正在处理图片...")
            file_to_encode = compress_image(file_path, max_size_mb=1.5)
            if file_to_encode != file_path:
                temp_compressed = file_to_encode
                mime_type = "image/jpeg"
            base64_image = encode_image(file_to_encode)
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{base64_image}"
                }
            })
        
        elif is_video:
            # 视频：先上传到文件服务
            print("  🎬 正在处理视频...")
            file_id = upload_file(client, file_path)
            if not file_id:
                print("  ❌ 视频上传失败，跳过分析")
                return
            # 添加 file_id 到系统消息
            messages.append({
                "role": "system",
                "content": f"file_id:{file_id}"
            })
        
        messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_content})
        
        print("  🤔 正在分析...")
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
        )
        
        response_content = completion.choices[0].message.content
        
        # 清理 JSON（去掉可能的 Markdown 代码块）
        clean_content = response_content.replace("```json", "").replace("```", "").strip()
        
        try:
            data = json.loads(clean_content)
            print("")
            print("=" * 50)
            print("📋 分析结果:")
            print("=" * 50)
            print(f"\n📝 描述:\n{data.get('description', 'N/A')}\n")
            print(f"🏷️  标签: {', '.join(data.get('tags', []))}")
            print(f"\n📑 内容:\n{data.get('content', 'N/A')}")
            print("=" * 50)
            return data
        except json.JSONDecodeError:
            print("")
            print("⚠️  JSON 解析失败，返回原始响应:")
            print("-" * 50)
            print(response_content)
            print("-" * 50)
    
    except Exception as e:
        print(f"\n❌ API 调用错误: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 清理临时压缩文件
        if temp_compressed and temp_compressed.exists():
            temp_compressed.unlink(missing_ok=True)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python media-analyze-kimi.py <file_path> [prompt]")
        sys.exit(1)
    
    file_path = sys.argv[1]
    prompt = sys.argv[2] if len(sys.argv) > 2 else "请详细描述这个媒体文件的内容"
    
    analyze_media(file_path, prompt)
