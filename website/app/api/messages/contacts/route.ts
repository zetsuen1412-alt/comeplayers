import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { chatErrorStatus, assertChatUserCanSend } from "@/lib/chatServer";
import { contactError, limitContactSearch, resolveContact, searchContacts } from "@/lib/chatContacts";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    await limitContactSearch(user.id);
    const users = await searchContacts(createSupabaseAdmin(), user.id, new URL(request.url).searchParams.get("q"));
    return NextResponse.json({ users }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json({ error: status >= 500 ? "Unable to search contacts." : (error as Error).message }, { status });
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json();
    const db = createSupabaseAdmin();
    await limitContactSearch(user.id);
    await assertChatUserCanSend(db, user.id);
    const target = await resolveContact(db, user.id, String(body.userId || body.identifier || "").trim());
    if (!target || target.id === user.id) throw contactError("Contact was not found.", 404);
    const { data, error } = await db.rpc("cp_open_direct_contact", { p_actor: user.id, p_target: target.id });
    if (error) throw contactError(/blocked/i.test(error.message) ? "Messaging is unavailable for this contact." : error.message, /blocked/i.test(error.message) ? 403 : 400);
    return NextResponse.json({ room: { ...data, other: target }, roomId: data.id });
  } catch (error) {
    const status = chatErrorStatus(error);
    return NextResponse.json({ error: status >= 500 ? "Unable to open chat." : (error as Error).message }, { status });
  }
}
