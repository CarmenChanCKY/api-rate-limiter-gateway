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

Do NOT implement the following yet:

- Token Bucket
- Rate limiting
- Redis Lua scripts
- Reverse Proxy logic
- Authentication logic
- Concurrency handling
- k6 benchmarks
- AI / LLM features

These will be implemented manually later.

Do not add unnecessary frameworks, libraries, or infrastructure.

Keep the initial project setup simple and easy to understand.

## Tooling & Development

- Dev runner: `tsx` (with built-in watch mode)
- Build: `tsc` compiles to `dist/`, prod runs `node dist/server.js`
- Type checking: `tsc --noEmit` (separate from runtime, run in CI / `npm run typecheck`)
- Redis client: `node-redis` v6 (not ioredis — ioredis is maintenance-only)

## Node Version Sync

Local and Docker must use the same Node version. These three files
must be updated together when changing the version:

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

AI should only assist with project setup, configuration, boilerplate, and troubleshooting during the initial setup stage.