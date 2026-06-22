import { AppError, ErrorCode } from "@docchat/types";

interface BucketEntry {
  tokens: number;
  lastRefill: number; // timestamp ms
}

// Single Map shared across all Route Handler calls within one Node.js process.
const buckets = new Map<string, BucketEntry>();

/**
 * Check and consume a rate limit token for a user+endpoint combination.
 * Throws AppError(RATE_LIMITED) if the bucket is empty.
 */
export function rateLimiter(
  userId: string,
  endpoint: string,
  limit: number,
  windowMs: number,
): void {
  const key = `${userId}:${endpoint}`;
  const now = Date.now();
  const refillRate = limit / windowMs; // tokens per millisecond

  let entry = buckets.get(key);

  if (!entry) {
    entry = { tokens: limit - 1, lastRefill: now };
    buckets.set(key, entry);
    return;
  }

  // Refill tokens based on elapsed time
  const elapsed = now - entry.lastRefill;
  const tokensToAdd = elapsed * refillRate;
  entry.tokens = Math.min(limit, entry.tokens + tokensToAdd);
  entry.lastRefill = now;

  if (entry.tokens < 1) {
    // Calculate when the next token will be available
    const msUntilNextToken = Math.ceil((1 - entry.tokens) / refillRate);

    throw new AppError(
      ErrorCode.RATE_LIMITED,
      `Rate limit exceeded. Try again in ${Math.ceil(msUntilNextToken / 1000)} seconds.`,
      429,
      true,
      { retryAfterMs: msUntilNextToken },
    );
  }

  // Consume one token
  entry.tokens -= 1;
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    for (const [key, entry] of buckets.entries()) {
      if (now - entry.lastRefill > maxAge) {
        buckets.delete(key);
      }
    }
  },
  60 * 60 * 1000,
); // run every hour
