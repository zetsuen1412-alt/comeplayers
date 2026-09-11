"use client";
import { useEffect, useState } from "react";
import { accountRequest } from "@/lib/accountClient";
import { supabase } from "@/lib/supabase";
type Country = { code: string; name: string; callingCode: string };
type PhoneAccount = { phone: string | null; phoneVerified: boolean; settings: { phone_country: string } };
export default function PhoneVerificationForm({ onSaved }: { onSaved: (phone: string, verified: boolean) => void }) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState("ID");
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const [channel, setChannel] = useState("whatsapp");
  const [pending, setPending] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/account/phone").then(r => { if (!r.ok) throw new Error("Could not load countries."); return r.json(); }),
      accountRequest<PhoneAccount>("/api/account/preferences"),
    ]).then(([options, account]) => {
      if (!active) return;
      setCountries(options.countries); setChannels(options.channels || []); setChannel(options.channels?.[0] || "whatsapp");
      setCountry(account.settings.phone_country); setPhone(account.phone || ""); setSavedPhone(account.phone || ""); setVerified(account.phoneVerified); setReady(true);
    }).catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!resendAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [resendAt]);
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await accountRequest<{ phone: string | null; phoneVerified: boolean }>("/api/account/phone", { action: "save", phone, country });
      setPhone(result.phone || ""); setSavedPhone(result.phone || ""); setVerified(result.phoneVerified); onSaved(result.phone || "", result.phoneVerified);
      setMessage(result.phone ? "Phone number saved. Saving does not verify its owner." : "Saved phone number removed.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save phone number."); }
    finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setMessage("");
    try { const r = await accountRequest<{ phone: string; resendAfter: number }>("/api/account/phone", { action: "send", phone, country, channel }); setPending(r.phone); setResendAt(Date.now() + r.resendAfter * 1000); setNow(Date.now()); setMessage("Verification code sent."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not send code."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setMessage("");
    try { await accountRequest("/api/account/phone", { action: "verify", phone: pending, country, code }); await supabase.auth.refreshSession(); onSaved(pending, true); setPhone(pending); setSavedPhone(pending); setVerified(true); setMessage("Phone verified."); setPending(""); setCode(""); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Invalid verification code."); }
    finally { setBusy(false); }
  };
  const input = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-white";
  const button = "rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40";
  return <section className="mt-7 max-w-xl space-y-5 rounded-2xl border border-amber-400/20 p-6">
    <h2 className="text-xl font-bold">Phone number (optional)</h2>
    <p className="text-sm leading-6 text-slate-400">{verified ? "Saved number: verified." : "Not verified. Saving a phone number does not verify its owner."} Choose your country to use a local format, including 08 for Indonesia, or enter an international number such as +62.</p>
    <label className="block text-sm">Country<select disabled={!ready || busy} value={country} onChange={e => { setCountry(e.target.value); setPending(""); }} className={input}>{countries.map(c => <option key={c.code} value={c.code}>{c.name} {c.callingCode}</option>)}</select></label>
    <label className="block text-sm">Phone number<input disabled={!ready || busy} type="tel" autoComplete="tel" maxLength={40} className={input} placeholder={country === "ID" ? "08… or +62…" : "Local or international number"} value={phone} onChange={e => { setPhone(e.target.value); setPending(""); }} /></label>
    <button type="button" className={button} disabled={!ready || busy || phone === savedPhone} onClick={() => void save()}>Save phone number</button>
    {channels.length ? <>
      {channels.length > 1 ? <label className="block text-sm">Send code via<select className={input} value={channel} onChange={e => setChannel(e.target.value)}>{channels.map(value => <option key={value} value={value}>{value === "whatsapp" ? "WhatsApp" : "SMS"}</option>)}</select></label> : null}
      <button type="button" className={button} disabled={busy || !phone.trim() || resendAt > now} onClick={() => void send()}>{resendAt > now ? "Please wait before requesting another code" : "Send verification code"}</button>
      {pending ? <><label className="block text-sm">Code sent to {pending}<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => setCode(e.target.value)} className={input} /></label><button type="button" className={button} disabled={busy || !/^\d{6,8}$/.test(code)} onClick={() => void verify()}>Verify phone</button></> : null}
    </> : <p className="text-sm leading-6 text-slate-400">WhatsApp verification will be available later. For now, sign in with Google or email and password. Phone verification is optional.</p>}
    {message ? <p role="status" className="text-sm text-amber-200">{message}</p> : null}
  </section>;
}
