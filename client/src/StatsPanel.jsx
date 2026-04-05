import React, { useEffect, useRef, useMemo } from 'react';

function LossChart({ data, title }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    ctx.strokeStyle = '#8a8ac4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((data[i] - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#ccc';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${title} (last ${data.length})`, 4, 12);
    ctx.fillText(`min: ${min.toFixed(3)}`, 4, h - 4);
    ctx.fillText(`max: ${max.toFixed(3)}`, w - 50, h - 4);
  }, [data, title]);

  return <canvas ref={canvasRef} width={300} height={80} className="loss-chart" />;
}

function StatsPanel({ elo = {}, stats = {}, lossHistory = {}, round = 0, trainingActive = false, trainingTimeLeft = 0, bufferSize = {}, statsSinceLastTrain = {}, epsilon = {}, h2h = {} }) {
  const strategies = ['agresor', 'forteca', 'minimax'];
  const h2hEntries = Object.entries(h2h || {}).filter(([, v]) => v && typeof v === 'object');
  const formatMatchup = (key) => {
    const [a, b] = key.split('_vs_');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(a)} vs ${cap(b)}`;
  };

  // Debug: log stats when they change
  useEffect(() => {
    console.log('StatsPanel stats prop:', JSON.stringify(stats));
    console.log('StatsPanel elo prop:', JSON.stringify(elo));
  }, [stats, elo]);

  // Create a stable key for each strategy to force re-render
  const statsWithDefaults = useMemo(() => ({
    agresor: { wins: 0, losses: 0, draws: 0, ...(stats.agresor || {}) },
    forteca: { wins: 0, losses: 0, draws: 0, ...(stats.forteca || {}) },
    minimax: { wins: 0, losses: 0, draws: 0, ...(stats.minimax || {}) }
  }), [stats.agresor?.wins, stats.agresor?.losses, stats.agresor?.draws,
      stats.forteca?.wins, stats.forteca?.losses, stats.forteca?.draws,
      stats.minimax?.wins, stats.minimax?.losses, stats.minimax?.draws]);

  // Statystyki są teraz per-strategy: { agresor: { wins, losses, draws }, ... }
  return (
    <div className="stats-panel">
      <div className="stats-section">
        <h3>Ranking ELO</h3>
        <table className="elo-table">
          <thead>
            <tr>
              <th>Strategia</th>
              <th>ELO</th>
              <th>W</th>
              <th>L</th>
              <th>D</th>
              <th>Epsilon</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map(s => (
              <tr key={s}>
                 <td>{s.charAt(0).toUpperCase() + s.slice(1)}</td>
                 <td>{Math.round(elo[s] ?? 1500)}</td>
                 <td>{Number(statsWithDefaults[s].wins)}</td>
                 <td>{Number(statsWithDefaults[s].losses)}</td>
                 <td>{Number(statsWithDefaults[s].draws)}</td>
                 <td>{(epsilon[s] ?? 0).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <h3>Loss Charts</h3>
        <LossChart data={lossHistory.agresor || []} title="Agresor" />
        <LossChart data={lossHistory.forteca || []} title="Forteca" />
      </div>

      <div className="stats-section">
        <h3>Since Last Training</h3>
        <table className="elo-table">
          <thead>
            <tr><th>Strategia</th><th>W</th><th>L</th><th>D</th></tr>
          </thead>
          <tbody>
            {strategies.map(s => (
              <tr key={s}>
                <td>{s.charAt(0).toUpperCase() + s.slice(1)}</td>
                <td>{Number(statsSinceLastTrain[s]?.wins ?? 0)}</td>
                <td>{Number(statsSinceLastTrain[s]?.losses ?? 0)}</td>
                <td>{Number(statsSinceLastTrain[s]?.draws ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <h3>Head to Head</h3>
        <table className="elo-table h2h-table">
          <thead>
            <tr><th>Matchup</th><th>White W</th><th>Black W</th><th>Draw</th></tr>
          </thead>
          <tbody>
            {h2hEntries.map(([key, h]) => (
              <tr key={key}>
                <td>{formatMatchup(key)}</td>
                <td>{h.whiteWins}</td>
                <td>{h.blackWins}</td>
                <td>{h.draws}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <h3>Runda {round}</h3>
        <div className="param-row">
          <span className="param-label">Status</span>
          <span className="param-value">
            {trainingActive ? `Training (${trainingTimeLeft}s)` : round > 0 ? 'Active' : 'Idle'}
          </span>
        </div>
        <div className="param-row">
          <span className="param-label">Buffer Agresor</span>
          <span className="param-value">{bufferSize.agresor ?? 0}</span>
        </div>
        <div className="param-row">
          <span className="param-label">Buffer Forteca</span>
          <span className="param-value">{bufferSize.forteca ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;