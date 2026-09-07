# Project Context

## Project

API Rate Limiter & Reverse Proxy Gateway.

The project is a portfolio backend project built to practice Node.js, TypeScript, Redis, rate limiting, concurrency, and performance testing.

## Tech Stack

- Node.js 24.19.0 (Active LTS)
- TypeScript ~5.9.x
- Express.js 5.2.x
- Redis (node-redis v6.x)
- Docker / Docker Compose
- k6 (later)
- Jest 30.x + ts-jest ~29.4.x

## Initial Setup Scope

For the initial setup, only prepare the project foundation:

- Set up Dockerfile for the Gateway (pinned to Node 24.19.0-alpine, multi-stage build).
- Set up docker-compose.yml with:
  - Node.js + TypeScript environment
  - Gateway (port 3000)
  - Redis (port 6379)
  - Target API (port 4000, deferred — stub service added later)
- Configure Express.js.
- Set up a basic application entry point.
- Add basic environment variable configuration.
- Have Redis client (`redis` v6) configured and connected in Gateway, but unused by any route logic yet.
- Make sure all services can start successfully with Docker Compose.
- Add a basic `/health` endpoint (returns `{status: "ok"}`).

## Important Constraints

The following features are intentionally deferred until their respective milestones:

- Token Bucket
- Rate limiting
- Redis Lua scripts
- Authentication
- Concurrency handling
- k6 benchmarks

These will be implemented manually later.

Do not add unnecessary frameworks, libraries, or infrastructure.

Keep the initial project setup simple and easy to understand.

## Tooling & Development

- Dev runner: `tsx` (with built-in watch mode)
- Build: `tsc` compiles to `dist/`, prod runs `node dist/server.js`
- Type checking: `tsc --noEmit` (separate from runtime, run in CI / `npm run typecheck`)
- Redis client: `node-redis` v6 (not ioredis — ioredis is maintenance-only)

## Node Version Sync

Local and Docker must use the same Node version. These three files must be updated together when changing the version:

1. `.nvmrc` — source of truth for local dev
2. `package.json` `engines.node` — documentation only (not enforced)
3. `Dockerfile` `FROM` line — pinned to the exact same version

## Suggested Structure

src/
├── app.ts
├── server.ts
└── config/

docker/
└── target-api/

Dockerfile
docker-compose.yml
package.json
tsconfig.json
.env.example
.nvmrc

The structure can be adjusted if there is a good reason, but avoid over-engineering.

## Development Principle

The developer will implement the core technical logic manually.

AI may assist with:
- Project setup and configuration
- Boilerplate
- Troubleshooting
- Code and architecture review
- Explaining technical concepts
- Identifying potential bugs or edge cases

AI should not implement the core technical logic on behalf of the developer.

## Current Progress

### Milestone 1 — Basic Reverse Proxy

Status: Completed

The Gateway can receive an incoming HTTP request and forward it to the
Target API.

Current request flow:
```
Client
  ↓
Gateway (:3000)
  ↓
Target API (:4000)
  ↓
Gateway
  ↓
Client
```

The Target API currently provides the following test endpoints:

- `GET /` — Returns a basic service status message
- `GET /api/users` — Returns a sample user object
- `GET /api/users/:id` — Returns the requested user ID
- `POST /api/users` — Returns the request body

The Gateway currently forwards requests without authentication or rate limiting.

### Milestone 2 — API Key Authentication

Status: Completed

1. **Use API Key for authentication**

   * Use the `Authorization` header to send the API key.
   * Format:

   ```http
   Authorization: Bearer <api-key>
   ```

2. **Generate API key at startup**

   * Generate a cryptographically secure random API key using Node.js `crypto`.
   * Store it in runtime memory only.
   * The key is ephemeral and changes whenever the Gateway restarts.

3. **Add `/get-api` endpoint**

   * Return the currently generated API key.
   * Handled directly by the Gateway.
   * Not forwarded to the Target API.
   * Does not require authentication.

4. **Add Scalar API documentation**

   * Document the Target API endpoints.
   * Allow users to test requests directly through Scalar UI.
   * Configure Scalar to use:

   ```http
   Authorization: Bearer <api-key>
   ```

5. **Authenticate all proxied requests**

   * Every request that is forwarded to the Target API must contain:

   ```http
   Authorization: Bearer <api-key>
   ```

   * Missing or invalid API key → **401 Unauthorized**
   * Valid API key → continue to reverse proxy.

```text
Client
  │
  ├── GET /get-api ──────→ Gateway → API Key
  │
  ├── GET /api-docs ─────→ Scalar UI
  │
  └── Other requests
          ↓
   Authorization: Bearer <key>
          ↓
    API Key Middleware
       │        │
    Invalid   Valid
       ↓        ↓
      401    Reverse Proxy
                 ↓
          Target API :4000
```

### Milestone 3 — Token Bucket Rate Limiter

Status: Completed

Implement a Token Bucket rate limiter using an in-memory Map.

Redis will not be used for the rate limiter state yet. Redis integration will be handled in Milestone 4.

1. **Rate Limit Configuration**

   The following values are shared by all buckets:
   - Bucket capacity — maximum number of tokens a bucket can hold.
   - Refill rate — number of tokens replenished per second.
   - TTL — how long an inactive bucket should remain in memory before being removed.

   Example configuration:
   ```
   capacity = 10 tokens
   refillRate = 1 token / second
   ttl = 15 minutes
   ```
   The exact values may be adjusted during implementation and testing.

2. **Bucket State**
   Each API key has its own bucket state.
   M3 stores bucket states in an in-memory Map.

   Conceptually:
   `Map<APIKey, BucketState>`

   Each bucket state contains:
   - tokens
   - lastRefillTime

   Example:
   ```
   API Key A → {
   tokens: 7,
   lastRefillTime: T1
   }

   API Key B → {
   tokens: 3,
   lastRefillTime: T2
   }
   ```

3. **Token Bucket Logic**

   Each request consumes 1 token.

   When a request arrives:

   1. Find the bucket state for the API key.
   2. If the bucket does not exist, create a new bucket with:
      - tokens = capacity
      - lastRefillTime = current time
   3. Calculate the elapsed time since the last refill.
   4. Calculate the number of tokens to refill based on the elapsed time and refill rate.
   5. Do not allow the token count to exceed the bucket capacity.
   6. If at least 1 token is available:
      - Consume 1 token.
      - Allow the request to continue to the reverse proxy.
   7. If fewer than 1 token is available:
      - Reject the request with 429 Too Many Requests.
   8. Update the bucket state.

   Conceptually:
   ```
   Request
      ↓
   Find bucket state
      ↓
   Bucket exists?
   ┌─┴───────────┐
   No             Yes
   ↓              ↓
   Create       Load state
   bucket          ↓
   └───────→ Calculate refill
                     ↓
               tokens >= 1?
               /       \
               Yes        No
               ↓          ↓
         Consume 1       429
               ↓
         Update state
               ↓
         Reverse Proxy
   ```
4. **Lazy Refill**

   Tokens do not need to be actively refilled every second.

   Refill is calculated when a request arrives:

   ```
   elapsedTime = currentTime - lastRefillTime
   refillAmount = elapsedTime × refillRate
   ```

   The resulting token count is capped at the bucket capacity.

5. **In-Memory State**

   M3 uses an in-memory data structure such as:
   ```
   Map<APIKey, BucketState>
   ```
   This is intentionally temporary.

   The Token Bucket algorithm should be separated from the state storage so that the in-memory implementation can later be replaced by Redis in Milestone 4 without changing the overall rate-limiting flow.

   Conceptually:
   ```
   Rate Limiter
      ↓
   Token Bucket Algorithm
      ↓
   State Storage
      ├── In-memory Map  ← M3
      └── Redis          ← M4
   ```

6. **Request Flow**

   After API Key Authentication:
   ```
   Client
      ↓
   API Key Authentication
      ↓
   Token Bucket Rate Limiter
      │
      ├── Token available → Reverse Proxy
      │
      └── No token → 429 Too Many Requests
   ```
7. **Scope**
   M3 focuses only on:
   - Token Bucket algorithm
   - In-memory bucket state
   - Per-API-key rate limiting
   - Token refill calculation
   - Bucket capacity

   Redis storage, concurrent requests/race conditions, and atomic operations are intentionally deferred to Milestones 4 and 5.

### Implemented

- Gateway HTTP server
- Target API stub service
- Basic reverse proxy forwarding
- Request/response forwarding between Gateway and Target API
- Docker Compose networking between services
- Basic test endpoint
- API Key authentication
- Generate API Key at startup
- Authenticate all proxied requests
- Scalar API Documentation
- Add `/get-api` endpoint
- Rate Limit Configuration
- Token Bucket Logic