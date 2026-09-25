import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import { flushPayrollTelegramOutbox } from "@/lib/payrollTelegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const a = Buffer.from(request.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await flushPayrollTelegramOutbox(createSupabaseAdmin())); }
  catch { return Response.json({ error: "Antrean Telegram belum tersedia." }, { status: 503 }); }
}
