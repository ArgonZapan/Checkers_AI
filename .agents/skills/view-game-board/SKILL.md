# Skill: View Game Board

Display the current state of the game board from the C++ engine API.

## Commands

### Get Board State (JSON)
```bash
curl -s -X POST http://localhost:8081/api/game/full-state -H "Content-Type: application/json" -d "{}"
```

### Get Legal Moves
```bash
curl -s -X POST http://localhost:8081/api/game/full-state -H "Content-Type: application/json" -d "{}" | jq '.legalMoves[] | {from: .from, to: .to, captures: (.captures | length)}'
```

### Board Cell Values
```bash
curl -s -X POST http://localhost:8081/api/game/full-state -H "Content-Type: application/json" -d "{}" | jq '.board'
```

## Cell Value Legend
- `0` = Empty
- `1` = White pawn
- `2` = White king  
- `3` = Black pawn
- `4` = Black king

## Visualization
The board is a flat array of 64 values (8x8 grid).
Index = row * 8 + col

## Notes
- Engine must be running on port 8081
- Turn field shows whose move it is: "white" or "black"
- gameOver: true means the game has ended