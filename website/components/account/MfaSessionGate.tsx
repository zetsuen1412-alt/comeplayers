"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function MfaSessionGate() {
  const [required, setRequired] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const check = async () => { const { data: session } = await supabase.auth.getSession(); if (!session.session) { if (active) setRequired(false); return; } const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if (active) setRequired(data?.nextLevel === "aal2" && data.currentLevel !== "aal2"); };
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void check(); }, 0); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (!required) return null;
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-5" role="dialog" aria-modal="true" aria-labelledby="mfa-session-title"><form className="w-full max-w-md space-y-5 rounded-3xl border border-white/15 bg-slate-900 p-7" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const { data, error: listError } = await supabase.auth.mfa.listFactors(); if (listError) throw listError; if (!data.totp[0]) throw new Error("Authenticator not found. Sign in again."); const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: data.totp[0].id, code }); if (verifyError) throw verifyError; setRequired(false); setCode(""); window.location.reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Verification failed."); } finally { setBusy(false); } }}><h2 id="mfa-session-title" className="text-2xl font-bold">Two-step verification</h2><p className="text-slate-400">Enter your authenticator code to unlock this session.</p><label className="block">Authenticator code<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} className="mt-2 w-full rounded-xl bg-slate-950 p-4 text-xl tracking-widest" /></label>{error ? <p role="alert" className="text-red-300">{error}</p> : null}<button disabled={busy || !/^\d{6}$/.test(code)} className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black disabled:opacity-40">Verify</button><button type="button" className="w-full p-3 text-slate-300" onClick={() => void supabase.auth.signOut()}>Sign out</button></form></div>;
}
