@echo off
setlocal enabledelayedexpansion

echo [Belldandy] Kill Gateway Script
echo ================================
echo.

:: Default port
set "PORT=28889"

:: Try to read port from .env or .env.local
if exist .env.local (
    for /f "tokens=1,2 delims==" %%a in ('findstr /r "^BELLDANDY_PORT=" .env.local 2^>nul') do (
        set "PORT=%%b"
    )
)
if exist .env (
    for /f "tokens=1,2 delims==" %%a in ('findstr /r "^BELLDANDY_PORT=" .env 2^>nul') do (
        if "!PORT!"=="28889" set "PORT=%%b"
    )
)

echo [INFO] Target port: !PORT!
echo.

:: Check if port is in use
netstat -ano | findstr ":!PORT! " >nul 2>&1
if %errorlevel% neq 0 (
    echo [OK] Port !PORT! is not in use. No process to kill.
    echo.
    pause
    exit /b 0
)

:: Kill process using PowerShell
echo [ACTION] Killing process on port !PORT!...
powershell -Command "Get-NetTCPConnection -LocalPort !PORT! -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"

if %errorlevel% equ 0 (
    echo [SUCCESS] Process killed successfully.
) else (
    echo [WARNING] Failed to kill process. You may need to run as Administrator.
)

echo.
pause
