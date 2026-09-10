/** One connection attempt per generation. Reset never adopts an old completion. */
export function createSingleFlightResource<T>(options: {
  connect: () => Promise<T>; ready: (value: T) => Promise<boolean>;
  close: (value: T) => Promise<unknown> | void; onFailure?: () => void;
  cooldownMs?: number; now?: () => number;
}) {
  let generation = 0, value: T | null = null, retryAt = 0;
  let pending: { promise: Promise<T | null> } | null = null;
  const now = options.now ?? Date.now;
  const close = async (resource: T) => { try { await options.close(resource); } catch { /* Best-effort release, never publish an invalid connection. */ } };
  return {
    get(): Promise<T | null> {
      if (value !== null) return Promise.resolve(value);
      if (pending) return pending.promise;
      if (now() < retryAt) return Promise.resolve(null);
      const epoch = generation;
      const attempt = { promise: Promise.resolve<T | null>(null) };
      pending = attempt;
      attempt.promise = (async () => {
        let candidate: T | null = null;
        try {
          candidate = await options.connect();
          if (epoch !== generation) { await close(candidate); return null; }
          if (!await options.ready(candidate)) throw new Error('Resource unavailable');
          if (epoch !== generation) { await close(candidate); return null; }
          value = candidate; retryAt = 0;
          return value;
        } catch {
          if (candidate !== null) await close(candidate);
          if (epoch === generation) {
            retryAt = now() + (options.cooldownMs ?? 30_000);
            options.onFailure?.();
          }
          return null;
        } finally { if (pending === attempt) pending = null; }
      })();
      return attempt.promise;
    },
    reset(): void {
      generation += 1;
      const previous = value;
      value = null; pending = null; retryAt = 0;
      if (previous !== null) void close(previous);
    },
  };
}
