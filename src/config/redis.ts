import {
  createClient,
  defineScript,
  type CommandParser,
  type RedisClientType,
  type TypeMapping,
} from "redis";
import { config } from "./env.js";

// add the custom lua script function
export type RedisClientWithScripts = RedisClientType & {
  luaUpdateTokenAmount: (keys: string[], args: string[]) => Promise<number>;
};

let redisClient: RedisClientWithScripts | null = null;

const luaUpdateTokenAmountScript = `
local function getCurrentEpochTime()
  local time = redis.call('TIME')
  -- time[1] is seconds, time[2] is microseconds
  return time[1] * 1000 + math.floor(time[2] / 1000)
end

local apiKey = KEYS[1]

local maxCapacity = 20
local refillRate = 1

-- 900 second = 15 minutes
local ttl = 900

-- get bucket data
local currentTime = getCurrentEpochTime()
local lastRefillTime = tonumber(redis.call("HGET", apiKey, "lastRefillTime")) or currentTime
local tokens = tonumber(redis.call("HGET", apiKey, "tokens")) or maxCapacity

-- calculate how many tokens can be refilled
local secPassed = (currentTime - lastRefillTime) / 1000

-- if secPassed = 7.9 second, refilledToken = 7.9 * 1 = 7.9 tokens
-- compare with the maximum capacity, get the smaller value
tokens = math.min(maxCapacity, tokens + secPassed * refillRate)

-- update last refill time
lastRefillTime = currentTime

local success = 0
if tokens >= 1 then
  -- minus one token for current request
  tokens = tokens - 1
  success = 1
end

-- update bucket list
redis.call("HSET", apiKey, "tokens", tokens)
redis.call("HSET", apiKey, "lastRefillTime", lastRefillTime)

-- reset expiry time
redis.call("EXPIRE", apiKey, ttl)

return success
`;

export async function connectRedis(
  url: string = config.redisUrl,
): Promise<RedisClientWithScripts> {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    url,
    scripts: {
      luaUpdateTokenAmount: defineScript({
        NUMBER_OF_KEYS: 1,
        SCRIPT: luaUpdateTokenAmountScript,
        parseCommand: function (
          this: void,
          parser: CommandParser,
          ...args: Array<any>
        ): void {
          parser.pushVariadic(args.flat());
        },
        transformReply: function (
          this: void,
          reply: any,
          preserve?: any,
          typeMapping?: TypeMapping,
        ) {
          return reply;
        },
      }),
    },
  } as const);

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

export async function getRedisMilliseconds() {
  if (redisClient) {
    const [seconds, microseconds] = await redisClient.time();
    return (
      parseInt(seconds || "0") * 1000 +
      Math.floor(parseInt(microseconds || "0") / 1000)
    );
  } else {
    return Date.now();
  }
}
