import { NextResponse } from "next/server";
import {
  createSupabaseAuthClient,
  createSupabaseUserClient,
  getBearerToken,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import {
  parseTournamentCreateInput,
  TOURNAMENT_REGISTRATION_SELECT,
  TOURNAMENT_SELECT,
  type Tournament,
  type TournamentRegistration,
} from "@/lib/tournaments";

export const dynamic = "force-dynamic";

async function optionalViewer(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return {
      user: null,
      client: createSupabaseAuthClient(),
    };
  }

  const client = createSupabaseUserClient(token);
  const { data } = await client.auth.getUser(token);
  return {
    user: data.user || null,
    client: data.user ? client : createSupabaseAuthClient(),
  };
}

export async function GET(request: Request) {
  try {
    const { user, client } = await optionalViewer(request);
    const { data, error } = await client
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .order("is_featured", { ascending: false })
      .order("starts_at", { ascending: true })
      .limit(120);

    if (error) throw new Error(error.message);

    let registrations: TournamentRegistration[] = [];
    if (user) {
      const registrationResult = await client
        .from("tournament_registrations")
        .select(TOURNAMENT_REGISTRATION_SELECT)
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });

      if (registrationResult.error) {
        throw new Error(registrationResult.error.message);
      }
      registrations = (registrationResult.data || []) as TournamentRegistration[];
    }

    return NextResponse.json({
      tournaments: (data || []) as Tournament[],
      registrations,
      viewerId: user?.id || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tournaments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const token = getBearerToken(request);
    const client = createSupabaseUserClient(token);
    const input = parseTournamentCreateInput(await request.json());

    const { data, error } = await client
      .from("tournaments")
      .insert({
        host_id: user.id,
        title: input.title,
        game_title: input.gameTitle,
        game_mode: input.gameMode,
        description: input.description,
        rules: input.rules,
        platform: input.platform,
        region: input.region,
        tournament_format: input.tournamentFormat,
        skill_level: input.skillLevel,
        team_size: input.teamSize,
        max_participants: input.maxParticipants,
        entry_fee: input.entryFee,
        prize_pool: input.prizePool,
        currency: "IDR",
        registration_deadline: input.registrationDeadline,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        status: "published",
      })
      .select(TOURNAMENT_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ tournament: data as Tournament }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to post tournament.";
    const status = /authentication|login/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
