# Skill: Build C++ Engine

Compile the Checkers AI C++ engine using MSYS2 MinGW64.

## Commands

```bash
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -c "bash /c/Users/erykg/Desktop/checkers_ai/engine/build.sh"
```

## Verification

```bash
cmd /C "dir c:\Users\erykg\Desktop\checkers_ai\engine\build\checkers-server.exe"
```

## Notes
- Requires MSYS2 installed at C:\msys64
- Flag `-D_WIN32_WINNT=0x0A00` is required for cpp-httplib
- Output: `engine/build/checkers-server.exe` (~1.47 MB)