import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import { type AddressInfo } from "node:net";
import { type Server } from "node:http";
import { app } from "../src/app.js";
import {
  connectRedis,
  disconnectRedis,
  type RedisClientWithScripts,
} from "../src/config/redis.js";
import { config } from "../src/config/env.js";

const uniqueIp = (tag: string): string =>
  `http-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe("GET /get-api", () => {
  let client: RedisClientWithScripts;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // isolated /5 namespace; mintAPIKey picks up this connection
    client = await connectRedis(`${config.redisUrl}/5`);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  test("mints different keys for different browsers", async () => {
    const first = await fetch(`${baseUrl}/get-api`, {
      headers: { "cf-connecting-ip": uniqueIp("browser-a") },
    });
    const second = await fetch(`${baseUrl}/get-api`, {
      headers: { "cf-connecting-ip": uniqueIp("browser-b") },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const keyA = await first.text();
    const keyB = await second.text();
    expect(keyA.length).toBeGreaterThan(0);
    expect(keyB.length).toBeGreaterThan(0);
    expect(keyA).not.toBe(keyB);
  });

  test("6th mint from the same IP within the hour maps to 429 json", async () => {
    const ip = uniqueIp("hourly");
    const headers = { "cf-connecting-ip": ip };

    for (let i = 0; i < config.MINT_LIMIT_PER_HOUR; i++) {
      const res = await fetch(`${baseUrl}/get-api`, { headers });
      expect(res.status).toBe(200);
    }

    const limited = await fetch(`${baseUrl}/get-api`, { headers });
    expect(limited.status).toBe(429);

    const body = (await limited.json()) as {
      success: boolean;
      message: string;
    };
    expect(body.success).toBe(false);
  });

  test("exhausting one browser leaves another browser at 200", async () => {
    const ipA = uniqueIp("exhaust-a");
    const ipB = uniqueIp("fresh-b");

    for (let i = 0; i <= config.MINT_LIMIT_PER_HOUR; i++) {
      await fetch(`${baseUrl}/get-api`, {
        headers: { "cf-connecting-ip": ipA },
      });
    }

    const res = await fetch(`${baseUrl}/get-api`, {
      headers: { "cf-connecting-ip": ipB },
    });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await client.flushDb();
    await disconnectRedis();
  });
});
