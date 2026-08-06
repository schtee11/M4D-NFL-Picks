// A tiny in-memory sliding-window rate limiter. Right-sized for this app's
// single-instance Railway deployment — there's no shared store, so each app
// instance limits independently. Good enough to blunt brute-forcing a 4-digit
// PIN on the join/login endpoint; it is not a defense against a distributed
// attacker and isn't meant to be.

const buckets = new Map<string, number[]>();
let lastSweep = 0;

// Returns true if this hit is allowed (at most `limit` hits per `windowMs` for
// `key`), false once the limit is exceeded within the window.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // Occasionally drop stale buckets so the map can't grow without bound.
  if (now - lastSweep > windowMs) {
    for (const [k, hits] of buckets) {
      const live = hits.filter((t) => now - t < windowMs);
      if (live.length) buckets.set(k, live);
      else buckets.delete(k);
    }
    lastSweep = now;
  }

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length <= limit;
}
