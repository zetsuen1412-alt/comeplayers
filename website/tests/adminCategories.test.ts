import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function source(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

test("admin categories use one database table with CSV import and export", () => {
  const route = source("app/api/admin/categories/route.ts");
  const page = source("app/admin/categories/page.tsx");
  const dashboard = source("components/admin/adminNavigation.ts");

  assert.match(route, /requireAdmin/);
  assert.match(route, /recordAdminAudit/);
  assert.match(route, /CSV_HEADERS = \["id", "name", "slug", "icon", "created_at"\]/);
  assert.match(route, /\.from\("categories"\)/);
  assert.match(route, /mode === "export"/);
  assert.match(route, /mode === "template"/);
  assert.match(route, /body\.rows/);
  assert.match(route, /category\.csv\.import/);
  assert.doesNotMatch(route, /category_mappings|marketplace_categories|game_categories_table/);

  assert.match(page, /parseCsv/);
  assert.match(page, /csvRowsToRecords/);
  assert.match(page, /Impor CSV/);
  assert.match(page, /Ekspor CSV/);
  assert.match(page, /\/api\/admin\/categories/);
  assert.match(page, /satu tabel public\.categories/);

  assert.match(dashboard, /href: "\/admin\/categories"/);
  assert.match(dashboard, /label: "Kategori"/);
});
