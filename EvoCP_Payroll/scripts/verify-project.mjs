import fs from "node:fs";
import path from "node:path";

const required = [
  "package.json",
  "src/app/admin/control-center/page.tsx",
  "src/app/admin/orders/page.tsx",
  "src/app/admin/orders/new/page.tsx",
  "src/components/order-entry-form.tsx",
  "src/lib/demo-order-store.ts",
  "src/lib/order-code.ts",
  "src/lib/order-allocation.ts",
  "src/lib/order-workers.ts",
  "src/lib/demo-inventory-store.ts",
  "src/lib/inventory.ts",
  "src/components/inventory-manager.tsx",
  "src/components/employee-manager.tsx",
  "src/components/product-catalog-manager.tsx",
  "src/lib/demo-employee-store.ts",
  "src/lib/demo-product-store.ts",
  "src/lib/product-catalog.ts",
  "src/app/admin/products/page.tsx",
  "src/app/admin/inventory/page.tsx",
  "src/app/api/server-time/route.ts",
  "src/app/admin/mutations/page.tsx",
  "src/components/fortnight-closing.tsx",
  "src/app/admin/finance/reconciliation/page.tsx",
  "src/app/admin/payroll/page.tsx",
  "src/app/admin/advances/page.tsx",
  "src/components/kasbon-manager.tsx",
  "src/lib/demo-payroll-settings-store.ts",
  "src/lib/demo-advance-store.ts",
  "src/lib/demo-closing-store.ts",
  "src/app/admin/ai/page.tsx",
  "src/components/ai-assistant.tsx",
  "src/lib/ai-auditor.ts",
  "src/lib/money.ts",
  "src/lib/reconciliation.ts",
  "supabase/migrations/202609100001_cp_ofs_foundation.sql",
  "supabase/migrations/202609100002_cp_ofs_core.sql",
  "supabase/migrations/202609100003_cp_ofs_rls.sql",
  "supabase/migrations/202609100004_multi_worker_order_code.sql",
  "supabase/migrations/202609100005_order_type_inventory_stock.sql",
  "supabase/migrations/202609100006_employee_game_catalog_region_server.sql",
  "supabase/migrations/202609100007_payroll_status_kasbon.sql",
  "supabase/migrations/202609100008_unified_mutation_manual_closing.sql",
  "supabase/migrations/202609110001_add_admin_team.sql",
  "tests/payroll-v014.test.ts",
  "docs/cp-ofs-spec/CODEX_MASTER_PROMPT.md"
];

const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error("CP-OFS verification failed. Missing:", missing);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!packageJson.scripts?.dev || !packageJson.scripts?.test) {
  console.error("CP-OFS verification failed: required npm scripts missing");
  process.exit(1);
}

const migration = fs.readFileSync("supabase/migrations/202609100002_cp_ofs_core.sql", "utf8");
for (const token of ["worker_earnings", "journal_entries", "payroll_periods", "closing_periods", "audit_logs"]) {
  if (!migration.includes(token)) {
    console.error(`CP-OFS verification failed: core migration missing ${token}`);
    process.exit(1);
  }
}

console.log("CP-OFS project structure verification: PASS");
console.log("Next: npm install && npm test && npm run dev");
