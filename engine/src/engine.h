#ifndef ENGINE_H
#define ENGINE_H

#include "board.h"
#include "movegen.h"
#include "minimax.h"
#include <vector>
#include <string>

enum GameResult { ONGOING, WHITE_WIN, BLACK_WIN, DRAW };

struct LastMoveInfo {
    int from[2] = {-1, -1};
    int to[2] = {-1, -1};
};

struct GameState {
    std::vector<int> board;        // flat 64: 0=empty,1=wPawn,2=wKing,3=bPawn,4=bKing
    std::string turn;              // "white" or "black"
    bool gameOver;
    std::string winner;            // "white", "black", "draw", or ""
    LastMoveInfo lastMove;
    std::vector<Move> legalMoves;
};

class Engine {
public:
    Board board;
    int gamesPlayed = 0;

    Engine() { reset(); }
    void reset();
    GameState getFullState() const;
    GameResult getResult() const;
    bool makeMove(const Move& move);
    MinimaxResult getBestMove(int depth = 4);

private:
    Move lastMove_;
    bool hasLastMove_ = false;
    std::vector<std::string> positionHistory_;  // position hashes for 3x repetition

    std::string computeHash(const Board& b) const;
    bool isThreefoldRepetition() const;
    bool isInsufficientMaterial() const;
};

#endif // ENGINE_H