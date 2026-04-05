#!/bin/bash
# Checkers AI Arena - Comprehensive Report Generator
# Lokalizacja: /root/Checkers_AI/report.sh

set -e

PROJECT="/root/Checkers_AI"
META="$PROJECT/models/meta.json"
CONFIG="$PROJECT/server/config.js"

# === KOLORY ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# === HEADER ===
echo -e "${BOLD}${CYAN}============================================${RESET}"
echo -e "${BOLD}${CYAN}   CHECKERS AI ARENA - RAPORT ANALITYCZNY  ${RESET}"
echo -e "${BOLD}${CYAN}============================================${RESET}"
echo ""

# === 1. STATYSTYKI GIER (W/L/D) ===
echo -e "${BOLD}[1] WYNIKI GIER${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"

if [ -f "$META" ]; then
  ROUND=$(node -e "const d=require('$META'); console.log(d.round)")
  echo -e "  ${BOLD}Aktualna runda:${RESET} $ROUND"
  echo ""

  echo -e "  +------------+--------+--------+--------+--------+"
  echo -e "  | ${BOLD}Model${RESET}      |  ${BOLD}Wyg.${RESET}  |  ${BOLD}Przeg.${RESET} |  ${BOLD}Remis${RESET} |  ${BOLD}Razem${RESET}  |"
  echo -e "  +------------+--------+--------+--------+--------+"

  TOTAL_W=0; TOTAL_L=0; TOTAL_D=0
  for MODEL in agresor forteca minimax; do
    WINS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.wins)")
    LOSS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.losses)")
    DRAW=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.draws)")
    TOTAL=$((WINS + LOSS + DRAW))
    TOTAL_W=$((TOTAL_W + WINS))
    TOTAL_L=$((TOTAL_L + LOSS))
    TOTAL_D=$((TOTAL_D + DRAW))
    printf "  | %-10s | %6s | %6s | %6s | %6s |\n" "$MODEL" "$WINS" "$LOSS" "$DRAW" "$TOTAL"
  done
  echo -e "  +------------+--------+--------+--------+--------+"

  # Winrate
  echo ""
  echo -e "  ${BOLD}Winrate (vs wszystkie):${RESET}"
  for MODEL in agresor forteca minimax; do
    WINS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.wins)")
    LOSS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.losses)")
    DRAW=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.draws)")
    TOTAL=$((WINS + LOSS + DRAW))
    if [ $TOTAL -gt 0 ]; then
      WR=$(node -e "console.log((${WINS} + ${DRAW}*0.5) / ${TOTAL} * 100)")
      printf "    %-10s: %.1f%%\n" "$MODEL" "$WR"
    fi
  done
fi

# === 1b. STATYSTYKI OD OSTATNIEGO TRENINGU ===
echo ""
echo -e "${BOLD}[1b] STATYSTYKI OD OSTATNIEGO TRENINGU${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"
if [ -f "$META" ]; then
  echo -e "  +------------+--------+--------+--------+"
  echo -e "  | ${BOLD}Model${RESET}      |  ${BOLD}Wyg.${RESET}  |  ${BOLD}Przeg.${RESET} |  ${BOLD}Remis${RESET} |"
  echo -e "  +------------+--------+--------+--------+"
  for MODEL in agresor forteca minimax; do
    WINS=$(node -e "const d=require('$META'); console.log(d.statsSinceLastTrain.$MODEL.wins)")
    LOSS=$(node -e "const d=require('$META'); console.log(d.statsSinceLastTrain.$MODEL.losses)")
    DRAW=$(node -e "const d=require('$META'); console.log(d.statsSinceLastTrain.$MODEL.draws)")
    printf "  | %-10s | %6s | %6s | %6s |\n" "$MODEL" "$WINS" "$LOSS" "$DRAW"
  done
  echo -e "  +------------+--------+--------+--------+"
fi

# === 1c. RANKING ELO ===
echo ""
echo -e "${BOLD}[1c] RANKING ELO${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"
if [ -f "$META" ]; then
  # Sort by ELO
  for MODEL in agresor forteca minimax; do
    ELO=$(node -e "const d=require('$META'); console.log(d.elo.$MODEL)")
    echo -e "    $MODEL: $ELO"
  done
fi

# === 2. HIPERPARAMETRY ===
echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}[2] HIPERPARAMETRY I KONFIGURACJA${RESET}"
echo -e "${BOLD}============================================${RESET}"
echo ""

# AGRESOR
echo -e "${GREEN}[A] AGRESOR (DQN)${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"
node -e "
const c = require('$CONFIG').ai.strategies.agresor;
const g = require('$CONFIG').ai;
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

# FORTECA
echo ""
echo -e "${GREEN}[B] FORTECA (DQN)${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"
node -e "
const c = require('$CONFIG').ai.strategies.forteca;
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

# MINIMAX
echo ""
echo -e "${GREEN}[C] MINIMAX${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"
node -e "
const c = require('$CONFIG').ai.strategies.minimax;
console.log('  Typ:              ' + c.type);
console.log('  Depth:            ' + c.depth);
console.log('  Waga material:    ' + c.weights.material);
console.log('  Waga position:   ' + c.weights.position);
"

# SERWER
echo ""
echo -e "${GREEN}[D] GLOBALNE USTAWIENIA SERWERA${RESET}"
echo -e "${YELLOW}--------------------------------------------${RESET}"
node -e "
const c = require('$CONFIG').server;
console.log('  Port:             ' + c.port);
console.log('  Host:             ' + c.host);
console.log('  Engine port:      ' + c.enginePort);
console.log('  Speed mode:       ' + c.speedMode);
console.log('  Normal delay:     ' + c.normalModeDelayMs + 'ms');
console.log('  AI move delay:    ' + c.aiMoveDelayMs + 'ms');
console.log('  Auto-save co:     ' + (c.autoSaveMs/1000) + 's');
"

# === 3. ARCHITEKTURA SIECI ===
echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}[3] ARCHITEKTURA SIECI NEURONOWEJ${RESET}"
echo -e "${BOLD}============================================${RESET}"
echo ""
echo -e "${GREEN}AGRESOR${RESET}"
echo "  Input:  256 (8x8 board, 4 channels x 64 pol)"
echo "  Layer1: 256 neuronow, ReLU"
echo "  Layer2: 256 neuronow, ReLU"
echo "  Layer3: 256 neuronow, ReLU"
echo "  Layer4: 256 neuronow, ReLU"
echo "  Shared: 128 neuronow, ReLU"
echo "  Output: 32 (Q-values per move)"
echo ""
echo -e "${GREEN}FORTECA${RESET}"
echo "  Input:  256 (8x8 board, 4 channels x 64 pol)"
echo "  Layer1: 128 neuronow, ReLU"
echo "  Layer2: 128 neuronow, ReLU"
echo "  Layer3: 128 neuronow, ReLU"
echo "  Shared: 64 neuronow, ReLU"
echo "  Output: 32 (Q-values per move)"

# === 4. BUFORY I ROZMIARY ===
echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}[4] ROZMIARY BUFOROW I PLIKOW${RESET}"
echo -e "${BOLD}============================================${RESET}"
echo ""
for BUF in buffer_agresor buffer_forteca; do
  FILE="$PROJECT/data/$BUF.json"
  if [ -f "$FILE" ]; then
    SIZE=$(du -h "$FILE" | cut -f1)
    ENTRIES=$(node -e "const d=require('$FILE'); console.log(d.length)" 2>/dev/null || echo "N/A")
    MAX_SIZE=$(node -e "const c=require('$CONFIG'); console.log(c.ai.bufferSize)" 2>/dev/null || echo "500000")
    FILL=$(node -e "console.log(Math.round(${ENTRIES}/${MAX_SIZE}*100))")
    echo -e "  ${BOLD}$BUF.json:${RESET} $SIZE (~$ENTRIES wpisow, ${FILL}% zapełnienia)"
  fi
done

echo ""
ENGINE_BIN="$PROJECT/engine/build/checkers-server"
if [ -f "$ENGINE_BIN" ]; then
  SIZE=$(du -h "$ENGINE_BIN" | cut -f1)
  echo -e "  ${BOLD}Silnik C++ (binarka):${RESET} $SIZE"
fi

# === 5. AKTUALNY EPSILON ===
echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}[5] AKTUALNY STAN EPSILON${RESET}"
echo -e "${BOLD}============================================${RESET}"
if [ -f "$META" ]; then
  for MODEL in agresor forteca; do
    EPS=$(node -e "const d=require('$META'); console.log(d.epsilon.$MODEL)")
    MIN_EPS=$(node -e "const d=require('$CONFIG'); console.log(d.ai.strategies.$MODEL.minEpsilon)")
    STATUS="OK"
    if (( $(echo "$EPS <= $MIN_EPS" | bc -l) )); then STATUS="${GREEN}MIN${RESET}"; else STATUS="${YELLOW}DECAYING${RESET}"; fi
    printf "  %-10s epsilon: %.4f [%s]\n" "$MODEL" "$EPS" "$STATUS"
  done
fi

# === 6. HISTORIA ZMIAN ===
echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}[6] OSTATNIE ZMIANY (git log)${RESET}"
echo -e "${BOLD}============================================${RESET}"
echo ""
cd "$PROJECT"
git log --oneline -10 2>/dev/null | while read -r line; do
  echo -e "  $line"
done

# === 7. ANALIZA POSZKUPL ===
echo ""
echo -e "${BOLD}============================================${RESET}"
echo -e "${BOLD}[7] ANALIZA POSZKUPL${RESET}"
echo -e "${BOLD}============================================${RESET}"
echo ""

if [ -f "$META" ]; then
  MINIMAX_ELO=$(node -e "const d=require('$META'); console.log(d.elo.minimax)")
  AGRESOR_ELO=$(node -e "const d=require('$META'); console.log(d.elo.agresor)")
  FORTECA_ELO=$(node -e "const d=require('$META'); console.log(d.elo.forteca)")
  
  DIFF_AGR=$(( $(echo "$AGRESOR_ELO" | cut -d. -f1) - $(echo "$MINIMAX_ELO" | cut -d. -f1) ))
  DIFF_FOR=$(( $(echo "$FORTECA_ELO" | cut -d. -f1) - $(echo "$MINIMAX_ELO" | cut -d. -f1) ))
  
  echo -e "  ${BOLD}Cel:${RESET} DQN ELO > Minimax ELO (DQN pokonuje Minimax)"
  echo ""
  echo -e "  ${BOLD}Aktualny dystans do celu:${RESET}"
  printf "    Agresor vs Minimax: %+d ELO\n" "$DIFF_AGR"
  printf "    Forteca vs Minimax: %+d ELO\n" "$DIFF_FOR"
  echo ""
  
  if [ $DIFF_AGR -lt 0 ]; then
    echo -e "  ${RED}✗ Agresor:${RESET} Slabszy niz Minimax o $((-DIFF_AGR)) punktow"
  else
    echo -e "  ${GREEN}✓ Agresor:${RESET} Silniejszy niz Minimax o $DIFF_AGR punktow"
  fi
  
  if [ $DIFF_FOR -lt 0 ]; then
    echo -e "  ${RED}✗ Forteca:${RESET} Slabsza niz Minimax o $((-DIFF_FOR)) punktow"
  else
    echo -e "  ${GREEN}✓ Forteca:${RESET} Silniejsza niz Minimax o $DIFF_FOR punktow"
  fi
  
  # Winrate analysis
  echo ""
  echo -e "  ${BOLD}Analiza winrate:${RESET}"
  for MODEL in agresor forteca; do
    WINS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.wins)")
    LOSS=$(node -e "const d=require('$META'); console.log(d.stats.$MODEL.losses)")
    TOTAL=$((WINS + LOSS))
    if [ $TOTAL -gt 0 ]; then
      WR=$(node -e "console.log((${WINS} / ${TOTAL} * 100).toFixed(1))")
      if (( $(echo "$WR > 50" | bc -l) )); then
        echo -e "    ${GREEN}✓${RESET} $MODEL: ${GREEN}${WR}%${RESET} winrate ($WINS W / $LOSS L)"
      else
        echo -e "    ${RED}✗${RESET} $MODEL: ${RED}${WR}%${RESET} winrate ($WINS W / $LOSS L)"
      fi
    fi
  done
fi

echo ""
echo -e "${BOLD}${CYAN}============================================${RESET}"
echo -e "${BOLD}${CYAN}   RAPORT ZAKONCZONY${RESET}"
echo -e "${BOLD}${CYAN}============================================${RESET}"
