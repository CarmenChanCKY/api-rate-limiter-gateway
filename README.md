# API Rate Limiter & Reverse Proxy Gateway

> Portfolio learning project — not a Kong / AWS Gateway replacement.
> Live demo via Docker + nginx. M1→M7 is intentional: Map → Redis Lua → concurrency → k6.
> Redis is the atomic state store here, not a response cache.

Non-goals: response caching, clustering, DB persistence, full gateway features.

Demo: [https://rate-limiter.ckying.com/api-docs#description/introduction](https://rate-limiter.ckying.com/api-docs#description/introduction)

Blog: [https://myprogrammingjourney.ckying.com/#/tags/search/api-rate-limiter-gateway/](https://myprogrammingjourney.ckying.com/#/tags/search/api-rate-limiter-gateway/)

## Table of Contents

- [API Rate Limiter \& Reverse Proxy Gateway](#api-rate-limiter--reverse-proxy-gateway)
  - [Table of Contents](#table-of-contents)
  - [Screenshots](#screenshots)
  - [Architecture](#architecture)
  - [Why Redis? (Map is faster)](#why-redis-map-is-faster)
  - [Tech Stack](#tech-stack)
  - [Getting Started](#getting-started)
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

Every proxied request goes through `verify → Lua consume → fetch` (see [How It Works](#how-it-works)).

## Why Redis? (Map is faster)

M3 was in-memory Map — fastest, but single-process, lost on restart, no TTL, and read-modify-write races under concurrency.

M4 moved to Redis for correctness:

- Shared buckets across instances and restarts
- Lua script updates the bucket in one atomic step, so concurrent requests can't over-issue tokens
- 900s bucket TTL / 24h key TTL with auto-expiry, no manual cleanup
- Redis `TIME` as the single clock, avoiding server clock skew

The extra ~1ms RTT is noise next to the proxy fetch to the Target API.

## Tech Stack

- Node.js 24.22.1
- TypeScript ~5.9.x
- Express.js 5.2.x
- Redis (node-redis v6.x) with Lua scripts
- Docker / Docker Compose
- k6 (with the `k6/x/redis` extension)
- Jest 30.x + ts-jest

## Getting Started

Prerequisites: Node.js 24.22.1 (`nvm use`) + Docker & Docker Compose.

```bash
git clone <repo-url>
cd api-rate-limiter-gateway
cp .env.example .env
docker compose up
```

Gateway at `http://localhost:3000`, Scalar docs at `http://localhost:3000/api-docs`. See `.env.example` for defaults.

## Example Requests

Mint a key (each call returns a different, independently rate-limited key; max 5 mints/hour and 5 active keys per IP):

```
curl http://localhost:3000/get-api
```

```bash
curl http://localhost:3000/ -H "Authorization: Bearer <api-key>"
curl http://localhost:3000/api/users -H "Authorization: Bearer <api-key>"
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-key>" \
  -d '{"name":"test"}'
```

Each key holds 20 tokens, refilling at 1 token/second. Bursts past capacity get `429 Too Many Requests`. Or open `/api-docs`, paste the key into **Authorize**, and click **Send**.

## Available Scripts

| Script                        | Description                                                     |
| ----------------------------- | --------------------------------------------------------------- |
| `npm run dev`                 | Dev server with watch mode (tsx)                                |
| `npm run build` / `npm start` | Compile to `dist/` / run compiled output                        |
| `npm run typecheck`           | Type-check without emitting                                     |
| `npm test`                    | Run Jest tests                                                  |
| `npm run k6:*`                | Run k6 suites (`basic`, `load-test`, `rate-limiter`, `traffic`) |

## Services

| Service    | Port | Description                                 |
| ---------- | ---- | ------------------------------------------- |
| Gateway    | 3000 | Reverse proxy, API key issuer, Scalar docs  |
| Redis      | 6379 | Atomic bucket + key store (Lua)             |
| Target API | 4000 | Stub backend service                        |
| k6         | —    | One-shot perf runner (`docker compose run`) |

## Environment Variables

| Variable                                  | Default                                                  | Note                |
| ----------------------------------------- | -------------------------------------------------------- | ------------------- |
| `PORT` / `REDIS_URL` / `TARGET_API_URL`   | `3000` / `redis://redis:6379` / `http://target-api:4000` | wiring              |
| `BUCKET_PREFIX`                           | `rate_limiter`                                           | bucket key prefix   |
| `API_KEY_TTL`                             | `86400`                                                  | 24h sliding expiry  |
| `MINT_LIMIT_PER_HOUR` / `MAX_KEYS_PER_IP` | `5` / `5`                                                | per-IP abuse guards |

Defaults live in `.env.example`.

## Project Structure

```
src/    # app + server + config / helper / middleware
tests/  # Jest suites (see Testing)
k6/     # k6 traffic scripts
docker/ # target-api stub + k6 image
```

Prod overlay + runbook: `docker-compose.prod.yml` / `DEPLOY.md`.

## How It Works

- **Verify:** checks `Authorization: Bearer <key>` against Redis. Missing/invalid → `401`. See above for mint limits.
- **Rate limit:** one Lua call refills (`elapsed × rate`, capped; e.g. 0.5s = 0.5 token), consumes 1 token if available, refreshes TTL. No token → `429`. Expired buckets recreate at full capacity.
- **Proxy:** allowed requests are forwarded to the Target API as-is, response streamed back with original status/headers.

## Testing

| Suite                              | Covers                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `api-key.test.ts`                  | Mint/isValid roundtrip, per-call uniqueness, sliding TTL, per-IP limits       |
| `verify-api-key` + `get-api`       | Bearer parsing, 401s, per-IP isolation                                        |
| `rate-limiter.test.ts`             | Real Lua: consume, refill, capacity, fractional tokens, isolation, expiry     |
| `rate-limiter-concurrency.test.ts` | `Promise.all()`: 20 pass + 21st rejected, last-token race = 1 pass + 1 reject |
| Middleware (mocked bucket)         | `next()` on token, 429 on exhausted, 401 without key                          |

```bash
docker compose up -d redis
npm test
```

## Performance Testing (k6)

| Script                         | Shape                                     |
| ------------------------------ | ----------------------------------------- |
| `basic-load.ts`                | Smoke test                                |
| `load-test.ts`                 | Sustained load                            |
| `rate-limiter-under-load.ts`   | 200/429 mix under load, single key        |
| `different-traffic-pattern.ts` | Steady / burst / ramp-up (`SCENARIO=...`) |

```bash
docker compose up -d
npm run k6:basic
```

`load-test` hits `/get-api`, so it is capped at 5/hour/IP after M7 — use the rate-limiter scripts for throughput.

Sample (local MacBook M2 Max, Docker 8CPU/8GB — not EC2 prod):
increase-load 32.7k/s p95 0.51ms → rate-limited 20.0k/s p95 3.80ms; burst p95 1.01ms highest.
Full table + analysis: https://myprogrammingjourney.ckying.com/#/post/api-rate-limiter-gateway-6-concurrency-and-performance-testing/

## Milestones

- [x] **Milestone 1** — Basic Reverse Proxy
- [x] **Milestone 2** — API Key Authentication (`/get-api`, Scalar docs, 401)
- [x] **Milestone 3** — Token Bucket Rate Limiting (in-memory Map)
- [x] **Milestone 4** — Redis-backed Atomic Token Bucket (Lua, Hash, TTL)
- [x] **Milestone 5** — Concurrency Handling (no over-issue under `Promise.all()`)
- [x] **Milestone 6** — k6 Performance Benchmarks
- [x] **Milestone 7** — Multi-Key for Deploy (per-browser keys + EC2 demo; see `DEPLOY.md`)
