import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, privateActor, uuid } from "@/lib/privateMessaging";

export async function GET(request: Request) {
  try {
    const { user, db } = await privateActor(request);
    const calls = await db.from("cp_calls").select("id,room_id,caller_id,callee_id,media,status,scheduled_at,created_at,answered_at,ended_at").or(`and(caller_id.eq.${user.id},caller_stored_at.is.null),and(callee_id.eq.${user.id},callee_stored_at.is.null)`).not("status", "in", "(ringing,accepted,scheduled)").order("created_at").order("id").limit(20);
    if (calls.error) throw calls.error;
    const scheduled = await db.from("cp_calls").select("id,room_id,caller_id,callee_id,media,status,scheduled_at,created_at,answered_at,ended_at").or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`).eq("status", "scheduled").order("scheduled_at").limit(100);
    if (scheduled.error) throw scheduled.error;
    const ids = [...new Set([...calls.data, ...scheduled.data].map(c => c.caller_id === user.id ? c.callee_id : c.caller_id))];
    const people = ids.length ? await db.from("profiles").select("id,username,full_name,avatar_url,cp_number").in("id", ids) : { data: [], error: null };
    if (people.error) throw people.error;
    const decorate = (c: (typeof calls.data)[number]) => ({ ...c, other: people.data?.find(p => p.id === (c.caller_id === user.id ? c.callee_id : c.caller_id)) });
    return NextResponse.json({ calls: calls.data.map(decorate), scheduled: scheduled.data.map(decorate) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  try {
    const text = await limitedBody(request, 4096), { user, db } = await privateActor(request, text), body = JSON.parse(text);
    if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 20) throw inputError("Invalid call history receipt.");
    const result = await db.rpc("cp_ack_private_calls", { p_user: user.id, p_ids: body.ids.map(uuid) });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (error) { return accountApiError(error); }
}
