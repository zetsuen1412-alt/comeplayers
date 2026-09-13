import type { FinanceIssue } from "@/features/payroll/types/domain";

export function reconcileAmount(args: {
  id: string;
  entity: string;
  expectedMinor: number;
  observedMinor: number;
}): FinanceIssue | null {
  if (args.expectedMinor === args.observedMinor) return null;
  const exposureMinor = Math.abs(args.expectedMinor - args.observedMinor);
  return {
    id: args.id,
    code: "AMOUNT_SOURCE_MISMATCH",
    entity: args.entity,
    severity: "critical",
    exposureMinor,
    title: "Selisih nilai sumber",
    description: `Nilai yang diharapkan ${args.expectedMinor} unit minor, tetapi yang tercatat ${args.observedMinor}.`,
    status: "open",
  };
}

export function resolveLegacyIdentity(alias: string, aliases: Record<string, string>): {
  status: "resolved" | "conflict";
  employeeCode?: string;
} {
  const normalized = alias.trim().toLowerCase();
  const code = aliases[normalized];
  return code ? { status: "resolved", employeeCode: code } : { status: "conflict" };
}
