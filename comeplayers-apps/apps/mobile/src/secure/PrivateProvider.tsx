import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { prepareFirstDevice, type AccountSnapshot, type VerifiedSession } from "./accountRecovery";
import { mobileSecureBinaryTransport, mobileSecureTransport } from "./mobileSecureTransport";
import { SecureHistorySync } from "./secureHistorySync";
import { SecureMessengerV2 } from "./secureMessengerV2";
import { openVerifiedVault } from "./verifiedVault";
import { SecureDeviceSetup } from "./SecureDeviceSetup";
import { cleanPrivatePreviewCache } from "./mediaStore";
import { applyNativeRecoveryPolicy } from "./nativeRecoveryPolicy";
import { assertLocalAccountMatch, parseRecoveryPolicy } from "./recoveryPolicy";
import { fingerprint } from "./crypto";
import { verifyRoster, rosterHash } from "./multiDevice";
import { supabase } from "../runtime";
import type { SecureSetup } from "./secureSetup";
import { maybeRunAutomaticDriveBackup } from "./driveBackupPreference";

const Context = createContext<{ messenger: SecureMessengerV2 | null; error: string; reopen: () => void }>({ messenger: null, error: "", reopen: () => undefined });
export const usePrivateMessenger = () => useContext(Context);

export function PrivateProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const [messenger, setMessenger] = useState<SecureMessengerV2 | null>(null), [error, setError] = useState("");
  const [setup, setSetup] = useState<SecureSetup | null>(null), [generation, setGeneration] = useState(0), [dismissed, setDismissed] = useState(false);
  const runtime = useRef<SecureMessengerV2 | null>(null), queue = useRef<Promise<unknown>>(Promise.resolve());
  const reopen = useCallback(() => { setDismissed(false); setGeneration(value => value + 1); }, []);
  useEffect(() => {
    let alive = true, client: SecureMessengerV2 | null = null, checking = false, policyGeneration: number | null = null;
    setMessenger(null); setSetup(null); setError("");
    const start = async () => {
      await runtime.current?.pause(); runtime.current = null;
      if (!enabled || !alive) return;
      const response = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
      const { data } = await supabase.auth.getSession();
      if (!alive || data.session?.user.id !== userId) return;
      if (response.account === undefined) throw new Error("Invalid secure account response. Local history was preserved.");
      const policy = parseRecoveryPolicy(response.recovery), snapshot = response.account;
      if (snapshot) {
        if (snapshot.roster.identity.userId !== userId) throw new Error("The encrypted account does not match this login.");
        verifyRoster(snapshot.roster, snapshot.roster.identity);
        if (rosterHash(snapshot.roster) !== snapshot.roster_hash) throw new Error("The device list failed verification.");
      }
      await applyNativeRecoveryPolicy(userId, policy);
      if (!alive) return;
      policyGeneration = policy.generation;
      cleanPrivatePreviewCache();
      const vault = await openVerifiedVault(userId);
      if (!alive) return;
      if (vault) {
        const local = await vault.get<VerifiedSession["roster"]>("account-roster", userId);
        if (!local) throw new Error("The local account checkpoint is missing.");
        assertLocalAccountMatch(fingerprint(local.identity), snapshot ? fingerprint(snapshot.roster.identity) : null, vault.descriptor.deviceId, snapshot?.roster.devices.map(device => device.id) ?? []);
        client = new SecureMessengerV2(vault, new SecureHistorySync(vault, mobileSecureTransport, mobileSecureBinaryTransport));
        runtime.current = client;
        if (alive) { setMessenger(client); void client.sync().catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "Encrypted synchronization failed."); }); void maybeRunAutomaticDriveBackup(userId); }
      } else if (snapshot) setSetup({ kind: "recover", snapshot, policy });
      else { const prepared = prepareFirstDevice(userId); setSetup({ kind: "new", ...prepared, policy }); }
    };
    const task = queue.current.catch(() => undefined).then(start);
    queue.current = task;
    void task.catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "Encrypted Messages could not start."); });
    const refresh = async () => {
      if (!alive || !enabled || checking || AppState.currentState !== "active" || policyGeneration === null) return;
      checking = true;
      try {
        const response = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
        const next = parseRecoveryPolicy(response.recovery);
        if (!alive) return;
        if (next.generation !== policyGeneration) { setMessenger(null); reopen(); return; }
        await client?.sync();
      } catch (reason) { if (alive) setError(reason instanceof Error ? reason.message : "Encrypted synchronization failed."); }
      finally { checking = false; }
    };
    const timer = setInterval(() => { void refresh(); }, 10000);
    const backupTimer = setInterval(() => { if (AppState.currentState === "active") void maybeRunAutomaticDriveBackup(userId); }, 15 * 60 * 1000);
    const listener = AppState.addEventListener("change", next => { if (next === "active") { void refresh(); void maybeRunAutomaticDriveBackup(userId); } });
    return () => { alive = false; clearInterval(timer); clearInterval(backupTimer); listener.remove(); void client?.pause(); };
  }, [userId, enabled, generation, reopen]);
  const value = useMemo(() => ({ messenger, error: error || (dismissed && !messenger ? "Encrypted Messages are locked. Reopen account verification to continue." : ""), reopen }), [messenger, error, reopen, dismissed]);
  const setupKey = setup?.kind === "new" ? setup.plan.session.device.id : setup?.kind === "recover" ? setup.snapshot.roster_hash : `loading-${generation}`;
  return <Context.Provider value={value}>{children}{enabled && !messenger && !dismissed ? <SecureDeviceSetup key={setupKey} userId={userId} setup={setup} error={error} onActivated={reopen} onRetry={reopen} onDismiss={() => setDismissed(true)} /> : null}</Context.Provider>;
}
