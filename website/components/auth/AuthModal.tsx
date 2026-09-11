"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaShieldAlt,
  FaUser,
} from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import {
  createCooldownDeadline,
  getCooldownSeconds,
  isRateLimitMessage,
} from "@/lib/auth/cooldown";
import { getPasswordStrength } from "@/lib/auth/passwordStrength";
import {
  getRememberMePreference,
  setRememberMePreference,
} from "@/lib/auth/sessionStorage";
import { buildAuthCallbackUrl } from "@/lib/auth/redirect";
import { supabase } from "@/lib/supabase";
import ComePlayersLogo from "@/components/brand/ComePlayersLogo";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import styles from "./AuthModal.module.css";

export type AuthMode = "login" | "register" | "forgot" | "verify";
type OAuthProvider = "google";
type AuthNotice = {
  type: "error" | "success" | "info";
  message: string;
};

type AuthModalProps = {
  open: boolean;
  initialMode?: Extract<AuthMode, "login" | "register">;
  onClose: () => void;
  onAuthenticated?: () => void;
  presentation?: "modal" | "page";
  redirectPath?: string;
  contextMessage?: string | null;
};

const inputClass =
  "min-h-12 w-full rounded-xl border border-white/15 bg-[#070a10] py-3 pl-11 pr-4 text-[16px] text-white outline-none transition placeholder:text-slate-500 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 sm:text-sm";

const EMAIL_ACTION_COOLDOWN_SECONDS = 60;
const LOGIN_FAILURE_COOLDOWN_SECONDS = 30;
const MAX_LOGIN_FAILURES = 5;
const AUTH_COOLDOWN_PREFIX = "comeplayers_auth_cooldown";

function getCooldownStorageKey(action: "register" | "reset" | "verify", email: string) {
  return `${AUTH_COOLDOWN_PREFIX}_${action}_${email.trim().toLowerCase()}`;
}

function readStoredCooldown(action: "register" | "reset" | "verify", email: string) {
  if (typeof window === "undefined" || !email) return 0;
  return Number(window.localStorage.getItem(getCooldownStorageKey(action, email)) || 0);
}

function storeCooldown(
  action: "register" | "reset" | "verify",
  email: string,
  availableAt: number
) {
  if (typeof window === "undefined" || !email) return;
  window.localStorage.setItem(
    getCooldownStorageKey(action, email),
    String(availableAt)
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"•".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

export default function AuthModal({
  open,
  initialMode = "login",
  onClose,
  onAuthenticated,
  presentation = "modal",
  redirectPath,
  contextMessage,
}: AuthModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const noticeId = useId();
  const wasOpenRef = useRef(false);
  const formPaneRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference());
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [loginFailures, setLoginFailures] = useState(0);
  const [loginBlockedUntil, setLoginBlockedUntil] = useState(0);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const activeCooldownDeadline =
    mode === "login"
      ? loginBlockedUntil
      : mode === "forgot" || mode === "verify"
      ? cooldownUntil
      : 0;
  const cooldownSeconds = getCooldownSeconds(
    activeCooldownDeadline,
    cooldownNow
  );

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setMode(initialMode);
      setNotice(null);
      setLoading(false);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setAcceptTerms(false);
    }

    wasOpenRef.current = open;
  }, [initialMode, open]);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll =
      document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior =
        previousHtmlOverscroll;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [initialMode, onClose, open]);

  useEffect(() => {
    if (!open) return;
    formPaneRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [mode, open]);

  useEffect(() => {
    if (!activeCooldownDeadline) return;

    const timer = window.setInterval(() => {
      setCooldownNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeCooldownDeadline]);

  if (!open) return null;

  const isPagePresentation = presentation === "page";

  function getAuthReturnPath() {
    if (redirectPath) return redirectPath;
    if (typeof window === "undefined") return "/";
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function completeAuthentication() {
    onAuthenticated?.();

    if (isPagePresentation) {
      if (!onAuthenticated && typeof window !== "undefined") {
        window.location.reload();
      }
      return;
    }

    onClose();
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setLoading(false);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    if (nextMode !== "register") setAcceptTerms(false);

    if (nextMode === "register") {
      setCooldownUntil(readStoredCooldown("register", email));
    } else if (nextMode === "forgot") {
      setCooldownUntil(readStoredCooldown("reset", email));
    } else if (nextMode === "verify") {
      setCooldownUntil(readStoredCooldown("verify", verificationEmail || email));
    } else {
      setCooldownUntil(0);
    }
  }

  function beginEmailCooldown(action: "register" | "reset" | "verify", targetEmail: string) {
    const deadline = createCooldownDeadline(EMAIL_ACTION_COOLDOWN_SECONDS);
    storeCooldown(action, targetEmail, deadline);
    setCooldownUntil(deadline);
    setCooldownNow(Date.now());
  }

  function handleProviderError(
    message: string,
    action?: "register" | "reset" | "verify",
    targetEmail?: string
  ) {
    if (!isRateLimitMessage(message)) {
      setNotice({ type: "error", message });
      return;
    }

    if (action && targetEmail) {
      beginEmailCooldown(action, targetEmail);
    }

    setNotice({
      type: "error",
      message:
        "Too many requests were detected. Please wait for the countdown before trying again.",
    });
  }

  async function ensureInitialWallet() {
    try {
      await authenticatedFetchJson("/api/wallet/topups", {
        method: "POST",
        body: JSON.stringify({ action: "ensure-wallet" }),
      });
    } catch (error) {
      console.error(
        "Create initial wallet error:",
        error instanceof Error ? error.message : error
      );
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);

    const finalEmail = email.trim().toLowerCase();

    if (!finalEmail) {
      setNotice({ type: "error", message: "Please enter your email address." });
      return;
    }

    if (mode === "forgot") {
      const resetDeadline = Math.max(
        cooldownUntil,
        readStoredCooldown("reset", finalEmail)
      );
      const resetRemaining = getCooldownSeconds(resetDeadline);

      if (resetRemaining > 0) {
        setCooldownUntil(resetDeadline);
        setCooldownNow(Date.now());
        setNotice({
          type: "info",
          message: `Please wait ${resetRemaining} seconds before requesting another link.`,
        });
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(finalEmail, {
        redirectTo: buildAuthCallbackUrl(
          window.location.origin,
          "/reset-password"
        ),
      });

      if (error) {
        handleProviderError(error.message, "reset", finalEmail);
        setLoading(false);
        return;
      }

      beginEmailCooldown("reset", finalEmail);
      setNotice({
        type: "success",
        message:
          "Reset link sent. Check your inbox and spam folder. Another link can be requested after the countdown.",
      });
      setLoading(false);
      return;
    }

    if (!password) {
      setNotice({ type: "error", message: "Please enter your password." });
      return;
    }

    if (mode === "register" && cooldownSeconds > 0) {
      setNotice({
        type: "info",
        message: `Please wait ${cooldownSeconds} seconds before trying to register again.`,
      });
      return;
    }

    setRememberMePreference(rememberMe);
    setLoading(true);

    if (mode === "login") {
      const remainingBlock = getCooldownSeconds(loginBlockedUntil);
      if (remainingBlock > 0) {
        setNotice({
          type: "error",
          message: `Login is temporarily paused. Try again in ${remainingBlock} seconds.`,
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password,
      });

      if (error) {
        const nextFailures = loginFailures + 1;

        if (nextFailures >= MAX_LOGIN_FAILURES) {
          const deadline = createCooldownDeadline(
            LOGIN_FAILURE_COOLDOWN_SECONDS
          );
          setLoginBlockedUntil(deadline);
          setCooldownNow(Date.now());
          setLoginFailures(0);
          setNotice({
            type: "error",
            message:
              "Several unsuccessful attempts were detected. Login is paused briefly to reduce automated abuse.",
          });
        } else {
          setLoginFailures(nextFailures);
          handleProviderError(error.message);
        }

        setLoading(false);
        return;
      }

      setLoginFailures(0);
      setLoginBlockedUntil(0);
      completeAuthentication();
      return;
    }

    const finalUsername = username.trim();

    if (!/^[A-Za-z0-9_]{3,20}$/.test(finalUsername)) {
      setNotice({
        type: "error",
        message:
          "Username must be 3–20 characters and use only letters, numbers, or underscores.",
      });
      setLoading(false);
      return;
    }

    if (strength.score < 3) {
      setNotice({
        type: "error",
        message:
          "Please choose a stronger password using at least 8 characters and a mix of character types.",
      });
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setNotice({ type: "error", message: "Passwords do not match." });
      setLoading(false);
      return;
    }

    if (!acceptTerms) {
      setNotice({
        type: "error",
        message: "Please agree to the Terms and Privacy Policy.",
      });
      setLoading(false);
      return;
    }

    const { data: existingUsername, error: usernameCheckError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", finalUsername)
      .maybeSingle();

    if (usernameCheckError) {
      setNotice({ type: "error", message: usernameCheckError.message });
      setLoading(false);
      return;
    }

    if (existingUsername) {
      setNotice({ type: "error", message: "Username is already taken." });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: finalEmail,
      password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(window.location.origin, getAuthReturnPath()),
        data: { username: finalUsername },
      },
    });

    if (error) {
      handleProviderError(error.message, "register", finalEmail);
      setLoading(false);
      return;
    }

    beginEmailCooldown("register", finalEmail);

    if (data.session) {
      await ensureInitialWallet();
      completeAuthentication();
      return;
    }

    setVerificationEmail(finalEmail);
    setPassword("");
    setConfirmPassword("");
    setLoading(false);
    beginEmailCooldown("verify", finalEmail);
    setMode("verify");
  }

  async function handleOAuthLogin(provider: OAuthProvider) {
    setRememberMePreference(rememberMe);
    setLoading(true);
    setNotice(null);

    const oauthReturnUrl = buildAuthCallbackUrl(
      window.location.origin,
      getAuthReturnPath()
    );

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: oauthReturnUrl,
      },
    });

    if (error) {
      setNotice({ type: "error", message: error.message });
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!verificationEmail) return;

    if (cooldownSeconds > 0) {
      setNotice({
        type: "info",
        message: `You can request another verification email in ${cooldownSeconds} seconds.`,
      });
      return;
    }

    setResendLoading(true);
    setNotice(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: verificationEmail,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(window.location.origin, getAuthReturnPath()),
      },
    });

    if (error) {
      handleProviderError(error.message, "verify", verificationEmail);
      setResendLoading(false);
      return;
    }

    beginEmailCooldown("verify", verificationEmail);
    setNotice({
      type: "success",
      message: "A new verification email has been sent.",
    });
    setResendLoading(false);
  }


  return (
    <div
      className={
        isPagePresentation
          ? `${styles.pageViewport} h-[100dvh] overflow-hidden bg-[#06080d] text-white`
          : `${styles.authViewport} fixed inset-0 z-[10000] h-[100dvh] overflow-hidden bg-black/80 text-white backdrop-blur-md`
      }
      onMouseDown={(event) => {
        if (
          !isPagePresentation &&
          event.currentTarget === event.target
        ) {
          onClose();
        }
      }}
      role={isPagePresentation ? "main" : "dialog"}
      aria-modal={isPagePresentation ? undefined : true}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        className={`${styles.modalStage} flex h-[100dvh] min-h-0 items-center justify-center overflow-hidden p-4 sm:p-6`}
      >
        <section
          className={`${styles.modalShell} relative w-full max-w-[480px] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,#15181f_0%,#0a0d13_100%)] shadow-[0_28px_90px_rgba(0,0,0,0.62)]`}
        >
          {!isPagePresentation ? (
            <button
              onClick={onClose}
              className={`${styles.safeClose} absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-lg font-bold text-slate-400 transition hover:border-yellow-300/50 hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-yellow-300`}
              aria-label="Close authentication modal"
              type="button"
            >
              ×
            </button>
          ) : null}

          <div
            ref={formPaneRef}
            className={`${styles.formPane} ${
              mode === "login" ? styles.loginPane : ""
            } max-h-[calc(100dvh-2rem)] px-5 py-6 sm:px-7 sm:py-7`}
          >
            <header
              className={`text-center ${mode === "login" ? styles.loginBrand : ""}`}
            >
              <div className="mx-auto flex w-fit items-center justify-center">
                <ComePlayersLogo compact tone="dark" />
              </div>
              <div
                className={`mx-auto inline-flex items-center gap-2 rounded-full border border-yellow-300/20 bg-yellow-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200 ${
                  mode === "login" ? styles.loginSecureBadge : "mt-4"
                }`}
              >
                <FaShieldAlt className="h-3.5 w-3.5" />
                Secure account access
              </div>
            </header>

            {mode === "verify" ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-yellow-300/25 bg-yellow-300/10 text-yellow-200">
                  <FaEnvelope className="h-6 w-6" />
                </div>
                <h2
                  id={titleId}
                  className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl"
                >
                  Verify your email
                </h2>
                <p
                  id={descriptionId}
                  className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400"
                >
                  We sent a verification link to{" "}
                  <span className="font-bold text-white">
                    {maskEmail(verificationEmail)}
                  </span>
                  .
                </p>

                {notice ? (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                      notice.type === "error"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    }`}
                    role={notice.type === "error" ? "alert" : "status"}
                  >
                    {notice.message}
                  </div>
                ) : null}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <a
                    href={`mailto:${verificationEmail}`}
                    className="flex min-h-12 items-center justify-center rounded-xl bg-yellow-300 px-4 py-3 font-black text-black transition hover:bg-yellow-200"
                  >
                    Open email app
                  </a>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendLoading || cooldownSeconds > 0}
                    className="min-h-12 rounded-xl border border-white/12 bg-white/5 px-4 py-3 font-bold text-white transition hover:border-yellow-300/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resendLoading
                      ? "Sending..."
                      : cooldownSeconds > 0
                        ? `Resend in ${cooldownSeconds}s`
                        : "Resend email"}
                  </button>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(verificationEmail);
                      switchMode("login");
                    }}
                    className="font-bold text-yellow-200 hover:text-yellow-100"
                  >
                    Back to login
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="font-semibold text-slate-400 hover:text-white"
                  >
                    Use another email
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`text-center ${
                    mode === "login" ? styles.loginTitleBlock : "mt-6"
                  }`}
                >
                  <h2
                    id={titleId}
                    className="text-2xl font-black tracking-tight text-white sm:text-3xl"
                  >
                    {mode === "login"
                      ? "Welcome back"
                      : mode === "register"
                        ? "Create your account"
                        : "Reset your password"}
                  </h2>
                  <p
                    id={descriptionId}
                    className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400"
                  >
                    {mode === "login"
                      ? "One ComePlayers account for marketplace, messages, and every supported device."
                      : mode === "register"
                        ? "Create one account and use it across ComePlayers web and mobile."
                        : "Enter your email and we will send a secure password reset link."}
                  </p>
                </div>

                {contextMessage ? (
                  <div
                    className={`rounded-xl border border-yellow-300/15 bg-yellow-300/5 px-4 py-3 text-center text-xs leading-5 text-yellow-100/90 ${
                      mode === "login" ? styles.loginContext : "mt-4"
                    }`}
                  >
                    {contextMessage}
                  </div>
                ) : null}

                {mode !== "forgot" ? (
                  <div
                    className={`grid grid-cols-2 rounded-xl bg-black/25 p-1 ${
                      mode === "login" ? styles.loginTabs : "mt-5"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className={`min-h-11 rounded-lg px-3 py-2.5 text-sm font-black transition ${
                        mode === "login"
                          ? "bg-white/10 text-yellow-200 shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("register")}
                      className={`min-h-11 rounded-lg px-3 py-2.5 text-sm font-black transition ${
                        mode === "register"
                          ? "bg-white/10 text-yellow-200 shadow-sm"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Register
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-yellow-200 hover:text-yellow-100"
                  >
                    <span aria-hidden>←</span> Back to login
                  </button>
                )}

                {notice ? (
                  <div
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                      notice.type === "error"
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        : notice.type === "success"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-yellow-300/25 bg-yellow-300/10 text-yellow-100"
                    }`}
                    id={noticeId}
                    role={notice.type === "error" ? "alert" : "status"}
                  >
                    {notice.message}
                  </div>
                ) : null}

                <form
                  onSubmit={handleSubmit}
                  className={`grid ${
                    mode === "login" ? styles.loginForm : "mt-5 gap-4"
                  }`}
                >
                  {mode === "register" ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-300">
                        Username
                      </span>
                      <div className="relative">
                        <FaUser className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="Choose a username"
                          autoComplete="username"
                          className={inputClass}
                          required
                          minLength={3}
                          maxLength={20}
                        />
                      </div>
                      <span className="text-xs text-slate-500">
                        3–20 characters. Letters, numbers, and underscores only.
                      </span>
                    </label>
                  ) : null}

                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-300">
                      Email address
                    </span>
                    <div className="relative">
                      <FaEnvelope className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        inputMode="email"
                        className={
                          mode === "login"
                            ? `${inputClass} ${styles.loginInput}`
                            : inputClass
                        }
                        required
                      />
                    </div>
                  </label>

                  {mode !== "forgot" ? (
                    <label className="grid gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-300">
                          Password
                        </span>
                        {mode === "login" ? (
                          <button
                            type="button"
                            onClick={() => switchMode("forgot")}
                            className={`${styles.loginForgot} text-xs font-bold text-yellow-200 hover:text-yellow-100 sm:text-sm`}
                          >
                            Forgot password?
                          </button>
                        ) : null}
                      </div>
                      <div className="relative">
                        <FaLock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder={
                            mode === "register"
                              ? "Create a strong password"
                              : "Enter your password"
                          }
                          autoComplete={
                            mode === "login"
                              ? "current-password"
                              : "new-password"
                          }
                          className={`${inputClass} pr-12 ${
                            mode === "login" ? styles.loginInput : ""
                          }`}
                          required
                          minLength={mode === "register" ? 8 : undefined}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword((current) => !current)
                          }
                          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? (
                            <FaEyeSlash className="h-4 w-4" />
                          ) : (
                            <FaEye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {mode === "register" ? (
                        <PasswordStrengthMeter password={password} />
                      ) : null}
                    </label>
                  ) : null}

                  {mode === "register" ? (
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-300">
                        Confirm password
                      </span>
                      <div className="relative">
                        <FaLock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(event) =>
                            setConfirmPassword(event.target.value)
                          }
                          placeholder="Repeat your password"
                          autoComplete="new-password"
                          className={`${inputClass} pr-12`}
                          required
                          minLength={8}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword((current) => !current)
                          }
                          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"
                          aria-label={
                            showConfirmPassword
                              ? "Hide confirm password"
                              : "Show confirm password"
                          }
                        >
                          {showConfirmPassword ? (
                            <FaEyeSlash className="h-4 w-4" />
                          ) : (
                            <FaEye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </label>
                  ) : null}

                  {mode === "login" ? (
                    <label
                      className={`flex items-center text-sm text-slate-300 ${
                        styles.loginRemember
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(event) =>
                          setRememberMe(event.target.checked)
                        }
                        className="h-4 w-4 shrink-0 rounded border-slate-600 bg-[#070a10] text-yellow-300 focus:ring-yellow-300"
                      />
                      <span>Remember me on this device</span>
                    </label>
                  ) : null}

                  {mode === "register" ? (
                    <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-sm text-slate-400">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(event) =>
                          setAcceptTerms(event.target.checked)
                        }
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-600 bg-[#070a10] text-yellow-300 focus:ring-yellow-300"
                        required
                      />
                      <span>
                        I agree to the{" "}
                        <Link
                          href="/terms"
                          className="font-semibold text-yellow-200 hover:text-yellow-100"
                        >
                          Terms
                        </Link>{" "}
                        and{" "}
                        <Link
                          href="/privacy"
                          className="font-semibold text-yellow-200 hover:text-yellow-100"
                        >
                          Privacy Policy
                        </Link>
                        .
                      </span>
                    </label>
                  ) : null}

                  <button
                    type="submit"
                    disabled={loading || cooldownSeconds > 0}
                    className={`rounded-xl bg-yellow-300 px-5 text-sm font-black text-black transition hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:ring-offset-2 focus:ring-offset-[#0b0e14] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base ${
                      mode === "login" ? styles.loginPrimaryButton : "min-h-12 py-3.5"
                    }`}
                  >
                    {loading
                      ? "Please wait..."
                      : cooldownSeconds > 0 && mode === "login"
                        ? `Try again in ${cooldownSeconds}s`
                        : cooldownSeconds > 0 && mode === "forgot"
                          ? `Send again in ${cooldownSeconds}s`
                          : cooldownSeconds > 0 && mode === "register"
                            ? `Try again in ${cooldownSeconds}s`
                            : mode === "login"
                              ? "Login"
                              : mode === "register"
                                ? "Create account"
                                : "Send reset link"}
                  </button>
                </form>

                {mode !== "forgot" ? (
                  <>
                    <div
                      className={`flex items-center gap-3 ${
                        mode === "login" ? styles.loginDivider : "my-5"
                      }`}
                    >
                      <div className="h-px flex-1 bg-white/10" />
                      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        or continue with
                      </p>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleOAuthLogin("google")}
                      className={`flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60 ${
                        mode === "login" ? styles.loginSocialButton : "min-h-12"
                      }`}
                    >
                      <FcGoogle className="h-5 w-5" />
                      Continue with Google
                    </button>
                  </>
                ) : null}

                <p
                  className={`text-center text-[11px] text-slate-500 ${
                    mode === "login" ? styles.loginFooter : "mt-5 leading-5"
                  }`}
                >
                  Your ComePlayers account works across supported web, mobile,
                  and desktop experiences.{" "}
                  <Link
                    href="/help-center"
                    className="text-slate-300 hover:text-white"
                  >
                    Need help?
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
