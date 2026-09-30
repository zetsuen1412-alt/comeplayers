export const ACTIVE_CALL_REFRESH_MS = 2000;
export const IDLE_CALL_REFRESH_MS = 15000;

/** Wake on account events, with one bounded fallback request and no overlaps. */
export function createMobileCallMonitor<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  isForeground: () => boolean;
  hasActiveCall: () => boolean;
}) {
  let disposed = false, connected = false, capable = false, dirty = false, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AbortController | undefined;
  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!disposed && options.isForeground()) timer = setTimeout(() => { timer = undefined; void run(); }, delay);
  };
  async function run() {
    if (disposed || pending || !options.isForeground()) return;
    clearTimeout(timer); timer = undefined;
    dirty = false;
    const startedAt = revision, controller = new AbortController();
    pending = controller;
    try {
      const value = await options.read(controller.signal);
      if (!disposed && !controller.signal.aborted && startedAt === revision && options.isForeground()) options.onValue(value);
    } catch (error) {
      if (!disposed && !controller.signal.aborted && startedAt === revision && options.isForeground()) {
        capable = false; // Reconfirm delivery capability after a failed read.
        options.onError(error);
      }
    } finally {
      if (pending === controller) pending = undefined;
      schedule(dirty ? 0 : !connected || !capable || options.hasActiveCall() ? ACTIVE_CALL_REFRESH_MS : IDLE_CALL_REFRESH_MS);
    }
  }
  const refresh = () => {
    if (disposed) return;
    revision++; dirty = true;
    clearTimeout(timer); timer = undefined;
    if (options.isForeground()) void run();
  };
  return {
    refresh,
    // The server advertises this only after atomic participant signals exist.
    setEventCapability(value: boolean) {
      if (disposed || capable === value) return;
      capable = value;
      if (!pending) schedule(!connected || !capable || options.hasActiveCall() ? ACTIVE_CALL_REFRESH_MS : IDLE_CALL_REFRESH_MS);
    },
    setRealtimeConnected(value: boolean) {
      if (disposed || connected === value) return;
      connected = value;
      // Catch missed changes on reconnect; restore fast fallback on failure.
      refresh();
    },
    foregroundChanged() {
      if (options.isForeground()) refresh();
      else { revision++; clearTimeout(timer); timer = undefined; pending?.abort(); }
    },
    dispose() { disposed = true; revision++; clearTimeout(timer); pending?.abort(); },
  };
}
