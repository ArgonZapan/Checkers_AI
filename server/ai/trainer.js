const CONFIG = require('../config');
const { ReplayBuffer } = require('./buffer');
const { createModel, predict, train, disposeModel, flipBoardInput } = require('./model');
const { delay, computeReward } = require('../utils');

async function localFetch(endpoint, method = 'POST', body = null) {
  const url = `http://127.0.0.1:${CONFIG.server.port}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(CONFIG.server.fetchTimeoutMs)
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Engine proxy error: ${response.status} - ${errorText}`);
  }
  return response.json();
}

class SelfPlay {
  constructor(io, config = CONFIG) {
    this.io = io;
    this.config = config;
    this.active = false;
    this.round = 0;
    this.paramsVersion = 0;
    this.elo = { agresor: 1500, forteca: 1500, minimax: 1500 };
    this.stats = {
      agresor: { wins: 0, losses: 0, draws: 0 },
      forteca: { wins: 0, losses: 0, draws: 0 },
      minimax: { wins: 0, losses: 0, draws: 0 }
    };
    this.statsSinceLastTrain = {
      agresor: { wins: 0, losses: 0, draws: 0 },
      forteca: { wins: 0, losses: 0, draws: 0 },
      minimax: { wins: 0, losses: 0, draws: 0 }
    };
    this.buffers = {
      agresor: new ReplayBuffer(config.ai.bufferSize),
      forteca: new ReplayBuffer(config.ai.bufferSize)
    };
    this.models = {
      agresor: createModel(256, 4, 256, 'relu'),  // Larger network for agresor
      forteca: createModel(256, 3, 128, 'relu')
    };
    this.lossHistory = { agresor: [], forteca: [] };
    this._runtimeEpsilon = { agresor: 0.3, forteca: 0.3 };
    this._trainingIntervals = null;
  }

  _emitStatus(extra = {}) {
    this.io.emit('selfPlayStatus', {
      active: this.active, round: this.round, elo: { ...this.elo },
      stats: { ...this.stats }, statsSinceLastTrain: { ...this.statsSinceLastTrain },
      epsilon: { ...this._runtimeEpsilon }, ...extra
    });
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this._emitStatus();
    this._startParallelTraining();
    await this._startGameLoop();
  }

  stop() {
    this.active = false;
    if (this._trainingIntervals) {
      for (const interval of this._trainingIntervals) { if (interval) clearInterval(interval); }
      this._trainingIntervals = null;
    }
    this._emitStatus();
  }

  _startParallelTraining() {
    this._trainingIntervals = [];
    for (const name of ['agresor', 'forteca']) {
      const interval = setInterval(async () => {
        if (!this.active) return;
        await this._trainModel(name);
      }, 30000);
      this._trainingIntervals.push(interval);
    }
  }

  async _trainModel(name) {
    const buf = this.buffers[name];
    if (buf.size() < 64) return;
    const startTime = Date.now();
    const timeLimit = 20000; // 20 seconds
    let tick = 0;
    this.io.emit('trainingStatus', { active: true, model: name, timeLeft: 20 });
    console.log(`[Training] Starting training for ${name}, buffer size: ${buf.size()}`);
    // Don't reset statsSinceLastTrain here - reset at end of training

    while (Date.now() - startTime < timeLimit && this.active) {
      if (buf.size() < 64) { console.log(`[Training] Buffer ${name} too small (${buf.size()}), stopping`); break; }
      const batch = buf.sampleRandom(64);
      const trainBatch = batch.map(entry => ({ ...entry, valueTarget: entry.reward }));
      const result = await train(this.models[name], trainBatch, { lr: 0.001, epochs: 3, gamma: this.config.ai.gamma });
      this.lossHistory[name].push(result.loss);
      if (this.lossHistory[name].length > 1000) this.lossHistory[name].shift();
      tick++;
      this.io.emit('train', { model: name, loss: result.loss });
      if (tick % 50 === 0) console.log(`[Training] ${name} iteration ${tick}, loss: ${result.loss.toFixed(4)}`);
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      this.io.emit('trainingStatus', { active: true, model: name, timeLeft: Math.max(0, 20 - elapsed) });
      await Promise.resolve();
      await delay(200);
    }
    const finalLoss = this.lossHistory[name].length > 0 ? this.lossHistory[name][this.lossHistory[name].length - 1] : 0;
    console.log(`[Training] ${name} complete (${tick} iters, ${Date.now() - startTime}ms), loss: ${finalLoss.toFixed(4)}, eps: ${this._runtimeEpsilon[name].toFixed(4)}`);
    
    // Reset statsSinceLastTrain at END of training
    this.statsSinceLastTrain[name] = { wins: 0, losses: 0, draws: 0 };
    this.statsSinceLastTrain.minimax = { wins: 0, losses: 0, draws: 0 };
    
    this.io.emit('trainingStatus', { active: false, model: name, timeLeft: 0 });
    this.io.emit('train', { model: name, loss: finalLoss, done: true });
    this._emitStatus(); // Emit updated stats with reset statsSinceLastTrain
    this.saveCheckpoint();
  }

  async _startGameLoop() {
    const matchups = [
      { white: 'agresor', black: 'forteca', idx: 0 },
      { white: 'forteca', black: 'agresor', idx: 1 },
      { white: 'agresor', black: 'minimax', idx: 2 },
      { white: 'minimax', black: 'agresor', idx: 3 },
      { white: 'forteca', black: 'minimax', idx: 4 },
      { white: 'minimax', black: 'forteca', idx: 5 }
    ];
    while (this.active) {
      this.round++;
      // Decay epsilon each round (1% per round)
      for (const name of ['agresor', 'forteca']) {
        const strat = this.config.ai.strategies[name];
        this._runtimeEpsilon[name] = Math.max(this._runtimeEpsilon[name] - strat.epsilonDecay, strat.minEpsilon);
      }
      this._emitStatus();
      for (const matchup of matchups) {
        if (!this.active) return;
        await localFetch('/api/game/reset', 'POST');
        await this._playSingleGame(matchup);
      }
      this.io.emit('roundComplete', { round: this.round, elo: { ...this.elo }, stats: { ...this.stats }, statsSinceLastTrain: { ...this.statsSinceLastTrain }, epsilon: { ...this._runtimeEpsilon } });
    }
  }

  async _playSingleGame(matchup) {
    let state = await localFetch('/api/game/full-state', 'POST', {});
    const moves = [];
    while (this.active && !state.gameOver) {
      const isWhite = state.turn === 'white';
      const strategyName = isWhite ? matchup.white : matchup.black;
      const boardBefore = [...state.board]; // Clone board before move
      let chosenMove;
      if (strategyName === 'minimax') {
        const result = await localFetch('/api/engine/best-move', 'POST', { depth: this.config.minimax.depth });
        chosenMove = result.move;
      } else {
        const model = this.models[strategyName];
        const eps = this._runtimeEpsilon[strategyName] || this.config.ai.strategies[strategyName].epsilon;
        let boardInput = state.board;
        if (!isWhite) boardInput = flipBoardInput(state.board);
        const result = await predict(model, boardInput, state.legalMoves, eps);
        if (typeof result.moveIdx === 'number' && result.moveIdx >= 0 && result.moveIdx < state.legalMoves.length && state.legalMoves[result.moveIdx]) {
          chosenMove = state.legalMoves[result.moveIdx];
        } else {
          const fallback = await localFetch('/api/engine/best-move', 'POST', { depth: 4 });
          chosenMove = fallback.move;
        }
      }
      if (chosenMove) {
        moves.push(chosenMove);
        try {
          const fromArr = Array.isArray(chosenMove.from) ? chosenMove.from : [chosenMove.from.row, chosenMove.from.col];
          const toArr = Array.isArray(chosenMove.to) ? chosenMove.to : [chosenMove.to.row, chosenMove.to.col];
          state = await localFetch('/api/move', 'POST', { from: fromArr, to: toArr });
          // Compute reward AFTER move using boardBefore and boardAfter
          if (strategyName !== 'minimax') {
            const reward = computeReward(strategyName, boardBefore, state.board, chosenMove, this.config);
            this.buffers[strategyName].add({ board: boardBefore, from: chosenMove.from, to: chosenMove.to, turn: isWhite ? 1 : -1, reward });
          }
        } catch (e) { console.error('Move error:', e.message); break; }
      }
      this.io.emit('gameState', { game: matchup.idx + 1, board: state.board, turn: state.turn, gameOver: state.gameOver, lastMove: chosenMove ? { from: chosenMove.from, to: chosenMove.to } : null });
      const baseDelay = this.config.server.speedMode === 'normal' ? this.config.server.normalModeDelayMs : 0;
      const totalDelay = this.config.server.aiMoveDelayMs ?? baseDelay;
      if (totalDelay > 0) await delay(totalDelay);
    }
    const winner = state.winner;
    // Add terminal reward for the last move of each DQN player
    if (moves.length > 0) {
      const lastMove = moves[moves.length - 1];
      const lastStrategyName = state.turn === 'white' ? matchup.black : matchup.white;
      if (lastStrategyName !== 'minimax') {
        const won = (winner === 'white' && lastStrategyName === matchup.white) || 
                    (winner === 'black' && lastStrategyName === matchup.black);
        const reward = computeReward(lastStrategyName, state.board, state.board, lastMove, this.config, true, won);
        this.buffers[lastStrategyName].add({ board: state.board, from: lastMove.from, to: lastMove.to, turn: 1, reward });
      }
      // Also add terminal reward for the opponent (who lost)
      const oppStrategyName = state.turn === 'white' ? matchup.white : matchup.black;
      if (oppStrategyName !== 'minimax') {
        const oppWon = (winner === 'white' && oppStrategyName === matchup.white) || 
                       (winner === 'black' && oppStrategyName === matchup.black);
        const oppReward = computeReward(oppStrategyName, state.board, state.board, lastMove, this.config, true, oppWon);
        this.buffers[oppStrategyName].add({ board: state.board, from: lastMove.from, to: lastMove.to, turn: -1, reward: oppReward });
      }
    }
    
    if (winner === 'white') {
      this.stats[matchup.white].wins++; this.stats[matchup.black].losses++;
      this.statsSinceLastTrain[matchup.white].wins++; this.statsSinceLastTrain[matchup.black].losses++;
      this.elo[matchup.white] = updateElo(this.elo[matchup.white], this.elo[matchup.black], 1);
      this.elo[matchup.black] = updateElo(this.elo[matchup.black], this.elo[matchup.white], 0);
    } else if (winner === 'black') {
      this.stats[matchup.black].wins++; this.stats[matchup.white].losses++;
      this.statsSinceLastTrain[matchup.black].wins++; this.statsSinceLastTrain[matchup.white].losses++;
      this.elo[matchup.black] = updateElo(this.elo[matchup.black], this.elo[matchup.white], 1);
      this.elo[matchup.white] = updateElo(this.elo[matchup.white], this.elo[matchup.black], 0);
    } else {
      this.stats[matchup.white].draws++; this.stats[matchup.black].draws++;
      this.statsSinceLastTrain[matchup.white].draws++; this.statsSinceLastTrain[matchup.black].draws++;
      this.elo[matchup.white] = updateElo(this.elo[matchup.white], this.elo[matchup.black], 0.5);
      this.elo[matchup.black] = updateElo(this.elo[matchup.black], this.elo[matchup.white], 0.5);
    }
    this._emitStatus();
    const winnerName = winner === 'white' ? matchup.white.charAt(0).toUpperCase() + matchup.white.slice(1) :
                       winner === 'black' ? matchup.black.charAt(0).toUpperCase() + matchup.black.slice(1) : null;
    this.io.emit('gameOver', { game: matchup.idx + 1, winner: winnerName || 'draw', moves: moves.length });
  }

  saveCheckpoint() {
    try {
      const fs = require('fs');
      const meta = { round: this.round, elo: this.elo, stats: this.stats, statsSinceLastTrain: this.statsSinceLastTrain, paramsVersion: this.paramsVersion, epsilon: this._runtimeEpsilon };
      if (!fs.existsSync('models')) fs.mkdirSync('models', { recursive: true });
      if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });
      fs.writeFileSync('models/meta.json', JSON.stringify(meta, null, 2));
      this.buffers.agresor.save('data/buffer_agresor.json');
      this.buffers.forteca.save('data/buffer_forteca.json');
    } catch (e) { console.error('Checkpoint save error:', e.message); }
  }

  loadCheckpoint() {
    try {
      const fs = require('fs');
      if (fs.existsSync('models/meta.json')) {
        const meta = JSON.parse(fs.readFileSync('models/meta.json', 'utf8'));
        this.round = meta.round || 0;
        this.elo = meta.elo || this.elo;
        this.stats = meta.stats || this.stats;
        this.statsSinceLastTrain = meta.statsSinceLastTrain || { agresor: { wins: 0, losses: 0, draws: 0 }, forteca: { wins: 0, losses: 0, draws: 0 }, minimax: { wins: 0, losses: 0, draws: 0 } };
        this.paramsVersion = meta.paramsVersion || 0;
        this._runtimeEpsilon = meta.epsilon || { agresor: 1.0, forteca: 1.0 };
        this.buffers.agresor.load('data/buffer_agresor.json');
        this.buffers.forteca.load('data/buffer_forteca.json');
      }
    } catch (e) { console.error('Checkpoint load error:', e.message); }
  }

  reset() {
    this.round = 0;
    this.elo = { agresor: 1500, forteca: 1500, minimax: 1500 };
    this.stats = { agresor: { wins: 0, losses: 0, draws: 0 }, forteca: { wins: 0, losses: 0, draws: 0 }, minimax: { wins: 0, losses: 0, draws: 0 } };
    this.statsSinceLastTrain = { agresor: { wins: 0, losses: 0, draws: 0 }, forteca: { wins: 0, losses: 0, draws: 0 }, minimax: { wins: 0, losses: 0, draws: 0 } };
    this.lossHistory = { agresor: [], forteca: [] };
    this.buffers.agresor.clear(); this.buffers.forteca.clear();
    disposeModel(this.models.agresor); disposeModel(this.models.forteca);
    this.models.agresor = createModel(256, 4, 256, 'relu');
    this.models.forteca = createModel(256, 3, 128, 'relu');
    this._runtimeEpsilon = { agresor: 0.3, forteca: 0.3 };
    this.paramsVersion++;
  }

  restartModels(which) {
    this.statsSinceLastTrain.agresor = { wins: 0, losses: 0, draws: 0 };
    this.statsSinceLastTrain.forteca = { wins: 0, losses: 0, draws: 0 };
    this.statsSinceLastTrain.minimax = { wins: 0, losses: 0, draws: 0 };
    if (which === 'agresor' || which === 'both') {
      disposeModel(this.models.agresor);
      this.models.agresor = createModel(256, 4, 256, 'relu');
      this.buffers.agresor.clear();
      this.statsSinceLastTrain.agresor = { wins: 0, losses: 0, draws: 0 };
      this.io.emit('modelRestart', { model: 'agresor' });
    }
    if (which === 'forteca' || which === 'both') {
      disposeModel(this.models.forteca);
      this.models.forteca = createModel(256, 3, 128, 'relu');
      this.buffers.forteca.clear();
      this.statsSinceLastTrain.forteca = { wins: 0, losses: 0, draws: 0 };
      this.io.emit('modelRestart', { model: 'forteca' });
    }
    this._emitStatus();
  }

  getStatus() {
    return {
      active: this.active, round: this.round, elo: { ...this.elo }, stats: { ...this.stats },
      statsSinceLastTrain: { ...this.statsSinceLastTrain }, epsilon: { ...this._runtimeEpsilon },
      lossHistory: this.lossHistory,
      bufferSize: { agresor: this.buffers.agresor.size(), forteca: this.buffers.forteca.size() }
    };
  }
}

function updateElo(ratingMe, ratingOpponent, actualScore, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (ratingOpponent - ratingMe) / 400));
  return ratingMe + k * (actualScore - expected);
}

module.exports = { SelfPlay, updateElo };