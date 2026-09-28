"use client";

import { useEffect, useRef, useState } from "react";
import { FaLock } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { activateVerifiedDevice, prepareRecoveredDevice, type AccountSnapshot, type EnrollmentPlan } from "@/lib/e2ee/account";
import { openBrowserVault, closeBrowserVault, persistVerifiedBrowserSession } from "@/lib/e2ee/browserVault";
import { DRIVE_BACKUP_KEY_KIND, restoreBrowserBackup } from "@/lib/e2ee/browserBackup";
import { connectGoogleDrive, downloadLatestBrowserDriveBackup, driveOAuthConfigured, writeDriveBackupPreference } from "@/lib/e2ee/googleDriveBackup";
import { unlockBrowserPasskeyRecovery } from "@/lib/e2ee/browserPasskey";
import { ensureAutomaticBrowserEnrollment, retryableBrowserSetup } from "@/lib/e2ee/browserEnrollment";
import { openPasswordRecovery } from "@/lib/e2ee/passwordRecovery";
import { applyBrowserRecoveryPolicy } from "@/lib/e2ee/browserRecoveryPolicy";
import { assertLocalAccountMatch, parseRecoveryPolicy, recoveryHeaders, validateDeviceReplacement, type RecoveryPolicy } from "@/lib/e2ee/recoveryPolicy";
import { fingerprint } from "@/lib/e2ee/crypto";
import { verifyRoster, rosterHash } from "@/lib/e2ee/protocol";
import { SecureHistorySync, type SecureTransport } from "@/lib/e2ee/historySync";
import { WebMessenger, type SecureRoom } from "@/lib/e2ee/webMessenger";
import SecureConversationView from "./SecureConversationView";
import GoogleDriveAutoBackupAgent from "./GoogleDriveAutoBackupAgent";

type Setup = { kind: "recover"; snapshot: AccountSnapshot; policy: RecoveryPolicy };
const transport: SecureTransport = (path, init = {}) => authenticatedFetchJson(path, init);
async function binaryTransport(url: string, init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array }) {
  const copied = init?.body ? new Uint8Array(init.body) : undefined;
  return fetch(url, { method: init?.method || "GET", headers: init?.headers, body: copied ? new Blob([copied], { type: "application/octet-stream" }) : undefined, cache: "no-store" });
}
async function assertUser(userId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const { data } = await Promise.race([supabase.auth.getSession(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Account check timed out. Please retry.")), 8000); })]).finally(() => clearTimeout(timer));
  if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen Messages.");
  return data.session;
}
async function readAccount(userId: string) {
  await assertUser(userId);
  const response = await authenticatedFetchJson<{ account: AccountSnapshot | null; recovery?: unknown }>("/api/messages/secure/account");
  await assertUser(userId);
  if (response.account === undefined) throw new Error("Invalid secure account response. Local history was preserved.");
  const account = response.account, policy = parseRecoveryPolicy(response.recovery);
  if (account) {
    if (account.roster.identity.userId !== userId) throw new Error("The encrypted identity does not match this account.");
    verifyRoster(account.roster, account.roster.identity);
    if (rosterHash(account.roster) !== account.roster_hash) throw new Error("The device list failed verification.");
  }
  return { account, policy };
}

export default function SecureDirectConversation({ userId, room }: { userId: string; room: SecureRoom }) {
  const [client, setClient] = useState<WebMessenger | null>(null), [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState(""), [refresh, setRefresh] = useState(0);
  const [removeDeviceIds, setRemoveDeviceIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [policyGeneration, setPolicyGeneration] = useState<number | null>(null);
  const submitting = useRef(false), alive = useRef(true), currentPolicy = useRef<RecoveryPolicy | null>(null);
  const cached = useRef<{ setup: Setup; selection: string; plan: EnrollmentPlan } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true, checking = false, starting = false, retryable = false, attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1000, 3000, 10000, 30000];
    setClient(null); setSetup(null); setBusy(true); setError(""); setPassword(""); setRemoveDeviceIds([]); cached.current = null; currentPolicy.current = null;
    const start = async () => {
      if (!active || starting) return;
      starting = true; clearTimeout(retryTimer); setBusy(true); setError("");
      try {
        let { account, policy } = await readAccount(userId);
        if (!active) return;
        await applyBrowserRecoveryPolicy(userId, policy);
        if (!active) return;
        if (policy.allowDeviceSetup) {
          await ensureAutomaticBrowserEnrollment(userId, policy, transport, () => assertUser(userId));
          ({ account, policy } = await readAccount(userId));
        }
        if (!active) return;
        const vault = await openBrowserVault(userId);
        if (!active) return;
        currentPolicy.current = policy; setPolicyGeneration(policy.generation);
        if (vault) {
          assertLocalAccountMatch(vault.checkpoint.rootFingerprint, account ? fingerprint(account.roster.identity) : null, vault.checkpoint.deviceId, account?.roster.devices.map(device => device.id) ?? []);
          if (account) await vault.updateRoster(account.roster);
          if (active) setClient(new WebMessenger(vault, new SecureHistorySync(vault, transport, binaryTransport)));
        } else if (account) setSetup({ kind: "recover", snapshot: account, policy });
        else throw new Error("Automatic chat setup is temporarily unavailable. Please retry later.");
        retryable = false;
      } catch (reason) {
        if (!active) return;
        retryable = retryableBrowserSetup(reason);
        setError(reason instanceof Error ? reason.message : "Chat could not start.");
        if (retryable && attempts < delays.length) retryTimer = setTimeout(() => { void start(); }, delays[attempts++]);
      } finally { starting = false; if (active) setBusy(false); }
    };
    void start();
    const checkPolicy = async () => {
      if (!active || checking || starting || submitting.current || !currentPolicy.current || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { policy } = await readAccount(userId);
        if (active && policy.generation !== currentPolicy.current.generation) { setClient(null); setRefresh(value => value + 1); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Account status could not be refreshed."); }
      finally { checking = false; }
    };
    const visible = () => { if (document.visibilityState !== "visible") return; if (retryable) { attempts = 0; void start(); } else void checkPolicy(); };
    const timer = window.setInterval(() => { void checkPolicy(); }, 15000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) { active = false; setClient(null); setSetup(null); cached.current = null; void closeBrowserVault(userId); }
    });
    return () => { active = false; clearInterval(timer); clearTimeout(retryTimer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); data.subscription.unsubscribe(); };
  }, [userId, refresh]);
  async function activate(restoreDrive = false, usePasskey = false) {
    if (!setup || submitting.current || busy) return;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    let drive: Awaited<ReturnType<typeof connectGoogleDrive>> | null = null;
    let recoveryKey: string | null = null;
    try {
      const signedIn = await assertUser(userId);
      const accountEmail = signedIn.user.email || "";
      if (restoreDrive) drive = await connectGoogleDrive(accountEmail, true);
      const selection = `${usePasskey ? "passkey" : "password"}:${[...removeDeviceIds].sort().join(",")}`;
      let plan = restoreDrive ? null : cached.current?.setup === setup && cached.current.selection === selection ? cached.current.plan : null;
      if (!plan) {
        validateDeviceReplacement(setup.snapshot.roster.devices.map(device => device.id), removeDeviceIds);
        if (setup.snapshot.encrypted_backup.password && !usePasskey && !restoreDrive) {
          const wrapper = setup.snapshot.encrypted_backup.password;
          recoveryKey = await openPasswordRecovery(wrapper, password, setup.snapshot.roster.identity);
          plan = prepareRecoveredDevice(userId, { ...setup.snapshot, encrypted_backup: wrapper.backup }, recoveryKey, { pinnedRoot: setup.snapshot.roster.identity, removeDeviceIds });
        } else {
          const passkey = setup.snapshot.encrypted_backup.passkey;
          if (!passkey) throw new Error("Buka ComePlayers di perangkat lama untuk mengatur cadangan chat terlebih dahulu.");
          const key = await unlockBrowserPasskeyRecovery(passkey, setup.snapshot.roster.identity);
          recoveryKey = key;
          plan = prepareRecoveredDevice(userId, { ...setup.snapshot, encrypted_backup: passkey.backup }, key, { pinnedRoot: setup.snapshot.roster.identity, removeDeviceIds });
        }
        cached.current = { setup, selection, plan };
      }
      const latest = await readAccount(userId);
      if (latest.policy.generation !== setup.policy.generation) throw new Error("The recovery policy changed. Refresh before continuing.");
      const confirmed = latest.account?.roster_hash === rosterHash(plan.session.roster) && fingerprint(latest.account.roster.identity) === fingerprint(plan.session.root) && (!plan.backup?.passkey || latest.account.encrypted_backup.passkey?.signature === plan.backup.passkey.signature);
      const persist: typeof persistVerifiedBrowserSession = async (session, root) => { await assertUser(userId); if (!alive.current) throw new Error("Messages was closed. Reopen it to finish verification."); await persistVerifiedBrowserSession(session, root); };
      if (confirmed) await persist(plan.session, plan.recoveryIdentity);
      else {
        if (latest.account?.roster_hash !== setup.snapshot.roster_hash) throw new Error("The device list changed. Refresh before continuing.");
        const checked: SecureTransport = async (path, init = {}) => { await assertUser(userId); return transport(path, { ...init, headers: { ...init.headers, ...recoveryHeaders(setup.policy) } }); };
        await activateVerifiedDevice(plan, checked, persist);
      }
      if (restoreDrive && drive && recoveryKey) {
        try {
          const verifiedVault = await openBrowserVault(userId);
          if (!verifiedVault) throw new Error("Perangkat sudah diverifikasi tetapi penyimpanan lokal belum dapat dibuka.");
          const latestBackup = await downloadLatestBrowserDriveBackup(userId, verifiedVault.checkpoint.rootFingerprint, drive);
          const restored = await restoreBrowserBackup(verifiedVault, latestBackup.blob, recoveryKey);
          await verifiedVault.put(DRIVE_BACKUP_KEY_KIND, userId, recoveryKey);
          writeDriveBackupPreference(userId, {
            version: 1,
            enabled: true,
            email: drive.email,
            rootFingerprint: verifiedVault.checkpoint.rootFingerprint,
            lastBackupAt: latestBackup.file.modifiedTime,
            needsReconnect: false,
          });
          if (alive.current) setNotice(`Backup Google Drive dipulihkan: ${restored.restored} catatan ditambahkan dan ${restored.skipped} catatan yang lebih baru dipertahankan.`);
        } catch (driveError) {
          if (alive.current) setNotice(driveError instanceof Error ? `Perangkat E2EE sudah aktif. Google Drive: ${driveError.message}` : "Perangkat E2EE sudah aktif, tetapi backup Google Drive belum dapat dipulihkan.");
        }
      }
      cached.current = null; setPassword("");
      if (alive.current) setRefresh(value => value + 1);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "The account passkey could not be opened."); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  }
  if (client) return <div className="flex min-h-0 flex-1 flex-col"><GoogleDriveAutoBackupAgent userId={userId} vault={client.vault} />{notice ? <p role="status" className="border-b border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-100">{notice}</p> : null}<SecureConversationView key={`${userId}:${room.id}:${policyGeneration}`} userId={userId} room={room} messenger={client} /></div>;
  const hasPassword = Boolean(setup?.snapshot.encrypted_backup.password), hasPasskey = Boolean(setup?.snapshot.encrypted_backup.passkey);
  const devices = setup?.snapshot.roster.devices ?? [];
  const blocked = busy || (devices.length >= 8 && !removeDeviceIds.length);
  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-5"><section className="w-full max-w-xl rounded-3xl border border-yellow-400/25 bg-[#111820] p-6 shadow-2xl" aria-busy={busy}>
    <FaLock aria-hidden="true" className="text-3xl text-yellow-300" /><h2 className="mt-4 text-2xl font-black">{setup ? "Buka chat Anda" : busy ? "Menyiapkan chat…" : "Chat belum terhubung"}</h2>
    <p role="status" className="mt-3 text-base leading-7 text-slate-200">{!setup ? busy ? "Sebentar, chat akan terbuka otomatis." : "Chat belum bisa dibuka. Periksa koneksi internet, lalu coba lagi." : hasPassword ? "Masukkan sandi cadangan yang pernah Anda buat untuk membuka chat di perangkat ini." : hasPasskey ? "Chat Anda sudah tersimpan. Gunakan kunci sandi yang sebelumnya Anda simpan untuk membuka chat di perangkat ini." : "Chat Anda sudah aktif di perangkat lain. Di browser lama, buka salah satu chat → Info percakapan (⋯) → Cadangan chat (opsional). Di aplikasi ponsel lama, pilih Profil → Chat & cadangan. Buat sandi cadangan di sana agar akun chat yang sama dapat dibuka di sini. Riwayat Anda tetap disimpan."}</p>
    {devices.length >= 8 ? <div className="mt-4 space-y-3 rounded-xl border border-amber-400/25 p-3 text-sm"><p>Pilih perangkat lama yang akan diganti. Batas akun adalah delapan perangkat.</p>{devices.map((device, index) => <label key={device.id} className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={removeDeviceIds.includes(device.id)} onChange={event => setRemoveDeviceIds(current => event.target.checked ? [...current, device.id] : current.filter(id => id !== device.id))} />Perangkat {index + 1} · {new Date(device.createdAt).toLocaleDateString()}</label>)}</div> : null}
    {hasPassword ? <form className="mt-5 grid gap-3" onSubmit={event => { event.preventDefault(); void activate(); }}><label className="text-base font-semibold" htmlFor={`chat-backup-${room.id}`}>Sandi cadangan chat</label><input id={`chat-backup-${room.id}`} type="password" autoComplete="current-password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} className="min-h-12 rounded-xl border border-white/20 bg-black/30 px-4 text-base" /><button disabled={blocked || !password} className="min-h-12 rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black disabled:opacity-40">{busy ? "Membuka chat…" : "Buka chat"}</button></form> : null}
    {hasPasskey ? <div className="mt-5 grid gap-3"><button type="button" disabled={blocked} onClick={() => void activate(false, true)} className="min-h-12 rounded-xl bg-yellow-400 px-4 py-3 font-bold text-black disabled:opacity-40">{busy ? "Membuka chat…" : hasPassword ? "Gunakan kunci sandi yang tersimpan" : "Buka chat"}</button>{driveOAuthConfigured() ? <details className="text-sm text-slate-300"><summary className="cursor-pointer py-3">Pilihan cadangan Google Drive</summary><button type="button" disabled={blocked} onClick={() => void activate(true, true)} className="min-h-12 rounded-xl border border-white/20 px-4 py-3 font-bold disabled:opacity-40">Pulihkan cadangan Google Drive</button></details> : null}</div> : null}
    {error ? <div role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-base text-red-200"><p>{error.startsWith("Sandi cadangan") ? error : "Belum berhasil membuka chat. Data Anda tetap disimpan. Silakan coba lagi."}</p><details className="mt-2 text-xs"><summary className="cursor-pointer py-2">Detail untuk bantuan</summary>{error}</details></div> : null}
    {!busy ? <button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-4 min-h-12 rounded-xl border border-white/20 px-5 py-3 text-base font-semibold text-yellow-200">Coba lagi</button> : null}
  </section></div>;
}
