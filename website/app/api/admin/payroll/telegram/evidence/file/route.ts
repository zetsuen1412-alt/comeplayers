import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { telegramDownloadFile } from "@/lib/payrollTelegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) throw Object.assign(new Error("Hanya admin yang dapat membuka bukti Telegram."), { status: 403 });
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return Response.json({ error: "ID bukti wajib diisi." }, { status: 400 });

    const { data: evidence, error } = await supabaseAdmin
      .from("cp_payroll_telegram_evidence")
      .select("telegram_file_id,media_type,order_ref")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!evidence?.telegram_file_id) return Response.json({ error: "Bukti tidak ditemukan." }, { status: 404 });

    const file = await telegramDownloadFile(String(evidence.telegram_file_id));
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="bukti-${String(evidence.order_ref || "telegram").replace(/[^A-Za-z0-9_-]/g, "_")}-${evidence.media_type === "video" ? "video" : "foto"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = adminErrorStatus(error);
    return Response.json(
      { error: status >= 500 ? "Bukti Telegram belum dapat dibuka." : error instanceof Error ? error.message : "Permintaan tidak valid." },
      { status },
    );
  }
}
