import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ now: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
