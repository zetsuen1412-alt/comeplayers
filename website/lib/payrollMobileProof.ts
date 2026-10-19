import "server-only";

/** Outbound-only Telegram transport for verified mobile work evidence. No bot token is sent to Android. */
export class MobileTelegramError extends Error {
  constructor(message: string, readonly outcome: "failed" | "unknown") { super(message); }
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
  form.set("photo", new Blob([Buffer.from(input.bytes)], { type: input.mime }),
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
