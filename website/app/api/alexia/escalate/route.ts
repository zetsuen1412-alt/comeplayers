import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";

export const runtime = "nodejs";

const MAX_LENGTH = 4_000;

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function POST(request: Request) {
  let user;

  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return Response.json(
      { error: "Sign in to your ComePlayers account to talk to an admin." },
      { status: 401 },
    );
  }

  let body: { subject?: unknown; message?: unknown; category?: unknown };

  try {
    body = (await request.json()) as { subject?: unknown; message?: unknown; category?: unknown };
  } catch {
    return Response.json({ error: "Invalid request format." }, { status: 400 });
  }

  const subject = cleanText(body.subject, "Help from Alexia").slice(0, 180);
  const message = cleanText(body.message);
  const allowedCategories = new Set([
    "general",
    "order",
    "payment",
    "wallet",
    "seller",
    "bug",
    "other",
  ]);
  const category = allowedCategories.has(String(body.category))
    ? String(body.category)
    : "general";

  if (message.length < 10) {
    return Response.json({ error: "Describe what you need in at least 10 characters." }, { status: 400 });
  }

  if (message.length > MAX_LENGTH) {
    return Response.json({ error: "The message is too long." }, { status: 400 });
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();
    const ticketSubject = subject.startsWith("Alexia") ? subject : `Alexia Help Center: ${subject}`;

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        user_id: user.id,
        order_id: null,
        product_id: null,
        subject: ticketSubject,
        category,
        priority: "normal",
        status: "waiting_admin",
        last_message: message,
        last_message_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      throw new Error(ticketError?.message || "Ticket could not be created.");
    }

    const { error: messageError } = await supabaseAdmin
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        sender_role: "user",
        message,
        attachment_url: null,
      });

    if (messageError) throw new Error(messageError.message);

    const { data: admins } = await supabaseAdmin
      .from("profiles")
      .select("id,email")
      .eq("role", "admin");

    if (admins?.length) {
      await supabaseAdmin.from("notifications").insert(
        admins.map((admin) => ({
          user_id: admin.id,
          type: "event",
          title: "New Alexia Support Ticket",
          message: `${user.email || "User"} created support ticket #${ticket.id}.`,
          link_url: "/admin/support",
          is_read: false,
        })),
      );
    }

    return Response.json({
      ok: true,
      ticketId: ticket.id,
      supportUrl: `/support/${ticket.id}`,
    });
  } catch (error) {
    console.error("Alexia escalation failed:", error);
    return Response.json(
      { error: "The admin ticket could not be created. Please try again." },
      { status: 500 },
    );
  }
}
