const REMEMBER_ME_KEY = "comeplayers_remember_me";

function hasBrowserStorage() {
  return typeof window !== "undefined";
}

function safeStorage(kind: "localStorage" | "sessionStorage") {
  if (!hasBrowserStorage()) return null;

  try {
    return window[kind];
  } catch {
    return null;
  }
}

function safeGetItem(kind: "localStorage" | "sessionStorage", key: string) {
  try {
    return safeStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetItem(
  kind: "localStorage" | "sessionStorage",
  key: string,
  value: string
) {
  try {
    safeStorage(kind)?.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing or locked-down webviews.
  }
}

function safeRemoveItem(kind: "localStorage" | "sessionStorage", key: string) {
  try {
    safeStorage(kind)?.removeItem(key);
  } catch {
    // Best-effort cleanup only.
  }
}

function authStorageKeys(kind: "localStorage" | "sessionStorage") {
  const storage = safeStorage(kind);
  if (!storage) return [];

  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key &&
        ((key.startsWith("sb-") && key.endsWith("-auth-token")) ||
          key.includes("supabase.auth.token"))
      ) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }

  return keys;
}

function moveAuthStorage(
  source: "localStorage" | "sessionStorage",
  target: "localStorage" | "sessionStorage"
) {
  for (const key of authStorageKeys(source)) {
    const value = safeGetItem(source, key);
    if (value !== null) {
      safeSetItem(target, key, value);
    }
    safeRemoveItem(source, key);
  }
}

export function getRememberMePreference() {
  return safeGetItem("localStorage", REMEMBER_ME_KEY) !== "false";
}

export function setRememberMePreference(remember: boolean) {
  safeSetItem("localStorage", REMEMBER_ME_KEY, remember ? "true" : "false");

  if (remember) {
    moveAuthStorage("sessionStorage", "localStorage");
  } else {
    moveAuthStorage("localStorage", "sessionStorage");
  }
}

/**
 * Supabase storage adapter that switches between localStorage and
 * sessionStorage according to the latest Remember me preference.
 */
export const supabaseAuthStorage = {
  getItem(key: string) {
    if (getRememberMePreference()) {
      return safeGetItem("localStorage", key) ?? safeGetItem("sessionStorage", key);
    }

    return safeGetItem("sessionStorage", key);
  },
  setItem(key: string, value: string) {
    if (getRememberMePreference()) {
      safeSetItem("localStorage", key, value);
      safeRemoveItem("sessionStorage", key);
      return;
    }

    safeSetItem("sessionStorage", key, value);
    safeRemoveItem("localStorage", key);
  },
  removeItem(key: string) {
    safeRemoveItem("localStorage", key);
    safeRemoveItem("sessionStorage", key);
  },
};
