import { config } from "../config/env.js";
import { connectRedis } from "../config/redis.js";
import { genRandomKey } from "./security.js";

const getMintAPIKey = (key: string) => {
  return `api_key:${key}`;
};

const getMintLimitKey = (ip: string): string => {
  return `mint_limit:${ip}`;
};

const getIPKey = (ip: string): string => {
  return `ip_keys:${ip}`;
};

const genAPIKey = (): string => {
  return genRandomKey(32);
};

// Mint a new API key for the given IP
const mintAPIKey = async (ip: string): Promise<string> => {
  const redisClient = await connectRedis();
  if (redisClient) {
    const mintKey = getMintLimitKey(ip);

    // mints per IP in the last hour (fixed window)
    // add the value of the key by 1
    // INCR treats a missing key as 0, so first mint becomes 1
    const ipCount = await redisClient.incr(mintKey);
    if (ipCount === 1) {
      // Fixed window: first mint in this hour opens a 1-hour window.
      // Only EXPIRE on ==1 so later INCRs don't extend the window.

      // Do NOT expire on every hit, or an attacker could keep pushing the deadline.
      await redisClient.expire(mintKey, 3600);
    } else if (ipCount > config.MINT_LIMIT_PER_HOUR) {
      throw Error("MINT_LIMIT");
    }

    const ipKey = getIPKey(ip);

    // keys ever minted by this IP still tracked in the set (may include expired, conservative)
    const totalActive = await redisClient.sCard(ipKey);
    if (totalActive >= config.MAX_KEYS_PER_IP) {
      throw Error("MINT_LIMIT");
    }

    // generate api key
    const key = genAPIKey();

    // expire after <time>
    await redisClient.set(getMintAPIKey(key), "1", {
      expiration: { type: "EX", value: config.API_KEY_TTL },
    });

    await redisClient.sAdd(ipKey, key);

    // expire after <time>
    await redisClient.expire(ipKey, config.API_KEY_TTL);
    return key;
  }

  throw Error("Redis not available");
};

const isValidAPIKey = async (raw: string): Promise<boolean> => {
  const redisClient = await connectRedis();

  if (redisClient) {
    const key = getMintAPIKey(raw);
    if (await redisClient.exists(key)) {
      await redisClient.expire(key, config.API_KEY_TTL);
      return true;
    }
  }

  return false;
};

export { mintAPIKey, isValidAPIKey };
