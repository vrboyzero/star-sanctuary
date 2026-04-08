type FixedWindowState = {
  count: number;
  windowStartMs: number;
};

export type FixedWindowRateLimiter = {
  isRateLimited: (key: string, nowMs?: number) => boolean;
  size: () => number;
  clear: () => void;
};

export const WEBHOOK_RATE_LIMIT_DEFAULTS = Object.freeze({
  windowMs: 60_000,
  maxRequests: 120,
  maxTrackedKeys: 4_096,
});

export function createFixedWindowRateLimiter(options?: {
  windowMs?: number;
  maxRequests?: number;
  maxTrackedKeys?: number;
}): FixedWindowRateLimiter {
  const windowMs = Math.max(1, Math.floor(options?.windowMs ?? WEBHOOK_RATE_LIMIT_DEFAULTS.windowMs));
  const maxRequests = Math.max(1, Math.floor(options?.maxRequests ?? WEBHOOK_RATE_LIMIT_DEFAULTS.maxRequests));
  const maxTrackedKeys = Math.max(1, Math.floor(options?.maxTrackedKeys ?? WEBHOOK_RATE_LIMIT_DEFAULTS.maxTrackedKeys));
  const state = new Map<string, FixedWindowState>();

  const touch = (key: string, next: FixedWindowState) => {
    state.delete(key);
    state.set(key, next);
    while (state.size > maxTrackedKeys) {
      const oldest = state.keys().next().value;
      if (!oldest) break;
      state.delete(oldest);
    }
  };

  const prune = (nowMs: number) => {
    for (const [key, entry] of state) {
      if (nowMs - entry.windowStartMs >= windowMs) {
        state.delete(key);
      }
    }
  };

  return {
    isRateLimited: (key, nowMs = Date.now()) => {
      if (!key) return false;
      prune(nowMs);
      const current = state.get(key);
      if (!current || nowMs - current.windowStartMs >= windowMs) {
        touch(key, { count: 1, windowStartMs: nowMs });
        return false;
      }
      const nextCount = current.count + 1;
      touch(key, { count: nextCount, windowStartMs: current.windowStartMs });
      return nextCount > maxRequests;
    },
    size: () => state.size,
    clear: () => state.clear(),
  };
}
