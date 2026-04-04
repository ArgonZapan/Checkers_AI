# Tech Context

## Stack

### Silnik C++ (Game Engine)
- Język: **C++17**
- Kompilator: **GCC 15.2.0 (MinGW64)**
- HTTP: **cpp-httplib** (header-only)
- JSON: **nlohmann/json** (header-only)
- Build: **CMake 3.14+** lub **g++ ręcznie**

### Backend
- Język: **Node.js**
- Framework: **Express.js + Socket.IO**
- AI: **TensorFlow.js** (modele DQN)
- Security: **Helmet**

### Frontend
- Framework: **React 18 + Vite**
- Rendering planszy: **SVG**

## Dev Environment
- OS: **Windows 11**
- Kompilator: **MSYS2 MinGW64** (`C:\msys64\mingw64\bin\g++.exe`)
- Package manager: **npm**
- Frontend dev server: **Vite (port 5173)**

## Key Dependencies
| Package | Purpose |
|---------|---------|
| cpp-httplib | HTTP server w C++ (header-only) |
| nlohmann/json | Parsowanie JSON w C++ |
| Socket.IO | WebSocket komunikacja server-client |
| TensorFlow.js | Modele DQN dla AI strategies |

## Architektura
```
Frontend (React)  <--Socket.IO-->  Node.js Server  <--HTTP-->  C++ Engine
    :3001                                :3001                     :8081
```

## Kompilacja C++

### WAŻNE: Flaga `_WIN32_WINNT`
cpp-httplib wymaga Windows 10+:
```
-D_WIN32_WINNT=0x0A00
```
Bez tej flagi: `error: '::CreateFile2' has not been declared`

### Pełna komenda g++
```bash
g++ -std=c++17 -O2 -D_WIN32_WINNT=0x0A00 \
    -I src -I src/httplib -I src/httplib/nlohmann \
    -DCPPHTTPLIB_USE_POLL \
    src/board.cpp src/movegen.cpp src/minimax.cpp src/engine.cpp src/main.cpp src/server.cpp \
    -o build/checkers-server.exe -lws2_32 -lmswsock -lpthread
```

### Skrypt budujący
`engine/build.sh` - automatyczna kompilacja przez MSYS2

### Szczegóły
Zobacz `engine/BUILD.md` dla pełnej instrukcji

## Porty
- **8081** - C++ Engine (HTTP REST API)
- **3001** - Node.js Server + Frontend
- **5173** - Vite dev server (opcjonalnie)

## Technical Constraints
- Bitboard 64-bit (max 8x8 plansza)
- Kompilacja tylko przez MSYS2 MinGW64 na Windows
- cpp-httplib wymaga Windows 10+ (`_WIN32_WINNT=0x0A00`)