import { NextResponse } from "next/server";
import {
  requireApprovedSeller,
  sellerErrorStatus,
} from "@/lib/sellerSecurity";

function positiveId(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeRows(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Inventory rows are required.");
  if (value.length < 1 || value.length > 500) throw new Error("Update between 1 and 500 inventory rows.");

  return value.map((raw) => {
    const row = (raw || {}) as Record<string, unknown>;
    const kind = String(row.kind || "").toLowerCase();
    const id = positiveId(row.id);
    const price = Number(row.price);
    const stock = Math.floor(Number(row.stock));
    const status = String(row.status || "active").toLowerCase();

    if (!["product", "variant"].includes(kind) || !id) throw new Error("Invalid inventory row.");
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) throw new Error("Invalid inventory price.");
    if (!Number.isFinite(stock) || stock < 0 || stock > 1_000_000) throw new Error("Invalid inventory stock.");
    if (!["active", "inactive"].includes(status)) throw new Error("Invalid inventory status.");

    return { kind, id, price, stock, status };
  });
}

export async function GET(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const [{ data: products, error: productError }, { data: variants, error: variantError }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id,title,slug,price,stock,status,has_variants,variant_count,game_name,category,updated_at")
        .eq("seller_id", user.id)
        .order("title", { ascending: true }),
      supabaseAdmin
        .from("product_variants")
        .select("id,product_id,sku,name,price,stock,status,sort_order,updated_at")
        .eq("seller_id", user.id)
        .neq("status", "archived")
        .order("product_id", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

    if (productError) throw new Error(productError.message);
    if (variantError) throw new Error(variantError.message);

    return NextResponse.json({ products: products || [], variants: variants || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected inventory error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireApprovedSeller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const rows = normalizeRows(body.rows);

    const productRows = rows.filter((row) => row.kind === "product");
    const variantRows = rows.filter((row) => row.kind === "variant");

    const productIds = productRows.map((row) => row.id);
    const variantIds = variantRows.map((row) => row.id);

    if (productIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("id,has_variants")
        .eq("seller_id", user.id)
        .in("id", productIds);
      if (error) throw new Error(error.message);
      if ((data || []).length !== new Set(productIds).size) throw new Error("One or more products are not owned by this seller.");
      if ((data || []).some((item) => Boolean(item.has_variants))) {
        throw new Error("Variant products must be updated through their SKU rows.");
      }
    }

    if (variantIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("seller_id", user.id)
        .neq("status", "archived")
        .in("id", variantIds);
      if (error) throw new Error(error.message);
      if ((data || []).length !== new Set(variantIds).size) throw new Error("One or more variants are not owned by this seller.");
    }

    for (const row of productRows) {
      const { error } = await supabaseAdmin
        .from("products")
        .update({
          price: row.price,
          stock: row.stock,
          status: row.stock > 0 ? row.status : "inactive",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("seller_id", user.id);
      if (error) throw new Error(error.message);
    }

    for (const row of variantRows) {
      const { error } = await supabaseAdmin
        .from("product_variants")
        .update({
          price: row.price,
          stock: row.stock,
          status: row.stock > 0 ? row.status : "inactive",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("seller_id", user.id);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, updated: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected inventory update error.";
    return NextResponse.json({ error: message }, { status: sellerErrorStatus(error) });
  }
}
