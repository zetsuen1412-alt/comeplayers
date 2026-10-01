import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";


export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) throw Object.assign(new Error("Hanya admin yang dapat membuka bukti Telegram."), { status: 403 });
    const url = new URL(request.url);\n    const ref = url.searchParams.get("ref")?.trim();
    if (!ref) return Response.json({ error: "Kode order wajib diisi." }, { status: 400 });

    const [
      { data: order, error: orderError },
      { data: evidence, error: evidenceError },
      { data: assignments, error: assignmentsError },
      { data: contributions, error: contributionsError },
    ] = await Promise.all([
      supabaseAdmin.from("cp_payroll_telegram_orders").select("*").eq("order_ref", ref).maybeSingle(),
      supabaseAdmin.from("cp_payroll_telegram_evidence").select("*").eq("order_ref", ref).order("created_at", { ascending: true }),
      supabaseAdmin.from("cp_payroll_telegram_assignments").select("*").eq("order_ref", ref).order("created_at", { ascending: true }),
      supabaseAdmin.from("cp_payroll_telegram_gold_contributions").select("*").eq("order_ref", ref).order("created_at", { ascending: true }),
    ]);
    if (orderError) throw orderError;
    if (evidenceError) throw evidenceError;
    if (assignmentsError) throw assignmentsError;
    if (contributionsError) throw contributionsError;

    return Response.json({
      order,
      assignments: assignments || [],
      contributions: contributions || [],
      evidence: (evidence || []).map(row => ({
        id: row.id,
        orderRef: row.order_ref,
        assignmentId: row.assignment_id,
        contributionId: row.contribution_id,
        evidenceType: row.evidence_type,
        employeeCode: row.employee_code,
        division: row.division,
        mediaType: row.media_type,
        telegramChatId: row.telegram_chat_id,
        telegramMessageId: row.telegram_message_id,
        telegramUserId: row.telegram_user_id,
        createdAt: row.created_at,
        link: `${url.origin}/api/admin/payroll/telegram/evidence/file?id=${encodeURIComponent(row.id)}`,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = adminErrorStatus(error);
    return Response.json(
      { error: status >= 500 ? "Bukti Telegram belum dapat dimuat." : error instanceof Error ? error.message : "Permintaan tidak valid." },
      { status },
    );
  }
}
