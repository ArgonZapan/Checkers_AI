#include "engine.h"
#include "httplib.h"
#include "json.hpp"
#include <iostream>

static Engine g_engine;

static nlohmann::json makeMoveJson(const Move& m) {
    nlohmann::json jm;
    jm["from"] = {m.from.row, m.from.col};
    jm["to"] = {m.to.row, m.to.col};
    jm["captures"] = nlohmann::json::array();
    for (const auto& c : m.captures)
        jm["captures"].push_back({c.row, c.col});
    return jm;
}

static void writeStateResponse(httplib::Response& res, const GameState& state) {
    nlohmann::json j;
    j["board"] = state.board;
    j["turn"] = state.turn;
    j["gameOver"] = state.gameOver;
    if (state.winner.empty()) {
        j["winner"] = nullptr;
    } else {
        j["winner"] = state.winner;
    }
    if (state.lastMove.from[0] >= 0) {
        j["lastMove"] = nlohmann::json{{"from", {state.lastMove.from[0], state.lastMove.from[1]}},
                                        {"to", {state.lastMove.to[0], state.lastMove.to[1]}}};
    } else {
        j["lastMove"] = nullptr;
    }
    nlohmann::json moves = nlohmann::json::array();
    for (const auto& m : state.legalMoves) {
        moves.push_back(makeMoveJson(m));
    }
    j["legalMoves"] = moves;
    res.set_content(j.dump(), "application/json");
}

void setupServer(httplib::Server& svr) {
    // GET /api/status
    svr.Get("/api/status", [](const httplib::Request&, httplib::Response& res) {
        nlohmann::json j = {
            {"ready", true},
            {"gamesPlayed", g_engine.gamesPlayed}
        };
        res.set_content(j.dump(), "application/json");
    });

    // POST /api/game/full-state
    svr.Post("/api/game/full-state", [](const httplib::Request&, httplib::Response& res) {
        auto state = g_engine.getFullState();
        writeStateResponse(res, state);
    });

    // POST /api/move
    svr.Post("/api/move", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = nlohmann::json::parse(req.body);
            int fr = body["from"][0].get<int>();
            int fc = body["from"][1].get<int>();
            int tr = body["to"][0].get<int>();
            int tc = body["to"][1].get<int>();

            // Get legal moves
            auto legalMoves = MoveGenerator::generateAll(g_engine.board, g_engine.board.turn);
            bool found = false;
            Move matchedMove;

            for (const auto& m : legalMoves) {
                if (m.from.row == fr && m.from.col == fc && m.to.row == tr && m.to.col == tc) {
                    matchedMove = m;
                    found = true;
                    break;
                }
            }

            if (!found) {
                res.status = 400;
                res.set_content(R"({"error":"Invalid move"})", "application/json");
                return;
            }

            g_engine.makeMove(matchedMove);

            // Return new state
            auto state = g_engine.getFullState();
            writeStateResponse(res, state);
        } catch (const std::exception& e) {
            res.status = 400;
            res.set_content(R"({"error":"Bad request"})", "application/json");
        }
    });

    // POST /api/engine/best-move
    svr.Post("/api/engine/best-move", [](const httplib::Request& req, httplib::Response& res) {
        int depth = 7;
        try {
            auto body = nlohmann::json::parse(req.body);
            if (body.contains("depth")) depth = body["depth"];
        } catch (...) {}
        depth = std::max(1, std::min(8, depth));

        auto result = g_engine.getBestMove(depth);
        nlohmann::json j;
        j["score"] = result.score;
        j["hasMove"] = result.hasMove;
        if (result.hasMove) {
            j["move"]["from"] = {result.bestMove.from.row, result.bestMove.from.col};
            j["move"]["to"] = {result.bestMove.to.row, result.bestMove.to.col};
            j["move"]["captures"] = nlohmann::json::array();
            for (const auto& c : result.bestMove.captures)
                j["move"]["captures"].push_back({c.row, c.col});
            j["move"]["path"] = nlohmann::json::array();
            for (const auto& p : result.bestMove.path)
                j["move"]["path"].push_back({p.row, p.col});
        }
        res.set_content(j.dump(), "application/json");
    });

    // POST /api/board/set (debug) - set raw board state
    svr.Post("/api/board/set", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = nlohmann::json::parse(req.body);
            auto& bd = body["board"]; // flat array of 64 ints
            // Just reset and let user set via individual setup
            g_engine.reset();
            res.set_content(R"({"status":"board set (reset)})", "application/json");
        } catch (...) {
            res.status = 400;
            res.set_content(R"({"error":"Bad request"})", "application/json");
        }
    });

    // POST /api/game/reset
    svr.Post("/api/game/reset", [](const httplib::Request&, httplib::Response& res) {
        g_engine.reset();
        res.set_content(R"({"status":"reset"})", "application/json");
    });

    std::cout << "Checkers AI Engine listening on port 8080..." << std::endl;
}