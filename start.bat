@echo off
setlocal

echo [Belldandy Launcher] Initialization...

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js v22+ from https://nodejs.org/
    pause
    exit /b 1
)

call pnpm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found. Enabling via corepack...
    call corepack enable
    call corepack prepare pnpm@latest --activate
)

if not exist node_modules (
    echo [INFO] Installing dependencies...
    call corepack pnpm install
)

REM 首次使用时自动构建（编译 TypeScript → dist/）
if not exist "packages\belldandy-core\dist" (
    echo [INFO] Building project for first time...
    call corepack pnpm build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed. Please check the error above.
        pause
        exit /b 1
    )
)

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
