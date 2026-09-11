import { NextResponse } from "next/server";
import { createSupabaseAdmin, requireAuthenticatedUser } from "@/lib/serverSupabase";
import {
  publicDevice,
  recordSecurityEvent,
  touchSecurityDevice,
} from "@/lib/requestSecurity";

function errorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/authentication|token/i.test(message)) return 401;
  if (/valid|required|not found|unsupported/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("user_security_devices")
      .select("*")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({
      devices: (data || []).map((item) => publicDevice(item as Record<string, unknown>)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected device error.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const device = await touchSecurityDevice({
      supabaseAdmin,
      userId: user.id,
      request,
      deviceKey: String(body.deviceKey || ""),
      deviceName: String(body.deviceName || "Current device"),
    });

    return NextResponse.json({ device: publicDevice(device) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected device error.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    const deviceId = String(body.deviceId || "").trim();
    const action = String(body.action || "").trim().toLowerCase();

    if (!deviceId) throw new Error("Device ID is required.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("user_security_devices")
      .select("*")
      .eq("id", deviceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Security device not found.");

    if (action === "revoke") {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("user_security_devices")
        .update({ revoked_at: now, trusted_at: null, updated_at: now })
        .eq("id", deviceId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);

      await recordSecurityEvent({
        supabaseAdmin,
        userId: user.id,
        request,
        eventType: "device_revoked",
        severity: "high",
        deviceId,
        details: { device_name: existing.device_name },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "rename") {
      const deviceName = String(body.deviceName || "").trim().slice(0, 120);
      if (deviceName.length < 2) throw new Error("Device name is required.");
      const { error } = await supabaseAdmin
        .from("user_security_devices")
        .update({ device_name: deviceName, updated_at: new Date().toISOString() })
        .eq("id", deviceId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "trust") {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("user_security_devices")
        .update({ trusted_at: now, revoked_at: null, updated_at: now })
        .eq("id", deviceId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    throw new Error("Unsupported device action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected device error.";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
