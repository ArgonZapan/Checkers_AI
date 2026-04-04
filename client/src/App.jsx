import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import ArenaView from './ArenaView';
import StatsPanel from './StatsPanel';
import ParamsPanel from './ParamsPanel';
import Controls from './Controls';

const MATCHUP_LABELS = [
  '1: Agresor vs Forteca',
  '2: Forteca vs Agresor',
  '3: Agresor vs Minimax',
  '4: Minimax vs Agresor',
  '5: Forteca vs Minimax',
  '6: Minimax vs Forteca'
];

const EMPTY_BOARD = () => ({
  board: Array(64).fill(0),
  turn: 'white',
  gameOver: false,
  winner: null,
  lastMove: null,
  status: ''
});

function App() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [games, setGames] = useState(() => Array(6).fill(null).map(EMPTY_BOARD));
  const [selfPlayStatus, setSelfPlayStatus] = useState({ active: false, round: 0, elo: {}, stats: {} });
  const [lossHistory, setLossHistory] = useState({ agresor: [], forteca: [] });
  const [params, setParams] = useState({
    agresor: { epsilon: 0.5 },
    forteca: { epsilon: 0.2 },
    minimax: { depth: 7 }
  });
  const [speed, setSpeed] = useState(500);
  const [speedMode, setSpeedMode] = useState('normal');
  const [activeTab, setActiveTab] = useState('agresor');

  useEffect(() => {
    const socket = io('http://localhost:3000', {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;
    setConnected(true);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('gameState', (data) => {
      const gameIdx = (data.game || 1) - 1;
      if (gameIdx < 0 || gameIdx > 5) return;
      setGames(prev => {
        const next = [...prev];
        next[gameIdx] = {
          board: data.board || next[gameIdx]?.board || Array(64).fill(0),
          turn: data.turn || 'white',
          gameOver: data.gameOver ?? false,
          winner: data.winner ?? null,
          lastMove: data.lastMove ?? null,
          status: ''
        };
        return next;
      });
    });

    socket.on('gameOver', (data) => {
      const gameIdx = (data.game || 1) - 1;
      setGames(prev => {
        const next = [...prev];
        if (next[gameIdx]) {
          next[gameIdx] = { ...next[gameIdx], gameOver: true, winner: data.winner };
        }
        return next;
      });
    });

    socket.on('selfPlayStatus', (data) => {
      console.log('selfPlayStatus received:', JSON.stringify(data));
      setSelfPlayStatus(data);
      if (data.elo) setParams(prev => ({
        ...prev,
        agresor: { ...prev.agresor, epsilon: data.epsilon?.agresor ?? prev.agresor.epsilon },
        forteca: { ...prev.forteca, epsilon: data.epsilon?.forteca ?? prev.forteca.epsilon }
      }));
    });

    socket.on('roundComplete', (data) => {
      console.log('roundComplete received:', JSON.stringify(data));
      if (data.elo) {
        setSelfPlayStatus(prev => ({ ...prev, round: data.round, elo: data.elo, stats: data.stats }));
      }
    });

    socket.on('trainingStatus', (data) => {
      setSelfPlayStatus(prev => ({
        ...prev,
        trainingActive: data.active,
        trainingTimeLeft: data.timeLeft
      }));
    });

    socket.on('train', (data) => {
      setLossHistory(prev => {
        const next = { ...prev };
        next[data.model] = [...(next[data.model] || []), data.loss];
        if (next[data.model].length > 500) next[data.model].shift();
        return next;
      });
    });

    socket.on('speedUpdate', (data) => {
      if (data.aiMoveDelayMs !== undefined) setSpeed(data.aiMoveDelayMs);
      if (data.speedMode) setSpeedMode(data.speedMode);
    });

    socket.on('paramsUpdate', (data) => {
      if (data.minEpsilon !== undefined) setParams(prev => ({ ...prev, agresor: { ...prev.agresor, epsilon: data.epsilon ?? prev.agresor.epsilon } }));
    });

    socket.on('modelRestart', (data) => {
      // Reset display
    });

    return () => socket.close();
  }, []);

  const sendWs = useCallback((event, payload) => {
    if (socketRef.current) socketRef.current.emit(event, payload);
  }, []);

  const handleStart = useCallback(() => sendWs('startSelfPlay'), [sendWs]);
  const handleStop = useCallback(() => sendWs('stopSelfPlay'), [sendWs]);
  const handleReset = useCallback(() => sendWs('reset'), [sendWs]);

  return (
    <div className="app">
      <header>
        <h1>♟ Checkers AI Arena</h1>
        <div className="status">
          <span className={`status-dot ${connected ? 'online' : ''}`}></span>
          <span>{connected ? 'Online' : 'Offline'}</span>
          <span>| Runda {selfPlayStatus.round || 0}</span>
        </div>
      </header>

      <div className="dashboard">
        <div className="dashboard-left">
          <ArenaView games={games} labels={MATCHUP_LABELS} />
          <Controls
            onStart={handleStart}
            onStop={handleStop}
            onReset={handleReset}
            running={selfPlayStatus.active}
            speed={speed}
            onSpeedChange={(v) => { setSpeed(v); sendWs('setSpeed', v); }}
            speedMode={speedMode}
            onSpeedModeChange={(m) => { setSpeedMode(m); sendWs('setSpeedMode', m); }}
            minimaxDepth={params.minimax?.depth ?? 7}
            onMinimaxDepthChange={(d) => setParams(p => ({ ...p, minimax: { ...p.minimax, depth: d } }))}
          />
        </div>

        <div className="dashboard-right">
          <StatsPanel
            elo={selfPlayStatus.elo || {}}
            stats={selfPlayStatus.stats || {}}
            lossHistory={lossHistory}
            round={selfPlayStatus.round}
            trainingActive={selfPlayStatus.trainingActive}
            trainingTimeLeft={selfPlayStatus.trainingTimeLeft}
            bufferSize={selfPlayStatus.bufferSize || {}}
          />
          <ParamsPanel
            params={params}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onParamChange={(tab, key, val) => {
              setParams(p => ({ ...p, [tab]: { ...(p[tab] || {}), [key]: val } }));
              sendWs('setParams', { [key]: val });
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;