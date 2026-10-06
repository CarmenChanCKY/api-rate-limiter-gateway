import { describe, expect, test, jest } from "@jest/globals";
import { type Request, type Response, type NextFunction } from "express";

const loadMiddleware = async () => {
  jest.resetModules();

  jest.unstable_mockModule("../src/helper/api-key.js", () => ({
    // Only "good-key" validates; everything else is rejected.
    mintAPIKey: jest.fn(async () => "mocked-new-key"),
    isValidAPIKey: jest.fn(async (raw: string) => raw === "good-key"),
  }));

  return (await import("../src/middleware/verify-api-key.js")).default;
};

const makeRequest = (authorization?: string): Request =>
  ({
    header: jest.fn(() => authorization) as unknown as Request["header"],
  }) as Request;

const makeResponse = () => {
  const json = jest.fn();
  const status = jest.fn((statusCode: number) => ({ json, statusCode }));
  return { status, json };
};

describe("verifyAPIKeys", () => {
  test("passes valid Bearer key and attaches raw key to the request", async () => {
    const verifyAPIKeys = await loadMiddleware();
    const next = jest.fn<() => void>();
    const req = makeRequest("Bearer good-key");
    const res = makeResponse();

    await verifyAPIKeys(
      req,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as unknown as { apiKey: string }).apiKey).toBe("good-key");
  });

  test("accepts lowercase scheme and extra whitespace", async () => {
    const verifyAPIKeys = await loadMiddleware();
    const next = jest.fn<() => void>();
    const req = makeRequest("bearer   good-key  ");
    const res = makeResponse();

    await verifyAPIKeys(
      req,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid key with 401", async () => {
    const verifyAPIKeys = await loadMiddleware();
    const next = jest.fn<() => void>();
    const res = makeResponse();

    await verifyAPIKeys(
      makeRequest("Bearer bad-key"),
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalled();
  });

  test("rejects missing header and bare Bearer with 401", async () => {
    const verifyAPIKeys = await loadMiddleware();

    for (const header of [undefined, "", "Bearer", "Bearer   "]) {
      const next = jest.fn<() => void>();
      const res = makeResponse();

      await verifyAPIKeys(
        makeRequest(header),
        res as unknown as Response,
        next as unknown as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    }
  });
});
