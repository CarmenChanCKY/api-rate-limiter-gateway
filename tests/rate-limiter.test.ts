import {
  describe,
  expect,
  test,
  jest,
  beforeEach,
  beforeAll,
  afterAll,
} from "@jest/globals";
import { type Request, type Response, type NextFunction } from "express";
import {
  connectRedis,
  disconnectRedis,
  type RedisClientWithScripts,
} from "../src/config/redis.js";
import { config } from "../src/config/env.js";
import { getKey } from "../src/helper/rate-limit.js";
import { setTimeout } from "timers/promises";

const expectedCapacity = 20;

describe("Token Bucket", () => {
  let client: RedisClientWithScripts;

  const getRedisMilliseconds = async () => {
    const [seconds, microseconds] = await client.time();
    return parseInt(seconds) * 1000 + Math.floor(parseInt(microseconds) / 1000);
  };

  beforeAll(async () => {
    // connect to redis /1 namespace
    client = await connectRedis(`${config.redisUrl}/1`);
  });

  test.concurrent("allows the first request for a new API key", async () => {
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;
    expect(await updateTokenAmount("mocked-key-001")).toBe(true);
  });

  test.concurrent("allows requests up to bucket capacity", async () => {
    const key = "mocked-key-002";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    let count = 1;
    let final = true;
    const maxCapacity = expectedCapacity + 1;
    for (count = 1; count <= maxCapacity; count++) {
      final = await updateTokenAmount(key);
      if (!final) {
        break;
      }
    }

    expect(final).toBe(false);
    expect(count).toBe(maxCapacity);
  });

  test.concurrent("rejects when no token is available", async () => {
    const key = "mocked-key-003";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token inside the bucket
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // use one more token
    const updateState = await updateTokenAmount(key);
    expect(updateState).toBe(false);
  });

  test.concurrent("refills based on elapsed time", async () => {
    const key = "mocked-key-004";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // 2 seconds passed
    await setTimeout(2000);

    // use the refilled token again
    let refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(true);

    refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(true);

    // refill amount should be empty
    refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(false);
  });

  test.concurrent("does not exceed capacity", async () => {
    const key = "mocked-key-005";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // simulate expectedCapacity + 2 seconds passed
    const currentTime = await getRedisMilliseconds();

    await client?.hSet(
      getKey(key),
      "lastRefillTime",
      currentTime - (expectedCapacity + 2) * 1000,
    );
    // await setTimeout((expectedCapacity + 2) * 1000);

    // use all the token again
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // use one more token
    // it should return false if the maximum token refilled equals expectedCapacity
    expect(await updateTokenAmount(key)).toBe(false);
  });

  test.concurrent("preserves fractional tokens", async () => {
    const key = "mocked-key-006";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // 0.5 seconds passed. It should refill 0.5 token
    await setTimeout(500);

    // try to use 1 token, it should return false
    expect(await updateTokenAmount(key)).toBe(false);

    // 0.5 seconds passed. Currently there should be 1 token in the bucket.
    await setTimeout(500);

    // use one token, it should return true
    expect(await updateTokenAmount(key)).toBe(true);

    // use one token again. It should return false
    expect(await updateTokenAmount(key)).toBe(false);
  });

  test.concurrent("keeps buckets independent between API keys", async () => {
    const key1 = "mocked-key-007";
    const key2 = "mocked-key-008";

    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token for key1
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key1);
    }

    // use one more token for key1
    expect(await updateTokenAmount(key1)).toBe(false);

    // use a token for key2
    expect(await updateTokenAmount(key2)).toBe(true);
  });

  test.concurrent("sets a 15-minute expiration", async () => {
    const key = "mocked-key-009";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    await updateTokenAmount(key);

    // get the remaining time to live of a key that has a timeout
    const ttl = await client.ttl(getKey(key));
    // expire after 15 minutes i.e. 900 seconds
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  test.concurrent("extends expiration on each request", async () => {
    const key = "mocked-key-010";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // make the first request
    await updateTokenAmount(key);

    // 2 seconds passed
    await setTimeout(2000);

    // get the remaining time to live of first request
    const ttl1 = await client.ttl(getKey(key));

    // make the second request
    await updateTokenAmount(key);

    // get the remaining time to live of second request
    const ttl2 = await client.ttl(getKey(key));

    // these remaining time should not be equal and ttl2 should greater than ttl1
    expect(ttl2).toBeGreaterThan(ttl1);
  });

  test.concurrent("recreates token data after expiration", async () => {
    const key = "mocked-key-011";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // create first request
    await updateTokenAmount(key);

    // set the expiry time to 1 second
    await client.expire(getKey(key), 1);

    // wait 3 second
    await setTimeout(3000);

    // get the remaining time to live of first request
    const ttl1 = await client.ttl(getKey(key));

    // -2 means the key does not exist i.e. expired
    expect(ttl1).toBe(-2);

    // create second request
    await updateTokenAmount(key);

    // check token bucket created
    const data = await client.hGetAll(getKey(key));
    expect(Object.keys(data).length).toBeGreaterThan(0);

    // get the remaining time to live of second request
    const ttl2 = await client.ttl(getKey(key));
    // expire after 15 minutes i.e. 900 seconds
    expect(ttl2).toBeGreaterThan(0);
    expect(ttl2).toBeLessThanOrEqual(900);
  });

  afterAll(async () => {
    await disconnectRedis();
  });
});

describe("Rate Limiter Middleware", () => {
  let request: Partial<Request>;
  let response: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    request = {};
    response = {};
    next = jest.fn();
  });

  test("allows request when token is available", async () => {
    jest.resetModules();

    const updateTokenAmount = jest.fn(() => {
      return true;
    });

    jest.unstable_mockModule("../src/helper/rate-limit.js", () => ({
      default: updateTokenAmount,
    }));

    // fake request header
    request = {
      header: jest.fn(
        () => "Bearer mocked-key-001",
      ) as unknown as Request["header"],
    };

    const rateLimiter = (await import("../src/middleware/rate-limiter.js"))
      .default;

    await rateLimiter(request as Request, response as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("returns 429 when no token is available", async () => {
    jest.resetModules();

    const updateTokenAmount = jest.fn(() => {
      return false;
    });

    jest.unstable_mockModule("../src/helper/rate-limit.js", () => ({
      default: updateTokenAmount,
    }));

    request = {
      header: jest.fn(() => "") as unknown as Request["header"],
    };

    response = {
      status: jest.fn().mockReturnThis() as Response["status"],
      json: jest.fn() as Response["json"],
    };

    const rateLimiter = (await import("../src/middleware/rate-limiter.js"))
      .default;

    await rateLimiter(request as Request, response as Response, next);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalled();
  });

  test("does not forward rejected request", async () => {
    jest.resetModules();

    const updateTokenAmount = jest.fn(() => {
      return false;
    });

    jest.unstable_mockModule("../src/helper/rate-limit.js", () => ({
      default: updateTokenAmount,
    }));

    request = {
      header: jest.fn(() => "") as unknown as Request["header"],
    };

    response = {
      status: jest.fn().mockReturnThis() as Response["status"],
      json: jest.fn() as Response["json"],
    };

    const rateLimiter = (await import("../src/middleware/rate-limiter.js"))
      .default;

    await rateLimiter(request as Request, response as Response, next);

    expect(next).not.toHaveBeenCalled();
  });
});
