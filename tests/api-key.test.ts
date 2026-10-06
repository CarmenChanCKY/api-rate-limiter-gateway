import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import {
  connectRedis,
  disconnectRedis,
  type RedisClientWithScripts,
} from "../src/config/redis.js";
import { config } from "../src/config/env.js";
import { mintAPIKey, isValidAPIKey } from "../src/helper/api-key.js";

// Unique IP per test so the per-IP counters never leak across runs.
const uniqueIp = (tag: string): string =>
  `test-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe("mintAPIKey / isValidAPIKey", () => {
  let client: RedisClientWithScripts;

  beforeAll(async () => {
    // isolated /4 namespace, same pattern as the bucket tests (/1, /2)
    client = await connectRedis(`${config.redisUrl}/4`);
  });

  test("mints a non-empty key that validates", async () => {
    const key = await mintAPIKey(uniqueIp("roundtrip"));

    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    expect(await isValidAPIKey(key)).toBe(true);
  });

  test("mints different keys on each call (per-browser isolation)", async () => {
    const ip = uniqueIp("isolation");

    const first = await mintAPIKey(ip);
    const second = await mintAPIKey(ip);

    expect(first).not.toBe(second);
    expect(await isValidAPIKey(first)).toBe(true);
    expect(await isValidAPIKey(second)).toBe(true);
  });

  test("rejects unknown and empty keys", async () => {
    expect(await isValidAPIKey("no-such-key")).toBe(false);
    expect(await isValidAPIKey("")).toBe(false);
  });

  test("successful validation refreshes the key TTL (sliding expiry)", async () => {
    const key = await mintAPIKey(uniqueIp("sliding"));

    const ttlBefore = await client.ttl(`api_key:${key}`);
    expect(ttlBefore).toBeGreaterThan(0);
    expect(ttlBefore).toBeLessThanOrEqual(config.API_KEY_TTL);

    expect(await isValidAPIKey(key)).toBe(true);

    const ttlAfter = await client.ttl(`api_key:${key}`);
    expect(ttlAfter).toBeGreaterThan(0);
  });

  test("Q6-A: 6th mint from the same IP within the hour throws MINT_LIMIT", async () => {
    const ip = uniqueIp("hourly");

    for (let i = 0; i < config.MINT_LIMIT_PER_HOUR; i++) {
      await mintAPIKey(ip);
    }

    await expect(mintAPIKey(ip)).rejects.toThrow("MINT_LIMIT");
  });

  test("Q6-B: rejects when the IP already tracks max keys, even with a fresh hourly budget", async () => {
    const ip = uniqueIp("maxkeys");

    // Pre-fill the per-IP set directly so the hourly counter stays at 0,
    // isolating the B check from the A check (both default to 5).
    await client.sAdd(`ip_keys:${ip}`, [
      "b-key-1",
      "b-key-2",
      "b-key-3",
      "b-key-4",
      "b-key-5",
    ]);

    await expect(mintAPIKey(ip)).rejects.toThrow("MINT_LIMIT");

    // Remove the partially-consumed hourly counter so reruns start clean
    // (afterAll flushDb covers the rest).
    await client.del(`mint_limit:${ip}`);
    await client.del(`ip_keys:${ip}`);
  });

  afterAll(async () => {
    await client.flushDb();
    await disconnectRedis();
  });
});
