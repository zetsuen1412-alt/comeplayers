"use client";

import { useEffect, useState } from "react";
import { ALERT_PREFERENCES_CHANGED, alertPermission, playMessageSound, readAlertPreferences, requestAlertPermission, saveAlertPreferences, unlockAlertAudio, type AlertPreferences } from "@/lib/clientAlerts";

export default function NotificationControls({ isIndonesian = true }: { isIndonesian?: boolean }) {
  const [preferences, setPreferences] = useState<AlertPreferences>({ sound: true, desktop: true });
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { setPreferences(readAlertPreferences()); void alertPermission().then(setPermission); };
    refresh(); window.addEventListener(ALERT_PREFERENCES_CHANGED, refresh); window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(ALERT_PREFERENCES_CHANGED, refresh); window.removeEventListener("focus", refresh); };
  }, []);
  function update(next: AlertPreferences) { setPreferences(next); saveAlertPreferences(next); }
  async function enableNotifications() {
    setBusy(true); setError(""); unlockAlertAudio();
    try {
      const next = await requestAlertPermission(); setPermission(next);
      if (next === "granted") update({ ...preferences, desktop: true });
    } catch { setError(isIndonesian ? "Notifikasi belum bisa diaktifkan. Coba lagi." : "Notifications could not be enabled. Please retry."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-2xl border border-white/15 bg-[#101923] p-5" aria-label={isIndonesian ? "Notifikasi perangkat" : "Device notifications"}>
    <h2 className="text-lg font-bold">{isIndonesian ? "Notifikasi & suara" : "Notifications & sound"}</h2>
    <p className="mt-1 text-sm text-slate-300">{isIndonesian ? "Terima pemberitahuan saat ComePlayers terbuka, termasuk saat jendela diminimalkan." : "Receive alerts while ComePlayers is open, including when its window is minimized."}</p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || permission === "unsupported"} onClick={() => preferences.desktop && permission === "granted" ? update({ ...preferences, desktop: false }) : void enableNotifications()} className="min-h-11 rounded-xl bg-yellow-400 px-4 font-bold text-black disabled:opacity-50">
        {busy ? (isIndonesian ? "Mengaktifkan…" : "Enabling…") : preferences.desktop && permission === "granted" ? (isIndonesian ? "Matikan notifikasi perangkat" : "Turn off device alerts") : (isIndonesian ? "Aktifkan notifikasi perangkat" : "Enable device notifications")}
      </button>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={preferences.sound} onChange={event => { unlockAlertAudio(); update({ ...preferences, sound: event.target.checked }); }} className="h-5 w-5" />{isIndonesian ? "Suara pesan & nada dering" : "Message sound & ringtone"}</label>
      <button type="button" disabled={!preferences.sound} className="min-h-11 rounded-xl border border-white/20 px-4 disabled:opacity-40" onClick={() => { unlockAlertAudio(); window.setTimeout(playMessageSound, 50); }}>{isIndonesian ? "Tes suara" : "Test sound"}</button>
    </div>
    {permission === "denied" ? <p role="status" className="mt-3 text-sm text-yellow-200">{isIndonesian ? "Notifikasi diblokir. Izinkan notifikasi ComePlayers di pengaturan browser atau Windows, lalu coba lagi." : "Notifications are blocked. Allow ComePlayers notifications in your browser or Windows settings, then retry."}</p> : null}
    {permission === "unsupported" ? <p className="mt-3 text-sm text-slate-300">{isIndonesian ? "Perangkat ini belum mendukung notifikasi sistem. Notifikasi dalam aplikasi tetap tersedia." : "System notifications are unavailable here. In-app alerts remain available."}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
  </section>;
}
