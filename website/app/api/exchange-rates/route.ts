import { NextResponse } from "next/server";
import {
  fallbackExchangeRateMap,
  fetchFrankfurterRates,
  FRANKFURTER_REVALIDATE_SECONDS,
} from "@/lib/frankfurter";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await fetchFrankfurterRates();
    return NextResponse.json(
      {
        base: "USD",
        source: "live",
        asOf: result.asOf,
        rates: result.rates,
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${FRANKFURTER_REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        base: "USD",
        source: "backup",
        asOf: null,
        rates: fallbackExchangeRateMap(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  }
}
