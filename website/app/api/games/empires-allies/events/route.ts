import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pairFor(left: string, right: string) {
  return left.localeCompare(right) <= 0
    ? { userA: left, userB: right }
    : { userA: right, userB: left };
}

function serviceRequestIsAuthorized(request: Request) {
  const expected = String(process.env.EMPIRES_ALLIES_SHARED_SECRET || "").trim();
  const authorization = String(request.headers.get("authorization") || "");
  const actual = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (expected.length < 32 || !actual) return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function displayName(profile: {
  username?: string | null;
  full_name?: string | null;
}) {
  return String(profile.username || profile.full_name || "A friendly commander")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 40);
}

export async function POST(request: Request) {
  if (!serviceRequestIsAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized service event." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      event?: string;
      eventId?: string;
      attackerUserId?: string;
      defenderUserId?: string;
      occurredAt?: number;
    };
    const event = String(body.event || "");
    const eventId = String(body.eventId || "").trim();
    const attackerUserId = String(body.attackerUserId || "").trim();
    const defenderUserId = String(body.defenderUserId || "").trim();
    const occurredAt = Number(body.occurredAt || 0);

    if (
      event !== "friend_attack" ||
      !UUID_PATTERN.test(eventId) ||
      !UUID_PATTERN.test(attackerUserId) ||
      !UUID_PATTERN.test(defenderUserId) ||
      attackerUserId === defenderUserId ||
      !Number.isFinite(occurredAt) ||
      Math.abs(Date.now() / 1000 - occurredAt) > 10 * 60
    ) {
      return NextResponse.json({ error: "Invalid game event." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const pair = pairFor(attackerUserId, defenderUserId);
    const [{ data: friendship, error: friendshipError }, profileResult] =
      await Promise.all([
        supabaseAdmin
          .from("chat_friendships")
          .select("id")
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .eq("status", "accepted")
          .maybeSingle(),
        supabaseAdmin
          .from("profiles")
          .select("username,full_name")
          .eq("id", attackerUserId)
          .maybeSingle(),
      ]);
    if (friendshipError) throw new Error(friendshipError.message);
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (!friendship) {
      return NextResponse.json(
        { error: "PvP notifications are limited to accepted friends." },
        { status: 403 },
      );
    }

    const linkUrl = `/play/empires-allies?attackEvent=${eventId}`;
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", defenderUserId)
      .eq("type", "game_attack")
      .eq("link_url", linkUrl)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const attackerName = displayName(profileResult.data || {});
    const { error: notificationError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: defenderUserId,
        type: "game_attack",
        title: "Your CP empire is under attack!",
        message: `${attackerName} attacked your CP Empires & Allies territory. Open the game to defend your empire.`,
        link_url: linkUrl,
        is_read: false,
      });
    if (notificationError) throw new Error(notificationError.message);

    return NextResponse.json({ ok: true, notified: defenderUserId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process the game event.",
      },
      { status: 500 },
    );
  }
}
