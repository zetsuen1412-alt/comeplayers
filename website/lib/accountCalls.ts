import { authenticatedFetchJson } from "./authenticatedFetch";
import { createCallMonitor } from "./callMonitor";

export type AccountCall = {
  id: string; room_id: string; caller_id: string; callee_id: string;
  media: "audio" | "video";
  status: "scheduled" | "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
  secure_event_id?: string | null; encryption_envelope?: unknown;
  created_at: string; answered_at?: string | null;
  other?: { username?: string | null; full_name?: string | null } | null;
};
type Entry = { monitor: ReturnType<typeof createCallMonitor<AccountCall[]>>; users: number; resume: () => void };
const monitors = new Map<string, Entry>();
function forUser(userId: string): Entry {
  let entry = monitors.get(userId);
  if (!entry) {
    const monitor = createCallMonitor(async signal => {
      const result = await authenticatedFetchJson<{ calls: AccountCall[] }>("/api/messages/calls?active=1", { signal });
      return result.calls;
    });
    entry = { monitor, users: 0, resume: () => { void monitor.refresh(); } };
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
  return () => {
    unsubscribe();
    if (--entry.users === 0) {
      window.removeEventListener("online", entry.resume); window.removeEventListener("focus", entry.resume);
      monitors.delete(userId);
    }
  };
}
export function refreshAccountCalls(userId: string) { void monitors.get(userId)?.monitor.refresh(); }