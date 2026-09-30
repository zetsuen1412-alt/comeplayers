"use client";

export const ALERT_PREFERENCES_CHANGED = "cp:alert-preferences-changed";
export const CALL_ALERT_HANDLED = "cp:call-alert-handled";
const PREFERENCES_KEY = "cp:device-alerts:v1";
export type AlertPreferences = { sound: boolean; desktop: boolean };

export function readAlertPreferences(): AlertPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}");
    return { sound: value.sound !== false, desktop: value.desktop !== false };
  } catch { return { sound: true, desktop: true }; }
}

export function saveAlertPreferences(value: AlertPreferences) {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value)); } catch { /* Memory-only preferences remain usable. */ }
  window.dispatchEvent(new Event(ALERT_PREFERENCES_CHANGED));
}

function nativeBridge() {
  return (window as typeof window & {
    __TAURI_INTERNALS__?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  }).__TAURI_INTERNALS__?.invoke;
}

export async function alertPermission(): Promise<NotificationPermission | "unsupported"> {
  if (nativeBridge()) {
    try { return await nativeBridge()!("notification_permission") as NotificationPermission; }
    catch { /* Older desktop builds can still use browser notifications. */ }
  }
  return "Notification" in window ? Notification.permission : "unsupported";
}

// Call only from a button click. Do not prompt at login or page load.
export async function requestAlertPermission(): Promise<NotificationPermission | "unsupported"> {
  if (nativeBridge()) {
    try { return await nativeBridge()!("request_notification_permission") as NotificationPermission; }
    catch { /* Continue with the browser API on older desktop builds. */ }
  }
  return "Notification" in window ? Notification.requestPermission() : "unsupported";
}

export async function showSystemAlert(input: {
  title: string; body: string; tag: string; href?: string; onClick: () => void;
}): Promise<() => void> {
  const preferences = readAlertPreferences();
  if (!preferences.desktop || await alertPermission() !== "granted") return () => {};
  if (nativeBridge()) {
    try {
      await nativeBridge()!("show_comeplayers_notification", { title: input.title.slice(0, 120), body: input.body.slice(0, 240), tag: input.tag.slice(0, 120), href: input.href || "/notifications" });
      return () => { void nativeBridge()!("close_comeplayers_notification", { tag: input.tag.slice(0, 120) }).catch(() => undefined); };
    } catch { /* A browser alert remains available when supported. */ }
  }
  try {
    const notification = new Notification(input.title, {
      body: input.body, tag: input.tag, icon: "/brand/comeplayers-app-icon-2026.png",
      silent: true,
    });
    notification.onclick = () => { window.focus(); input.onClick(); notification.close(); };
    return () => notification.close();
  } catch { return () => {}; }
}

let audioContext: AudioContext | undefined;
let lastMessageSoundAt = 0;
const stopRingtones = new Set<() => void>();
export function unlockAlertAudio() {
  try {
    audioContext ??= new AudioContext();
    void audioContext.resume().catch(() => undefined);
  } catch { /* This browser has no audio output. */ }
}

function playTone(frequency: number, at: number, duration: number) {
  if (!audioContext || audioContext.state !== "running") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.13, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
  oscillator.connect(gain); gain.connect(audioContext.destination);
  oscillator.start(at); oscillator.stop(at + duration + 0.02);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  return () => { gain.gain.cancelScheduledValues(0); gain.gain.value = 0; try { oscillator.stop(); } catch { /* Already ended. */ } };
}

export function playMessageSound() {
  if (!readAlertPreferences().sound || !audioContext || audioContext.state !== "running") return;
  if (Date.now() - lastMessageSoundAt < 1500) return;
  lastMessageSoundAt = Date.now();
  const at = audioContext.currentTime;
  playTone(660, at, 0.15); playTone(880, at + 0.13, 0.2);
}

export function startCallRingtone() {
  const tones = new Set<() => void>();
  let stopped = false;
  const ring = () => {
    if (stopped || !readAlertPreferences().sound || !audioContext || audioContext.state !== "running") return;
    tones.forEach(stop => stop()); tones.clear();
    const at = audioContext.currentTime;
    for (const offset of [0, 0.28]) for (const frequency of [660, 880]) {
      const stop = playTone(frequency, at + offset, 0.2);
      if (stop) tones.add(stop);
    }
  };
  ring();
  const timer = window.setInterval(ring, 2200);
  const stop = () => {
    stopped = true; clearInterval(timer); tones.forEach(end => end()); tones.clear(); stopRingtones.delete(stop);
  };
  stopRingtones.add(stop);
  return stop;
}

export function silenceCallAlert(callId: string) {
  stopRingtones.forEach(stop => stop());
  window.dispatchEvent(new CustomEvent(CALL_ALERT_HANDLED, { detail: { callId } }));
}

// Web Locks serialize this small claim across tabs. Storage alone is a best-effort
// fallback on older browsers; event IDs remain scoped to the signed-in account.
export async function claimAlert(userId: string, eventId: string, now = Date.now()) {
  const key = `cp:alert:${userId}:${eventId}`;
  const claim = () => {
    try {
      const previous = Number(localStorage.getItem(key));
      if (previous && now - previous < 120_000) return false;
      localStorage.setItem(key, String(now));
      // Bound storage growth, without inspecting unrelated application storage.
      for (let index = localStorage.length - 1; index >= 0; index--) {
        const storedKey = localStorage.key(index);
        if (storedKey?.startsWith("cp:alert:") && now - Number(localStorage.getItem(storedKey)) > 120_000) localStorage.removeItem(storedKey);
      }
    } catch { /* Private browsing can disable persistent storage. */ }
    return true;
  };
  return navigator.locks ? navigator.locks.request(key, claim) : claim();
}
