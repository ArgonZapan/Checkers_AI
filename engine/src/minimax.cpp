#include "minimax.h"
#include <algorithm>
#include <cstdint>

int Minimax::popcount64(uint64_t bb) {
#if defined(__GNUC__) || defined(__clang__)
    return __builtin_popcountll(bb);
#else
    int count = 0;
    while (bb) {
        bb &= bb - 1;
        count++;
    }
    return count;
#endif
}

void Minimax::moveOrdering(std::vector<Move>& moves) {
    // Captures first - captures have non-empty captures vector
    std::stable_sort(moves.begin(), moves.end(), [](const Move& a, const Move& b) {
        bool aIsCapture = !a.captures.empty();
        bool bIsCapture = !b.captures.empty();
        return aIsCapture && !bIsCapture;
    });
}

double Minimax::evaluate(const Board& board, Color perspective) {
    uint64_t whitePawnsMask = board.white & ~board.kings;
    uint64_t whiteKingsMask = board.white & board.kings;
    uint64_t blackPawnsMask = board.black & ~board.kings;
    uint64_t blackKingsMask = board.black & board.kings;

    int whitePawns = popcount64(whitePawnsMask);
    int whiteKings = popcount64(whiteKingsMask);
    int blackPawns = popcount64(blackPawnsMask);
    int blackKings = popcount64(blackKingsMask);

    double material = (whitePawns - blackPawns) * 1.0 +
                     (whiteKings - blackKings) * 3.0;

    // Advance bonus
    double advanceBonus = 0.0;
    for (int r = 0; r < 8; r++) {
        for (int c = 0; c < 8; c++) {
            uint64_t mask = Board::sqMask(r, c);
            if (whitePawnsMask & mask) {
                advanceBonus += r * 0.05; // white advances row 0->7
            }
            if (blackPawnsMask & mask) {
                advanceBonus -= (7 - r) * 0.05; // black advances row 7->0
            }
        }
    }

    double score = material + advanceBonus;
    double maxPossible = 24.0 * 1.0 + 24.0 * 3.0 + 12.0 * 0.35; // ~80 roughly
    maxPossible = 51.0; // approximate max
    score = std::max(-1.0, std::min(1.0, score / maxPossible));

    if (perspective == BLACK) score = -score;
    return score;
}

double Minimax::alphaBeta(Board board, int depth, double alpha, double beta,
                          bool isMaximizing, Color rootColor) {
    if (depth == 0) {
        return evaluate(board, rootColor);
    }

    Color currentTurn = board.turn;
    auto moves = MoveGenerator::generateAll(board, currentTurn);

    if (moves.empty()) {
        // No legal moves = loss
        return isMaximizing ? -1.0 : 1.0;
    }

    moveOrdering(moves);

    if (isMaximizing) {
        double bestVal = -2.0;
        for (const auto& move : moves) {
            Board newBoard = board;
            newBoard.makeMove(move);
            double val = alphaBeta(newBoard, depth - 1, alpha, beta, false, rootColor);
            bestVal = std::max(bestVal, val);
            alpha = std::max(alpha, val);
            if (beta <= alpha) break;
        }
        return bestVal;
    } else {
        double bestVal = 2.0;
        for (const auto& move : moves) {
            Board newBoard = board;
            newBoard.makeMove(move);
            double val = alphaBeta(newBoard, depth - 1, alpha, beta, true, rootColor);
            bestVal = std::min(bestVal, val);
            beta = std::min(beta, val);
            if (beta <= alpha) break;
        }
        return bestVal;
    }
}

MinimaxResult Minimax::minimaxSearch(const Board& board, Color color, int depth) {
    MinimaxResult result;
    depth = std::min(depth, MAX_DEPTH);
    depth = std::max(depth, 1);

    auto moves = MoveGenerator::generateAll(board, board.turn);
    if (moves.empty()) {
        result.score = -1.0;
        result.hasMove = false;
        return result;
    }

    moveOrdering(moves);
    result.hasMove = true;
    bool isMaximizing = (board.turn == color);

    double bestVal = isMaximizing ? -2.0 : 2.0;
    Move bestMove = moves[0];

    for (const auto& move : moves) {
        Board newBoard = board;
        newBoard.makeMove(move);

        double val = alphaBeta(newBoard, depth - 1, -2.0, 2.0, !isMaximizing, color);

        if (isMaximizing) {
            if (val > bestVal) {
                bestVal = val;
                bestMove = move;
            }
        } else {
            if (val < bestVal) {
                bestVal = val;
                bestMove = move;
            }
        }
    }

    result.score = bestVal;
    result.bestMove = bestMove;
    return result;
}