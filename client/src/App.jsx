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
  const [selfPlayStatus, setSelfPlayStatus] = useState({ active: false, round: 0, elo: {}, stats: {}, epsilon: { agresor: 1.0, forteca: 1.0 } });
  const [lossHistory, setLossHistory] = useState({ agresor: [], forteca: [] });
  const [params, setParams] = useState({
    agresor: { epsilon: 0.5 },
    forteca: { epsilon: 0.2 },
    minimax: { depth: 3 }
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
      console.log('selfPlayStatus epsilon:', JSON.stringify(data.epsilon));
      console.log('selfPlayStatus stats.agresor:', data.stats?.agresor);
      console.log('selfPlayStatus stats.forteca:', data.stats?.forteca);
      console.log('selfPlayStatus stats.minimax:', data.stats?.minimax);
      
      setSelfPlayStatus(prev => {
        // Create completely new state object with fresh references
        const newStats = data.stats ? {
          agresor: { 
            wins: Number(data.stats.agresor?.wins ?? 0), 
            losses: Number(data.stats.agresor?.losses ?? 0), 
            draws: Number(data.stats.agresor?.draws ?? 0) 
          },
          forteca: { 
            wins: Number(data.stats.forteca?.wins ?? 0), 
            losses: Number(data.stats.forteca?.losses ?? 0), 
            draws: Number(data.stats.forteca?.draws ?? 0) 
          },
          minimax: { 
            wins: Number(data.stats.minimax?.wins ?? 0), 
            losses: Number(data.stats.minimax?.losses ?? 0), 
            draws: Number(data.stats.minimax?.draws ?? 0) 
          }
        } : prev.stats;
        
        const newElo = data.elo ? {
          agresor: Number(data.elo.agresor ?? 0),
          forteca: Number(data.elo.forteca ?? 0),
          minimax: Number(data.elo.minimax ?? 0)
        } : prev.elo;
        
        return {
          active: data.active ?? prev.active,
          round: data.round ?? prev.round,
          elo: newElo,
          stats: newStats,
          statsSinceLastTrain: data.statsSinceLastTrain ? {
            agresor: data.statsSinceLastTrain.agresor ?? prev.statsSinceLastTrain?.agresor ?? { wins: 0, losses: 0, draws: 0 },
            forteca: data.statsSinceLastTrain.forteca ?? prev.statsSinceLastTrain?.forteca ?? { wins: 0, losses: 0, draws: 0 },
            minimax: data.statsSinceLastTrain.minimax ?? prev.statsSinceLastTrain?.minimax ?? { wins: 0, losses: 0, draws: 0 }
          } : prev.statsSinceLastTrain,
          epsilon: data.epsilon ?? prev.epsilon,
          trainingActive: data.trainingActive ?? prev.trainingActive,
          trainingTimeLeft: data.trainingTimeLeft ?? prev.trainingTimeLeft,
          bufferSize: data.bufferSize ?? prev.bufferSize
        };
      });
      if (data.elo || data.epsilon) setParams(prev => ({
        ...prev,
        agresor: { ...prev.agresor, epsilon: data.epsilon?.agresor ?? prev.agresor.epsilon },
        forteca: { ...prev.forteca, epsilon: data.epsilon?.forteca ?? prev.forteca.epsilon }
      }));
    });

    socket.on('roundComplete', (data) => {
      console.log('roundComplete received:', JSON.stringify(data));
      console.log('roundComplete stats:', JSON.stringify(data.stats));
      if (data.elo) {
        setSelfPlayStatus(prev => {
          const newStats = data.stats ? {
            agresor: { 
              wins: Number(data.stats.agresor?.wins ?? 0), 
              losses: Number(data.stats.agresor?.losses ?? 0), 
              draws: Number(data.stats.agresor?.draws ?? 0) 
            },
            forteca: { 
              wins: Number(data.stats.forteca?.wins ?? 0), 
              losses: Number(data.stats.forteca?.losses ?? 0), 
              draws: Number(data.stats.forteca?.draws ?? 0) 
            },
            minimax: { 
              wins: Number(data.stats.minimax?.wins ?? 0), 
              losses: Number(data.stats.minimax?.losses ?? 0), 
              draws: Number(data.stats.minimax?.draws ?? 0) 
            }
          } : prev.stats;
          
          return {
            ...prev,
            round: data.round,
            elo: { 
              agresor: Number(data.elo.agresor ?? 0),
              forteca: Number(data.elo.forteca ?? 0),
              minimax: Number(data.elo.minimax ?? 0)
            },
            stats: newStats
          };
        });
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
      console.log('train event received:', data);
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
      setParams(prev => {
        const next = { ...prev };
        // Handle both flat params and per-model params
        if (data.agresor) {
          next.agresor = { ...next.agresor, ...data.agresor };
        }
        if (data.forteca) {
          next.forteca = { ...next.forteca, ...data.forteca };
        }
        if (data.minimaxDepth !== undefined) {
          next.minimax = { ...next.minimax, depth: data.minimaxDepth };
        }
        return next;
      });
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
             minimaxDepth={params.minimax?.depth ?? 3}
             onMinimaxDepthChange={(d) => {
               setParams(p => ({ ...p, minimax: { ...p.minimax, depth: d } }));
               sendWs('setMinimaxDepth', d);
             }}
           />
        </div>

        <div className="dashboard-right">
          <StatsPanel
            key={`${selfPlayStatus.stats.agresor?.wins}-${selfPlayStatus.stats.forteca?.wins}-${selfPlayStatus.stats.minimax?.wins}`}
            elo={selfPlayStatus.elo || {}}
            stats={selfPlayStatus.stats || {}}
            lossHistory={lossHistory}
            round={selfPlayStatus.round}
            trainingActive={selfPlayStatus.trainingActive}
            trainingTimeLeft={selfPlayStatus.trainingTimeLeft}
            bufferSize={selfPlayStatus.bufferSize || {}}
            statsSinceLastTrain={selfPlayStatus.statsSinceLastTrain || {}}
            epsilon={selfPlayStatus.epsilon || { agresor: 1.0, forteca: 1.0 }}
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