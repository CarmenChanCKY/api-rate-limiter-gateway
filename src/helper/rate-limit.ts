import { connectRedis } from "../config/redis.js";

export const getKey = (apiKey: string, dbKey: string = "rate_limiter"): string => {
  return `${dbKey}:${apiKey}`;
};

const updateTokenAmount = async (apiKey: string): Promise<boolean> => {
  const client = await connectRedis();
  const success = await client.luaUpdateTokenAmount([getKey(apiKey)], []);

  return success === 1;
};

export default updateTokenAmount;
