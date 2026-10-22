import type { requirePayrollAccess } from "@/lib/payrollAccess";
import type { CompletedProof, CompletedReceipt } from "@/lib/payrollMobileCompleted";

type Service = Awaited<ReturnType<typeof requirePayrollAccess>>["supabaseAdmin"];

/** Historical receipts remain visible after archiving; only the bound pinned sender supplies their metadata. */
export async function loadCompletedMonitorEvidence(service: Service) {
  const { data: group, error } = await service.from("cp_payroll_telegram_divisions")
    .select("chat_id,fh3_order_sender_id").eq("division", "FH3").eq("active", true).maybeSingle();
  const chat = Number(group?.chat_id), sender = Number(group?.fh3_order_sender_id);
  if (error || !Number.isSafeInteger(chat) || chat >= 0 || !Number.isSafeInteger(sender) || sender <= 0)
    throw new Error("Sumber Telegram FH3 belum terverifikasi.");
  const receipts: CompletedReceipt[] = [], proofs: CompletedProof[] = [];
  for (let offset = 0; offset <= 15000; offset += 1000) {
    const { data, error: readError } = await service.from("cp_fh3_telegram_manual_orders")
      .select("order_ref,chat_id,game,duration,task,active")
      .eq("chat_id", chat).eq("admin_user_id", sender).order("order_ref").range(offset, offset + 999);
    if (readError) throw readError;
    receipts.push(...(data ?? []));
    if (receipts.length > 15000) throw new Error("Riwayat order perlu filter periode.");
    if ((data?.length ?? 0) < 1000) break;
  }
  for (let offset = 0; offset <= 15000; offset += 1000) {
    const { data, error: readError } = await service.from("cp_mobile_order_proof")
      .select("order_ref,employee_code,chat_id,action,status,telegram_message_id,sent_at")
      .eq("chat_id", chat).eq("action", "done").eq("status", "sent").order("order_ref").range(offset, offset + 999);
    if (readError) throw readError;
    proofs.push(...(data ?? []));
    if (proofs.length > 15000) throw new Error("Riwayat laporan perlu filter periode.");
    if ((data?.length ?? 0) < 1000) break;
  }
  return { receipts, proofs };
}
