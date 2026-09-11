import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/serverSupabase";

export async function GET() {
  const now = new Date().toISOString();
  const { data, error } = await createSupabaseAdmin().from("announcements")
    .select("id,title,slug,summary,content,type,priority,is_pinned,image_url,publish_at,created_at")
    .eq("status", "published").or(`publish_at.is.null,publish_at.lte.${now}`)
    .or(`expire_at.is.null,expire_at.gt.${now}`).order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false }).limit(60);
  if (error) return NextResponse.json({ error: "News is temporarily unavailable." }, { status: 503 });
  return NextResponse.json({ articles: data || [] }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
