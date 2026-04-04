# Checkers AI Engine - Instrukcja kompilacji

## Wymagania

### Windows
- **MSYS2** - Pobierz z https://www.msys2.org/
- **GCC 13+ (MinGW64)** - Instalowany przez MSYS2
- **CMake 3.14+** (opcjonalnie)
- **Node.js 20+** - Dla serwera aplikacji

### Instalacja zależności w MSYS2
```bash
# Otwórz MSYS2 MinGW64 i uruchom:
pacman -S mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake mingw-w64-x86_64-pkg-config
```

---

## Kompilacja silnika C++

### Metoda 1: Skrypt budujący (zalecana)

```bash
# Otwórz MSYS2 MinGW64 i uruchom:
C:\msys64\msys2_shell.cmd -mingw64 -here -c "bash /c/Users/%USERNAME%/Desktop/checkers_ai/engine/build.sh"
```

Albo wewnątrz MSYS2:
```bash
cd /c/Users/$USERNAME/Desktop/checkers_ai/engine
bash build.sh
```

Skrypt automatycznie:
- Usunie stare pliki `.o` i `.exe`
- Skompiluje wszystkie pliki źródłowe
- Połączy w jeden plik `build/checkers-server.exe`

### Metoda 2: Ręczna kompilacja (g++)

```bash
cd /c/Users/$USERNAME/Desktop/checkers_ai/engine
g++ -std=c++17 -O2 -D_WIN32_WINNT=0x0A00 \
    -I src -I src/httplib -I src/httplib/nlohmann \
    -DCPPHTTPLIB_USE_POLL \
    src/board.cpp src/movegen.cpp src/minimax.cpp src/engine.cpp src/main.cpp src/server.cpp \
    -o build/checkers-server.exe -lws2_32 -lmswsock -lpthread
```

**WAŻNE:** Flaga `-D_WIN32_WINNT=0x0A00` jest wymagana! Bez niej `cpp-httplib` zgłosi błąd o Windows 8.

### Metoda 3: CMake

```bash
cd /c/Users/$USERNAME/Desktop/checkers_ai/engine
mkdir -p build && cd build
cmake .. -G "MinGW Makefiles"
mingw32-make -j4
```

---

## Uruchamianie

### 1. Silnik C++ (port 8081)
```bash
cd engine/build
set PATH=C:\msys64\mingw64\bin;%PATH%
set PORT=8081
checkers-server.exe
```

### 2. Serwer Node.js (port 3001)
```bash
cd server
set PORT=3001
set CPP_BASE=http://localhost:8081
node index.js
```

### 3. Szybki start - batch file
Wystarczy uruchomić `start-production.bat` w głównym katalogu projektu.

---

## Struktura plików

```
engine/
├── build.sh                    # Automatyczny skrypt budowania
├── CMakeLists.txt              # Konfiguracja CMake
├── src/
│   ├── board.cpp/h             # Plansza, bitboard, stany gry
│   ├── movegen.cpp/h           # Generowanie ruchów (w tym wielokrotne bicia)
│   ├── minimax.cpp/h           # Algorytm minimax z alpha-beta
│   ├── engine.cpp/h            # Główna logika silnika
│   ├── server.cpp              # Serwer HTTP (httplib)
│   ├── main.cpp                # Punkt wejścia
│   └── httplib/                # Biblioteka httplib (zewnętrzna)
└── build/
    └── checkers-server.exe     # Skompilowany silnik
```

---

## Typowe błędy i rozwiązania

### `error: '::CreateFile2' has not been declared`
**Przyczyna:** Brak flagi `-D_WIN32_WINNT=0x0A00`
**Rozwiązanie:** Dodaj flagę do komendy g++: `-D_WIN32_WINNT=0x0A00`

### `error #error "cpp-httplib doesn't support Windows 8 or lower"`
**Przyczyna:** To samo co wyżej - windowsowa wersja httplib wymaga Windows 10+
**Rozwiązanie:** `-D_WIN32_WINNT=0x0A00` definiuje target jako Windows 10

### `checkers-server.exe: command not found`
**Przyczyna:** Brak DLL w PATH
**Rozwiązanie:** Dodaj `C:\msys64\mingw64\bin` do PATH przed uruchomieniem

### Brak kompilatora
**Sprawdź:** `C:\msys64\mingw64\bin\g++.exe --version`
**Jeśli brak:** Zainstaluj MSYS2 i `pacman -S mingw-w64-x86_64-gcc`

---

## Debugowanie

### Logowanie ruchów
W `board.cpp` dodaj tymczasowo:
```cpp
std::cout << "MakeMove: " << move.from.row << "," << move.from.col 
          << " -> " << move.to.row << "," << move.to.col << std::endl;
```

### Walidacja stanu planszy
```cpp
std::string reason;
if (!board.isValid(&reason)) {
    std::cerr << "Invalid board: " << reason << std::endl;
}
```

### Weryfikacja liczby pionków
```cpp
std::cout << "White: " << board.countWhitePawns() << " pawns, " 
          << board.countWhiteKings() << " kings" << std::endl;