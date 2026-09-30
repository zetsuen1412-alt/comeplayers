export const ACCOUNT_ALERT_PREFERENCES_CHANGED = "cp:account-alert-preferences-changed";

/** Per-account, short-lived preferences. Never persist another account's settings. */
export function createNotificationPreferencesReader<T>(read: () => Promise<T>, ttlMs = 60_000, now = Date.now) {
  let cached: T | undefined;
  let loadedAt = -Infinity;
  let revision = 0;
  let pending: Promise<T> | undefined;

  async function readCurrent(): Promise<T> {
    for (;;) {
      const started = revision;
      const value = await read();
      if (started !== revision) continue;
      cached = value;
      loadedAt = now();
      return value;
    }
  }

  return {
    load() {
      if (cached !== undefined && now() - loadedAt < ttlMs) return Promise.resolve(cached);
      if (!pending) pending = readCurrent().finally(() => { pending = undefined; });
      return pending;
    },
    invalidate() { revision++; cached = undefined; loadedAt = -Infinity; },
  };
}
