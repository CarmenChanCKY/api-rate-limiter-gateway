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

## Milestone 2 — API Key Authentication

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