import { PageHeader } from "@/features/payroll/components/page-header";
import { StatusBadge } from "@/features/payroll/components/status-badge";
import { formatMoney } from "@/features/payroll/lib/money";

const approvals = [
  { id: "APR-0021", action: "Penyesuaian keuangan", requester: "Staf Keuangan", amount: 576000, status: "pending" },
  { id: "APR-0022", action: "Pembayaran vendor", requester: "Admin Keuangan", amount: 4200000, status: "under_review" },
];

export default function ApprovalsPage(){return <><PageHeader eyebrow="Kontrol dua pihak" title="Pusat persetujuan" description="Batas persetujuan mengikuti kebijakan. Tindakan penting dapat mewajibkan pemohon dan pemberi persetujuan merupakan pengguna yang berbeda."/><div className="cp-card overflow-x-auto"><table className="cp-table"><thead><tr><th>Permintaan</th><th>Tindakan</th><th>Pemohon</th><th>Jumlah</th><th>Status</th></tr></thead><tbody>{approvals.map(a=><tr key={a.id}><td>{a.id}</td><td>{a.action}</td><td>{a.requester}</td><td>{formatMoney(a.amount)}</td><td><StatusBadge value={a.status}/></td></tr>)}</tbody></table></div></>}
