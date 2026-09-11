import { searchContacts, assertContactAllowed, limitContactSearch } from "@/lib/chatContacts";
import { NextResponse } from "next/server";
import { bootstrapCommunityForRoom } from "@/lib/communityServer";
import {
  chatErrorStatus,
  createChatNotification,
  safeProfileLabel,
} from "@/lib/chatServer";
import { recordAdminAudit } from "@/lib/adminSecurity";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

const roomSelect =
  "id,buyer_id,seller_id,product_id,order_id,room_type,title,description,created_by,status,last_message,last_message_at,last_message_sender_id,stream_status,stream_host_id,stream_title,stream_started_at,stream_ended_at,stream_updated_at,party_game,party_mode,party_rank,party_platform,party_region,party_size,party_open,party_updated_at,created_at,updated_at";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function safeGroupError(error: unknown, fallback: string) {
  const status = chatErrorStatus(error);
  if (status === 401) return "Authentication required.";
  if (status === 403) return "You are not allowed to perform this action.";
  if (status === 404) return "Requested resource was not found.";
  return error instanceof Error && status < 500 ? error.message : fallback;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const query = cleanText(searchParams.get("q"), 60).replace(/^@/, "");

    await limitContactSearch(user.id);
    const data = await searchContacts(supabaseAdmin, user.id, query);

    return NextResponse.json({ users: data || [] });
  } catch (error) {
    console.error("Group user lookup failed:", error);
    const status = chatErrorStatus(error);
    return NextResponse.json(
      { error: safeGroupError(error, "Unable to load players.") },
      { status },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      memberIds?: string[];
      openParty?: boolean;
      game?: string;
      mode?: string;
      rank?: string;
      platform?: string;
      region?: string;
      partySize?: number | string;
    };

    const title = cleanText(body.title, 80);
    const description = cleanText(body.description, 240);
    const openParty = body.openParty === true;
    const partyGame = cleanText(body.game, 80);
    const partyMode = cleanText(body.mode, 60);
    const partyRank = cleanText(body.rank, 60);
    const partyPlatform = cleanText(body.platform, 40);
    const partyRegion = cleanText(body.region, 40);
    const requestedPartySize = Number(body.partySize || 5);
    const partySize = Number.isInteger(requestedPartySize)
      ? Math.min(20, Math.max(2, requestedPartySize))
      : 5;

    if (title.length < 3 || title.length > 80) {
      return NextResponse.json(
        { error: "Group name must be between 3 and 80 characters." },
        { status: 400 },
      );
    }

    if (description.length > 240) {
      return NextResponse.json(
        { error: "Group description must be 240 characters or fewer." },
        { status: 400 },
      );
    }

    if (openParty && partyGame.length < 2) {
      return NextResponse.json(
        { error: "Choose a game before publishing the party to Squad Finder." },
        { status: 400 },
      );
    }

    const memberIds = Array.from(
      new Set(
        (Array.isArray(body.memberIds) ? body.memberIds : [])
          .map((memberId) => String(memberId || "").trim())
          .filter((memberId) => isUuid(memberId) && memberId !== user.id),
      ),
    ).slice(0, 50);

    if (openParty && memberIds.length + 1 > partySize) {
      return NextResponse.json(
        { error: `This party only has ${partySize} slots.` },
        { status: 400 },
      );
    }

    for (const memberId of memberIds) await assertContactAllowed(supabaseAdmin, user.id, memberId);
    const now = new Date().toISOString();
    const { data: room, error: roomError } = await supabaseAdmin
      .from("chat_rooms")
      .insert({
        buyer_id: user.id,
        seller_id: user.id,
        product_id: null,
        order_id: null,
        room_type: "group",
        title,
        description: description || null,
        created_by: user.id,
        status: "active",
        last_message: openParty ? "Party created" : "Group created",
        last_message_at: now,
        last_message_sender_id: user.id,
        stream_status: "idle",
        stream_updated_at: now,
        party_game: partyGame || null,
        party_mode: partyMode || null,
        party_rank: partyRank || null,
        party_platform: partyPlatform || null,
        party_region: partyRegion || null,
        party_size: partySize,
        party_open: openParty,
        party_updated_at: now,
      })
      .select(roomSelect)
      .single();

    if (roomError) throw new Error(roomError.message);

    const roomId = String(room.id || "");
    const ownerRow = {
      room_id: roomId,
      user_id: user.id,
      member_role: "owner",
      status: "active",
      invited_by: user.id,
      last_read_at: now,
    };

    const { error: memberError } = await supabaseAdmin
      .from("chat_room_members")
      .insert(ownerRow);

    if (memberError) throw new Error(memberError.message);

    let invitationCount = 0;
    if (memberIds.length) {
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: invitations, error: invitationError } = await supabaseAdmin
        .from("chat_party_invitations")
        .insert(
          memberIds.map((memberId) => ({
            room_id: roomId,
            inviter_id: user.id,
            invitee_id: memberId,
            source: "group_create",
            status: "pending",
            expires_at: expiresAt,
            updated_at: now,
          })),
        )
        .select("id,invitee_id");

      if (invitationError) throw new Error(invitationError.message);
      invitationCount = invitations?.length || 0;

      const { data: creatorProfile } = await supabaseAdmin
        .from("profiles")
        .select("username,full_name,email")
        .eq("id", user.id)
        .maybeSingle();

      await Promise.all(
        memberIds.map((memberId) =>
          createChatNotification({
            supabaseAdmin,
            receiverId: memberId,
            senderName: safeProfileLabel(creatorProfile),
            roomId,
            preview: `Invited you to ${title}. Accept to join.`,
          }),
        ),
      );
    }

    let communitySetupPending = false;
    try {
      await bootstrapCommunityForRoom({
        supabaseAdmin,
        roomId,
        actorId: user.id,
      });
    } catch (communityError) {
      communitySetupPending = true;
      console.error(
        "Community bootstrap after group creation failed:",
        communityError,
      );
    }

    await recordAdminAudit({
      adminId: user.id,
      action: openParty ? "create_open_party" : "create_group_chat",
      entityType: "chat_room",
      entityId: roomId,
      afterData: {
        title,
        description: description || null,
        member_count: 1,
        invitation_count: invitationCount,
        party_open: openParty,
        party_game: partyGame || null,
        party_size: partySize,
      },
      metadata: { initiated_by_member: true },
    });

    return NextResponse.json({
      ok: true,
      room,
      communitySetupPending,
      invitationCount,
    });
  } catch (error) {
    console.error("Group creation failed:", error);
    const status = chatErrorStatus(error);
    return NextResponse.json(
      { error: safeGroupError(error, "Unable to create the group chat.") },
      { status },
    );
  }
}
