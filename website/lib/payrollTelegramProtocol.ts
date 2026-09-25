/** Telegram transport parsing only. Database RPC is the authoritative state machine. */
export type TelegramEvent = Record<string, unknown> & { action: string; userId: number; chatId: number };
type User = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
type Media = { file_id: string; file_unique_id: string };
type Message = { message_id: number; from?: User; chat: { id: number; type: string; title?: string; username?: string }; text?: string; photo?: Media[]; video?: Media };
export type PayrollTelegramUpdate = { update_id: number; message?: Message; callback_query?: { id: string; from: User; message?: Message; data?: string } };

export function parsePayrollTelegramUpdate(update: PayrollTelegramUpdate): TelegramEvent | null {
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) throw new Error("Update ID tidak valid.");
  const callback = update.callback_query;
  const message = callback?.message ?? update.message;
  const user = callback?.from ?? message?.from;
  if (!message || !user || user.is_bot) return null;
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || !Number.isSafeInteger(message.chat.id)) throw new Error("Identitas Telegram tidak valid.");
  const base = { userId: user.id, chatId: message.chat.id, chatType: message.chat.type, chatTitle: message.chat.title,
    chatUsername: message.chat.username, username: user.username, name: [user.first_name, user.last_name].filter(Boolean).join(" ") };
  if (callback) {
    const [prefix, action, id, extra] = (callback.data ?? "").split(":");
    if (prefix !== "cp" && prefix !== "cp2") return null;
    if (["finish", "more", "cancel"].includes(action)) return { ...base, action, sessionId: id };
    if (["finishgold", "finishdone"].includes(action)) return { ...base, action: "finish", ref: id }; // Old session buttons fail safely.
    const current = prefix === "cp2" && /^\d+$/.test(id ?? "");
    return { ...base, action: action === "assignhelp" ? "picker" : action,
      ...(current ? { orderId: id } : { ref: id }),
      ...(action === "picker" ? { page: /^\d{1,4}$/.test(extra ?? "") ? Number(extra) : 0 } : {}),
      ...(action === "pick" ? { employeeId: extra } : {}) };
  }
  const text = message.text?.trim() ?? "";
  if (text.startsWith("/")) {
    const [command, first, second] = text.split(/\s+/);
    const action = command.split("@")[0].slice(1).toLowerCase();
    if (!["myid", "help", "start", "bind", "link", "leader", "assign", "dispatch"].includes(action)) return null;
    return { ...base, action: action === "start" ? "startcommand" : action,
      ...(action === "bind" ? { division: first?.toUpperCase() } : {}),
      ...(["link", "leader"].includes(action) ? { employeeCode: first } : {}),
      ...(["assign", "dispatch"].includes(action) ? { ref: first, employeeCode: second } : {}) };
  }
  const media = message.video ?? message.photo?.at(-1);
  if (media) return { ...base, action: "media", messageId: message.message_id, mediaType: message.video ? "video" : "photo", fileId: media.file_id, fileUniqueId: media.file_unique_id };
  const quantity = text.replace(/\s+/g, "").match(/^(\d+(?:[.,]\d+)?)(?:M|G|K|B)?$/i);
  return text ? { ...base, action: "amount", quantity: quantity ? Number(quantity[1].replace(",", ".")) : null } : null;
}

export type TelegramNotice = { text: string; keyboard?: string; orderId?: number; sessionId?: string; page?: number; employees?: { id: number; name: string }[] };
type Button = { text: string; callback_data: string };
export function payrollTelegramKeyboard(notice: TelegramNotice): { inline_keyboard: Button[][] } | undefined {
  const button = (text: string, action: string, suffix: string | number = notice.orderId ?? ""): Button => ({ text, callback_data: `cp2:${action}:${suffix}` });
  switch (notice.keyboard) {
    case "gold": return { inline_keyboard: [[button("🪙 KIRIM GOLD", "gold")], [button("⚠ BERMASALAH", "problem")]] };
    case "boosting": return { inline_keyboard: [[button("👤 PILIH / GANTI KARYAWAN", "picker")], [button("▶ START", "start"), button("⏸ PAUSE", "pause"), button("▶ RESUME", "resume")], [button("✅ DONE", "done"), button("⚠ BERMASALAH", "problem")]] };
    case "session": return { inline_keyboard: [[button("➕ TAMBAH BUKTI", "more", notice.sessionId!)], [button("✅ SELESAI UPLOAD", "finish", notice.sessionId!)], [button("❌ BATAL", "cancel", notice.sessionId!)]] };
    case "picker": {
      const page = notice.page ?? 0;
      const rows = (notice.employees ?? []).slice(0, 8).map(employee => [button(employee.name, "pick", `${notice.orderId}:${employee.id}`)]);
      const navigation = [
        ...(page > 0 ? [button("◀ SEBELUMNYA", "picker", `${notice.orderId}:${page - 1}`)] : []),
        ...((notice.employees?.length ?? 0) > 8 ? [button("BERIKUTNYA ▶", "picker", `${notice.orderId}:${page + 1}`)] : []),
      ];
      if (navigation.length) rows.push(navigation);
      return { inline_keyboard: rows };
    }
  }
}
