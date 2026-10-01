'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { publishLiveChanges, setLiveConnection } from '@/lib/live/events';
import { RevisionTracker, createRefreshQueue, type LiveRevision, type LiveTopic } from '@/lib/live/refresh-queue';
import { useLiveRefresh } from '@/lib/live/use-live-refresh';
import { shouldRefreshServerCatalog } from '@/lib/live/routeRefresh';

/** One metadata subscription per tab. Business data still uses its authorized API. */
export default function LiveUpdates() {
  const router = useRouter();
  const pathname = usePathname();
  // Server-rendered catalog pages also need fresh server components. Client forms
  // keep their React state; client data loaders subscribe separately below.
  useLiveRefresh(() => router.refresh(), {
    topics: 'catalog,account',
    enabled: shouldRefreshServerCatalog(pathname),
  });
  useEffect(() => {
    let stopped = false, generation = 0, identity: string | null | undefined;
    let tracker = new RevisionTracker();
    let reconcile = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const poll = createRefreshQueue(async () => {
      const started = generation;
      const force = reconcile; reconcile = false;
      const scopes = ['catalog', 'admin', 'payroll', ...(identity ? [`user:${identity}`] : [])];
      const { data, error } = await supabase.from('cp_live_revisions').select('scope,revision').in('scope', scopes);
      if (stopped || started !== generation) return;
      if (error) { reconcile = true; throw error; }
      const rows = (data ?? []) as LiveRevision[];
      const changed = tracker.accept(rows);
      // Reconnect/focus also recovers a failed page read even if its revision is unchanged.
      publishLiveChanges(force ? [...new Set(rows.map(row => row.scope.startsWith('user:') ? 'account' : row.scope as LiveTopic))] : changed);
    }, () => document.visibilityState === 'visible' && navigator.onLine);

    function connect(userId: string | null) {
      if (stopped || userId === identity) return;
      identity = userId; const started = ++generation; tracker = new RevisionTracker();
      setLiveConnection(navigator.onLine ? 'connecting' : 'offline');
      if (channel) void supabase.removeChannel(channel);
      channel = supabase.channel(`site-live:${userId ?? 'public'}:${started}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cp_live_revisions' }, payload => {
          if (stopped || started !== generation) return;
          // RLS filters the scope. No order, payroll, or account payload is broadcast.
          publishLiveChanges(tracker.accept([payload.new as LiveRevision]));
        })
        .subscribe(status => {
          if (stopped || started !== generation) return;
          setLiveConnection(!navigator.onLine ? 'offline' : status === 'SUBSCRIBED' ? 'live' : 'reconnecting');
          if (status === 'SUBSCRIBED') { reconcile = true; poll.request(); }
        });
      poll.request();
    }
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      // Do not await another Supabase request inside the auth callback.
      queueMicrotask(() => connect(session?.user.id ?? null));
    });
    void supabase.auth.getSession().then(({ data }) => connect(data.session?.user.id ?? null));
    const resume = () => { if (document.visibilityState === 'visible') { reconcile = true; poll.request(); } };
    const offline = () => setLiveConnection('offline');
    const interval = setInterval(() => poll.request(), 30_000);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true; generation++; poll.dispose(); auth.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener('online', resume); window.removeEventListener('focus', resume);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  return null;
}
