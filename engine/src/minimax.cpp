#include "minimax.h"
#include <algorithm>
#include <cstdint>
#include <unordered_map>

// Zobrist-style hashing for transposition table
static constexpr uint64_t ZOBRIST_WHITE[64] = {
    0x9D39247E33776D41, 0x2AF7398005AAA0F5, 0x44DB015024623547, 0x9C15F73E62A76AE2,
    0x75834465489C0C89, 0x3290AC4A296EDC4B, 0x0E052601D5B845E7, 0x907F7D87C3C4B07E,
    0x7B3E4AA46C5D5D01, 0xE578E1D18E76D57B, 0xB60F3A4E4C149645, 0x06CF68D5A3A17B0A,
    0x7477C5A4F9D5CFC9, 0x1A2E4E1E3E8D6F5C, 0x8E2F3D5EAB5D4C7E, 0x55A9D2E8C1B4F3E7,
    0x1B8C578E3A9B6D2F, 0x74C3F5E1D8A9B2C0, 0xE8D7C6B5A493021F, 0x3E5F6A7B8C0D1E2F,
    0x92A1B3C4D5E6F7A8, 0x6D5C4B3A2918076F, 0xB4C2D1E0FA293847, 0x2E8A7B9C1D4F5E6A,
    0x7B9F3E5A2C8D1B4A, 0x5C8E2A7D4B9F3E1C, 0x9A1B3C5D7E8F2A4B, 0x4E2D1C3B5A9F8C7D,
    0x6F9A8B7C5D4E3A2C, 0x1C3D5E7A9B2C4D6E, 0xD1E3F5A7B9C2D4F6, 0x3A4B6C8D1E2F5A7B,
    0x8D9E0F1A2B3C4D5E, 0x5A6B8C9D0E1F3A4B, 0xB2C3D4E6F7A8B0C2, 0x2E3F5A6B7C8D0E1F,
    0x4C5D6E8F0A1B2C3D, 0x7B8C9D0E2F3A4B5C, 0xF0E1D2C4B3A59687, 0x9A8B7C5D4E6F3A1B,
    0x1234567890ABCDEF, 0x2345678901BCDEFA, 0x3456789012CDEFAB, 0x4567890123DEFABC,
    0x5678901234EFABCD, 0x6789012345FABCDE, 0x78901234560ABCDF, 0x89012345671ABCDE,
    0xA1B2C3D4E5F60718, 0xB2C3D4E5F6071829, 0xC3D4E5F60718293A, 0xD4E5F60718293A4B,
    0xE5F60718293A4B5C, 0xF60718293A4B5C6D, 0x0718293A4B5C6D7E, 0x18293A4B5C6D7E8F,
    0x8A2D7F5C3E1A9B4C, 0xFA7E3D9B2C8A6E4D, 0x5B4A9C3E7D2F8A1B, 0xC4E2A9F6B1D5C8E3,
    0x3FEDCBA987654321, 0x21436587A9CBEF01, 0x13579BDF02ACE684, 0x0F2E4D6C8BAA0E2F
};
static constexpr uint64_t ZOBRIST_BLACK[64] = {
    0xF2C0E5D5A5B0C4E3, 0x8A9B3C7D4E5F6A0B, 0x4D5E3F6A1B2C0D9E, 0xE3A4B5C6D7F0E1A2,
    0x7B9F5A3E1D8C2B4F, 0x6C2A8E3D5B9F7A1E, 0x9F1D3B5A7C0E2A4B, 0x5A4E2D8C0B3F9A7E,
    0xA1B2C3D4E5F6A0B9, 0xF0E9D8C7B6A50F1E, 0x3C4B5A6D7E0F9A8B, 0x7E6F5A0B9C8D3E2F,
    0xB4A3C2D1E0F9A8B7, 0x2D3E4F5A0B1C8A9F, 0xEC1B7D5A9F3C2E8A, 0x9E8A7C6B5D4F3A2E,
    0x5F3A2B1C8D9E0FA7, 0xCA9B8D7C6E5F4A3B, 0x4B3C5A7D0E9F2C1A, 0x8A9C7B5E3D1F4C2A,
    0xD5E6F7A8B9C0D1E2, 0x0F1E2D3C4B5A6F7E, 0x8D7C6B5A4E3F2A1B, 0x3F2E1D0C4B5A8F7E,
    0x1B2A3C4D5E6F7A8B, 0xC4D5E6F7A8B90C1D, 0x6E7A8B9C0D1E3F4A, 0xF8E7D6C5B4A39F2E,
    0xE0F1A2B3C4D5E6F7, 0x1D2E3F4A5B6C7D0E, 0x9A0B1C2D3E4F5A6B, 0xE7F6C5A4A3B8D9C2,
    0x4B5C6D7E8F9A0B11, 0x9F8A7B6E5D4C312A, 0x0A1B2C3D4E5F6A7B, 0x7C8D9E0F1A2B3C5E,
    0x3A2B1C0D9E8F7A6A, 0xA5B6C7D8E9F0A1B2, 0x1E2F3A0B9C8D7E6A, 0x3F4A5B6C8A9E0D1A,
    0xB2C3E4D5A6F7B8C9, 0x0F1A2E3D4B5C6A7E, 0x1B2C3E4F5A6B7D0C, 0xCAE3B4C5F6D7A8F9,
    0x5C4E7D6B9A8F3E2C, 0x2D3C4A5B0E1A8D9A, 0xF7E6D5C4A3B8E9CA, 0x6A5C7E4F3B2D1AFC,
    0x8F9E0A1B2C3D5A6B, 0x1A2F3E8D7C6A5B4E, 0xE0F1A2D3B4C5E6FA, 0xF3E2D1E0C4A5B7C8,
    0xB7C8A9F0E1D3C2A4, 0x0E1D9F8C7B6A5E4F, 0x7D6E2F3C8B9A0E1D, 0x2E3AFC4D5B6E9A1D,
    0x8B7C9A0F1E3D2E4A, 0xF4E3B5D2A9C8E7A0, 0x6F5E8A9B1C2E3D0B, 0x0D1C2A3B4F5C7A6F,
    0xA0A192A3B4E5C6D7, 0x1B0F2A1E3C0D4B9A, 0x6F0A5B1C4A2E3D8B, 0x3F4E5D0A1C9B7A2A
};
static constexpr uint64_t ZOBRIST_TURN = 0x55AA55AA55AA55AA;

static uint64_t computeZobristHash(const Board& board) {
    uint64_t hash = 0;
    uint64_t whitePawns = board.white & ~board.kings;
    uint64_t whiteKings = board.white & board.kings;
    uint64_t blackPawns = board.black & ~board.kings;
    uint64_t blackKings = board.black & board.kings;
    
    for (int sq = 0; sq < 64; sq++) {
        uint64_t mask = 1ULL << sq;
        if (whitePawns & mask) hash ^= ZOBRIST_WHITE[sq];
        if (whiteKings & mask) hash ^= (ZOBRIST_WHITE[sq] ^ 0xF0F0F0F0F0F0F0F0ULL);
        if (blackPawns & mask) hash ^= ZOBRIST_BLACK[sq];
        if (blackKings & mask) hash ^= (ZOBRIST_BLACK[sq] ^ 0x0F0F0F0F0F0F0F0FULL);
    }
    if (board.turn == BLACK) hash ^= ZOBRIST_TURN;
    return hash;
}

enum EntryType { EXACT, LOWER, UPPER };
struct TTEntry {
    uint64_t hash = 0;
    double value = 0;
    int depth = 0;
    EntryType type = EXACT;
};

static std::unordered_map<uint64_t, TTEntry> transpositionTable;

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

// OPTIMIZATION: Precomputed advance bonus lookups for all 256 possible pawn placements
// Row weights: white = 0..7 * 0.05, black = 7..0 * 0.05
// Avoids 64-bitmask loop in evaluate()
static constexpr double PAWN_ROW_BONUS[8] = {0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35};

double Minimax::evaluate(const Board& board, Color perspective) {
    int whitePawns = popcount64(board.white & ~board.kings);
    int whiteKings = popcount64(board.white & board.kings);
    int blackPawns = popcount64(board.black & ~board.kings);
    int blackKings = popcount64(board.black & board.kings);

    // Material: 1.0 per pawn, 3.0 per king
    double material = (whitePawns - blackPawns) +
                      (whiteKings - blackKings) * 3.0;

    // Advance bonus — computed via popcount of row slices
    double advanceBonus = 0.0;
    for (int r = 0; r < 8; r++) {
        // Pawns on this row (bits r*8..r*8+7)
        uint64_t rowMask = 0xFFULL << (r * 8);
        int wpOnRow = popcount64((board.white & ~board.kings) & rowMask);
        int bpOnRow = popcount64((board.black & ~board.kings) & rowMask);
        advanceBonus += wpOnRow * PAWN_ROW_BONUS[r];
        advanceBonus -= bpOnRow * PAWN_ROW_BONUS[7 - r];
    }

    double score = material + advanceBonus;
    // Clamp to [-1, 1] for DQN target compatibility
    score = score < -1.0 ? -1.0 : (score > 1.0 ? 1.0 : score / 51.0);

    if (perspective == BLACK) score = -score;
    return score;
}

double Minimax::alphaBeta(Board board, int depth, double alpha, double beta,
                          bool isMaximizing, Color rootColor) {
    // Transposition table lookup
    uint64_t hash = computeZobristHash(board);
    auto it = transpositionTable.find(hash);
    if (it != transpositionTable.end() && it->second.depth >= depth) {
        if (it->second.type == EXACT) return it->second.value;
        if (it->second.type == LOWER) alpha = std::max(alpha, it->second.value);
        if (it->second.type == UPPER) beta = std::min(beta, it->second.value);
        if (alpha >= beta) return it->second.value;
    }

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

    double bestVal;
    if (isMaximizing) {
        bestVal = -2.0;
        for (const auto& move : moves) {
            Board newBoard = board;
            newBoard.makeMove(move);
            double val = alphaBeta(newBoard, depth - 1, alpha, beta, false, rootColor);
            bestVal = std::max(bestVal, val);
            alpha = std::max(alpha, val);
            if (beta <= alpha) break;
        }
    } else {
        bestVal = 2.0;
        for (const auto& move : moves) {
            Board newBoard = board;
            newBoard.makeMove(move);
            double val = alphaBeta(newBoard, depth - 1, alpha, beta, true, rootColor);
            bestVal = std::min(bestVal, val);
            beta = std::min(beta, val);
            if (beta <= alpha) break;
        }
    }

    // Store result in transposition table
    EntryType type = (bestVal <= alpha) ? UPPER : (bestVal >= beta) ? LOWER : EXACT;
    transpositionTable[hash] = {hash, bestVal, depth, type};

    return bestVal;
}

MinimaxResult Minimax::minimaxSearch(const Board& board, Color color, int depth) {
    MinimaxResult result;
    depth = std::min(depth, MAX_DEPTH);
    depth = std::max(depth, 1);

    // Clear transposition table before each new search (avoids stale entries across games)
    transpositionTable.clear();
    // Reserve to avoid rehashing overhead
    transpositionTable.reserve(300000);

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