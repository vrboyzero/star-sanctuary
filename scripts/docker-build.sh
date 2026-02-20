#!/bin/bash
set -euo pipefail

# ========================================
# Belldandy Docker 镜像构建脚本
# ========================================

VERSION=${1:-local}
IMAGE_NAME="belldandy:${VERSION}"

echo "========================================="
echo "Building Belldandy Docker image"
echo "========================================="
echo "Image: ${IMAGE_NAME}"
echo "Build context: $(pwd)"
echo ""

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed"
  exit 1
fi

# 检查 Dockerfile 是否存在
if [ ! -f "Dockerfile" ]; then
  echo "Error: Dockerfile not found in current directory"
  exit 1
fi

# 构建镜像（使用 BuildKit 加速）
echo "Building image..."
DOCKER_BUILDKIT=1 docker build \
  --target runtime \
  --tag "${IMAGE_NAME}" \
  --progress=plain \
  .

echo ""
echo "========================================="
echo "Build complete!"
echo "========================================="
echo "Image: ${IMAGE_NAME}"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and configure it"
echo "  2. Run: docker-compose up -d"
echo "  3. Check logs: docker-compose logs -f belldandy-gateway"
echo ""
