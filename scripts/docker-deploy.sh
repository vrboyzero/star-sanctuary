#!/bin/bash
set -euo pipefail

# ========================================
# Belldandy Docker 一键部署脚本
# ========================================

echo "========================================="
echo "Belldandy Docker Deployment"
echo "========================================="
echo ""

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
  echo "Error: Docker is not installed"
  exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo "Error: Docker Compose is not installed"
  exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "Error: .env file not found"
  echo ""
  echo "Please create .env file:"
  echo "  1. Copy template: cp .env.example .env"
  echo "  2. Edit configuration: nano .env"
  echo "  3. Set required variables:"
  echo "     - BELLDANDY_AUTH_TOKEN"
  echo "     - BELLDANDY_OPENAI_API_KEY"
  echo "     - BELLDANDY_OPENAI_MODEL"
  echo ""
  exit 1
fi

# 加载环境变量
source .env

# 检查必需的环境变量
MISSING_VARS=()

if [ -z "${BELLDANDY_AUTH_TOKEN:-}" ]; then
  MISSING_VARS+=("BELLDANDY_AUTH_TOKEN")
fi

if [ "${BELLDANDY_AGENT_PROVIDER:-openai}" = "openai" ]; then
  if [ -z "${BELLDANDY_OPENAI_API_KEY:-}" ]; then
    MISSING_VARS+=("BELLDANDY_OPENAI_API_KEY")
  fi
  if [ -z "${BELLDANDY_OPENAI_MODEL:-}" ]; then
    MISSING_VARS+=("BELLDANDY_OPENAI_MODEL")
  fi
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "Error: Missing required environment variables:"
  for var in "${MISSING_VARS[@]}"; do
    echo "  - $var"
  done
  echo ""
  echo "Please edit .env file and set these variables"
  exit 1
fi

# 检查镜像是否存在
IMAGE_NAME="${BELLDANDY_IMAGE:-belldandy:local}"
if ! docker image inspect "$IMAGE_NAME" &> /dev/null; then
  echo "Image $IMAGE_NAME not found. Building..."
  ./scripts/docker-build.sh
  echo ""
fi

# 启动服务
echo "Starting Belldandy Gateway..."
docker-compose up -d belldandy-gateway

# 等待健康检查
echo ""
echo "Waiting for Gateway to be healthy..."
TIMEOUT=60
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if docker-compose ps | grep -q "healthy"; then
    echo ""
    echo "========================================="
    echo "Belldandy Gateway is running!"
    echo "========================================="
    echo ""
    echo "Access WebChat at:"
    echo "  http://localhost:${BELLDANDY_GATEWAY_PORT:-28889}"
    echo ""
    echo "Useful commands:"
    echo "  - View logs: docker-compose logs -f belldandy-gateway"
    echo "  - Stop: docker-compose down"
    echo "  - Restart: docker-compose restart belldandy-gateway"
    echo "  - CLI: docker-compose run --rm belldandy-cli --help"
    echo ""
    exit 0
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
  echo -n "."
done

echo ""
echo "Warning: Gateway did not become healthy within ${TIMEOUT}s"
echo "Check logs: docker-compose logs belldandy-gateway"
exit 1
