const CONFIG = require('./config');

/**
 * Make HTTP request to C++ engine with timeout
 */
async function cppFetch(endpoint, method = 'POST', body = null) {
  const url = `${CONFIG.server.cppBase}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(CONFIG.server.fetchTimeoutMs)
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`C++ Engine error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Simple delay in milliseconds
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Compute reward for DQN training based on strategy weights
 */
function computeReward(strategyName, board, move, config) {
  const strat = config.ai.strategies[strategyName];
  if (!strat || strat.type === 'minimax') return 0;

  const w = strat.weights;
  const r = strat;

  let reward = 0;

  // Material count
  let myMaterial = 0, oppMaterial = 0;
  for (const cell of board) {
    if (cell === 1) myMaterial += 1.0; // my pawn
    else if (cell === 2) myMaterial += 3.0; // my king
    else if (cell === 3) oppMaterial += 1.0; // opp pawn
    else if (cell === 4) oppMaterial += 3.0; // opp king
  }
  reward += (myMaterial - oppMaterial) * w.material;

  // Captures
  if (move.captures && move.captures.length > 0) {
    reward += r.rewardCapture * move.captures.length;
  }

  // Advance bonus
  const toRow = move.to ? (move.to[1] || move.to.row || 0) : 0;
  reward += Math.abs(toRow) * 0.01 * w.position;

  // Tempo
  reward += 0.01 * w.tempo;

  return reward;
}

/**
 * Rate limiter - simple sliding window per IP/key
 */
class SimpleRateLimiter {
  constructor(maxRequests = 120, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  isAllowed(key) {
    const now = Date.now();
    const entry = this.entries.get(key);

    if (!entry) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (now > entry.resetAt) {
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count < this.maxRequests) {
      entry.count++;
      return true;
    }

    return false;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now > entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }
}

/**
 * WebSocket per-socket rate limiter
 */
class WsRateLimiter {
  constructor() {
    this.throttleMap = new Map();
  }

  canEmit(socket, event, minIntervalMs) {
    const key = `${socket.id}:${event}`;
    const last = this.throttleMap.get(key) || 0;
    const now = Date.now();
    if (now - last >= minIntervalMs) {
      this.throttleMap.set(key, now);
      return true;
    }
    return false;
  }
}

/**
 * Sanitize state payload for client
 */
function sanitizeStatePayload(state) {
  return {
    board: state.board,
    turn: state.turn,
    gameOver: state.gameOver,
    winner: state.winner || null,
    lastMove: state.lastMove || null
  };
}

/**
 * Check allowed CORS origin
 */
function isAllowedOrigin(origin, allowedOrigin) {
  if (!allowedOrigin || allowedOrigin === '*') return true;
  return origin === allowedOrigin;
}

module.exports = {
  cppFetch,
  delay,
  computeReward,
  SimpleRateLimiter,
  WsRateLimiter,
  sanitizeStatePayload,
  isAllowedOrigin
};