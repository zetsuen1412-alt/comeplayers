export function KpiCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="cp-card p-5">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      {note ? <div className="mt-2 text-sm leading-5 text-zinc-500">{note}</div> : null}
    </div>
  );
}
