# API — Endpointy (C++ i Node.js)

## C++ Engine (port 8080)

| Endpoint | Method | Opis |
|----------|--------|------|
| `GET /api/status` | GET | `{ "ready": true, "gamesPlayed": N }` |
| `POST /api/game/full-state` | POST | Board + legalMoves + state (wszystko w jednym) |
| `POST /api/move` | POST | Wykonaj ruch |
| `POST /api/engine/best-move` | POST | Minimax — najlepszy ruch |
| `POST /api/board/set` | POST | Ustaw planszę (debug) |
| `POST /api/game/reset` | POST | Reset planszy |

### POST /api/game/full-state

Response:
```json
{
  "board": [0,1,0,1,0,1,0,1, 1,0,1,0, ...],
  "turn": "white",
  "gameOver": false,
  "winner": null,
  "lastMove": { "from": [r,c], "to": [r,c] },
  "legalMoves": [
    { "from": [2,1], "to": [3,0], "captures": [] },
    { "from": [2,1], "to": [4,3], "captures": [[3,2]] }
  ]
}
```

Board: flat `int[64]` (0=empty, 1=wPawn, 2=wKing, 3=bPawn, 4=bKing). Jeden endpoint zastępuje poprzednie `state` + `legal-moves`.

### POST /api/move

Request:
```json
{ "from": [r,c], "to": [r,c], "captures": [[r,c], ...] }
```
Response: nowy stan z `board` (flat 64), `turn`, `gameOver`, `winner`, `captures`, `path`.

### POST /api/engine/best-move

Request: `{ "depth": 7 }` (opcjonalny, domyślnie 7, zakres 1-8)

Response:
```json
{
  "score": 0.45,
  "hasMove": true,
  "move": { "from": [r,c], "to": [r,c], "captures": [], "path": [[r,c], ...] }
}
```

---

## Node.js Server (port 3000)

### HTTP REST

| Endpoint | Method | Opis |
|----------|--------|------|
| `/api/ai/info` | GET | Status modeli (epsilon per model, architektura, ELO) |
| `/api/ai/predict` | POST | Predykcja: board + legalMoves → policy + value |
| `/api/ai/train` | POST | Wymuś sesję treningową (batch, 1 min) |
| `/api/ai/params` | POST | Zmień parametry (epsilon, architektura, nagrody) |
| `/api/ai/restart` | POST | Restart modelu (`model=agresor`\|`forteca`\|`both`) |
| `/api/ai/reset` | POST | Full reset (modele, bufory, statystyki, ELO) |
| `/api/selfplay/start` | POST | Start turnieju (6 gier round-robin) |
| `/api/selfplay/stop` | POST | Stop turnieju |
| `/api/selfplay/status` | GET | Status: runda, ELO, W/L/D per matchup |

### Predykcja

Request:
```json
{
  "board": [0,1,0,...],
  "legalMoves": [{"from":[r,c],"to":[r,c],"captures":[]}],
  "epsilon": 0.3
}
```

Response:
```json
{
  "move": {"from":[r,c],"to":[r,c],"captures":[]},
  "probabilities": [0.1, 0.3, ...],
  "value": 0.45
}
```

### Trening

Request: `{"model": "agresor", "batch": [{"board":[...], "from":[r,c], "to":[r,c], "value_target": 0.8}]}`
Response: `{ "loss": 0.23, "samples": 64 }`

---

## WebSocket

### Client → Server

| Event | Payload | Opis |
|-------|---------|------|
| `startSelfPlay` | — | Start turnieju |
| `stopSelfPlay` | — | Stop |
| `setSpeed` | `ms` | Opóźnienie (0-10000) |
| `setSpeedMode` | `'fast'`\|`'normal'` | Tryb |
| `setParams` | `{epsilon, layers, neurons, ...}` | Parametry Agresora/Fortecy |
| `setMinimaxDepth` | `1-8` | Głębokość minimax (domyślnie 7) |
| `reset` | — | Full reset (modele, statystyki, ELO, bufory) |
| `restart` | `{model: 'agresor'\|'forteca'\|'both'}` | Restart wów modelu |

### Server → Client

| Event | Payload | Opis |
|-------|---------|------|
| `gameState` | `{game:1-6, board, turn, gameOver, lastMove}` | Aktualizacja jednej z 6 gier |
| `gameOver` | `{game:1-6, winner, moves}` | Koniec gry nr N |
| `roundComplete` | `{round: 7, elo: {...}, stats: {...}}` | Runda zakończona — nowe ELO i statystyki |
| `trainingStatus` | `{active: true, timeLeft: 42}` | Odliczanie 1-min treningu |
| `train` | `{model: 'agresor', loss: 0.23}` | Loss po mini-batchu |
| `paramsUpdate` | `{...}` | Parametry zmienione |
| `speedUpdate` | `{aiMoveDelayMs, speedMode}` | Prędkość zmieniona |
| `selfPlayStatus` | `{active, round, elo: {'agresor':1542,...}, stats}` | Całkowity status |
| `modelRestart` | `{model: 'agresor'}` | Model zresetowany |
| `error` | `{message}` | Błąd |

---

## Rate Limiting

| Typ | Limit |
|-----|-------|
| HTTP | 120 req/min per IP |
| WS startSelfPlay | 1 req/1s |
| WS stopSelfPlay | 1 req/1s |
| WS setSpeed | 1 req/1s |
| WS setSpeedMode | 1 req/1s |
| WS setParams | 1 req/1s |
| WS setMinimaxDepth | 1 req/1s |
| WS restart | 1 req/2s |

## CORS

- `CORS_ORIGIN` — default `http://localhost:3000`
- WebSocket origin validation

## Auth

- Token: `HERMES_ADMIN_TOKEN` (env var)
- Wymagany dla: startSelfPlay, stopSelfPlay, setParams, setMinimaxDepth, restart, reset
- Nie wymagany dla: predict, ai/info (read-only)
