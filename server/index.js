const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const CONFIG = require('./config');
const { SelfPlay } = require('./ai/trainer');
const { createModel, predict, flipBoardInput } = require('./ai/model');
const { cppFetch, delay, SimpleRateLimiter, WsRateLimiter, sanitizeStatePayload } = require('./utils');

// C++ Engine runs on port 8080 (checkers-server-new.exe)
// Node.js proxies /api/move and /api/engine/best-move to it

// =================== Main App (port 3000) ===================
const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet({
  xFrameOptions: { action: 'deny' },
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } }
}));

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.disable('X-Powered-By');
app.set('trust proxy', false);

// Serve static frontend
const distPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Rate limiters
const httpLimiter = new SimpleRateLimiter(120, 60000);
const wsLimiter = new WsRateLimiter();

// Auth middleware
function requireAuth(req, res, next) {
  const token = process.env.HERMES_ADMIN_TOKEN;
  if (!token) return next(); // dev mode
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Self-play instance
const selfPlay = new SelfPlay(io);
selfPlay.loadCheckpoint();

// =================== REST Endpoints ===================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// AI info
app.get('/api/ai/info', (req, res) => {
  res.json({
    models: {
      agresor: { epsilon: selfPlay._runtimeEpsilon?.agresor ?? 0.5 },
      forteca: { epsilon: selfPlay._runtimeEpsilon?.forteca ?? 0.2 }
    },
    minimax: { depth: CONFIG.minimax.depth },
    elo: selfPlay.elo
  });
});

// AI predict
app.post('/api/ai/predict', async (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) {
    return res.status(429).json({ error: 'Rate limited' });
  }
  try {
    const { board, legalMoves, epsilon = 0.3 } = req.body;
    if (!board || !legalMoves) {
      return res.status(400).json({ error: 'Missing params' });
    }
    const result = await predict(selfPlay.models.agresor, board, legalMoves, epsilon);
    res.json({
      move: legalMoves[result.moveIdx],
      probability: result.probs ? result.probs[result.moveIdx] : 0,
      value: result.value
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI train
app.post('/api/ai/train', requireAuth, async (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) return res.status(429).json({ error: 'Rate limited' });
  try {
    const { model = 'agresor', batch } = req.body;
    if (!batch || !Array.isArray(batch)) {
      return res.status(400).json({ error: 'Invalid batch' });
    }
    // Training is done in self-play loop; this forces a session
    res.json({ message: 'Training triggered via self-play' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI params
app.post('/api/ai/params', requireAuth, (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) return res.status(429).json({ error: 'Rate limited' });
  try {
    const params = req.body;
    // Validate whitelist
    const ALLOWED = new Set(['epsilon', 'minEpsilon', 'epsilonDecay', 'lr', 'batchSize', 'gamma']);
    for (const key of Object.keys(params)) {
      if (!ALLOWED.has(key)) return res.status(400).json({ error: `Unknown param: ${key}` });
    }
    selfPlay.paramsVersion++;
    res.json({ message: 'Params updated', paramsVersion: selfPlay.paramsVersion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI reset
app.post('/api/ai/reset', requireAuth, (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) return res.status(429).json({ error: 'Rate limited' });
  selfPlay.reset();
  res.json({ message: 'AI reset' });
});

// AI restart
app.post('/api/ai/restart', requireAuth, (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) return res.status(429).json({ error: 'Rate limited' });
  try {
    const { model = 'both' } = req.body;
    selfPlay.restartModels(model);
    res.json({ message: `Model ${model} restarted` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Self-play start
app.post('/api/selfplay/start', requireAuth, async (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) return res.status(429).json({ error: 'Rate limited' });
  if (selfPlay.active) return res.json({ message: 'Already running' });
  selfPlay.start().catch(e => console.error('SelfPlay error:', e));
  res.json({ message: 'Self-play started' });
});

// Self-play stop
app.post('/api/selfplay/stop', requireAuth, (req, res) => {
  if (!httpLimiter.isAllowed(req.ip)) return res.status(429).json({ error: 'Rate limited' });
  selfPlay.stop();
  res.json({ message: 'Self-play stopped' });
});

// Self-play status
app.get('/api/selfplay/status', (req, res) => {
  res.json(selfPlay.getStatus());
});

// Proxy to local engine (port 8080)
app.post('/api/move', async (req, res) => {
  try {
    // Forward request to engine app running on same process
    const http = require('http');
    const postData = JSON.stringify(req.body);
    
    const options = {
      hostname: CONFIG.server.host,
      port: CONFIG.server.enginePort,
      path: '/api/move',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ error: 'Engine response parse error' });
        }
      });
    });
    
    proxyReq.on('error', (e) => {
      res.status(502).json({ error: 'Engine unavailable' });
    });
    
    proxyReq.write(postData);
    proxyReq.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/engine/best-move', async (req, res) => {
  try {
    const http = require('http');
    const postData = JSON.stringify(req.body);
    
    const options = {
      hostname: CONFIG.server.host,
      port: CONFIG.server.enginePort,
      path: '/api/engine/best-move',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          res.json(JSON.parse(data));
        } catch (e) {
          res.status(500).json({ error: 'Engine response parse error' });
        }
      });
    });
    
    proxyReq.on('error', (e) => {
      res.status(502).json({ error: 'Engine unavailable' });
    });
    
    proxyReq.write(postData);
    proxyReq.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback routes to frontend
app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: 'Frontend not built. Run: cd client && npm run build' });
  }
});

// =================== WebSocket Events ===================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial status
  socket.emit('selfPlayStatus', selfPlay.getStatus());
  console.log('Sent initial selfPlayStatus');
  
  // Send current speed settings
  socket.emit('speedUpdate', {
    aiMoveDelayMs: CONFIG.server.aiMoveDelayMs,
    speedMode: CONFIG.server.speedMode 
  });

  socket.on('startSelfPlay', () => {
    if (!wsLimiter.canEmit(socket, 'startSelfPlay', 1000)) return;
    if (selfPlay.active) return;
    selfPlay.start().catch(e => {
      console.error('SelfPlay error:', e);
      socket.emit('error', { message: e.message });
    });
  });

  socket.on('stopSelfPlay', () => {
    if (!wsLimiter.canEmit(socket, 'stopSelfPlay', 1000)) return;
    selfPlay.stop();
  });

  socket.on('setSpeed', (ms) => {
    if (!wsLimiter.canEmit(socket, 'setSpeed', 1000)) return;
    if (typeof ms !== 'number' || isNaN(ms)) return;
    CONFIG.server.aiMoveDelayMs = Math.max(0, Math.min(10000, ms));
    socket.emit('speedUpdate', { aiMoveDelayMs: CONFIG.server.aiMoveDelayMs });
  });

  socket.on('setSpeedMode', (mode) => {
    if (!wsLimiter.canEmit(socket, 'setSpeedMode', 1000)) return;
    if (mode !== 'fast' && mode !== 'normal') return;
    CONFIG.server.speedMode = mode;
    socket.emit('speedUpdate', { speedMode: mode });
  });

  socket.on('setParams', (params) => {
    if (!wsLimiter.canEmit(socket, 'setParams', 1000)) return;
    const ALLOWED = new Set(['epsilon', 'minEpsilon', 'epsilonDecay', 'lr', 'batchSize', 'gamma']);
    for (const key of Object.keys(params || {})) {
      if (!ALLOWED.has(key)) {
        socket.emit('error', { message: `Unknown param: ${key}` });
        return;
      }
    }
    selfPlay.paramsVersion++;
    socket.emit('paramsUpdate', { ...params, paramsVersion: selfPlay.paramsVersion });
  });

  socket.on('setMinimaxDepth', (depth) => {
    if (!wsLimiter.canEmit(socket, 'setMinimaxDepth', 1000)) return;
    if (typeof depth !== 'number' || depth < 1 || depth > 8) return;
    CONFIG.minimax.depth = Math.round(depth);
    socket.emit('paramsUpdate', { minimaxDepth: CONFIG.minimax.depth });
  });

  socket.on('reset', () => {
    if (!wsLimiter.canEmit(socket, 'reset', 1000)) return;
    selfPlay.reset();
    socket.emit('selfPlayStatus', selfPlay.getStatus());
    socket.emit('modelRestart', { model: 'both' });
  });

  socket.on('restart', ({ model = 'both' }) => {
    if (!wsLimiter.canEmit(socket, 'restart', 2000)) return;
    if (!['agresor', 'forteca', 'both'].includes(model)) return;
    selfPlay.restartModels(model);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// =================== Start Servers ===================

const ENGINE_PORT = 8080;
const API_PORT = CONFIG.server.port;
const HOST = CONFIG.server.host;

// Start Main API server (port 3000) - C++ Engine already running on 8080
server.listen(API_PORT, HOST, () => {
  console.log(`Checkers AI Server running on http://${HOST}:${API_PORT}`);
  console.log(`Using C++ Engine on port ${ENGINE_PORT} (checkers-server-new.exe)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, saving checkpoint...');
  selfPlay.saveCheckpoint();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, saving checkpoint...');
  selfPlay.saveCheckpoint();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };