# Project Context

## Project

API Rate Limiter & Reverse Proxy Gateway.

The project is a portfolio backend project built to practice Node.js, TypeScript, Redis, rate limiting, concurrency, and performance testing.

## Tech Stack

- Node.js 24.19.0 (Active LTS)
- TypeScript ~5.9.x
- Express.js 5.2.x
- Redis (node-redis v8.2)
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
- Have Redis client (`redis` v8.2) configured and connected in Gateway, but unused by any route logic yet.
- Make sure all services can start successfully with Docker Compose.
- Add a basic `/health` endpoint (returns `{status: "ok"}`).

## Constraints

- Developer implements core technical logic manually.
- AI assists with setup, troubleshooting, explanations, review, and test design.
- Avoid unnecessary frameworks or over-engineering.

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
```
src/
├── app.ts
├── server.ts
└── config/

docker/
└── target-api/
```

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

The Gateway can receive an incoming HTTP request and forward it to the Target API.

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

Redis is not used for rate limiter state in M3. Redis storage is introduced in M4.

1. **Rate Limit Configuration**

   The following values are shared by all buckets:
   - Bucket capacity — maximum number of tokens a bucket can hold.
   - Refill rate — number of tokens replenished per second.
   - TTL — reserved for Redis bucket lifecycle management in M4.

   Example configuration:
   ```
   capacity = 20 tokens
   refillRate = 1 token / second
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
   Both accepted and rejected requests update `lastRefillTime`.

   This means a rejected request resets the refill time to the time at which that request was processed.

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
               Update lastRefillTime
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

   Fractional tokens are preserved.

   For example, with:

   ```
   refillRate = 1 token / second
   elapsedTime = 0.5 seconds
   ```

   the bucket can receive:

   ```
   0.5 tokens
   ```

   Fractional refill amounts are not rounded down.

5. **In-Memory State**

   M3 uses an in-memory data structure such as:
   ```
   Map<APIKey, BucketState>
   ```
   This is intentionally temporary.

   The Token Bucket algorithm is separated from the state storage so that the in-memory implementation can later be replaced by Redis in M4 without changing the overall rate-limiting flow.

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
   - Fractional tokens

   Redis storage, TTL, Lua atomic operations, and concurrency testing are handled in later milestones.

### Milestone 4 — Redis-backed Atomic Token Bucket

Status: Completed

Replace the in-memory bucket state with Redis and make the bucket update atomic using a Redis Lua script.

1. **Redis Storage**

   Each API key has its own Redis key.

   Redis key format:

   ```
   rate_limiter:<api-key>
   ```

   Redis data type:

   ```
   Hash
   ```

   Fields:

   ```
   tokens
   lastRefillTime
   ```

   Example:

   ```
   rate_limiter:abc123
   ├── tokens = 13.5
   └── lastRefillTime = 1757419200123
   ```

2. **Redis-backed State**

   The M3 bucket state:

   ```ts
   {
     tokens: number;
     lastRefillTime: number;
   }
   ```

   is stored as Redis Hash fields.

   The Token Bucket calculation remains conceptually the same as M3.

3. **Asynchronous Redis Operations**

   Since Redis operations through `node-redis` are asynchronous, the rate-limit update function is asynchronous.

   Conceptually:

   ```ts
   updateTokenAmount(apiKey): Promise<boolean>
   ```

4. **Lua Atomic Operation**

   The complete bucket update is performed inside a Redis Lua script.

   The script:

   ```
   Request
      ↓
   Rate Limiter
      ↓
   Redis Lua Script
      ├── Read bucket state
      ├── Get current Redis time
      ├── Calculate refill
      ├── Update lastRefillTime
      ├── Check token availability
      ├── Consume token if available
      ├── Save bucket state
      └── Set / refresh TTL
      ↓
   Return result
   ```

   Lua is used to make the sequence of Redis operations atomic.

   It is not treated as a traditional application-level lock.

   Other Redis commands cannot be interleaved into the middle of the Lua script while Redis is executing that script.

5. **Time Source**

   The Lua script uses Redis `TIME` as the authoritative time source.

   Redis time is converted to milliseconds before calculating token refill, matching the millisecond-based `lastRefillTime` representation.

   This keeps the token bucket time calculation inside Redis rather than relying on the application server's local clock.

6. **TTL**

   Bucket state expires after a period of inactivity.

   Current TTL:

   ```
   900 seconds (15 minutes)
   ```

   The TTL is applied to the Redis bucket key.

   Each request that reaches the rate limiter refreshes the bucket TTL to 900 seconds, regardless of whether the request is accepted or rejected.

   If the API key has no requests for 15 minutes, Redis automatically removes the bucket state.

7. **Bucket Recreation**

   If a bucket key has expired, the next request recreates the bucket with:

   ```
   tokens = capacity
   lastRefillTime = current Redis time
   TTL = 900 seconds
   ```

8. **M4 Testing**

   M4 Redis bucket behavior is tested using a real Redis instance and the actual Lua script.

   Tests cover:

   * Token consumption through Redis
   * Token refill
   * Capacity limit
   * Fractional tokens
   * Per-API-key bucket isolation
   * Bucket TTL
   * TTL refresh on subsequent requests
   * Bucket recreation after expiration

   Middleware tests continue to mock `updateTokenAmount()` so middleware behavior is tested separately.

   Jest fake timers are not used to control token refill time inside the Lua script because the script uses Redis `TIME` rather than the Node.js/Jest clock.

   Tests that require elapsed real time use short real delays where necessary. For tests that only need to establish a historical timestamp, Redis bucket state can be adjusted directly instead of waiting for the full elapsed period.

9. **M4 Scope**

   M4 focuses on:

   * Redis bucket storage
   * Redis Hash
   * Async Redis operations
   * Redis Lua script
   * Redis `TIME`
   * Atomic bucket update
   * TTL / key expiration
   * Bucket recreation after expiration

   Concurrency testing is deferred to M5.

### Milestone 5 — Concurrency Testing
Status: Completed

- `Promise.all()` concurrent operations
- 20 concurrent → 21st rejected
- Refill + concurrent requests
- Two concurrent requests competing for the last token
- Verified success/rejection counts and final bucket state


**### Milestone 6 — Performance Testing**

Status: completed

Use k6 to measure the Gateway's performance under different traffic conditions.

#### M6.1 — Basic Load Test

* Run basic load tests with k6.
* Measure throughput, latency, and success rate.

#### M6.2 — Increase Load

* Gradually increase the number of VUs.
* Observe how throughput and latency change under higher load.

#### M6.3 — Rate Limiter Under Load

* Test the Redis-backed rate limiter under concurrent load.
* Observe accepted and rate-limited (429) requests.
* Verify rate limiting continues to work under load.

#### M6.4 — Multiple API Keys / Traffic Patterns

* Test multiple API keys concurrently.
* Verify each API key has an independent rate-limit bucket.
* Test different traffic patterns such as steady and bursty traffic.

#### M6.5 — Record and Summarize Results

* Record test configuration and results.
* Summarize throughput, latency, and success/rejection counts.
* Compare results between different tests.

#### M6 Scope

M6 focuses on:

* k6 performance testing
* Load testing
* Throughput and latency
* Rate limiter behavior under load
* Multiple API keys and traffic patterns
* Recording and interpreting results

M6 focuses on measuring system behavior rather than optimization.