# Silnik gry — C++ Engine (port 8080)

## Zasady gry

- Plansza 8×8, 24 pionki (12 białych, 12 czarnych)
- Biały zaczyna
- Pionki poruszają się po skos do przodu (do przodu = rosnący numer wiersza)
- Bicie obowiązkowe — jeśli można zbić, gracz musi zbić
- Wielokrotne bicie dozwolone — po zbiciu pionek kontynuuje jeśli może bić dalej
- Pionek na ostatnim wierszu przeciwnika → promocja na damkę
- Damka porusza się po skos w dowolnym kierunku o dowolną liczbę pól

## Koncepcja: Perspektywa białych (flip 180°)

### Zasada

Cała logika generowania ruchów napisana jest **tylko dla białych**. Gdy tura czarnych, plansza jest obracana o 180° z zamianą kolorów pionków. Po wygenerowaniu ruchów współrzędne są transformowane z powrotem.

### Transformacja

```
Plansza oryginalna (tura czarnych):      Po flip 180° (wygląda jak tura białych):
. . b . b . b . b                        . . w . w . w . w    ← row 7→0
  b . b . b . b .                          w . w . w . w .    ← row 6→1
. . b . b . b . b                        . . w . w . w . w    ← row 5→2
w . w . w . w .                            b . b . b . b .    ← row 2→5
  w . w . w . w .                          b . b . b . b .    ← row 1→6
. . w . w . w . w                        . . b . b . b . b    ← row 0→7
```

- Kolor: `WHITE ↔ BLACK` (swap bitboardów)
- Pozycja: `(row, col) → (7-row, 7-col)`
- Bit: `bit → 63-bit` (flip w 64-bitowej masce)
- Move wygenerowany w flip space: `(r, c) → (7-r, 7-c)` przy unflip

### Implementacja flip bitboard

```cpp
// Lookup table 256 entries (byte reverse) — precomputed
static const uint8_t BYTE_REV[256] = { /* 0x00, 0x80, 0x40, ... */ };

uint64_t flip180(uint64_t bb) {
    return ((uint64_t)BYTE_REV[(bb      ) & 0xFF] << 56) |
           ((uint64_t)BYTE_REV[(bb >>  8) & 0xFF] << 48) |
           ((uint64_t)BYTE_REV[(bb >> 16) & 0xFF] << 40) |
           ((uint64_t)BYTE_REV[(bb >> 24) & 0xFF] << 32) |
           ((uint64_t)BYTE_REV[(bb >> 32) & 0xFF] << 24) |
           ((uint64_t)BYTE_REV[(bb >> 40) & 0xFF] << 16) |
           ((uint64_t)BYTE_REV[(bb >> 48) & 0xFF] <<  8) |
           ((uint64_t)BYTE_REV[(bb >> 56) & 0xFF]      );
}
```

8 lookup table access + shift = ~10-15 operacji, pomijalne w skali całego przeszukiwania.

## Reprezentacja planszy (Bitboard)

| Bitboard    | Co przechowuje                     |
|-------------|------------------------------------|
| `white`     | Wszystkie pionki białych (+ damki) |
| `black`     | Wszystkie pionki czarnych (+ damki)|
| `kings`     | Wszystkie damki (obu kolorów)      |

Dostępne operacje:
- `whitePawn(sq)` = `(white & sq_mask) && !(kings & sq_mask)`
- `whiteKing(sq)` = `(white & sq_mask) && (kings & sq_mask)`
- `pieceColor(sq)` = `white & sq_mask` → WHITE, `black & sq_mask` → BLACK
- `allPieces()` = `white | black`

## Struktura plików

| Plik | Odpowiedzialność |
|------|------------------|
| `engine/src/board.h/cpp` | Board struct, flip/unflip, bitboard ops, `makeMove`, `reset` |
| `engine/src/movegen.h/cpp` | MoveGenerator — ruchy dla białych, flip/unflip dla czarnych |
| `engine/src/minimax.h/cpp` | Minimax z alpha-beta, ewaluacja pozycji |
| `engine/src/engine.h/cpp` | Engine — main loop, legal moves, game result |
| `engine/src/server.cpp` | HTTP server (cpp-httplib), endpointy |
| `engine/src/main.cpp` | Entry point — start na porcie 8080 |

## Minimax (C++)

### Endpoint

```
POST /api/engine/best-move
Request:  { "depth": 4 }       // opcjonalny, default 4, zakres 1-8
Response: { "score": 0.45, "hasMove": true, "move": {"from":[r,c],"to":[r,c],"captures":[[r,c]]} }
```

Score: -1.0 (czarne wygrywają) do +1.0 (białe wygrywają).

### Algorytm

Alpha-beta pruning, iteracyjny po węzłach drzewa:

```
function minimax(board, depth, alpha, beta, isMaximizing):
    if depth == 0 lub gameOver:
        return evaluate(board)

    moves = listAllMoves(board)  // captures-first

    if isMaximizing:
        best = -∞
        for move in moves:
            val = minimax(board dopo move, depth-1, alpha, beta, false)
            best = max(best, val)
            alpha = max(alpha, val)
            if beta <= alpha: break
        return best
    else:
        best = +∞
        for move in moves:
            val = minimax(board dopo move, depth-1, alpha, beta, true)
            best = min(best, val)
            beta = min(beta, val)
            if beta <= alpha: break
        return best
```

### Ewaluacja pozycji

```
score = (whitePawns - blackPawns) × 1.0
      + (whiteKings - blackKings) × 3.0
      + advanceBonus  // im dalej pionek od startu, tym wyższy bonus
```

- `popcount64()` = `__builtin_popcountll()` — hardware instruction (1 cykl)
- Wynik skalowany do [-1.0, +1.0] przez podzielenie przez `maxPossible` (~51)

### Move ordering

Captures przed non-captures. Bicie obowiązkowe oznacza że w wielu pozycjach captures są jedynymi legalnymi ruchami — sprawdzanie ich pierwsze daje ~2x speedup alpha-beta.

## MoveGenerator

```cpp
class MoveGenerator {
public:
    static std::vector<Move> generateForWhite(const Board& board);
    static std::vector<Move> generateAll(const Board& board, Color color);
    static std::vector<Move> generateCaptures(const Board& board, Color color);
    static bool hasAnyMove(const Board& board, Color color);
};
```

`generateForWhite` generuje ruchy z perspektywy białych — zawsze kierunek `+1` wrow.
`generateAll` wywoływane przez Node.js/Engine — jeśli `color == BLACK`, flipuje planszę, woła `generateForWhite`, unflipuje wyniki.

### Kierunki ruchu (tylko dla białych)

```cpp
static constexpr int PAWN_DIRS[2][2] = {{1, -1}, {1, 1}};
static constexpr int KING_DIRS[4][2] = {{1,-1},{1,1},{-1,-1},{-1,1}};
```

## Reguły gry

1. Bicie obowiązkowe
2. Multi-capture dozwolone
3. Promocja na ostatnim wierszu
4. Draw — pozycja powtórzona 3 razy (position hash)
5. Draw — insufficient material (damka vs damka)
6. Przegrana — brak legalnych ruchów

## Flow engine

```cpp
Engine::reset()           // inicjalizacja planszy, tura białych
Engine::getFullState()    // board + turn + gameOver + legalMoves
Engine::makeMove(move)    // walidacja + wykonanie
Engine::getBestMove(depth) // minimax → najlepszy ruch
Engine::getResult()       // ONGOING | WHITE_WIN | BLACK_WIN | DRAW
```

## Matchowanie ruchu w `/api/move`

Prosty linear scan po liście legalMoves:

```cpp
for (const auto& m : legal) {
    if (m.from.row == fr && m.from.col == fc &&
        m.to.row == tr && m.to.col == tc) {
        if (!capturesProvided || capturesMatch(m, captures))
            return m;
    }
}
// not found → 400
```

Maksymalnie ~30 ruchów na planszy — 5 linii kodu, zero dodatkowych struktur.

## multiCapture — immutable

Rekurencja operuje na **kopii planszy** (Board by value):

```cpp
static void multiCapture(Board board, int curR, int curC,
                         Color color, bool isKing,
                         std::vector<Square>& captures,
                         std::vector<Move>& result,
                         std::vector<Square>& path,
                         uint64_t capturedMask);
```

Każdy poziom rekurencji działa na własnej kopii. Przy return kopia zostaje usunięta — nie ma rollbacku. Struktury wynikowe (`captures`, `result`, `path`) są współdzielone przez referencję.

## UndoMove — snapshot

```cpp
struct MoveResult {
    Move move;
    Board boardBefore;
};

// makeMove zwraca MoveResult z snapshota
// undo:
board = preMoveBoard;  // 3 przypisania
```

## API — endpointy HTTP

| Endpoint | Method | Opis |
|----------|--------|------|
| `GET /api/status` | GET | `{ "ready": true, "gamesPlayed": 42 }` |
| `POST /api/game/full-state` | POST | Board + turn + gameOver + winner + lastMove + legalMoves |
| `POST /api/move` | POST | `{"from":[r,c],"to":[r,c],"captures":[[r,c]]}` → nowy stan |
| `POST /api/engine/best-move` | POST | `{"depth":4}` → minimax result |
| `POST /api/board/set` | POST | Ustaw planszę ręcznie (debug) |
| `POST /api/game/reset` | POST | Reset gry |

### `/api/game/full-state`

```json
{
  "board": [0,1,0,1,0,1,0,1, 1,0,1,0,1,0,1,0, ...],
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

Board to flat `int[64]`, indeks `i = row * 8 + col`. Wartości: `0`=empty, `1`=wPawn, `2`=wKing, `3`=bPawn, `4`=bKing.

## Build

```bash
cd engine
mkdir -p build && cd build
cmake ..
make -j$(nproc)
./checkers-server
```

### Zależności (header-only, w .gitignore)

- **cpp-httplib** — github.com/yhirose/cpp-httplib
- **nlohmann/json** — github.com/nlohmann/json

Pobierane przed buildem.

## Design decisions

| Decyzja | Znaczenie |
|---------|-----------|
| Flip 180° | Jedna logika ruchów — czarne przez symetrię |
| 3 bitboardy | white, black, kings — minimum potrzebne |
| Minimax w C++ | Alpha-beta + eval — Node.js tylko woła endpoint |
| Flat board w API | `int[64]` — zero konwersji po stronie Node.js |
| Linear scan | Do 30 ruchów — prosty for-loop zamiast hash map |
| Immutable multiCapture | Board kopiowany — zero rollback |
| UndoMove = snapshot | 3 przypisania — bez edge-case tracking |
| Captures-first ordering | Bicie na liście pierwsze — prosty speedup alpha-beta |
