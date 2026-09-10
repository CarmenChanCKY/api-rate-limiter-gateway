import { connectRedis } from "../config/redis.js";

const maxCapacity: number = 20;
const refillRate: number = 1; // how many tokens will be refilled every second
const ttl: number = 900000; // 15 mintues

const getKey = (apiKey: string, dbKey: string = "rate_limiter"): string => {
  return `${dbKey}:${apiKey}`;
};

const getBucket = async (
  apiKey: string,
): Promise<{
  tokens: number;
  lastRefillTime: number;
}> => {
  const client = await connectRedis();
  const data = await client.hGetAll(getKey(apiKey));

  let tokens = parseFloat(data.tokens || "");
  let lastRefillTime = parseInt(data.lastRefillTime || "");
  return {
    tokens: Number.isNaN(tokens) ? maxCapacity : tokens,
    lastRefillTime: Number.isNaN(lastRefillTime) ? Date.now() : lastRefillTime,
  };
};

const setBucket = async (
  apiKey: string,
  tokens: number,
  lastRefillTime: number,
) => {
  const client = await connectRedis();
  await client.hSet(getKey(apiKey), { tokens, lastRefillTime });
};

const updateTokenAmount = async (apiKey: string): Promise<boolean> => {
  let { tokens, lastRefillTime } = await getBucket(apiKey);
  // calculate how many tokens can be refilled
  const currentTime = Date.now();
  const secPassed = (currentTime - lastRefillTime) / 1000;
  // if secPassed = 7.9 second, refilledToken = 7.9 * 1 = 7.9 tokens
  // compare with the maximum capacity, get the smaller value
  tokens = Math.min(maxCapacity, tokens + secPassed * refillRate);

  // update last refill time
  lastRefillTime = currentTime;

  let success = false;

  if (tokens >= 1) {
    // minus one token for current request
    tokens--;
    success = true;
  }

  // update bucket list
  await setBucket(apiKey, tokens, lastRefillTime);

  return success;
};

export default updateTokenAmount;
