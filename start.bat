@echo off
setlocal

echo [Star Sanctuary Launcher] Initialization...

REM Check whether Node.js is installed.
node -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js v22 LTS from https://nodejs.org/
    pause
    exit /b 1
)

REM Check Node.js version compatibility using Node itself to avoid batch parsing issues.
node -e "const v=parseInt(process.version.slice(1));if(v<22){console.log('[ERROR] Node.js version too old: '+process.version);console.log('[ERROR] Star Sanctuary requires Node.js v22 or higher.');console.log('[ERROR] Please download v22 LTS from https://nodejs.org/');process.exit(1)}if(v>=24){console.log('[WARNING] ============================================================');console.log('[WARNING] Node.js '+process.version+' is an unstable/preview version.');console.log('[WARNING] Native modules like better-sqlite3 may fail to install.');console.log('[WARNING] Strongly recommended: use Node.js v22 LTS instead.');console.log('[WARNING] ============================================================')}"
if %errorlevel% neq 0 (
    pause
    exit /b 1
)

REM Check pnpm.
call pnpm -v >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found. Enabling via corepack...
    call corepack enable
    call corepack prepare pnpm@latest --activate
)

REM A copied or stale node_modules directory may exist without usable workspace binaries.
set "NEED_INSTALL=0"
if not exist node_modules set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="0" (
    call corepack pnpm exec tsc -v >nul 2>nul
    if %errorlevel% neq 0 set "NEED_INSTALL=1"
)
if "%NEED_INSTALL%"=="0" (
    call corepack pnpm exec tsx --version >nul 2>nul
    if %errorlevel% neq 0 set "NEED_INSTALL=1"
)
if "%NEED_INSTALL%"=="1" (
    echo [INFO] Installing dependencies...
    call corepack pnpm install
    if %errorlevel% neq 0 (
        echo [ERROR] Dependency installation failed. Please check the error above.
        pause
        exit /b 1
    )
)

REM Check whether workspace packages are already built.
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

REM Let the Gateway decide whether a temporary setup token is needed.
set "AUTO_OPEN_BROWSER=true"

REM NOTE: We do NOT pre-load .env.local here.
REM The Gateway reads .env / .env.local directly on startup and applies them
REM with correct quote-stripping, which always takes precedence over shell env vars.

:main_loop
echo.
echo [Star Sanctuary Launcher] Starting Gateway...
echo [Star Sanctuary Launcher] WebChat: http://localhost:28889
echo.

call corepack pnpm dev:gateway

if %errorlevel% equ 100 (
    echo.
    echo [Star Sanctuary Launcher] Restarting...
    timeout /t 2 >nul
    goto main_loop
)

echo.
echo [Star Sanctuary Launcher] Gateway exited (code %errorlevel%).
pause
