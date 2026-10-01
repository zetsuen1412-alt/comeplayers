import { request } from "../api";
import { fetch as nativeFetch } from "expo/fetch";
import type { SecureBinaryTransport, SecureTransport } from "./secureHistorySync";

export const mobileSecureTransport: SecureTransport = (path, init = {}) => request(path, init, true);
export const mobileSecureBinaryTransport: SecureBinaryTransport = async (url, init = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    return await nativeFetch(url, {
      method: init.method || "GET", headers: init.headers,
      ...(init.body ? { body: new Uint8Array(init.body).buffer } : {}),
      signal: controller.signal,
    }) as Response;
  } catch (reason) {
    if (controller.signal.aborted) throw new Error("Encrypted media transfer timed out. Try again.");
    throw reason;
  } finally { clearTimeout(timer); }
};
