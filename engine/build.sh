#!/bin/bash
cd /c/Users/erykg/Desktop/checkers_ai/engine
rm -f build/*.o build/*.exe

cd /c/Users/erykg/Desktop/checkers_ai/engine
g++ -std=c++17 -O2 -D_WIN32_WINNT=0x0A00 -I src -I src/httplib -I src/httplib/nlohmann -DCPPHTTPLIB_USE_POLL \
    src/board.cpp src/movegen.cpp src/minimax.cpp src/engine.cpp src/main.cpp src/server.cpp \
    -o build/checkers-server.exe -lws2_32 -lmswsock -lpthread

if [ -f build/checkers-server.exe ]; then
    echo "BUILD SUCCESS: build/checkers-server.exe"
    ls -la build/checkers-server.exe
else
    echo "BUILD FAILED"
fi