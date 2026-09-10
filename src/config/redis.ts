import { createClient, type RedisClientType } from "redis";
import { config } from "./env.js";

let redisClient: RedisClientType | null = null;

export async function connectRedis(
  url: string = config.redisUrl,
): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({ url });

  redisClient.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  redisClient.on("connect", () => {
    console.log("Redis client connected");
  });

  await redisClient.connect();
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
