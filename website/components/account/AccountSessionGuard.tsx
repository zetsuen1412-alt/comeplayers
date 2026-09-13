"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { accountSessionMonitor } from "@/lib/auth/accountSessionMonitor";

export default function AccountSessionGuard() {
  useEffect(() => {
    const monitor = accountSessionMonitor({
      session: async () => (await supabase.auth.getSession()).data.session,
      visible: () => document.visibilityState === "visible",
      request: async (token, method) => {
        const response = await fetch("/api/account/session", { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (response.status === 401) return { active: false, claimed: true };
        return response.ok ? response.json() : null;
      },
      replaced: async () => {
        await supabase.auth.signOut({ scope: "local" });
        window.location.assign("/?session=replaced");
      },
    });
    const check = () => { void monitor.check(true); };
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(check, 0));
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    check();
    return () => { monitor.stop(); data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", check); window.removeEventListener("online", check); };
  }, []);
  return null;
}
