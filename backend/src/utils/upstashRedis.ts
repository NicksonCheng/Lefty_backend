import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 加上簡單的健康檢查（可選）
export const isRedisHealthy = async () => {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
};
