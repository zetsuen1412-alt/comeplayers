"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import { adminText } from "@/lib/adminLocale";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FaArrowLeft, FaArrowRight, FaBars, FaSearch, FaTimes } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { useCurrency } from "@/components/CurrencyProvider";
import { CURRENCY_OPTIONS } from "@/lib/localization";
import { adminNavigation } from "./adminNavigation";
import type { AdminOverview } from "./AdminOverview";
import LoginModal from "@/components/LoginModal";

type WorkspaceContext = { overview: AdminOverview; refreshing: boolean; error: string; refresh: () => Promise<void> };
const Context = createContext<WorkspaceContext | null>(null);
export function useAdminWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Ruang kerja admin tidak tersedia.");
  return value;
}

export default function AdminWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const payroll = pathname.startsWith("/admin/payroll");
  const { currency, setPreferences } = useCurrency();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const finder = useRef<HTMLDialogElement>(null);
  const lastRefresh = useRef(0);
  const request = useRef(0);
  const currentPage = adminNavigation.flatMap(group => group.items).find(item => item.href === pathname)?.label || "Administrasi";

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setRefreshing(true); setError("");
    try {
      const result = await authenticatedFetchJson<AdminOverview>("/api/admin/overview");
      if (sequence === request.current) { setOverview(result); lastRefresh.current = Date.now(); }
    } catch (cause) {
      if (sequence === request.current) {
        const message = cause instanceof Error ? cause.message : "Gagal memuat administrasi.";
        if (/authentication|login|sign in|admin access|two-step|forbidden/i.test(message)) setOverview(null);
        setError(message);
      }
    } finally {
      if (sequence === request.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    if (payroll) return;
    void refresh();
    function focus() { if (Date.now() - lastRefresh.current > 60_000) void refresh(); }
    window.addEventListener("focus", focus);
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === "SIGNED_OUT") { ++request.current; setOverview(null); setError("Masuk dengan akun administrator untuk melanjutkan."); setRefreshing(false); setLoading(false); }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") setTimeout(() => { void refresh(); }, 0);
    });
    return () => { ++request.current; window.removeEventListener("focus", focus); data.subscription.unsubscribe(); };
  }, [payroll, refresh]);
  useLiveRefresh(async () => { await refresh(); }, { topics: 'admin', enabled: !payroll });

  useEffect(() => { menu.current?.close(); finder.current?.close(); setQuery(""); }, [pathname]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !payroll) { event.preventDefault(); finder.current?.showModal(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [payroll]);

  if (payroll) return children;
  const navigation = <nav aria-label={"Halaman administrasi"}>{adminNavigation.map(group => <div className="adm-nav-group" key={group.label}><h2>{group.label}</h2>{group.items.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}</div>)}</nav>;
  const searchResults = adminNavigation.flatMap(group => group.items).filter(item => item.label.toLowerCase().includes(query.toLowerCase().trim()));

  return <div className="admin-workspace" lang="id">
    <a className="adm-skip" href="#admin-content">Lewati ke konten</a>
    <aside className="adm-sidebar">
      <Link href="/admin" className="adm-brand">
        <Image
          src="/brand/comeplayers-cp-v7-transparent.png"
          alt=""
          width={38}
          height={38}
          loading="eager"
          className="h-[38px] w-[38px] shrink-0 object-contain"
        />
        <div>ComePlayers<small>ADMINISTRASI</small></div>
      </Link>
      {navigation}
      <Link className="adm-store-link" href="/marketplace"><FaArrowLeft /> Kembali ke marketplace</Link>
    </aside>
    <div className="adm-workarea">
      <header className="adm-topbar"><div className="adm-breadcrumb"><button className="adm-icon-button adm-mobile-toggle" onClick={() => menu.current?.showModal()} aria-label={"Buka navigasi"}><FaBars /></button><span>Ruang kerja</span><span aria-hidden="true">/</span><strong>{currentPage}</strong></div><div className="adm-topbar-actions"><button className="adm-search-trigger" aria-label={"Cari halaman admin"} onClick={() => finder.current?.showModal()}><FaSearch /><span>Cari halaman</span><kbd>Ctrl K</kbd></button><label className="adm-currency"><span className="adm-sr">Mata uang tampilan</span><select aria-label={"Mata uang tampilan"} value={currency} onChange={event => setPreferences({ currency: event.target.value })}>{CURRENCY_OPTIONS.map(item => <option key={item.currency} value={item.currency}>{item.currency}</option>)}</select></label><Link className="adm-profile" href="/account" title={"Pengaturan akun"}><span>{String(overview?.profile.username || "A").slice(0,1).toUpperCase()}</span><div>{overview?.profile.username || "Administrator"}<small>Ruang kerja admin</small></div></Link></div></header>
      <div id="admin-content" tabIndex={-1} className="adm-content">
        {overview && error && <div className="adm-inline-error" role="alert">{adminText(error)} Data terakhir yang berhasil dimuat tetap ditampilkan. <button onClick={() => void refresh()} disabled={refreshing}>Coba Lagi</button></div>}
        {loading ? <div className="adm-loading" role="status"><div className="adm-skeleton" /><div className="adm-skeleton" /><p>Memuat administrasi…</p></div> : !overview ? <section className="adm-access"><span className="adm-eyebrow">RUANG KERJA AMAN</span><h1>Akses administrator</h1><p role="alert">{adminText(error || "Masuk dengan akun administrator Anda.")}</p><div className="adm-actions"><button className="adm-button" onClick={() => setLoginOpen(true)}>Masuk</button><button className="adm-button secondary" onClick={() => void refresh()} disabled={refreshing}>Coba lagi</button></div></section> : <Context.Provider value={{ overview, refreshing, error, refresh }}><div className={pathname === "/admin" ? "adm-dashboard" : "adm-module"}>{children}</div></Context.Provider>}
      </div>
    </div>
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={() => { setLoginOpen(false); void refresh(); }} />
    <dialog ref={menu} className="adm-mobile-menu" aria-label={"Navigasi admin"} onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}><div className="adm-dialog-heading"><strong>Admin ComePlayers</strong><button className="adm-icon-button" aria-label={"Tutup navigasi"} onClick={() => menu.current?.close()}><FaTimes /></button></div>{navigation}</dialog>
    <dialog ref={finder} className="adm-finder" aria-label={"Cari halaman admin"} onClick={event => { if (event.target === event.currentTarget) finder.current?.close(); }}><div className="adm-dialog-heading"><FaSearch /><input autoFocus aria-label={"Cari halaman admin"} placeholder={"Cari pesanan, dompet, produk…"} value={query} onChange={event => setQuery(event.target.value)} /><button className="adm-icon-button" aria-label={"Tutup pencarian halaman"} onClick={() => finder.current?.close()}><FaTimes /></button></div><nav aria-label={"Hasil pencarian"}>{searchResults.map(item => <Link key={item.href} href={item.href} onClick={() => finder.current?.close()}><item.icon /><span>{item.label}</span><FaArrowRight /></Link>)}{searchResults.length === 0 && <p>Tidak ada halaman yang sesuai. Coba “pesanan” atau “dompet”.</p>}</nav></dialog>
  </div>;
}
