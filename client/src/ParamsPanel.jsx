import React from 'react';

const PARAMS_CONFIG = {
  agresor: {
    title: 'Agresor',
    params: [
      { key: 'epsilon', label: 'Epsilon', default: 0.3, step: 0.01, readOnly: true },
      { key: 'minEpsilon', label: 'Min Epsilon', default: 0.01, step: 0.01, readOnly: true },
      { key: 'epsilonDecay', label: 'Decay/rundę', default: 0.005, step: 0.001, readOnly: true }
    ]
  },
  forteca: {
    title: 'Forteca',
    params: [
      { key: 'epsilon', label: 'Epsilon', default: 0.3, step: 0.01, readOnly: true },
      { key: 'minEpsilon', label: 'Min Epsilon', default: 0.01, step: 0.01, readOnly: true },
      { key: 'epsilonDecay', label: 'Decay/rundę', default: 0.005, step: 0.001, readOnly: true }
    ]
  },
  minimax: {
    title: 'Minimax',
    params: [
      { key: 'depth', label: 'Depth', default: 3, step: 1 }
    ],
    readOnly: true
  },
};

function ParamsPanel({ params = {}, activeTab = 'agresor', onTabChange, onParamChange }) {
  const tabs = [
    { key: 'agresor', label: 'Agresor' },
    { key: 'forteca', label: 'Forteca' },
    { key: 'minimax', label: 'Minimax' }
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
            {tab.readOnly || p.readOnly ? (
              <span className="param-value">{tabParams[p.key] ?? p.default}</span>
            ) : (
              <input
                type="number"
                step={p.step || 0.01}
                value={tabParams[p.key] ?? p.default}
                onChange={(e) => onParamChange(activeTab, p.key, parseFloat(e.target.value) || p.default)}
                style={{ width: 80, background: '#333', color: '#ccc', border: '1px solid #444', padding: '2px 4px', borderRadius: 4 }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ParamsPanel;