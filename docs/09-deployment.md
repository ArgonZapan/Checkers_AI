# Deployment — Uruchomienie

## Wymagania systemowe

| Komponent | Wymaganie |
|-----------|-----------|
| Node.js | ≥ 18 (z npm) |
| C++ | g++ lub clang++ (C++17) |
| CMake | ≥ 3.14 |
| CPU | x86_64 (do tfjs-node + oneDNN optimizations) |
| RAM | ≥ 2GB (modele + 2 bufory) |

## Szybki start

### 1. Budowanie C++ engine

```bash
# Pobierz headers (single-include, w .gitignore)
cd engine/src
curl -sL https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h -o httplib.h
curl -sL https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp -o json.hpp
cd ../build

# Build
cmake ..
make -j$(nproc)

# Weryfikacja
./checkers-server &
curl http://localhost:8080/api/status
pkill checkers-server
```

### 2. Instalacja Node.js

```bash
cd server && npm install
cd ../client && npm install && npm run build && cd ..
```

### 3. Uruchomienie

```bash
# Terminal 1: C++ engine
cd engine/build && ./checkers-server

# Terminal 2: Node.js + React frontend
cd server && node index.js
```

Frontend: http://localhost:3000 — dashboard z 6 mini-planszami, od razu startuje.

### 4. Na sieci lokalnej

```bash
HOST=0.0.0.0 node server/index.js
```

## Porty

| Usługa | Port | Opis |
|--------|------|------|
| C++ Engine | 8080 | REST API (httplib) |
| Node.js | 3000 | Express + socket.io + TensorFlow.js + React (static) |

## Docker Compose (opcjonalne)

```yaml
services:
  engine:
    build: ./engine
    ports: ["8080:8080"]
  server:
    build: .
    ports: ["3000:3000"]
    depends_on: [engine]
    environment:
      - NODE_ENV=production
```

## Auto-start

### pm2

```bash
pm2 start "cd engine/build && ./checkers-server" --name checkers-engine
pm2 start "cd server && node index.js" --name checkers-server
pm2 save
pm2 startup
```

### systemd

```ini
[Unit]
Description=Checkers AI - C++ Engine
After=network.target

[Service]
ExecStart=/root/Checkers_AI/engine/build/checkers-server
WorkingDirectory=/root/Checkers_AI/engine/build
Restart=always
```

## Troubleshooting

| Problem | Rozwiązanie |
|---------|-------------|
| Port 3000 zajęty | `lsof -ti :3000 \| xargs kill -9` |
| C++ engine nie startuje | `curl http://localhost:8080/api/status` |
| CORS errors | `CORS_ORIGIN=http://host:port node server/index.js` |
| Cannot connect to C++ engine | Czy engine działa? `cppFetch` timeout |
| Cannot find module '@tensorflow/tfjs-node' | `cd server && npm install` |
| 6 plansz się nie ładuje | Sprawdź WebSocket connection w devtools |

## Backup

Ważne dane:
- `models/` — agresor.json, forteca.json, meta.json (ELO, config)
- `data/` — buffer_agresor.json, buffer_forteca.json (replay buffers)

Ignorowane (rebuildable):
- `node_modules/`
- `client/dist/`
- `engine/build/*.o`
- `models/agresor.json` / `models/forteca.json` — opcjonalne (modele się odtworzą)
