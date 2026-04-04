# Checkers AI - Self-Play Tournament

Arena do gry w warcaby z trzema strategiami AI: **Agresor** (DQN), **Forteca** (DQN), **Minimax** (C++ Alpha-Beta).

Trzy strategie AI grają w turnieju round-robin (6 gier jednocześnie), a modele DQN trenują się po każdej rundzie.

## Architektura

| Komponent | Technologia | Port | Opis |
|-----------|-------------|------|------|
| C++ Engine | C++17, cpp-httplib, nlohmann/json | 8080 | Silnik gry + minimax |
| Node.js Server | Express, Socket.IO, TensorFlow.js | 3000 | Serwer AI + self-play + proxy |
| React Frontend | React 18, Vite | embedded | Dashboard z 6 mini-planszami |

## Struktura

```
checkers_ai/
├── engine/              # C++ silnik gry
│   ├── CMakeLists.txt
│   └── src/
│       ├── board.h/cpp       # Bitboard plansza
│       ├── movegen.h/cpp     # Generator ruchów
│       ├── minimax.h/cpp     # Minimax z alpha-beta
│       ├── engine.h/cpp      # Engine zarządzający stanem
│       ├── server.cpp        # HTTP endpointy
│       └── main.cpp          # Entry point
├── server/              # Node.js
│   ├── index.js         # Express + Socket.IO
│   ├── config.js        # Centralna konfiguracja
│   ├── utils.js         # Narzędzia (cppFetch, reward)
│   └── ai/
│       ├── model.js     # TensorFlow.js model
│       ├── buffer.js    # Replay Buffer
│       └── trainer.js   # Self-Play round-robin
└── client/              # React Frontend
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── ArenaView.jsx   # 6 mini-plansz
        ├── MiniBoard.jsx   # SVG plansza
        ├── StatsPanel.jsx  # ELO, H2H, loss charts
        ├── ParamsPanel.jsx # Parametry per strategia
        └── Controls.jsx    # Start/Stop/Speed
```

## Uruchomienie

### 1. C++ Engine (wymaga kompilatora)

```bash
cd engine/src
mkdir -p httplib
curl -sL https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h -o httplib.h
mkdir -p build && cd build
cmake .. && make -j$(nproc)
./checkers-server
```

### 2. Node.js Server

```bash
cd server && npm install
cd server && node index.js
```

### 3. Frontend (dev mode)

```bash
cd client && npm install && npm run dev
```

### Pełne uruchomienie

```bash
# Terminal 1: C++ Engine
cd engine/build && ./checkers-server

# Terminal 2: Node.js + Frontend
cd server && node index.js

# Browser: http://localhost:3000
```

## Gra

Plansza jest read-only — AI gra sama ze sobą. Użytkownik tylko obserwuje i kontroluje turniej.

### Rundy

Każda runda to 6 gier:
1. Agresor vs Forteca
2. Forteca vs Agresor
3. Agresor vs Minimax
4. Minimax vs Agresor
5. Forteca vs Minimax
6. Minimax vs Forteca

Po każdej rundzie modele trenują się przez 1 minutę na danych z replay bufora.

## Konfiguracja (zmienne środowiskowe)

| Zmienna | Default | Opis |
|---------|---------|------|
| `PORT` | `3000` | Port Node.js |
| `HOST` | `127.0.0.1` | Adres nasłuchiwania |
| `CPP_BASE` | `http://localhost:8080` | URL C++ Engine |
| `CORS_ORIGIN` | `http://localhost:3000` | Origin dla CORS |
| `HERMES_ADMIN_TOKEN` | _(brak)_ | Auth token |

## Strategie AI

| Strategia | Typ | Opis |
|-----------|-----|------|
| Agresor | DQN | Waga na materiał i zabicie, szybki epsilon decay |
| Forteca | DQN | Waga na pozycję i tempo, wolny decay |
| Minimax | C++ | Alpha-beta search — benchmark, depth 7 |

## Dashboard

- **6 mini-plansz** — każda pokazuje jedną grę w rundzie round-robin
- **Ranking ELO** — aktualne ratingi i statystyki W/L/D
- **Loss charts** — wykresy strat dla modeli DQN
- **Kontrolki** — start/stop/reset, prędkość, minimax depth