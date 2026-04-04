@echo off
echo Stopping Checkers AI production servers...
taskkill /FI "WINDOWTITLE eq Checkers AI Engine - Port 8081*" /T /F 2>nul
taskkill /FI "WINDOWTITLE eq Checkers AI Server - Port 3001*" /T /F 2>nul
echo Servers stopped.
pause