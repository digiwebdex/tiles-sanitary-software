/**
 * Client-side rate limiter (defense-in-depth).
 * Prevents the frontend from flooding the backend with requests.
 * 
 * NOTE: True rate limiting is enforced server-side by the backend
 * infrastructure. This is an additional UX-level guard.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const buckets = new Map<string, RateLimitEntry>();

function cleanup(entry: RateLimitEntry, windowMs: number) {
  const now = Date.now();
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
}

export class RateLimitError extends Error {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    const seconds = Math.ceil(retryAfterMs / 1000);
    super(`Too many requests. Please try again in ${seconds} second${seconds !== 1 ? "s" : ""}.`);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Check if an action is within the rate limit.
 * Throws RateLimitError if limit exceeded.
 * 
 * @param key - Unique bucket key (e.g. "login", "api")
 * @param maxRequests - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): void {
  if (!buckets.has(key)) {
    buckets.set(key, { timestamps: [] });
  }

  const entry = buckets.get(key)!;
  cleanup(entry, windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfter = windowMs - (Date.now() - oldest);
    throw new RateLimitError(retryAfter);
  }

  entry.timestamps.push(Date.now());
}

/** Pre-configured limiters for common operations */
export const rateLimits = {
  /** 5 login attempts per 60 seconds */
  login: () => checkRateLimit("login", 5, 60_000),

  /** 100 API calls per 60 seconds */
  api: (suffix = "") => checkRateLimit(`api${suffix}`, 100, 60_000),
};
