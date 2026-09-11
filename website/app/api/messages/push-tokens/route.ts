import { NextResponse } from "next/server";
import { safeApiErrorMessage } from "@/lib/apiErrors";
import { chatErrorStatus } from "@/lib/chatServer";
import { isExpoPushToken } from "@/lib/pushNotifications";
import {
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

function safePlatform(value: unknown): "android" | "ios" {
  return String(value || "").toLowerCase() === "ios" ? "ios" : "android";
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      expoPushToken?: string;
      platform?: string;
    };
    const expoPushToken = String(body.expoPushToken || "").trim();

    if (!isExpoPushToken(expoPushToken)) {
      return NextResponse.json(
        { error: "A valid Expo push token is required." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin.from("chat_push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: safePlatform(body.platform),
        enabled: true,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "expo_push_token" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Push token registration failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to register notifications.", status) },
      { status }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { expoPushToken?: string };
    const expoPushToken = String(body.expoPushToken || "").trim();

    if (!isExpoPushToken(expoPushToken)) {
      return NextResponse.json({ ok: true });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("chat_push_tokens")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("expo_push_token", expoPushToken);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = chatErrorStatus(error);
    if (status >= 500) console.error("Push token removal failed:", error);
    return NextResponse.json(
      { error: safeApiErrorMessage(error, "Unable to disable notifications.", status) },
      { status }
    );
  }
}
