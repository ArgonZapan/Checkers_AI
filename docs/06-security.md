# Bezpieczeństwo

## Security Headers

| Header | Wartość | Opis |
|--------|---------|------|
| `X-Content-Type-Options` | `nosniff` | Zapobiega MIME sniffing |
| `X-Frame-Options` | `DENY` | Zapobiega clickjacking |
| `X-XSS-Protection` | `0` | CSP lepsza ochrona |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Kontrola referrer |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Brak dostępu do HW |
| `Content-Security-Policy` | `default-src 'self'` | Same-origin only |

## CORS i WebSocket

- `CORS_ORIGIN` — default `http://localhost:3000`
- Wildcard CORS ≠ wildcard WS — WS odrzuca nieznane origins
- Handshake validation: `_isAllowedWsOrigin(origin)`

## Rate Limiting

### HTTP

| Typ | Limit |
|-----|-------|
| General | 120 req/min per IP |
| Max entries | 10 000 (oldest eviction) |

### WebSocket (per socket)

| Event | Limit |
|-------|-------|
| startSelfPlay | 1 req/1s |
| stopSelfPlay | 1 req/1s |
| setSpeed | 1 req/1s |
| setSpeedMode | 1 req/1s |
| setParams | 1 req/1s |
| setMinimaxDepth | 1 req/1s |
| restart | 1 req/2s |

## Authentication

- Token: `HERMES_ADMIN_TOKEN` (env var, optional)
- Bearer w Authorization header
- Jeśli brak tokena — dev mode, bez auth

**Wymagany dla:** startSelfPlay, stopSelfPlay, setParams, setMinimaxDepth, restart, reset
**Nie wymagany dla:** predict, ai/info

## Input Validation

### HTTP

| Endpoint | Walidacja |
|----------|-----------|
| predict(board) | 64 ints, wartości 0-4 |
| predict(legalMoves) | from+to [r,c] 0-7 |
| train(batch) | max 10K, struktura |
| params | whitelist keys |
| board/set | flat[64], wartości 0-4, dark squares only, no overlap |
| best-move | depth=1-8 (default 7) |

### WebSocket

| Event | Walidacja |
|-------|-----------|
| setParams | whitelist, numeric range, NaN rejection |
| setSpeed | number 0-10000, NaN rejection |
| setSpeedMode | string `'fast'` lub `'normal'` |
| setMinimaxDepth | number 1-8, integer |
| restart | model: `agresor`/`forteca`/`both` |

## Prototype Pollution

- `ALLOWED_PARAMS` whitelist w setParams
- `Object.freeze()` na strategiach
- Copy-on-write przy modyfikacjach

## Data Leakage

- Rate limit map cleanup (ochrona przed OOM)
- Response sanitization (`sanitizeStatePayload`)
- Bez logowania request body
- Generic error messages

## Trust Proxy

```js
app.set('trust proxy', false)
app.disable('X-Powered-By')
```
