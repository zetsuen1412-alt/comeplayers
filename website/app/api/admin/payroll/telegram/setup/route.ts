import { requirePayrollAccess } from "@/lib/payrollAccess";
import { adminErrorStatus } from "@/lib/adminSecurity";
import {
  telegramEnabled,
  telegramGetMe,
  telegramGetWebhookInfo,
  telegramSetWebhook,
  telegramWebhookSecret,
} from "@/lib/payrollTelegram";

export const dynamic = "force-dynamic";

function ensureAdmin(actor: { isAdmin: boolean }) {
  if (!actor.isAdmin) throw Object.assign(new Error("Hanya admin yang dapat mengatur Telegram Payroll."), { status: 403 });
}

export async function GET(request: Request) {
  try {
    const { actor, supabaseAdmin } = await requirePayrollAccess(request);
    ensureAdmin(actor);
    const [
      { data: divisions, error: divisionError },
      { data: employees, error: employeeError },
    ] = await Promise.all([
      supabaseAdmin.from("cp_payroll_telegram_divisions").select("*").order("division"),
      supabaseAdmin.from("cp_payroll_telegram_employees").select("*").order("division").order("employee_code"),
    ]);
    if (divisionError) throw divisionError;
    if (employeeError) throw employeeError;

    let bot = null, webhook = null, botError = "";
    if (telegramEnabled()) {
      try {
        [bot, webhook] = await Promise.all([telegramGetMe(), telegramGetWebhookInfo()]);
      } catch (error) {
        botError = error instanceof Error ? error.message : "Telegram tidak dapat diperiksa.";
      }
    }

    return Response.json({
      configured: telegramEnabled() && telegramWebhookSecret().length >= 16,
      bot,
      webhook,
      botError,
      divisions: divisions || [],
      employees: employees || [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = adminErrorStatus(error);
    return Response.json({ error: error instanceof Error ? error.message : "Pengaturan Telegram tidak dapat dimuat." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { actor } = await requirePayrollAccess(request);
    ensureAdmin(actor);
    if (!telegramEnabled()) throw Object.assign(new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi di Vercel."), { status: 409 });
    if (telegramWebhookSecret().length < 16) throw Object.assign(new Error("TELEGRAM_WEBHOOK_SECRET belum dikonfigurasi di Vercel."), { status: 409 });

    const origin = new URL(request.url).origin;
    const url = `${origin}/api/integrations/telegram/payroll`;
    await telegramSetWebhook(url);
    const [bot, webhook] = await Promise.all([telegramGetMe(), telegramGetWebhookInfo()]);
    return Response.json({ ok: true, url, bot, webhook });
  } catch (error) {
    const status = adminErrorStatus(error);
    return Response.json({ error: error instanceof Error ? error.message : "Webhook Telegram tidak dapat dipasang." }, { status });
  }
}
