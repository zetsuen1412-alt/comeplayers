import { NextResponse } from "next/server";
import { accountApiError, inputError } from "@/lib/accountApi";
import { limitedBody, privateActor, uuid } from "@/lib/privateMessaging";
import { requireChatRoomAccess } from "@/lib/chatServer";

const PAGE_SIZE = 100;
const messageSelect = "id,room_id,sender_id,receiver_id,message,message_type,attachment_id,reply_to_id,is_read,read_at,created_at,edited_at,deleted_at";

type LegacyMessage = {
  id: string; room_id: string; sender_id: string; receiver_id: string;
  message: string | null; message_type?: string | null; attachment_id?: number | null;
  reply_to_id?: string | null; is_read?: boolean | null; read_at?: string | null;
  created_at: string; edited_at?: string | null; deleted_at?: string | null;
};

export async function GET(request: Request) {
  try {
    const { user, db } = await privateActor(request);
    const url = new URL(request.url), roomId = uuid(url.searchParams.get("roomId"));
    const before = String(url.searchParams.get("before") || "").trim();
    if (before && !Number.isFinite(Date.parse(before))) throw inputError("Invalid legacy history cursor.");
    const { room } = await requireChatRoomAccess({ userId: user.id, roomId, supabaseAdmin: db, allowAdmin: false });
    if (room.room_type === "group") throw inputError("Community history is separate.");

    let query = db.from("chat_messages").select(messageSelect).eq("room_id", roomId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE);
    if (before) query = query.lt("created_at", before);
    const result = await query;
    if (result.error) throw result.error;
    const rows = (result.data || []) as LegacyMessage[];

    const attachmentIds = [...new Set(rows.map(row => Number(row.attachment_id || 0)).filter(id => Number.isInteger(id) && id > 0))];
    const replyIds = [...new Set(rows.map(row => row.reply_to_id).filter((id): id is string => !!id))];
    const [attachments, replies] = await Promise.all([
      attachmentIds.length ? db.from("chat_attachments").select("id,file_name,mime_type,size_bytes,moderation_status,deleted_at,created_at")
        .eq("room_id", roomId).in("id", attachmentIds) : Promise.resolve({ data: [], error: null }),
      replyIds.length ? db.from("chat_messages").select("id,sender_id,message,deleted_at").eq("room_id", roomId).in("id", replyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (attachments.error) throw attachments.error;
    if (replies.error) throw replies.error;
    const attachmentMap = new Map((attachments.data || []).map(item => [Number(item.id), item]));
    const replyMap = new Map((replies.data || []).map(item => [String(item.id), item]));
    const oldest = rows.at(-1);

    return NextResponse.json({
      messages: rows.map(row => ({
        ...row,
        attachment: !row.deleted_at && row.attachment_id ? attachmentMap.get(Number(row.attachment_id)) || null : null,
        reply_to: row.reply_to_id ? replyMap.get(row.reply_to_id) || null : null,
      })),
      next: rows.length === PAGE_SIZE && oldest ? oldest.created_at : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  try {
    const text = await limitedBody(request, 8192), { user, db } = await privateActor(request, text), body = JSON.parse(text);
    if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100) throw inputError("Invalid legacy read receipt.");
    const roomId = uuid(body.roomId);
    const { room } = await requireChatRoomAccess({ userId: user.id, roomId, supabaseAdmin: db, allowAdmin: false });
    if (room.room_type === "group") throw inputError("Community history is separate.");
    const result = await db.from("chat_messages").update({ is_read: true, read_at: new Date().toISOString() })
      .eq("room_id", roomId).eq("receiver_id", user.id).in("id", body.ids.map(uuid));
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountApiError(error); }
}
