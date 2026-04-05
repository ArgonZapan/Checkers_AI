# Training Changelog — DQN vs Minimax

Cel: DQN musi pokonać Minimax depth 3 po 500 rundach (ELO DQN > ELO Minimax).

---

## Format wpisów

```
### [YYYY-MM-DD HH:MM] Zmiana: [nazwa eksperymentu]
- **Plik:** [który plik zmieniono]
- **Zmiana:** [co dokładnie zmieniono]
- **Hipoteza:** [dlaczego to powinno pomóc]
- **Wynik po 500 rund:**
  - ELO Agresor (DQN): X
  - ELO Forteca (DQN): X
  - ELO Minimax depth 3: X
- **Wniosek:** [co zadziałało / co nie / dlaczego]
- **Następny krok:** [co zmienić w kolejnej iteracji]
```

---

## Eksperymenty

### [2026-04-05 09:15] Zmiana: Increase Training Intensity — 4× Iterations, Larger Batch, Lower LR

- **Pliki:** `server/config.js`, `server/ai/trainer.js`
- **Zmiana:** Czterokrotne zwiększenie kroku treningowego i zmiana hiperparametrów:
  1. **config.js:** Dodano `trainingIterationsPerRound: 4` (było 1), `trainingBatchSize: 128` (było 64), `trainingEpochs: 5` (było 3), `learningRate: 0.0005` (było 0.001 hardcoded).
  2. **trainer.js:** Pętla treningowa w `_startGameLoop` i `_trainModel` używa teraz wartości z configu zamiast hardcodowanych. Zamiast 1 kroku × batch 64 × 3 epochi na rundę → 4 kroki × batch 128 × 5 epok. Łącznie: z ~1 500 gradient stepów na 500 rund → ~8 000 × 5 = ~40 000 gradient stepów (27× więcej!).
  3. Mniejszy learning rate (0.0005 vs 0.001) kompensuje 2× większy batch — daje stabilniejsze gradienty.
- **Hipoteza:** DQN był dramatycznie undertrenowany — tylko 1 krok treningu na 6-gier rundę to ~1 500 update'ów na 500 rund przy 90 000+ próbkach w buforze. Sieć widziała mniej niż 2% swoich danych. Przy 40 000+ gradient stepów, sieć faktycznie nauczy się z doświadczenia. Większy batch (128) daje mniej szumne gradienty, niższy LR (0.0005) zapobiega overshootting przy większych batchach. Oczekuję wzrostu ELO DQN o 100-250 punktów po 500 rundach.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić czy intensywniejszy trening znacząco poprawił ELO.

### [2026-04-05 02:30] Zmiana: Target Network for Stable TD Backup

- **Pliki:** `server/ai/trainer.js`, `server/ai/model.js`, `server/config.js`
- **Zmiana:** Dodano Target Network — oddzielny model dla obliczania TD targetów (V(s') i Q(s') w Bellman backup), który NIE aktualizuje się z każdym krokiem treningowym. Wagi docelowej sieci kopiuje się z głównej co `targetUpdateFreq=10` iteracji treningowych (konfigurowalne w `config.js`). Konkretnie:
  1. **trainer.js:** Dodano `this.targetModels = { agresor, forteca }` — klon obu modeli z tymi samymi architekturami. Początkowe wagi zsynchronizowane `syncModelWeights(model, targetModel)`.
  2. **model.js:** `train()` przyjmuje nowy opcjonalny parametr `targetModel`. Gdy podany, oblicza `V_target(next_state)` zamiast `V_main(next_state)` dla non-terminal TD targets. Terminal states pozostają bez zmian (target = reward, bo V(s') = 0).
  3. **model.js:** Dodano funkcję `syncModelWeights(sourceModel, targetModel)` używającą tf.js `tensor.assign()` do kopiowania wag in-place bez tworzenia nowych tensorów.
  4. **trainer.js:** `_trainModel()` przekazuje `targetModel: this.targetModels[name]` do `train()`. Po każdej N-tej iteracji (domyślnie 10) wywołuje `syncModelWeights()` by zsynchronizować wagi.
  5. **config.js:** Dodano `ai.targetUpdateFreq: 10`.
  6. **trainer.js:** `reset()` i `restartModels()` obsługują teraz target modele (dispose, create, sync).
- **Hipoteza:** Obecnie targety TD obliczane są z TEGO SAMEGO modelu którego właśnie trenujemy — oznacza to "moving target problem". Każdy update zmienia wartości docelowe dla innych przykładów w batchu, co prowadzi do oscylacji i niestabilnej konwergencji (znany problem z oryginalnego artykułu DeepMind DQN 2015). Target Network daje stabilne TD targety przez wiele iteracji co pozwala gradientom wreszcie zbiec w spójnym kierunku. Periodowe kopie co 10 iteracji to wystarczająca częstotliwość by target doganiał główną sieć bez wprowadzania drgań. Oczekuję wzrostu ELO DQN o 50-150 punktów po 500 rundach.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach.

---

### [2026-04-05 08:45] Zmiana: Add Full Positional Reward Shaping (Center Control, Advancement, Capture Position)
- **Plik:** `server/utils.js`
- **Zmiana:** Naprawiono błąd w computeReward() — pozycyjne nagrody były praktycznie zerowe (0.0015 za ruch, przez `0.01 * w.position`). Zamieniono na pełną ocenę pozycyjną:
  1. **Center control:** Nagroda +2.0 za ruch na centrum, +0.5 za blisko centrum, -odpowiednio za opuszczenie. Centroid mapy: squares 3/5 w rzędach 3-4.
  2. **Advancement progress:** Wartość 0-2.1 rosnąca im bliżej promocji (row 0 dla Białych, row 7 dla Czarnych).
  3. **Positional capture bonus:** Usunięcie pionka przeciwnika z centrum daje +2.0, z bliskiego centrum +0.5.
  4. Skala: `posDelta * w.position * 10` — daje maks ~20pkt za idealny center move, co jest porównywalne do material delta (~5.5 za zbicie).
- **Hipoteza:** Poprzednia implementacja ignorowała ~35% wag strategii (weights: position 0.15-0.40) — nagroda pozycyjna była 0.0015 zamiast ~1.5-4.0. Agent był de facto greedy materialista. Po dodaniu znaczących nagród pozycyjnych, nauczenie się kontroli centrum i progresji powinno dać DQN strategiczną głębię podobną do Minimax depth 3. Agresor (position=0.15) dostanie ~0.3 za center move, Forteca (position=0.40) dostanie ~0.8 — co pasuje do ich strategii (agresywna vs pozycyjna). Oczekuję wzrostu ELO DQN o 50-150 punktów.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach.

### [2026-04-05 01:15] Zmiana: Train Policy Head with DQN Q-Learning Loss
- **Plik:** `server/ai/model.js`
- **Zmiana:** Dodano loss dla policy head w funkcji `train()`. Poprzednio trenowano TYLKO value head (MSE TD target vs value prediction) — policy head otrzymywał zero gradientów i zostawał losowy. Teraz:
  1. **DQN-style policy loss:** Dla wykonanego ruchu encode into index 0-31, budujemy Q-target vector kopiuje Q-values z current policy head ale zamienia entry wykonanego ruchu na TD target
  2. **MSE(q_target, predPolicy):** Gradient flow do policy head uczy Q(s,a) → TD target
  3. **Total loss = valueLoss + policyLoss:** Oba heads otrzymują gradienty, ale mają osobne role (value = estymacja pozycji, policy = ranking ruchów)
- **Hipoteza:** Policy head był całkowicie nie-trenowany — wybierał ruchy losowo (poza epsilon-greedy). Po dodaniu policy loss, sieć nauczy się przewidywać które ruchy prowadzą do lepszych pozycji. To fundamentalna zmiana: wcześniej agent grał dobrze TYLKO przez epsilon-greedy (losowe ruchy + epsilon), a teraz DQN-style policy learning powinien dać mu spójną strategię nawet bez randomness. Oczekuję wzrostu ELO DQN o 100+ punktów vs baseline.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić czy DQN policy loss poprawił jakość ruchów i ELO.

### [2026-04-05 08:30] Zmiana: Proper TD Learning with Bellman Backup + PER + Circular Buffer Fix
- **Pliki:** `server/ai/trainer.js`, `server/ai/model.js`, `server/ai/buffer.js`
- **Zmiana:** Trzy powiązane zmiany:
  1. **TD Learning z Bellman Backup (model.js):** `train()` teraz oblicza TD targets jako `r + γ × V(s')` zamiast używania samego `reward` jako targetu. Dla stanów terminalnych target = reward. Dla stanów nie-terminalnych target = reward + gamma * wartość następnego stanu z modelu. To fundamentalna zmiana — wcześniej sieć uczyła się przewidywać natychmiastowy reward za pojedynczy ruch (np. +0.55 za zbicie), zamiast długoterminowej wartości pozycji. Teraz sieć propaguje rewardy terminalne (wygrana/przegrana) z powrotem przez całą grę poprzez rekurencyjne obliczanie V(s').
  2. **Prioritized Experience Replay (trainer.js):** Zmieniono `sampleRandom(64)` na `samplePrioritized(64)`. Buffer ma już zaimplementowany SumTree (PER) ale trener go ignoruje. PER próbkuje doświadczenia z większym TD-error częściej, co przyspiesza naukę 2-5×.
  3. **next_board + Circular Buffer Fix (trainer.js + buffer.js):** DQN wymaga `s'` (next_state) do obliczenia Bellman backup. Dodano `next_board: state.board` przy każdym `buffer.add()`. Dodatkowo naprawiono bug w buffer.js — przy `shift()` (gdy buffer pełny) ustawiano priority na 0 dla nadpisywanego węzła w SumTree (`this.tree.update(0, 0)`), zapobiegając próbkowaniu starych danych.
- **Hipoteza:** Poprzedni kod trenował sieć do przewidywania natychmiastowego rewardu (material delta × 10), co dawało agentowi wiedzę tylko o "czy ten ruch jest lepszy materialnie". Z proper TD learning, sieć nauczy się długoterminowej wartości pozycji i będzie propagować sygnał wygranej/przegranej przez całą grę. PER powinien przyspieszyć konwergencję. Oczekuję wzrostu ELO DQN o 100-200 punktów po 500 rundach.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić czy TD learning + PER poprawiły DQN vs Minimax.


### [2026-04-04 22:50] Zmiana: Fix material delta perspective bug in computeReward
- **Plik:** `server/utils.js`, `server/ai/trainer.js`
- **Zmiana:** Dodano parametr `turn` (1=White, -1=Black) do `computeReward()`. Poprzednio material delta zawsze liczyła piony 1,2 jako "moje" a 3,4 jako "przeciwnika" — co oznaczało że agent Black otrzymywał **odwrócone rewardy**! Gdy Black zbił White pionka zamiast + dostał -. Naprawiono: teraz `myPiece1/2` i `oppPiece1/2` są dobierane dynamicznie na podstawie `turn`.
- **Hipoteza:** Black agent uczył się unikać zbióć bo dostawał ujemne rewardy za wygrywanie materialnie. Po naprawie oba agenci (Agresor i Forteca) będą miały poprawnie skierowane gradienty — zbicie przeciwnika = pozytywny reward niezależnie od koloru. To powinno znacząco poprawić jakość nauki obu strategii, szczególnie Forteca która gra jako Black whalf matchupów.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić poprawę DQN vs Minimax.

### [2026-04-04 22:35] Zmiana: Reward Win/Lose scaling ×10
- **Plik:** `server/config.js`
- **Zmiana:** Zmieniono `rewardWin` z 1.0 na 10.0 oraz `rewardLose` z -1.0/-1.2 na -10.0 dla obu strategii (agresor i forteca).
- **Hipoteza:** Obecnie funkcja `computeReward` w `utils.js` mnoży deltę materialną przez 10 (`* w.material * 10`), co daje ~5.5 za zbicie pojedynczego pionka (delta mat × 0.55 × 10). Natomiast nagroda za wygraną grę wynosiła tylko 1.0. Agent optymalizował więc pod zachłanne zbicia zamiast strategii prowadzącej do zwycięstwa. Zwiększenie nagrody terminalnej do 10.0 sprawia, że wygrana/porażka gry dominuje nad pojedynczymi uderzeniami materialnymi — agent uczy się wygrywać gry, nie tylko zbijać pionki.
- **Wynik po 500 rund:**
  - ELO Agresor (DQN): CZEKA NA WYNIKI
  - ELO Forteca (DQN): CZEKA NA WYNIKI
  - ELO Minimax depth 3: CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić czy DQN poprawił się vs Minimax.

### [2026-04-05 00:40] Zmiana: Separate Value Head Architecture (Dueling DQN style)
- **Plik:** `server/ai/model.js`
- **Zmiana:** Zmieniono architekturę sieci z Sequential na Functional API z dwoma głowami:
  1. **Policy head** (32 wyjścia) - służy wyłącznie do wyboru akcji (action selection przez softmax)
  2. **Value head** (1 wyjście skalarny) - służy wyłącznie do estymacji wartości pozycji i TD learning (Bellman backup)
  Poprzednio sieć używała `max(policy_logits)` jako proxy wartości - to oznaczało że gradienty TD flowowały przez neurony odpowiedzialne za ranking akcji, co powodowało interferencję sygnałów. Teraz value head dostaje czyste gradienty TD: `MSE(r + γ × V(s'), V(s))` bez mieszania z headem polityki.
- **Hipoteza:** Separacja heads rozwiązuje interferencję policy/value - sieć nauczy się prawdziwej estymacji wartości pozycji przez value head podczas gdy policy head optymalizuje wybór akcji. Value head propaguje rewardy terminalne przez grę bez zakłóceń z polityki. Oczekuję wzrostu ELO DQN o 150+ punktów po 500 rundach, ponieważ: (1) lepsza estymacja wartości pozycji → lepsze decyzje long-term, (2) czyste gradienty TD → szybsza konwergencja, (3) policy head nie jest "oszukany" przez szum z TD backupu.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić czy separate value head poprawił DQN vs Minimax.

---

### [2026-04-05 02:45] Zmiana: Add Training Loop to Game Loop (DQN Was Never Trained!)

- **Plik:** `server/ai/trainer.js`
- **Zmiana:** Dodano krok treningowy DQN bezpośrednio w `_startGameLoop()` — trenowanie po KAŻDEJ rundzie (6 gier), a nie tylko przez `setInterval` co 30s. Poprzednio `run_selfplay.js` wyłączało `_startParallelTraining` co oznaczało że DQN **NIGDY nie był trenowany** podczas 500-rundowych eksperymentów! Modele pozostawały losowe przez cały bieg. Teraz: po każdej rundzie (6 gier DQN vs DQN/Minimax), jeśli buffer ma >= 64 przykłady, uruchamiany jest 1 krok treningu PER z target network i Bellman backup. Target network synchronizowany co `targetUpdateFreq` (10) ticków.
- **Hipoteza:** DQN nie był wcześniej trenowany w ogóle — modele były czysto losowe. Gdy faktycznie zacznie się trenować po każdej rundzie, DQN będzie poprawiał się stopniowo. Już po 50-100 rundach powinien pokazać znaczną poprawę vs Minimax. Po 500 rundach powinno być widoczne ELO > Minimax depth 3.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, sprawdzić czy DQN w ogóle się uczy.

---

### [2026-04-05 02:50] Zmiana: Increase Gamma (Discount Factor) from 0.95 → 0.99
- **Plik:** `server/config.js`
- **Zmiana:** Zmieniono `gamma` z 0.95 na 0.99. Gamma kontroluje jak bardzo nagrody z przyszłości są wartościowane w porównaniu do natychmiastowych rewardów.
  - Przy gamma=0.95: terminalny reward (wygrana) po 20 ruchach traci ~64% wartości (0.95^20 ≈ 0.358)
  - Przy gamma=0.99: terminalny reward po 20 ruchach traci tylko ~18% wartości (0.99^20 ≈ 0.818)
  - Przy gamma=0.99: terminalny reward po 40 ruchach nadal ma 67% wartości (0.99^40 ≈ 0.669)
- **Hipoteza:** Przy gamma=0.95 agent faworyzował natychmiastowe nagrody (materialne zbicia) bo długoterminowy sygnał wygranej/przegranej był zbyt rozcieńczony. Wyższy gamma pozwoli na propagację sygnału terminalnego głębiej w sekwencję ruchów, ucząc agenta że kontrola pozycji i progresja pionków prowadzi do wygranej, nie tylko do bezpośredniego materialnego zysku. To powinno poprawić jakość strategii długoterminowej. Oczekuję wzrostu ELO DQN o 50-100 punktów.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach.

---

### [2026-04-05 06:04 UTC] Zmiana: Slow Down Epsilon Decay 10× — 0.005 → 0.0005

- **Plik:** `server/config.js`
- **Zmiana:** Zmniejszono `epsilonDecay` z 0.005 do 0.0005 dla obu strategii (agresor i forteca).
  - Przy 0.005: epsilon 0.3 → 0.01 po ~58 rundach (0.3 - 0.005*58 ≈ 0.01)
  - Przy 0.0005: epsilon 0.3 → 0.01 po ~580 rundach (przekracza maxRounds=500)
  - Po 500 rundach: epsilon ≈ 0.3 - 0.0005*500 = 0.05 (wciąż 5% eksploracji)
- **Hipoteza:** Poprzedni epsilonDecay 0.005 oznaczał, że po zaledwie ~58 rundach sieć traciła 95% eksploracji i exploitowała to, co wtedy wiedziała — czyli prawie nic (wagi wciąż bliskie losowym). Agent utrwalał przypadkowe ruchy wczesnej fazy przez pozostałe ~442 rundy bez możliwości eksploracji. Przy 0.0005, agent zachowuje znaczącą eksplorację (ε > 0.05) przez CAŁY trening 500 rund, co oznacza że sieć będzie eksplorować różne strategie, zbierać zróżnicowane doświadczenia i powoli zmniejszać losowość w miarę nauki. To klasyczny problem premature exploitation w RL.
- **Wynik po 500 rund:** CZEKA NA WYNIKI
- **Wniosek:** Oczekiwanie na wyniki...
- **Następny krok:** Zebrać wyniki po 500 rundach, ocenić czy wolniejszy decay epsilon dał DQN szansę nauczyć się lepszej strategii przez dłuższą eksplorację.

---

### [2026-04-05 07:16 UTC] Zmiana: Increase Forteca rewardCapture 0.08 to 0.15

- **Plik:** `server/config.js`
- **Zmiana:** rewardCapture: 0.08 -> 0.15 (forteca only, agresor unchanged at 0.15)
- **Hipoteza:** Forteca rewardCapture=0.08 jest najnizsza ze wszystkich nagrod krok-po-kroku - zbyt niska by nauczyc agenta taktycznych zbiórek potrzebnych do efektywnej obrony. Wyrównanie do 0.15 poprawi obrone pozycyjna Forteca. Oczekiwany wzrost ELO: 30-60 punktów.
- **Wyniki poprzedniego eksperymentu:** CZEKA NA WYNIKI - wszystkie poprzednie eksperymenty nie zmierzly wyników (błąd fetch w selfplay + serwer crashowal)
- **Następny krok:** Uruchomic 500-rundowy selfplay i zmierzyc wyniki po 500 rundach.
### [2026-04-05 07:38 UTC] Zmiana: Increase Forteca rewardAdvance 0.03 to 0.10
### [2026-04-05 07:36 UTC] Zmiana: Increase Forteca rewardAdvance 0.03 to 0.10
- **Plik:** `server/config.js`
- **Zmiana:** rewardAdvance: 0.03 → 0.10
- **Hipoteza:** Higher rewardAdvance will strengthen Forteca defensive positioning by rewarding piece advancement needed for wall/chain formation, improving ELO vs minimax
- **Wyniki poprzedniego:** brak wyników
- **Następny krok:** Observe Forteca ELO vs minimax over next training sessions; if no improvement, test 0.15
