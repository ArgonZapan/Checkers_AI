import React from 'react';

const CELL_SIZE = 40;
const BOARD_SIZE = 8 * CELL_SIZE;
const PIECE_RADIUS = CELL_SIZE * 0.37;

const COLORS = {
  light: '#F0D9B5',
  dark: '#B58863',
  whitePiece: '#FFFFFF',
  blackPiece: '#222222',
  highlight: '#FFFF0080',
};

// board: flat[64] -> 0=empty, 1=wPawn, 2=wKing, 3=bPawn, 4=bKing
const getPieceType = (val) => {
  switch (val) {
    case 1: return { color: COLORS.whitePiece, king: false };
    case 2: return { color: COLORS.whitePiece, king: true };
    case 3: return { color: COLORS.blackPiece, king: false };
    case 4: return { color: COLORS.blackPiece, king: true };
    default: return null;
  }
};

function MiniBoard({ board, lastMove, turn }) {
  const cells = [];
  const pieces = [];
  const highlights = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = row * 8 + col;
      const isDark = (row + col) % 2 === 1;

      cells.push(
        <rect
          key={`cell-${row}-${col}`}
          x={col * CELL_SIZE}
          y={row * CELL_SIZE}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isDark ? COLORS.dark : COLORS.light}
        />
      );

      const piece = board ? getPieceType(board[idx]) : null;
      if (piece) {
        const cx = col * CELL_SIZE + CELL_SIZE / 2;
        const cy = row * CELL_SIZE + CELL_SIZE / 2;
        pieces.push(
          <g key={`piece-${idx}`}>
            <circle cx={cx} cy={cy} r={PIECE_RADIUS} fill={piece.color} stroke="#333" strokeWidth="1.5" />
            {piece.king && (
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={CELL_SIZE * 0.5}
                fill={piece.color === COLORS.whitePiece ? '#333' : '#FFD700'}
              >♛</text>
            )}
          </g>
        );
      }
    }
  }

  // Highlight last move
  if (lastMove && lastMove.from && lastMove.to) {
    const fx = lastMove.from[1] * CELL_SIZE;
    const fy = lastMove.from[0] * CELL_SIZE;
    highlights.push(
      <rect key="hl-from" x={fx} y={fy} width={CELL_SIZE} height={CELL_SIZE} fill={COLORS.highlight} rx="3" />
    );
    const tx = lastMove.to[1] * CELL_SIZE;
    const ty = lastMove.to[0] * CELL_SIZE;
    highlights.push(
      <rect key="hl-to" x={tx} y={ty} width={CELL_SIZE} height={CELL_SIZE} fill={COLORS.highlight} rx="3" />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      width="100%"
      style={{ maxWidth: 300, display: 'block' }}
    >
      {cells}
      {highlights}
      {pieces}
    </svg>
  );
}

export default MiniBoard;