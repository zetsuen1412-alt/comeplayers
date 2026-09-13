import { getRandomValues } from "expo-crypto";

// Hermes does not provide Web Crypto. HPKE/noble only need the native CSPRNG.
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: { getRandomValues }, configurable: true });
else if (!globalThis.crypto.getRandomValues) Object.defineProperty(globalThis.crypto, "getRandomValues", { value: getRandomValues });
