import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

function normalizeCode(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-_]/g, "");
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function buildCouponPayload(body: Record<string, unknown>) {
  const discountType = String(body.discount_type || "").trim().toLowerCase();
  const status = String(body.status || "active").trim().toLowerCase();
  const code = normalizeCode(body.code);
  const name = String(body.name || "").trim();
  const discountValue = Number(body.discount_value || 0);
  const minimumOrderAmount = Number(body.minimum_order_amount || 0);
  const maximumDiscountAmount = nullableNumber(body.maximum_discount_amount);
  const usageLimit = nullableNumber(body.usage_limit);
  const startAt = body.start_at ? new Date(String(body.start_at)) : null;
  const endAt = body.end_at ? new Date(String(body.end_at)) : null;

  if (!code) throw new Error("Coupon code is required.");
  if (!name) throw new Error("Coupon name is required.");
  if (!new Set(["fixed", "percent"]).has(discountType)) {
    throw new Error("Invalid coupon discount type.");
  }
  if (!new Set(["active", "inactive"]).has(status)) {
    throw new Error("Invalid coupon status.");
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error("Discount value must be greater than zero.");
  }
  if (discountType === "percent" && discountValue > 100) {
    throw new Error("Percentage discount cannot exceed 100.");
  }
  if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) {
    throw new Error("Minimum order amount is invalid.");
  }
  if (
    maximumDiscountAmount !== null &&
    (!Number.isFinite(maximumDiscountAmount) || maximumDiscountAmount < 0)
  ) {
    throw new Error("Maximum discount amount is invalid.");
  }
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
    throw new Error("Usage limit must be a positive integer.");
  }
  if (startAt && Number.isNaN(startAt.getTime())) {
    throw new Error("Coupon start date is invalid.");
  }
  if (endAt && Number.isNaN(endAt.getTime())) {
    throw new Error("Coupon end date is invalid.");
  }
  if (startAt && endAt && endAt <= startAt) {
    throw new Error("Coupon end date must be after its start date.");
  }

  return {
    code,
    name,
    description: String(body.description || "").trim() || null,
    discount_type: discountType,
    discount_value: discountValue,
    minimum_order_amount: minimumOrderAmount,
    maximum_discount_amount: maximumDiscountAmount,
    usage_limit: usageLimit,
    start_at: startAt ? startAt.toISOString() : null,
    end_at: endAt ? endAt.toISOString() : null,
    status,
  };
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = buildCouponPayload(body);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("coupons")
      .select("id")
      .eq("code", payload.code)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return NextResponse.json(
        { error: "A coupon with this code already exists." },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("coupons")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "coupon.create",
      entityType: "coupon",
      entityId: data.id,
      afterData: data,
    });

    return NextResponse.json({ ok: true, coupon: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected coupon create error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown> & {
      couponId?: number | string;
      action?: string;
    };
    const couponId = Number(body.couponId || 0);

    if (!Number.isInteger(couponId) || couponId <= 0) {
      return NextResponse.json({ error: "Invalid coupon ID." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("id", couponId)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }

    let updatePayload: Record<string, unknown>;
    if (String(body.action || "").toLowerCase() === "status") {
      const status = String(body.status || "").trim().toLowerCase();
      if (!new Set(["active", "inactive"]).has(status)) {
        return NextResponse.json({ error: "Invalid coupon status." }, { status: 400 });
      }
      updatePayload = { status };
    } else {
      updatePayload = buildCouponPayload(body);
    }

    if (updatePayload.code && updatePayload.code !== before.code) {
      const { data: duplicate, error: duplicateError } = await supabaseAdmin
        .from("coupons")
        .select("id")
        .eq("code", String(updatePayload.code))
        .neq("id", couponId)
        .maybeSingle();
      if (duplicateError) throw new Error(duplicateError.message);
      if (duplicate) {
        return NextResponse.json(
          { error: "A coupon with this code already exists." },
          { status: 409 }
        );
      }
    }

    const { data: after, error } = await supabaseAdmin
      .from("coupons")
      .update(updatePayload)
      .eq("id", couponId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "coupon.update",
      entityType: "coupon",
      entityId: couponId,
      beforeData: before,
      afterData: after,
    });

    return NextResponse.json({ ok: true, coupon: after });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected coupon update error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as { couponId?: number | string };
    const couponId = Number(body.couponId || 0);

    if (!Number.isInteger(couponId) || couponId <= 0) {
      return NextResponse.json({ error: "Invalid coupon ID." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("id", couponId)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }
    if (Number(before.used_count || 0) > 0) {
      return NextResponse.json(
        { error: "Used coupons cannot be deleted. Deactivate them instead." },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", couponId);
    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "coupon.delete",
      entityType: "coupon",
      entityId: couponId,
      beforeData: before,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected coupon delete error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}
