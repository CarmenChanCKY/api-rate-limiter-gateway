# API Rate Limiter & Reverse Proxy Gateway

A backend project built to practice Node.js, TypeScript, Redis, rate limiting, concurrency, and performance testing.

## Architecture

```
Client
  |
  v
Gateway (:3000)  -->  Target API (:4000)
  |
  v
Redis (:6379)
```

The Gateway receives incoming HTTP requests and forwards them to the Target API. Proxied requests require a Bearer API key issued by the Gateway and are rate limited per API key with a Token Bucket algorithm. Bucket state is stored atomically in Redis using a Lua script.

Current request flow:

```
GET /get-api → returns API key
GET /api-docs → opens Scalar docs (no auth required)
GET /api-docs.json → returns raw OpenAPI document
Any proxied route → validate Authorization: Bearer <api-key>
                    missing/invalid → 401 Unauthorized
                    valid → Token Bucket rate limiter (Redis Lua)
                            token available → forward to Target API
                            no token → 429 Too Many Requests
```

## Tech Stack

- Node.js 24.19.0
- TypeScript ~5.9.x
- Express.js 5.2.x
- Redis (node-redis v6.x) with Lua scripts
- Docker / Docker Compose
- Jest 30.x + ts-jest

## Getting Started

### Prerequisites

- Node.js 24.19.0 (use `nvm use` to switch)
- Docker & Docker Compose

### Setup

1. Clone the repository

   ```bash
   git clone <repo-url>
   cd api-rate-limiter-gateway
   ```

2. Create your environment file

   ```bash
   cp .env.example .env
   ```

3. Start all services

   ```bash
   docker compose up
   ```

The Gateway will be available at `http://localhost:3000`. You can also open the interactive Scalar documentation at `http://localhost:3000/api-docs`.

## Example Requests

First, retrieve the ephemeral API key:

```
curl http://localhost:3000/get-api
```

Use the returned key for authenticated requests:

```
curl http://localhost:3000/ -H "Authorization: Bearer <api-key>"
curl http://localhost:3000/api/users -H "Authorization: Bearer <api-key>"
curl http://localhost:3000/api/users/123 -H "Authorization: Bearer <api-key>"
```

Test request body forwarding:

```
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{"name":"test"}'
```

Each API key is limited to 20 requests (bucket capacity of 20 tokens, refilling at 1 token/second). Sending more than the capacity in quick succession returns `429 Too Many Requests`:

```
curl -i http://localhost:3000/ -H "Authorization: Bearer <api-key>"
# ... after 20 rapid requests
HTTP/1.1 429 Too Many Requests
```

You can also test all endpoints through the Scalar documentation:

1. Open `http://localhost:3000/api-docs`
2. Paste the API key in the **Authorization** field
3. Click **Send** on any endpoint

## Available Scripts

| Script         | Description                              |
| -------------- | ---------------------------------------- |
| `npm run dev`  | Start dev server with watch mode (tsx)   |
| `npm run build`| Compile TypeScript to `dist/`            |
| `npm start`    | Run compiled output from `dist/`         |
| `npm run typecheck` | Type-check without emitting files   |
| `npm test`     | Run tests with Jest                      |

## Services

| Service      | Port  | Description                     |
| ------------ | ----- | ------------------------------- |
| Gateway      | 3000  | Main API gateway, API key issuer, and Scalar API docs |
| Redis        | 6379  | Data store for rate limiting    |
| Target API   | 4000  | Stub backend service            |

Gateway unauthenticated endpoints:

- `GET /get-api` — returns the current runtime Bearer API key
- `GET /api-docs` — Scalar UI for the documented Target API
- `GET /api-docs.json` — raw OpenAPI document

## Environment Variables

| Variable         | Default                          | Description                  |
| ---------------- | -------------------------------- | ---------------------------- |
| `PORT`           | `3000`                           | Gateway port                 |
| `REDIS_PORT`     | `6379`                           | Redis port                   |
| `REDIS_URL`      | `redis://redis:6379`             | Redis connection URL          |
| `TARGET_API_PORT`| `4000`                           | Target API port              |
| `TARGET_API_URL` | `http://target-api:4000`         | Target API URL               |

## Project Structure

```
src/
  app.ts              # Express application, reverse proxy, and /get-api route
  server.ts           # Entry point, starts server & Redis
  config/
    env.ts            # Environment variable configuration
    redis.ts          # Redis client setup and atomic Token Bucket Lua script
    swagger.ts        # swagger-jsdoc OpenAPI configuration
  helper/
    api-key.ts        # Runtime API key generation and access
    rate-limit.ts     # Token Bucket entry point backed by Redis Lua script
    security.ts       # Cryptographic key generation utilities
  middleware/
    rate-limiter.ts   # Token Bucket rate limiting for proxied requests
    verify-api-key.ts # Bearer token validation for proxied requests
  types/
    express.d.ts      # Express type declarations

tests/
  api-key.test.ts     # API key generation tests
  rate-limiter.test.ts# Token Bucket (Redis Lua) and rate limiter middleware tests

docker/
  target-api/
    server.js         # Stub Target API service with OpenAPI JSDoc annotations

Dockerfile            # Multi-stage build for Gateway
docker-compose.yml    # Service orchestration
```

## How It Works

- All proxied requests pass through `verify-api-key`, which validates the `Authorization: Bearer <api-key>` header.
- Missing or invalid → `401 Unauthorized`.
- Valid → the Token Bucket rate limiter decides whether to allow or reject the request.
- Each rate limit decision calls `updateTokenAmount()`, which runs a Redis Lua script that reads the bucket's Hash (`rate_limiter:<api-key>`), refills tokens based on elapsed Redis time, consumes a token if available, updates `lastRefillTime`, and refreshes the 15-minute TTL in one atomic operation.
- Token available → reverse proxy buffers the body and forwards the request to the Target API via `fetch`.
- No token available → `429 Too Many Requests`.
- Hop-by-hop headers (`connection`, `upgrade`, `authorization`, etc.) are stripped; all others are forwarded as-is.
- The Target API response is streamed back to the client with the original status code and headers.

## How Rate Limiting Works

Each API key gets its own bucket stored in Redis:

```
rate_limiter:<api-key>

├── tokens = <capacity remaining>
└── lastRefillTime = <epoch ms from Redis TIME>
```

- Bucket capacity is 20 tokens, refilling at 1 token/second.
- Refill is lazy — it is calculated on each request using `elapsed time × refill rate`, capped at capacity, and fractional tokens are preserved.
- The whole update runs atomically inside a Lua script using Redis `TIME` as the authoritative clock (no app-level locks needed).
- Buckets expire after 15 minutes (900 seconds) of inactivity; every request refreshes the TTL. An expired bucket is recreated at full capacity on the next request.

## Testing

Tests are written with **Jest** and split into two groups:

- **Token Bucket — Redis integration tests.** These exercise the real Lua script against a real Redis instance (database index 1) and cover token consumption, lazy refill, capacity limits, fractional tokens, per-API-key isolation, key expiration, and TTL refresh/recreation.
- **Middleware unit tests.** These mock `updateTokenAmount()` so the middleware behavior (allowing/rejecting/failing closed) is tested in isolation.

A running Redis instance is required for the integration tests. Run all tests with:

```bash
docker compose up -d redis
npm test
```

The `tests/` directory:

- `tests/rate-limiter.test.ts` — Token Bucket Redis integration tests + rate limiter middleware
  - Token Bucket:
    - Allows the first request for a new API key
    - Allows requests up to bucket capacity (20), then rejects
    - Rejects when no token is available
    - Refills based on elapsed time (real delays, since refill uses Redis `TIME`)
    - Does not exceed capacity
    - Preserves fractional tokens (e.g. 0.5 token after 0.5 second, capped at capacity)
    - Keeps buckets independent between API keys
    - Sets a 15-minute expiration (TTL)
    - Extends expiration on each request
    - Recreates token data after expiration
  - Middleware:
    - Allows the request to proceed when a token is available
    - Returns `429` when no token is available
    - Does not forward rejected requests
- `tests/api-key.test.ts` — API key generation (non-empty, stable across calls, generated only once)

## Milestones

- [x] **Milestone 1** — Basic Reverse Proxy (Gateway forwards requests to Target API)
- [x] **Milestone 2** — API Key Authentication (ephemeral Bearer key, `/get-api`, Scalar docs, 401 for invalid requests)
- [x] **Milestone 3** — Token Bucket Rate Limiting
- [x] **Milestone 4** — Redis-backed Atomic Token Bucket (Lua script, Hash storage, TTL)
- [ ] **Milestone 5** — Concurrency Handling
- [ ] **Milestone 6** — k6 Performance Benchmarks