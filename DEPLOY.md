# Deploy Runbook — rate-limiter.ckying.com (standalone EC2)

Target: a standalone EC2 hosting only this project.

## 0. One-time setup (new EC2)

1. Ubuntu 24.04, Security Groups: open `22 / 80 / 443` only.
   `3000 / 6379 / 4000` stay closed — public traffic goes via nginx.
2. Install Docker + compose plugin, then:
   ```bash
   git clone <this-repo> /var/www/api-rate-limiter-gateway
   cd /var/www/api-rate-limiter-gateway
   ```
3. DNS (Cloudflare): `A rate-limiter → <new-EC2-IP>`, proxied (orange cloud).

## 1. Certs (wildcard reuse — confirmed `*.ckying.com`)

No need to issue a new certificate. Copy the existing wildcard cert
(`ssl.crt` + `ssl.key` + `authenticated_origin_pull_ca.pem`)
from the current EC2 to the new machine:

```bash
scp -r <current-ec2>:/path/to/existing/nginx/certs/ ./nginx/certs/
```

Sanity check (dates + wildcard coverage):

```bash
openssl x509 -noout -dates -subject -ext subjectAltName -in nginx/certs/ssl.crt
# expect: DNS:*.ckying.com, DNS:ckying.com
```

- `nginx/certs/` is gitignored and never committed.

## 2. Env (EC2 only, never commit)

Copy `.env.example` to `.env` and fill in. Defaults work as-is:
`PORT=3000`, `REDIS_URL=redis://redis:6379`,
`TARGET_API_URL=http://target-api:4000`,
`API_KEY_TTL=86400`, `MINT_LIMIT_PER_HOUR=5`, `MAX_KEYS_PER_IP=5`.

## 3. Start

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d gateway redis target-api nginx
docker compose exec nginx nginx -t
docker compose logs -f gateway   # expect: Gateway listening + Redis client connected
```

(k6 is excluded from the service list on purpose — it has no long-running CMD.)

## 4. Acceptance (recruiter view)

- Browser A `GET https://rate-limiter.ckying.com/get-api` → keyA,
  Browser B → keyB, keyA ≠ keyB.
- Hammer A past 20+1 requests → A gets 429 while B still 200 (per-key isolation).
- 6th `GET /get-api` from the same IP within the hour → 429;
  6th active key for one IP → rejected.
- Scalar: `https://rate-limiter.ckying.com/api-docs` → Authorize with
  `Bearer <key>` works.

## 5. Useful commands

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 gateway
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```
