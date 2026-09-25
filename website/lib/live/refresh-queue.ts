/** Coalesce bursts, serialize reads, and retain an invalidation while editing/offline. */
export function createRefreshQueue(
  refresh: () => void | boolean | Promise<void | boolean>,
  ready: () => boolean = () => true,
  delay = 350,
) {
  let pending = false, running = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function arm(wait: number) {
    if (!disposed && !timer) timer = setTimeout(() => { timer = undefined; void drain(); }, wait);
  }
  async function drain() {
    if (disposed || running || !pending) return;
    if (!ready()) { arm(1000); return; }
    pending = false; running = true;
    let retry = delay;
    try { if (await refresh() === false) { pending = true; retry = 1000; } }
    catch { pending = true; retry = 15_000; }
    finally { running = false; if (pending) arm(retry); }
  }
  return {
    request() { if (!disposed) { pending = true; arm(delay); } },
    dispose() { disposed = true; pending = false; clearTimeout(timer); },
  };
}

export type LiveTopic = 'catalog' | 'account' | 'admin' | 'payroll';
export type LiveRevision = { scope: string; revision: number | string };

/** A delayed HTTP snapshot must never roll back a newer WebSocket revision. */
export class RevisionTracker {
  private revisions = new Map<string, bigint>();
  accept(rows: LiveRevision[]): LiveTopic[] {
    const changed = new Set<LiveTopic>();
    for (const row of rows) {
      if (!row || typeof row.scope !== 'string') continue;
      if (!/^(catalog|admin|payroll|user:[0-9a-f-]{36})$/.test(row.scope)) continue;
      if (!/^\d+$/.test(String(row.revision))) continue;
      const revision = BigInt(row.revision), previous = this.revisions.get(row.scope);
      if (previous === undefined || revision > previous) {
        this.revisions.set(row.scope, revision);
        changed.add(row.scope.startsWith('user:') ? 'account' : row.scope as LiveTopic);
      }
    }
    return [...changed];
  }
}
