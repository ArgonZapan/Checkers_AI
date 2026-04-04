# Frontend — Dashboard turniejowy

## Technologia

- **React 18** — komponenty funkcyjne
- **Vite 5** — dev server + production build
- **SVG** — plansze (6 mini-plansz)
- **socket.io-client** — real-time (WebSocket)
- **Canvas** — wykresy loss (2 oddzielne)

## Architektura komponentów

```
App
└── Dashboard              — główny widok (zawsze widoczny)
    ├── ArenaView           — 6 mini-plansz w siatce
    │   ├── MiniBoard       — plansza 1: Agresor vs Forteca
    │   ├── MiniBoard       — plansza 2: Forteca vs Agresor
    │   ├── MiniBoard       — plansza 3: Agresor vs Minimax
    │   ├── MiniBoard       — plansza 4: Minimax vs Agresor
    │   ├── MiniBoard       — plansza 5: Forteca vs Minimax
    │   └── MiniBoard       — plansza 6: Minimax vs Forteca
    ├── StatsPanel          — statystyki i ranking
    │   ├── ELOTable        — ranking ELO 3 strategii
    │   ├── HeadToHead       — W/L/D per matchup
    │   ├── LossCharts       — 2 wykresy loss (Agresor, Forteca)
    │   └── RoundInfo        — numer rundy, status, czas
    ├── ParamsPanel         — parametry AI (zakładki per strategia)
    └── Controls            — start/stop/reset/speed/minimax depth
```

**Brak ekranu startowego.** Po wejściu od razu dashboard z 6 mini planszami.

## 6 mini-plansz (ArenaView)

Każda mini plansza pokazuje jedną z 6 gier w rundzie:

| Mini plansza | Białe   | Czarne   |
|-------------|---------|----------|
| 1           | Agresor | Forteca  |
| 2           | Forteca | Agresor  |
| 3           | Agresor | Minimax  |
| 4           | Minimax | Agresor  |
| 5           | Forteca | Minimax  |
| 6           | Minimax | Forteca  |

### Layout siatki

```
┌─────────────┬─────────────┬─────────────┐
│ 1: A vs F   │ 2: F vs A   │ 3: A vs M   │
│ [board SVG] │ [board SVG] │ [board SVG] │
│ Tura: Białe │ Tura: Czarne│ Tura: Białe │
├─────────────┼─────────────┼─────────────┤
│ 4: M vs A   │ 5: F vs M   │ 6: M vs F   │
│ [board SVG] │ [board SVG] │ [board SVG] │
│ Tura: Białe │ Tura: Czarne│ Tura: Czarne│
└─────────────┴─────────────┴─────────────┴
```

Plansze są read-only (brak interakcji). Animacje ruchów (move animation, highlight ostatniego ruchu).

### WebSocket — 6 gier jednocześnie

Server wysyła osobne eventy per gra przez socket z identyfikatorem:
```json
{
  "game": 3,
  "board": [0,1,0,...],
  "turn": "white",
  "gameOver": false,
  "lastMove": {"from":[2,1],"to":[3,0]}
}
```

## Statystyki i ranking (StatsPanel)

### Ranking ELO

```
╔═══════════╦═══════╦═════╦═════╦═════╗
║ Strategia ║ ELO   ║  W  ║  L  ║  D  ║
╠═══════════╬═══════╬═════╬═════╬═════╣
║ Agresor   ║ 1542  ║  19 ║  18 ║  7  ║
║ Forteca   ║ 1412  ║  13 ║  25 ║  6  ║
║ Minimax   ║ 1546  ║  23 ║  12 ║  9  ║
╚═══════════╩═══════╩═════╩═════╩═════╝
```

### Head-to-head per matchup

```
Agresor vs Forteca: 12W / 8L / 2D
Agresor vs Minimax:  7W / 10L / 5D
Forteca vs Minimax:  5W / 13L / 4D
```

### Wykresy loss (2 oddzielne)

- **Wykres Agresora** — loss po każdym treningu Agresora
- **Wykres Forteca** — loss po każdym treningu Fortecy
- Minimax nie ma wykresu (nie trenuje się)

### Info o rundzie

- Numer rundy
- Status: active / resting / training
- Czas trwania aktualnej gry (per plansza)
- Pozostały czas treningu (odliczanie 60s)

## Kontrolki (Controls)

| Kontrolka | Akcja |
|-----------|-------|
| ▶ Start | Rozpocznij rundę (6 gier) |
| ⏹ Stop | Zatrzymaj |
| 🔄 Reset | Pełny reset (modele, statystyki, ELO, bufory) |
| ⏱ Speed | Slider 0-10000ms opóźnienia |
| ⚡ Speed mode | Toggle fast/normal |
| 🔧 Minimax depth | Slider 1-8 (default 7) |

## Dashboard — Parametry (ParamsPanel)

Zakładki:
1. **Agresor** — epsilon, epsilon min, decay, loss chart
2. **Forteca** — jw.
3. **Minimax** — depth, stats (read-only)
4. **Ogólne** — architektura sieci, szkolenie

Minimax panel jest read-only — nie ma epsilon, nie ma architektury.

## Parametry konfigurowalne

| Panel | Parametry |
|-------|-----------|
| Agresor/Forteca | epsilon, epsilon min, decay, strategie |
| Architektura sieci | warstwy, neurony, aktywacja, dropout |
| Szkolenie | learning rate, batch size, gamma, buffer size |

## Interakcja z użytkownikiem

**User NIE gra.** Tylko:
- obserwuje 6 gier jednocześnie
- kontroluje turniej (start/stop/reset)
- zmienia parametry AI i minimax depth

## WebSocket events (client → server)

| Event | Payload | Opis |
|-------|---------|------|
| `startSelfPlay` | — | Start turnieju |
| `stopSelfPlay` | — | Stop |
| `setSpeed` | `ms` | Opóźnienie |
| `setSpeedMode` | `'fast'/'normal'` | Tryb |
| `setParams` | `{epsilon, layers, ...}` | Parametry |
| `reset` | — | Full reset |
| `setMinimaxDepth` | `1-8` | Minimax depth |

## WebSocket events (server → client)

| Event | Payload | Opis |
|-------|---------|------|
| `gameState` | `{game:1-6, board, turn, gameOver, lastMove}` | Ruch w jednej z 6 gier |
| `gameOver` | `{game:1-6, winner, moves}` | Koniec gry nr N |
| `roundComplete` | `{round:1, stats, elo}` | Runda skończona |
| `trainingStatus` | `{active:bool, timeLeft:int}` | Status 1-min treningu |
| `train` | `{model:'agresor', loss:0.23}` | Loss po treningu |
| `paramsUpdate` | `{...}` | Parametry zmienione |
| `speedUpdate` | `{...}` | Prędkość zmieniona |
| `selfPlayStatus` | `{active, round, elo, stats}` | Status |
| `modelRestart` | `{model:'agresor'}` | Model zresetowany |
| `error` | `{message}` | Błąd |

## Reconnect

- `reconnection: true`, `reconnectionAttempts: Infinity`
- Po reconnect: nie emituj `startSelfPlay`
- Dashboard ładuje aktualny stan z `selfPlayStatus` + `gameState`

## Layout (responsive)

```
┌─────────────────────────────────────────────────┐
│  ♟ Checkers AI Arena      [🟢 Online]  [Runda 7]│
├───────────────────┬─────────────────────────────┤
│  6 mini plansz    │  Ranking ELO               │
│  siatka 3×2      │  Statystyki H2H            │
│                   │  Loss charts (2)            │
├───────────────────┼─────────────────────────────┤
│  Controls         │  ParamsPanel               │
│  Start/Stop       │  Zakładki: A / F / M / O    │
│  Speed/slider     │                             │
│  Minimax depth    │                             │
└───────────────────┴─────────────────────────────┘
```

Na mobile — mini plansze w kolumnie (1 na rząd), dashboard pod spodem.
