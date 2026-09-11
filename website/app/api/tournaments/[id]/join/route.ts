import { NextResponse } from "next/server";
import {
  createSupabaseAdmin,
  createSupabaseUserClient,
  getBearerToken,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";
import {
  parseTournamentJoinInput,
  TOURNAMENT_REGISTRATION_SELECT,
  TOURNAMENT_SELECT,
  type Tournament,
  type TournamentRegistration,
} from "@/lib/tournaments";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser(request);
    const token = getBearerToken(request);
    const client = createSupabaseUserClient(token);
    const input = parseTournamentJoinInput(await request.json());

    const tournamentResult = await client
      .from("tournaments")
      .select(TOURNAMENT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (tournamentResult.error) throw new Error(tournamentResult.error.message);
    if (!tournamentResult.data) throw new Error("Tournament not found.");
    const tournament = tournamentResult.data as Tournament;

    const existingResult = await client
      .from("tournament_registrations")
      .select(TOURNAMENT_REGISTRATION_SELECT)
      .eq("tournament_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingResult.error) throw new Error(existingResult.error.message);

    let registration: TournamentRegistration;
    if (existingResult.data) {
      const existing = existingResult.data as TournamentRegistration;
      if (existing.status !== "withdrawn") {
        throw new Error("You are already registered for this tournament.");
      }

      const updateResult = await client
        .from("tournament_registrations")
        .update({
          game_username: input.gameUsername,
          team_name: input.teamName,
          contact_handle: input.contactHandle,
          notes: input.notes,
          status: "registered",
        })
        .eq("id", existing.id)
        .select(TOURNAMENT_REGISTRATION_SELECT)
        .single();

      if (updateResult.error) throw new Error(updateResult.error.message);
      registration = updateResult.data as TournamentRegistration;
    } else {
      const insertResult = await client
        .from("tournament_registrations")
        .insert({
          tournament_id: id,
          user_id: user.id,
          game_username: input.gameUsername,
          team_name: input.teamName,
          contact_handle: input.contactHandle,
          notes: input.notes,
          status: "registered",
        })
        .select(TOURNAMENT_REGISTRATION_SELECT)
        .single();

      if (insertResult.error) throw new Error(insertResult.error.message);
      registration = insertResult.data as TournamentRegistration;
    }

    try {
      const admin = createSupabaseAdmin();
      await admin.from("notifications").insert({
        user_id: tournament.host_id,
        type: "tournament_join",
        title: "New tournament registration",
        message: `${registration.player_name} joined ${tournament.title}.`,
        link_url: `/tournaments/${tournament.id}`,
      });
    } catch (notificationError) {
      console.error(
        "Tournament notification error:",
        notificationError instanceof Error ? notificationError.message : notificationError,
      );
    }

    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join tournament.";
    const status = /authentication|login/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser(request);
    const token = getBearerToken(request);
    const client = createSupabaseUserClient(token);

    const { data, error } = await client
      .from("tournament_registrations")
      .update({ status: "withdrawn" })
      .eq("tournament_id", id)
      .eq("user_id", user.id)
      .in("status", ["registered", "checked_in"])
      .select(TOURNAMENT_REGISTRATION_SELECT)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Active tournament registration not found.");
    return NextResponse.json({ registration: data as TournamentRegistration });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to withdraw registration.";
    const status = /authentication|login/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
