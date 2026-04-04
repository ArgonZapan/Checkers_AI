# Plan kodowania — Checkers AI

## Zasady

- **Priorytet: działa > ładnie** — najpierw functional, potem refactoring
- **Jeden plik na zmianę** — agent pracuje na jednym module, commituje, then next
- **Testuj po każdej fazie** — build + curl smoke test
- **01 → 02 → 03 → 04 → 05** — specyfikacje czytać w tej kolejności

---

## Phase 1: C++ Engine

**Cel:** Silnik gry + minimax, działający na porcie 8080.

### Krok 1.1 — Struktura projektu

```
engine/
├── CMakeLists.txt
├── src/
│   ├── main.cpp           # httplib server bootstrap
│   ├── board.h / board.cpp
│   ├── movegen.h / movegen.cpp
│   ├── minimax.h / minimax.cpp
│   ├── engine.h / engine.cpp
│   └── server.cpp          # endpointy HTTP
```

Kroki:
1. Utwórz `CMakeLists.txt` z targetem `checkers-server` (exec) + `engine` (static lib)
2. Linkuj `cpp-httplib` i `nlohmann/json`
3. Utwórz `main.cpp` z `httplib::Server` na porcie 8080

### Krok 1.2 — Board (bitboard)

Plik: `engine/src/board.h`, `engine/src/board.cpp`

- 3 bitboardy: `white`, `black`, `kings` (uint64_t)
- `reset()` — plansza początkowa (12 białych rows 0-2, 12 czarnych rows 5-7)
- `flip180(uint64_t)` — lookup table 256
- `flipBoard()` / `unflipBoard()` — swap kolorów + flip bitów
- `makeMove(Move& move)` — wykonaj ruch (update bitboardów, promocja, zmiana tury)
- `toString()` — debug
- `inBounds()`, `isEmpty()`, `allPieces()`, `pieceColor()`

### Krok 1.3 — MoveGenerator

Plik: `engine/src/movegen.h`, `engine/src/movegen.cpp`

- `generateForWhite()` — ruchy TYLKO dla białych (kierunek +1 wrow)
- `generateAll(board, color)` — flipuje jeśli czarne, callForWhite, unflipuje wyniki
- `generateCaptures()` — tylko bicia (mandatory)
- `hasAnyMove()` — quick check
- `multiCapture(Board board, ...)` — immutable (Board by value)
- Captures-first ordering na liście wynikowej

PAWN_DIRS: `{{1,-1},{1,1}}`, KING_DIRS: 4 kierunki.

### Krok 1.4 — Minimax

Plik: `engine/src/minimax.h`, `engine/src/minimax.cpp`

- Alpha-beta pruning
- Ewaluacja: (whitePawns - blackPawns)*1.0 + (whiteKings - blackKings)*3.0 + advance bonus
- `popcount64()` = `__builtin_popcountll()`
- Normalize score do [-1.0, +1.0]
- `minimaxSearch(Board, turn, depth)` → `{score, hasMove, bestMove}`

### Krok 1.5 — Engine

Plik: `engine/src/engine.h`, `engine/src/engine.cpp`

- `getFullState()` → board (flat 64) + legalMoves + turn + gameOver + winner
- `makeMove()` → validate + execute
- `getBestMove(depth)` → deleguje do minimax.cpp
- `getResult()` → ONGOING | WHITE_WIN | BLACK_WIN | DRAW
- Draw: 3x position hash + insufficient material

### Krok 1.6 — Server (endpointy)

Plik: `engine/src/server.cpp`

Endpointy:
- `GET /api/status` → `{ready, gamesPlayed}`
- `POST /api/game/full-state` → board (flat 64) + legalMoves + turn + gameOver
- `POST /api/move` → `{from,to,captures}` → nowy stan
- `POST /api/engine/best-move` → `{depth}` → minimax result
- `POST /api/board/set` → debug
- `POST /api/game/reset` → reset gry

Move matching: **linear scan** po legalMoves.

Board w JSON: **flat `int[64]`**.

### Krok 1.7 — Build & Test

```bash
cd engine && mkdir -p build && cd build
cmake .. && make -j$(nproc)
./checkers-server &
curl http://localhost:8080/api/status
```

Musi zwrócić: `{"ready":true,"gamesPlayed":0}`

```bash
curl -X POST http://localhost:8080/api/game/full-state | python3 -m json.tool
```

Board: flat 64, turn: white.

---

## Phase 2: Node.js Server

**Cel:** Express + TensorFlow.js + self-play round-robin, port 3000.

### Krok 2.1 — Struktura

```
server/
├── index.js             # Express, socket.io, proxy, self-play
├── ai/
│   ├── model.js         # createModel, predict, train, saveModel, loadModel
│   ├── trainer.js       # SelfPlay round-robin, ELO, buffers
│   └── buffer.js        # ReplayBuffer FIFO
├── config.js            # CONFIG (strategie, speed, minimax)
└── package.json
```

### Krok 2.2 — Konfiguracja

Plik: `config.js`
- `CONFIG.ai.strategies` — agresor, forteca, minimax (wagi, epsilon, rewards)
- `CONFIG.server` — port 3000, cppBase http://localhost:8080
- `CONFIG.minimax.depth` — default 7
- `Object.freeze()` na strategiach

### Krok 2.3 — AI Model (TensorFlow.js)

Plik: `ai/model.js`

- `createModel(size)` — small/medium/large (Input 256 → Dense... → Policy + Value)
- `predict(model, board, legalMoves, epsilon)` → policy + value, epsilon check
- `train(model, batch, epochs)` → loss
- `saveModel(model, path)` → file://
- `disposeModel(model)` → cleanup

Board input: flip jeśli czarne → kanały 1-2 = moje, 3-4 = przeciwnika.
Policy index: pozycja w tablicy legalMoves (0..N-1). Value: -1 do +1.

### Krok 2.4 — Replay Buffer

Plik: `ai/buffer.js`

- FIFO, max 500 000
- `{board: int[64], from: [r,c], to: [r,c], turn: ±1, reward: float}`
- `add(entry)`, `sampleRandom(n)`, `clear()`, `save(path)`, `load(path)`
- 2 bufory: agresor, forteca

### Krok 2.5 — Self-Play Round-Robin

Plik: `ai/trainer.js`

Klasa `SelfPlay`:
- `start()` → uruchamia rundę (6 gier)
- 6 matchupów: A vs F, F vs A, A vs M, M vs A, F vs M, M vs F
- Każdy ruch:
  - Minimax: `POST /api/engine/best-move {depth: 7}`
  - DQN: `predict()` z epsilon check, fallback na minimax
  - Flip jeśli czarne
- `POST /api/move` → wykonaj w C++
- Buffer.add() po każdym ruchu
- Po 6 grach: training (1 minuta, time-based)
- ELO update (K=32, start 1500)
- Epsilon decay: `max(eps - decay, min)`
- Checkpoint: save models

### Krok 2.6 — Express + Proxy + WebSocket

Plik: `index.js`

- Express: serwuje `client/dist/` (static), health endpointy
- Proxy: `/api/move`, `/api/engine/best-move` → C++ 8080
- AI endpoints: `/api/ai/predict`, `/api/ai/train`, `/api/ai/params`, `/api/ai/reset`
- Self-play endpoints: `/api/selfplay/start`, `/api/stop`, `/api/status`
- WebSocket: `startSelfPlay`, `stopSelfPlay`, `setParams`, `setMinimaxDepth`, `reset`, `restart`
- WS events do frontendu: `gameState` (game 1-6), `gameOver`, `roundComplete`, `trainingStatus`, `train`, `selfPlayStatus`
- Rate limiting: per-socket throttle
- Auth: `HERMES_ADMIN_TOKEN` (optional)
- CORS: `CORS_ORIGIN`

### Krok 2.7 — Build & Test

```bash
cd server && npm install
HOST=0.0.0.0 node index.js
curl http://localhost:3000/api/ai/info
```

---

## Phase 3: React Frontend

**Cel:** Dashboard z 6 mini-planszami, ELO, loss charts.

### Krok 3.1 — Struktura

```
client/
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── ArenaView.jsx      # siatka 6 mini-plansz
    ├── MiniBoard.jsx      # jedna plansza SVG
    ├── StatsPanel.jsx     # ELO, H2H, loss charts
    ├── ParamsPanel.jsx    # agresor / forteca / minimax / ogólne
    ├── Controls.jsx       # start/stop/speed/minimaxDepth
    └── index.css
```

### Krok 3.2 — Plansza (MiniBoard)

- SVG, cells (rect), pieces (circle + 👑 jeśli damka)
- Read-only (brak `onCellClick`)
- Animacja: slide (rAF, quadratic ease-out)
- Highlight ostatniego ruchu (żółty overlay)

### Krok 3.3 — ArenaView (6 plansz)

- Siatka 3×2
- Label: "1: Agresor vs Forteca", itd.
- Status tury pod każdą planszą
- WebSocket `gameState` z `game:1-6` → update odpowiedniej planszy

### Krok 3.4 — StatsPanel

- Tabela ELO (3 strategie)
- Head-to-head: W/L/D per matchup
- 2 wykresy loss (Agresor, Forteca) — Canvas
- Info: runda #, status (active/training/idle)

### Krok 3.5 — Controls + ParamsPanel

- Start / Stop / Reset
- Speed slider (0-10000ms)
- Speed mode toggle (fast/normal)
- Minimax depth slider (1-8, default 7)
- Parametry per model: epsilon, min, decay, architektura

### Krok 3.6 — Build & Test

```bash
cd client && npm install && npm run build
```

Frontend serwowany przez Node.js na porcie 3000.

---

## Phase 4: Testing & Integration

### Krok 4.1 — Unit testy C++

Google Test lub własne testy: board reset, moves, captures, promotion, minimax depth, flip/unflip.

### Krok 4.2 — Unit testy Node.js (Jest)

Model creation, predict, buffer ops, epsilon, reward calculation.

### Krok 4.3 — Integration testy

- `POST /api/game/full-state` → flat board + legalMoves
- `POST /api/engine/best-move` → minimax zwraca move
- `POST /api/move` → zmiana stanu
- `POST /api/ai/predict` → policy + value

### Krok 4.4 — E2E (Playwright)

- Dashboard ładuje się z 6 planszami
- Start tournament → 6 gier leci
- Po rundzie → statystyki/aktualizacja ELO

### Krok 4.5 — Full integration

```bash
# Terminal 1
cd engine/build && ./checkers-server

# Terminal 2
cd server && HOST=0.0.0.0 node index.js

# Browser
open http://localhost:3000
```

Dashboard powinien pokazać 6 plansz. Start → gra się toczy → stats aktualizują → training po rundzie → checkpoint.
