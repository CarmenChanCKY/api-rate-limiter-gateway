# API Rate Limiter & Reverse Proxy Gateway

A backend project built to practice Node.js, TypeScript, Redis, rate limiting, concurrency, and performance testing.

## Table of Contents

- [API Rate Limiter \& Reverse Proxy Gateway](#api-rate-limiter--reverse-proxy-gateway)
  - [Table of Contents](#table-of-contents)
  - [Screenshots](#screenshots)
  - [Architecture](#architecture)
  - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Setup](#setup)
  - [Example Requests](#example-requests)
  - [Available Scripts](#available-scripts)
  - [Services](#services)
  - [Environment Variables](#environment-variables)
  - [Project Structure](#project-structure)
  - [How It Works](#how-it-works)
  - [Testing](#testing)
  - [Performance Testing (k6)](#performance-testing-k6)
  - [Milestones](#milestones)

## Screenshots
![Scalar API Reference](<Screenshot Scalar API Reference.png>)


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
- k6 (with the `k6/x/redis` extension)
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
| `npm run k6:basic` | Run the k6 smoke test                |
| `npm run k6:load-test` | Run the k6 sustained load test    |
| `npm run k6:rate-limiter` | Run the k6 rate-limiter-under-load test |
| `npm run k6:traffic` | Run all k6 traffic scenarios (`SCENARIO=...` selects one) |

## Services

| Service      | Port  | Description                     |
| ------------ | ----- | ------------------------------- |
| Gateway      | 3000  | Main API gateway, API key issuer, and Scalar API docs |
| Redis         | 6379  | Data store for rate limiting    |
| Target API   | 4000  | Stub backend service            |
| k6           | —     | Performance test runner (one-shot `docker compose run`) |

## Environment Variables

| Variable         | Default                          | Description                  |
| ---------------- | -------------------------------- | ---------------------------- |
| `PORT`           | `3000`                           | Gateway port                 |
| `REDIS_PORT`     | `6379`                           | Redis port                   |
| `REDIS_URL`      | `redis://redis:6379`             | Redis connection URL          |
| `BUCKET_PREFIX`  | `rate_limiter`                   | Redis key prefix for rate limiter buckets |
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
  rate-limiter-concurrency.test.ts# Concurrency tests under concurrent load

docker/
  target-api/
    server.js         # Stub Target API service with OpenAPI JSDoc annotations
  k6/
    Dockerfile        # k6 image with the k6/x/redis extension

k6/
  basic-load.ts               # k6 smoke test (5 iterations, 1 VU)
  load-test.ts                # k6 sustained load test (10 VUs, 30s)
  rate-limiter-under-load.ts  # k6 rate limiter under 50 VU load
  different-traffic-pattern.ts# k6 steady / burst / ramp-up traffic scenarios

Dockerfile            # Multi-stage build for Gateway
docker-compose.yml    # Service orchestration
```

## How It Works

Every proxied request passes through API key authentication, then the rate limiter, then the reverse proxy:

- `verify-api-key` validates the `Authorization: Bearer <api-key>` header. Missing or invalid → `401 Unauthorized`.
- The rate limiter calls `updateTokenAmount()`, which runs a Redis Lua script operating on the API key's bucket Hash in one atomic step:

  ```text
  rate_limiter:<api-key>
  ├── tokens = <capacity remaining>
  └── lastRefillTime = <epoch ms from Redis TIME>
  ```

  - Bucket capacity is 20 tokens, refilling at 1 token/second.
  - Refill is lazy — calculated per request as `elapsed time × refill rate`, capped at capacity; fractional tokens are preserved.
  - The script consumes 1 token if available, updates `lastRefillTime`, and refreshes the 15-minute (900 s) TTL. Redis `TIME` is the authoritative clock and the update is atomic — no app-level locks, so concurrent requests are serialized at the Redis level.
  - No token available → `429 Too Many Requests`.
  - Buckets expire after 15 minutes of inactivity; an expired bucket is recreated at full capacity on the next request.
- If allowed, the reverse proxy buffers the body and forwards the request to the Target API via `fetch`. Hop-by-hop headers (`connection`, `upgrade`, `authorization`, etc.) are stripped; all others are forwarded as-is. The Target API response is streamed back to the client with the original status code and headers.

## Testing

Tests are written with **Jest** and split into three groups:

- **Token Bucket — Redis integration tests** (`tests/rate-limiter.test.ts`). These exercise the real Lua script against a real Redis instance (database index 1) and cover token consumption, lazy refill, capacity limits, fractional tokens, per-API-key isolation, key expiration, and TTL refresh/recreation.
- **Concurrency tests** (`tests/rate-limiter-concurrency.test.ts`). These verify atomic behavior under concurrent load using `Promise.all()` (database index 2): 20 concurrent requests all succeed with the 21st rejected, refilled tokens consumed concurrently, and two requests competing for the last token correctly yield one success and one rejection.
- **Middleware unit tests** (`tests/rate-limiter.test.ts`). These mock `updateTokenAmount()` so the middleware behavior (allowing/rejecting/failing closed) is tested in isolation.

API key generation is covered in `tests/api-key.test.ts` (non-empty, stable across calls, generated only once).

A running Redis instance is required for the integration tests:

```bash
docker compose up -d redis
npm test
```

## Performance Testing (k6)

k6 is used to measure the Gateway's behavior under different traffic conditions. Every k6 script runs inside its own Docker service (`docker/k6`, built with the `k6/x/redis` extension) so it can reach the `gateway` and `redis` services by name on the Compose network.

First start the Gateway and its dependencies, then run a test:

```bash
docker compose up -d
npm run k6:basic
```

Each run prints k6's summary — throughput (`http_reqs`), latency (`http_req_duration`: p50/p90/p95), and check pass/fail counts — which is used to compare environments and traffic patterns.

The `k6/` scripts:

- `basic-load.ts` — smoke test that verifies k6 is wired up (5 iterations, 1 VU, `GET /get-api`).
- `load-test.ts` — sustained load: 10 VUs hammering `GET /get-api` for 30 seconds. Bump the VUs/duration to observe how throughput and latency scale.
- `rate-limiter-under-load.ts` — exercises the Redis-backed rate limiter: 50 VUs for 30 seconds against `GET /api/users` with a single real API key (fetched in `setup()`), checking every response is `200` or `429`. `teardown()` deletes the API key's `rate_limiter:<api-key>` bucket from Redis so test state is cleaned up.
- `different-traffic-pattern.ts` — mixes traffic shapes, all against `GET /api/users` with a Bearer key:
  - `steady_scenario` — constant 10 VUs for 30 seconds (sustained traffic).
  - `burst_scenario` — ramps 1 → 20 VUs in 10s, then back down (sudden spikes).
  - `rampUp_scenario` — ramps 1 → 5 → 10 → 20 VUs (gradually increasing load).

  Run one scenario at a time via `SCENARIO`:

  ```bash
  SCENARIO=burst_scenario npm run k6:traffic
  ```

  Because the rate limiter is per API key, running each traffic shape against a single key shows how bursts interact with the 20-token bucket.

## Milestones

- [x] **Milestone 1** — Basic Reverse Proxy (Gateway forwards requests to Target API)
- [x] **Milestone 2** — API Key Authentication (ephemeral Bearer key, `/get-api`, Scalar docs, 401 for invalid requests)
- [x] **Milestone 3** — Token Bucket Rate Limiting
- [x] **Milestone 4** — Redis-backed Atomic Token Bucket (Lua script, Hash storage, TTL)
- [x] **Milestone 5** — Concurrency Handling (atomic Lua script prevents token over-consumption under concurrent requests)
- [x] **Milestone 6** — k6 Performance Benchmarks (basic load, increased load, rate limiter under load, multiple traffic patterns)