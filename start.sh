#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"
PARENT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${STAR_SANCTUARY_RUNTIME_MODE:-}" ]]; then
    export STAR_SANCTUARY_RUNTIME_MODE="${BELLDANDY_RUNTIME_MODE:-source}"
fi
if [[ -z "${BELLDANDY_RUNTIME_MODE:-}" ]]; then
    export BELLDANDY_RUNTIME_MODE="${STAR_SANCTUARY_RUNTIME_MODE}"
fi
if [[ -z "${STAR_SANCTUARY_RUNTIME_DIR:-}" ]]; then
    export STAR_SANCTUARY_RUNTIME_DIR="${BELLDANDY_RUNTIME_DIR:-${SCRIPT_DIR}}"
fi
if [[ -z "${BELLDANDY_RUNTIME_DIR:-}" ]]; then
    export BELLDANDY_RUNTIME_DIR="${STAR_SANCTUARY_RUNTIME_DIR}"
fi
if [[ -z "${STAR_SANCTUARY_ENV_DIR:-}" ]]; then
    if [[ -n "${BELLDANDY_ENV_DIR:-}" ]]; then
        export STAR_SANCTUARY_ENV_DIR="${BELLDANDY_ENV_DIR}"
    elif [[ -f "${PARENT_DIR}/install-info.json" ]]; then
        export STAR_SANCTUARY_ENV_DIR="${PARENT_DIR}"
    fi
fi
if [[ -z "${BELLDANDY_ENV_DIR:-}" && -n "${STAR_SANCTUARY_ENV_DIR:-}" ]]; then
    export BELLDANDY_ENV_DIR="${STAR_SANCTUARY_ENV_DIR}"
fi

echo "[Star Sanctuary Launcher] Initialization..."

# Check Node
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Please install Node.js v22 LTS"
    exit 1
fi

# 检查 Node.js 版本兼容性（使用 node 自身来检查，避免 shell 文本解析差异）
node -e 'const v=parseInt(process.version.slice(1),10);if(v<22){console.log("[ERROR] Node.js version too old: "+process.version);console.log("[ERROR] Star Sanctuary requires Node.js v22 or higher.");console.log("[ERROR] Please download v22 LTS from https://nodejs.org/");process.exit(1)}if(v>=24){console.log("[WARNING] ============================================================");console.log("[WARNING] Node.js "+process.version+" is an unstable/preview version.");console.log("[WARNING] Native modules like better-sqlite3 may fail to install.");console.log("[WARNING] Strongly recommended: use Node.js v22 LTS instead.");console.log("[WARNING] ============================================================")}'

# Check PNPM
if ! command -v pnpm &> /dev/null; then
    echo "[INFO] pnpm not found. Enabling via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi

# A copied or stale node_modules directory may exist without usable workspace binaries.
NEED_INSTALL=0
[ ! -d "node_modules" ] && NEED_INSTALL=1

if [ "$NEED_INSTALL" -eq 0 ] && ! corepack pnpm exec tsc -v >/dev/null 2>&1; then
    NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" -eq 0 ] && ! corepack pnpm exec tsx --version >/dev/null 2>&1; then
    NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" -eq 1 ]; then
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
    echo "[INFO] Build complete."
fi

# Let the Gateway decide whether a temporary setup token is needed.
export AUTO_OPEN_BROWSER="true"

# NOTE: We do NOT manually open the browser here.
# The Gateway handles AUTO_OPEN_BROWSER internally (same as start.bat).
# Opening it separately would cause two windows.

# NOTE: We do NOT pre-load .env.local here.
# The Gateway reads .env / .env.local directly on startup with correct
# quote-stripping, while explicit shell env vars still keep higher priority.

while true; do
    echo ""
    echo "[Star Sanctuary Launcher] Starting Gateway..."
    echo "[Star Sanctuary Launcher] WebChat: http://localhost:28889"
    echo ""

    set +e
    corepack pnpm dev:gateway
    EXIT_CODE=$?
    set -e

    if [ $EXIT_CODE -eq 100 ]; then
        echo ""
        echo "[Star Sanctuary Launcher] Restarting..."
        sleep 2
    else
        echo ""
        echo "[Star Sanctuary Launcher] Gateway exited (code $EXIT_CODE)."
        break
    fi
done
