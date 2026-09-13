import { PageHeader } from "@/components/page-header";

const rows = [
  ["2026-09-10 00:10", "sistem", "PEMERIKSAAN_REKONSILIASI", "X1465", "Masalah AMOUNT_SOURCE_MISMATCH dibuat"],
  ["2026-09-10 00:12", "admin-keuangan", "TINJAU_IDENTITAS", "X1936", "Alias lama AZIS2 perlu dipetakan"],
  ["2026-09-10 00:15", "supervisor", "VERIFIKASI_PENYELESAIAN_KERJA", "G2G-3001", "Penyelesaian disetujui"],
];

export default function AuditPage(){return <><PageHeader eyebrow="Hanya dapat ditambahkan" title="Riwayat audit" description="Tindakan bisnis penting dapat ditelusuri. Password, API key, dan nilai rahasia tidak boleh masuk ke log audit."/><div className="cp-card overflow-x-auto"><table className="cp-table"><thead><tr><th>Waktu</th><th>Pelaku</th><th>Tindakan</th><th>Entitas</th><th>Hasil</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j} className={j===2?"font-mono text-xs":""}>{c}</td>)}</tr>)}</tbody></table></div></>}
