# Skill: Rebuild & Restart

Full rebuild of the C++ engine and restart all servers.

## Commands

### Step 1: Stop All Servers
```bash
taskkill /IM checkers-server.exe /F 2>nul && taskkill /IM node.exe /F 2>nul & timeout /t 1 /nobreak >nul
```

### Step 2: Rebuild Engine
```bash
C:\msys64\msys2_shell.cmd -mingw64 -defterm -no-start -c "bash /c/Users/erykg/Desktop/checkers_ai/engine/build.sh"
```

### Step 3: Start C++ Engine
```bash
cmd.exe /C "cd C:\Users\erykg\Desktop\checkers_ai\engine\build && set PATH=C:\msys64\mingw64\bin;%PATH% && set PORT=8081 && start /B checkers-server.exe"
```

### Step 4: Start Node.js Server
```bash
cmd.exe /C "cd C:\Users\erykg\Desktop\checkers_ai\server && set PORT=3001 && set CPP_BASE=http://localhost:8081 && start /B node index.js"
```

### Step 5: Verify
```bash
curl -s http://localhost:8081/api/status && curl -s http://localhost:3001/api/health
```

## Notes
- Use after code changes to C++ source files
- Ensures clean rebuild with no stale processes
- Full cycle: stop → build → start → verify