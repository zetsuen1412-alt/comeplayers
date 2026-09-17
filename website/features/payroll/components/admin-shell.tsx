"use client";

import Link from "next/link";
import { usePayrollActor } from "../lib/workspace-store";
import { usePathname } from "next/navigation";
import { useDemoPeriodLock } from "@/features/payroll/lib/demo-period-lock-store";
import { formatJakartaDateTimeInput } from "@/features/payroll/lib/date";

const links = [
  ["🏠", "Beranda", "/admin/payroll"],
  ["🧾", "Pesanan", "/admin/payroll/orders"],
  ["💵", "Penjualan", "/admin/payroll/sales"],
  ["🔄", "Mutasi", "/admin/payroll/mutations"],
  ["🕘", "History Perubahan", "/admin/payroll/history"],
  ["👥", "Karyawan", "/admin/payroll/employees"],
  ["💰", "Gaji", "/admin/payroll/gaji"],
  ["💳", "Kasbon", "/admin/payroll/advances"],
  ["📊", "Keuangan", "/admin/payroll/finance"],
  ["🤖", "Asisten AI", "/admin/payroll/ai"],
  ["🎮", "Produk / Game", "/admin/payroll/products"],
  ["📦", "Stok / Gudang", "/admin/payroll/inventory"],
  ["❓", "Panduan", "/admin/payroll/guide"],
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const demo = false;
  const actor = usePayrollActor();
  const pathname = usePathname();
  const { lock, isLocked } = useDemoPeriodLock();
  const readOnlyAllowedPage = pathname === "/admin/payroll/finance/closing" || pathname === "/admin/payroll/export" || pathname === "/admin/payroll/history" || pathname === "/admin/payroll/access";
  const readOnly = isLocked && !readOnlyAllowedPage;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="border-b border-zinc-800 bg-black/35 p-4 lg:min-h-screen lg:border-b-0 lg:border-r lg:p-5">
        <Link href="/admin/payroll" className="block">
          <div className="text-xs font-bold tracking-[0.22em] text-yellow-400">EVO COMEPLAYERS</div>
          <div className="mt-1 text-lg font-semibold">Kelola Bisnis</div>
        </Link>

        {demo ? <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-100">DEMO!</div> : null}

        {isLocked && lock ? (
          <Link href="/admin/payroll/finance/closing" className="mt-3 block rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-3 text-xs leading-5 text-red-100">
            <div className="font-bold">🔒 SISTEM DIKUNCI</div>
            <div className="mt-1">{formatJakartaDateTimeInput(lock.from)}</div>
            <div>hingga {formatJakartaDateTimeInput(lock.to)}</div>
            <div className="mt-1 font-semibold text-white">Buka Tutup Buku →</div>
          </Link>
        ) : null}

        <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-xs text-zinc-400"><span className="block font-semibold text-zinc-100">{actor?.name}</span>{actor?.isAdmin ? "Administrator" : "Akses khusus payroll"}</div>
        {actor?.isAdmin && <><Link href="/admin/payroll/access" className="mt-4 block rounded-xl border border-yellow-500/30 p-3 text-sm font-semibold text-yellow-300">Kelola akses & tautan</Link><Link href="/admin/payroll/legacy" className="mt-4 block text-xs text-zinc-400">Arsip payroll sebelumnya</Link></>}
        <nav className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1">
          {links.map(([icon, label, href]) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white">
              <span className="text-base" aria-hidden>{icon}</span><span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-6 hidden rounded-xl bg-zinc-900/80 p-3 text-xs leading-5 text-zinc-400 lg:block">
          <div className="font-semibold text-zinc-200">Urutan paling mudah</div>
          <div className="mt-1">Pesanan → Penjualan → Mutasi → History → Gaji/Kasbon → AI Cek → Keuangan → Tutup Buku</div>
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        {readOnly && lock ? (
          <div className="mb-5 rounded-2xl border border-red-500/40 bg-red-500/15 p-4 text-sm leading-6 text-red-100">
            <div className="font-bold">🔒 MODE TERKUNCI — HANYA BACA</div>
            <div>Semua tombol dan kolom edit dinonaktifkan sampai kunci dibuka dari menu Tutup Buku.</div>
            <Link href="/admin/payroll/finance/closing" className="mt-2 inline-flex rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white">Buka menu Tutup Buku</Link>
          </div>
        ) : null}
        <fieldset disabled={readOnly} className="cp-system-readonly m-0 min-w-0 border-0 p-0">
          {children}
        </fieldset>
      </main>
    </div>
  );
}
