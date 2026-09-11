import { NextRequest, NextResponse } from "next/server";
import { resolveRequestPreferences } from "@/lib/localization";
import { requiresPhoneAccess, requireVerifiedPhone } from "@/lib/phoneVerification";
import { requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError } from "@/lib/accountApi";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (request.method !== "OPTIONS" && requiresPhoneAccess(request.nextUrl.pathname, request.method)) {
      try { await requireVerifiedPhone(await requireAuthenticatedUser(request)); }
      catch (error) { return accountApiError(error, "Verify your phone number in Account settings to continue."); }
    }
    return NextResponse.next();
  }
  const response = NextResponse.next();
  const source = request.cookies.get("cp_currency_source")?.value;
  const hasManualPreference = source === "manual";

  if (hasManualPreference) {
    return response;
  }

  const preferences = resolveRequestPreferences({
    country:
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      request.headers.get("x-country-code"),
    acceptLanguage: request.headers.get("accept-language"),
  });
  const commonOptions = {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
  };

  response.cookies.set("cp_country", preferences.country, commonOptions);
  response.cookies.set("cp_locale", preferences.locale, commonOptions);
  response.cookies.set("cp_currency", preferences.currency, commonOptions);
  response.cookies.set("cp_currency_source", "geo", commonOptions);

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
