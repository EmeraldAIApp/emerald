import { Redis } from '@upstash/redis'

/** Everything the server stores in Redis. It does not store chat content. */
export interface Store {
  /** INCR + EXPIREAT in a single round trip; returns the new value. */
  incrExpireAt(key: string, atUnixSec: number): Promise<number>
  /** INCRBYFLOAT + EXPIREAT; returns the new total. */
  incrFloatExpireAt(key: string, by: number, atUnixSec: number): Promise<number>
  getNumber(key: string): Promise<number>
  getJson<T>(key: string): Promise<T | null>
  setJson(key: string, value: unknown, ttlSec: number): Promise<void>
  /** DEL: returns 1 if the key existed (works for single-use nonces). */
  del(key: string): Promise<number>
}

/** Far-future timestamp (2100-01-01) for counters that never expire. */
export const FOREVER = 4102444800

export function upstashStore(redis: Redis): Store {
  return {
    async incrExpireAt(key, at) {
      const [n] = await redis.multi().incr(key).expireat(key, at).exec<[number, 0 | 1]>()
      return n
    },
    async incrFloatExpireAt(key, by, at) {
      const [n] = await redis.multi().incrbyfloat(key, by).expireat(key, at).exec<[number | string, 0 | 1]>()
      return Number(n)
    },
    async getNumber(key) {
      const v = await redis.get<number | string>(key)
      return v === null ? 0 : Number(v)
    },
    async getJson<T>(key: string) {
      return (await redis.get<T>(key)) ?? null
    },
    async setJson(key, value, ttlSec) {
      await redis.set(key, JSON.stringify(value), { ex: ttlSec })
    },
    async del(key) {
      return redis.del(key)
    },
  }
}

/** In-memory Store with the same semantics (tests and local development without Upstash). */
export class MemoryStore implements Store {
  private m = new Map<string, { v: unknown; exp: number }>()
  private now: () => number
  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }
  private live(key: string) {
    const e = this.m.get(key)
    if (e && e.exp * 1000 <= this.now()) {
      this.m.delete(key)
      return undefined
    }
    return e
  }
  async incrExpireAt(key: string, at: number) {
    const v = Number(this.live(key)?.v ?? 0) + 1
    this.m.set(key, { v, exp: at })
    return v
  }
  async incrFloatExpireAt(key: string, by: number, at: number) {
    const v = Number(this.live(key)?.v ?? 0) + by
    this.m.set(key, { v, exp: at })
    return v
  }
  async getNumber(key: string) {
    return Number(this.live(key)?.v ?? 0)
  }
  async getJson<T>(key: string) {
    const e = this.live(key)
    return e ? (JSON.parse(String(e.v)) as T) : null
  }
  async setJson(key: string, value: unknown, ttlSec: number) {
    this.m.set(key, { v: JSON.stringify(value), exp: Math.floor(this.now() / 1000) + ttlSec })
  }
  async del(key: string) {
    return this.live(key) ? (this.m.delete(key), 1) : 0
  }
}

/** Upstash when configured; otherwise memory (only reachable outside Vercel: readEnv refuses a Vercel env without Upstash). */
export function storeFromEnv(env: { UPSTASH_REDIS_REST_URL: string | undefined; UPSTASH_REDIS_REST_TOKEN: string | undefined }): Store {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[emerald] UPSTASH_REDIS_REST_URL/TOKEN missing: using an in-memory store (dev only)')
    return new MemoryStore()
  }
  return upstashStore(new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, enableTelemetry: false }))
}
