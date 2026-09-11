import { NextResponse } from "next/server";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

async function buildPayload(
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"],
  body: Record<string, unknown>
) {
  const productId = Number(body.product_id || 0);
  const title = String(body.title || "").trim();
  const originalPrice = Number(body.original_price || 0);
  const flashPrice = Number(body.flash_price || 0);
  const stockLimit = nullableInteger(body.stock_limit);
  const soldCount = Number(body.sold_count || 0);
  const status = String(body.status || "active").trim().toLowerCase();
  const startAt = new Date(String(body.start_at || ""));
  const endAt = new Date(String(body.end_at || ""));

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error("A valid product is required.");
  }
  if (!title) throw new Error("Flash sale title is required.");
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
    throw new Error("Original price is invalid.");
  }
  if (!Number.isFinite(flashPrice) || flashPrice <= 0) {
    throw new Error("Flash price is invalid.");
  }
  if (flashPrice >= originalPrice) {
    throw new Error("Flash price must be lower than the original price.");
  }
  if (stockLimit !== null && (!Number.isInteger(stockLimit) || stockLimit <= 0)) {
    throw new Error("Stock limit must be a positive integer.");
  }
  if (!Number.isInteger(soldCount) || soldCount < 0) {
    throw new Error("Sold count is invalid.");
  }
  if (stockLimit !== null && soldCount > stockLimit) {
    throw new Error("Sold count cannot exceed the stock limit.");
  }
  if (!new Set(["active", "inactive"]).has(status)) {
    throw new Error("Invalid flash sale status.");
  }
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("Flash sale dates are invalid.");
  }
  if (endAt <= startAt) {
    throw new Error("Flash sale end date must be after its start date.");
  }

  const { data: product, error } = await supabaseAdmin
    .from("products")
    .select("id,title,price,status,stock")
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!product) throw new Error("Product not found.");
  if (String(product.status || "").toLowerCase() !== "active") {
    throw new Error("Only active products can be included in a flash sale.");
  }
  if (stockLimit !== null && stockLimit > Number(product.stock || 0)) {
    throw new Error("Flash sale stock limit exceeds available product stock.");
  }

  return {
    product_id: productId,
    title,
    description: String(body.description || "").trim() || null,
    original_price: originalPrice,
    flash_price: flashPrice,
    stock_limit: stockLimit,
    sold_count: soldCount,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status,
  };
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = await buildPayload(supabaseAdmin, body);

    const { data, error } = await supabaseAdmin
      .from("flash_sales")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "flash_sale.create",
      entityType: "flash_sale",
      entityId: data.id,
      afterData: data,
    });

    return NextResponse.json({ ok: true, flashSale: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected flash sale create error.";
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
      flashSaleId?: number | string;
      action?: string;
    };
    const flashSaleId = Number(body.flashSaleId || 0);

    if (!Number.isInteger(flashSaleId) || flashSaleId <= 0) {
      return NextResponse.json({ error: "Invalid flash sale ID." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("flash_sales")
      .select("*")
      .eq("id", flashSaleId)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Flash sale not found." }, { status: 404 });
    }

    let updatePayload: Record<string, unknown>;
    if (String(body.action || "").toLowerCase() === "status") {
      const status = String(body.status || "").trim().toLowerCase();
      if (!new Set(["active", "inactive"]).has(status)) {
        return NextResponse.json({ error: "Invalid flash sale status." }, { status: 400 });
      }
      updatePayload = { status };
    } else {
      updatePayload = await buildPayload(supabaseAdmin, body);
    }

    const { data: after, error } = await supabaseAdmin
      .from("flash_sales")
      .update(updatePayload)
      .eq("id", flashSaleId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "flash_sale.update",
      entityType: "flash_sale",
      entityId: flashSaleId,
      beforeData: before,
      afterData: after,
    });

    return NextResponse.json({ ok: true, flashSale: after });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected flash sale update error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as { flashSaleId?: number | string };
    const flashSaleId = Number(body.flashSaleId || 0);

    if (!Number.isInteger(flashSaleId) || flashSaleId <= 0) {
      return NextResponse.json({ error: "Invalid flash sale ID." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("flash_sales")
      .select("*")
      .eq("id", flashSaleId)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Flash sale not found." }, { status: 404 });
    }
    if (Number(before.sold_count || 0) > 0) {
      return NextResponse.json(
        { error: "Flash sales with purchases cannot be deleted. Deactivate them instead." },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from("flash_sales")
      .delete()
      .eq("id", flashSaleId);
    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "flash_sale.delete",
      entityType: "flash_sale",
      entityId: flashSaleId,
      beforeData: before,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected flash sale delete error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}
