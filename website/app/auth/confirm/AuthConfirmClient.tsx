"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  FaCheckCircle,
  FaEnvelope,
  FaExclamationTriangle,
  FaSignInAlt,
} from "react-icons/fa";
import ComePlayersLogo from "@/components/brand/ComePlayersLogo";
import { supabase } from "@/lib/supabase";
import {
  resolveAuthCallbackAction,
  sanitizeAuthRedirect,
} from "@/lib/auth/redirect";

type CallbackState =
  | { status: "checking"; message: string }
  | { status: "success"; message: string; next: string }
  | { status: "error"; message: string };

export default function AuthConfirmClient() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = useMemo(
    () => sanitizeAuthRedirect(searchParams.get("next")),
    [searchParams]
  );
  const isSignupVerification = Boolean(tokenHash && type === "signup");
  const checkingTitle = isSignupVerification
    ? "Verifying email"
    : type === "recovery"
      ? "Opening password reset"
      : "Signing you in";
  const checkingMessage = isSignupVerification
    ? "Checking your secure email link..."
    : type === "recovery"
      ? "Checking your secure password reset link..."
      : "Returning you to ComePlayers...";
  const [state, setState] = useState<CallbackState>({
    status: "checking",
    message: "Returning you to ComePlayers...",
  });

  useEffect(() => {
    let active = true;

    async function confirmEmailLink() {
      try {
        const action = resolveAuthCallbackAction(tokenHash, type);

        if (action.kind === "invalid") {
          throw new Error(action.message);
        }

        if (action.kind === "resume-session") {
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession();

          if (error) throw error;
          if (!session) {
            throw new Error(
              "This email link is missing a valid recovery or verification session."
            );
          }

          window.location.replace(next);
          return;
        }

        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash as string,
          type: action.type as EmailOtpType,
        });

        if (error) throw error;

        if (action.kind === "verify-and-redirect") {
          const destination =
            action.type === "recovery" ? "/reset-password" : next;
          window.location.replace(sanitizeAuthRedirect(destination));
          return;
        }

        if (!active) return;

        setState({
          status: "success",
          message: "Email verified. Welcome to ComePlayers!",
          next,
        });
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "We could not verify this email link.",
        });
      }
    }

    confirmEmailLink();

    return () => {
      active = false;
    };
  }, [next, tokenHash, type]);

  const isSuccess = state.status === "success";
  const isError = state.status === "error";

  return (
    <section
      className="w-full rounded-[28px] border border-slate-700/80 bg-[linear-gradient(180deg,#181d43_0%,#12182f_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] sm:p-8"
      aria-live="polite"
    >
      <ComePlayersLogo size="sm" className="mb-6" />
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full border ${
          isSuccess
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            : isError
              ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
              : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
        }`}
      >
        {isSuccess ? (
          <FaCheckCircle className="h-6 w-6" />
        ) : isError ? (
          <FaExclamationTriangle className="h-6 w-6" />
        ) : isSignupVerification ? (
          <FaEnvelope className="h-6 w-6" />
        ) : (
          <FaSignInAlt className="h-6 w-6" />
        )}
      </div>

      <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
        {isSuccess
          ? "Email verified"
          : isError
            ? "Link could not be verified"
            : checkingTitle}
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {state.status === "checking" ? checkingMessage : state.message}
      </p>

      {state.status === "success" ? (
        <Link
          href={state.next}
          replace
          className="mt-6 inline-flex w-full justify-center rounded-2xl bg-cyan-400 px-5 py-3.5 font-black text-black transition hover:bg-cyan-300"
        >
          Continue to ComePlayers
        </Link>
      ) : isError ? (
        <Link
          href="/"
          className="mt-6 inline-flex w-full justify-center rounded-2xl bg-cyan-400 px-5 py-3.5 font-black text-black transition hover:bg-cyan-300"
        >
          Back to login
        </Link>
      ) : (
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-400" />
        </div>
      )}
    </section>
  );
}
