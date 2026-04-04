@echo off
setlocal EnableDelayedExpansion
set PROJECT_DIR=%~dp0

echo ============================================================
echo Checkers AI - Production Server (Single Process)
echo ============================================================
echo Engine Port:  http://localhost:8080
echo API Port:     http://localhost:3000
echo ============================================================

cd /d "%PROJECT_DIR%server"
echo Starting unified server...
start "Checkers AI Server" cmd.exe /c "node index.js"

timeout /t 4 /nobreak >nul
echo Opening dashboard...
start http://localhost:3000

echo.
echo ============================================================
echo Done! Close the server window to stop.
echo ============================================================
pause