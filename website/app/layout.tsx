import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import SiteFooter from "@/components/layout/SiteFooter";
import {
  normalizeCountry,
  normalizeCurrency,
  normalizeLocale,
  resolveRequestPreferences,
} from "@/lib/localization";
import MainHeader from "./components/MainHeader";
import ConditionalChrome from "./components/ConditionalChrome";
import DeploymentAutoRefresh from "./components/DeploymentAutoRefresh";
import "./globals.css";
import MfaSessionGate from "@/components/account/MfaSessionGate";
import AccountSessionGuard from "@/components/account/AccountSessionGuard";
import LiveUpdates from "@/components/LiveUpdates";
import AccountNotificationCenter from "@/components/messages/AccountNotificationCenter";



const SITE_URL = "https://www.comeplayers.com";
const LOGO_URL = "/brand/comeplayers-cp-v6.png";
const APP_ICON_URL = "/brand/comeplayers-app-icon-2026.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  applicationName: "ComePlayers",

  title: {
    default: "ComePlayers | Trusted Gaming Marketplace",
    template: "%s | ComePlayers",
  },

  description:
    "Trusted gaming marketplace powered by EvoGaming. Buy and sell game accounts, items, coins, top-ups, gift cards, software, and gaming services securely.",

  keywords: [
    "ComePlayers",
    "EvoGaming",
    "gaming marketplace",
    "game accounts",
    "game items",
    "game coins",
    "game top up",
    "gift cards",
    "gaming services",
    "buy games",
    "sell games",
  ],

  authors: [
    {
      name: "ComePlayers",
      url: SITE_URL,
    },
  ],

  creator: "ComePlayers",
  publisher: "ComePlayers",

  alternates: {
    canonical: "/",
  },

  icons: {
    icon: [
      {
        url: APP_ICON_URL,
        type: "image/png",
        sizes: "1254x1254",
      },
    ],
    shortcut: APP_ICON_URL,
    apple: [
      {
        url: APP_ICON_URL,
        type: "image/png",
        sizes: "1254x1254",
      },
    ],
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "ComePlayers",
    title: "ComePlayers | Trusted Gaming Marketplace",
    description:
      "Trusted gaming marketplace powered by EvoGaming. Buy and sell gaming products securely.",
    images: [
      {
        url: LOGO_URL,
        width: 1254,
        height: 1254,
        alt: "ComePlayers CP Logo",
        type: "image/png",
      },
    ],
  },

  twitter: {
    card: "summary",
    title: "ComePlayers | Trusted Gaming Marketplace",
    description:
      "Trusted gaming marketplace powered by EvoGaming. Buy and sell gaming products securely.",
    images: [LOGO_URL],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  category: "gaming",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ComePlayers",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#020617",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const requestDefaults = resolveRequestPreferences({
    country:
      headerStore.get("x-vercel-ip-country") ||
      headerStore.get("cf-ipcountry") ||
      headerStore.get("x-country-code"),
    acceptLanguage: headerStore.get("accept-language"),
  });
  const hasManualPreferences =
    cookieStore.get("cp_currency_source")?.value === "manual";

  const country = normalizeCountry(
    (hasManualPreferences ? cookieStore.get("cp_country")?.value : null) ||
      requestDefaults.country
  );
  const locale = normalizeLocale(
    (hasManualPreferences ? cookieStore.get("cp_locale")?.value : null) ||
      requestDefaults.locale
  );
  const currency = normalizeCurrency(
    (hasManualPreferences ? cookieStore.get("cp_currency")?.value : null) ||
      requestDefaults.currency
  );

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[#020617] text-white">
        <DeploymentAutoRefresh />
        <MfaSessionGate />
        <AccountSessionGuard />
        <LiveUpdates />
        <AccountNotificationCenter />
        <CurrencyProvider
          key={`${country}:${locale}:${currency}`}
          country={country}
          locale={locale}
          currency={currency}
        >
          <ConditionalChrome
            header={<MainHeader />}
            footer={<SiteFooter />}
          >
            {children}
          </ConditionalChrome>
        </CurrencyProvider>
      </body>
    </html>
  );
}
