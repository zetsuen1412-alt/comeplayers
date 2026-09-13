import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { financeIssues } from "@/lib/demo-data";
import { formatMoney } from "@/lib/money";

export default function ReconciliationPage() {
  return (
    <><PageHeader eyebrow="Kontrol pasti" title="Pusat rekonsiliasi" description="Jumlah, nilai uang, identitas, dan pencocokan pembayaran harus semuanya cocok. AI boleh menjelaskan ketidakjelasan, tetapi tidak boleh mengubah fakta tersebut." />
      <div className="cp-card overflow-x-auto"><table className="cp-table"><thead><tr><th>Entitas</th><th>Pemeriksaan</th><th>Dampak nilai</th><th>Tingkat</th><th>Status</th></tr></thead><tbody>{financeIssues.map((issue)=><tr key={issue.id}><td>{issue.entity}</td><td className="font-mono text-xs">{issue.code}</td><td>{formatMoney(issue.exposureMinor)}</td><td><StatusBadge value={issue.severity}/></td><td><StatusBadge value={issue.status}/></td></tr>)}</tbody></table></div>
    </>
  );
}
