import { NextResponse } from "next/server";
import {
  createSupabaseAuthClient,
  createSupabaseUserClient,
  getBearerToken,
} from "@/lib/serverSupabase";
import {
  TOURNAMENT_REGISTRATION_SELECT,
  TOURNAMENT_SELECT,
  type Tournament,
  type TournamentRegistration,
} from "@/lib/tournaments";

type RouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = getBearerToken(request);
    let viewerId: string | null = null;
    let client = createSupabaseAuthClient();

    if (token) {
      const userClient = createSupabaseUserClient(token);
      const { data } = await userClient.auth.getUser(token);
      if (data.user) {
        viewerId = data.user.id;
        client = userClient;
      }
    }

    const { data, error } = await client
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    }

    const tournament = data as Tournament;
    let registration: TournamentRegistration | null = null;
    let participants: TournamentRegistration[] = [];

    if (viewerId) {
      const registrationResult = await client
        .from("tournament_registrations")
        .select(TOURNAMENT_REGISTRATION_SELECT)
        .eq("tournament_id", id)
        .eq("user_id", viewerId)
        .maybeSingle();

      if (registrationResult.error) throw new Error(registrationResult.error.message);
      registration = (registrationResult.data as TournamentRegistration | null) || null;

      if (tournament.host_id === viewerId) {
        const participantResult = await client
          .from("tournament_registrations")
          .select(TOURNAMENT_REGISTRATION_SELECT)
          .eq("tournament_id", id)
          .order("joined_at", { ascending: true });

        if (participantResult.error) throw new Error(participantResult.error.message);
        participants = (participantResult.data || []) as TournamentRegistration[];
      }
    }

    return NextResponse.json({
      tournament,
      registration,
      participants,
      viewerId,
      isOrganizer: viewerId === tournament.host_id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tournament.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
