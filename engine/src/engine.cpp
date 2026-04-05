#include "engine.h"
#include <sstream>
#include <algorithm>

void Engine::reset() {
    board.reset();
    lastMove_ = {};
    hasLastMove_ = false;
    positionHistory_.clear();
    // Don't reset gamesPlayed - it's a lifetime counter
}

uint64_t Engine::computeZobristHash(const Board& b) const {
    // Fast incremental hash using precomputed zobrist keys
    // Shared with minimax.cpp — same tables via header
    // For now, use the same bitboard concatenation as fallback
    // but compressed into uint64_t instead of string
    // White: 24 bits max, Black: 24 bits max, Kings: 24 bits, Turn: 1 bit
    // This is NOT cryptographic but good enough for 3fold detection
    uint64_t h = b.white ^ (b.black << 12) ^ (b.kings << 24);
    if (b.turn == BLACK) h ^= 0xAAAAAAAAAAAAAAAAULL;
    return h;
}

bool Engine::isThreefoldRepetition() const {
    if (positionHistory_.size() < 3) return false;
    uint64_t current = positionHistory_.back();
    int count = 0;
    for (const auto& h : positionHistory_) {
        if (h == current) count++;
    }
    return count >= 3;
}

bool Engine::isInsufficientMaterial() const {
    int whitePawns = popcount64(board.white & ~board.kings);
    int blackPawns = popcount64(board.black & ~board.kings);
    int whiteKings = popcount64(board.white & board.kings);
    int blackKings = popcount64(board.black & board.kings);

    // King vs king (no pawns, one king each)
    if (whitePawns == 0 && blackPawns == 0 && whiteKings == 1 && blackKings == 1) {
        return true;
    }
    return false;
}

GameState Engine::getFullState() const {
    GameState state;
    state.board = board.toFlatBoard();
    state.turn = (board.turn == WHITE) ? "white" : "black";

    GameResult result = getResult();
    state.gameOver = (result != ONGOING);
    switch (result) {
        case WHITE_WIN: state.winner = "white"; break;
        case BLACK_WIN: state.winner = "black"; break;
        case DRAW: state.winner = "draw"; break;
        default: state.winner = ""; break;
    }

    if (hasLastMove_) {
        state.lastMove.from[0] = lastMove_.from.row;
        state.lastMove.from[1] = lastMove_.from.col;
        state.lastMove.to[0] = lastMove_.to.row;
        state.lastMove.to[1] = lastMove_.to.col;
    }

    state.legalMoves = MoveGenerator::generateAll(board, board.turn);
    return state;
}

GameResult Engine::getResult() const {
    auto moves = MoveGenerator::generateAll(board, board.turn);
    if (moves.empty()) {
        return (board.turn == WHITE) ? BLACK_WIN : WHITE_WIN;
    }
    if (isThreefoldRepetition()) return DRAW;
    if (isInsufficientMaterial()) return DRAW;
    return ONGOING;
}

bool Engine::makeMove(const Move& move) {
    // Validate move is legal
    auto legalMoves = MoveGenerator::generateAll(board, board.turn);
    bool found = false;
    for (const auto& m : legalMoves) {
        if (m.from.row == move.from.row && m.from.col == move.from.col &&
            m.to.row == move.to.row && m.to.col == move.to.col) {
            found = true;
            break;
        }
    }
    if (!found) return false;

    // Add current position hash before making move
    positionHistory_.push_back(computeZobristHash(board));

    // Execute move
    board.makeMove(move);
    lastMove_ = move;
    hasLastMove_ = true;

    // Check result
    GameResult result = getResult();
    if (result != ONGOING) {
        gamesPlayed++;
    }

    return true;
}

MinimaxResult Engine::getBestMove(int depth) {
    return Minimax::minimaxSearch(board, board.turn, depth);
}