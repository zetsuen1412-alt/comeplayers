type Session = { access_token: string };
type SessionState = { active: boolean; claimed: boolean; enabled?: true } | { enabled: false };

/** Claims by the Auth session's creation time, never by a refresh-token timestamp. */
export function accountSessionMonitor(options: {
  session: () => Promise<Session | null>;
  request: (token: string, method: "GET" | "POST") => Promise<SessionState | null>;
  replaced: () => Promise<void>;
  visible: () => boolean;
}) {
  let stopped = false, busy = false, disabled = false;
  async function check(force = false) {
    if (stopped || busy || (disabled && !force) || !options.visible()) return;
    busy = true;
    try {
      const session = await options.session();
      if (!session || stopped) return;
      let state = await options.request(session.access_token, "GET");
      if (stopped || !state) return;
      if (state.enabled === false) { disabled = true; return; }
      disabled = false;
      if (typeof state.active !== "boolean" || typeof state.claimed !== "boolean") return;
      if (!state.claimed) state = await options.request(session.access_token, "POST");
      if (stopped || !state || state.enabled === false || state.active !== false) return;
      // A pending response for a previous login must never sign out a newer login.
      const current = await options.session();
      if (current?.access_token === session.access_token && !stopped) await options.replaced();
    } catch { /* A network failure is not evidence that a session was replaced. */ }
    finally { busy = false; }
  }
  const timer = setInterval(() => void check(), 10000);
  return { check, stop() { stopped = true; clearInterval(timer); } };
}
