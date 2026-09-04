let maxCapacity: number = 20;
let refillRate: number = 1; // how many tokens will be refilled every second
let ttl: number = 900000; // 15 mintues

let bucketList: Map<
  String,
  {
    tokens: number;
    lastRefillTime: number;
  }
> = new Map();

const getBucket = (
  apiKey: string,
): {
  tokens: number;
  lastRefillTime: number;
} => {
  return bucketList.get(apiKey) || { tokens: maxCapacity, lastRefillTime: 0 };
};

const setBucket = (apiKey: string, tokens: number, lastRefillTime: number) => {
  bucketList.set(apiKey, { tokens, lastRefillTime });
};

const updateTokenAmount = (apiKey: string): boolean => {
  let { tokens, lastRefillTime } = getBucket(apiKey);

  // calculate how many tokens can be refilled
  const currentTime = Date.now();
  const secPassed = (currentTime - lastRefillTime) / 1000;

  // if secPassed = 7.9 second, refilledToken = 7.9 * 1 = 7.9 tokens
  // compare with the maximum capacity, get the smaller value
  tokens = Math.min(maxCapacity, tokens + secPassed * refillRate);

  // update last refill time
  lastRefillTime = currentTime;

  // update bucket list
  setBucket(apiKey, tokens, lastRefillTime);

  // minus one token for current request
  tokens--;
  if (tokens < 0) {
    return false;
  }

  return true;
};

export default updateTokenAmount;
