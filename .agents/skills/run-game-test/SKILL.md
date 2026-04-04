# Skill: Run Game Test

Test the Checkers engine by resetting the game and making test moves.

## Commands

### Reset Game
```bash
curl -s -X POST http://localhost:8081/api/game/reset
```

### Get Initial State
```bash
curl -s -X POST http://localhost:8081/api/game/full-state -H "Content-Type: application/json" -d "{}" | jq '{turn: .turn, gameOver: .gameOver, legalMovesCount: (.legalMoves | length)}'
```

### Get AI Best Move
```bash
curl -s -X POST http://localhost:8081/api/engine/best-move -H "Content-Type: application/json" -d '{"depth": 4}' | jq .
```

### Make a Test Move (example: e3-d4)
```bash
curl -s -X POST http://localhost:8081/api/move -H "Content-Type: application/json" -d '{"from": [2, 2], "to": [3, 3]}' | jq .
```

### Full Test Sequence
```bash
echo "1. Reset..." && curl -s -X POST http://localhost:8081/api/game/reset && echo "" && echo "2. Status..." && curl -s -X POST http://localhost:8081/api/game/full-state -H "Content-Type: application/json" -d "{}" | jq '{turn, legalMovesCount: (.legalMoves | length)}' && echo "3. Best move..." && curl -s -X POST http://localhost:8081/api/engine/best-move -H "Content-Type: application/json" -d '{"depth": 4}' | jq '{score: .score, hasMove: .hasMove}'
```

## Expected Values
- Initial white pieces: 12 pawns
- Initial legal moves: ~7-10 for white
- After reset: gameOver = false