#ifndef MOVEGEN_H
#define MOVEGEN_H

#include "board.h"
#include <vector>

class MoveGenerator {
public:
    static std::vector<Move> generateForWhite(const Board& board);
    static std::vector<Move> generateAll(const Board& board, Color color);
    static std::vector<Move> generateCaptures(const Board& board, Color color);
    static bool hasAnyMove(const Board& board, Color color);

private:
    static constexpr int PAWN_DIRS[2][2] = {{1, -1}, {1, 1}};
    static constexpr int KING_DIRS[4][2] = {{1,-1},{1,1},{-1,-1},{-1,1}};

    static void generatePawnMoves(const Board& board, int r, int c, std::vector<Move>& moves);
    static void generateKingMoves(const Board& board, int r, int c, std::vector<Move>& moves);
    static void generatePawnCaptures(const Board& board, int r, int c, std::vector<Move>& moves);
    static void generateKingCaptures(const Board& board, int r, int c, std::vector<Move>& moves);

    static void multiCapture(Board board, int curR, int curC, Color color, bool isKing,
                            std::vector<Square>& captures, std::vector<Move>& result,
                            std::vector<Square>& path, uint64_t capturedMask);

    static Move unflipMove(const Move& move);
};

#endif // MOVEGEN_H