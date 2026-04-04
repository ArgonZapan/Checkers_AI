const CONFIG = require('../config');
const { ReplayBuffer } = require('./buffer');
const { createModel, predict, train, disposeModel, flipBoardInput } = require('./model');
const { cppFetch, delay, computeReward } = require('../utils');

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
    this.buffers = {
      agresor: new ReplayBuffer(config.ai.bufferSize),
      forteca: new ReplayBuffer(config.ai.bufferSize)
    };
    this.models = {
      agresor: createModel(256, 3, 128, 'relu'),
      forteca: createModel(256, 3, 128, 'relu')
    };
    this.lossHistory = { agresor: [], forteca: [] };
    this._runtimeEpsilon = { agresor: 0.5, forteca: 0.2 };
    this._trainingInterval = null;
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.io.emit('selfPlayStatus', { active: true, round: this.round, elo: { ...this.elo } });
    this._startParallelTraining();
    await this._startGameLoop();
  }

  stop() {
    this.active = false;
    if (this._trainingInterval) {
      clearInterval(this._trainingInterval);
      this._trainingInterval = null;
    }
    this.io.emit('selfPlayStatus', { active: false, round: this.round, elo: { ...this.elo } });
  }

  _startParallelTraining() {
    this._trainingInterval = setInterval(async () => {
      if (!this.active) return;
      await this._trainOnce();
    }, 60000);
  }

  async _trainOnce() {
    this.io.emit('trainingStatus', { active: true, timeLeft: 60 });
    const startTime = Date.now();
    const timeLimit = 55000;
    let tick = 0;

    while (Date.now() - startTime < timeLimit && this.active) {
      for (const name of ['agresor', 'forteca']) {
        const buf = this.buffers[name];
        if (buf.size() >= 64) {
          const batch = buf.sampleRandom(64);
          const trainBatch = batch.map(entry => ({ ...entry, valueTarget: entry.reward }));
          const result = await train(this.models[name], trainBatch, {
            lr: 0.001, epochs: 1, gamma: this.config.ai.gamma
          });
          this.lossHistory[name].push(result.loss);
          if (this.lossHistory[name].length > 1000) this.lossHistory[name].shift();
          tick++;
          if (tick % 10 === 0) this.io.emit('train', { model: name, loss: result.loss });
        }
      }
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      this.io.emit('trainingStatus', { active: true, timeLeft: Math.max(0, 60 - elapsed) });
      await delay(100);
    }

    for (const name of ['agresor', 'forteca']) {
      const strat = this.config.ai.strategies[name];
      this._runtimeEpsilon[name] = Math.max(this._runtimeEpsilon[name] - strat.epsilonDecay, strat.minEpsilon);
    }
    this.io.emit('trainingStatus', { active: false, timeLeft: 0 });
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
      this.io.emit('selfPlayStatus', { active: true, round: this.round, elo: { ...this.elo } });

      for (const matchup of matchups) {
        if (!this.active) return;
        await cppFetch('/api/game/reset', 'POST');
        await this._playSingleGame(matchup);
      }

      this.io.emit('roundComplete', {
        round: this.round,
        elo: { ...this.elo },
        stats: { ...this.stats }
      });
    }
  }

  async _playSingleGame(matchup) {
    let state = await cppFetch('/api/game/full-state', 'POST', {});
    const moves = [];

    while (this.active && !state.gameOver) {
      const isWhite = state.turn === 'white';
      const strategyName = isWhite ? matchup.white : matchup.black;
      let chosenMove;

      if (strategyName === 'minimax') {
        const depth = this.config.minimax.depth;
        const result = await cppFetch('/api/engine/best-move', 'POST', { depth });
        chosenMove = result.move;
      } else {
        const model = this.models[strategyName];
        const eps = this._runtimeEpsilon[strategyName] || this.config.ai.strategies[strategyName].epsilon;
        let boardInput = state.board;
        if (!isWhite) boardInput = flipBoardInput(state.board);

        const result = await predict(model, boardInput, state.legalMoves, eps);
        if (state.legalMoves[result.moveIdx]) {
          chosenMove = state.legalMoves[result.moveIdx];
        } else {
          const fallback = await cppFetch('/api/engine/best-move', 'POST', { depth: 4 });
          chosenMove = fallback.move;
        }

        const reward = computeReward(strategyName, state.board, chosenMove, this.config);
        this.buffers[strategyName].add({
          board: state.board,
          from: chosenMove.from,
          to: chosenMove.to,
          turn: isWhite ? 1 : -1,
          reward: reward
        });
      }

      if (chosenMove) {
        moves.push(chosenMove);
        try {
          const fromArr = Array.isArray(chosenMove.from) ? chosenMove.from : [chosenMove.from.row, chosenMove.from.col];
          const toArr = Array.isArray(chosenMove.to) ? chosenMove.to : [chosenMove.to.row, chosenMove.to.col];
          state = await cppFetch('/api/move', 'POST', { from: fromArr, to: toArr });
        } catch (e) {
          console.error('Move error:', e.message);
          break;
        }
      }

      this.io.emit('gameState', {
        game: matchup.idx + 1,
        board: state.board,
        turn: state.turn,
        gameOver: state.gameOver,
        lastMove: chosenMove ? { from: chosenMove.from, to: chosenMove.to } : null
      });

const baseDelay = this.config.server.speedMode === 'normal' ? this.config.server.normalModeDelayMs : 0;
      // Suwak kontroluje całkowity delay, nie dodaje do baseDelay
      const totalDelay = this.config.server.aiMoveDelayMs ?? baseDelay;
      if (totalDelay > 0) await delay(totalDelay);
    }

    const winner = state.winner; // "white", "black", lub null/draw

    if (winner === 'white') {
      // Biały wygrywa - to jest matchup.white
      this.stats[matchup.white].wins++;
      this.stats[matchup.black].losses++;
      this.elo[matchup.white] = updateElo(this.elo[matchup.white], this.elo[matchup.black], 1);
      this.elo[matchup.black] = updateElo(this.elo[matchup.black], this.elo[matchup.white], 0);
    } else if (winner === 'black') {
      // Czarny wygrywa - to jest matchup.black
      this.stats[matchup.black].wins++;
      this.stats[matchup.white].losses++;
      this.elo[matchup.black] = updateElo(this.elo[matchup.black], this.elo[matchup.white], 1);
      this.elo[matchup.white] = updateElo(this.elo[matchup.white], this.elo[matchup.black], 0);
    } else {
      // Remis lub brak zwycięzcy
      this.stats[matchup.white].draws++;
      this.stats[matchup.black].draws++;
      this.elo[matchup.white] = updateElo(this.elo[matchup.white], this.elo[matchup.black], 0.5);
      this.elo[matchup.black] = updateElo(this.elo[matchup.black], this.elo[matchup.white], 0.5);
    }

    const winnerName = winner === 'white' ? matchup.white.charAt(0).toUpperCase() + matchup.white.slice(1) : 
                       winner === 'black' ? matchup.black.charAt(0).toUpperCase() + matchup.black.slice(1) : null;
    this.io.emit('gameOver', { game: matchup.idx + 1, winner: winnerName || 'draw', moves: moves.length });
  }

  saveCheckpoint() {
    try {
      const fs = require('fs');
      const meta = { round: this.round, elo: this.elo, stats: this.stats, paramsVersion: this.paramsVersion, epsilon: this._runtimeEpsilon };
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
        this.paramsVersion = meta.paramsVersion || 0;
        this._runtimeEpsilon = meta.epsilon || { agresor: 0.5, forteca: 0.2 };
        this.buffers.agresor.load('data/buffer_agresor.json');
        this.buffers.forteca.load('data/buffer_forteca.json');
      }
    } catch (e) { console.error('Checkpoint load error:', e.message); }
  }

  reset() {
    this.round = 0;
    this.elo = { agresor: 1500, forteca: 1500, minimax: 1500 };
    this.stats = { agresor: { wins: 0, losses: 0, draws: 0 }, forteca: { wins: 0, losses: 0, draws: 0 }, minimax: { wins: 0, losses: 0, draws: 0 } };
    this.lossHistory = { agresor: [], forteca: [] };
    this.buffers.agresor.clear();
    this.buffers.forteca.clear();
    disposeModel(this.models.agresor);
    disposeModel(this.models.forteca);
    this.models.agresor = createModel(256, 3, 128, 'relu');
    this.models.forteca = createModel(256, 3, 128, 'relu');
    this._runtimeEpsilon = { agresor: 0.5, forteca: 0.2 };
    this.paramsVersion++;
  }

  restartModels(which) {
    if (which === 'agresor' || which === 'both') {
      disposeModel(this.models.agresor);
      this.models.agresor = createModel(256, 3, 128, 'relu');
      this.buffers.agresor.clear();
      this.io.emit('modelRestart', { model: 'agresor' });
    }
    if (which === 'forteca' || which === 'both') {
      disposeModel(this.models.forteca);
      this.models.forteca = createModel(256, 3, 128, 'relu');
      this.buffers.forteca.clear();
      this.io.emit('modelRestart', { model: 'forteca' });
    }
  }

  getStatus() {
    return {
      active: this.active, round: this.round, elo: { ...this.elo }, stats: { ...this.stats },
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
