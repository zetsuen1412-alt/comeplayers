export interface PayrollComponent {
  type: string;
  effect: "earning" | "deduction" | "employer_cost" | "informational";
  amountMinor: number;
}

export function calculatePayroll(components: PayrollComponent[]) {
  for (const component of components) {
    if (!Number.isInteger(component.amountMinor) || component.amountMinor < 0) {
      throw new Error("INVALID_PAYROLL_COMPONENT_AMOUNT");
    }
  }

  const grossCompensationMinor = components
    .filter((x) => x.effect === "earning")
    .reduce((sum, x) => sum + x.amountMinor, 0);

  const deductionsMinor = components
    .filter((x) => x.effect === "deduction")
    .reduce((sum, x) => sum + x.amountMinor, 0);

  const employerCostMinor =
    grossCompensationMinor +
    components.filter((x) => x.effect === "employer_cost").reduce((sum, x) => sum + x.amountMinor, 0);

  return {
    grossCompensationMinor,
    deductionsMinor,
    netPayMinor: grossCompensationMinor - deductionsMinor,
    employerCostMinor,
  };
}
