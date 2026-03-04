@echo off
setlocal

echo [Belldandy Launcher] Initialization...

REM 检查 Node.js 是否安装
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js v22 LTS from https://nodejs.org/
    pause
    exit /b 1
)

REM 检查 Node.js 版本兼容性（使用 node 自身来检查，避免 batch 解析问题）
node -e "const v=parseInt(process.version.slice(1));if(v<22){console.log('[ERROR] Node.js version too old: '+process.version);console.log('[ERROR] Belldandy requires Node.js v22 or higher.');console.log('[ERROR] Please download v22 LTS from https://nodejs.org/');process.exit(1)}if(v>=24){console.log('[WARNING] ============================================================');console.log('[WARNING] Node.js '+process.version+' is an unstable/preview version.');console.log('[WARNING] Native modules like better-sqlite3 may fail to install.');console.log('[WARNING] Strongly recommended: use Node.js v22 LTS instead.');console.log('[WARNING] ============================================================')}"
if %errorlevel% neq 0 (
    pause
    exit /b 1
)

REM 检查 pnpm
call pnpm -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found. Enabling via corepack...
    call corepack enable
    call corepack prepare pnpm@latest --activate
)

REM 安装依赖
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call corepack pnpm install
)

REM 检查所有 workspace 包是否已编译（任何一个 dist 缺失都需要构建）
if not exist "packages\belldandy-core\dist" goto :do_build
if not exist "packages\belldandy-agent\dist" goto :do_build
if not exist "packages\belldandy-channels\dist" goto :do_build
if not exist "packages\belldandy-skills\dist" goto :do_build
if not exist "packages\belldandy-memory\dist" goto :do_build
if not exist "packages\belldandy-protocol\dist" goto :do_build
goto :skip_build

:do_build
echo [INFO] Building project (compiling TypeScript...)
call corepack pnpm build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Please check the error above.
    pause
    exit /b 1
)
echo [INFO] Build complete.

:skip_build

REM Generate a one-time session token for WebChat access
set "SETUP_TOKEN=setup-%RANDOM%-%RANDOM%-%RANDOM%"
set "AUTO_OPEN_BROWSER=true"
set "BELLDANDY_AUTH_MODE=token"
set "BELLDANDY_AUTH_TOKEN=%SETUP_TOKEN%"

REM NOTE: We do NOT pre-load .env.local here.
REM The Gateway reads .env / .env.local directly on startup and applies them
REM with correct quote-stripping, which always takes precedence over shell env vars.

:main_loop
echo.
echo [Belldandy Launcher] Starting Gateway...
echo [Belldandy Launcher] WebChat: http://localhost:28889
echo.

call corepack pnpm dev:gateway

if %errorlevel% equ 100 (
    echo.
    echo [Belldandy Launcher] Restarting...
    timeout /t 2 >nul
    goto main_loop
)

echo.
echo [Belldandy Launcher] Gateway exited (code %errorlevel%).
pause
