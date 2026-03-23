#!/usr/bin/env python3
"""
屏幕截图 AI 分析模块 - OpenAI 兼容接口
支持 Moonshot、Kimi 等 OpenAI 兼容服务
"""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional, Tuple

# 依赖检查
try:
    from openai import OpenAI, APIError, AuthenticationError
    from dotenv import load_dotenv
    from PIL import Image
except ImportError as e:
    print(f"❌ 错误: 缺少必要依赖 {e}")
    print("💡 请安装依赖: pip install openai python-dotenv pillow")
    print("   或使用: pip install -r requirements.txt")
    sys.exit(1)


def load_env() -> Optional[Path]:
    """
    加载 .env 配置文件
    按优先级搜索: 当前目录 > 父目录 > ~/.star_sanctuary/
    
    Returns:
        加载成功的文件路径，或 None（使用系统环境变量）
    """
    candidates = [
        Path(__file__).with_name('.env'),
        Path(__file__).parent.parent / '.env',
        Path.home() / '.star_sanctuary' / '.env',
    ]
    
    for path in candidates:
        if path.exists():
            load_dotenv(path)
            return path
    
    # 最后尝试从系统环境加载
    load_dotenv()
    return None


def validate_env() -> Tuple[str, Optional[str], str]:
    """
    验证必要的环境变量
    
    Returns:
        (api_key, base_url, model)
    
    Raises:
        SystemExit: 缺少必要配置时退出
    """
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("❌ 错误: 未设置 OPENAI_API_KEY")
        print("💡 请检查:")
        print("   1. .env 文件是否存在且包含 OPENAI_API_KEY")
        print("   2. 环境变量是否正确加载")
        print(f"   3. 搜索路径: {Path(__file__).parent}, {Path(__file__).parent.parent}, ~/.star_sanctuary/")
        sys.exit(1)
    
    base_url = os.getenv('OPENAI_BASE_URL')
    model = os.getenv('OPENAI_VISION_MODEL', 'gpt-4.1-mini')
    
    return api_key, base_url, model


def compress_if_needed(
    image_path: Path, 
    max_size_mb: float = 1.5,
    max_width: int = 1920
) -> Tuple[Path, str]:
    """
    如果图片过大，进行压缩处理
    
    Args:
        image_path: 原始图片路径
        max_size_mb: 最大文件大小（MB）
        max_width: 最大宽度（像素）
    
    Returns:
        (实际使用的图片路径, MIME类型)
    """
    mime_type, _ = mimetypes.guess_type(str(image_path))
    if not mime_type:
        mime_type = 'image/png'
    
    size_mb = image_path.stat().st_size / (1024 * 1024)
    
    # 如果文件不大且尺寸合适，直接使用原图
    if size_mb <= max_size_mb:
        return image_path, mime_type
    
    print(f"🔄 图片较大 ({size_mb:.1f}MB)，正在进行压缩...")
    
    try:
        with Image.open(image_path) as img:
            # 转换颜色模式
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # 调整尺寸
            if img.width > max_width:
                ratio = max_width / img.width
                new_size = (max_width, int(img.height * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)
                print(f"   尺寸调整: {img.width}x{img.height}")
            
            # 保存为临时 JPEG
            tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
            tmp_path = Path(tmp.name)
            tmp.close()
            
            img.save(tmp_path, 'JPEG', quality=85, optimize=True)
            
            new_size_mb = tmp_path.stat().st_size / (1024 * 1024)
            print(f"   压缩后: {new_size_mb:.1f}MB")
            
            return tmp_path, 'image/jpeg'
    
    except Exception as e:
        print(f"⚠️ 压缩失败，使用原图: {e}")
        return image_path, mime_type


def analyze_image(
    client: OpenAI,
    image_path: Path,
    mime_type: str,
    prompt: str,
    model: str
) -> dict:
    """
    调用 OpenAI API 分析图片
    
    Args:
        client: OpenAI 客户端实例
        image_path: 图片路径
        mime_type: MIME 类型
        prompt: 分析提示词
        model: 模型名称
    
    Returns:
        API 返回的解析结果
    
    Raises:
        APIError: API 调用失败
    """
    # 编码图片
    encoded = base64.b64encode(image_path.read_bytes()).decode('utf-8')
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    'role': 'system',
                    'content': '你是一个图像分析助手。请输出纯 JSON，对象包含 description、tags、content 三个字段。'
                },
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': prompt},
                        {'type': 'image_url', 'image_url': {'url': f'data:{mime_type};base64,{encoded}'}}
                    ]
                }
            ]
        )
        
        text = response.choices[0].message.content or '{}'
        
        # 清理可能的 markdown 代码块
        cleaned = text.replace('```json', '').replace('```', '').strip()
        
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            # 如果不是 JSON，包装成标准格式
            return {
                'description': cleaned,
                'tags': [],
                'content': cleaned
            }
    
    except AuthenticationError as e:
        print(f"❌ API 认证失败: {e}")
        print("💡 请检查 OPENAI_API_KEY 是否正确")
        raise
    
    except APIError as e:
        print(f"❌ API 调用失败: {e}")
        raise


def main() -> int:
    """主入口函数"""
    # 参数检查
    if len(sys.argv) < 2:
        print("用法: media-analyze-openai.py <图片路径> [提示词]")
        print("示例:")
        print(f"  python {sys.argv[0]} screenshot.png")
        print(f"  python {sys.argv[0]} screenshot.png '找出图中的错误信息'")
        return 1
    
    image_path = Path(sys.argv[1])
    prompt = sys.argv[2] if len(sys.argv) > 2 else '请详细描述这张图片的内容。'
    
    # 加载环境配置
    env_path = load_env()
    if env_path:
        print(f"✓ 已加载配置: {env_path}")
    
    # 验证环境变量
    api_key, base_url, model = validate_env()
    
    print(f"📷 分析图片: {image_path}")
    print(f"🤖 使用模型: {model}")
    if base_url:
        print(f"🔗 API 地址: {base_url}")
    
    # 检查文件
    if not image_path.exists():
        print(f"❌ 错误: 文件不存在: {image_path}")
        return 1
    
    # 初始化客户端
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
    except Exception as e:
        print(f"❌ 初始化 OpenAI 客户端失败: {e}")
        return 1
    
    # 压缩图片（如需要）
    actual_path: Optional[Path] = None
    try:
        actual_path, mime_type = compress_if_needed(image_path)
        
        # 调用 API
        result = analyze_image(client, actual_path, mime_type, prompt, model)
        
        # 输出结果
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    
    except Exception as e:
        print(f"❌ 分析失败: {e}")
        return 1
    
    finally:
        # 清理临时文件
        if actual_path and actual_path != image_path and actual_path.exists():
            actual_path.unlink(missing_ok=True)


if __name__ == '__main__':
    sys.exit(main())
