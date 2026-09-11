import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  getRememberMePreference,
  setRememberMePreference,
  supabaseAuthStorage,
} from "../../lib/auth/sessionStorage";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function installWindowStorage() {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage, sessionStorage },
  });

  return { localStorage, sessionStorage };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

test("remember-me stores Supabase tokens in local storage", () => {
  const { localStorage, sessionStorage } = installWindowStorage();

  setRememberMePreference(true);
  supabaseAuthStorage.setItem("sb-project-auth-token", "persisted");

  assert.equal(getRememberMePreference(), true);
  assert.equal(localStorage.getItem("sb-project-auth-token"), "persisted");
  assert.equal(sessionStorage.getItem("sb-project-auth-token"), null);
});

test("turning remember-me off migrates existing auth tokens to session storage", () => {
  const { localStorage, sessionStorage } = installWindowStorage();
  localStorage.setItem("sb-project-auth-token", "existing");

  setRememberMePreference(false);

  assert.equal(getRememberMePreference(), false);
  assert.equal(localStorage.getItem("sb-project-auth-token"), null);
  assert.equal(sessionStorage.getItem("sb-project-auth-token"), "existing");
  assert.equal(supabaseAuthStorage.getItem("sb-project-auth-token"), "existing");
});

test("session-only mode does not resurrect stale local auth tokens", () => {
  const { localStorage } = installWindowStorage();
  localStorage.setItem("sb-project-auth-token", "stale");
  localStorage.setItem("comeplayers_remember_me", "false");

  assert.equal(supabaseAuthStorage.getItem("sb-project-auth-token"), null);
});
