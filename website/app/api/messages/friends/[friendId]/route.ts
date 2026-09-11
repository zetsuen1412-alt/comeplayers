import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ friendId: string }> };

function pairFor(left: string, right: string) {
  return left.localeCompare(right) <= 0
    ? { userA: left, userB: right }
    : { userA: right, userB: left };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { friendId: rawFriendId } = await context.params;
    const friendId = String(rawFriendId || "").trim();
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = String(body.action || "accept").toLowerCase();
    if (!friendId || friendId === user.id) {
      return NextResponse.json({ error: "Invalid friend." }, { status: 400 });
    }

    const pair = pairFor(user.id, friendId);
    const supabaseAdmin = createSupabaseAdmin();
    const { data: friendship, error } = await supabaseAdmin
      .from("chat_friendships")
      .select("id,user_a,user_b,requested_by,status")
      .eq("user_a", pair.userA)
      .eq("user_b", pair.userB)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!friendship) {
      return NextResponse.json({ error: "Friend request was not found." }, { status: 404 });
    }

    if (action === "accept") {
      if (
        String(friendship.status) !== "pending" ||
        String(friendship.requested_by) === user.id
      ) {
        return NextResponse.json(
          { error: "This friend request cannot be accepted." },
          { status: 400 },
        );
      }
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("chat_friendships")
        .update({ status: "accepted", accepted_at: now, updated_at: now })
        .eq("id", friendship.id);
      if (updateError) throw new Error(updateError.message);
      return NextResponse.json({ ok: true, status: "accepted" });
    }

    if (action === "decline" || action === "remove" || action === "cancel") {
      const { error: deleteError } = await supabaseAdmin
        .from("chat_friendships")
        .delete()
        .eq("id", friendship.id);
      if (deleteError) throw new Error(deleteError.message);
      return NextResponse.json({ ok: true, removed: true });
    }

    return NextResponse.json({ error: "Unsupported friend action." }, { status: 400 });
  } catch (error) {
    console.error("Friend response failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Friend action failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  return PATCH(
    new Request(request.url, {
      method: "PATCH",
      headers: request.headers,
      body: JSON.stringify({ action: "remove" }),
    }),
    context,
  );
}
