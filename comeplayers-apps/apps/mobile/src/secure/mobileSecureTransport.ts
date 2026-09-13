import { request } from "../api";
import { fetch as nativeFetch } from "expo/fetch";
import type { SecureBinaryTransport, SecureTransport } from "./secureHistorySync";

export const mobileSecureTransport: SecureTransport = (path, init = {}) => request(path, init, true);
export const mobileSecureBinaryTransport: SecureBinaryTransport = (url, init = {}) => nativeFetch(url, {
  method: init.method || "GET", headers: init.headers,
  ...(init.body ? { body: new Uint8Array(init.body).buffer } : {}),
  signal: AbortSignal.timeout(60000),
}) as Promise<Response>;
