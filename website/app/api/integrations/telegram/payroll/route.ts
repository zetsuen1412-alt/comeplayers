import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import { flushPayrollTelegramOutbox, restorePayrollTelegramOrder, isTelegramAdmin, telegramAnswerCallback, telegramDeleteMessage, telegramWebhookSecret } from "@/lib/payrollTelegram";
import { parsePayrollTelegramUpdate, type PayrollTelegramUpdate } from "@/lib/payrollTelegramProtocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const expected = telegramWebhookSecret();
  if (expected.length < 16) return response({ error: "Webhook Telegram belum dikonfigurasi." }, 503);
  const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return response({ error: "Webhook Telegram tidak sah." }, 401);
  let update: PayrollTelegramUpdate;
  try {
    const reader = request.body?.getReader();
    if (!reader) return response({ error: "Payload kosong." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 256_000) { await reader.cancel(); return response({ error: "Payload terlalu besar." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const event = parsePayrollTelegramUpdate(update);
    if (!event) return response({ ok: true });
    const supabase = createSupabaseAdmin();
    if (event.action === "back" && update.callback_query) {
      const restored = await restorePayrollTelegramOrder(supabase, String(event.orderId ?? ""), event.chatId);
      try { await telegramAnswerCallback(update.callback_query.id, restored ? "Kembali ke order." : "Order tidak tersedia di percakapan ini.", !restored); }
      catch { /* A navigation acknowledgement must not create a new chat message. */ }
      return response({ ok: true });
    }
    const { error, data } = await supabase.rpc("cp_telegram_process_update", {
      p_update_id: update.update_id, p_event: event, p_is_admin: isTelegramAdmin(event.userId),
    });
    // Unexpected database failures return 500 for Telegram retry. No update was committed.
    if (error) return response({ error: "Telegram Payroll belum dapat memproses update." }, 500);
    if (update.callback_query) {
      try { await telegramAnswerCallback(update.callback_query.id, data?.rejected ? String(data.text).slice(0, 180) : "Diproses.", Boolean(data?.rejected)); }
      catch { /* Callback acknowledgement expiry cannot roll back the durable action. */ }
    }
    await flushPayrollTelegramOutbox(supabase);
    if (event.action === "media" && !data?.rejected && !data?.ignored && Number.isSafeInteger(Number(event.messageId))) {
      try { await telegramDeleteMessage(event.chatId, Number(event.messageId)); }
      catch { /* Bot needs delete-message permission for a perfectly clean group. Evidence stays recorded either way. */ }
    }
    return response({ ok: true, duplicate: Boolean(data?.duplicate) });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /tidak valid/.test(error.message))) return response({ error: "Update Telegram tidak valid." }, 400);
    // Never log Telegram transport errors: their URL can contain the bot credential.
    return response({ error: "Layanan Telegram Payroll belum tersedia." }, 500);
  }
}
