/** Serial reads for screen data that is only useful while the screen is visible. */
export function createVisibleScreenRefresh<T>(options: {
  read: (signal: AbortSignal) => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  isVisible: () => boolean;
  intervalMs: number;
}) {
  let disposed = false, dirty = false, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let pending: Promise<void> | undefined;
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const current = (startedAt: number, request: AbortController) =>
    !disposed && !request.signal.aborted && startedAt === revision && options.isVisible();

  async function run() {
    while (!disposed && dirty && options.isVisible()) {
      dirty = false;
      const startedAt = revision, request = new AbortController();
      controller = request;
      try {
        const value = await options.read(request.signal);
        if (current(startedAt, request)) options.onValue(value);
      } catch (error) {
        if (current(startedAt, request)) options.onError(error);
      } finally {
        if (controller === request) controller = undefined;
      }
    }
  }

  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    revision++; dirty = true; clearTimer();
    if (!options.isVisible()) return Promise.resolve();
    if (pending) return pending;
    const operation = Promise.resolve().then(run).finally(() => {
      if (pending === operation) pending = undefined;
      if (!disposed && options.isVisible()) {
        if (dirty) void refresh();
        else timer = setTimeout(() => { timer = undefined; void refresh(); }, options.intervalMs);
      }
    });
    pending = operation;
    return operation;
  }

  return {
    refresh,
    visibilityChanged() {
      if (disposed) return;
      if (options.isVisible()) void refresh();
      else { revision++; dirty = false; clearTimer(); controller?.abort(); }
    },
    dispose() { disposed = true; revision++; dirty = false; clearTimer(); controller?.abort(); },
  };
}
