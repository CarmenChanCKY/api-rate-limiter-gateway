# Deploy Runbook — rate-limiter.ckying.com (standalone EC2)

Target: a standalone EC2 hosting only this project.

## 0. One-time setup (new EC2)

1. Ubuntu 24.04, 8GB gp3 (25GB already used elsewhere in the account leaves
   ~3GB over the 30GB free-tier total — about $0.3/mo, covered by credit).
2. Security Groups (dedicated SG, e.g. `rate-limiter-sg` — do not share):
   inbound `22` (SSH, source = My IP only), `80` + `443`
   (source = `0.0.0.0/0` IPv4 and `::/0` IPv6); outbound stays default-open.
   `3000 / 6379 / 4000` stay closed — public traffic goes via nginx.
3. Elastic IP: allocate + associate (free while attached; release on terminate),
   otherwise the public IP changes on every stop/start and DNS breaks.
   Use this static IP for the Cloudflare record below.
4. Install Docker + compose plugin, add the SSH user to the `docker` group
   (`sudo usermod -aG docker ubuntu`, then re-login), then:
   ```bash
   git clone <this-repo> /var/www/api-rate-limiter-gateway
   cd /var/www/api-rate-limiter-gateway
   ```
5. DNS (Cloudflare): `A rate-limiter → <Elastic-IP>`, proxied (orange cloud).

## 0b. Folder permissions (mirror the existing convention)

```bash
sudo chown -R ubuntu:ubuntu /var/www/api-rate-limiter-gateway
find /var/www/api-rate-limiter-gateway -type d -exec chmod 755 {} \;
find /var/www/api-rate-limiter-gateway -type f -exec chmod 644 {} \;
chmod 600 /var/www/api-rate-limiter-gateway/.env

sudo chown root:root /var/www/api-rate-limiter-gateway/nginx
sudo chmod 755 /var/www/api-rate-limiter-gateway/nginx
sudo chown root:root /var/www/api-rate-limiter-gateway/nginx/certs/authenticated_origin_pull_ca.pem
sudo chmod 644 /var/www/api-rate-limiter-gateway/nginx/certs/authenticated_origin_pull_ca.pem
sudo chown ubuntu:docker /var/www/api-rate-limiter-gateway/nginx/certs/ssl.crt
sudo chmod 644 /var/www/api-rate-limiter-gateway/nginx/certs/ssl.crt
sudo chown ubuntu:docker /var/www/api-rate-limiter-gateway/nginx/certs/ssl.key
sudo chmod 600 /var/www/api-rate-limiter-gateway/nginx/certs/ssl.key
```

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
