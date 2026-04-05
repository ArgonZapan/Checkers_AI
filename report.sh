#!/bin/bash
# Checkers AI Arena - Report Generator
# Autor: Hermes Agent

echo "============================================"
echo "   CHECKERS AI ARENA - RAPORT ANALITYCZNY"
echo "============================================"
echo ""

META="/root/Checkers_AI/models/meta.json"

# === 1. STATYSTYKI GIER (W/L/D) ===
echo ">>> 1. WYNIKI GIER (Wszystkie rundy)"
echo "--------------------------------------------"

if [ -f "$META" ]; then
  ROUND=$(node -e "const d=require('$META'); console.log(d.round)")
  echo "Aktualna runda: $ROUND"
  echo ""

  echo "+------------+--------+--------+--------+--------+"
  echo "| Model      |  Wyg.  | Przeg. | Remis | Razem  |"
  echo "+------------+--------+--------+--------+--------+"

  for MODEL in agresor forteca minimax; do
    WINS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.wins)")
    LOSS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.losses)")
    DRAW=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.draws)")
    TOTAL=$((WINS + LOSS + DRAW))
    printf "| %-10s | %6s | %6s | %6s | %6s |\n" "$MODEL" "$WINS" "$LOSS" "$DRAW" "$TOTAL"
  done
  echo "+------------+--------+--------+--------+--------+"
fi

echo ""
echo ">>> 2. STATYSTYKI OD OSTATNIEGO TRENINGU"
echo "--------------------------------------------"
if [ -f "$META" ]; then
  echo "+------------+--------+--------+--------+"
  echo "| Model      |  Wyg.  | Przeg. | Remis |"
  echo "+------------+--------+--------+--------+"
  for MODEL in agresor forteca minimax; do
    WINS=$(node -e "const d=require('$META'); console.log(d.statsSinceLastTrain.$MODEL.wins)")
    LOSS=$(node -e "const d=require('$META'); console.log(d.statsSinceLastTrain.$MODEL.losses)")
    DRAW=$(node -e "const d=require('$META'); console.log(d.statsSinceLastTrain.$MODEL.draws)")
    printf "| %-10s | %6s | %6s | %6s |\n" "$MODEL" "$WINS" "$LOSS" "$DRAW"
  done
  echo "+------------+--------+--------+--------+"
fi

echo ""
echo ">>> 3. RANKING ELO"
echo "--------------------------------------------"
if [ -f "$META" ]; then
  for MODEL in agresor forteca minimax; do
    ELO=$(node -e "const d=require('$META'); console.log(d.elo.$MODEL)")
    echo "  $MODEL: $ELO"
  done
fi

# === 2. HIPERPARAMETRY ===
echo ""
echo "============================================"
echo "   2. HIPERPARAMETRY I KONFIGURACJA"
echo "============================================"
echo ""

echo ">>> A. HIPERPARAMETRY - AGRESOR (DQN)"
echo "--------------------------------------------"
node -e "
const c = require('/root/Checkers_AI/server/config.js').ai.strategies.agresor;
const g = require('/root/Checkers_AI/server/config.js').ai;
console.log('  Typ:              ' + c.type);
console.log('  Epsilon start:    ' + c.epsilon);
console.log('  Epsilon min:      ' + c.minEpsilon);
console.log('  Epsilon decay:    ' + c.epsilonDecay);
console.log('  Gamma (discount): ' + g.gamma);
console.log('  Buffer size:      ' + g.bufferSize);
console.log('');
console.log('  Wagi reward:');
console.log('    - Material:     ' + c.weights.material);
console.log('    - Position:    ' + c.weights.position);
console.log('    - Threat:      ' + c.weights.threat);
console.log('    - Tempo:       ' + c.weights.tempo);
console.log('');
console.log('  Rewards:');
console.log('    - Capture:     ' + c.rewardCapture);
console.log('    - Advance:     ' + c.rewardAdvance);
console.log('    - Promotion:   ' + c.rewardPromotion);
console.log('    - Win:         ' + c.rewardWin);
console.log('    - Lose:        ' + c.rewardLose);
"

echo ""
echo ">>> B. HIPERPARAMETRY - FORTECA (DQN)"
echo "--------------------------------------------"
node -e "
const c = require('/root/Checkers_AI/server/config.js').ai.strategies.forteca;
console.log('  Typ:              ' + c.type);
console.log('  Epsilon start:    ' + c.epsilon);
console.log('  Epsilon min:      ' + c.minEpsilon);
console.log('  Epsilon decay:    ' + c.epsilonDecay);
console.log('');
console.log('  Wagi reward:');
console.log('    - Material:     ' + c.weights.material);
console.log('    - Position:    ' + c.weights.position);
console.log('    - Threat:      ' + c.weights.threat);
console.log('    - Tempo:       ' + c.weights.tempo);
console.log('');
console.log('  Rewards:');
console.log('    - Capture:     ' + c.rewardCapture);
console.log('    - Advance:     ' + c.rewardAdvance);
console.log('    - Promotion:   ' + c.rewardPromotion);
console.log('    - Win:         ' + c.rewardWin);
console.log('    - Lose:        ' + c.rewardLose);
"

echo ""
echo ">>> C. HIPERPARAMETRY - MINIMAX"
echo "--------------------------------------------"
node -e "
const c = require('/root/Checkers_AI/server/config.js').ai.strategies.minimax;
console.log('  Typ:              ' + c.type);
console.log('  Depth:            ' + c.depth);
console.log('  Waga material:    ' + c.weights.material);
console.log('  Waga position:   ' + c.weights.position);
"

echo ""
echo ">>> D. GLOBALNE USTAWIENIA SERWERA"
echo "--------------------------------------------"
node -e "
const c = require('/root/Checkers_AI/server/config.js').server;
console.log('  Port:             ' + c.port);
console.log('  Host:             ' + c.host);
console.log('  Engine port:      ' + c.enginePort);
console.log('  Speed mode:       ' + c.speedMode);
console.log('  Normal delay:     ' + c.normalModeDelayMs + 'ms');
console.log('  AI move delay:    ' + c.aiMoveDelayMs + 'ms');
console.log('  Auto-save co:     ' + (c.autoSaveMs/1000) + 's');
"

# === 3. BUFORY I ROZMIARY ===
echo ""
echo "============================================"
echo "   3. ROZMIARY BUFOROW I PLIKOW"
echo "============================================"
echo ""
for BUF in buffer_agresor buffer_forteca; do
  FILE="/root/Checkers_AI/data/$BUF.json"
  if [ -f "$FILE" ]; then
    SIZE=$(du -h "$FILE" | cut -f1)
    LINES=$(wc -l < "$FILE")
    ENTRIES=$(node -e "const d=require('$FILE'); console.log(d.length)" 2>/dev/null || echo "N/A")
    echo "  $BUF.json: $SIZE ($LINES linii, ~$ENTRIES wpisow)"
  fi
done

echo ""
ENGINE_BIN="/root/Checkers_AI/engine/build/checkers-server"
if [ -f "$ENGINE_BIN" ]; then
  SIZE=$(du -h "$ENGINE_BIN" | cut -f1)
  echo "  Silnik C++ (binarka): $SIZE"
fi

# === 4. AKTUALNY EPSILON ===
echo ""
echo "============================================"
echo "   4. AKTUALNY STAN EPSILON"
echo "============================================"
if [ -f "$META" ]; then
  for MODEL in agresor forteca; do
    EPS=$(node -e "const d=require('$META'); console.log(d.epsilon.$MODEL)")
    echo "  $MODEL epsilon: $EPS"
  done
fi

echo ""
echo "============================================"
echo "   RAPORT ZAKONCZONY"
echo "============================================"
