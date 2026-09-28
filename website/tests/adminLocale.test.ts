import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ADMIN_LOCALE, adminLabel, adminText, adminScanScope, adminFieldLabel } from "../lib/adminLocale";
import { adminLocaleContract } from "./helpers/adminLocaleContracts";
import contracts from "./fixtures/adminLocaleContracts.json";

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");
test("admin uses Indonesian without changing provider names, money codes or unknown identifiers", () => {
  assert.equal(ADMIN_LOCALE, "id-ID");
  for (const [input, output] of [["pending", "Menunggu"], ["completed", "Selesai"], ["critical", "Kritis"], ["buyer", "Pembeli"], ["seller", "Penjual"], ["holding", "Ditahan"], ["credited", "Saldo ditambahkan"], ["NEW", "Baru"], ["RESIGN", "Mengundurkan diri"]]) assert.equal(adminLabel(input), output);
  for (const value of ["G2G-ABC_123", "World of Warcraft", "IDR", "USD", "employee@example.test", "unknown_provider_code"]) assert.equal(adminLabel(value), value);
  assert.equal(adminLabel(null), "—");
});
test("known system errors and reconciliation findings are translated at the display boundary", () => {
  assert.equal(adminText("Admin access required."), "Akses admin diperlukan.");
  assert.equal(adminText("Wallet balance arithmetic does not reconcile"), "Perhitungan saldo dompet tidak cocok");
  assert.equal(adminText("Request failed with status 403."), "Permintaan gagal dengan status 403.");
  assert.equal(adminText("Customer text remains unchanged: completed order ABC"), "Customer text remains unchanged: completed order ABC");
  assert.equal(adminText(null), "");
  assert.equal(adminText(false), "");
});
test("scope and audit headings are labels, not mutations of source records", () => {
  const record = { scope: "financial:30d", field: "externalReference", status: "completed", reference: "G2G-ABC" };
  const before = JSON.stringify(record);
  assert.equal(adminScanScope(record.scope), "Keuangan · 30 hari");
  assert.equal(adminFieldLabel(record.field), "Kode pesanan");
  assert.equal(adminFieldLabel("customField"), "customField");
  assert.equal(adminLabel(record.status), "Selesai");
  assert.equal(JSON.stringify(record), before);
});
for (const [file, expected] of Object.entries(contracts)) {
  test(`admin localization preserves machine contracts: ${file}`, () => {
    const code = read(file);
    assert.deepEqual(adminLocaleContract(code, file), expected);
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    assert.equal(diagnostics.length, 0, `${file} has a syntax error`);
  });
}
test("admin and payroll have Indonesian language roots while the transparent logo is preserved", () => {
  assert.match(read("components/admin/AdminWorkspace.tsx"), /className="admin-workspace" lang="id"/);
  assert.match(read("features/payroll/components/workspace-gate.tsx"), /className="evocp-payroll" lang="id"/);
  assert.match(read("components/admin/AdminWorkspace.tsx"), /\/brand\/comeplayers-cp-v7-transparent\.png/);
  assert.match(read("app/admin/layout.tsx"), /title: "Administrasi"/);
  for (const english of ["Financial Reconciliation", "Run Scan", "Latest scanned", "Last run", "No open findings"]) assert.ok(!read("app/admin/reconciliation/page.tsx").includes(english), `Untranslated UI: ${english}`);
});
test("admin navigation retains every existing route and has localized searchable labels", () => {
  const code = read("components/admin/adminNavigation.ts");
  for (const title of ["Ringkasan", "Pesanan", "Pelanggan & pengguna", "Rekonsiliasi", "Penggajian & operasional", "Promo kilat", "Kepercayaan & risiko"]) assert.ok(code.includes(`label: "${title}"`), title);
  assert.equal((code.match(/href: "/g) || []).length, 27);
});
