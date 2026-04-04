---
name: build-cpp
description: Brief description of what this skill does
---

## Opis
Kompilacja silnika Checkers AI przy użyciu kompilatora g++ z MSYS2 MinGW64.

## Wymagania
- MSYS2 z zainstalowanym Mingw64 GCC: `pacman -S mingw-w64-x86_64-gcc`
- Ścieżka kompilatora: `C:\msys64\mingw64\bin\g++.exe`

## Kompilacja

```bash
C:\msys64\mingw64\bin\g++.exe -std=c++17 -O2 -D_WIN32_WINNT=0x0A00 \
    -I engine/src -I engine/src/httplib -DCPPHTTPLIB_USE_POLL \
    engine/src/board.cpp engine/src/movegen.cpp engine/src/minimax.cpp \
    engine/src/engine.cpp engine/src/main.cpp engine/src/server.cpp \
    -o engine/build/checkers-server.exe -lws2_32 -lmswsock
```

## Ważne flagi
- `-D_WIN32_WINNT=0x0A00` — wymagane dla cpp-httplib (Windows 10+)
- `-DCPPHTTPLIB_USE_POLL` — użyj poll zamiast select
- `-lws2_32 -lmswsock` — biblioteki Windows socket

## Uruchomienie
```cmd
set PATH=C:\msys64\mingw64\bin;%PATH%
set PORT=8081
engine\build\checkers-server.exe
```

## Alternatywne metody
1. **build.sh**: `bash engine/build.sh` (w MSYS2)
2. **CMake**: `cmake .. -G "MinGW Makefiles" && mingw32-make -j4`

## Struktura plików źródłowych
- `board.cpp/h` — plansza, bitboard, stany gry
- `movegen.cpp/h` — generowanie ruchów
- `minimax.cpp/h` — algorytm minimax z alpha-beta
- `engine.cpp/h` — główna logika silnika
- `server.cpp` — serwer HTTP
- `main.cpp` — punkt wejścia