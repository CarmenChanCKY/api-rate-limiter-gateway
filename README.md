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

The Gateway receives incoming HTTP requests and forwards them to the Target API. Redis is integrated for future rate limiting logic. As of Milestone 2, proxied requests require a Bearer API key issued by the Gateway.

Current request flow:

```
GET /get-api → returns API key
GET /api-docs → opens Scalar docs (no auth required)
GET /api-docs.json → returns raw OpenAPI document
Any proxied route → validate Authorization: Bearer <api-key>
                    valid → forward to Target API
                    missing/invalid → 401 Unauthorized
```

## Tech Stack

- Node.js 24.19.0
- TypeScript ~5.9.x
- Express.js 5.2.x
- Redis (node-redis v6.x)
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
    redis.ts          # Redis client setup
    swagger.ts        # swagger-jsdoc OpenAPI configuration
  helper/
    api-key.ts        # Runtime API key generation and access
    security.ts       # Cryptographic key generation utilities
  middleware/
    verify-api-key.ts # Bearer token validation for proxied requests

docker/
  target-api/
    server.js         # Stub Target API service with OpenAPI JSDoc annotations

Dockerfile            # Multi-stage build for Gateway
docker-compose.yml    # Service orchestration
```

## How It Works

- All proxied requests pass through `verify-api-key`, which validates the `Authorization: Bearer <api-key>` header.
- Missing or invalid → `401 Unauthorized`.
- Valid → reverse proxy buffers the body and forwards the request to the Target API via `fetch`.
- Hop-by-hop headers (`connection`, `upgrade`, `authorization`, etc.) are stripped; all others are forwarded as-is.
- The Target API response is streamed back to the client with the original status code and headers.

## Milestones

- [x] **Milestone 1** — Basic Reverse Proxy (Gateway forwards requests to Target API)
- [x] **Milestone 2** — API Key Authentication (ephemeral Bearer key, `/get-api`, Scalar docs, 401 for invalid requests)
- [ ] **Milestone 3** — Token Bucket Rate Limiting
- [ ] **Milestone 4** — Redis Lua Scripts
- [ ] **Milestone 5** — Concurrency Handling
- [ ] **Milestone 6** — k6 Performance Benchmarks