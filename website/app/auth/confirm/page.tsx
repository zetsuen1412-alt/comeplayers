import { Suspense } from "react";
import AuthConfirmClient from "./AuthConfirmClient";

function AuthConfirmFallback() {
  return (
    <section
      className="w-full rounded-[28px] border border-slate-700/80 bg-[linear-gradient(180deg,#181d43_0%,#12182f_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] sm:p-8"
      aria-live="polite"
    >
      <div className="h-14 w-14 rounded-full border border-cyan-400/30 bg-cyan-400/10" />
      <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
        Signing you in
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Returning you to ComePlayers...
      </p>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-400" />
      </div>
    </section>
  );
}

export default function AuthConfirmPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center justify-center">
        <Suspense fallback={<AuthConfirmFallback />}>
          <AuthConfirmClient />
        </Suspense>
      </div>
    </main>
  );
}
