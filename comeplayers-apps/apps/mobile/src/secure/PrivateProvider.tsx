import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { type AccountSnapshot, type VerifiedSession } from "./accountRecovery";
import { mobileSecureBinaryTransport, mobileSecureTransport } from "./mobileSecureTransport";
import { SecureHistorySync } from "./secureHistorySync";
import { SecureMessengerV2 } from "./secureMessengerV2";
import { openVerifiedVault } from "./verifiedVault";
import { cleanPrivatePreviewCache } from "./mediaStore";
import { applyNativeRecoveryPolicy } from "./nativeRecoveryPolicy";
import { assertLocalAccountMatch, parseRecoveryPolicy } from "./recoveryPolicy";
import { fingerprint } from "./crypto";
import { verifyRoster, rosterHash } from "./multiDevice";
import { supabase } from "../runtime";
import { ensureAutomaticEnrollment } from "./automaticEnrollment";
import type { SecureSetup } from "./secureSetup";
import { maybeRunAutomaticDriveBackup } from "./driveBackupPreference";

const Context = createContext<{ messenger: SecureMessengerV2 | null; setup: SecureSetup | null; error: string; reopen: () => void }>({ messenger: null, setup: null, error: "", reopen: () => undefined });
export const usePrivateMessenger = () => useContext(Context);
const STARTUP_RETRY_DELAYS = [1000, 3000, 10000, 30000];
function isTemporaryConnectionError(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : "";
  // Retry transport failures only. Auth, recovery and integrity failures must not
  // manufacture another identity or keep opening an account-recovery flow.
  return /connection (?:timed out|lost|reset|failed)|network request failed|failed to fetch|fetch failed|networkerror|network (?:is )?(?:unavailable|offline|disconnected)|request failed \((?:408|425|429|5\d\d)\)|service unavailable|bad gateway|gateway timeout/i.test(message);
}

export function PrivateProvider({ userId, enabled, children }: { userId: string; enabled: boolean; children: ReactNode }) {
  const [messenger, setMessenger] = useState<SecureMessengerV2 | null>(null), [error, setError] = useState("");
  const [setup, setSetup] = useState<SecureSetup | null>(null), [generation, setGeneration] = useState(0);
  const runtime = useRef<SecureMessengerV2 | null>(null), queue = useRef<Promise<unknown>>(Promise.resolve());
  const reopen = useCallback(() => { setGeneration(value => value + 1); }, []);
  useEffect(() => {
    let alive = true, client: SecureMessengerV2 | null = null, checking = false, policyGeneration: number | null = null;
    let starting = false, startupFinished = false, retryableStartup = false, retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStartupRetry = () => { if (retryTimer !== null) clearTimeout(retryTimer); retryTimer = null; };
    setMessenger(null); setSetup(null); setError("");
    const start = async () => {
      await runtime.current?.pause(); runtime.current = null;
      if (!enabled || !alive) return;
      setError("");
      const response = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
      const { data } = await supabase.auth.getSession();
      if (!alive || data.session?.user.id !== userId) return;
      if (response.account === undefined) throw new Error("Invalid secure account response. Local history was preserved.");
      const policy = parseRecoveryPolicy(response.recovery);
      let snapshot = response.account;
      if (snapshot) {
        if (snapshot.roster.identity.userId !== userId) throw new Error("The encrypted account does not match this login.");
        verifyRoster(snapshot.roster, snapshot.roster.identity);
        if (rosterHash(snapshot.roster) !== snapshot.roster_hash) throw new Error("The device list failed verification.");
      }
      await applyNativeRecoveryPolicy(userId, policy);
      if (!alive) return;
      policyGeneration = policy.generation;
      cleanPrivatePreviewCache();
      let vault = await openVerifiedVault(userId);
      if (!vault && policy.allowDeviceSetup) {
        await ensureAutomaticEnrollment(userId, policy);
        if (!alive) return;
        vault = await openVerifiedVault(userId);
        const latest = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
        if (parseRecoveryPolicy(latest.recovery).generation !== policy.generation) throw new Error("The recovery policy changed. Refresh before continuing.");
        if (latest.account === undefined) throw new Error("Invalid secure account response.");
        snapshot = latest.account;
        if (snapshot) {
          verifyRoster(snapshot.roster, snapshot.roster.identity);
          if (snapshot.roster.identity.userId !== userId || rosterHash(snapshot.roster) !== snapshot.roster_hash) throw new Error("Invalid account recovery checkpoint.");
        }
      }
      if (!alive) return;
      if (vault) {
        const local = await vault.get<VerifiedSession["roster"]>("account-roster", userId);
        if (!local) throw new Error("The local account checkpoint is missing.");
        assertLocalAccountMatch(fingerprint(local.identity), snapshot ? fingerprint(snapshot.roster.identity) : null, vault.descriptor.deviceId, snapshot?.roster.devices.map(device => device.id) ?? []);
        client = new SecureMessengerV2(vault, new SecureHistorySync(vault, mobileSecureTransport, mobileSecureBinaryTransport));
        runtime.current = client;
        if (alive) { setMessenger(client); void client.sync().catch(reason => { if (alive) setError(reason instanceof Error ? reason.message : "Encrypted synchronization failed."); }); void maybeRunAutomaticDriveBackup(userId); }
      } else if (snapshot) setSetup({ kind: "recover", snapshot, policy });
      else throw new Error("Automatic chat setup is not available yet. Please update ComePlayers and try again.");
      startupFinished = true; retryableStartup = false;
    };
    const runStartup = () => {
      if (!alive || !enabled || starting || startupFinished) return;
      clearStartupRetry(); starting = true;
      const task = queue.current.catch(() => undefined).then(start);
      queue.current = task;
      void task.then(() => { starting = false; }, reason => {
        starting = false;
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "Encrypted Messages could not start.");
        retryableStartup = isTemporaryConnectionError(reason);
        if (retryableStartup && retries < STARTUP_RETRY_DELAYS.length) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (AppState.currentState === "active") runStartup();
          }, STARTUP_RETRY_DELAYS[retries++]);
        }
      });
    };
    runStartup();
    const refresh = async () => {
      if (!alive || !enabled || checking || !startupFinished || AppState.currentState !== "active" || policyGeneration === null) return;
      checking = true;
      try {
        const response = await mobileSecureTransport<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
        const next = parseRecoveryPolicy(response.recovery);
        if (!alive) return;
        if (next.generation !== policyGeneration) { setMessenger(null); reopen(); return; }
        await client?.sync();
        if (alive && client) setError("");
      } catch (reason) { if (alive) setError(reason instanceof Error ? reason.message : "Encrypted synchronization failed."); }
      finally { checking = false; }
    };
    const timer = setInterval(() => { void refresh(); }, 10000);
    const backupTimer = setInterval(() => { if (AppState.currentState === "active") void maybeRunAutomaticDriveBackup(userId); }, 15 * 60 * 1000);
    const listener = AppState.addEventListener("change", next => {
      if (next === "active") {
        // A fresh foreground session can resume an offline/lost-response setup.
        // ensureAutomaticEnrollment reuses the protected enrollment journal.
        if (!startupFinished && retryableStartup) { retries = 0; runStartup(); }
        void refresh(); void maybeRunAutomaticDriveBackup(userId);
      }
    });
    return () => { alive = false; clearStartupRetry(); clearInterval(timer); clearInterval(backupTimer); listener.remove(); void client?.pause(); };
  }, [userId, enabled, generation, reopen]);
  const value = useMemo(() => ({ messenger, setup, error, reopen }), [messenger, setup, error, reopen]);
  // Setup belongs to the private conversation/settings that need it. Never cover
  // the inbox, community or other tabs with an automatic onboarding modal.
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
