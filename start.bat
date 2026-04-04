@echo off
setlocal EnableDelayedExpansion
set PROJECT_DIR=%~dp0

echo ============================================================
echo Checkers AI - Development Server
echo ============================================================
echo Engine Port:  http://localhost:8080
echo API Port:     http://localhost:3000
echo Frontend:     http://localhost:5173
echo ============================================================

cd /d "%PROJECT_DIR%server"
echo Starting backend server...
start "Checkers AI Backend" cmd.exe /c "node index.js"

timeout /t 2 /nobreak >nul

cd /d "%PROJECT_DIR%client"
echo Starting frontend (Vite)...
start "Checkers AI Frontend" cmd.exe /c "npm run dev"

timeout /t 4 /nobreak >nul
echo.
echo ============================================================
echo Done! Open http://localhost:5173 in your browser.
echo Close both windows to stop servers.
echo ============================================================
timeout /t 5 /nobreak >nul
start http://localhost:5173