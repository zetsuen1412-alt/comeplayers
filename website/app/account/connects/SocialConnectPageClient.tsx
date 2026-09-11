"use client";

import type { Provider, UserIdentity } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AccountShell from "@/components/account/AccountShell";
import { supabase } from "@/lib/supabase";

type Notice = {
  type: "success" | "error" | "info";
  message: string;
};

type ProviderDefinition = {
  id: string;
  label: string;
  icon: string;
  authProvider?: Provider;
  aliases: string[];
  description: string;
  unavailableMessage?: string;
  fallbackHref?: string;
  fallbackLabel?: string;
};

const PENDING_PROVIDER_KEY = "comeplayers_pending_identity_link";

function customProvider(value: string | undefined): Provider | undefined {
  const normalized = value?.trim();
  if (!normalized?.startsWith("custom:")) return undefined;
  return normalized as Provider;
}

const providerDefinitions: ProviderDefinition[] = [
  {
    id: "facebook",
    label: "Facebook",
    icon: "f",
    authProvider: "facebook",
    aliases: ["facebook"],
    description: "Use your Facebook identity to sign in to the same ComePlayers account.",
  },
  {
    id: "google",
    label: "Google",
    icon: "G",
    authProvider: "google",
    aliases: ["google"],
    description: "Use your Google identity to sign in to the same ComePlayers account.",
  },
  {
    id: "discord",
    label: "Discord",
    icon: "D",
    authProvider: "discord",
    aliases: ["discord"],
    description: "Use your Discord identity to sign in to the same ComePlayers account.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: "♪",
    authProvider: customProvider(process.env.NEXT_PUBLIC_SOCIAL_TIKTOK_PROVIDER),
    aliases: [
      "tiktok",
      process.env.NEXT_PUBLIC_SOCIAL_TIKTOK_PROVIDER || "custom:tiktok",
    ],
    description: "Connect TikTok through a custom OIDC provider configured in Supabase.",
    unavailableMessage:
      "TikTok linking needs a custom OIDC provider or identity broker. Configure it in Supabase and set NEXT_PUBLIC_SOCIAL_TIKTOK_PROVIDER.",
  },
  {
    id: "twitter",
    label: "Twitter / X",
    icon: "𝕏",
    authProvider: "x",
    aliases: ["twitter", "x"],
    description: "Use your X identity to sign in to the same ComePlayers account.",
  },
  {
    id: "paypal",
    label: "PayPal",
    icon: "P",
    authProvider: customProvider(process.env.NEXT_PUBLIC_SOCIAL_PAYPAL_PROVIDER),
    aliases: [
      "paypal",
      process.env.NEXT_PUBLIC_SOCIAL_PAYPAL_PROVIDER || "custom:paypal",
    ],
    description:
      "Link PayPal as a login identity through custom OIDC, or manage it as a seller payout account.",
    unavailableMessage:
      "PayPal login linking is not configured. You can still manage PayPal as an encrypted payout account.",
    fallbackHref: "/seller/payouts",
    fallbackLabel: "Manage payout",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: "◎",
    authProvider: customProvider(process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_PROVIDER),
    aliases: [
      "instagram",
      process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_PROVIDER || "custom:instagram",
    ],
    description: "Connect Instagram through a custom OIDC provider configured in Supabase.",
    unavailableMessage:
      "Instagram linking needs a custom OIDC provider or identity broker. Configure it in Supabase and set NEXT_PUBLIC_SOCIAL_INSTAGRAM_PROVIDER.",
  },
  {
    id: "weibo",
    label: "Weibo",
    icon: "W",
    authProvider: customProvider(process.env.NEXT_PUBLIC_SOCIAL_WEIBO_PROVIDER),
    aliases: [
      "weibo",
      process.env.NEXT_PUBLIC_SOCIAL_WEIBO_PROVIDER || "custom:weibo",
    ],
    description: "Connect Weibo through a custom OIDC provider configured in Supabase.",
    unavailableMessage:
      "Weibo linking needs a custom OIDC provider or identity broker. Configure it in Supabase and set NEXT_PUBLIC_SOCIAL_WEIBO_PROVIDER.",
  },
];

function normalizeProvider(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function identityMatches(identity: UserIdentity, provider: ProviderDefinition) {
  const identityProvider = normalizeProvider(identity.provider);
  return provider.aliases.some(
    (alias) => normalizeProvider(alias) === identityProvider
  );
}

function identityDisplayName(identity: UserIdentity) {
  const metadata = (identity.identity_data || {}) as Record<string, unknown>;
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.username,
    metadata.preferred_username,
    metadata.email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Connected account";
}

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("manual linking") || normalized.includes("identity linking")) {
    return "Manual identity linking is disabled in Supabase. Enable it in Authentication settings before linking another login method.";
  }

  if (normalized.includes("provider is not enabled")) {
    return "This login provider is not enabled in Supabase Authentication settings.";
  }

  if (normalized.includes("already been linked") || normalized.includes("already linked")) {
    return "That social account is already linked to a ComePlayers account.";
  }

  return message;
}

export default function SocialConnectPageClient() {
  const router = useRouter();
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const linkedProviderCount = useMemo(
    () =>
      providerDefinitions.filter((provider) =>
        identities.some((identity) => identityMatches(identity, provider))
      ).length,
    [identities]
  );

  const loadConnections = useCallback(async () => {
    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase.auth.getUserIdentities();

    if (error) {
      setNotice({ type: "error", message: friendlyAuthError(error.message) });
      setLoading(false);
      return;
    }

    const nextIdentities = data?.identities || [];
    setIdentities(nextIdentities);
    setLoading(false);

    if (typeof window === "undefined") return;

    const searchParams = new URLSearchParams(window.location.search);
    const oauthError =
      searchParams.get("error_description") || searchParams.get("error");
    const pendingProviderId =
      window.sessionStorage.getItem(PENDING_PROVIDER_KEY) ||
      searchParams.get("link_provider");

    if (oauthError) {
      setNotice({ type: "error", message: decodeURIComponent(oauthError) });
    } else if (pendingProviderId) {
      const pendingProvider = providerDefinitions.find(
        (provider) => provider.id === pendingProviderId
      );
      const linked =
        pendingProvider &&
        nextIdentities.some((identity) =>
          identityMatches(identity, pendingProvider)
        );

      setNotice(
        linked
          ? {
              type: "success",
              message: `${pendingProvider?.label || "Social account"} linked successfully.`,
            }
          : {
              type: "info",
              message:
                "The provider returned to ComePlayers, but no new identity was detected. Check the provider and Supabase redirect configuration.",
            }
      );
    }

    window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);

    if (
      searchParams.has("link_provider") ||
      searchParams.has("error") ||
      searchParams.has("error_description")
    ) {
      searchParams.delete("link_provider");
      searchParams.delete("error");
      searchParams.delete("error_description");
      const cleanQuery = searchParams.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`
      );
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConnections();
  }, [loadConnections]);

  async function linkIdentity(provider: ProviderDefinition) {
    if (!provider.authProvider) {
      if (provider.fallbackHref) {
        router.push(provider.fallbackHref);
        return;
      }

      setNotice({
        type: "info",
        message:
          provider.unavailableMessage ||
          `${provider.label} is not configured as a login provider.`,
      });
      return;
    }

    setActiveProvider(provider.id);
    setNotice(null);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(PENDING_PROVIDER_KEY, provider.id);
    }

    const redirectTo = `${window.location.origin}/account/connects?link_provider=${encodeURIComponent(
      provider.id
    )}`;

    const { data, error } = await supabase.auth.linkIdentity({
      provider: provider.authProvider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
      setNotice({ type: "error", message: friendlyAuthError(error.message) });
      setActiveProvider(null);
      return;
    }

    if (!data.url) {
      window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
      setNotice({
        type: "error",
        message: "The provider did not return an authorization URL.",
      });
      setActiveProvider(null);
      return;
    }

    window.location.assign(data.url);
  }

  async function unlinkIdentity(
    provider: ProviderDefinition,
    identity: UserIdentity
  ) {
    if (identities.length <= 1) {
      setNotice({
        type: "error",
        message:
          "You cannot remove your only login identity. Link another login method first.",
      });
      return;
    }

    const confirmed = window.confirm(
      `Unlink ${provider.label}? You will no longer be able to sign in with that identity.`
    );

    if (!confirmed) return;

    setActiveProvider(provider.id);
    setNotice(null);

    const { error } = await supabase.auth.unlinkIdentity(identity);

    if (error) {
      setNotice({ type: "error", message: friendlyAuthError(error.message) });
      setActiveProvider(null);
      return;
    }

    setNotice({
      type: "success",
      message: `${provider.label} was unlinked successfully.`,
    });
    setActiveProvider(null);
    await loadConnections();
  }

  return (
    <AccountShell>
      <section className="border-b border-amber-400/15 px-6 py-7 md:px-8 md:py-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-amber-400/35 bg-amber-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
              Social Connect
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              Connected login accounts
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Link trusted login providers to the same ComePlayers account and
              keep an additional sign-in method available.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadConnections()}
            disabled={loading || activeProvider !== null}
            className="min-h-11 shrink-0 rounded-xl border border-amber-400/35 bg-amber-400/5 px-5 text-sm font-black text-amber-300 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh connections"}
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3">
            <p className="text-xs font-bold text-slate-500">Linked providers</p>
            <p className="mt-1 text-2xl font-black text-emerald-300">
              {linkedProviderCount}
            </p>
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3">
            <p className="text-xs font-bold text-slate-500">Total login identities</p>
            <p className="mt-1 text-2xl font-black text-amber-300">
              {identities.length}
            </p>
          </div>
        </div>

        {notice ? (
          <div
            className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                : notice.type === "success"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-100"
            }`}
            role={notice.type === "error" ? "alert" : "status"}
          >
            {notice.message}
          </div>
        ) : null}
      </section>

      <section className="px-6 py-7 md:px-8 md:py-8">
        <div className="mb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-400">
            Login providers
          </p>
          <h2 className="mt-2 text-xl font-black md:text-2xl">
            Manage your connections
          </h2>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {providerDefinitions.map((provider) => {
            const identity = identities.find((item) =>
              identityMatches(item, provider)
            );
            const isConnected = Boolean(identity);
            const isBusy = activeProvider === provider.id;
            const isConfigured = Boolean(provider.authProvider);
            const actionLabel = isBusy
              ? "Please wait..."
              : isConnected
                ? "Unlink"
                : isConfigured
                  ? "Link account"
                  : provider.fallbackLabel || "Setup required";

            return (
              <article
                key={provider.id}
                className="flex min-h-[154px] flex-col justify-between rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:border-amber-400/25"
              >
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/35 bg-amber-400/10 font-black text-amber-300">
                    {provider.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-white">{provider.label}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                          isConnected
                            ? "bg-emerald-400/10 text-emerald-300"
                            : isConfigured
                              ? "bg-white/5 text-slate-400"
                              : "bg-amber-400/10 text-amber-300"
                        }`}
                      >
                        {isConnected
                          ? "Linked"
                          : isConfigured
                            ? "Not linked"
                            : "Setup required"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {provider.description}
                    </p>
                    {identity ? (
                      <p className="mt-2 truncate text-xs font-bold text-amber-300">
                        {identityDisplayName(identity)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={loading || activeProvider !== null}
                    onClick={() =>
                      identity
                        ? void unlinkIdentity(provider, identity)
                        : void linkIdentity(provider)
                    }
                    className={`min-h-10 rounded-xl border px-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isConnected
                        ? "border-rose-400/45 text-rose-300 hover:bg-rose-500/10"
                        : isConfigured
                          ? "border-yellow-300/65 bg-gradient-to-r from-yellow-300 to-amber-400 text-black hover:brightness-110"
                          : provider.fallbackHref
                            ? "border-amber-400/50 text-amber-300 hover:bg-amber-400/10"
                            : "border-white/15 text-slate-400 hover:border-amber-400/40 hover:text-amber-300"
                    }`}
                  >
                    {actionLabel}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.045] p-4 text-xs leading-5 text-amber-100/80">
          Providers marked as setup required need valid Supabase or custom OIDC
          configuration before they can be linked. ComePlayers never displays a
          provider as connected without a verified identity.
        </div>
      </section>
    </AccountShell>
  );
}
