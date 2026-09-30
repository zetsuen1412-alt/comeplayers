import { supabase } from "@/lib/supabase";
import { ACCOUNT_ALERT_PREFERENCES_CHANGED } from "./notificationPreferencesReader";

const SESSION_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function authenticatedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    SESSION_TIMEOUT_MS,
    "Authentication check timed out. Please try again.",
  );

  if (error || !data.session?.access_token) {
    throw Object.assign(new Error("Please login again before continuing."), { status: 401 });
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort();

  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(input, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response
        .clone()
        .json()
        .catch(() => ({}))) as { error?: string };
      throw Object.assign(new Error(
        payload.error || `Request failed with status ${response.status}.`,
      ), { status: response.status });
    }

    const preferenceWrite = init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()) &&
      ["/api/account/preferences", "/api/messages/preferences"].includes(input.split("?")[0]);
    if (preferenceWrite && typeof window !== "undefined") {
      window.dispatchEvent(new Event(ACCOUNT_ALERT_PREFERENCES_CHANGED));
    }
    return response;
  } catch (fetchError) {
    if (controller.signal.aborted && !parentSignal?.aborted) {
      throw new Error("ComePlayers server took too long to respond. Please retry.");
    }
    throw fetchError;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export async function authenticatedFetchJson<T>(
  input: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await authenticatedFetch(input, init);
  return (await response.json()) as T;
}
