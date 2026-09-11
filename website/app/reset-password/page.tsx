"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getPasswordStrength } from "@/lib/auth/passwordStrength";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import { FaCheckCircle, FaEye, FaEyeSlash, FaLock } from "react-icons/fa";

type Notice = {
  type: "error" | "success" | "info";
  message: string;
};

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [notice, setNotice] = useState<Notice | null>({
    type: "info",
    message: "Checking your recovery session...",
  });

  useEffect(() => {
    let active = true;

    async function initializeRecovery() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        setNotice({ type: "error", message: error.message });
        return;
      }

      if (!session) {
        setNotice({
          type: "error",
          message:
            "Recovery session not found or has expired. Please request a new reset link.",
        });
        return;
      }

      setReady(true);
      setNotice({
        type: "info",
        message: "Create a new password for your ComePlayers account.",
      });
    }

    initializeRecovery();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setNotice({
          type: "info",
          message: "Create a new password for your ComePlayers account.",
        });
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);

    if (!ready) {
      setNotice({
        type: "error",
        message: "Recovery session is not ready yet. Please reopen your reset link.",
      });
      return;
    }

    if (password.length < 8 || passwordStrength.score < 3) {
      setNotice({
        type: "error",
        message:
          "Use at least 8 characters with a stronger mix of uppercase, lowercase, numbers, or symbols.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setNotice({ type: "error", message: "Passwords do not match." });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setNotice({ type: "error", message: error.message });
      setLoading(false);
      return;
    }

    setUpdated(true);
    setLoading(false);
    setNotice({
      type: "success",
      message: "Password updated successfully. You can now log in with your new password.",
    });
  }

  return (
    <main className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center justify-center">
        <div className="w-full overflow-hidden rounded-[28px] border border-slate-700/80 bg-[linear-gradient(180deg,#181d43_0%,#12182f_100%)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] sm:p-8">
          <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-300">
            Password recovery
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Reset password
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-[15px]">
            Keep your account secure with a fresh password.
          </p>

          {notice && (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                notice.type === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : notice.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
              }`}
              role={notice.type === "error" ? "alert" : "status"}
            >
              {notice.message}
            </div>
          )}

          {updated ? (
            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
              <div className="flex items-center gap-3 text-emerald-200">
                <FaCheckCircle className="h-5 w-5" />
                <p className="font-semibold">Your password has been updated.</p>
              </div>
              <Link
                href="/"
                className="mt-5 inline-flex rounded-2xl bg-cyan-400 px-5 py-3 font-black text-black transition hover:bg-cyan-300"
              >
                Back to homepage
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-200">New password</span>
                <div className="relative">
                  <FaLock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Create a new password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-slate-700 bg-[#070b20] py-4 pl-11 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                    disabled={!ready || loading}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                  </button>
                </div>
                <PasswordStrengthMeter password={password} />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-200">Confirm password</span>
                <div className="relative">
                  <FaLock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-slate-700 bg-[#070b20] py-4 pl-11 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                    disabled={!ready || loading}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={!ready || loading}
                className="rounded-2xl bg-cyan-400 py-4 font-black text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Updating password..." : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
