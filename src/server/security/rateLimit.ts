/**
 * In-memory token bucket rate limiter. Buckets are pruned periodically so
 * memory stays bounded. Suitable for a single server instance; for multiple
 * instances move buckets to Redis (see docs/ARCHITECTURE.md).
 */
interface Bucket {
  tokens: number;
  updated: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private timer: NodeJS.Timeout;

  constructor(capacity: number, perSeconds: number) {
    this.capacity = capacity;
    this.refillPerMs = capacity / (perSeconds * 1000);
    this.timer = setInterval(() => this.prune(), 60_000);
    this.timer.unref?.();
  }

  /** Returns true when the action is allowed. */
  take(key: string, cost = 1, now = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updated: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.updated) * this.refillPerMs);
    b.updated = now;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  private prune() {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (b.tokens + (now - b.updated) * this.refillPerMs >= this.capacity) this.buckets.delete(k);
    }
  }

  dispose() {
    clearInterval(this.timer);
    this.buckets.clear();
  }
}

/** ipScale multiplies the per-IP buckets (many players can share one NAT IP). */
export const limits = (ipScale = 1) => ({
  auth: new RateLimiter(20 * ipScale, 60), // auth attempts / minute / IP
  api: new RateLimiter(600 * ipScale, 60),
  roomCreate: new RateLimiter(5, 60),
  roomJoin: new RateLimiter(20, 60),
  action: new RateLimiter(40, 10),
  chat: new RateLimiter(8, 10),
  draw: new RateLimiter(120, 2),
  upload: new RateLimiter(20, 60),
  social: new RateLimiter(30, 60),
  // voice: signalling bursts while connecting; audio frames are ~17/s while talking
  voiceSignal: new RateLimiter(300, 10),
  voiceAudio: new RateLimiter(80, 2),
});
export type Limits = ReturnType<typeof limits>;
