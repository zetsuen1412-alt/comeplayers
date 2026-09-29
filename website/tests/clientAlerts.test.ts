import assert from "node:assert/strict";
import test from "node:test";
import { claimAlert, playMessageSound, saveAlertPreferences, silenceCallAlert, startCallRingtone, unlockAlertAudio } from "../lib/clientAlerts";

test("message alerts deduplicate by event and account across repeated delivery", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), get length() { return values.size; }, key: (index: number) => [...values.keys()][index] || null };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    assert.equal(await claimAlert("alice", "message:1", 10_000), true);
    assert.equal(await claimAlert("alice", "message:1", 10_010), false);
    assert.equal(await claimAlert("bob", "message:1", 10_010), true);
    assert.equal(await claimAlert("alice", "message:2", 10_010), true);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("ringtone stops its timer and all scheduled tones when answered, and sound mute prevents playback", () => {
  const originals = new Map(["window", "localStorage", "AudioContext", "CustomEvent"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map<string, string>();
  let nextTimer = 0, started = 0, stopped = 0;
  const timers = new Set<number>();
  const target = new EventTarget();
  class FakeAudio {
    state = "running"; currentTime = 0; destination = {};
    resume() { return Promise.resolve(); }
    createOscillator() { return { frequency: { value: 0 }, type: "sine", connect() {}, disconnect() {}, start() { started++; }, stop() { stopped++; }, onended: null }; }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {}, disconnect() {} }; }
  }
  Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: target.dispatchEvent.bind(target), setInterval: () => { timers.add(++nextTimer); return nextTimer; } } });
  const oldClear = globalThis.clearInterval;
  globalThis.clearInterval = ((id: number) => { timers.delete(id); }) as unknown as typeof clearInterval;
  try {
    unlockAlertAudio();
    const dispose = startCallRingtone();
    assert.equal(timers.size, 1); assert.equal(started, 4);
    silenceCallAlert("call-1");
    assert.equal(timers.size, 0); assert.equal(stopped, 8);
    dispose(); // Cleanup is idempotent.
    saveAlertPreferences({ sound: false, desktop: false });
    playMessageSound();
    const stopMuted = startCallRingtone();
    assert.equal(started, 4); stopMuted();
  } finally {
    globalThis.clearInterval = oldClear;
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
