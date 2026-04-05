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
 * Compute reward for DQN training based on CHANGE in position after a move
 */
function computeReward(strategyName, boardBefore, boardAfter, move, config, gameOver = false, won = false) {
  const strat = config.ai.strategies[strategyName];
  if (!strat || strat.type === 'minimax') return 0;

  const w = strat.weights;
  const r = strat;

  // Game ending reward - strongest signal
  if (gameOver) {
    return won ? r.rewardWin : r.rewardLose;
  }

  // Material BEFORE move
  let myMatBefore = 0, oppMatBefore = 0;
  for (const cell of boardBefore) {
    if (cell === 1) myMatBefore += 1.0;
    else if (cell === 2) myMatBefore += 3.0;
    else if (cell === 3) oppMatBefore += 1.0;
    else if (cell === 4) oppMatBefore += 3.0;
  }

  // Material AFTER move
  let myMatAfter = 0, oppMatAfter = 0;
  for (const cell of boardAfter) {
    if (cell === 1) myMatAfter += 1.0;
    else if (cell === 2) myMatAfter += 3.0;
    else if (cell === 3) oppMatAfter += 1.0;
    else if (cell === 4) oppMatAfter += 3.0;
  }

  // CHANGE in material advantage
  const myDelta = myMatAfter - myMatBefore;
  const oppDelta = oppMatAfter - oppMatBefore;
  let reward = (myDelta - oppDelta) * w.material * 10; // scale up

  // Capture bonus
  if (move.captures && move.captures.length > 0) {
    reward += r.rewardCapture * move.captures.length;
  }

  // Promotion bonus
  const toRow = move.to ? (move.to[1] || move.to.row || 0) : 0;
  const fromRow = move.from ? (move.from[1] || move.from.row || 0) : 0;
  // White promotes when reaching row 0, black promotes when reaching row 7
  if (fromRow === 1 && toRow === 0) reward += r.rewardPromotion; // white promotion
  if (fromRow === 6 && toRow === 7) reward += r.rewardPromotion; // black promotion

  // Advance bonus (small)
  reward += 0.01 * w.position;

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
    // Auto-cleanup every 5 minutes to prevent memory growth
    this._cleanupInterval = setInterval(() => this.cleanup(), 300000);
    this._cleanupInterval.unref(); // Don't prevent process exit
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
    // Auto-cleanup stale entries every minute
    this._cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this._cleanupInterval.unref(); // Don't prevent process exit
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

  // Remove all entries for a disconnected socket
  cleanupSocket(socketId) {
    for (const key of this.throttleMap.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        this.throttleMap.delete(key);
      }
    }
  }

  // Remove entries older than 10 minutes (stale sockets)
  cleanup() {
    const now = Date.now();
    const maxAge = 600000; // 10 minutes
    for (const [key, timestamp] of this.throttleMap) {
      if (now - timestamp > maxAge) {
        this.throttleMap.delete(key);
      }
    }
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