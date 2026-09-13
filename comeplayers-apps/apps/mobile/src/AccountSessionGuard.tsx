import { useEffect } from "react";
import { AppState, Alert } from "react-native";
import { accountSessionMonitor } from "./accountSessionMonitor";
import { apiUrl, supabase } from "./runtime";

export function AccountSessionGuard() {
  useEffect(() => {
    const monitor = accountSessionMonitor({
      session: async () => (await supabase.auth.getSession()).data.session,
      visible: () => AppState.currentState === "active",
      request: async (token, method) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(`${apiUrl}/api/account/session`, { method, headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
          if (response.status === 401) return { active: false, claimed: true };
          return response.ok ? response.json() : null;
        } finally { clearTimeout(timer); }
      },
      replaced: async () => {
        await supabase.auth.signOut({ scope: "local" });
        Alert.alert("Signed out", "Your account was signed in on another device. Sign in again to use ComePlayers here.");
      },
    });
    const check = () => { void monitor.check(true); };
    const listener = AppState.addEventListener("change", check);
    const { data } = supabase.auth.onAuthStateChange(() => setTimeout(check, 0));
    check();
    return () => { monitor.stop(); listener.remove(); data.subscription.unsubscribe(); };
  }, []);
  return null;
}
