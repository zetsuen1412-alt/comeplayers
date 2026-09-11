import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  calculatePayrollEntry,
  calculatePayrollTotals,
  payrollInteger,
} from "../lib/payroll";

test("production payroll matches the Rp825.000 golden case", () => {
  const result = calculatePayrollEntry({
    workValue: 2_000_000,
    shareBasisPoints: 5_000,
    bonusTips: 100_000,
    operationalDeduction: 50_000,
    advanceRepayment: 200_000,
    penalty: 25_000,
  });

  assert.deepEqual(result, {
    baseEarnings: 1_000_000,
    grossCompensation: 1_100_000,
    deductions: 275_000,
    netPay: 825_000,
  });
});

test("salary percentages use deterministic integer rounding", () => {
  const result = calculatePayrollEntry({
    workValue: 10_001,
    shareBasisPoints: 3_333,
    bonusTips: 0,
    operationalDeduction: 0,
    penalty: 0,
    advanceRepayment: 0,
  });
  assert.equal(result.baseEarnings, 3_333);
});

test("deductions cannot create a negative transfer", () => {
  assert.throws(
    () =>
      calculatePayrollEntry({
        workValue: 100_000,
        shareBasisPoints: 5_000,
        bonusTips: 0,
        operationalDeduction: 60_000,
        penalty: 0,
        advanceRepayment: 0,
      }),
    /tidak boleh melebihi gaji kotor/,
  );
  assert.throws(() => payrollInteger(10.5, "Nominal"), /angka bulat/);
});

test("period totals aggregate calculated employee rows", () => {
  const firstInput = {
    workValue: 1_000_000,
    shareBasisPoints: 5_000,
    bonusTips: 50_000,
    operationalDeduction: 25_000,
    penalty: 0,
    advanceRepayment: 100_000,
  };
  const secondInput = {
    workValue: 500_000,
    shareBasisPoints: 4_000,
    bonusTips: 0,
    operationalDeduction: 0,
    penalty: 20_000,
    advanceRepayment: 0,
  };
  const totals = calculatePayrollTotals([
    { ...firstInput, ...calculatePayrollEntry(firstInput) },
    { ...secondInput, ...calculatePayrollEntry(secondInput) },
  ]);

  assert.deepEqual(totals, {
    employeeCount: 2,
    workValue: 1_500_000,
    baseEarnings: 700_000,
    grossCompensation: 750_000,
    deductions: 145_000,
    netPay: 605_000,
  });
});

test("payroll storage is admin-server-only and locks finalized records", () => {
  const root = path.resolve(__dirname, "..");
  const migration = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations/20260910215728_admin_payroll_production.sql",
    ),
    "utf8",
  );
  const route = fs.readFileSync(
    path.join(root, "app/api/admin/payroll/route.ts"),
    "utf8",
  );

  for (const table of ["employees", "periods", "entries"]) {
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.cp_payroll_${table} from anon, authenticated`, "i"),
    );
  }
  assert.match(migration, /PAYROLL_PERIOD_LOCKED/);
  assert.match(migration, /PAID_PAYROLL_IMMUTABLE/);
  assert.match(route, /await requireAdmin\(request\)/g);
  assert.doesNotMatch(route, /from\("cp_payroll_[^"]+"\)[\s\S]{0,200}createSupabaseUserClient/);
});
