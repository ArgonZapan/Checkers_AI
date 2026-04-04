import React from 'react';

function Controls({
  onStart,
  onStop,
  onReset,
  running,
  speed,
  onSpeedChange,
  speedMode,
  onSpeedModeChange,
  minimaxDepth,
  onMinimaxDepthChange
}) {
  return (
    <div className="controls">
      <button className="btn-start" onClick={onStart} disabled={running}>
        ▶ Start
      </button>
      <button className="btn-stop" onClick={onStop} disabled={!running}>
        ⏹ Stop
      </button>
      <button className="btn-reset" onClick={onReset}>
        🔄 Reset
      </button>

      <div className="control-group">
        <label>Speed (ms):</label>
        <input
          type="range"
          min="0"
          max="10000"
          step="100"
          value={speed}
          onChange={(e) => onSpeedChange(parseInt(e.target.value))}
        />
        <span>{speed}</span>
      </div>

      <div className="control-group">
        <label>Mode:</label>
        <button
          className={`toggle ${speedMode === 'fast' ? 'active' : ''}`}
          onClick={() => onSpeedModeChange('fast')}
        >
          Fast
        </button>
        <button
          className={`toggle ${speedMode === 'normal' ? 'active' : ''}`}
          onClick={() => onSpeedModeChange('normal')}
        >
          Normal
        </button>
      </div>

      <div className="control-group">
        <label>Minimax Depth:</label>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          value={minimaxDepth}
          onChange={(e) => onMinimaxDepthChange(parseInt(e.target.value))}
        />
        <span>{minimaxDepth}</span>
      </div>
    </div>
  );
}

export default Controls;