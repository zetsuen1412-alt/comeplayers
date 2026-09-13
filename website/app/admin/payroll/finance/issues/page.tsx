import { PageHeader } from "@/features/payroll/components/page-header";
import { StatusBadge } from "@/features/payroll/components/status-badge";
import { financeIssues } from "@/features/payroll/lib/demo-data";
import { formatMoney } from "@/features/payroll/lib/money";

export default function IssuesPage() {
  return <><PageHeader eyebrow="Siklus masalah" title="Masalah keuangan" description="Masalah dicatat secara terstruktur lengkap dengan risiko, dampak nilai, dan status penyelesaian — bukan sekadar pesan chat atau warna spreadsheet."/><div className="grid gap-4">{financeIssues.map((i)=><div className="cp-card p-5" key={i.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">{i.title}</div><div className="mt-1 font-mono text-xs text-zinc-500">{i.entity} · {i.code}</div></div><div className="flex gap-2"><StatusBadge value={i.severity}/><StatusBadge value={i.status}/></div></div><p className="mt-4 text-sm text-zinc-400">{i.description}</p><div className="mt-4 text-sm font-semibold">Dampak keuangan: {formatMoney(i.exposureMinor)}</div></div>)}</div></>;
}
