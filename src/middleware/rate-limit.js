const MAX_TRACKED_CLIENTS = 10000;

export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  check(clientKey, { maxRequests, windowSeconds }) {
    const now = Date.now();
    let bucket = this.buckets.get(clientKey);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.buckets.set(clientKey, bucket);
      this.prune(now);
    }

    if (bucket.count >= maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  prune(now) {
    if (this.buckets.size <= MAX_TRACKED_CLIENTS) return;
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
    while (this.buckets.size > MAX_TRACKED_CLIENTS) {
      const oldestKey = this.buckets.keys().next().value;
      this.buckets.delete(oldestKey);
    }
  }
}

export function getClientKey(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
