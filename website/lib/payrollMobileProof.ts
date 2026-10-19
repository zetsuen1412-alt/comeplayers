import "server-only";

/** Outbound-only Telegram transport for verified mobile work evidence. No bot token is sent to Android. */
export class MobileTelegramError extends Error {
  constructor(message: string, readonly outcome: "failed" | "unknown") { super(message); }
}

/**
 * The screenshot names the target group, but never reveals its numeric Telegram chat ID.
 * A Telegram admin must bind the real group via /bind FH3. Validate the real live
 * group from Telegram (not an untrusted cached DB display label) on every upload.
 * Canonical comparison tolerates emojis and spacing: "🔥 EVO🔥 Ilham FH3".
 */
export const FH3_PROOF_GROUP = "EVO Ilham FH3";
export const normalizeTelegramGroupTitle = (name: string) =>
  name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function verifyFH3ProofGroup(chatId: number): Promise<string> {
  if (!Number.isSafeInteger(chatId) || chatId >= 0)
    throw new MobileTelegramError("Tujuan FH3 masih berupa chat pribadi. Hubungkan grup 🔥 EVO🔥 Ilham FH3 lewat /bind FH3.", "failed");
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (token.length < 20)
    throw new MobileTelegramError("Bot Telegram belum dikonfigurasi di server.", "failed");
  let response: Response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + "/getChat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }), cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MobileTelegramError("Grup Telegram belum dapat diverifikasi. Foto belum dikirim.", "failed");
  }
  let payload: { ok?: boolean; result?: { id?: number; type?: string; title?: string } };
  try { payload = await response.json(); }
  catch { throw new MobileTelegramError("Respons pemeriksaan grup Telegram tidak valid.", "failed"); }
  if (!response.ok || !payload.ok || !payload.result)
    throw new MobileTelegramError("Bot belum bisa mengakses grup FH3. Tambahkan bot dan hubungkan grup lewat /bind FH3.", "failed");
  const { id, type, title } = payload.result;
  if (id !== chatId || (type !== "group" && type !== "supergroup")
    || !title || normalizeTelegramGroupTitle(title) !== normalizeTelegramGroupTitle(FH3_PROOF_GROUP))
    throw new MobileTelegramError("Grup FH3 terhubung bukan 🔥 EVO🔥 Ilham FH3. Foto tidak dikirim ke grup lain.", "failed");
  return title;
}

export function isSupportedProofImage(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (mime === "image/png")
    return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  return false;
}

export async function sendMobileProofPhoto(input: {
  chatId: number; caption: string; bytes: Uint8Array; mime: string; replyToMessageId?: number;
}): Promise<{ messageId: number; fileId: string }> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (token.length < 20) throw new MobileTelegramError("Bot Telegram belum dikonfigurasi di server.", "failed");
  if (!isSupportedProofImage(input.bytes, input.mime))
    throw new MobileTelegramError("File harus gambar PNG/JPEG yang valid.", "failed");
  const form = new FormData();
  form.set("chat_id", String(input.chatId));
  form.set("caption", input.caption);
  if (input.replyToMessageId && Number.isSafeInteger(input.replyToMessageId))
    form.set("reply_parameters", JSON.stringify({ message_id: input.replyToMessageId, allow_sending_without_reply: true }));
  // Buffer.from yields a concrete ArrayBuffer-backed copy accepted by Node Blob.
  form.set("photo", new Blob([Buffer.from(input.bytes) as unknown as BlobPart], { type: input.mime }),
    input.mime === "image/png" ? "evidence.png" : "evidence.jpg");
  let reply: Response;
  try {
    reply = await fetch("https://api.telegram.org/bot" + token + "/sendPhoto", {
      method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new MobileTelegramError(
      "Koneksi Telegram terputus; status kiriman perlu diperiksa admin sebelum mengulang.", "unknown");
  }
  let payload: { ok?: boolean; result?: { message_id?: number; photo?: Array<{ file_id: string }> } };
  try { payload = await reply.json(); }
  catch { throw new MobileTelegramError("Respons Telegram tidak jelas; periksa grup sebelum mengulang.", "unknown"); }
  if (!reply.ok || !payload.ok)
    throw new MobileTelegramError("Telegram menolak foto. Periksa akses bot dan grup FH3.", "failed");
  const messageId = payload.result?.message_id;
  const photos = payload.result?.photo;
  const fileId = photos?.[photos.length - 1]?.file_id;
  if (!Number.isSafeInteger(messageId) || !messageId || !fileId)
    throw new MobileTelegramError("Telegram belum mengembalikan bukti pengiriman; periksa grup.", "unknown");
  return { messageId, fileId };
}
