import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import { accountApiError, inputError } from "@/lib/accountApi";
import { requireStatusAccess } from "@/lib/chatStatus";
import { attachmentSignatureMatches } from "@/lib/chatAttachmentPolicy";
import { createR2DownloadUrl, putR2Object, deleteR2Object } from "@/lib/r2Server";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const [contacts, blocks, settings] = await Promise.all([
      db.from("chat_rooms").select("buyer_id,seller_id").neq("room_type", "group").not("last_message", "is", null).or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).limit(1000),
      db.from("chat_user_blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
      db.from("cp_messaging_settings").select("user_id").eq("status_audience", "nobody"),
    ]);
    for (const result of [contacts, blocks, settings]) if (result.error) throw result.error;
    const excluded = new Set([...(blocks.data || []).map(b => b.blocker_id === user.id ? b.blocked_id : b.blocker_id), ...(settings.data || []).map(s => s.user_id)]);
    const ids = [...new Set([user.id, ...(contacts.data || []).map(c => c.buyer_id === user.id ? c.seller_id : c.buyer_id).filter(id => !excluded.has(id))])];
    const statuses = await db.from("cp_statuses").select("id,author_id,body,background,created_at,expires_at,storage_path,mime_type").in("author_id", ids).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(150);
    if (statuses.error) throw statuses.error;
    const authors = [...new Set(statuses.data.map(s => s.author_id))];
    const [profiles, views] = await Promise.all([
      authors.length ? db.from("profiles").select("id,username,full_name,avatar_url").in("id", authors) : Promise.resolve({ data: [], error: null }),
      statuses.data.length ? db.from("cp_status_views").select("status_id,viewer_id").in("status_id", statuses.data.map(s => s.id)) : Promise.resolve({ data: [], error: null }),
    ]);
    if (profiles.error) throw profiles.error;
    if (views.error) throw views.error;
    return NextResponse.json({ statuses: statuses.data.map(s => ({ id: s.id, author_id: s.author_id, body: s.body, background: s.background, created_at: s.created_at, expires_at: s.expires_at, hasImage: !!s.storage_path, author: profiles.data?.find(p => p.id === s.author_id), seen: views.data?.some(v => v.status_id === s.id && v.viewer_id === user.id), viewCount: s.author_id === user.id ? views.data?.filter(v => v.status_id === s.id && v.viewer_id !== user.id).length || 0 : undefined })) });
  } catch (error) { return accountApiError(error); }
}
export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json();
      const status = await requireStatusAccess(user.id, String(body.id || ""));
      if (body.action === "image") {
        if (!status.storage_path) throw inputError("This status has no image.", 404);
        const url = await createR2DownloadUrl({ objectKey: status.storage_path, contentType: status.mime_type, fileName: "status.jpg", disposition: "inline", expiresIn: Math.max(1, Math.min(60, Math.floor((Date.parse(status.expires_at) - Date.now()) / 1000))) });
        return NextResponse.json({ url });
      }
      if (body.action !== "view") throw inputError("Unknown status action.");
      const result = await db.from("cp_status_views").upsert({ status_id: status.id, viewer_id: user.id }, { onConflict: "status_id,viewer_id", ignoreDuplicates: true });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }
    const form = await request.formData();
    const body = String(form.get("body") || "").trim();
    const background = String(form.get("background") || "#183e38");
    const file = form.get("file");
    if (body.length > 700 || (!body && !(file instanceof File))) throw inputError("Add a photo or up to 700 characters.");
    if (!/^#[0-9a-fA-F]{6}$/.test(background)) throw inputError("Invalid status color.");
    const count = await db.from("cp_statuses").select("id", { count: "exact", head: true }).eq("author_id", user.id).gt("created_at", new Date(Date.now() - 86400000).toISOString());
    if (count.error) throw count.error;
    if ((count.count || 0) >= 30) throw inputError("You can post up to 30 statuses in 24 hours.", 429);
    if (file instanceof File) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size < 1 || file.size > 1000000) throw inputError("Choose a JPG, PNG or WebP photo smaller than 1 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!attachmentSignatureMatches(bytes, file.type)) throw inputError("The image file is invalid.");
      uploadedKey = `chat-status/${user.id}/${randomUUID()}`;
      await putR2Object({ objectKey: uploadedKey, body: bytes, contentType: file.type });
    }
    const result = await db.from("cp_statuses").insert({ author_id: user.id, body, background, storage_path: uploadedKey, mime_type: file instanceof File ? file.type : null }).select("id").single();
    if (result.error) throw result.error;
    uploadedKey = null;
    return NextResponse.json({ ok: true, id: result.data.id }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await deleteR2Object(uploadedKey).catch(() => undefined);
    return accountApiError(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const db = createSupabaseAdmin();
    const body = await request.json();
    const result = await db.from("cp_statuses").update({ expires_at: new Date().toISOString() }).eq("id", String(body.id || "")).eq("author_id", user.id).select("id,storage_path").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw inputError("Status not found.", 404);
    if (result.data.storage_path) {
      try { await deleteR2Object(result.data.storage_path); }
      catch { return NextResponse.json({ ok: true }); }
    }
    const removed = await db.from("cp_statuses").delete().eq("id", result.data.id);
    if (removed.error) throw removed.error;
    return NextResponse.json({ ok: true });
  } catch (error) { return accountApiError(error); }
}
