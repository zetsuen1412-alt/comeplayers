import { NextResponse } from "next/server";
import { createCsv } from "@/lib/csv";
import {
  adminErrorStatus,
  recordAdminAudit,
  requireAdmin,
} from "@/lib/adminSecurity";

const CSV_HEADERS = ["id", "name", "slug", "icon", "created_at"];
const IMPORT_LIMIT = 200;

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  created_at?: string | null;
};

type ImportResult = {
  rowNumber: number;
  id: number | null;
  name: string;
  slug: string;
  action: "create" | "update" | "failed";
  ok: boolean;
  error: string;
};

function clean(value: unknown, maxLength = 5000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function badRequest(message: string) {
  const error = new Error(message);
  Object.assign(error, { status: 400 });
  return error;
}

function integer(value: unknown, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readField(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    if (name in row) return row[name];
  }

  return undefined;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeCategoryInput(raw: Record<string, unknown>, rowNumber = 1) {
  const id = integer(readField(raw, "id", "category_id", "categoryId"), 0);
  const name = clean(readField(raw, "name", "category"), 120).replace(
    /\s+/g,
    " "
  );
  const rawSlug = clean(readField(raw, "slug"), 160);
  const slug = slugify(rawSlug || name);
  const icon = clean(readField(raw, "icon"), 40) || null;

  if (!name) throw badRequest(`Row ${rowNumber}: category name is required.`);
  if (!slug) throw badRequest(`Row ${rowNumber}: category slug is required.`);

  return {
    id: id > 0 ? id : null,
    name,
    slug,
    icon,
  };
}

function categoryCsv(categories: CategoryRow[]) {
  return createCsv(
    CSV_HEADERS,
    categories.map((category) => [
      category.id,
      category.name,
      category.slug,
      category.icon || "",
      category.created_at || "",
    ])
  );
}

async function loadCategories(
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"]
) {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id,name,slug,icon,created_at")
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []) as CategoryRow[];
}

async function assertSlugAvailable({
  categoryId,
  slug,
  supabaseAdmin,
}: {
  categoryId?: number | null;
  slug: string;
  supabaseAdmin: Awaited<ReturnType<typeof requireAdmin>>["supabaseAdmin"];
}) {
  let query = supabaseAdmin.from("categories").select("id").eq("slug", slug);
  if (categoryId) query = query.neq("id", categoryId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (data) throw badRequest("Category slug is already used.");
}

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = await requireAdmin(request);
    const url = new URL(request.url);
    const mode = clean(url.searchParams.get("mode"), 20).toLowerCase();

    if (mode === "template") {
      const template = createCsv(CSV_HEADERS, [
        ["", "Game Coins", "game-coins", "", ""],
      ]);

      return new Response(`\uFEFF${template}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="comeplayers-category-template.csv"',
        },
      });
    }

    const categories = await loadCategories(supabaseAdmin);

    if (mode === "export") {
      const csv = categoryCsv(categories);

      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="comeplayers-categories-${new Date()
            .toISOString()
            .slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ categories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected category error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;

    if (Array.isArray(body.rows)) {
      if (body.rows.length > IMPORT_LIMIT) {
        throw badRequest(`CSV import can contain at most ${IMPORT_LIMIT} rows.`);
      }

      const existing = await loadCategories(supabaseAdmin);
      const byId = new Map(existing.map((category) => [category.id, category]));
      const bySlug = new Map(
        existing.map((category) => [category.slug.toLowerCase(), category])
      );
      const results: ImportResult[] = [];

      for (const [index, rawRow] of body.rows.entries()) {
        const rowNumber = integer(
          (rawRow as Record<string, unknown>)?.row_number,
          index + 2
        );
        let input: ReturnType<typeof normalizeCategoryInput> | null = null;

        try {
          input = normalizeCategoryInput(
            (rawRow || {}) as Record<string, unknown>,
            rowNumber
          );

          const slugOwner = bySlug.get(input.slug.toLowerCase()) || null;
          const idOwner = input.id ? byId.get(input.id) || null : null;
          const existingCategory = idOwner || slugOwner;

          if (idOwner && slugOwner && idOwner.id !== slugOwner.id) {
            throw badRequest(
              `Row ${rowNumber}: slug belongs to another category.`
            );
          }

          if (existingCategory) {
            const { data, error } = await supabaseAdmin
              .from("categories")
              .update({
                name: input.name,
                slug: input.slug,
                icon: input.icon,
              })
              .eq("id", existingCategory.id)
              .select("id,name,slug,icon,created_at")
              .single();

            if (error) throw new Error(error.message);

            const updated = data as CategoryRow;
            byId.set(updated.id, updated);
            bySlug.set(updated.slug.toLowerCase(), updated);
            results.push({
              rowNumber,
              id: updated.id,
              name: updated.name,
              slug: updated.slug,
              action: "update",
              ok: true,
              error: "",
            });
          } else {
            const { data, error } = await supabaseAdmin
              .from("categories")
              .insert({
                name: input.name,
                slug: input.slug,
                icon: input.icon,
              })
              .select("id,name,slug,icon,created_at")
              .single();

            if (error) throw new Error(error.message);

            const created = data as CategoryRow;
            byId.set(created.id, created);
            bySlug.set(created.slug.toLowerCase(), created);
            results.push({
              rowNumber,
              id: created.id,
              name: created.name,
              slug: created.slug,
              action: "create",
              ok: true,
              error: "",
            });
          }
        } catch (rowError) {
          results.push({
            rowNumber,
            id: input?.id || null,
            name: input?.name || clean((rawRow as Record<string, unknown>)?.name, 120),
            slug: input?.slug || clean((rawRow as Record<string, unknown>)?.slug, 160),
            action: "failed",
            ok: false,
            error:
              rowError instanceof Error
                ? rowError.message
                : "Category row failed.",
          });
        }
      }

      const summary = {
        total: results.length,
        created: results.filter((result) => result.action === "create").length,
        updated: results.filter((result) => result.action === "update").length,
        failed: results.filter((result) => !result.ok).length,
      };

      await recordAdminAudit({
        adminId: user.id,
        action: "category.csv.import",
        entityType: "category",
        metadata: summary,
        afterData: results,
      });

      return NextResponse.json({ ok: summary.failed === 0, summary, results });
    }

    const input = normalizeCategoryInput(body);
    await assertSlugAvailable({ slug: input.slug, supabaseAdmin });

    const { data, error } = await supabaseAdmin
      .from("categories")
      .insert({
        name: input.name,
        slug: input.slug,
        icon: input.icon,
      })
      .select("id,name,slug,icon,created_at")
      .single();

    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "category.create",
      entityType: "category",
      entityId: (data as CategoryRow).id,
      afterData: data,
    });

    return NextResponse.json({ ok: true, category: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected category create error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const input = normalizeCategoryInput(body);

    if (!input.id) throw badRequest("Category ID is required.");

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("categories")
      .select("id,name,slug,icon,created_at")
      .eq("id", input.id)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw badRequest("Category not found.");

    await assertSlugAvailable({
      categoryId: input.id,
      slug: input.slug,
      supabaseAdmin,
    });

    const { data: after, error } = await supabaseAdmin
      .from("categories")
      .update({
        name: input.name,
        slug: input.slug,
        icon: input.icon,
      })
      .eq("id", input.id)
      .select("id,name,slug,icon,created_at")
      .single();

    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "category.update",
      entityType: "category",
      entityId: input.id,
      beforeData: before,
      afterData: after,
    });

    return NextResponse.json({ ok: true, category: after });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected category update error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabaseAdmin } = await requireAdmin(request);
    const body = (await request.json()) as Record<string, unknown>;
    const id = integer(body.id || body.categoryId, 0);

    if (id <= 0) throw badRequest("Category ID is required.");

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("categories")
      .select("id,name,slug,icon,created_at")
      .eq("id", id)
      .maybeSingle();

    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw badRequest("Category not found.");

    const [gameRefs, productRefsById, productRefsByName, productRefsBySlug] =
      await Promise.all([
      supabaseAdmin
        .from("game_master")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .ilike("category", String(before.name || "")),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .ilike("category", String(before.slug || "")),
    ]);

    if (gameRefs.error) throw new Error(gameRefs.error.message);
    if (productRefsById.error) throw new Error(productRefsById.error.message);
    if (productRefsByName.error) throw new Error(productRefsByName.error.message);
    if (productRefsBySlug.error) throw new Error(productRefsBySlug.error.message);

    const productRefCount =
      (productRefsById.count || 0) +
      (productRefsByName.count || 0) +
      (productRefsBySlug.count || 0);

    if ((gameRefs.count || 0) > 0 || productRefCount > 0) {
      throw badRequest(
        "Category is still used by games or products. Reassign those records before deleting."
      );
    }

    const { error } = await supabaseAdmin.from("categories").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await recordAdminAudit({
      adminId: user.id,
      action: "category.delete",
      entityType: "category",
      entityId: id,
      beforeData: before,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected category delete error.";
    return NextResponse.json(
      { error: message },
      { status: adminErrorStatus(error) }
    );
  }
}
