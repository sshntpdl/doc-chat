// FILE: /apps/web/app/api/_lib/ratelimit.ts
//
// Simple in-memory token bucket rate limiter.
//
// WHY NOT A REDIS/UPSTASH SOLUTION:
// For a portfolio project, a Map-based solution is sufficient and has zero
// cold-start latency. In production you'd replace the Map with Upstash Redis
// so limits are shared across serverless function instances.
//
// TOKEN BUCKET ALGORITHM:
// Each user starts with `limit` tokens. Each request consumes 1 token.
// Tokens refill continuously at rate (limit / windowMs) per millisecond.
// This allows short bursts up to `limit` while enforcing the average rate.
//
// The alternative (sliding window) is more precise but more complex.
// Token bucket is standard for API rate limiting because it handles bursts
// gracefully — a user can send 3 quick messages then wait, rather than
// being locked to exactly 1 message every 2 seconds.

import { AppError, ErrorCode } from "@docchat/types";

interface BucketEntry {
  tokens:       number;
  lastRefill:   number; // timestamp ms
}

// Single Map shared across all Route Handler calls within one Node.js process.
// In serverless (Vercel), each function instance has its own Map — this is
// acceptable for a portfolio project; use Redis for multi-instance accuracy.
const buckets = new Map<string, BucketEntry>();

/**
 * Check and consume a rate limit token for a user+endpoint combination.
 * Throws AppError(RATE_LIMITED) if the bucket is empty.
 *
 * @param userId     — from authenticated Supabase user
 * @param endpoint   — e.g. "chat" or "ingest" (namespaces per-route limits)
 * @param limit      — max requests per window
 * @param windowMs   — rolling window in milliseconds
 */
export function rateLimiter(
  userId:   string,
  endpoint: string,
  limit:    number,
  windowMs: number
): void {
  const key     = `${userId}:${endpoint}`;
  const now     = Date.now();
  const refillRate = limit / windowMs; // tokens per millisecond

  let entry = buckets.get(key);

  if (!entry) {
    // First request — full bucket
    entry = { tokens: limit - 1, lastRefill: now };
    buckets.set(key, entry);
    return; // allowed
  }

  // Refill tokens based on elapsed time
  const elapsed      = now - entry.lastRefill;
  const tokensToAdd  = elapsed * refillRate;
  entry.tokens       = Math.min(limit, entry.tokens + tokensToAdd);
  entry.lastRefill   = now;

  if (entry.tokens < 1) {
    // Calculate when the next token will be available
    const msUntilNextToken = Math.ceil((1 - entry.tokens) / refillRate);

    throw new AppError(
      ErrorCode.RATE_LIMITED,
      `Rate limit exceeded. Try again in ${Math.ceil(msUntilNextToken / 1000)} seconds.`,
      429,
      true,
      { retryAfterMs: msUntilNextToken }
    );
  }

  // Consume one token
  entry.tokens -= 1;
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────
// Periodically purge stale bucket entries to prevent memory leaks.
// Entries older than 2x the window are definitely expired.

setInterval(() => {
  const now      = Date.now();
  const maxAge   = 2 * 60 * 60 * 1000; // 2 hours
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.lastRefill > maxAge) {
      buckets.delete(key);
    }
  }
}, 60 * 60 * 1000); // run every hour
