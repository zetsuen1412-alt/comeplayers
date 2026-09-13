import type { Severity } from "@/features/payroll/types/domain";
import { translateStatus } from "@/features/payroll/lib/labels";

const colors: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  reconciled: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  ready_to_close: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  reviewed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  open: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  under_review: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  calculated: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  pending: "border-slate-500/40 bg-slate-500/10 text-slate-300",
  in_progress: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  assigned: "border-violet-500/40 bg-violet-500/10 text-violet-200",
  completed: "border-teal-500/40 bg-teal-500/10 text-teal-200",
};

export function StatusBadge({ value }: { value: Severity | string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${colors[value] ?? "border-slate-600 bg-slate-800 text-slate-300"}`}>
      {translateStatus(String(value))}
    </span>
  );
}
