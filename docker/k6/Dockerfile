# for k6/x/redis
FROM grafana/xk6:1.4.13 AS builder
RUN xk6 build v2.2.0 --with github.com/grafana/xk6-redis@v0.4.3 --output /tmp/k6

FROM grafana/k6:2.2.0
COPY --from=builder /tmp/k6 /usr/bin/k6