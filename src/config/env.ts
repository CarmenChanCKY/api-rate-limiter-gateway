const parseEnvInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  targetApiUrl: process.env.TARGET_API_URL || "http://localhost:4000",
  bucketPrefix: process.env.BUCKET_PREFIX || "rate_limiter",
  API_KEY_TTL: parseEnvInt(process.env.API_KEY_TTL, 86400), // 24 hour
  MINT_LIMIT_PER_HOUR: parseEnvInt(process.env.MINT_LIMIT_PER_HOUR, 5), // per-IP mint limit
  MAX_KEYS_PER_IP: parseEnvInt(process.env.MAX_KEYS_PER_IP, 5), // max active keys per IP
} as const;
