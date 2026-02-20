#!/bin/bash
set -e

echo "========================================="
echo "Testing Docker Build"
echo "========================================="
echo ""

# 检查必需文件
echo "Checking required files..."
FILES=(
  "Dockerfile"
  ".dockerignore"
  "docker-compose.yml"
  ".env.example"
  "package.json"
  "pnpm-lock.yaml"
  "pnpm-workspace.yaml"
)

for file in "${FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing: $file"
    exit 1
  fi
  echo "✓ Found: $file"
done

echo ""
echo "All required files present!"
echo ""
echo "To build and test:"
echo "  1. ./scripts/docker-build.sh"
echo "  2. cp .env.example .env"
echo "  3. Edit .env and set required variables"
echo "  4. ./scripts/docker-deploy.sh"
echo ""
