import { NextResponse } from "next/server";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";

function clean(value: unknown, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function positiveId(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function validateVariant(body: Record<string, unknown>) {
  const name = clean(body.name, 120);
  const sku = clean(body.sku, 80).toUpperCase().replace(/\s+/g, "-");
  const price = Number(body.price);
  const stock = Math.floor(Number(body.stock));
  const status = clean(body.status || "active", 20).toLowerCase();
  const sortOrder = Math.max(0, Math.floor(Number(body.sortOrder || 0)));
  const attributes =
    body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)
      ? body.attributes
      : {};

  if (name.length < 2) throw new Error("Variant name is required.");
  if (!/^[A-Z0-9._-]{2,80}$/.test(sku)) {
    throw new Error("SKU may only contain letters, numbers, dot, underscore, and dash.");
  }
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) {
    throw new Error("Variant price is invalid.");
  }
  if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) {
    throw new Error("Variant stock is invalid.");
  }
  if (!["active", "inactive"].includes(status)) throw new Error("Invalid variant status.");

  return { name, sku, price, stock, status, sortOrder, attributes };
}

async function requireOwnedProduct(
  supabaseAdmin: ReturnType<typeof import("@/lib/serverSupabase").createSupabaseAdmin>,
  sellerId: string,
  productId: number
) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id,title,seller_id,has_variants")
    .eq("id", productId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Product not found.");
  return data;
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const productId = positiveId(new URL(request.url).searchParams.get("productId"));
    if (!productId) throw new Error("Invalid product ID.");
    const product = await requireOwnedProduct(supabaseAdmin, user.id, productId);

    const { data, error } = await supabaseAdmin
      .from("product_variants")
      .select("id,product_id,sku,name,attributes,price,stock,status,sort_order,created_at,updated_at")
      .eq("product_id", productId)
      .eq("seller_id", user.id)
      .neq("status", "archived")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ product, variants: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected variants error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const productId = positiveId(body.productId);
    if (!productId) throw new Error("Invalid product ID.");
    await requireOwnedProduct(supabaseAdmin, user.id, productId);

    const input = validateVariant(body);
    const { data, error } = await supabaseAdmin
      .from("product_variants")
      .insert({
        product_id: productId,
        seller_id: user.id,
        sku: input.sku,
        name: input.name,
        attributes: input.attributes,
        price: input.price,
        stock: input.stock,
        status: input.status,
        sort_order: input.sortOrder,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create variant.");

    return NextResponse.json({ variant: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected variant creation error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const variantId = positiveId(body.variantId);
    if (!variantId) throw new Error("Invalid variant ID.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("product_variants")
      .select("*")
      .eq("id", variantId)
      .eq("seller_id", user.id)
      .neq("status", "archived")
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Variant not found.");

    const input = validateVariant({ ...existing, ...body });
    const { data, error } = await supabaseAdmin
      .from("product_variants")
      .update({
        sku: input.sku,
        name: input.name,
        attributes: input.attributes,
        price: input.price,
        stock: input.stock,
        status: input.status,
        sort_order: input.sortOrder,
        updated_at: new Date().toISOString(),
      })
      .eq("id", variantId)
      .eq("seller_id", user.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to update variant.");

    return NextResponse.json({ variant: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected variant update error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const variantId = positiveId(body.variantId);
    if (!variantId) throw new Error("Invalid variant ID.");

    const { data: variant, error: variantError } = await supabaseAdmin
      .from("product_variants")
      .select("id,product_id")
      .eq("id", variantId)
      .eq("seller_id", user.id)
      .neq("status", "archived")
      .maybeSingle();
    if (variantError) throw new Error(variantError.message);
    if (!variant) throw new Error("Variant not found.");

    const { count, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("variant_id", variantId);
    if (orderError) throw new Error(orderError.message);

    if ((count || 0) > 0) {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .update({ status: "archived", stock: 0, updated_at: new Date().toISOString() })
        .eq("id", variantId)
        .eq("seller_id", user.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .delete()
        .eq("id", variantId)
        .eq("seller_id", user.id);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected variant delete error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}
