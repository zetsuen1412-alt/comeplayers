import { NextResponse } from "next/server";

// New top-ups use a persisted CPWallet quote instead of the legacy fixed USD rate.
export async function POST() {
  return NextResponse.json({ error: "This top-up form has been replaced. Open CPWallet to review a current quote.", url: "/wallet/topup" }, { status: 410 });
}
