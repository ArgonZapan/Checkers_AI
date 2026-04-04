const CONFIG = {
  server: {
    port: parseInt((process.env.PORT || '').trim(), 10) || 3000,
    host: (process.env.HOST || '127.0.0.1').trim(),
    enginePort: 8080,
    cppBase: (process.env.CPP_BASE || 'http://localhost:8080').trim(),
    fetchTimeoutMs: 5000,
    aiMoveDelayMs: 0,
    speedMode: 'normal',
    normalModeDelayMs: 500,
    autoSaveMs: 30000
  },
  ai: {
    defaultEpsilon: 0.3,
    minEpsilon: 0.01,
    epsilonDecay: 0.01,
    gamma: 0.95,
    bufferSize: 500000,
    strategies: Object.freeze({
      agresor: Object.freeze({
        type: 'dqn',
        weights: Object.freeze({ material: 0.55, position: 0.15, threat: 0.20, tempo: 0.10 }),
        epsilon: 0.5,
        minEpsilon: 0.02,
        epsilonDecay: 0.015,
        rewardCapture: 0.15,
        rewardAdvance: 0.10,
        rewardPromotion: 0.20,
        rewardWin: 1.0,
        rewardLose: -1.0
      }),
      forteca: Object.freeze({
        type: 'dqn',
        weights: Object.freeze({ material: 0.25, position: 0.40, threat: 0.10, tempo: 0.25 }),
        epsilon: 0.2,
        minEpsilon: 0.03,
        epsilonDecay: 0.008,
        rewardCapture: 0.08,
        rewardAdvance: 0.03,
        rewardPromotion: 0.40,
        rewardWin: 1.0,
        rewardLose: -1.2
      }),
      minimax: Object.freeze({
        type: 'minimax',
        depth: 7,
        weights: Object.freeze({ material: 1.0, position: 0.3 })
      })
    })
  },
  minimax: {
    depth: 7
  },
  board: {
    cellSize: 60,
    animation: { stepDurationMs: 200 }
  }
};

Object.freeze(CONFIG.server);
Object.freeze(CONFIG.board);
Object.freeze(CONFIG.board.animation);
Object.freeze(CONFIG.ai);
Object.freeze(CONFIG.minimax);

module.exports = CONFIG;