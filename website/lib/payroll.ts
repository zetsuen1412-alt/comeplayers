export const MAX_PAYROLL_AMOUNT = 9_000_000_000_000;

export type PayrollEntryInput = {
  workValue: number;
  shareBasisPoints: number;
  bonusTips: number;
  operationalDeduction: number;
  penalty: number;
  advanceRepayment: number;
};

export type PayrollEntryCalculation = {
  baseEarnings: number;
  grossCompensation: number;
  deductions: number;
  netPay: number;
};

export type PayrollTotals = PayrollEntryCalculation & {
  workValue: number;
  employeeCount: number;
};

export function payrollInteger(
  value: unknown,
  label: string,
  maximum = MAX_PAYROLL_AMOUNT,
) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${label} harus berupa angka bulat antara 0 dan ${maximum}.`);
  }
  return parsed;
}

function safeNumber(value: bigint, label: string) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} melebihi batas perhitungan yang aman.`);
  }
  return Number(value);
}

function addAmounts(values: number[], label: string) {
  return safeNumber(
    values.reduce<bigint>((sum, value) => sum + BigInt(value), BigInt(0)),
    label,
  );
}

export function calculatePayrollEntry(
  raw: PayrollEntryInput,
): PayrollEntryCalculation {
  const input = {
    workValue: payrollInteger(raw.workValue, "Nilai pekerjaan"),
    shareBasisPoints: payrollInteger(raw.shareBasisPoints, "Persentase", 10_000),
    bonusTips: payrollInteger(raw.bonusTips, "Bonus/tips"),
    operationalDeduction: payrollInteger(
      raw.operationalDeduction,
      "Potongan operasional",
    ),
    penalty: payrollInteger(raw.penalty, "Denda"),
    advanceRepayment: payrollInteger(raw.advanceRepayment, "Potongan kasbon"),
  };

  const numerator = BigInt(input.workValue) * BigInt(input.shareBasisPoints);
  const baseEarnings = safeNumber(
    (numerator + BigInt(5_000)) / BigInt(10_000),
    "Gaji awal",
  );
  const grossCompensation = addAmounts(
    [baseEarnings, input.bonusTips],
    "Gaji kotor",
  );
  const deductions = addAmounts(
    [input.operationalDeduction, input.penalty, input.advanceRepayment],
    "Total potongan",
  );

  if (deductions > grossCompensation) {
    throw new Error("Total potongan tidak boleh melebihi gaji kotor.");
  }

  return {
    baseEarnings,
    grossCompensation,
    deductions,
    netPay: grossCompensation - deductions,
  };
}

export function calculatePayrollTotals(
  entries: Array<PayrollEntryInput & PayrollEntryCalculation>,
): PayrollTotals {
  return {
    employeeCount: entries.length,
    workValue: addAmounts(entries.map((entry) => entry.workValue), "Total pekerjaan"),
    baseEarnings: addAmounts(entries.map((entry) => entry.baseEarnings), "Total gaji awal"),
    grossCompensation: addAmounts(
      entries.map((entry) => entry.grossCompensation),
      "Total gaji kotor",
    ),
    deductions: addAmounts(entries.map((entry) => entry.deductions), "Total potongan"),
    netPay: addAmounts(entries.map((entry) => entry.netPay), "Total gaji bersih"),
  };
}
