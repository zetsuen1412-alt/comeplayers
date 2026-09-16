"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import type { AccountSnapshot } from "@/lib/e2ee/account";
import type { Identity } from "@/lib/e2ee/crypto";

export default function PasskeyRecoverySettings() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function enable() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Login ke ComePlayers terlebih dahulu.");
      const userId = data.session.user.id;
      const [{ createBrowserPasskeyRecovery }, { openBrowserVault }, { proveDeviceRequest }] = await Promise.all([
        import("@/lib/e2ee/browserPasskey"), import("@/lib/e2ee/browserVault"), import("@/lib/e2ee/protocol"),
      ]);
      const vault = await openBrowserVault(userId);
      const root = await vault?.get<Identity>("root-recovery-v2", userId);
      if (!vault || !root) throw new Error("Open Messages to finish passkey setup or recovery, then return here. If this account has no synced passkey yet, use a device with verified chat history.");
      const { account } = await authenticatedFetchJson<{ account: AccountSnapshot | null }>("/api/messages/secure/account");
      if (!account) throw new Error("Aktifkan Messages terenkripsi terlebih dahulu.");
      if (account.encrypted_backup.passkey) { setMessage("Pemulihan passkey sudah aktif. Gunakan passkey yang sama saat login di perangkat baru."); return; }
      const { device } = await vault.session();
      const passkey = await createBrowserPasskeyRecovery(root);
      const path = "/api/messages/secure/account/passkey", body = JSON.stringify({ passkey });
      const proof = proveDeviceRequest(device, "POST", path, body);
      const result = await authenticatedFetchJson<{ passkeySignature: string }>(path, { method: "POST", body, headers: {
        "x-cp-device": proof.deviceId, "x-cp-time": proof.timestamp, "x-cp-nonce": proof.nonce, "x-cp-proof": proof.signature,
      } });
      if (result.passkeySignature !== passkey.signature) throw new Error("Penyimpanan cadangan belum terkonfirmasi. Coba lagi.");
      setMessage("Pemulihan passkey aktif. Login di perangkat baru lalu buka passkey yang tersinkron untuk memulihkan Messages.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Passkey belum dapat diaktifkan."); }
    finally { setBusy(false); }
  }
  return <section className="border-b border-white/10 p-6 md:p-8">
    <h2 className="text-xl font-black">Pemulihan Messages melalui akun</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Simpan passkey di pengelola sandi tersinkron. Setelah login di perangkat baru, gunakan sidik jari atau PIN perangkat untuk membuka kunci dan memulihkan chat terenkripsi.</p>
    <button type="button" disabled={busy} onClick={() => void enable()} className="mt-4 rounded-xl bg-amber-300 px-5 py-3 font-bold text-black disabled:opacity-40">{busy ? "Menyiapkan passkey…" : "Aktifkan pemulihan passkey"}</button>
    {message ? <p role="status" className="mt-4 text-sm text-amber-200">{message}</p> : null}
    <p className="mt-3 text-xs leading-5 text-slate-400">ComePlayers hanya menyimpan cadangan terenkripsi. Recovery key lama tetap berlaku untuk cadangan file yang telah diekspor.</p>
  </section>;
}
