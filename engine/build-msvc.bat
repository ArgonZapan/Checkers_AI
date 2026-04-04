@echo off
echo Setting up MSVC environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1

if not exist "%VCINSTALLDIR%" (
    echo ERROR: Could not set up MSVC environment
    exit /b 1
)

echo Compiling Checkers Engine...
cd /d "%~dp0src"

cl /std:c++17 /O2 /I. /Ihttplib /EHsc ^
    /Fe:"checkers-server.exe" ^
    board.cpp movegen.cpp minimax.cpp engine.cpp main.cpp server.cpp ^
    2>&1

if exist "checkers-server.exe" (
    echo.
    echo BUILD SUCCESS: src\checkers-server.exe
    taskkill /F /IM checkers-server-new.exe >nul 2>&1
    move /Y "checkers-server.exe" "..\build\checkers-server-new.exe"
    if exist "..\build\checkers-server.exe" (
        dir "..\build\checkers-server.exe"
    ) else (
        echo MOVE FAILED
        exit /b 1
    )
) else (
    echo.
    echo BUILD FAILED
    exit /b 1
)