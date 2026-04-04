import React from 'react';

const PARAMS_CONFIG = {
  agresor: {
    title: 'Agresor',
    params: [
      { key: 'epsilon', label: 'Epsilon', default: 0.5 },
      { key: 'minEpsilon', label: 'Min Epsilon', default: 0.02 },
      { key: 'epsilonDecay', label: 'Decay/rundę', default: 0.015 }
    ]
  },
  forteca: {
    title: 'Forteca',
    params: [
      { key: 'epsilon', label: 'Epsilon', default: 0.2 },
      { key: 'minEpsilon', label: 'Min Epsilon', default: 0.03 },
      { key: 'epsilonDecay', label: 'Decay/rundę', default: 0.008 }
    ]
  },
  minimax: {
    title: 'Minimax',
    params: [
      { key: 'depth', label: 'Depth', default: 7 }
    ],
    readOnly: true
  },
  architecture: {
    title: 'Architektura',
    params: [
      { key: 'layers', label: 'Warstwy', default: 3 },
      { key: 'neurons', label: 'Neurony', default: 128 },
      { key: 'activation', label: 'Aktywacja', default: 'relu' }
    ]
  }
};

function ParamsPanel({ params = {}, activeTab = 'agresor', onTabChange, onParamChange }) {
  const tabs = [
    { key: 'agresor', label: 'Agresor' },
    { key: 'forteca', label: 'Forteca' },
    { key: 'minimax', label: 'Minimax' },
    { key: 'architecture', label: 'Architektura' }
  ];

  const tab = PARAMS_CONFIG[activeTab];
  if (!tab) return null;

  const tabParams = params[activeTab] || {};

  return (
    <div className="params-panel">
      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="params-content">
        {tab.params.map(p => (
          <div className="param-row" key={p.key}>
            <span className="param-label">{p.label}</span>
            {tab.readOnly ? (
              <span className="param-value">{tabParams[p.key] ?? p.default}</span>
            ) : typeof p.default === 'string' ? (
              <select
                className="param-value"
                style={{ background: '#222', color: '#ccc', border: '1px solid #444' }}
                value={tabParams[p.key] ?? p.default}
                onChange={(e) => onParamChange(activeTab, p.key, e.target.value)}
              >
                <option value="relu">ReLU</option>
                <option value="tanh">Tanh</option>
                <option value="sigmoid">Sigmoid</option>
                <option value="leaky">Leaky ReLU</option>
              </select>
            ) : typeof p.default === 'number' && p.default < 1 ? (
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={tabParams[p.key] ?? p.default}
                onChange={(e) => onParamChange(activeTab, p.key, parseFloat(e.target.value))}
                style={{ width: 100 }}
              />
            ) : (
              <input
                type="number"
                value={tabParams[p.key] ?? p.default}
                onChange={(e) => onParamChange(activeTab, p.key, parseInt(e.target.value) || p.default)}
                style={{ width: 50, background: '#333', color: '#ccc', border: '1px solid #444', padding: '2px 4px', borderRadius: 4 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ParamsPanel;