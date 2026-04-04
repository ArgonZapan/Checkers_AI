# Skill: Stop All Servers

Stop all running Checkers AI server processes.

## Commands

### Kill C++ Engine
```bash
taskkill /IM checkers-server.exe /F 2>nul
```

### Kill Node.js Server
```bash
taskkill /IM node.exe /F 2>nul
```

### Verify Processes Stopped
```bash
tasklist /FI "IMAGENAME eq checkers-server.exe" && tasklist /FI "IMAGENAME eq node.exe"
```

## Notes
- Both commands run silently (errors suppressed with 2>nul)
- Safe to run even if processes are not running
- Use after making code changes to ensure clean restart