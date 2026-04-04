#include "movegen.h"

void MoveGenerator::generatePawnMoves(const Board& board, int r, int c, std::vector<Move>& moves) {
    for (auto& d : PAWN_DIRS) {
        int nr = r + d[0], nc = c + d[1];
        if (Board::inBounds(nr, nc) && board.isEmpty(nr, nc)) {
            Move m;
            m.from = {r, c};
            m.to = {nr, nc};
            m.captures = {};
            m.path = {{r, c}, {nr, nc}};
            moves.push_back(m);
        }
    }
}

void MoveGenerator::generateKingMoves(const Board& board, int r, int c, std::vector<Move>& moves) {
    for (auto& d : KING_DIRS) {
        for (int step = 1; step < 8; step++) {
            int nr = r + d[0] * step, nc = c + d[1] * step;
            if (!Board::inBounds(nr, nc)) break;
            if (!board.isEmpty(nr, nc)) break; // blocked
            Move m;
            m.from = {r, c};
            m.to = {nr, nc};
            m.captures = {};
            m.path = {{r, c}, {nr, nc}};
            moves.push_back(m);
        }
    }
}

void MoveGenerator::generatePawnCaptures(const Board& board, int r, int c, std::vector<Move>& moves) {
    Color myColor = board.pieceColor(r, c);
    Color oppColor = (myColor == WHITE) ? BLACK : WHITE;
    for (auto& d : PAWN_DIRS) {
        int mr = r + d[0], mc = c + d[1];
        int lr = r + 2*d[0], lc = c + 2*d[1];
        if (Board::inBounds(lr, lc) && board.isEmpty(lr, lc) && board.hasPiece(oppColor, mr, mc)) {
            std::vector<Square> captures;
            std::vector<Square> path;
            captures.push_back({mr, mc});
            path.push_back({lr, lc});
            
            // Create board state after this capture
            Board newBoard = board;
            uint64_t curMask = Board::sqMask(r, c);
            uint64_t midMask = Board::sqMask(mr, mc);
            uint64_t landMask = Board::sqMask(lr, lc);
            if (myColor == WHITE) {
                newBoard.white = (newBoard.white & ~curMask) | landMask;
                newBoard.black &= ~midMask;
            } else {
                newBoard.black = (newBoard.black & ~curMask) | landMask;
                newBoard.white &= ~midMask;
            }
            newBoard.kings &= ~midMask;
            // Check promotion
            if (myColor == WHITE && lr == 7) newBoard.kings |= landMask;
            if (myColor == BLACK && lr == 0) newBoard.kings |= landMask;
            
            uint64_t capturedMask = midMask;
            
            // Try to find further captures from landing position
            bool canCaptureFurther = false;
            for (auto& d2 : PAWN_DIRS) {
                int mr2 = lr + d2[0], mc2 = lc + d2[1];
                int lr2 = lr + 2*d2[0], lc2 = lc + 2*d2[1];
                uint64_t midMask2 = Board::sqMask(mr2, mc2);
                if (Board::inBounds(lr2, lc2) && newBoard.isEmpty(lr2, lc2) && 
                    newBoard.hasPiece(oppColor, mr2, mc2) && !(capturedMask & midMask2)) {
                    canCaptureFurther = true;
                    break;
                }
            }
            
            if (!canCaptureFurther) {
                // Terminal capture - add as complete move
                Move m;
                m.from = {r, c};
                m.to = {lr, lc};
                m.captures = captures;
                m.path = {{r, c}, {lr, lc}};
                moves.push_back(m);
            } else {
                // Continue recursion for multi-captures
                std::vector<Square> pathStart = {{r, c}, {lr, lc}};
                MoveGenerator::multiCapture(newBoard, lr, lc, myColor, newBoard.isKing(lr, lc), captures, moves, pathStart, capturedMask);
            }
        }
    }
}

void MoveGenerator::generateKingCaptures(const Board& board, int r, int c, std::vector<Move>& moves) {
    Color myColor = board.pieceColor(r, c);
    Color oppColor = (myColor == WHITE) ? BLACK : WHITE;
    
    for (auto& d : KING_DIRS) {
        for (int step = 1; step < 8; step++) {
            int mr = r + d[0] * step, mc = c + d[1] * step;
            if (!Board::inBounds(mr, mc)) break;
            
            // Check if opponent piece is here
            if (board.hasPiece(oppColor, mr, mc)) {
                uint64_t mMask = Board::sqMask(mr, mc);
                
                // Check for empty landing squares behind it
                for (int land = step + 1; land < 8; land++) {
                    int lr = r + d[0] * land, lc = c + d[1] * land;
                    if (!Board::inBounds(lr, lc) || !board.isEmpty(lr, lc)) break;
                    uint64_t lMask = Board::sqMask(lr, lc);
                    
                    // Create board state after this capture
                    Board newBoard = board;
                    uint64_t curMask = Board::sqMask(r, c);
                    if (myColor == WHITE) {
                        newBoard.white = (newBoard.white & ~curMask) | lMask;
                        newBoard.black &= ~mMask;
                    } else {
                        newBoard.black = (newBoard.black & ~curMask) | lMask;
                        newBoard.white &= ~mMask;
                    }
                    newBoard.kings &= ~mMask;
                    // King promotion for the capturing piece (maintain king status)
                    newBoard.kings |= lMask;
                    
                    std::vector<Square> captures;
                    captures.push_back({mr, mc});
                    std::vector<Square> path;
                    path.push_back({lr, lc});
                    
                    uint64_t capturedMask = mMask;
                    
                    // Try to find further captures from landing position
                    bool canCaptureFurther = false;
                    
                    // Check all king directions
                    for (auto& d2 : KING_DIRS) {
                        for (int step2 = 1; step2 < 8; step2++) {
                            int mr2 = lr + d2[0] * step2, mc2 = lc + d2[1] * step2;
                            if (!Board::inBounds(mr2, mc2)) break;
                            uint64_t mMask2 = Board::sqMask(mr2, mc2);
                            if (newBoard.hasPiece(myColor, mr2, mc2)) break;
                            if (newBoard.hasPiece(oppColor, mr2, mc2) && !(capturedMask & mMask2)) {
                                canCaptureFurther = true;
                                break;
                            }
                            if (!newBoard.isEmpty(mr2, mc2)) break;
                        }
                        if (canCaptureFurther) break;
                    }
                    
                    // Also check pawn capture directions (for completeness)
                    if (!canCaptureFurther) {
                        for (auto& d2 : PAWN_DIRS) {
                            int mr2 = lr + d2[0], mc2 = lc + d2[1];
                            int lr2 = lr + 2*d2[0], lc2 = lc + 2*d2[1];
                            uint64_t mMask2 = Board::sqMask(mr2, mc2);
                            if (Board::inBounds(lr2, lc2) && newBoard.isEmpty(lr2, lc2) && 
                                newBoard.hasPiece(oppColor, mr2, mc2) && !(capturedMask & mMask2)) {
                                canCaptureFurther = true;
                                break;
                            }
                        }
                    }
                    
                    if (!canCaptureFurther) {
                        // Terminal capture - add as complete move
                        Move m;
                        m.from = {r, c};
                        m.to = {lr, lc};
                        m.captures = captures;
                        m.path = {{r, c}, {lr, lc}};
                        moves.push_back(m);
                    } else {
                        // Continue recursion for multi-captures
                        std::vector<Square> pathStart = {{r, c}, {lr, lc}};
                        MoveGenerator::multiCapture(newBoard, lr, lc, myColor, true, captures, moves, pathStart, capturedMask);
                    }
                }
                break; // Only first opponent piece per direction
            }
            if (!board.isEmpty(mr, mc)) break; // blocked by own piece
        }
    }
}

void MoveGenerator::multiCapture(Board board, int curR, int curC, Color color, bool isKing,
                                 std::vector<Square>& captures, std::vector<Move>& result,
                                 std::vector<Square>& path, uint64_t capturedMask) {
    Color oppColor = (color == WHITE) ? BLACK : WHITE;
    bool canCaptureFurther = false;

    // Determine directions to check
    const int (*dirs)[2] = isKing ? KING_DIRS : PAWN_DIRS;
    int dirCount = isKing ? 4 : 2;

    for (int di = 0; di < dirCount; di++) {
        auto& d = dirs[di];

        // For pawns: check immediate jump. For kings: scan each direction.
        if (isKing) {
            // Scan in this direction to find opponent piece
            for (int step = 1; step < 8; step++) {
                int mr = curR + d[0] * step, mc = curC + d[1] * step;
                if (!Board::inBounds(mr, mc)) break;
                uint64_t mMask = Board::sqMask(mr, mc);
                // If already captured this piece, skip
                if (capturedMask & mMask) continue;
                // If own piece, blocked
                if (board.hasPiece(color, mr, mc)) break;
                // If opponent piece, check landing squares behind
                if (board.hasPiece(oppColor, mr, mc)) {
                    for (int land = step + 1; land < 8; land++) {
                        int lr = curR + d[0] * land, lc = curC + d[1] * land;
                        if (!Board::inBounds(lr, lc)) break;
                        uint64_t lMask = Board::sqMask(lr, lc);
                        if (board.allPieces() & lMask) {
                            // Blocked by any piece on landing square
                            break;
                        }
                        // Empty square - try to capture and recurse
                        Board newBoard = board;
                        // Move piece from current to landing square
                        uint64_t curMask = Board::sqMask(curR, curC);
                        if (color == WHITE) {
                            newBoard.white = (newBoard.white & ~curMask) | lMask;
                        } else {
                            newBoard.black = (newBoard.black & ~curMask) | lMask;
                        }
                        // Remove captured opponent piece
                        if (color == WHITE) {
                            newBoard.black &= ~mMask;
                        } else {
                            newBoard.white &= ~mMask;
                        }
                        newBoard.kings &= ~mMask;
                        // Maintain king status for the capturing king piece
                        newBoard.kings |= lMask;

                        captures.push_back({mr, mc});
                        path.push_back({lr, lc});
                        uint64_t newCapturedMask = capturedMask | mMask;

                        multiCapture(newBoard, lr, lc, color, true, captures, result, path, newCapturedMask);
                        captures.pop_back();
                        path.pop_back();
                        canCaptureFurther = true;
                    }
                    break;
                }
            }
        } else {
            int mr = curR + d[0], mc = curC + d[1];
            int lr = curR + 2*d[0], lc = curC + 2*d[1];
            if (!Board::inBounds(lr, lc)) continue;
            uint64_t mMask = Board::sqMask(mr, mc);
            uint64_t lMask = Board::sqMask(lr, lc);
            // Skip if already captured this opponent piece
            if (capturedMask & mMask) continue;
            if (board.hasPiece(oppColor, mr, mc) && board.isEmpty(lr, lc)) {
                Board newBoard = board;
                uint64_t curMask = Board::sqMask(curR, curC);
                if (color == WHITE) {
                    newBoard.white = (newBoard.white & ~curMask) | lMask;
                } else {
                    newBoard.black = (newBoard.black & ~curMask) | lMask;
                }
                // Remove captured opponent piece
                if (color == WHITE) {
                    newBoard.black &= ~mMask;
                } else {
                    newBoard.white &= ~mMask;
                }
                newBoard.kings &= ~mMask;
                // Check promotion for pawn capturing
                if (color == WHITE && lr == 7) newBoard.kings |= lMask;
                if (color == BLACK && lr == 0) newBoard.kings |= lMask;

                captures.push_back({mr, mc});
                path.push_back({lr, lc});
                uint64_t newCapturedMask = capturedMask | mMask;

                multiCapture(newBoard, lr, lc, color, newBoard.isKing(lr, lc), captures, result, path, newCapturedMask);
                captures.pop_back();
                path.pop_back();
                canCaptureFurther = true;
            }
        }
    }

    // If no further captures, this is a terminal capture sequence - add the move
    if (!canCaptureFurther && !captures.empty()) {
        Move m;
        m.from = path[0]; // start position
        m.to = path.back(); // last landing position
        m.captures = captures;
        m.path = path;
        result.push_back(m);
    }
}

std::vector<Move> MoveGenerator::generateForWhite(const Board& board) {
    std::vector<Move> captures, simpleMoves;

    // First pass: check all captures
    for (int r = 0; r < 8; r++) {
        for (int c = 0; c < 8; c++) {
            if (!board.hasPiece(WHITE, r, c)) continue;
            if (board.isKing(r, c)) {
                generateKingCaptures(board, r, c, captures);
            } else {
                generatePawnCaptures(board, r, c, captures);
            }
        }
    }

    // If captures exist, only return captures (mandatory capture rule)
    if (!captures.empty()) return captures;

    // Second pass: simple moves
    for (int r = 0; r < 8; r++) {
        for (int c = 0; c < 8; c++) {
            if (!board.hasPiece(WHITE, r, c)) continue;
            if (board.isKing(r, c)) {
                generateKingMoves(board, r, c, simpleMoves);
            } else {
                generatePawnMoves(board, r, c, simpleMoves);
            }
        }
    }

    return simpleMoves;
}

Move MoveGenerator::unflipMove(const Move& move) {
    Move m;
    m.from = {7 - move.from.row, 7 - move.from.col};
    m.to = {7 - move.to.row, 7 - move.to.col};
    for (const auto& sq : move.captures) {
        m.captures.push_back({7 - sq.row, 7 - sq.col});
    }
    for (const auto& sq : move.path) {
        m.path.push_back({7 - sq.row, 7 - sq.col});
    }
    return m;
}

std::vector<Move> MoveGenerator::generateAll(const Board& board, Color color) {
    if (color == WHITE) {
        return generateForWhite(board);
    } else {
        Board flipped = board;
        flipped.flipBoard();
        auto moves = generateForWhite(flipped);
        // Unflip each move
        std::vector<Move> result;
        for (const auto& m : moves) {
            result.push_back(unflipMove(m));
        }
        return result;
    }
}

std::vector<Move> MoveGenerator::generateCaptures(const Board& board, Color color) {
    if (color == WHITE) {
        std::vector<Move> captures;
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                if (!board.hasPiece(WHITE, r, c)) continue;
                if (board.isKing(r, c)) {
                    generateKingCaptures(board, r, c, captures);
                } else {
                    generatePawnCaptures(board, r, c, captures);
                }
            }
        }
        return captures;
    } else {
        Board flipped = board;
        flipped.flipBoard();
        std::vector<Move> captures;
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                if (!flipped.hasPiece(WHITE, r, c)) continue;
                if (flipped.isKing(r, c)) {
                    generateKingCaptures(flipped, r, c, captures);
                } else {
                    generatePawnCaptures(flipped, r, c, captures);
                }
            }
        }
        std::vector<Move> result;
        for (const auto& m : captures) {
            result.push_back(unflipMove(m));
        }
        return result;
    }
}

bool MoveGenerator::hasAnyMove(const Board& board, Color color) {
    return !generateAll(board, color).empty();
}