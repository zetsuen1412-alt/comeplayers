import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import {
  hasCommunityPermission,
  requireCommunityChannel,
} from "@/lib/communityServer";
import {
  createCommunityVoiceRoomName,
  createCommunityVoiceToken,
  getLiveKitServerUrl,
} from "@/lib/livekitServer";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      roomId?: string;
      channelId?: string;
    };
    const roomId = String(body.roomId || "").trim();
    const channelId = String(body.channelId || "").trim();
    if (!roomId || !channelId) {
      return NextResponse.json(
        { error: "Room ID and voice channel ID are required." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { access, channel } = await requireCommunityChannel({
      supabaseAdmin,
      userId: user.id,
      roomId,
      channelId,
    });
    if (String(channel.channel_type || "").toLowerCase() !== "voice") {
      return NextResponse.json(
        { error: "The selected channel is not a voice channel." },
        { status: 400 },
      );
    }
    if (!hasCommunityPermission(access, "connect_voice")) {
      return NextResponse.json(
        { error: "You do not have permission to connect to this voice channel." },
        { status: 403 },
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,username,full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const participantName = String(
      profile?.username || profile?.full_name || user.email || "ComePlayers User",
    ).trim();
    const roomName = createCommunityVoiceRoomName({
      communityId: access.community.id,
      channelId: String(channel.id),
    });
    const permissions = {
      canPublishVideo: hasCommunityPermission(access, "publish_video"),
      canShareScreen: hasCommunityPermission(access, "share_screen"),
      canModerateVoice: hasCommunityPermission(access, "moderate_voice"),
    };
    const participantToken = await createCommunityVoiceToken({
      userId: user.id,
      participantName,
      roomName,
      roomId,
      communityId: access.community.id,
      channelId: String(channel.id),
      ...permissions,
    });

    return NextResponse.json(
      {
        serverUrl: getLiveKitServerUrl(),
        participantToken,
        roomName,
        channel: { id: channel.id, name: channel.name },
        permissions,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("LiveKit voice token failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to connect to voice.", status) },
      { status },
    );
  }
}
