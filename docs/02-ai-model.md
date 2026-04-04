# AI Model — Architektura sieci neuronowej

## Backend AI

- **Silnik:** TensorFlow.js (tfjs-node) — działa w procesie Node.js
- **Modele:** Dwa niezależne modele — Agresor i Forteca

## Wejście (Input)

Model ZAWSZE widzi planszę z perspektywy białego — swoje pionki na dole (rows 0-2), przeciwnik na górze. **Brak bitu "czyja tura"** — model wie że to jego ruch.

### Tensor wejściowy: 8×8×4

| Kanał | Co przechowuje          |
|-------|-------------------------|
| 1     | Moje pionki             |
| 2     | Moje damki              |
| 3     | Pionki przeciwnika      |
| 4     | Damki przeciwnika       |

Razem: 256 wartości (flat `int[64]` × 4 kanały).

### Jak to działa

- Model "białego" widzi: kanał1=1, kanał2=2, kanał3=3, kanał4=4
- Model "czarnego" widzi: kanał1=3, kanał2=4, kanał3=1, kanał4=2 (po flipie planszy)
- W obu przypadkach kanały 1-2 = "moje", 3-4 = "przeciwnika"

## Architektura modeli

### Warianty rozmiaru

| Wariant | Architektura                              |
|---------|-------------------------------------------|
| **Small**  | Input(256) → Dense(128) → Dense(64)        |
| **Medium** | Input(256) → Dense(256) → Dense(128) → Dense(64) |
| **Large**| Input(256) → Dense(512) → Dense(256) → Dense(128) → Dense(64) |

Aktywacja: ReLU, Tanh, Sigmoid, Leaky ReLU.

### Wyjście (Dual Head)

```
                  +-- Dense(num_moves) + Softmax → Policy
Last layer -- --- |
                  +-- Dense(1) + Tanh → Value
```

**Policy head:** Prawdopodobieństwo każdego z `legalMoves`. Index = pozycja w tablicy legalMoves (0..N-1). Nielegalne ruchy maskowane (0).

**Value head:** -1.0 (przegrana) do +1.0 (wygrana) — z perspektywy "mnie".

## Strategie

| Strategia | Typ | Opis |
|-----------|-----|------|
| Agresor | DQN (Network) | Waga na materiał (0.55) i zabicie, szybki epsilon decay |
| Forteca | DQN (Network) | Waga na pozycję (0.40) i tempo, wolny decay |
| Minimax | C++ (Benchmark) | Alpha-beta search — benchmark porównawczy, depth 7 (domyślnie), konfigurowalny 1-8 |

Minimax używa heurystyki materiałowej (popcount), nie używa neural network.

## Parametry

### Architektura (model)

| Parametr | Dom. | Zakres |
|----------|------|--------|
| `layers` | 3 | 1-5 |
| `neurons` | 128 | 32-512 |
| `activation` | relu | relu/tanh/sigmoid/leaky |
| `dropout` | 0.0 | 0.0-0.5 |

### Trening

| Parametr | Dom. | Zakres |
|----------|------|--------|
| `lr` | 0.001 | 0.0001-0.01 |
| `batchSize` | 64 | 8-256 |
| `gamma` | 0.95 | 0.5-0.99 |
| `bufferSize` | 500 000 | 1k-1M |

### Eksploracja (per model)

| Parametr | Dom. | Zakres |
|----------|------|--------|
| `epsilon` | 0.3 | 0.0-1.0 |
| `minEpsilon` | 0.01 | 0.0-0.1 |
| `epsilonDecay` | 0.01/rundę | 0.001-0.05/rundę |

## Reward (DQN)

Reward po ruchu: materia³ + pozycja + zagrożenie + postęp + tempo × waga strategii.

Game outcome (po końcu gry): +1.0 (wygrana), -1.0 (przegrana), 0.0 (remis).

## Zapis modeli

```
models/
├── agresor.json
├── forteca.json
└── meta.json    # epsilon, ELO, round, etc.
```

Auto-zapis co rundę (checkpoint po 1-min treningu) + przy graceful shutdown.
