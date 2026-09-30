import { authenticatedFetchJson } from "./authenticatedFetch";
import { createCallMonitor } from "./callMonitor";
import { accountCallPollInterval } from "./callPolling";
import { supabase } from "./supabase";

export type AccountCall = {
  id: string; room_id: string; caller_id: string; callee_id: string;
  media: "audio" | "video";
  status: "scheduled" | "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
  secure_event_id?: string | null; encryption_envelope?: unknown;
  created_at: string; answered_at?: string | null;
  other?: { username?: string | null; full_name?: string | null } | null;
};
type Entry = { monitor: ReturnType<typeof createCallMonitor<AccountCall[]>>; users: number; resume: () => void; connect: () => () => void; disconnect?: () => void };
const monitors = new Map<string, Entry>();
function forUser(userId: string): Entry {
  let entry = monitors.get(userId);
  if (!entry) {
    let realtimeReady = false;
    let callEventsReady = false;
    const monitor = createCallMonitor(async signal => {
      try {
        const result = await authenticatedFetchJson<{ calls: AccountCall[]; callEventsReady?: boolean }>("/api/messages/calls?active=1", { signal });
        if (!signal.aborted) callEventsReady = result.callEventsReady === true;
        return result.calls;
      } catch (error) {
        callEventsReady = false;
        throw error;
      }
    }, calls => accountCallPollInterval(calls, realtimeReady && callEventsReady));
    const connect = () => {
      let stopped = false;
      let refreshTimer: ReturnType<typeof setTimeout> | undefined;
      // Atomic call revisions carry no call data. The API still authorizes
      // every snapshot, and the server enables slower polling after rollout.
      const changed = () => {
        if (stopped) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { if (!stopped) void monitor.refresh(); }, 75);
      };
      const channel = supabase.channel(`account-call-activity:${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "cp_live_revisions", filter: `scope=eq.calls:${userId}` }, changed)
        .subscribe(status => {
          if (stopped) return;
          const wasReady = realtimeReady;
          realtimeReady = status === "SUBSCRIBED";
          if (realtimeReady && !wasReady) void monitor.refresh();
          else monitor.reschedule();
        });
      return () => { stopped = true; realtimeReady = false; clearTimeout(refreshTimer); void supabase.removeChannel(channel); };
    };
    entry = { monitor, connect, users: 0, resume: () => { void monitor.refresh(); } };
    monitors.set(userId, entry);
  }
  return entry;
}
export function subscribeAccountCalls(userId: string, listener: (calls: AccountCall[]) => void) {
  const entry = forUser(userId);
  if (entry.users++ === 0) {
    window.addEventListener("online", entry.resume); window.addEventListener("focus", entry.resume);
  }
  const unsubscribe = entry.monitor.subscribe(listener);
  if (entry.users === 1) entry.disconnect = entry.connect();
  return () => {
    unsubscribe();
    if (--entry.users === 0) {
      entry.disconnect?.();
      window.removeEventListener("online", entry.resume); window.removeEventListener("focus", entry.resume);
      monitors.delete(userId);
    }
  };
}
export function refreshAccountCalls(userId: string) { void monitors.get(userId)?.monitor.refresh(); }
