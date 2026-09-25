import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/serverSupabase";
import {
  dispatchPayrollTelegramOrder,
  isTelegramAdmin,
  payrollWorkspaceEmployees,
  payrollWorkspaceOrder,
  telegramAnswerCallback,
  telegramKeyboards,
  telegramSendMessage,
  telegramWebhookSecret,
} from "@/lib/payrollTelegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TelegramChat = { id: number; type: string; title?: string; username?: string };
type TelegramPhoto = { file_id: string; file_unique_id: string; width?: number; height?: number; file_size?: number };
type TelegramVideo = { file_id: string; file_unique_id: string; file_size?: number; duration?: number };
type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  photo?: TelegramPhoto[];
  video?: TelegramVideo;
};
type TelegramCallback = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};
type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallback;
};

const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

function verifySecret(request: Request) {
  const expected = telegramWebhookSecret();
  if (!expected || expected.length < 16) throw Object.assign(new Error("Webhook Telegram belum dikonfigurasi."), { status: 503 });
  const provided = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const a = Buffer.from(expected), b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Object.assign(new Error("Webhook Telegram tidak sah."), { status: 401 });
}

function userName(user: TelegramUser) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || String(user.id);
}

function parseCommand(text: string) {
  const clean = text.trim();
  if (!clean.startsWith("/")) return null;
  const parts = clean.split(/\s+/);
  const command = parts.shift()!.split("@")[0].toLowerCase();
  return { command, args: parts };
}

function parseQuantity(value: string) {
  const match = value.trim().replace(/\s+/g, "").match(/^(\d+(?:[.,]\d+)?)\s*(?:M|G|K|B)?$/i);
  if (!match) return null;
  const quantity = Number(match[1].replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

async function linkedEmployee(supabase: ReturnType<typeof createSupabaseAdmin>, telegramUserId: number) {
  const { data, error } = await supabase
    .from("cp_payroll_telegram_employees")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function boundDivision(supabase: ReturnType<typeof createSupabaseAdmin>, chatId: number) {
  const { data, error } = await supabase
    .from("cp_payroll_telegram_divisions")
    .select("*")
    .eq("chat_id", chatId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function canManage(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  telegramUserId: number,
  division?: string,
) {
  if (isTelegramAdmin(telegramUserId)) return true;
  const employee = await linkedEmployee(supabase, telegramUserId);
  return Boolean(employee?.role === "leader" && (!division || employee.division === division));
}

async function currentAssignment(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  orderRef: string,
  employeeCode?: string,
) {
  let query = supabase
    .from("cp_payroll_telegram_assignments")
    .select("*")
    .eq("order_ref", orderRef)
    .in("status", ["assigned", "in_progress", "paused", "problem"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (employeeCode) query = query.eq("employee_code", employeeCode);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function createSession(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  input: {
    telegramUserId: number;
    chatId: number;
    orderRef: string;
    assignmentId?: string | null;
    kind: "start" | "done" | "gold";
    stage: "amount" | "evidence";
    requestedQuantity?: number | null;
  },
) {
  const { data, error } = await supabase
    .from("cp_payroll_telegram_sessions")
    .upsert({
      telegram_user_id: input.telegramUserId,
      chat_id: input.chatId,
      order_ref: input.orderRef,
      assignment_id: input.assignmentId || null,
      kind: input.kind,
      stage: input.stage,
      requested_quantity: input.requestedQuantity ?? null,
      evidence_count: 0,
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "telegram_user_id,chat_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function getSession(supabase: ReturnType<typeof createSupabaseAdmin>, userId: number, chatId: number) {
  const { data, error } = await supabase
    .from("cp_payroll_telegram_sessions")
    .select("*")
    .eq("telegram_user_id", userId)
    .eq("chat_id", chatId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function clearSession(supabase: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { error } = await supabase.from("cp_payroll_telegram_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function orderWorkflow(supabase: ReturnType<typeof createSupabaseAdmin>, orderRef: string) {
  const { data, error } = await supabase
    .from("cp_payroll_telegram_orders")
    .select("*")
    .eq("order_ref", orderRef)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function notifyOrderChats(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  orderRef: string,
  text: string,
) {
  const { data, error } = await supabase
    .from("cp_payroll_telegram_order_chats")
    .select("chat_id")
    .eq("order_ref", orderRef);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    try { await telegramSendMessage({ chatId: row.chat_id, text }); }
    catch (error) { console.error("Telegram order notification failed", orderRef, error); }
  }
}

async function handleCommand(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  message: TelegramMessage,
  command: { command: string; args: string[] },
) {
  const from = message.from;
  if (!from) return;

  if (command.command === "/myid") {
    await telegramSendMessage({ chatId: message.chat.id, text: `Telegram User ID Anda: ${from.id}` });
    return;
  }

  if (command.command === "/help" || command.command === "/start") {
    await telegramSendMessage({
      chatId: message.chat.id,
      text: [
        "🤖 COMEPLAYERS PAYROLL BOT",
        "",
        "Identitas:",
        "/myid — lihat Telegram User ID untuk konfigurasi admin",
        "",
        "Admin:",
        "/bind FH1 — hubungkan grup ini ke divisi",
        "/dispatch X3101 — kirim order lama ke grup yang sesuai",
        "/leader EMP001 — jadikan karyawan sebagai leader Telegram",
        "",
        "Karyawan:",
        "/link EMP001 — hubungkan akun Telegram ke kode karyawan",
        "",
        "Admin / leader:",
        "/assign X3101 EMP001 — pilih atau ganti karyawan boosting",
        "",
        "START, PAUSE, RESUME, DONE dan KIRIM GOLD memakai tombol pada pesan bot.",
        "START dan DONE wajib bukti foto/screenshot/video. DONE dapat memakai beberapa file.",
      ].join("\n"),
    });
    return;
  }

  if (command.command === "/bind") {
    if (!isTelegramAdmin(from.id)) {
      await telegramSendMessage({ chatId: message.chat.id, text: "❌ Hanya admin Telegram ComePlayers yang dapat menghubungkan grup." });
      return;
    }
    const division = String(command.args[0] || "").trim().toUpperCase();
    if (!["FH1", "FH2", "FH3", "ADMIN", "BANDAR"].includes(division)) {
      await telegramSendMessage({ chatId: message.chat.id, text: "Gunakan: /bind FH1 (atau FH2/FH3/ADMIN/BANDAR)" });
      return;
    }
    const { error } = await supabase.from("cp_payroll_telegram_divisions").upsert({
      division,
      chat_id: message.chat.id,
      chat_title: message.chat.title || null,
      chat_username: message.chat.username || null,
      active: true,
      bound_by_telegram_user_id: from.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "division" });
    if (error) throw new Error(error.message);
    await telegramSendMessage({ chatId: message.chat.id, text: `✅ Grup ini sekarang menjadi grup ComePlayers ${division}.` });
    return;
  }

  if (command.command === "/link") {
    const code = String(command.args[0] || "").trim().toUpperCase();
    if (!code) {
      await telegramSendMessage({ chatId: message.chat.id, text: "Gunakan: /link KODE_KARYAWAN" });
      return;
    }
    const employees = await payrollWorkspaceEmployees(supabase);
    const employee = employees.find(row => row.code.trim().toUpperCase() === code);
    if (!employee) {
      await telegramSendMessage({ chatId: message.chat.id, text: `❌ Karyawan ${code} tidak ditemukan di Payroll ComePlayers.` });
      return;
    }
    const division = await boundDivision(supabase, message.chat.id);
    if (division && division.division !== employee.team && !isTelegramAdmin(from.id)) {
      await telegramSendMessage({ chatId: message.chat.id, text: `❌ ${employee.name} terdaftar di ${employee.team}, bukan ${division.division}.` });
      return;
    }
    const { error } = await supabase.from("cp_payroll_telegram_employees").upsert({
      employee_code: employee.code,
      telegram_user_id: from.id,
      telegram_username: from.username || null,
      telegram_name: userName(from),
      division: employee.team,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "employee_code" });
    if (error) throw new Error(error.message);
    await telegramSendMessage({
      chatId: message.chat.id,
      text: `✅ Telegram @${from.username || from.id} terhubung ke ${employee.name} · ${employee.code} · ${employee.team}.`,
    });
    return;
  }

  if (command.command === "/leader") {
    if (!isTelegramAdmin(from.id)) {
      await telegramSendMessage({ chatId: message.chat.id, text: "❌ Hanya admin yang dapat mengatur leader." });
      return;
    }
    const code = String(command.args[0] || "").trim().toUpperCase();
    const { data, error } = await supabase
      .from("cp_payroll_telegram_employees")
      .update({ role: "leader", updated_at: new Date().toISOString() })
      .eq("employee_code", code)
      .select("employee_code,telegram_name,division")
      .maybeSingle();
    if (error) throw new Error(error.message);
    await telegramSendMessage({
      chatId: message.chat.id,
      text: data ? `✅ ${data.telegram_name || data.employee_code} sekarang leader ${data.division}.` : "❌ Karyawan belum /link Telegram.",
    });
    return;
  }

  if (command.command === "/dispatch") {
    if (!isTelegramAdmin(from.id)) {
      await telegramSendMessage({ chatId: message.chat.id, text: "❌ Hanya admin yang dapat mengirim ulang order." });
      return;
    }
    const ref = String(command.args[0] || "").trim();
    const order = await payrollWorkspaceOrder(supabase, ref);
    if (!order) {
      await telegramSendMessage({ chatId: message.chat.id, text: `❌ Order ${ref || "?"} tidak ditemukan.` });
      return;
    }
    const result = await dispatchPayrollTelegramOrder(supabase, order);
    await telegramSendMessage({ chatId: message.chat.id, text: `✅ Dispatch ${order.externalReference}: ${result.sent} grup baru.` });
    return;
  }

  if (command.command === "/assign") {
    const ref = String(command.args[0] || "").trim();
    const code = String(command.args[1] || "").trim().toUpperCase();
    if (!ref || !code) {
      await telegramSendMessage({ chatId: message.chat.id, text: "Gunakan: /assign KODE_ORDER KODE_KARYAWAN" });
      return;
    }
    const order = await payrollWorkspaceOrder(supabase, ref);
    if (!order || order.orderType !== "boosting") {
      await telegramSendMessage({ chatId: message.chat.id, text: `❌ ${ref} bukan order Boosting aktif.` });
      return;
    }
    const employees = await payrollWorkspaceEmployees(supabase);
    const employee = employees.find(row => row.code.trim().toUpperCase() === code);
    if (!employee) {
      await telegramSendMessage({ chatId: message.chat.id, text: `❌ Karyawan ${code} tidak ditemukan.` });
      return;
    }
    const manager = await canManage(supabase, from.id, employee.team);
    if (!manager) {
      await telegramSendMessage({ chatId: message.chat.id, text: "❌ Hanya admin/leader divisi yang dapat memilih atau mengganti karyawan." });
      return;
    }
    const { data: link, error: linkError } = await supabase
      .from("cp_payroll_telegram_employees")
      .select("*")
      .eq("employee_code", employee.code)
      .eq("active", true)
      .maybeSingle();
    if (linkError) throw new Error(linkError.message);
    if (!link) {
      await telegramSendMessage({ chatId: message.chat.id, text: `❌ ${employee.name} belum menghubungkan Telegram. Minta dia menjalankan /link ${employee.code}.` });
      return;
    }

    const now = new Date().toISOString();
    const { error: replaceError } = await supabase
      .from("cp_payroll_telegram_assignments")
      .update({ status: "replaced", replaced_at: now, updated_at: now })
      .eq("order_ref", order.externalReference)
      .in("status", ["assigned", "in_progress", "paused", "problem"]);
    if (replaceError) throw new Error(replaceError.message);

    const { data: assignment, error: assignmentError } = await supabase
      .from("cp_payroll_telegram_assignments")
      .insert({
        order_ref: order.externalReference,
        employee_code: employee.code,
        division: employee.team,
        telegram_user_id: link.telegram_user_id,
        status: "assigned",
      })
      .select("*")
      .single();
    if (assignmentError) throw new Error(assignmentError.message);

    const { error: stateError } = await supabase
      .from("cp_payroll_telegram_orders")
      .upsert({
        order_ref: order.externalReference,
        order_type: "boosting",
        target_quantity: 1,
        state: "assigned",
        last_event_at: now,
        updated_at: now,
      }, { onConflict: "order_ref" });
    if (stateError) throw new Error(stateError.message);

    await notifyOrderChats(supabase, order.externalReference, [
      "👤 KARYAWAN BOOSTING DITENTUKAN",
      "",
      `Order   : ${order.externalReference}`,
      `Karyawan: ${employee.name}`,
      `Divisi  : ${employee.team}`,
      "",
      assignment.status === "assigned" ? "⚪ BELUM DIMULAI" : "",
    ].filter(Boolean).join("\n"));

    await telegramSendMessage({
      chatId: message.chat.id,
      text: `✅ ${order.externalReference} → ${employee.name} (${employee.team}). Karyawan dapat START dari tombol di bawah.`,
      replyMarkup: telegramKeyboards.boosting(order.externalReference, true),
    });
    return;
  }

  const session = await getSession(supabase, from.id, message.chat.id);
  if (session?.kind === "gold" && session.stage === "amount") {
    const quantity = parseQuantity(message.text || "");
    if (!quantity) {
      await telegramSendMessage({ chatId: message.chat.id, text: "Masukkan jumlah Gold, contoh: 30M atau 12.5M." });
      return;
    }
    const { error } = await supabase
      .from("cp_payroll_telegram_sessions")
      .update({ stage: "evidence", requested_quantity: quantity, evidence_count: 0, updated_at: new Date().toISOString() })
      .eq("id", session.id);
    if (error) throw new Error(error.message);
    await telegramSendMessage({
      chatId: message.chat.id,
      text: `📸🎥 ${session.order_ref} — ${quantity} Gold\n\nSekarang kirim minimal 1 foto/screenshot/video bukti pengiriman. Boleh beberapa file. Setelah semua bukti terkirim, tekan SELESAI UPLOAD.`,
      replyMarkup: { inline_keyboard: [[{ text: "✅ SELESAI UPLOAD", callback_data: `cp:finishgold:${session.order_ref}` }]] },
    });
  }
}

async function saveEvidence(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  message: TelegramMessage,
  session: Record<string, any>,
) {
  const from = message.from;
  if (!from) return;
  const photo = message.photo?.length ? message.photo[message.photo.length - 1] : null;
  const media = photo
    ? { type: "photo", fileId: photo.file_id, uniqueId: photo.file_unique_id }
    : message.video
      ? { type: "video", fileId: message.video.file_id, uniqueId: message.video.file_unique_id }
      : null;
  if (!media) return;

  const { error } = await supabase.from("cp_payroll_telegram_evidence").insert({
    order_ref: session.order_ref,
    assignment_id: session.assignment_id || null,
    session_id: session.id,
    evidence_type: session.kind,
    media_type: media.type,
    telegram_chat_id: message.chat.id,
    telegram_chat_username: message.chat.username || null,
    telegram_message_id: message.message_id,
    telegram_file_id: media.fileId,
    telegram_file_unique_id: media.uniqueId,
    telegram_user_id: from.id,
  });
  if (error && error.code !== "23505") throw new Error(error.message);

  const nextCount = Number(session.evidence_count || 0) + (error ? 0 : 1);
  const { error: sessionError } = await supabase
    .from("cp_payroll_telegram_sessions")
    .update({ evidence_count: nextCount, updated_at: new Date().toISOString() })
    .eq("id", session.id);
  if (sessionError) throw new Error(sessionError.message);

  if (session.kind === "start") {
    if (!session.assignment_id) throw new Error("Assignment START tidak ditemukan.");
    const now = new Date().toISOString();
    const { error: assignmentError } = await supabase
      .from("cp_payroll_telegram_assignments")
      .update({ status: "in_progress", started_at: now, paused_at: null, updated_at: now })
      .eq("id", session.assignment_id);
    if (assignmentError) throw new Error(assignmentError.message);
    const { error: orderError } = await supabase
      .from("cp_payroll_telegram_orders")
      .update({ state: "in_progress", last_event_at: now, updated_at: now })
      .eq("order_ref", session.order_ref);
    if (orderError) throw new Error(orderError.message);
    await clearSession(supabase, session.id);
    await notifyOrderChats(supabase, session.order_ref, `🟢 ${session.order_ref} START\n👤 ${userName(from)}\n📸🎥 Bukti START tersimpan di Telegram.\n\nStatus website: HIJAU — sedang dikerjakan.`);
    await telegramSendMessage({
      chatId: message.chat.id,
      text: `✅ Bukti START ${session.order_ref} diterima. Order sekarang DIKERJAKAN.`,
      replyMarkup: telegramKeyboards.boosting(session.order_ref, true),
    });
    return;
  }

  await telegramSendMessage({
    chatId: message.chat.id,
    text: `✅ Bukti ${session.kind === "done" ? "DONE" : "GOLD"} diterima. Total bukti pada sesi ini: ${nextCount}. ${session.kind === "done" ? "Kirim file lain jika perlu, lalu tekan SELESAI UPLOAD." : "Kirim file lain jika perlu, lalu tekan SELESAI UPLOAD."}`,
    replyMarkup: {
      inline_keyboard: [[{
        text: "✅ SELESAI UPLOAD",
        callback_data: `cp:${session.kind === "done" ? "finishdone" : "finishgold"}:${session.order_ref}`,
      }]],
    },
  });
}

async function handleCallback(supabase: ReturnType<typeof createSupabaseAdmin>, callback: TelegramCallback) {
  const data = String(callback.data || "");
  const message = callback.message;
  if (!message) return;
  const [, action, ...refParts] = data.split(":");
  const orderRef = refParts.join(":");
  if (!action || !orderRef) return;
  const from = callback.from;

  try {
    const workflow = await orderWorkflow(supabase, orderRef);
    if (!workflow) {
      await telegramAnswerCallback(callback.id, "Order Telegram tidak ditemukan.", true);
      return;
    }
    const employee = await linkedEmployee(supabase, from.id);

    if (action === "assignhelp") {
      await telegramAnswerCallback(callback.id);
      await telegramSendMessage({
        chatId: message.chat.id,
        text: `👤 Untuk memilih atau mengganti karyawan ${orderRef}:\n/assign ${orderRef} KODE_KARYAWAN\n\nHanya admin/leader divisi yang dapat menjalankannya.`,
      });
      return;
    }

    if (action === "gold") {
      if (workflow.order_type !== "gold") return;
      if (!employee) {
        await telegramAnswerCallback(callback.id, "Hubungkan akun dengan /link KODE_KARYAWAN terlebih dahulu.", true);
        return;
      }
      const division = await boundDivision(supabase, message.chat.id);
      if (!division || division.division !== employee.division) {
        await telegramAnswerCallback(callback.id, "Gunakan tombol Gold di grup divisi Anda.", true);
        return;
      }
      const remaining = Math.max(0, Number(workflow.target_quantity) - Number(workflow.delivered_quantity));
      if (remaining <= 0 || workflow.state === "done_pending_admin") {
        await telegramAnswerCallback(callback.id, "Kuota Gold sudah penuh.", true);
        return;
      }
      await createSession(supabase, {
        telegramUserId: from.id,
        chatId: message.chat.id,
        orderRef,
        kind: "gold",
        stage: "amount",
      });
      await telegramAnswerCallback(callback.id);
      await telegramSendMessage({
        chatId: message.chat.id,
        text: `🪙 KIRIM GOLD — ${orderRef}\n\nProgress: ${Number(workflow.delivered_quantity)} / ${Number(workflow.target_quantity)}\nSisa: ${remaining}\n\nBalas pesan berikutnya dengan jumlah Gold, contoh: 30M.`,
      });
      return;
    }

    const assignment = employee ? await currentAssignment(supabase, orderRef, employee.employee_code) : null;
    const manager = await canManage(supabase, from.id, assignment?.division);

    if (action === "problem") {
      if (!employee && !manager) {
        await telegramAnswerCallback(callback.id, "Hubungkan akun Telegram terlebih dahulu.", true);
        return;
      }
      const now = new Date().toISOString();
      if (assignment) await supabase.from("cp_payroll_telegram_assignments").update({ status: "problem", updated_at: now }).eq("id", assignment.id);
      await supabase.from("cp_payroll_telegram_orders").update({ state: "problem", last_event_at: now, updated_at: now }).eq("order_ref", orderRef);
      await telegramAnswerCallback(callback.id, "Ditandai bermasalah.");
      await notifyOrderChats(supabase, orderRef, `🔴 ${orderRef} BERMASALAH\nDilaporkan oleh: ${userName(from)}\nAdmin perlu memeriksa order.`);
      return;
    }

    if (action === "finishgold") {
      const session = await getSession(supabase, from.id, message.chat.id);
      if (!session || session.order_ref !== orderRef || session.kind !== "gold" || session.stage !== "evidence"
        || Number(session.evidence_count) < 1 || Number(session.requested_quantity) <= 0) {
        await telegramAnswerCallback(callback.id, "Masukkan jumlah dan kirim minimal 1 bukti terlebih dahulu.", true);
        return;
      }
      if (!employee) {
        await telegramAnswerCallback(callback.id, "Akun karyawan belum terhubung.", true);
        return;
      }
      const { data: accepted, error } = await supabase.rpc("cp_payroll_telegram_accept_gold", {
        p_order_ref: orderRef,
        p_employee_code: employee.employee_code,
        p_division: employee.division,
        p_telegram_user_id: from.id,
        p_requested_quantity: Number(session.requested_quantity),
      });
      if (error) throw new Error(error.message);
      if (accepted?.contributionId) {
        await supabase.from("cp_payroll_telegram_evidence").update({ contribution_id: accepted.contributionId }).eq("session_id", session.id);
      }
      await clearSession(supabase, session.id);
      await telegramAnswerCallback(callback.id, accepted?.full ? "Kuota Gold terpenuhi." : "Gold diterima.");
      const rejected = Math.max(0, Number(accepted?.requested || 0) - Number(accepted?.accepted || 0));
      const text = [
        accepted?.full ? "🟡 GOLD ORDER TERPENUHI" : "🟢 GOLD MASUK",
        "",
        `Order     : ${orderRef}`,
        `Karyawan  : ${employee.telegram_name || employee.employee_code}`,
        `Divisi    : ${employee.division}`,
        `Diajukan  : ${Number(accepted?.requested || 0)}`,
        `Diterima  : ${Number(accepted?.accepted || 0)}`,
        ...(rejected > 0 ? [`Ditolak    : ${rejected} (melewati sisa kuota)`] : []),
        `Progress  : ${Number(accepted?.delivered || 0)} / ${Number(accepted?.target || 0)}`,
        `Sisa      : ${Number(accepted?.remaining || 0)}`,
        `Bukti     : ${session.evidence_count} file Telegram`,
        "",
        accepted?.full ? "⛔ Kuota penuh. Pengiriman tambahan otomatis ditolak. Menunggu verifikasi admin." : "Order masih terbuka untuk semua divisi yang menerima order.",
      ].join("\n");
      await notifyOrderChats(supabase, orderRef, text);
      return;
    }

    if (!employee || !assignment) {
      await telegramAnswerCallback(callback.id, "Order ini bukan assignment Anda.", true);
      return;
    }

    if (action === "start") {
      if (assignment.status !== "assigned") {
        await telegramAnswerCallback(callback.id, `Status saat ini: ${assignment.status}`, true);
        return;
      }
      await createSession(supabase, {
        telegramUserId: from.id,
        chatId: message.chat.id,
        orderRef,
        assignmentId: assignment.id,
        kind: "start",
        stage: "evidence",
      });
      await telegramAnswerCallback(callback.id);
      await telegramSendMessage({
        chatId: message.chat.id,
        text: `📸🎥 BUKTI START WAJIB — ${orderRef}\n\nKirim minimal 1 foto/screenshot atau video yang menunjukkan pekerjaan sudah dimulai. Status START baru aktif setelah bukti diterima.`,
      });
      return;
    }

    if (action === "pause") {
      if (assignment.status !== "in_progress") {
        await telegramAnswerCallback(callback.id, "Order belum dalam status START.", true);
        return;
      }
      const now = new Date().toISOString();
      await supabase.from("cp_payroll_telegram_assignments").update({ status: "paused", paused_at: now, updated_at: now }).eq("id", assignment.id);
      await supabase.from("cp_payroll_telegram_orders").update({ state: "paused", last_event_at: now, updated_at: now }).eq("order_ref", orderRef);
      await telegramAnswerCallback(callback.id, "Order di-pause.");
      await notifyOrderChats(supabase, orderRef, `🟠 ${orderRef} PAUSE\n👤 ${userName(from)}\nTekan RESUME saat pekerjaan dilanjutkan.`);
      return;
    }

    if (action === "resume") {
      if (assignment.status !== "paused") {
        await telegramAnswerCallback(callback.id, "Order tidak sedang PAUSE.", true);
        return;
      }
      const now = new Date().toISOString();
      await supabase.from("cp_payroll_telegram_assignments").update({ status: "in_progress", paused_at: null, updated_at: now }).eq("id", assignment.id);
      await supabase.from("cp_payroll_telegram_orders").update({ state: "in_progress", last_event_at: now, updated_at: now }).eq("order_ref", orderRef);
      await telegramAnswerCallback(callback.id, "Order dilanjutkan.");
      await notifyOrderChats(supabase, orderRef, `🟢 ${orderRef} RESUME\n👤 ${userName(from)}\nStatus website kembali HIJAU.`);
      return;
    }

    if (action === "done") {
      if (!["in_progress", "paused"].includes(assignment.status)) {
        await telegramAnswerCallback(callback.id, "START order terlebih dahulu.", true);
        return;
      }
      await createSession(supabase, {
        telegramUserId: from.id,
        chatId: message.chat.id,
        orderRef,
        assignmentId: assignment.id,
        kind: "done",
        stage: "evidence",
      });
      await telegramAnswerCallback(callback.id);
      await telegramSendMessage({
        chatId: message.chat.id,
        text: `📸🎥 BUKTI DONE WAJIB — ${orderRef}\n\nKirim minimal 1 foto/screenshot/video. Boleh beberapa file. Setelah selesai mengirim semua bukti, tekan SELESAI UPLOAD.`,
        replyMarkup: { inline_keyboard: [[{ text: "✅ SELESAI UPLOAD", callback_data: `cp:finishdone:${orderRef}` }]] },
      });
      return;
    }

    if (action === "finishdone") {
      const session = await getSession(supabase, from.id, message.chat.id);
      if (!session || session.order_ref !== orderRef || session.kind !== "done" || Number(session.evidence_count) < 1) {
        await telegramAnswerCallback(callback.id, "Kirim minimal 1 bukti foto/video terlebih dahulu.", true);
        return;
      }
      const now = new Date().toISOString();
      await supabase.from("cp_payroll_telegram_assignments").update({ status: "done", done_at: now, updated_at: now }).eq("id", session.assignment_id);
      await supabase.from("cp_payroll_telegram_orders").update({ state: "done_pending_admin", last_event_at: now, updated_at: now }).eq("order_ref", orderRef);
      await clearSession(supabase, session.id);
      await telegramAnswerCallback(callback.id, "DONE diterima.");
      await notifyOrderChats(supabase, orderRef, `🟡 BOOSTING SELESAI — ${orderRef}\n👤 ${userName(from)}\n📸🎥 Bukti DONE: ${session.evidence_count} file\n\nStatus: MENUNGGU VERIFIKASI ADMIN.\nWebsite Mutasi menjadi KUNING.`);
      return;
    }


  } catch (error) {
    console.error("Telegram callback error", error);
    await telegramAnswerCallback(callback.id, error instanceof Error ? error.message.slice(0, 180) : "Terjadi kesalahan.", true).catch(() => {});
  }
}

export async function POST(request: Request) {
  try {
    verifySecret(request);
    const update = await request.json() as TelegramUpdate;
    const supabase = createSupabaseAdmin();

    if (update.callback_query) {
      await handleCallback(supabase, update.callback_query);
      return response({ ok: true });
    }

    const message = update.message;
    if (!message?.from) return response({ ok: true });

    const command = message.text ? parseCommand(message.text) : null;
    if (command) {
      await handleCommand(supabase, message, command);
      return response({ ok: true });
    }

    const session = await getSession(supabase, message.from.id, message.chat.id);
    if (session && (message.photo?.length || message.video)) {
      await saveEvidence(supabase, message, session);
      return response({ ok: true });
    }

    if (session?.kind === "gold" && session.stage === "amount" && message.text) {
      await handleCommand(supabase, message, { command: "", args: [] });
    }

    return response({ ok: true });
  } catch (error) {
    console.error("Telegram payroll webhook failed", error);
    const status = Number((error as { status?: number })?.status || 500);
    return response({ error: status >= 500 ? "Telegram webhook error." : error instanceof Error ? error.message : "Invalid webhook." }, status);
  }
}
