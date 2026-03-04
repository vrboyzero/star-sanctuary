#!/bin/bash

echo "[Belldandy Launcher] Initialization..."

# Check Node
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js v22+"
    exit 1
fi

# Check PNPM
if ! command -v pnpm &> /dev/null; then
    echo "[INFO] pnpm not found. Enabling via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi

# Install Dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing dependencies..."
    corepack pnpm install
fi

# 检查所有 workspace 包是否已编译（任何一个 dist 缺失都需要构建）
NEED_BUILD=0
[ ! -d "packages/belldandy-core/dist" ] && NEED_BUILD=1
[ ! -d "packages/belldandy-agent/dist" ] && NEED_BUILD=1
[ ! -d "packages/belldandy-channels/dist" ] && NEED_BUILD=1
[ ! -d "packages/belldandy-skills/dist" ] && NEED_BUILD=1
[ ! -d "packages/belldandy-memory/dist" ] && NEED_BUILD=1
[ ! -d "packages/belldandy-protocol/dist" ] && NEED_BUILD=1

if [ "$NEED_BUILD" -eq 1 ]; then
    echo "[INFO] Building project (compiling TypeScript...)"
    corepack pnpm build
    if [ $? -ne 0 ]; then
        echo "[ERROR] Build failed. Please check the error above."
        exit 1
    fi
fi

# Generate Session Token
export SETUP_TOKEN="setup-$(date +%s)-${RANDOM}"
export AUTO_OPEN_BROWSER="true"
export BELLDANDY_AUTH_MODE="token"
export BELLDANDY_AUTH_TOKEN="$SETUP_TOKEN"

# NOTE: We do NOT manually open the browser here.
# The Gateway handles AUTO_OPEN_BROWSER internally (same as start.bat).
# Opening it separately would cause two windows.

# NOTE: We do NOT pre-load .env.local here.
# The Gateway reads .env / .env.local directly on startup with correct quote-stripping,
# which always takes precedence over shell env vars.

while true; do
    echo ""
    echo "[Belldandy Launcher] Starting Gateway..."
    echo "[Belldandy Launcher] WebChat: http://localhost:28889"
    echo ""

    corepack pnpm dev:gateway
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 100 ]; then
        echo ""
        echo "[Belldandy Launcher] Restarting..."
        sleep 2
    else
        echo ""
        echo "[Belldandy Launcher] Gateway exited (code $EXIT_CODE)."
        break
    fi
done
