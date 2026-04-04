#ifndef BOARD_H
#define BOARD_H

#include <cstdint>
#include <vector>
#include <string>

// Cross-platform popcount
#if defined(_MSC_VER)
#include <intrin.h>
#pragma intrinsic(_mm_popcnt_u64)
static inline int popcount64(uint64_t x) {
    return (int)_mm_popcnt_u64(x);
}
#elif defined(__GNUC__) || defined(__clang__)
static inline int popcount64(uint64_t x) {
    return __builtin_popcountll(x);
}
#else
static inline int popcount64(uint64_t x) {
    int c = 0;
    while (x) { x &= x - 1; c++; }
    return c;
}
#endif

struct Square {
    int row, col;
    bool operator==(const Square& o) const { return row == o.row && col == o.col; }
    bool operator!=(const Square& o) const { return !(*this == o); }
};

struct Move {
    Square from, to;
    std::vector<Square> captures;
    std::vector<Square> path;
};

enum Color { WHITE = 1, BLACK = -1 };

struct Board {
    uint64_t white = 0, black = 0, kings = 0;
    Color turn = WHITE;

    void reset();
    void flipBoard();
    void unflipBoard() { flipBoard(); }
    void makeMove(const Move& move);

    static uint64_t sqMask(int r, int c) { return 1ULL << (r * 8 + c); }
    static bool inBounds(int r, int c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

    bool isEmpty(int r, int c) const {
        return !(white & sqMask(r, c)) && !(black & sqMask(r, c));
    }

    uint64_t allPieces() const { return white | black; }

    Color pieceColor(int r, int c) const {
        if (white & sqMask(r, c)) return WHITE;
        if (black & sqMask(r, c)) return BLACK;
        return WHITE;
    }

    bool isKing(int r, int c) const { return kings & sqMask(r, c); }
    bool isPawn(int r, int c) const { return !isKing(r, c); }

    bool hasPiece(Color color, int r, int c) const {
        return color == WHITE ? (white & sqMask(r, c)) : (black & sqMask(r, c));
    }

    int getCell(int r, int c) const;
    std::vector<int> toFlatBoard() const;
    std::string toString() const;
    uint64_t flip180(uint64_t bb) const;

    // Validation: returns false if board state is inconsistent
    bool isValid(std::string* reason = nullptr) const;
    
    // Count pieces
    int countWhitePawns() const { return popcount64(white & ~kings); }
    int countWhiteKings() const { return popcount64(white & kings); }
    int countBlackPawns() const { return popcount64(black & ~kings); }
    int countBlackKings() const { return popcount64(black & kings); }
    int totalPieces() const { return popcount64(allPieces()); }
};

#endif // BOARD_H