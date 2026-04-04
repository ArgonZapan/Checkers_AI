# Konfiguracja

## Zmienne środowiskowe

| Zmienna | Domyślna | Opis |
|---------|----------|------|
| `PORT` | `3000` | Port Node.js |
| `HOST` | `127.0.0.1` | Adres nasłuchiwania |
| `CORS_ORIGIN` | `http://localhost:3000` | Origin dla CORS |
| `HERMES_ADMIN_TOKEN` | _(brak)_ | Auth token (admin endpoints) |

## Centralna konfiguracja

```
CONFIG.board     — ustawienia planszy (cellSize, kolory, animation)
CONFIG.server    — port, cors, cppBase, timeout, speed, autoSave
CONFIG.ai        — epsilon, bufferSize, strategie
CONFIG.minimax   — depth (default 7)
```

### Kluczowe wartości

| Key | Domyślna | Opis |
|-----|----------|------|
| `CONFIG.server.port` | 3000 | Port Node.js |
| `CONFIG.server.cppBase` | http://localhost:8080 | Base URL C++ engine |
| `CONFIG.server.fetchTimeoutMs` | 5000 | Timeout requestów do C++ |
| `CONFIG.server.aiMoveDelayMs` | 0 | Opóźnienie AI move (ms) |
| `CONFIG.server.speedMode` | 'normal' | 'fast' / 'normal' |
| `CONFIG.server.normalModeDelayMs` | 500 | Opóźnienie w normal mode |
| `CONFIG.server.autoSaveMs` | 30000 | Auto-save checkpoint (ms) |
| `CONFIG.ai.defaultEpsilon` | 0.3 | Domyślna eksploracja |
| `CONFIG.ai.minEpsilon` | 0.01 | Minimalny epsilon |
| `CONFIG.ai.epsilonDecay` | 0.01 | Decay porundzie |
| `CONFIG.ai.gamma` | 0.95 | Discount factor |
| `CONFIG.ai.bufferSize` | 500000 | Maks replay buffer |
| `CONFIG.minimax.depth` | 7 | Domyślna głębokość minimax (1-8) |
| `CONFIG.board.cellSize` | 60 | Pixel size komórki |
| `CONFIG.board.animation.stepDurationMs` | 200 | Animacja kroku (ms) |

## Pliki danych (gitignored)

```
models/           # wagi AI (agresor.json, forteca.json, meta.json)
data/             # replay buffer (buffer_agresor.json, buffer_forteca.json), state
client/dist/      # build frontend
node_modules/     # dependencies
engine/src/httplib.h  # external header
engine/src/json.hpp   # external header
```

## Konfiguracja per-strategia

### Agresor
```json
{
  "weights": {"material": 0.55, "position": 0.15, "threat": 0.20, "tempo": 0.10},
  "epsilonDecay": 0.015,
  "minEpsilon": 0.02,
  "rewardCapture": 0.15,
  "rewardAdvance": 0.10,
  "rewardPromotion": 0.20,
  "rewardWin": 1.0,
  "rewardLose": -1.0
}
```

### Forteca
```json
{
  "weights": {"material": 0.25, "position": 0.40, "threat": 0.10, "tempo": 0.25},
  "epsilonDecay": 0.008,
  "minEpsilon": 0.03,
  "rewardCapture": 0.08,
  "rewardAdvance": 0.03,
  "rewardPromotion": 0.40,
  "rewardWin": 1.0,
  "rewardLose": -1.2
}
```

### Minimax
```json
{
  "type": "minimax",
  "depth": 7,
  "weights": {"material": 1.0, "position": 0.3}
}
```

## Freeze protection

Strategie są frozen (`Object.freeze`) na import config.js. Modyfikacja wymaga copy-on-write:
```js
CONFIG.ai.strategies.minimax = Object.freeze({ ...CONFIG.ai.strategies.minimax, depth: 8 });
```
