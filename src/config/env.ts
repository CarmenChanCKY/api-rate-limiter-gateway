export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  targetApiUrl: process.env.TARGET_API_URL || "http://localhost:4000",
  bucketPrefix: process.env.BUCKET_PREFIX || "rate_limiter",
} as const;
