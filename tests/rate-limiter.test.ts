import {
  describe,
  expect,
  test,
  jest,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "@jest/globals";
import { type Request, type Response, type NextFunction } from "express";
import { connectRedis, disconnectRedis } from "../src/config/redis.js";
import { config } from "../src/config/env.js";

const expectedCapacity = 20;

describe("Token Bucket", () => {
  beforeAll(async () => {
    // connect to redis /1 namespace
    await connectRedis(`${config.redisUrl}/1`);
  });

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: [
        "setTimeout",
        "setInterval",
        "setImmediate",
        "clearTimeout",
        "clearInterval",
        "clearImmediate",
      ],
    });
  });

  test("allows the first request for a new API key", async () => {
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;
    expect(await updateTokenAmount("mocked-key-001")).toBe(true);
  });

  test("allows requests up to bucket capacity", async () => {
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

  test("rejects when no token is available", async () => {
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

  test("refills based on elapsed time", async () => {
    const key = "mocked-key-004";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // 3 seconds passed
    jest.advanceTimersByTime(3000);

    // use the refilled token again
    let refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(true);

    refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(true);

    refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(true);

    // refill amount should be empty
    refillSuccess = await updateTokenAmount(key);
    expect(refillSuccess).toBe(false);
  });

  test("does not exceed capacity", async () => {
    const key = "mocked-key-005";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // expectedCapacity + 5 seconds passed
    jest.advanceTimersByTime((expectedCapacity + 5) * 1000);

    // use all the token again
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // use one more token
    // it should return false if the maximum token refilled equals expectedCapacity
    expect(await updateTokenAmount(key)).toBe(false);
  });

  test("preserves fractional tokens", async () => {
    const key = "mocked-key-006";
    const updateTokenAmount = (await import("../src/helper/rate-limit.js"))
      .default;

    // use all the token
    for (let count = 1; count <= expectedCapacity; count++) {
      await updateTokenAmount(key);
    }

    // 0.5 seconds passed. It should refill 0.5 token
    jest.advanceTimersByTime(500);

    // try to use 1 token, it should return false
    expect(await updateTokenAmount(key)).toBe(false);

    // 0.5 seconds passed. Currently there should be 1 token in the bucket.
    jest.advanceTimersByTime(500);

    // use one token, it should return true
    expect(await updateTokenAmount(key)).toBe(true);

    // use one token again. It should return false
    expect(await updateTokenAmount(key)).toBe(false);
  });

  test("keeps buckets independent between API keys", async () => {
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

  afterEach(() => {
    jest.useRealTimers();
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
