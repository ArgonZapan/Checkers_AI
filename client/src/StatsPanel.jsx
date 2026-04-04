import React, { useEffect, useRef } from 'react';

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

function StatsPanel({ elo = {}, stats = {}, lossHistory = {}, round = 0, trainingActive = false, trainingTimeLeft = 0, bufferSize = {} }) {
  const strategies = ['agresor', 'forteca', 'minimax'];

  const totalWL = {};
  for (const s of strategies) {
    let w = 0, l = 0, d = 0;
    for (const key of Object.keys(stats)) {
      if (key.includes(s)) {
        w += stats[key]?.w || 0;
        l += stats[key]?.l || 0;
        d += stats[key]?.d || 0;
      }
    }
    totalWL[s] = { w, l, d };
  }

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
            </tr>
          </thead>
          <tbody>
            {strategies.map(s => (
              <tr key={s}>
                <td>{s.charAt(0).toUpperCase() + s.slice(1)}</td>
                <td>{elo[s] ?? 1500}</td>
                <td>{totalWL[s]?.w ?? 0}</td>
                <td>{totalWL[s]?.l ?? 0}</td>
                <td>{totalWL[s]?.d ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="stats-section">
        <h3>Head-to-Head</h3>
        {Object.keys(stats).map((key) => (
          <div className="h2h-row" key={key}>
            <span>{key.replace(/_/g, ' ')}</span>
            <span>{stats[key]?.w}W / {stats[key]?.l}L / {stats[key]?.d}D</span>
          </div>
        ))}
      </div>

      <div className="stats-section">
        <h3>Loss Charts</h3>
        <LossChart data={lossHistory.agresor || []} title="Agresor" />
        <LossChart data={lossHistory.forteca || []} title="Forteca" />
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