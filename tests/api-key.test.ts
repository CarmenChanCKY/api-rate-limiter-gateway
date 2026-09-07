import { describe, expect, test, jest } from "@jest/globals";

describe("getAPIKey", () => {
  test("returns a non-empty string", async () => {
    jest.unstable_mockModule("../src/helper/security.js", () => ({
      genRandomKey: jest.fn(() => "mocked-key-001"),
    }));
    const { getAPIKey } = await import("../src/helper/api-key.js");
    expect(getAPIKey()).toBe("mocked-key-001");
  });

  test("returns the same key on repeated calls", async () => {
    jest.unstable_mockModule("../src/helper/security.js", () => ({
      genRandomKey: jest.fn(() => "mocked-key-001"),
    }));
    const { getAPIKey } = await import("../src/helper/api-key.js");
    expect(getAPIKey()).toBe(getAPIKey());
  });

  test("genRandomKey only call once", async () => {
    jest.resetModules();

    const genRandomKey = jest.fn(() => "mocked-key-001");
    jest.unstable_mockModule("../src/helper/security.js", () => ({
      genRandomKey,
    }));

    const { getAPIKey } = await import("../src/helper/api-key.js");

    getAPIKey();
    getAPIKey();
    getAPIKey();

    expect(genRandomKey).toHaveBeenCalledTimes(1);
  });
});
