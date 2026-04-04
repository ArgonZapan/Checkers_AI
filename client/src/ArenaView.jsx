import React from 'react';
import MiniBoard from './MiniBoard';

// Mapowanie matchupów na kolory graczy
const MATCHUP_COLORS = [
  { white: 'Agresor', black: 'Forteca' },   // Game 1
  { white: 'Forteca', black: 'Agresor' },   // Game 2
  { white: 'Agresor', black: 'Minimax' },   // Game 3
  { white: 'Minimax', black: 'Agresor' },   // Game 4
  { white: 'Forteca', black: 'Minimax' },   // Game 5
  { white: 'Minimax', black: 'Forteca' }    // Game 6
];

function ArenaView({ games, labels }) {
  return (
    <div className="arena">
      {(games || []).map((game, idx) => {
        const matchup = MATCHUP_COLORS[idx] || {};
        return (
          <div className="mini-board" key={idx}>
            <div className="mini-board-header">
              <span>{labels?.[idx] || `Game ${idx + 1}`}</span>
              <div className="player-info">
                <span style={{ color: '#fff' }}>⚪ {matchup.white}</span>
                <span style={{ color: '#888' }}>vs</span>
                 <span style={{ color: '#aaa' }}>⚫ {matchup.black}</span>
              </div>
            </div>
            <MiniBoard
              board={game?.board || Array(64).fill(0)}
              lastMove={game?.lastMove}
              turn={game?.turn || '-'}
            />
            <div className="mini-board-status">
              {game?.gameOver ? (
                <span style={{ color: game.winner === 'draw' ? '#ccc' : '#2ecc71' }}>
                  {game.winner === 'draw' ? 'Remis' : 
                   game.winner === matchup.white ? `${matchup.white} wygrywa` : 
                   `${matchup.black} wygrywa`}
                </span>
              ) : (
                <span>Tura: {game?.turn === 'white' ? matchup.white : matchup.black}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ArenaView;
