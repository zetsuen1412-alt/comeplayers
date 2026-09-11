import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { chatErrorStatus } from "@/lib/chatServer";
import { CONTACT_PROFILE_SELECT, contactError } from "@/lib/chatContacts";
import { createLiveKitRoomServiceClient } from "@/lib/livekitServer";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const { data, error } = await db.from("chat_user_blocks").select("blocked_id,created_at").eq("blocker_id", user.id).order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (data || []).map(b => b.blocked_id);
    const profiles = ids.length ? await db.from("profiles").select(CONTACT_PROFILE_SELECT).in("id", ids) : { data: [], error: null };
    if (profiles.error) throw profiles.error;
    return NextResponse.json({ users: profiles.data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: "Unable to load blocked contacts." }, { status: chatErrorStatus(error) }); }
}
async function change(request: Request, block: boolean) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { userId } = await request.json();
    if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(userId) || userId === user.id) throw contactError("Invalid contact.", 400);
    const db = createSupabaseAdmin();
    const result = await db.rpc("cp_set_contact_block", { p_actor: user.id, p_target: userId, p_block: block });
    if (result.error) throw result.error;
    if (block) {
      const calls = await db.from("cp_calls").select("id").eq("status", "ended").gte("ended_at", new Date(Date.now() - 60000).toISOString()).or(`and(caller_id.eq.${user.id},callee_id.eq.${userId}),and(caller_id.eq.${userId},callee_id.eq.${user.id})`);
      if (calls.error) throw calls.error;
      for (const call of calls.data) await createLiveKitRoomServiceClient().deleteRoom(`cp-call-${call.id}`).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: "Unable to update blocked contact." }, { status: chatErrorStatus(error) }); }
}
export function POST(request: Request) { return change(request, true); }
export function DELETE(request: Request) { return change(request, false); }
