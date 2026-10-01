"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearPendingDesktopOAuth,
  consumePendingDesktopOAuth,
  DESKTOP_OAUTH_CODE_PATTERN,
  getDesktopOAuthClient,
  isDesktopNativeShell,
} from "@/lib/auth/desktopOAuth";
import { supabase } from "@/lib/supabase";

export default function DesktopAuthFinishClient() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = hash.get("desktop_code") || "";
    const state = hash.get("desktop_state") || "";
    window.history.replaceState(null, "", "/auth/desktop/finish");

    async function finish() {
      try {
        if (!isDesktopNativeShell() || !DESKTOP_OAUTH_CODE_PATTERN.test(code)) {
          throw new Error("The desktop login link is invalid. Please start again in ComePlayers.");
        }
        const next = consumePendingDesktopOAuth(window.sessionStorage, state);
        if (!next) throw new Error("The desktop login request expired. Please sign in again.");

        const { data, error: exchangeError } = await getDesktopOAuthClient().auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        if (!data.session) throw new Error("Google did not return a valid session.");
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) throw sessionError;
        clearPendingDesktopOAuth(window.sessionStorage);
        window.location.replace(next);
      } catch (reason) {
        clearPendingDesktopOAuth(window.sessionStorage);
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not finish Google sign-in.");
        }
      }
    }

    void finish();
    return () => { active = false; };
  }, []);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#070b14] p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/15 bg-[#101927] p-8 text-center">
        <h1 className="text-2xl font-bold">ComePlayers</h1>
        <p className="mt-4 text-slate-300" role={error ? "alert" : "status"}>
          {error || "Menyelesaikan login Google..."}
        </p>
        {error ? (
          <Link className="mt-5 inline-block rounded-xl bg-yellow-400 px-5 py-3 font-semibold text-black" href="/">
            Kembali ke login
          </Link>
        ) : null}
      </section>
    </main>
  );
}
