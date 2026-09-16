import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import {
  connectRedis,
  disconnectRedis,
  getRedisMilliseconds,
  type RedisClientWithScripts,
} from "../src/config/redis";
import { config } from "../src/config/env";
import { getKey } from "../src/helper/rate-limit.js";

describe("Concurrent token updates", () => {
  let client: RedisClientWithScripts;

  beforeAll(async () => {
    // connect to redis /2 namespace
    client = await connectRedis(`${config.redisUrl}/2`);
  });

  test.concurrent(
    "allows 20 concurrent requests and rejects the 21st request",
    async () => {
      const key = "concurrency-key-001";

      const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
        .default;

      // create 20 concurrent request
      const requestList: Promise<boolean>[] = [];

      for (let i = 0; i < 20; i++) {
        requestList.push(updateTokenAmount(key));
      }

      const result = await Promise.all(requestList);

      // currently updateTokenAmount should not return false
      expect(result.includes(false)).toBe(false);

      // create one more request
      // the 21st request should return false
      expect(await updateTokenAmount(key)).toBe(false);
    },
  );

  test.concurrent(
    "allows refilled tokens to be consumed by concurrent requests",
    async () => {
      const key = "concurrency-key-002";

      const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
        .default;

      // create 5 concurrent request
      await Promise.all(
        Array.from({ length: 5 }, () => updateTokenAmount(key)),
      );

      // update the lastRefillTime to 3 seconds before
      const currentTime = await getRedisMilliseconds();
      await client?.hSet(getKey(key), "lastRefillTime", currentTime - 3 * 1000);

      // create 20 concurrent request
      const result = await Promise.all(
        Array.from({ length: 20 }, () => updateTokenAmount(key)),
      );

      expect(result).toHaveLength(20);
      // 18 true result
      expect(result.filter(Boolean)).toHaveLength(18);
      // 2 false result
      expect(result.filter((value) => !value)).toHaveLength(2);
    },
  );

  test.concurrent(
    "allows only one request when two concurrent requests compete for the last token",
    async () => {
      const key = "concurrency-key-003";

      const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
        .default;

      // create 19 concurrent requests
      await Promise.all(
        Array.from({ length: 19 }, () => updateTokenAmount(key)),
      );

      // create two more concurrent requests
      const result = await Promise.all(
        Array.from({ length: 2 }, () => updateTokenAmount(key)),
      );

      // it should return one true and one false result
      expect(result).toHaveLength(2);

      // one true result
      expect(result.filter(Boolean)).toHaveLength(1);

      // one false result
      expect(result.filter((value) => !value)).toHaveLength(1);
    },
  );

  afterAll(async () => {
    await client.flushDb();
    await disconnectRedis();
  });
});
