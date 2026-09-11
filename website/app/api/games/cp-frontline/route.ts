import { NextResponse } from "next/server";
import {
  createDefaultFrontlineProgress,
  frontlinePower,
  FRONTLINE_MISSIONS,
  sanitizeFrontlineProgress,
  type FrontlineBattleHistory,
  type FrontlineBattleResult,
  type FrontlineFriendTarget,
} from "@/lib/cpFrontline";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 80_000;
const PROFILE_SELECT = "id,username,full_name,avatar_url";

type FrontlineProfileRow = {
  user_id: string;
  state: unknown;
  level: number | null;
  power: number | null;
  wins: number | null;
  last_seen_at: string | null;
};

type PublicProfileRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

function pairFor(left: string, right: string) {
  return left.localeCompare(right) <= 0
    ? { userA: left, userB: right }
    : { userA: right, userB: left };
}

function safeInteger(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function friendlyName(profile: {
  username?: string | null;
  full_name?: string | null;
}) {
  return profile.full_name?.trim() || profile.username?.trim() || "ComePlayers Commander";
}

function responseStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Authentication") || message.includes("authentication")) {
    return authErrorStatus(message);
  }
  if (
    message.includes("arcade_frontline_") ||
    message.toLowerCase().includes("relation")
  ) {
    return 503;
  }
  return 500;
}

async function readJsonBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error("Frontline request is too large.");
  }
  return (await request.json()) as Record<string, unknown>;
}

async function acceptedFriendship(
  userId: string,
  friendId: string,
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
) {
  const pair = pairFor(userId, friendId);
  const { data, error } = await supabaseAdmin
    .from("chat_friendships")
    .select("id")
    .eq("user_a", pair.userA)
    .eq("user_b", pair.userB)
    .eq("status", "accepted")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();

    const [profileResult, friendshipResult, historyResult] = await Promise.all([
      supabaseAdmin
        .from("arcade_frontline_profiles")
        .select("user_id,state,level,power,wins,last_seen_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("chat_friendships")
        .select("user_a,user_b,status")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq("status", "accepted")
        .order("updated_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("arcade_frontline_battles")
        .select(
          "id,attacker_id,defender_id,result,score,stars,mission_code,created_at",
        )
        .or(`attacker_id.eq.${user.id},defender_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(24),
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);
    if (friendshipResult.error) throw new Error(friendshipResult.error.message);
    if (historyResult.error) throw new Error(historyResult.error.message);

    const friendIds = Array.from(
      new Set(
        (friendshipResult.data || []).map((friendship) =>
          String(friendship.user_a) === user.id
            ? String(friendship.user_b)
            : String(friendship.user_a),
        ),
      ),
    ).filter((id) => UUID_PATTERN.test(id));

    const historyOpponentIds = (historyResult.data || [])
      .flatMap((battle) => [String(battle.attacker_id), String(battle.defender_id)])
      .filter((id) => id !== user.id && UUID_PATTERN.test(id));
    const relatedIds = Array.from(new Set([...friendIds, ...historyOpponentIds]));

    const [profilesResult, gameProfilesResult] = await Promise.all([
      relatedIds.length
        ? supabaseAdmin.from("profiles").select(PROFILE_SELECT).in("id", relatedIds)
        : Promise.resolve({ data: [], error: null }),
      friendIds.length
        ? supabaseAdmin
            .from("arcade_frontline_profiles")
            .select("user_id,state,level,power,wins,last_seen_at")
            .in("user_id", friendIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (gameProfilesResult.error) throw new Error(gameProfilesResult.error.message);

    const publicProfileMap = new Map<string, PublicProfileRow>(
      ((profilesResult.data || []) as PublicProfileRow[]).map((profile) => [
        String(profile.id),
        profile,
      ]),
    );
    const gameProfileMap = new Map(
      ((gameProfilesResult.data || []) as FrontlineProfileRow[]).map((profile) => [
        String(profile.user_id),
        profile,
      ]),
    );

    const friends: FrontlineFriendTarget[] = friendIds.map((friendId) => {
      const publicProfile = publicProfileMap.get(friendId);
      const gameProfile = gameProfileMap.get(friendId);
      return {
        id: friendId,
        name: friendlyName(publicProfile || {}),
        username:
          typeof publicProfile?.username === "string"
            ? publicProfile.username
            : null,
        avatarUrl:
          typeof publicProfile?.avatar_url === "string"
            ? publicProfile.avatar_url
            : null,
        level: safeInteger(gameProfile?.level, 1, 100),
        power: safeInteger(gameProfile?.power, 900, 1_000_000_000),
        wins: safeInteger(gameProfile?.wins, 0, 10_000_000),
        lastSeenAt: gameProfile?.last_seen_at || null,
      };
    });

    const history: FrontlineBattleHistory[] = (historyResult.data || []).map(
      (battle) => {
        const attackerId = String(battle.attacker_id);
        const defenderId = battle.defender_id ? String(battle.defender_id) : null;
        const campaign = !defenderId;
        const opponentId = campaign
          ? null
          : attackerId === user.id
            ? defenderId
            : attackerId;
        const opponentProfile = opponentId
          ? publicProfileMap.get(opponentId) || {}
          : {};
        return {
          id: String(battle.id),
          opponentId,
          opponentName: campaign
            ? "Dominion Campaign"
            : friendlyName(opponentProfile),
          direction: campaign
            ? "campaign"
            : attackerId === user.id
              ? "attack"
              : "defense",
          result: String(battle.result) === "victory" ? "victory" : "defeat",
          score: safeInteger(battle.score, 0, 1_000_000_000),
          stars: safeInteger(battle.stars, 0, 3),
          missionCode: String(battle.mission_code || "operation-first-light"),
          createdAt: String(battle.created_at),
        };
      },
    );

    return NextResponse.json({
      online: true,
      profile: sanitizeFrontlineProgress(
        (profileResult.data as FrontlineProfileRow | null)?.state ||
          createDefaultFrontlineProgress(),
      ),
      friends,
      history,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load CP Frontline command data.",
      },
      { status: responseStatus(error) },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    const progress = sanitizeFrontlineProgress(body.progress);
    const supabaseAdmin = createSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("arcade_frontline_profiles").upsert(
      {
        user_id: user.id,
        state: { ...progress, updatedAt: now },
        level: progress.commanderLevel,
        power: frontlinePower(progress),
        wins: progress.wins,
        highest_score: progress.highestScore,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ saved: true, savedAt: now });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save CP Frontline progress.",
      },
      { status: responseStatus(error) },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await readJsonBody(request);
    if (body.action !== "record-battle") {
      return NextResponse.json({ error: "Unsupported Frontline action." }, { status: 400 });
    }

    const defenderId =
      typeof body.defenderId === "string" && UUID_PATTERN.test(body.defenderId)
        ? body.defenderId
        : null;
    const eventId =
      typeof body.eventId === "string" && body.eventId.length >= 8
        ? body.eventId.slice(0, 80)
        : "";
    if (!eventId) {
      return NextResponse.json({ error: "Battle event ID is required." }, { status: 400 });
    }
    if (defenderId === user.id) {
      return NextResponse.json({ error: "You cannot attack your own base." }, { status: 400 });
    }

    const rawResult = (body.result || {}) as Partial<FrontlineBattleResult>;
    const missionCode = FRONTLINE_MISSIONS.some(
      (mission) => mission.code === rawResult.missionCode,
    )
      ? String(rawResult.missionCode)
      : FRONTLINE_MISSIONS[0].code;
    const result: FrontlineBattleResult = {
      result: rawResult.result === "victory" ? "victory" : "defeat",
      score: safeInteger(rawResult.score, 0, 1_000_000_000),
      stars: safeInteger(rawResult.stars, 0, 3),
      kills: safeInteger(rawResult.kills, 0, 1_000_000),
      unitsDeployed: safeInteger(rawResult.unitsDeployed, 0, 100_000),
      missionCode,
      durationSeconds: safeInteger(rawResult.durationSeconds, 0, 3600),
    };

    const supabaseAdmin = createSupabaseAdmin();
    if (defenderId) {
      const isFriend = await acceptedFriendship(user.id, defenderId, supabaseAdmin);
      if (!isFriend) {
        return NextResponse.json(
          { error: "Only accepted ComePlayers friends can be attacked." },
          { status: 403 },
        );
      }
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("arcade_frontline_battles")
      .select("id")
      .eq("attacker_id", user.id)
      .eq("client_event_id", eventId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return NextResponse.json({ recorded: true, duplicate: true, battleId: existing.id });
    }

    const { data: battle, error: battleError } = await supabaseAdmin
      .from("arcade_frontline_battles")
      .insert({
        attacker_id: user.id,
        defender_id: defenderId,
        client_event_id: eventId,
        result: result.result,
        score: result.score,
        stars: result.stars,
        mission_code: result.missionCode,
        summary: {
          kills: result.kills,
          unitsDeployed: result.unitsDeployed,
          durationSeconds: result.durationSeconds,
        },
      })
      .select("id")
      .single();
    if (battleError || !battle) {
      throw new Error(battleError?.message || "Battle record was not created.");
    }

    if (defenderId) {
      const { data: attackerProfile } = await supabaseAdmin
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", user.id)
        .maybeSingle();
      const attackerName = friendlyName(attackerProfile || {});
      const { error: notificationError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: defenderId,
          type: "frontline_attack",
          title: "Your CP Frontline base was attacked!",
          message: `${attackerName} launched a ${result.result === "victory" ? "successful" : "repelled"} assault. Open CP Frontline to review the battle.`,
          link_url: `/cpcommunity?game=cp-frontline&battle=${battle.id}`,
          is_read: false,
        });
      if (notificationError) throw new Error(notificationError.message);
    }

    return NextResponse.json({
      recorded: true,
      battleId: String(battle.id),
      notificationSent: Boolean(defenderId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to record CP Frontline battle.",
      },
      { status: responseStatus(error) },
    );
  }
}
