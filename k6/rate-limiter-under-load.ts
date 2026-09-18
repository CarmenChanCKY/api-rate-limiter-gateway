import { check } from "k6";
import http from "k6/http";
// k6's Redis extension is provided at runtime and has no bundled TypeScript declarations.
// @ts-ignore -- k6/x/redis is resolved by the k6 binary.
import redis from "k6/x/redis";

// load test for rate limiter
// try to increase load
// test the performance of rate limiter under the large amount of request

// 10 virtual machine
// run for 30 seconds
export const options = {
  vus: 50,
  duration: "30s",
};

// read the same REDIS_URL the gateway uses (via compose), fall back to the compose service name
const redisClient = new redis.Client(__ENV.REDIS_URL || "redis://redis:6379");

// get api key
export function setup() {
  const getAPIKey = http.get("http://gateway:3000/get-api");
  return { apiKey: getAPIKey.body || "" };
}

export default function (data: { apiKey: string }) {
  // Make a GET request
  const res = http.get("http://gateway:3000/api/users", {
    headers: {
      authorization: `Bearer ${data.apiKey}`,
    },
  });

  // check the amount of 200 and 429 request
  check(res, {
    "status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });
}

export async function teardown(data: { apiKey: string }) {
  // remove this API key's rate limiter bucket from Redis
  await redisClient.del(
    `${__ENV.BUCKET_PREFIX || "rate_limiter"}:${data.apiKey}`,
  );
}
