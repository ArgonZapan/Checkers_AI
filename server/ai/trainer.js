const CONFIG = require('../config');
const { ReplayBuffer } = require('./buffer');
const { createModel, predict, getStateValue, disposeModel, flipBoardInput, boardToChannels } = require('./model');
const { delay, computeReward } = require('../utils');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── TrainingWorker: wraps a forked subprocess ──────────────────────────
class TrainingWorker {
  constructor(name) {
    this.name = name;
    this.proc = null;
    this.ready = false;
    this.pending = null; // { resolve, reject, timeout }
  }

  start() {
    this.proc = fork(path.join(__dirname, 'train-worker.js'), {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });
    this.proc.stdout?.on('data', d => console.log(`[Worker:${this.name}] ${d.toString().trim()}`));
    this.proc.stderr?.on('data', d => console.error(`[Worker:${this.name}] ${d.toString().trim()}`));
    this.proc.on('exit', (code) => console.log(`[Worker:${this.name}] exited ${code}`));
    this.proc.on('disconnect', () => console.log(`[Worker:${this.name}] disconnected`));
    this.proc.on('message', (msg) => this._onMessage(msg));
  }

  _onMessage(msg) {
    if (msg.status === 'ready' && this.pending) {
      const p = this.pending;
      this.pending = null;
      this.ready = true;
      p.resolve(msg);
      return;
    }
    if (msg.cmd === 'weights' && this.pending) {
      const p = this.pending;
      this.pending = null;
      p.resolve(msg);
      return;
    }
    if (msg.cmd === 'train_result' && this.pending) {
      const p = this.pending;
      this.pending = null;
      p.resolve(msg);
      return;
    }
    if (msg.status === 'weights_set' && this.pending) {
      const p = this.pending;
      this.pending = null;
      p.resolve(msg);
      return;
    }
  }

  _send(msg) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Worker:${this.name} timeout`));
      }, 45000);
      this.pending = { resolve, reject, timeout };
      this.proc.send(msg);
    });
  }

  async init(weightsPath) {
    await this._send({ cmd: 'init', name: this.name, weightsPath });
  }

  async train(batch, opts) {
    const { lr, gamma, epochs, subBatchSize, weightsPath } = opts;
    const result = await this._send({
      cmd: 'train', batch, lr, gamma, epochs, subBatchSize, weightsPath
    });
    if (result.error) throw new Error(result.error);
    return result;
  }

  async syncWeightsTo(model) {
    const msg = await this._send({ cmd: 'get_weights' });
    if (msg.error) throw new Error(msg.error);
    model.setWeights(msg.weights.map(w => {
      // Handle nested arrays (e.g. kernels) and flat arrays (biases)
      return Array.isArray(w[0]) ? tf.tensor2d(w) : tf.tensor(w);
    }));
  }

  stop() {
    if (this.pending) {
      this.pending.reject(new Error('Worker shutting down'));
      this.pending = null;
    }
    if (this.proc) {
      try { this.proc.send({ cmd: 'shutdown' }); } catch(_) {}
      this.proc.kill();
    }
  }
}

// ── SelfPlay ────────────────────────────────────────────────────────────
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

    // Inference models (main process — never call train() on these)
    this.models = {
      agresor: createModel(256, 4, 256, 'relu'),
      forteca: createModel(256, 3, 128, 'relu')
    };

    // Training workers (forked subprocesses)
    this.workers = {
      agresor: new TrainingWorker('agresor'),
      forteca: new TrainingWorker('forteca')
    };

    this.lossHistory = { agresor: [], forteca: [] };
    this._runtimeEpsilon = { agresor: 0.3, forteca: 0.3 };
    this._trainingIntervals = null;
    this._trainCount = 0;
    this._lastGameStateEmit = 0;
    this.h2h = {
      agresor_vs_forteca:   { whiteWins: 0, blackWins: 0, draws: 0 },
      forteca_vs_agresor:   { whiteWins: 0, blackWins: 0, draws: 0 },
      agresor_vs_minimax:   { whiteWins: 0, blackWins: 0, draws: 0 },
      minimax_vs_agresor:   { whiteWins: 0, blackWins: 0, draws: 0 },
      forteca_vs_minimax:   { whiteWins: 0, blackWins: 0, draws: 0 },
      minimax_vs_forteca:   { whiteWins: 0, blackWins: 0, draws: 0 }
    };
  }

  // ── Worker lifecycle ────────────────────────────────────────────────
  async startWorkers() {
    for (const name of ['agresor', 'forteca']) {
      const worker = this.workers[name];
      worker.start();
      const weightsPath = `models/${name}.json`;
      await worker.init(fs.existsSync(weightsPath) ? weightsPath : null);
      console.log(`[Trainer] Worker [${name}] initialized`);
    }
  }

  stopWorkers() {
    for (const name of ['agresor', 'forteca']) {
      this.workers[name].stop();
    }
  }

  // Sync inference models ← worker models after training
  async syncAllWeights() {
    for (const name of ['agresor', 'forteca']) {
      try {
        await this.workers[name].syncWeightsTo(this.models[name]);
        console.log(`[Trainer] Synced weights → main model [${name}]`);
      } catch (e) {
        console.error(`[Trainer] Sync failed for ${name}:`, e);
      }
    }
  }

  // ── Status / Start / Stop ──────────────────────────────────────────
  _emitStatus(extra = {}) {
    this.io.emit('selfPlayStatus', {
      active: this.active, round: this.round, elo: { ...this.elo },
      stats: { ...this.stats }, statsSinceLastTrain: { ...this.statsSinceLastTrain },
      epsilon: { ...this._runtimeEpsilon }, h2h: JSON.parse(JSON.stringify(this.h2h)), ...extra
    });
  }

  async start() {
    if (this.active) return;
    this.active = true;
    await this.startWorkers();
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
    this.stopWorkers();
    this._emitStatus();
  }

  // ── Parallel training via workers ──────────────────────────────────
  _startParallelTraining() {
    this._trainingIntervals = [];
    for (const name of ['agresor', 'forteca']) {
      this['_training_' + name] = false;
      const interval = setInterval(async () => {
        if (!this.active) return;
        if (this['_training_' + name]) return; // still running
        this['_training_' + name] = true;
        try {
          await this._trainModel(name);
        } catch (e) {
          console.error(`[Training] ${name} error:`, e);
        } finally {
          this['_training_' + name] = false;
        }
      }, 30000);
      this._trainingIntervals.push(interval);
    }
  }

  async _trainModel(name) {
    const warmup = this.config.ai.warmupRounds || 0;
    if (this.round <= warmup) return;

    const buf = this.buffers[name];
    if (buf.size() < 64) return;

    // Sample batch and compute TD targets in main process (fast inference-only calls)
    const batch = buf.samplePrioritized(64);
    const gamma = this.config.ai.gamma;
    const trainBatch = [];
    for (const entry of batch) {
      let valueTarget;
      if (entry.isTerminal) {
        valueTarget = entry.reward;
      } else {
        // Single predict call — fast, doesn't block like training does
        const nextValue = await getStateValue(this.models[name], entry.next_board);
        valueTarget = entry.reward + gamma * nextValue;
      }
      trainBatch.push({ ...entry, valueTarget });
    }

    console.log(`[Training] Starting training for ${name}, buffer size: ${buf.size()}, targets: ${trainBatch.length}`);
    this.io.emit('trainingStatus', { active: true, model: name, timeLeft: 20 });

    const weightsPath = `models/${name}.json`;
    const result = await this.workers[name].train(trainBatch, {
      lr: 0.0005,
      gamma,
      epochs: 5,
      subBatchSize: 16,
      weightsPath
    });

    this.lossHistory[name].push(result.loss || 0);
    if (this.lossHistory[name].length > 1000) this.lossHistory[name].shift();

    // Sync trained weights back to inference model after each training session
    try {
      await this.workers[name].syncWeightsTo(this.models[name]);
    } catch (e) {
      console.error(`[Trainer] Weight sync failed for ${name}:`, e);
    }

    this.io.emit('train', { model: name, loss: result.loss || 0, done: true });
    this.io.emit('trainingStatus', { active: false, model: name, timeLeft: 0 });
    console.log(`[Training] ${name} complete: loss=${(result.loss || 0).toFixed(4)}, iters=${result.iters}`);

    this.statsSinceLastTrain[name] = { wins: 0, losses: 0, draws: 0 };
    this.statsSinceLastTrain.minimax = { wins: 0, losses: 0, draws: 0 };

    this._trainCount++;
    if (this._trainCount % 5 === 0) {
      console.log(`[Training] Saving checkpoint (every 5th training, count: ${this._trainCount})`);
      this.saveCheckpoint();
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────
  async _startGameLoop() {
    const matchups = [
      { white: 'agresor', black: 'forteca', idx: 0, h2hKey: 'agresor_vs_forteca' },
      { white: 'forteca', black: 'agresor', idx: 1, h2hKey: 'forteca_vs_agresor' },
      { white: 'agresor', black: 'minimax', idx: 2, h2hKey: 'agresor_vs_minimax' },
      { white: 'minimax', black: 'agresor', idx: 3, h2hKey: 'minimax_vs_agresor' },
      { white: 'forteca', black: 'minimax', idx: 4, h2hKey: 'forteca_vs_minimax' },
      { white: 'minimax', black: 'forteca', idx: 5, h2hKey: 'minimax_vs_forteca' }
    ];
    while (this.active) {
      this.round++;
      const warmup = this.config.ai.warmupRounds || 0;
      const warmupEps = this.config.ai.warmupEpsilon ?? 1.0;
      if (this.round <= warmup) {
        for (const name of ['agresor', 'forteca']) this._runtimeEpsilon[name] = warmupEps;
      } else {
        for (const name of ['agresor', 'forteca']) {
          const strat = this.config.ai.strategies[name];
          this._runtimeEpsilon[name] = Math.max(this._runtimeEpsilon[name] - strat.epsilonDecay, strat.minEpsilon);
        }
      }
      this._emitStatus();
      for (const matchup of matchups) {
        if (!this.active) return;
        await localFetch('/api/game/reset', 'POST');
        await this._playSingleGame(matchup);
      }
      this.io.emit('roundComplete', { round: this.round, elo: { ...this.elo }, stats: { ...this.stats }, statsSinceLastTrain: { ...this.statsSinceLastTrain }, epsilon: { ...this._runtimeEpsilon } });
      this.saveCheckpoint();
      this._saveHistorySnapshot();
    }
  }

  async _playSingleGame(matchup) {
    let state = await localFetch('/api/game/full-state', 'POST', {});
    const moves = [];
    while (this.active && !state.gameOver) {
      const isWhite = state.turn === 'white';
      const strategyName = isWhite ? matchup.white : matchup.black;
      const boardBefore = [...state.board];
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
        if (typeof result.moveIdx === 'number' && Number.isFinite(result.moveIdx) &&
            result.moveIdx >= 0 && result.moveIdx < state.legalMoves.length &&
            state.legalMoves[result.moveIdx]) {
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
          if (strategyName !== 'minimax') {
            const reward = computeReward(strategyName, boardBefore, state.board, chosenMove, this.config);
            const trainBoard = isWhite ? boardBefore : flipBoardInput(boardBefore);
            const trainNextBoard = isWhite ? state.board : flipBoardInput(state.board);
            this.buffers[strategyName].add({ board: trainBoard, from: chosenMove.from, to: chosenMove.to, turn: 1, reward, next_board: trainNextBoard, isTerminal: state.gameOver });
          }
        } catch (e) { console.error('Move error:', e.message); break; }
      }
      const now = Date.now();
      if (now - this._lastGameStateEmit >= 1000) {
        this.io.emit('gameState', { game: matchup.idx + 1, board: state.board, turn: state.turn, gameOver: state.gameOver, lastMove: chosenMove ? { from: chosenMove.from, to: chosenMove.to } : null });
        this._lastGameStateEmit = now;
      }
      const baseDelay = this.config.server.speedMode === 'normal' ? this.config.server.normalModeDelayMs : 0;
      const totalDelay = this.config.server.aiMoveDelayMs ?? baseDelay;
      if (totalDelay > 0) await delay(totalDelay);
    }
    const winner = state.winner;
    if (moves.length > 0) {
      const lastMove = moves[moves - 1];
      const lastStrategyName = state.turn === 'white' ? matchup.black : matchup.white;
      const lastWasWhite = lastStrategyName === matchup.white;
      if (lastStrategyName !== 'minimax') {
        const won = (winner === 'white' && lastStrategyName === matchup.white) || 
                    (winner === 'black' && lastStrategyName === matchup.black);
        const reward = computeReward(lastStrategyName, state.board, state.board, lastMove, this.config, true, won);
        const trainBoard = lastWasWhite ? state.board : flipBoardInput(state.board);
        this.buffers[lastStrategyName].add({ board: trainBoard, from: lastMove.from, to: lastMove.to, turn: 1, reward, next_board: trainBoard, isTerminal: true });
      }
      const oppStrategyName = state.turn === 'white' ? matchup.white : matchup.black;
      const oppWasWhite = oppStrategyName === matchup.white;
      if (oppStrategyName !== 'minimax') {
        const oppWon = (winner === 'white' && oppStrategyName === matchup.white) || 
                       (winner === 'black' && oppStrategyName === matchup.black);
        const oppReward = computeReward(oppStrategyName, state.board, state.board, lastMove, this.config, true, oppWon);
        const oppTrainBoard = oppWasWhite ? state.board : flipBoardInput(state.board);
        this.buffers[oppStrategyName].add({ board: oppTrainBoard, from: lastMove.from, to: lastMove.to, turn: 1, reward: oppReward, next_board: oppTrainBoard, isTerminal: true });
      }
    }
    
    if (this.h2h[matchup.h2hKey]) {
      const h = this.h2h[matchup.h2hKey];
      if (winner === 'white') h.whiteWins++;
      else if (winner === 'black') h.blackWins++;
      else h.draws++;
    }

    if (winner === 'white') {
      this.stats[matchup.white].wins++; this.stats[matchup.black].losses++;
      this.statsSinceLastTrain[matchup.white].wins++; this.statsSinceLastTrain[matchup.black].losses++;
      const we = this.elo[matchup.white], be = this.elo[matchup.black];
      this.elo[matchup.white] = updateElo(we, be, 1);
      this.elo[matchup.black] = updateElo(be, we, 0);
    } else if (winner === 'black') {
      this.stats[matchup.black].wins++; this.stats[matchup.white].losses++;
      this.statsSinceLastTrain[matchup.black].wins++; this.statsSinceLastTrain[matchup.white].losses++;
      const we = this.elo[matchup.white], be = this.elo[matchup.black];
      this.elo[matchup.black] = updateElo(be, we, 1);
      this.elo[matchup.white] = updateElo(we, be, 0);
    } else {
      this.stats[matchup.white].draws++; this.stats[matchup.black].draws++;
      this.statsSinceLastTrain[matchup.white].draws++; this.statsSinceLastTrain[matchup.black].draws++;
      const we = this.elo[matchup.white], be = this.elo[matchup.black];
      this.elo[matchup.white] = updateElo(we, be, 0.5);
      this.elo[matchup.black] = updateElo(be, we, 0.5);
    }
    this._emitStatus();
    const winnerName = winner === 'white' ? matchup.white.charAt(0).toUpperCase() + matchup.white.slice(1) :
                       winner === 'black' ? matchup.black.charAt(0).toUpperCase() + matchup.black.slice(1) : null;
    this.io.emit('gameOver', { game: matchup.idx + 1, winner: winnerName || 'draw', moves: moves.length });
  }

  // ── Checkpoints ─────────────────────────────────────────────────────
  saveCheckpoint() {
    try {
      const meta = { round: this.round, elo: this.elo, stats: this.stats, statsSinceLastTrain: this.statsSinceLastTrain, paramsVersion: this.paramsVersion, epsilon: this._runtimeEpsilon, h2h: this.h2h };
      if (!fs.existsSync('models')) fs.mkdirSync('models', { recursive: true });
      if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });
      fs.writeFileSync('models/meta.json', JSON.stringify(meta, null, 2));
      this.buffers.agresor.save('data/buffer_agresor.json');
      this.buffers.forteca.save('data/buffer_forteca.json');
    } catch (e) { console.error('Checkpoint save error:', e); }
  }

  _saveHistorySnapshot() {
    try {
      const dataDir = path.join(__dirname, '..', '..', 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const historyFile = path.join(dataDir, 'history.jsonl');
      const snapshot = {
        timestamp: new Date().toISOString(),
        round: this.round,
        elo: { ...this.elo },
        epsilon: { ...this._runtimeEpsilon },
        bufferSize: { agresor: this.buffers.agresor.size(), forteca: this.buffers.forteca.size() },
        stats: { ...this.stats },
        statsSinceLastTrain: { ...this.statsSinceLastTrain },
        h2h: JSON.parse(JSON.stringify(this.h2h))
      };
      fs.appendFileSync(historyFile, JSON.stringify(snapshot) + '\n');
      let lines = fs.readFileSync(historyFile, 'utf8').trim().split('\n');
      if (lines.length > 50) {
        lines = lines.slice(-50);
        fs.writeFileSync(historyFile, lines.join('\n') + '\n');
      }
    } catch (e) { console.error('History snapshot error:', e); }
  }

  loadCheckpoint() {
    try {
      if (fs.existsSync('models/meta.json')) {
        const meta = JSON.parse(fs.readFileSync('models/meta.json', 'utf8'));
        this.round = meta.round || 0;
        this.elo = meta.elo || this.elo;
        const loadedStats = meta.stats || {};
        if (loadedStats.agresor && loadedStats.forteca && loadedStats.minimax) this.stats = loadedStats;
        const loadedTS = meta.statsSinceLastTrain || {};
        if (loadedTS.agresor && loadedTS.forteca && loadedTS.minimax) this.statsSinceLastTrain = loadedTS;
        this.paramsVersion = meta.paramsVersion || 0;
        this._runtimeEpsilon = meta.epsilon || { agresor: 0.3, forteca: 0.3 };
        const loadedH2h = meta.h2h || {};
        const defaultH2h = {
          agresor_vs_forteca:   { whiteWins: 0, blackWins: 0, draws: 0 },
          forteca_vs_agresor:   { whiteWins: 0, blackWins: 0, draws: 0 },
          agresor_vs_minimax:   { whiteWins: 0, blackWins: 0, draws: 0 },
          minimax_vs_agresor:   { whiteWins: 0, blackWins: 0, draws: 0 },
          forteca_vs_minimax:   { whiteWins: 0, blackWins: 0, draws: 0 },
          minimax_vs_forteca:   { whiteWins: 0, blackWins: 0, draws: 0 }
        };
        for (const key of Object.keys(defaultH2h)) {
          if (loadedH2h[key]) this.h2h[key] = loadedH2h[key];
        }
        this.buffers.agresor.load('data/buffer_agresor.json');
        this.buffers.forteca.load('data/buffer_forteca.json');
      }
    } catch (e) { console.error('Checkpoint load error:', e); }
  }

  reset() {
    this.round = 0;
    this.elo = { agresor: 1500, forteca: 1500, minimax: 1500 };
    this.stats = { agresor: { wins: 0, losses: 0, draws: 0 }, forteca: { wins: 0, losses: 0, draws: 0 }, minimax: { wins: 0, losses: 0, draws: 0 } };
    this.statsSinceLastTrain = { agresor: { wins: 0, losses: 0, draws: 0 }, forteca: { wins: 0, losses: 0, draws: 0 }, minimax: { wins: 0, losses: 0, draws: 0 } };
    this.h2h = { agresor_vs_forteca: { whiteWins: 0, blackWins: 0, draws: 0 }, forteca_vs_agresor: { whiteWins: 0, blackWins: 0, draws: 0 }, agresor_vs_minimax: { whiteWins: 0, blackWins: 0, draws: 0 }, minimax_vs_agresor: { whiteWins: 0, blackWins: 0, draws: 0 }, forteca_vs_minimax: { whiteWins: 0, blackWins: 0, draws: 0 }, minimax_vs_forteca: { whiteWins: 0, blackWins: 0, draws: 0 } };
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
      bufferSize: { agresor: this.buffers.agresor.size(), forteca: this.buffers.forteca.size() },
      h2h: JSON.parse(JSON.stringify(this.h2h))
    };
  }
}

function updateElo(ratingMe, ratingOpponent, actualScore, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (ratingOpponent - ratingMe) / 400));
  return ratingMe + k * (actualScore - expected);
}

module.exports = { SelfPlay, updateElo };
