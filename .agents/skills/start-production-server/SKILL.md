# Skill: Start Production Server

Start both C++ engine and Node.js servers for Checkers AI.

## Commands

### 1. Start C++ Engine (port 8081)
```bash
cmd.exe /C "cd C:\Users\erykg\Desktop\checkers_ai\engine\build && set PATH=C:\msys64\mingw64\bin;%PATH% && set PORT=8081 && start /B checkers-server.exe"
```

### 2. Start Node.js Server (port 3001)
```bash
cmd.exe /C "cd C:\Users\erykg\Desktop\checkers_ai\server && set PORT=3001 && set CPP_BASE=http://localhost:8081 && start /B node index.js"
```

### 3. Verify
```bash
curl -s http://localhost:8081/api/status && curl -s http://localhost:3001/api/health
```

## Quick Start Alternative
```bash
start-production.bat
```

## Notes
- C++ engine must be built first (use "Build C++ Engine" skill)
- C++ engine uses port 8081, Node.js uses port 3001
