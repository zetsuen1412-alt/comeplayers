"use client";

import { useEffect, useRef, useState } from "react";
import { FaLock } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { activateVerifiedDevice, prepareFirstDevice, prepareRecoveredDevice, type AccountSnapshot, type EnrollmentPlan } from "@/lib/e2ee/account";
import { openBrowserVault, closeBrowserVault, persistVerifiedBrowserSession } from "@/lib/e2ee/browserVault";
import { createBrowserPasskeyRecovery, unlockBrowserPasskeyRecovery } from "@/lib/e2ee/browserPasskey";
import { applyBrowserRecoveryPolicy } from "@/lib/e2ee/browserRecoveryPolicy";
import { assertLocalAccountMatch, parseRecoveryPolicy, recoveryHeaders, validateDeviceReplacement, type RecoveryPolicy } from "@/lib/e2ee/recoveryPolicy";
import { fingerprint } from "@/lib/e2ee/crypto";
import { verifyRoster, rosterHash } from "@/lib/e2ee/protocol";
import { SecureHistorySync, type SecureTransport } from "@/lib/e2ee/historySync";
import { WebMessenger, type SecureRoom } from "@/lib/e2ee/webMessenger";
import SecureConversationView from "./SecureConversationView";

type Setup = ({ kind: "new"; plan: EnrollmentPlan } | { kind: "recover"; snapshot: AccountSnapshot }) & { policy: RecoveryPolicy };
const transport: SecureTransport = (path, init = {}) => authenticatedFetchJson(path, init);
async function binaryTransport(url: string, init?: { method?: string; headers?: Record<string, string>; body?: Uint8Array }) {
  const copied = init?.body ? new Uint8Array(init.body) : undefined;
  return fetch(url, { method: init?.method || "GET", headers: init?.headers, body: copied ? new Blob([copied], { type: "application/octet-stream" }) : undefined, cache: "no-store" });
}
async function assertUser(userId: string) {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error("The signed-in account changed. Reopen Messages.");
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
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [removeDeviceIds, setRemoveDeviceIds] = useState<string[]>([]);
  const submitting = useRef(false), alive = useRef(true), currentPolicy = useRef<RecoveryPolicy | null>(null);
  const cached = useRef<{ setup: Setup; selection: string; plan: EnrollmentPlan } | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true, checking = false;
    setClient(null); setSetup(null); setBusy(true); setError(""); setRemoveDeviceIds([]); cached.current = null;
    void (async () => {
      const { account, policy } = await readAccount(userId);
      if (!active) return;
      await applyBrowserRecoveryPolicy(userId, policy);
      if (!active) return;
      const vault = await openBrowserVault(userId);
      if (!active) return;
      currentPolicy.current = policy;
      if (vault) {
        assertLocalAccountMatch(vault.checkpoint.rootFingerprint, account ? fingerprint(account.roster.identity) : null, vault.checkpoint.deviceId, account?.roster.devices.map(device => device.id) ?? []);
        if (account) await vault.updateRoster(account.roster);
        if (active) setClient(new WebMessenger(vault, new SecureHistorySync(vault, transport, binaryTransport)));
      } else if (account) setSetup({ kind: "recover", snapshot: account, policy });
      else setSetup({ kind: "new", plan: prepareFirstDevice(userId).plan, policy });
    })().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Encrypted Messages could not start."); }).finally(() => { if (active) setBusy(false); });
    const checkPolicy = async () => {
      if (!active || checking || submitting.current || !currentPolicy.current || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const { policy } = await readAccount(userId);
        if (active && policy.generation !== currentPolicy.current.generation) { setClient(null); setRefresh(value => value + 1); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Account status could not be refreshed."); }
      finally { checking = false; }
    };
    const visible = () => { void checkPolicy(); };
    const timer = window.setInterval(visible, 15000);
    document.addEventListener("visibilitychange", visible);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) { active = false; setClient(null); setSetup(null); cached.current = null; void closeBrowserVault(userId); }
    });
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", visible); data.subscription.unsubscribe(); };
  }, [userId, refresh]);
  async function activate() {
    if (!setup || submitting.current || busy) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      await assertUser(userId);
      const selection = [...removeDeviceIds].sort().join(",");
      let plan = cached.current?.setup === setup && cached.current.selection === selection ? cached.current.plan : null;
      if (!plan) {
        if (setup.kind === "new") {
          if (!setup.plan.backup) throw new Error("The client-encrypted backup is missing.");
          const passkey = await createBrowserPasskeyRecovery(setup.plan.recoveryIdentity);
          plan = { ...setup.plan, backup: { ...setup.plan.backup, passkey } };
        } else {
          const passkey = setup.snapshot.encrypted_backup.passkey;
          if (!passkey) throw new Error("The approved account reset has not been applied yet. Refresh after the new release is active.");
          validateDeviceReplacement(setup.snapshot.roster.devices.map(device => device.id), removeDeviceIds);
          const key = await unlockBrowserPasskeyRecovery(passkey, setup.snapshot.roster.identity);
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
        if (setup.kind === "new" ? latest.account !== null : latest.account?.roster_hash !== setup.snapshot.roster_hash) throw new Error("The device list changed. Refresh before continuing.");
        const checked: SecureTransport = async (path, init = {}) => { await assertUser(userId); return transport(path, { ...init, headers: { ...init.headers, ...recoveryHeaders(setup.policy) } }); };
        await activateVerifiedDevice(plan, checked, persist);
      }
      cached.current = null;
      if (alive.current) setRefresh(value => value + 1);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "The account passkey could not be opened."); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  }
  if (client) return <SecureConversationView key={`${userId}:${room.id}:${currentPolicy.current?.generation}`} userId={userId} room={room} messenger={client} />;
  const recoverable = setup?.kind === "new" || (setup?.kind === "recover" && Boolean(setup.snapshot.encrypted_backup.passkey));
  const devices = setup?.kind === "recover" ? setup.snapshot.roster.devices : [];
  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-5"><section className="w-full max-w-xl rounded-3xl border border-cyan-400/30 bg-[#071722] p-6 shadow-2xl">
    <FaLock className="text-4xl text-cyan-300" /><h2 className="mt-4 text-2xl font-black">Messages terlindungi akun</h2>
    <p className="mt-3 text-sm leading-6 text-slate-300">{!setup ? "Memeriksa akun terenkripsi…" : setup.kind === "new" ? "Simpan passkey di pengelola sandi tersinkron. Saat pindah perangkat, login akun ComePlayers lalu konfirmasi sidik jari atau PIN perangkat. Tidak perlu kode recovery." : recoverable ? "Anda sudah login. Buka passkey akun yang sama untuk memulihkan riwayat terenkripsi di perangkat ini." : "Akun ini masih menggunakan metode lama. Reset yang disetujui belum diterapkan. Segarkan setelah rilis baru aktif; akun login dan data bisnis tetap dipertahankan."}</p>
    {devices.length >= 8 ? <div className="mt-4 space-y-3 rounded-xl border border-amber-400/25 p-3 text-sm"><p>Pilih perangkat lama yang akan diganti. Batas akun adalah delapan perangkat.</p>{devices.map((device, index) => <label key={device.id} className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={removeDeviceIds.includes(device.id)} onChange={event => setRemoveDeviceIds(current => event.target.checked ? [...current, device.id] : current.filter(id => id !== device.id))} />Perangkat {index + 1} · {new Date(device.createdAt).toLocaleDateString()}</label>)}</div> : null}
    {recoverable ? <button type="button" disabled={busy || (devices.length >= 8 && !removeDeviceIds.length)} onClick={() => void activate()} className="mt-5 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-black disabled:opacity-40">{busy ? "Memproses…" : setup?.kind === "new" ? "Lindungi dengan passkey akun" : "Lanjutkan dengan passkey akun"}</button> : null}
    {error ? <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}
    <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)} className="mt-4 text-sm text-cyan-200 disabled:opacity-40">Segarkan status akun</button>
    <p className="mt-4 text-xs leading-5 text-slate-400">ComePlayers hanya menyimpan data terenkripsi, bukan kunci pembukanya. Gunakan pengelola sandi tersinkron yang sama. Dukungan passkey diperlukan; login Google/email saja tidak menggantikan kunci enkripsi.</p>
  </section></div>;
}
