import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import {
  normalizeCountry,
  normalizeCurrency,
  normalizeLocale,
  resolveRequestPreferences,
} from "@/lib/localization";
import SiteChrome from "./components/SiteChrome";
import "./globals.css";



const SITE_URL = "https://www.comeplayers.com";
const LOGO_URL = "/brand/comeplayers-cp-v6.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  applicationName: "ComePlayers",

  title: {
    default: "ComePlayers | Play, Connect, Trade",
    template: "%s | ComePlayers",
  },

  description:
    "ComePlayers brings gaming chat, squad connections, and a trusted digital marketplace together in one platform.",

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
        url: LOGO_URL,
        type: "image/png",
        sizes: "any",
      },
    ],
    shortcut: LOGO_URL,
    apple: [
      {
        url: LOGO_URL,
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },

  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "/",
    siteName: "ComePlayers",
    title: "ComePlayers | Play, Connect, Trade",
    description:
      "Connect with players, build your squad, and explore the ComePlayers gaming marketplace.",
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
    title: "ComePlayers | Play, Connect, Trade",
    description:
      "Connect with players, build your squad, and explore the ComePlayers gaming marketplace.",
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

  const country = normalizeCountry(
    cookieStore.get("cp_country")?.value || requestDefaults.country
  );
  const locale = normalizeLocale(
    cookieStore.get("cp_locale")?.value || requestDefaults.locale
  );
  const currency = normalizeCurrency(
    cookieStore.get("cp_currency")?.value || requestDefaults.currency
  );

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[#020617] text-white">
        <CurrencyProvider
          country={country}
          locale={locale}
          currency={currency}
        >
          <SiteChrome>{children}</SiteChrome>
        </CurrencyProvider>
      </body>
    </html>
  );
}
