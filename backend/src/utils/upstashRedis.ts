/**
 * upstashRedis.ts — backward-compatibility shim
 *
 * All existing code that does:
 *   import { redis } from "../utils/upstashRedis"
 * continues to work unchanged, but now routes through RedisClientManager
 * with automatic failover and circuit-breaker logic.
 */
import { redisManager } from "./redisClientManager";

/** Drop-in replacement for the old UpstashRedis instance. */
export const redis = redisManager;

/** Legacy health-check helper — still works. */
export const isRedisHealthy = async (): Promise<boolean> => {
  try {
    await redisManager.ping();
    return true;
  } catch {
    return false;
  }
};
