import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { fetchRecoveryAccount, prepareFirstDevice } from "./accountRecovery";
import { mobileSecureBinaryTransport, mobileSecureTransport } from "./mobileSecureTransport";
import { SecureHistorySync } from "./secureHistorySync";
import { SecureMessengerV2 } from "./secureMessengerV2";
import { openVerifiedVault } from "./verifiedVault";
import { SecureDeviceSetup } from "./SecureDeviceSetup";
import { cleanPrivatePreviewCache } from "./mediaStore";
import type { SecureSetup } from "./secureSetup";

const Context = createContext<{ messenger: SecureMessengerV2 | null; error: string; reopen: () => void }>({ messenger: null, error: "", reopen: () => undefined });
export const usePrivateMessenger = () => useContext(Context);

export function PrivateProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const [messenger, setMessenger] = useState<SecureMessengerV2 | null>(null), [error, setError] = useState("");
  const [setup, setSetup] = useState<SecureSetup | null>(null), [generation, setGeneration] = useState(0);
  const reopen = useCallback(() => setGeneration(value => value + 1), []);
  useEffect(() => {
    if (!enabled) { setMessenger(null); setSetup(null); return; }
    let alive = true, client: SecureMessengerV2 | null = null;
    setMessenger(null); setSetup(null); setError("");
    void (async () => {
      cleanPrivatePreviewCache();
      const vault = await openVerifiedVault(userId);
      if (vault) {
        client = new SecureMessengerV2(vault, new SecureHistorySync(vault, mobileSecureTransport, mobileSecureBinaryTransport));
        if (alive) { setMessenger(client); void client.sync().catch(() => undefined); }
        return;
      }
      const snapshot = await fetchRecoveryAccount(mobileSecureTransport);
      if (!alive) return;
      if (snapshot) setSetup({ kind: "recover", snapshot });
      else { const prepared = prepareFirstDevice(userId); setSetup({ kind: "new", recoveryKey: prepared.recoveryKey, plan: prepared.plan }); }
    })().catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "Encrypted Messages could not start."); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void client?.sync().catch(() => undefined); }, 10000);
    const listener = AppState.addEventListener("change", next => { if (next === "active") void client?.sync().catch(() => undefined); });
    return () => { alive = false; clearInterval(timer); listener.remove(); void client?.pause(); };
  }, [userId, enabled, generation]);
  const value = useMemo(() => ({ messenger, error, reopen }), [messenger, error, reopen]);
  const setupKey = setup?.kind === "new" ? setup.plan.session.device.id : setup?.kind === "recover" ? setup.snapshot.roster_hash : `loading-${generation}`;
  return <Context.Provider value={value}>{children}{enabled && !messenger ? <SecureDeviceSetup key={setupKey} userId={userId} setup={setup} error={error} onActivated={reopen} onRetry={reopen} /> : null}</Context.Provider>;
}
