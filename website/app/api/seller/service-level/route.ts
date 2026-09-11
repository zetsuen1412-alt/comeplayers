import { NextResponse } from "next/server";
import {
  effectivePresence,
  normalizePresence,
} from "@/lib/sellerServiceLevel";
import {
  authErrorStatus,
  createSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/serverSupabase";

export const runtime = "nodejs";

const MIN_SLA_MINUTES = 15;
const MAX_SLA_MINUTES = 10080;

const PROFILE_FIELDS = [
  "id",
  "email",
  "username",
  "role",
  "seller_status",
  "seller_name",
  "seller_presence_mode",
  "seller_last_seen_at",
  "seller_delivery_sla_minutes",
  "seller_avg_delivery_minutes",
  "seller_on_time_rate",
  "seller_total_deliveries",
  "seller_late_deliveries",
  "seller_service_level",
  "seller_service_metrics_updated_at",
].join(",");

type SellerProfileRow = {
  id: string;
  role?: string | null;
  seller_status?: string | null;
  seller_presence_mode?: string | null;
  seller_last_seen_at?: string | null;
  seller_delivery_sla_minutes?: number | null;
  seller_avg_delivery_minutes?: number | string | null;
  seller_on_time_rate?: number | string | null;
  seller_total_deliveries?: number | null;
  seller_late_deliveries?: number | null;
  seller_service_level?: string | null;
  [key: string]: unknown;
};

function isApprovedSeller(profile: SellerProfileRow | null) {
  const role = String(profile?.role || "").toLowerCase();
  const sellerStatus = String(profile?.seller_status || "").toLowerCase();
  return role === "admin" || role === "seller" || sellerStatus === "approved";
}

function serializeProfile(profile: SellerProfileRow) {
  return {
    ...profile,
    seller_presence_mode: normalizePresence(profile.seller_presence_mode),
    effective_presence: effectivePresence(
      profile.seller_presence_mode,
      profile.seller_last_seen_at
    ),
    seller_delivery_sla_minutes: Math.max(
      MIN_SLA_MINUTES,
      Math.min(
        Number(profile.seller_delivery_sla_minutes || 60),
        MAX_SLA_MINUTES
      )
    ),
    seller_avg_delivery_minutes: Number(profile.seller_avg_delivery_minutes || 0),
    seller_on_time_rate: Number(profile.seller_on_time_rate || 100),
    seller_total_deliveries: Number(profile.seller_total_deliveries || 0),
    seller_late_deliveries: Number(profile.seller_late_deliveries || 0),
  };
}

async function loadSellerProfile(userId: string) {
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const profile = (data || null) as SellerProfileRow | null;
  if (!profile || !isApprovedSeller(profile)) {
    return { profile: null, supabaseAdmin };
  }

  return { profile, supabaseAdmin };
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { profile } = await loadSellerProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "Approved seller access required." },
        { status: 403 }
      );
    }

    return NextResponse.json({ profile: serializeProfile(profile) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load seller service level.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { profile, supabaseAdmin } = await loadSellerProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "Approved seller access required." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      presenceMode?: unknown;
      deliverySlaMinutes?: unknown;
    };

    const updates: Record<string, unknown> = {};

    if (body.presenceMode !== undefined) {
      const rawPresence = String(body.presenceMode || "").toLowerCase();
      if (!['online', 'away', 'offline'].includes(rawPresence)) {
        return NextResponse.json(
          { error: "Presence mode must be online, away, or offline." },
          { status: 400 }
        );
      }

      updates.seller_presence_mode = rawPresence;
      updates.seller_last_seen_at =
        rawPresence === "offline" ? null : new Date().toISOString();
    }

    if (body.deliverySlaMinutes !== undefined) {
      const slaMinutes = Math.round(Number(body.deliverySlaMinutes));
      if (
        !Number.isFinite(slaMinutes) ||
        slaMinutes < MIN_SLA_MINUTES ||
        slaMinutes > MAX_SLA_MINUTES
      ) {
        return NextResponse.json(
          {
            error: `Delivery SLA must be between ${MIN_SLA_MINUTES} and ${MAX_SLA_MINUTES} minutes.`,
          },
          { status: 400 }
        );
      }
      updates.seller_delivery_sla_minutes = slaMinutes;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid service-level changes were provided." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select(PROFILE_FIELDS)
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      profile: serializeProfile(data as unknown as SellerProfileRow),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update seller service level.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { profile, supabaseAdmin } = await loadSellerProfile(user.id);

    if (!profile) {
      return NextResponse.json(
        { error: "Approved seller access required." },
        { status: 403 }
      );
    }

    const presenceMode = normalizePresence(profile.seller_presence_mode);

    if (presenceMode !== "offline") {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ seller_last_seen_at: now })
        .eq("id", user.id);

      if (error) throw new Error(error.message);

      return NextResponse.json({
        success: true,
        effectivePresence: presenceMode,
        lastSeenAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      effectivePresence: "offline",
      lastSeenAt: profile.seller_last_seen_at || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Seller heartbeat failed.";

    return NextResponse.json(
      { error: message },
      { status: authErrorStatus(message) }
    );
  }
}
