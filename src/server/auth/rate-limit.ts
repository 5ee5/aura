export interface RateLimitOptions {
  perKey: number;
  total: number;
  windowMs: number;
}

/**
 * Sliding-window limit on login attempts, held in memory (one app instance).
 * The total ceiling bounds guessing from many addresses at once.
 */
export function createRateLimiter({ perKey, total, windowMs }: RateLimitOptions) {
  let attempts: { key: string; at: number }[] = [];

  return {
    /** Records an attempt and returns true, or returns false if over a limit. */
    attempt(key: string, now = Date.now()): boolean {
      attempts = attempts.filter((a) => now - a.at < windowMs);
      if (attempts.length >= total) return false;
      if (attempts.filter((a) => a.key === key).length >= perKey) return false;
      attempts.push({ key, at: now });
      return true;
    },
    /** Forgets one key's attempts, after it logs in successfully. */
    clear(key: string): void {
      attempts = attempts.filter((a) => a.key !== key);
    },
  };
}
