type Subscriber<T> = (value: T) => void;

/** One non-overlapping reader shared by every call surface in this browser. */
export function createCallMonitor<T>(read: (signal: AbortSignal) => Promise<T>, interval: number | ((snapshot: T | undefined) => number) = 3000) {
  const subscribers = new Set<Subscriber<T>>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let snapshot: T | undefined;
  let signature = "";
  let revision = 0;
  let refreshPending = false;

  async function refresh(invalidate = false) {
    if (!subscribers.size) return;
    if (invalidate) { revision++; refreshPending = true; }
    if (controller) return;
    clearTimeout(timer);
    const forceNotify = refreshPending;
    refreshPending = false;
    const current = new AbortController();
    controller = current;
    const startedAt = revision;
    try {
      const value = await read(current.signal);
      if (current.signal.aborted || !subscribers.size || startedAt !== revision) return;
      const nextSignature = JSON.stringify(value);
      snapshot = value;
      if (nextSignature !== signature || forceNotify) {
        signature = nextSignature;
        subscribers.forEach(listener => listener(value));
      }
    } catch { /* Keep the last state on transient failure; never terminate media. */ }
    finally {
      if (controller === current) controller = undefined;
      if (subscribers.size && !current.signal.aborted) {
        timer = setTimeout(() => void refresh(), refreshPending ? 0 : typeof interval === "function" ? interval(snapshot) : interval);
      }
    }
  }

  return {
    subscribe(listener: Subscriber<T>) {
      subscribers.add(listener);
      if (snapshot !== undefined) listener(snapshot);
      if (subscribers.size === 1) void refresh();
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) {
          revision++; clearTimeout(timer); controller?.abort(); controller = undefined;
          snapshot = undefined; signature = ""; refreshPending = false;
        }
      };
    },
    refresh: () => refresh(true),
    reschedule() {
      if (!subscribers.size || controller) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), typeof interval === "function" ? interval(snapshot) : interval);
    },
  };
}
