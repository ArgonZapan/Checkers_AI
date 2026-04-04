# Strategia testów

## Poziomy testów

### 1. Unit — C++ Engine

Testy silnika gry (board, movegen, minimax, engine):

| Co testować | Przykłady |
|-------------|-----------|
| Board reset | Plansza ma 12 białych i 12 czarnych pionków |
| Piece placement | Tylko na ciemnych polach |
| Legal moves | Poprawne kierunki, flip 180° działa |
| Captures | Bicie obowiązkowe, multi-capture |
| King moves | Damka porusza się wszystkie 4 kierunki |
| King captures | Damka bije z dowolnej odległości |
| Promotion | Pionek → damka na last row |
| Turn switching | Po ruchu zmiana tury |
| Game end | Brak ruchów → loss, 3x position → draw, insufficient material → draw |
| Undo move (snapshot) | Cofnięcie przywraca stan |
| Minimax | Depth 1-8, alpha-beta odcina, score w zakresie [-1,1] |
| Flip/unflip | Plansza po flip+unflip = oryginalna |

Framework: Google Test (C++) lub własne testy

### 2. Unit — AI/Trainer (Node.js)

Testy logiki AI:

| Co testować | Przykłady |
|-------------|-----------|
| Model creation | Small/medium/large architektury |
| Predict | policy + value output |
| Epsilon check | random vs model |
| Board flip | board z perspektywy Agresora i Forteca |
| Reward calculation | material, position, threat, advance, tempo |
| Buffer operations | add, sample (per strategia), save/load |
| Epsilon decay | decay co rundę |
| Minimax fallback | gdy model nowy → minimax zamiast random |
| Lock mechanism | acquire/release, concurrent protection |

Framework: Jest

### 3. Integration — Endpointy API

Testy HTTP endpointów:

| Co testować | Przykłady |
|-------------|-----------|
| C++ /api/move | legal → success, nielegal → 400 |
| C++ /api/full-state | board (flat 64) + legalMoves w jednym |
| C++ /api/engine/best-move | minimax depth 1-8, score [-1,1] |
| Node /api/ai/predict | valid policy + value |
| Node /api/ai/train | training z batch, loss > 0 |
| Proxy forwarding | Node → C++ chain |
| Error handling | timeout, connection refused |

### 4. E2E — Playwright

Testy end-to-end w przeglądarce:

| Scenariusz | Opis |
|------------|------|
| Smoke test | Strona się ładuje, 6 mini-plansz widoczne |
| Tournament test | Start → 6 gier leci → stats/elo aktualizują |
| Training test | Po rundzie → 1 min training → loss maleje |
| Reconnect test | Rozłączenie → reconnect → stan zachowany |
| Params change | setParams → epsilon/elo reset → restart |

### 5. Load / Performance

| Co mierzyć | Benchmark |
|------------|-----------|
| Move generation | ruchy/ms (C++) |
| Prediction latency | ms per predict (tfjs) |
| Minimax search | nodes/s, max depth 7 |
| Batch training | ms per 64 samples |
| WebSocket throughput | 6 gry jednocześnie, events/sec |
| Memory usage | heap over time (2 bufory × 500K) |

## Test data

- `SAMPLE_BOARD` — plansza przykładowa
- `SAMPLE_LEGAL_MOVES` — lista ruchów testowych
- Board encoding: 0=empty, 1=wPawn, 2=wKing, 3=bPawn, 4=bKing (flat[64])

## CI/CD (planowane)

```yaml
# .github/workflows/test.yml
- build C++ engine → run unit tests
- npm install → npm test (Jest)
- npm run test:e2e (Playwright z backend)
```
