# RAPORT IMPLEMENTACYJNY - DQN Checkers AI Arena
Data: 2026-04-05
Runda: 433
Autor: Hermes Agent (checkers-ai-optimizer skill)

---

## STAN AKTUALNY

| Metryka               | Wartość   |
|-----------------------|-----------|
| ELO Agresor (DQN)     | 1422      |
| ELO Forteca (DQN)      | 1436      |
| ELO Minimax (baseline)| 2227      |
| Dystans do celu        | -805 / -791 |
| Winrate Agresor        | 23.4%     |
| Winrate Forteca        | 25.8%     |
| Buffer fill           | 8-9%      |

**Cel:** DQN ELO > Minimax ELO (DQN musi pokonac Minimax depth 3)

---

## ZIDENTYFIKOWANE PROBLEMY

### PROBLEM 1: epsilonDecay ZBYT SZYBKI
**Status:** Zaimplementowane w changelogu, NIE wdrozone w kodzie
**Plik:** `server/config.js`
**Linia:** 16 (oraz 27, 38)

```javascript
// OBECNY KOD (linia 16):
epsilonDecay: 0.005,

// POWINIEN BYC:
epsilonDecay: 0.0005,
```

**Dla agresor i forteca:**
```javascript
// server/config.js linie 27 i 38:
epsilonDecay: 0.005,  // <-- ZMIEN NA 0.0005 w obu strategiach
```

**Uzasadnienie:** Przy 0.005 epsilon spada do minimum w ~58 rund. Przy 0.0005 agent zachowuje eksploracje przez cale 500 rund (epsilon konczy na ~0.05 zamiast 0.01). Dokumentowano 2026-04-05 06:04 UTC ale nigdy nie zapisano do config.js.

---

### PROBLEM 2: gamma ZBYT NISKIE
**Status:** Zaimplementowane, NIE wdrozone
**Plik:** `server/config.js`
**Linia:** 17

```javascript
// OBECNY KOD:
gamma: 0.95,

// POWINIEN BYC:
gamma: 0.99,
```

**Uzasadnienie:** Przy gamma=0.95 nagroda terminalna po 20 ruchach traci 64% wartosci. Przy gamma=0.99 traci tylko 18%. Latwiejsza propagacja sygnalu wygranej przez sekwencje ruchow. Dokumentowano 2026-04-05 02:50 ale config wrócił do 0.95 po restarcie.

---

### PROBLEM 3: NIE MA TARGET NETWORK
**Status:** Udokumentowano ale NIE wdrozone
**Plik:** `server/ai/trainer.js`
**Linia:** ~89-125 (_trainModel)

```javascript
// OBECNY KOD (trainer.js linia ~103):
const result = await train(this.models[name], trainBatch, {
  lr: 0.001, epochs: 3, gamma: this.config.ai.gamma
});

// POWINIEN BYC:
// 1. W konstruktorze SelfPlay dodac:
this.targetModels = {
  agresor: createModel(256, 4, 256, 'relu'),
  forteca: createModel(256, 3, 128, 'relu')
};
// Synchronizuj wagi przy starcie

// 2. W _trainModel():
const result = await train(this.models[name], trainBatch, {
  lr: 0.0005,
  epochs: 5,
  gamma: this.config.ai.gamma,
  targetModel: this.targetModels[name]  // <-- DODAJ
});

// 3. Co targetUpdateFreq iteracji synchronizuj:
if (tick % this.config.ai.targetUpdateFreq === 0) {
  syncModelWeights(this.models[name], this.targetModels[name]);
}
```

**W model.js dodac:**
```javascript
async function train(model, batch, options = {}) {
  const { lr = 0.001, epochs = 1, gamma = 0.95, targetModel = null } = options;
  // ... oblicz TD target z targetModel dla non-terminal states
}

function syncModelWeights(sourceModel, targetModel) {
  // tf.js tensor.assign() do kopiowania wag in-place
}
```

**Uzasadnienie:** Bez target network, TD targety sa "moving target" - kazdy update zmienia wartosci docelowe dla innych probek w batchu. To powoduje oscylacje i brak konwergencji. Dokumentowano 2026-04-05 02:30.

---

### PROBLEM 4: NIE MA PRIORITIZED EXPERIENCE REPLAY
**Status:** PER jest w kodzie buffer.js ale NIE uzywane
**Plik:** `server/ai/trainer.js`
**Linia:** ~101

```javascript
// OBECNY KOD:
const batch = buf.sampleRandom(64);

// POWINIEN BYC:
const batch = buf.samplePrioritized(64);
```

**Uzasadnienie:** PER probkuje doswiadczenia z wiekszym TD-error czestscie, przyspieszajac nauke 2-5x. Dokumentowano 2026-04-05 08:30.

---

### PROBLEM 5: NIE MA next_board W BUFFER
**Status:** Bellman backup wymaga next_state ale nie jest zapisywane
**Plik:** `server/ai/trainer.js`
**Linia:** ~186-187

```javascript
// OBECNY KOD:
this.buffers[strategyName].add({
  board: boardBefore, from: chosenMove.from, to: chosenMove.to,
  turn: isWhite ? 1 : -1, reward
});

// POWINIEN BYC:
this.buffers[strategyName].add({
  board: boardBefore, next_board: state.board,  // <-- DODAJ next_board
  from: chosenMove.from, to: chosenMove.to,
  turn: isWhite ? 1 : -1, reward
});
```

**Uzasadnienie:** TD learning wymaga s' (next_state) do obliczenia r + gamma * V(s'). Bez next_board nie ma Bellman backup. Dokumentowano 2026-04-05 08:30.

---

### PROBLEM 6: valueTarget TO TYLKO REWARD
**Status:** Brak TD learning - siec uczy sie tylko natychmiastowego rewardu
**Plik:** `server/ai/trainer.js`
**Linia:** ~102

```javascript
// OBECNY KOD:
const trainBatch = batch.map(entry => ({ ...entry, valueTarget: entry.reward }));

// POWINIEN BYC (oblicz TD target z Bellman backup):
const trainBatch = batch.map(entry => {
  let tdTarget;
  if (entry.gameOver) {
    tdTarget = entry.reward;
  } else if (entry.next_board) {
    // Oblicz V(s') z modelu i dodaj gamma * V(s')
    const nextVal = predictValue(entry.next_board, model);
    tdTarget = entry.reward + gamma * nextVal;
  } else {
    tdTarget = entry.reward;
  }
  return { ...entry, valueTarget: tdTarget };
});
```

**Uzasadnienie:** Siec musi propagowac sygnal wygranej/przegranej przez cala gre, nie tylko uczyc sie "czy ten ruch dal natychmiastowy reward". Dokumentowano 2026-04-05 08:30.

---

### PROBLEM 7: learningRate ZBYT WYSOKI
**Status:** Hardcoded 0.001, powinno byc 0.0005
**Plik:** `server/ai/trainer.js`
**Linia:** ~103

```javascript
// OBECNY KOD:
{ lr: 0.001, epochs: 3, gamma: this.config.ai.gamma }

// POWINIEN BYC:
{ lr: 0.0005, epochs: 5, gamma: this.config.ai.gamma }
```

**Dodac do config.js:**
```javascript
ai: {
  // ... istniejace ...
  learningRate: 0.0005,
  trainingBatchSize: 128,
  trainingEpochs: 5,
  targetUpdateFreq: 10
}
```

**Uzasadnienie:** Wiecejszy batch (128) wymaga nizszego LR by nie przekraczac optimum. Dokumentowano 2026-04-05 09:15.

---

## HIERARCHIA PRIORYTETOW

### FAZA 1: KRYTYCZNE (naprawic natychmiast)

1. **[PROBLEM 1]** epsilonDecay 0.0005 - 5 min
2. **[PROBLEM 2]** gamma 0.99 - 2 min
3. **[PROBLEM 4]** PER samplePrioritized - 1 min
4. **[PROBLEM 5]** next_board w buffer.add - 3 min
5. **[PROBLEM 6]** TD target calculation - 10 min

### FAZA 2: SREDNIE (w drugim kroku)

6. **[PROBLEM 7]** learningRate 0.0005, epochs 5 - 3 min
7. **[PROBLEM 3]** Target Network - 30 min

### FAZA 3: OPCJONALNE

- Dueling DQN (separate value head)
- Batch/Epoch konfiguracja w config.js

---

## PLIKI DO ZMIANY

| Plik | Zmiany | Priorytet |
|------|--------|-----------|
| `server/config.js` | epsilonDecay, gamma, learningRate | CRITICAL |
| `server/ai/trainer.js` | PER, next_board, TD target, lr, epochs | CRITICAL |
| `server/ai/model.js` | targetModel support, syncModelWeights | HIGH |
| `server/ai/buffer.js` | next_board storage (jesli brak) | HIGH |

---

## WSKAZNIKI SUKCESU PO WDRÓZENIU

| Metryka | Przed | Po |
|---------|-------|-----|
| ELO DQN | ~1430 | > 1900 |
| Winrate vs Minimax | 25% | > 40% |
| Buffer utilization | 9% | > 30% |
| Loss trend | nieznany | malejacy |

---

## HARMONOGRAM

- **Tydzien 1:** Faza 1 (config fixes + PER + Bellman backup)
- **Tydzien 2:** Faza 2 (Target Network + LR tuning)
- **Tydzien 3+:** Faza 3 + dalsze eksperymenty

---

## UWAGI

1. Wszystkie eksperymenty byly dokumentowane w TRAINING-CHANGELOG.md ale NIE zaimplementowane w kodzie produkcyjnym. To glowna przyczyna dlaczego DQN nie uczy sie.

2. Epsilon osiagnelo minimum 0.01 wczesniej niz powinno - agent exploitowal wczesne, losowe wagi przez ostatnie 400+ rund bez eksploracji.

3. Buffory sa pelne w ~9% - przy 500k max i ~43k wpisow, siec widzi tylko 8.6% danych. To moze byc przez brak next_board (kazdy wpis jest jednorazowy?).

4. Serwer musi byc zrestartowany po zmianach w config.js by nowe parametry weszly w zycie.

---

*Wygenerowano przez skill checkers-ai-optimizer*
