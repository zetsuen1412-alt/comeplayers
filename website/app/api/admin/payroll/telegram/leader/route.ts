import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { telegramGetPrivateChat } from "@/lib/payrollTelegram";

export async function POST(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    if (!actor.isAdmin) throw Object.assign(new Error("Hanya admin yang dapat menentukan leader."), { status: 403 });
    const body = await request.json();
    const userId = Number(body?.userId);
    const divisions = body?.divisions;
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Array.isArray(divisions) || !divisions.length || divisions.length > 5
      || divisions.some(d => !["FH1", "FH2", "FH3", "ADMIN", "BANDAR"].includes(d))) {
      throw Object.assign(new Error("Isi ID Telegram angka dan pilih divisi leader."), { status: 400 });
    }
    let chat;
    try { chat = await telegramGetPrivateChat(userId); }
    catch { throw Object.assign(new Error("Leader harus membuka bot dan mengirim /start, lalu /myid terlebih dahulu. Periksa kembali ID-nya."), { status: 409 }); }
    if (chat.type !== "private" || chat.id !== userId) throw Object.assign(new Error("Gunakan ID akun pribadi leader."), { status: 400 });
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(userId);
    const { error } = await supabaseAdmin.rpc("cp_telegram_configure_leader", { p_divisions: [...new Set(divisions)], p_user_id: userId, p_name: name });
    if (error) throw error;
    return Response.json({ ok: true, name, divisions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : adminErrorStatus(error);
    return Response.json({ error: status >= 500 ? "Pengaturan leader belum dapat disimpan." : error instanceof Error ? error.message : "Permintaan tidak valid." }, { status });
  }
}
