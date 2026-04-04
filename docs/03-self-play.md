# Self-play — Turniej round-robin

## Overview

Trzy strategie grają w turnieju round-robin: **Agresor** (DQN), **Forteca** (DQN), **Minimax** (C++). Każdy z każdym, w obu kolorach.

## Runda (6 gier)

| # | Białe   | Czarne   | Opis |
|---|---------|----------|------|
| 1 | Agresor | Forteca  | DQN vs DQN |
| 2 | Forteca | Agresor  | Symetryczna (zamiana kolorów) |
| 3 | Agresor | Minimax  | DQN vs benchmark |
| 4 | Minimax | Agresor  | Symetryczna |
| 5 | Forteca | Minimax  | DQN vs benchmark |
| 6 | Minimax | Forteca  | Symetryczna |

Każda strategia gra 4 gry na rundę (2× białe, 2× czarne).

## Cykl rundy

```
Round start:
  1. POST /api/game/reset
  2. For each of 6 matchups:
     for each move:
       if strategia == minimax:
         chosen = POST /api/engine/best-move {"depth": 7}
       else:
         flip board jeśli czarne
         epsilon check: losowy czy model.predict?
         unflip ruch jeśli czarne
       POST /api/move → wykonaj w C++
       ReplayBuffer(modela).add(board, from, to, turn)
       POST /api/game/full-state → czy gameOver?
     Na koniec gry: oznacz wpisy w buforach o wynik
     Aktualizuj statystyki (W/L/D per opponent)
     Aktualizuj ELO

  3. TRENING (1 minuta):
     modelAgresor.fit(batchAgresor) → nowe wagi
     modelForteca.fit(batchForteca) → nowe wagi
     Minimax — pomijany (nie trenuje się)

  4. model.save() → checkpoint (zapisz wagi na dysk)
  5. Epsilon decay (per model: max(epsilon - decay, min_epsilon))
  6. Goto 1 (next round)
```

## Replay Buffer

- **Oddzielny per DQN model:** Agresor ma swój bufor, Forteca ma swój
- **Typ:** FIFO, max 500 000 wpisów (każdy)
- **Przechowywanie:** JSON (`data/buffer_agresor.json`, `data/buffer_forteca.json`)
- **Sampling:** losowe mini-batch-e (batchSize 64) z własnego bufora

### Wpis w buforze

```json
{
  "board": [0, 1, 0, ...],
  "from": [2, 1],
  "to": [3, 0],
  "turn": 1,
  "reward": 0.12
}
```

Board zapisywany surowy z C++ (bez flipowania). Model flipuje przy czytaniu.

## Trening

Po każdej rundzie (6 gier), trening trwa **1 minutę**:
```
time_limit = 60 sekund
t = now()
while now() - t < 60s:
    batch = buffer.sample_random(64)
    model.fit(batch, epochs=1)
```

Każdy model trenuje TYLKO na danych ze swojego bufora (tylko ruchy swojego koloru).

## Minimax — benchmark

- Minimax NIE trenuje się, NIE ma replay buffer, NIE ma epsilon
- Służy jako **stały benchmark** — poziom do porównania siły DQN modeli
- Głębokość: **konfigurowalna, default 7**
- Minimax gra w C++ (`POST /api/engine/best-move {"depth": 7}`)
- Wyniki gier z Minimax wchodzą w statystyki DQN modeli (W/L/D i ELO)

## Epsilon (eksploracja)

Każda strategia ma swoje parametry eksploracji:
```
epsilon = max(epsilon - decay_per_round, min_epsilon)
```
Epsilon jest używany NIEZALEŻNIE od koloru. Agresor ma epsilon 0.5 i używa go i jako biały i jako czarny.

## Statystyki i ranking

### ELO (per strategia)

Każda strategia ma własny rating ELO (start 1500). Po każdej grze:
```
expected = 1 / (1 + 10^((elo_opponent - elo_me) / 400))
elo_me = elo_me + K * (actual - expected)
```
K = 32 (domyślnie).

### Statystyki (W/L/D per opponent)

```
Agresor:
  vs Forteca: 12W / 8L / 2D
  vs Minimax: 7W  / 10L / 5D
  Overall:    19W / 18L / 7D

Forteca:
  vs Agresor: 8W  / 12L / 2D
  vs Minimax: 5W  / 13L / 4D
  Overall:    13W / 25L / 6D

Minimax:
  vs Agresor: 10W / 7L  / 5D
  vs Forteca: 13W / 5L  / 4D
  Overall:    23W / 12L / 9D
```

## Inwalidacja przy zmianie parametrów

Po `setParams`:
1. Stop pętli
2. paramsVersion++
3. Utwórz nowe modele (jeśli zmieniono architekturę)
4. Wyczyść bufory
5. Reset statystyk i ELO
6. Restart (jeśli była aktywna)

## Prędkość

| Tryb  | Opis                                  |
|-------|---------------------------------------|
| fast  | Bez opóźnień — max szybkość treningu  |
| normal | Opóźnienie między ruchami (slider ms) |
