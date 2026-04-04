cmake_minimum_required(VERSION 3.14)
project(CheckersAI LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Static library for game engine logic
add_library(engine STATIC
    src/board.cpp
    src/movegen.cpp
    src/minimax.cpp
    src/engine.cpp
)

target_include_directories(engine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

# Include external headers (httplib, nlohmann/json)
target_include_directories(engine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src/httplib)

# Main server executable
add_executable(checkers-server
    src/main.cpp
    src/server.cpp
)

target_link_libraries(checkers-server PRIVATE engine)

# Thread library for httplib
find_package(Threads REQUIRED)
target_link_libraries(checkers-server PRIVATE Threads::Threads)