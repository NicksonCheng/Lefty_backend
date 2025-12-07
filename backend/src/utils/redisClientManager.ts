/**
 * RedisClientManager — Singleton Failover / Circuit-Breaker
 *
 * Priority:   Upstash (remote) → ioredis (local)
 * Trips on:   HTTP 401 (Unauthorized) | network timeout | connection refused
 * Cooldown:   5 minutes, after which Upstash is tried again automatically
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

// ─── Constants ────────────────────────────────────────────────────────────────
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SetOptions {
  /** TTL in seconds */
  ex?: number;
}

export interface CircuitState {
  isOpen: boolean;
  cooldownUntil: number;
  remainingMs: number;
  activeClient: "upstash" | "local";
}

// ─── Singleton ────────────────────────────────────────────────────────────────
class RedisClientManager {
  private static instance: RedisClientManager;

  private readonly upstash: UpstashRedis;
  private readonly local: IORedis;

  /** true → circuit is open, route all traffic to local Redis */
  private circuitOpen: boolean = false;
  /** epoch ms when the cooldown expires and Upstash can be retried */
  private cooldownUntil: number = 0;

  // ── Constructor (private — use getInstance()) ────────────────────────────
  private constructor() {
    // Remote: Upstash REST client
    this.upstash = new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_URL ?? "",
      token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
    });

    // Local: ioredis — lazyConnect so startup never fails if Redis is slow
    this.local = new IORedis({
      host: process.env.LOCAL_REDIS_HOST ?? "redis",
      port: Number(process.env.LOCAL_REDIS_PORT ?? 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 1, // fail fast; don't block the request pipeline
      connectTimeout: 2_000,
      commandTimeout: 2_000,
    });

    this.local.on("error", (err: Error) => {
      console.error("[RedisManager] Local Redis error:", err.message);
    });

    console.log(
      "[RedisManager] Initialized (primary: Upstash, fallback: local ioredis)",
    );
  }

  // ── Singleton accessor ───────────────────────────────────────────────────
  static getInstance(): RedisClientManager {
    if (!RedisClientManager.instance) {
      RedisClientManager.instance = new RedisClientManager();
    }
    return RedisClientManager.instance;
  }

  // ── Circuit-Breaker helpers ──────────────────────────────────────────────

  /**
   * Returns true when local Redis should be used.
   * Automatically resets the circuit once the cooldown expires.
   */
  private get shouldUseLocal(): boolean {
    if (!this.circuitOpen) return false;

    if (Date.now() >= this.cooldownUntil) {
      this.circuitOpen = false;
      console.log(
        "[RedisManager] ✅ Cooldown expired — circuit CLOSED. Retrying Upstash.",
      );
      return false;
    }

    return true;
  }

  /** Open the circuit and start the 5-minute cooldown timer. */
  private tripCircuit(reason: string): void {
    if (this.circuitOpen) return; // already open — don't reset the timer
    this.circuitOpen = true;
    this.cooldownUntil = Date.now() + COOLDOWN_MS;
    const mins = (COOLDOWN_MS / 60_000).toFixed(0);
    console.warn(
      `[RedisManager] ⚡ Circuit OPEN — Reason: "${reason}". ` +
        `Falling back to local Redis for ${mins} min.`,
    );
  }

  /**
   * Errors that should trigger failover to local Redis:
   *  - Token / auth errors  → Upstash 401 / 403 Unauthorized
   *  - Network timeouts     → ETIMEDOUT, socket hang up
   *  - Connection refused   → ECONNREFUSED
   *  - DNS failures         → ENOTFOUND (nested in err.cause by Node fetch)
   *
   * Node's native fetch wraps the real network error inside err.cause,
   * so we must inspect both levels.
   */
  private isFailoverError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    const matches = (msg: string) =>
      msg.includes("unauthorized") ||
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("etimedout") ||
      msg.includes("enotfound") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up") ||
      msg.includes("timeout") ||
      msg.includes("network error") ||
      msg.includes("failed to fetch") ||
      msg.includes("fetch failed");

    if (matches(err.message.toLowerCase())) return true;

    // DNS / network errors from Node fetch land in err.cause
    const cause = (err as NodeJS.ErrnoException & { cause?: unknown }).cause;
    if (cause instanceof Error && matches(cause.message.toLowerCase())) {
      return true;
    }
    // Check the errno code directly (e.g. ENOTFOUND, ECONNREFUSED)
    if (
      cause != null &&
      typeof (cause as NodeJS.ErrnoException).code === "string"
    ) {
      const code = ((cause as NodeJS.ErrnoException).code ?? "").toLowerCase();
      if (
        code === "enotfound" ||
        code === "econnrefused" ||
        code === "econnreset" ||
        code === "etimedout"
      ) {
        return true;
      }
    }

    return false;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * GET a cached value.
   * Upstash auto-deserialises JSON; ioredis returns raw strings (parsed here).
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.shouldUseLocal) {
      try {
        return await this.upstash.get<T>(key);
      } catch (err) {
        if (this.isFailoverError(err)) {
          this.tripCircuit((err as Error).message);
          // fall through ↓ to local Redis
        } else {
          throw err;
        }
      }
    }

    const raw = await this.local.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /**
   * SET a value with an optional TTL (seconds).
   * ioredis needs a JSON-serialised string; Upstash handles serialisation natively.
   */
  async set(key: string, value: unknown, options?: SetOptions): Promise<void> {
    if (!this.shouldUseLocal) {
      try {
        if (options?.ex) {
          await this.upstash.set(key, value, { ex: options.ex });
        } else {
          await this.upstash.set(key, value);
        }
        return;
      } catch (err) {
        if (this.isFailoverError(err)) {
          this.tripCircuit((err as Error).message);
          // fall through ↓ to local Redis
        } else {
          throw err;
        }
      }
    }

    const serialised =
      typeof value === "string" ? value : JSON.stringify(value);

    if (options?.ex) {
      await this.local.set(key, serialised, "EX", options.ex);
    } else {
      await this.local.set(key, serialised);
    }
  }

  /** DEL one or more keys. */
  async del(...keys: string[]): Promise<number> {
    if (!this.shouldUseLocal) {
      try {
        return await this.upstash.del(...keys);
      } catch (err) {
        if (this.isFailoverError(err)) {
          this.tripCircuit((err as Error).message);
          // fall through ↓ to local Redis
        } else {
          throw err;
        }
      }
    }

    return this.local.del(...keys);
  }

  /** PING — useful for health checks. */
  async ping(): Promise<string> {
    if (!this.shouldUseLocal) {
      try {
        return await this.upstash.ping();
      } catch (err) {
        if (this.isFailoverError(err)) {
          this.tripCircuit((err as Error).message);
          // fall through ↓ to local Redis
        } else {
          throw err;
        }
      }
    }

    return this.local.ping();
  }

  // ── Observability ────────────────────────────────────────────────────────

  /** Which client is currently serving requests. */
  getActiveClient(): "upstash" | "local" {
    return this.shouldUseLocal ? "local" : "upstash";
  }

  /** Full circuit-breaker snapshot — expose via a /health route if needed. */
  getCircuitState(): CircuitState {
    const remaining = this.circuitOpen
      ? Math.max(0, this.cooldownUntil - Date.now())
      : 0;
    return {
      isOpen: this.circuitOpen,
      cooldownUntil: this.cooldownUntil,
      remainingMs: remaining,
      activeClient: this.circuitOpen ? "local" : "upstash",
    };
  }
}

// ─── Module exports ────────────────────────────────────────────────────────────
/** Pre-initialised singleton — import this everywhere in the app. */
export const redisManager = RedisClientManager.getInstance();

export default RedisClientManager;
