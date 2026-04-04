import React from 'react';
import MiniBoard from './MiniBoard';

function ArenaView({ games, labels }) {
  return (
    <div className="arena">
      {(games || []).map((game, idx) => (
        <div className="mini-board" key={idx}>
          <div className="mini-board-header">
            <span>{labels?.[idx] || `Game ${idx + 1}`}</span>
          </div>
          <MiniBoard
            board={game?.board || Array(64).fill(0)}
            lastMove={game?.lastMove}
            turn={game?.turn || '-'}
          />
          <div className="mini-board-status">
            {game?.gameOver ? (
              <span style={{ color: game.winner === 'draw' ? '#ccc' : '#2ecc71' }}>
                {game.winner ? `${game.winner} wins` : 'Draw'}
              </span>
            ) : (
              <span>Tura: {game?.turn || '-'}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ArenaView;