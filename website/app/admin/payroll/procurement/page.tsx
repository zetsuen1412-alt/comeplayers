import { KpiCard } from "@/features/payroll/components/kpi-card";
import { PageHeader } from "@/features/payroll/components/page-header";
import { formatMoney } from "@/features/payroll/lib/money";

export default function ProcurementPage(){return <><PageHeader eyebrow="Pengadaan" title="Kebutuhan pembelian & vendor" description="Pengadaan memisahkan kebutuhan bisnis, janji vendor, barang yang sudah diterima, dan kewajiban yang harus dibayar bagian Keuangan."/><div className="cp-grid sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Perlu dibeli" value="6"/><KpiCard label="Pesanan pembelian terbuka" value="12"/><KpiCard label="Menunggu penerimaan" value="3"/><KpiCard label="Hutang vendor" value={formatMoney(7_200_000)}/></div><div className="cp-card mt-6 p-5 text-sm text-zinc-400">Pencocokan tiga arah: Pesanan Pembelian ↔ Penerimaan ↔ Tagihan/pembayaran vendor.</div></>}
