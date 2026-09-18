import { check } from "k6";
import http from "k6/http";
// k6's Redis extension is provided at runtime and has no bundled TypeScript declarations.
// @ts-ignore -- k6/x/redis is resolved by the k6 binary.
import redis from "k6/x/redis";

// test the performance of system with mixed traffic pattern

// read the same REDIS_URL the gateway uses (via compose), fall back to the compose service name
const redisClient = new redis.Client(__ENV.REDIS_URL || "redis://redis:6379");

const scenarios: { [key: string]: {} } = {
  // test for a constant number of VUs over a period of time
  // can the system work normally under sustained traffic?
  steady_scenario: {
    executor: "constant-vus",
    vus: 10,
    duration: "30s",
  },
  // test for a sudden increase in traffic
  // can the system handle a sudden increase in traffic?
  burst_scenario: {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      // increase from 1 vus to 20 vus within 10 seconds
      { duration: "10s", target: 20 },
      // decrease from 20 vus to 10 vus within 5 seconds
      { duration: "5s", target: 10 },
      // decrease from 10 vus to 1 vus within 3 seconds
      { duration: "3s", target: 1 },
    ],
  },

  // test for gradually increasing traffic
  // how does performance change as traffic gradually increases?
  rampUp_scenario: {
    executor: "ramping-vus",
    startVUs: 1,
    stages: [
      { duration: "10s", target: 5 },
      { duration: "10s", target: 10 },
      { duration: "10s", target: 20 },
    ],
  },
};

const { SCENARIO } = __ENV;

export const options = {
  // if a scenario is passed via a CLI env variable, then run that scenario. Otherwise, run
  // using the pre-configured scenarios above.
  scenarios: SCENARIO ? { [SCENARIO]: scenarios[SCENARIO] } : scenarios,
};

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
