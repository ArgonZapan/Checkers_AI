#ifndef MINIMAX_H
#define MINIMAX_H

#include "board.h"
#include "movegen.h"
#include <vector>

struct MinimaxResult {
    double score = 0.0;
    bool hasMove = false;
    Move bestMove;
};

class Minimax {
public:
    static MinimaxResult minimaxSearch(const Board& board, Color color, int depth);

private:
    static constexpr int MAX_DEPTH = 8;

    static double alphaBeta(Board board, int depth, double alpha, double beta,
                            bool isMaximizing, Color rootColor);
    static double evaluate(const Board& board, Color perspective);
    static int popcount64(uint64_t bb);
    static void moveOrdering(std::vector<Move>& moves);
};

#endif // MINIMAX_H