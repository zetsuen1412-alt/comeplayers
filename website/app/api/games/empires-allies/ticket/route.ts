import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_SELECT = "id,username,full_name,avatar_url";

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function getServiceUrl() {
  const raw = String(
    process.env.EMPIRES_ALLIES_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_EMPIRES_ALLIES_URL ||
      "",
  ).trim();

  if (!raw) {
    throw new Error(
      "CP Empires & Allies service URL is not configured. Set EMPIRES_ALLIES_PUBLIC_URL.",
    );
  }

  const url = new URL(raw);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost"
  ) {
    throw new Error(
      "CP Empires & Allies must use HTTPS outside local development.",
    );
  }
  return url.origin;
}

function getSharedSecret() {
  const value = String(process.env.EMPIRES_ALLIES_SHARED_SECRET || "").trim();
  if (value.length < 32) {
    throw new Error(
      "EMPIRES_ALLIES_SHARED_SECRET must contain at least 32 characters.",
    );
  }
  return value;
}

function displayName(profile: {
  username?: string | null;
  full_name?: string | null;
}) {
  return String(profile.username || profile.full_name || "Commander")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 32);
}

async function assertServiceReady(serviceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(new URL("/healthz", serviceUrl), {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      ok?: boolean;
      onlineMode?: boolean;
      storage?: string;
    };
    if (!payload.ok) throw new Error("Service is not ready.");
    const publicProductionService =
      process.env.NODE_ENV === "production" &&
      serviceUrl !== "http://127.0.0.1:5005" &&
      serviceUrl !== "http://localhost:5005";
    if (
      publicProductionService &&
      (!payload.onlineMode || payload.storage !== "postgresql")
    ) {
      throw new Error("Shared online storage is not ready.");
    }
  } catch {
    throw new Error(
      "CP Empires & Allies online server is temporarily unavailable. Please retry shortly.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const serviceUrl = getServiceUrl();
    await assertServiceReady(serviceUrl);

    const [{ data: profile, error: profileError }, friendshipsResult] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select(PROFILE_SELECT)
          .eq("id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("chat_friendships")
          .select("user_a,user_b,status")
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
          .eq("status", "accepted")
          .limit(200),
      ]);
    if (profileError) throw new Error(profileError.message);
    if (friendshipsResult.error) throw new Error(friendshipsResult.error.message);

    const friendIds = (friendshipsResult.data || [])
      .map((row) =>
        String(row.user_a) === user.id ? String(row.user_b) : String(row.user_a),
      )
      .filter(Boolean);

    const profilesResult = friendIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select(PROFILE_SELECT)
          .in("id", friendIds)
      : { data: [], error: null };
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const friends = (profilesResult.data || []).map((friend) => ({
      id: String(friend.id),
      name: displayName(friend),
      avatar: String(friend.avatar_url || "").slice(0, 500),
    }));

    const userMetadata = (user.user_metadata || {}) as Record<string, unknown>;
    const emailPrefix = String(user.email || "Commander").split("@")[0];
    const playerName = String(
      profile?.username ||
        profile?.full_name ||
        userMetadata.full_name ||
        userMetadata.name ||
        emailPrefix ||
        "Commander",
    )
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 32);

    const nowIso = new Date().toISOString();
    const presenceResult = await supabaseAdmin
      .from("empires_allies_presence")
      .upsert(
        {
          user_id: user.id,
          status: "playing",
          world_name: `${playerName || "Commander"} Empire`.slice(0, 80),
          last_seen_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "user_id" },
      );
    if (
      presenceResult.error &&
      !/does not exist|schema cache/i.test(presenceResult.error.message)
    ) {
      throw new Error(presenceResult.error.message);
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,
      name: playerName || "Commander",
      avatar: String(profile?.avatar_url || userMetadata.avatar_url || "").slice(
        0,
        500,
      ),
      friends,
      iat: now,
      exp: now + 120,
      nonce: randomUUID(),
      aud: "comeplayers-empires-allies",
    };

    const encodedPayload = base64Url(JSON.stringify(payload));
    const signature = createHmac("sha256", getSharedSecret())
      .update(encodedPayload)
      .digest("base64url");
    const launchUrl = new URL("/comeplayers/launch", serviceUrl);
    launchUrl.searchParams.set("ticket", `${encodedPayload}.${signature}`);

    return NextResponse.json(
      {
        launchUrl: launchUrl.toString(),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        playerName: payload.name,
        friendCount: friends.length,
        friendIds: friends.map((friend) => friend.id),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create game session.";
    const status = message.toLowerCase().includes("auth") ? 401 : 503;
    return NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
