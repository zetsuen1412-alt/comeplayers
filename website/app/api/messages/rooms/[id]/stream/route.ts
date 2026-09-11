import { NextResponse } from "next/server";
import {
  chatErrorStatus,
  isAdminUser,
  isGroupRoom,
  requireChatRoomAccess,
} from "@/lib/chatServer";
import {
  createPublicChatStreamState,
  requestOrigin,
} from "@/lib/chatStream";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

const roomSelect =
  "id,buyer_id,seller_id,product_id,order_id,room_type,title,description,created_by,status,last_message,last_message_at,last_message_sender_id,stream_status,stream_host_id,stream_title,stream_started_at,stream_ended_at,stream_updated_at,created_at,updated_at";

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    if (!roomId) {
      return NextResponse.json({ error: "Room ID is required." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });

    if (!isGroupRoom(access.room)) {
      return NextResponse.json(
        { error: "Live streaming is only available inside group chats." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      room: access.room,
      stream: createPublicChatStreamState(access.room, requestOrigin(request)),
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    console.error("Group stream state failed:", error);

    const safeMessage =
      status === 401
        ? "Authentication required."
        : status === 403
          ? "You are not allowed to view this stream."
          : status === 404
            ? "Chat room not found."
            : status === 400
              ? "The stream request is invalid."
              : "Unable to load the stream right now.";

    return NextResponse.json({ error: safeMessage }, { status });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const roomId = String(id || "").trim();
    const body = (await request.json()) as {
      action?: "start" | "stop";
      title?: string;
    };
    const action = String(body.action || "").toLowerCase();

    if (action !== "start" && action !== "stop") {
      return NextResponse.json(
        { error: "Stream action must be start or stop." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();
    const access = await requireChatRoomAccess({
      roomId,
      userId: user.id,
      supabaseAdmin,
    });

    if (!isGroupRoom(access.room)) {
      return NextResponse.json(
        { error: "Live streaming is only available inside group chats." },
        { status: 400 },
      );
    }

    if (String(access.room.status || "active").toLowerCase() !== "active") {
      const locked = new Error("This group chat is currently locked.");
      Object.assign(locked, { status: 403 });
      throw locked;
    }

    const now = new Date().toISOString();

    if (action === "start") {
      if (
        String(access.room.stream_status || "idle").toLowerCase() === "live" &&
        access.room.stream_host_id &&
        access.room.stream_host_id !== user.id
      ) {
        return NextResponse.json(
          { error: "Another member is already live in this group." },
          { status: 409 },
        );
      }

      const streamTitle =
        String(body.title || "")
          .trim()
          .slice(0, 80) || "Live gameplay";
      const { data, error } = await supabaseAdmin
        .from("chat_rooms")
        .update({
          stream_status: "live",
          stream_host_id: user.id,
          stream_title: streamTitle,
          stream_started_at: now,
          stream_ended_at: null,
          stream_updated_at: now,
          updated_at: now,
        })
        .eq("id", roomId)
        .select(roomSelect)
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({
        ok: true,
        room: data,
        stream: createPublicChatStreamState(data, requestOrigin(request)),
      });
    }

    const admin = await isAdminUser(supabaseAdmin, user.id);
    const canStop =
      access.room.stream_host_id === user.id ||
      access.role === "group_owner" ||
      access.role === "group_moderator" ||
      access.role === "admin" ||
      admin;

    if (!canStop) {
      const forbidden = new Error(
        "Only the stream host or a group moderator can stop it.",
      );
      Object.assign(forbidden, { status: 403 });
      throw forbidden;
    }

    const { data, error } = await supabaseAdmin
      .from("chat_rooms")
      .update({
        stream_status: "idle",
        stream_host_id: null,
        stream_title: null,
        stream_ended_at: now,
        stream_updated_at: now,
        updated_at: now,
      })
      .eq("id", roomId)
      .select(roomSelect)
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      room: data,
      stream: createPublicChatStreamState(data, requestOrigin(request)),
    });
  } catch (error) {
    const status = chatErrorStatus(error);
    console.error("Group stream action failed:", error);

    const safeMessage =
      status === 401
        ? "Authentication required."
        : status === 403
          ? "You are not allowed to manage this stream."
          : status === 404
            ? "Chat room not found."
            : status === 400
              ? "The stream request is invalid."
              : "Unable to update the stream right now.";

    return NextResponse.json({ error: safeMessage }, { status });
  }
}
