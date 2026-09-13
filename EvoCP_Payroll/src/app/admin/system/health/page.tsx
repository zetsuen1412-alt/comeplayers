import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

const checks = [
  ["Aplikasi", "verified", "Antarmuka admin Next.js berjalan"],
  ["Database", "pending", "Mode demo — koneksi Supabase belum diaktifkan"],
  ["Integritas keuangan", "critical", "Contoh regresi X1465 sengaja memblokir tutup buku"],
  ["Pekerjaan latar belakang", "verified", "Tidak ada antrean produksi yang terhubung pada mode demo"],
  ["Auditor AI", "pending", "Opsional dan tidak diperlukan untuk kontrol perhitungan pasti"],
  ["Keamanan perubahan data", "verified", "Perubahan data keuangan/penggajian/persediaan dinonaktifkan secara default"],
];

export default function HealthPage(){return <><PageHeader eyebrow="Pemantauan" title="Kesehatan sistem" description="Sistem membedakan kesehatan aplikasi dan kualitas data. Pada mode demo, integrasi database sengaja ditampilkan sebagai belum aktif."/><div className="cp-card overflow-hidden">{checks.map(([name,status,note])=><div key={name} className="flex flex-col gap-2 border-b border-zinc-800 p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold">{name}</div><div className="mt-1 text-sm text-zinc-500">{note}</div></div><StatusBadge value={status}/></div>)}</div></>}
