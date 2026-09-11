export type TaxLedgerLine = {
  tax_type?: string | null;
  taxable_amount?: number | string | null;
  tax_amount?: number | string | null;
};

export function accountingMonthBounds(periodKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) throw new Error("Accounting period must use YYYY-MM.");
  const [year, month] = periodKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { periodKey, start: start.toISOString(), end: end.toISOString() };
}

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function summarizeTaxLedger(lines: TaxLedgerLine[]) {
  return lines.reduce((summary, line) => {
    const taxable = numberValue(line.taxable_amount);
    const tax = numberValue(line.tax_amount);
    if (line.tax_type === "sales_tax") {
      summary.salesTaxable += taxable;
      summary.salesTax += tax;
    } else if (line.tax_type === "withdrawal_tax") {
      summary.withdrawalTaxable += taxable;
      summary.withdrawalTax += tax;
    }
    summary.totalTax += tax;
    summary.lineCount += 1;
    return summary;
  }, { salesTaxable: 0, salesTax: 0, withdrawalTaxable: 0, withdrawalTax: 0, totalTax: 0, lineCount: 0 });
}
