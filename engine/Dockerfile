FROM debian:bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ make cmake && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY src/ ./src/
COPY CMakeLists.txt ./

RUN mkdir -p build && cd build && cmake .. && make -j$(nproc)

# --- Runtime ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/build/checkers-server /usr/local/bin/checkers-server

ENV PORT=8080
EXPOSE 8080

CMD ["checkers-server"]