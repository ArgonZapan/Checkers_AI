# Skill: Check Engine Status

Check the status of the Checkers AI C++ engine API.

## Commands

### Check Engine Status
```bash
curl -s http://localhost:8081/api/status | jq .
```

### Get Full Game State
```bash
curl -s -X POST http://localhost:8081/api/game/full-state -H "Content-Type: application/json" -d "{}" | jq .
```

### Check Node.js Server
```bash
curl -s http://localhost:3001/api/health | jq .
```

### All Services Status
```bash
echo "=== C++ Engine ===" && curl -s http://localhost:8081/api/status && echo "" && echo "=== Node.js Server ===" && curl -s http://localhost:3001/api/health
```

## Expected Responses
- Engine: `{"gamesPlayed":0,"ready":true}`
- Node.js: `{"status":"ok"}`

## Notes
- Engine must be running on port 8081
- jq formats JSON output (install via: winget install jqlang.jq)