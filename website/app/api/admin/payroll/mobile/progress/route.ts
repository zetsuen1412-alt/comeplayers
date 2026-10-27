import { requireMonitorAccess, requireOwnEmployee } from "@/lib/monitorAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import { MobileTelegramError, isSupportedProofImage, sendMobileProofPhoto, verifyFH3ProofGroup } from "@/lib/payrollMobileProof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_IMAGE = 7 * 1024 * 1024;
const MAX_UPLOAD = MAX_IMAGE + 16 * 1024;
const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
});

export async function POST(request: Request) {
  let eventId = "";
  let adminId = "";
  let service: Awaited<ReturnType<typeof requireMonitorAccess>>["supabaseAdmin"] | undefined;
  let deliveryConfirmed = false;
  let pauseReport = false;
  let dailyReport = false;
  try {
    const context = await requireMonitorAccess(request, { allowPublic: true, rosterOnly: true });
    const { actor, supabaseAdmin } = context;
    adminId = actor.id;
    service = supabaseAdmin;
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
      return respond({ error: "Unggah bukti menggunakan formulir foto." }, 415);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > MAX_UPLOAD)
      return respond({ error: "Ukuran unggahan maksimal 7 MB." }, 413);
    // Enforce a byte cap even for chunked requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Foto wajib disisipkan." }, 400);
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_UPLOAD) { await reader.cancel(); return respond({ error: "Ukuran unggahan maksimal 7 MB." }, 413); }
      chunks.push(value);
    }
    const raw = new Uint8Array(received);
    let index = 0;
    for (const chunk of chunks) { raw.set(chunk, index); index += chunk.byteLength; }
    const parsed = await new Request(request.url, {
      method: "POST", headers: { "Content-Type": request.headers.get("content-type")! },
      body: raw as unknown as BodyInit,
    }).formData();
    const ref = parsed.get("orderRef");
    const code = parsed.get("employeeCode");
    const action = parsed.get("action");
    const picture = parsed.get("photo");
    const startEventId = parsed.get("startEventId");
    const pauseRevision = parsed.get("pauseRevision");
    const dayNumber = parsed.get("dayNumber"), dailyRevision = parsed.get("dailyRevision"), dailyCycleId = parsed.get("dailyCycleId");
    dailyReport = dayNumber !== null || dailyRevision !== null || dailyCycleId !== null;
    if (typeof ref !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(ref)
      || typeof code !== "string" || !/^[\w-]{1,100}$/.test(code)
      || (action !== "start" && action !== "done" && action !== "pause" && action !== "continue")
      || !(picture instanceof File) || picture.size <= 0 || picture.size > MAX_IMAGE
      || !["image/jpeg", "image/png"].includes(picture.type)) {
      return respond({ error: "Data order, aksi, atau foto PNG/JPEG tidak valid (maks 7 MB)." }, 400);
    }
    pauseReport = action === "pause" || action === "continue";
    if (dailyReport && (typeof dayNumber !== "string" || !/^[1-9][0-9]{0,2}$/.test(dayNumber) || Number(dayNumber) > 366
      || typeof dailyRevision !== "string" || !/^(0|[1-9][0-9]{0,6})$/.test(dailyRevision) || Number(dailyRevision) > 1_000_000
      || typeof dailyCycleId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(dailyCycleId)))
      return respond({ error: "Hari atau progres berubah. Segarkan Tugas sebelum mengirim." }, 409);
    if (pauseReport && !dailyReport && (typeof startEventId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(startEventId)
      || typeof pauseRevision !== "string" || !/^(0|[1-9][0-9]{0,6})$/.test(pauseRevision) || Number(pauseRevision) > 1_000_000))
      return respond({ error: "Status PAUSE belum tersedia atau berubah. Segarkan Tugas sebelum mengirim." }, 409);
    requireOwnEmployee(context, code);
    const bytes = new Uint8Array(await picture.arrayBuffer());
    if (!isSupportedProofImage(bytes, picture.type))
      return respond({ error: "Bukti bukan foto PNG/JPEG yang valid." }, 400);
    const { data: claim, error: claimError } = await supabaseAdmin.rpc(dailyReport ? "cp_monitor_daily_begin" : pauseReport ? "cp_monitor_pause_begin" : "cp_mobile_proof_begin", {
      p_order_ref: ref, p_employee_code: code, p_action: action, p_actor_id: adminId,
      ...(dailyReport ? { p_day: Number(dayNumber), p_revision: Number(dailyRevision), p_cycle: dailyCycleId }
        : pauseReport ? { p_start_event_id: startEventId, p_revision: Number(pauseRevision) } : {}),
    });
    if (claimError) {
      if (claimError.code === "P0001" || claimError.code === "23505")
        return respond({ error: "Status order, pekerja, atau grup Telegram belum siap. " +
          "Gunakan aplikasi terbaru, segarkan hari/progres Tugas, dan lanjutkan PAUSE dengan CONTINUE sebelum DONE. Jika sudah menekan kirim, periksa grup sebelum mengulang." }, 409);
      throw claimError;
    }
    if (claim?.alreadySent) return respond({
      ok: true, alreadySent: true, caption: claim.caption, chatTitle: claim.chatTitle,
      ...(pauseReport ? { status: claim.status, pauseRevision: claim.pauseRevision } : {}),
    });
    if (!claim?.ok || typeof claim.eventId !== "string"
      || !Number.isSafeInteger(claim.chatId) || typeof claim.caption !== "string")
      throw new Error("Claim bukti tidak valid");
    eventId = claim.eventId;
    // Fail closed if the database still points to a private leader chat or another Telegram group.
    await verifyFH3ProofGroup(claim.chatId);
    const uploaded = await sendMobileProofPhoto({
      chatId: claim.chatId, caption: claim.caption, bytes, mime: picture.type,
      replyToMessageId: Number.isSafeInteger(claim.replyToMessageId) ? claim.replyToMessageId : undefined,
    });
    deliveryConfirmed = true;
    const { data: result, error: commitError } = await supabaseAdmin.rpc(dailyReport ? "cp_monitor_daily_finish" : pauseReport ? "cp_monitor_pause_finish" : "cp_mobile_proof_finish", {
      p_event_id: eventId, p_actor_id: adminId, p_message_id: uploaded.messageId,
      p_file_id: uploaded.fileId,
    });
    if (commitError || !result?.ok)
      throw new MobileTelegramError(
        "Foto sudah terkirim, tetapi status website belum terkonfirmasi. Admin perlu rekonsiliasi; jangan kirim ulang.",
        "unknown");
    return respond({ ...result, messageId: uploaded.messageId });
  } catch (error) {
    if (eventId && service && adminId) {
      // Unknown delivery MUST NOT be retried automatically: Telegram has no idempotency key.
      const status = error instanceof MobileTelegramError ? error.outcome : "unknown";
      try {
        await service.rpc(dailyReport ? "cp_monitor_daily_mark" : pauseReport ? "cp_monitor_pause_mark" : "cp_mobile_proof_mark", {
          p_event_id: eventId, p_actor_id: adminId,
          p_status: deliveryConfirmed ? "unknown" : status,
        });
      } catch { /* Preserve ambiguous claim for manual reconciliation. */ }
    }
    if (error instanceof MobileTelegramError)
      return respond({ error: error.message, uncertain: error.outcome === "unknown" || deliveryConfirmed },
        error.outcome === "unknown" || deliveryConfirmed ? 409 : 502);
    const status = adminErrorStatus(error);
    return respond({ error: status === 401 ? "Sesi habis; silakan masuk kembali."
      : status === 403 ? "Akses Payroll ditolak."
      : "Kirim bukti belum selesai; cek grup dan status order sebelum mencoba lagi." },
      status === 401 || status === 403 || status === 429 ? status : 503);
  }
}
