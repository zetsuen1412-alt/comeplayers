"use client";

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

type WorkspaceContext = { overview: AdminOverview; refreshing: boolean; error: string; refresh: () => Promise<void> };
const Context = createContext<WorkspaceContext | null>(null);
export function useAdminWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Admin workspace is unavailable.");
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
  const menu = useRef<HTMLDialogElement>(null);
  const finder = useRef<HTMLDialogElement>(null);
  const lastRefresh = useRef(0);
  const request = useRef(0);
  const currentPage = adminNavigation.flatMap(group => group.items).find(item => item.href === pathname)?.label || "Administration";

  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    setRefreshing(true); setError("");
    try {
      const result = await authenticatedFetchJson<AdminOverview>("/api/admin/overview");
      if (sequence === request.current) { setOverview(result); lastRefresh.current = Date.now(); }
    } catch (cause) {
      if (sequence === request.current) {
        const message = cause instanceof Error ? cause.message : "Unable to load administration.";
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
      if (event === "SIGNED_OUT") { ++request.current; setOverview(null); setError("Sign in with an administrator account to continue."); setRefreshing(false); setLoading(false); }
    });
    return () => { ++request.current; window.removeEventListener("focus", focus); data.subscription.unsubscribe(); };
  }, [payroll, refresh]);

  useEffect(() => { menu.current?.close(); finder.current?.close(); setQuery(""); }, [pathname]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && !payroll) { event.preventDefault(); finder.current?.showModal(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [payroll]);

  if (payroll) return children;
  const navigation = <nav aria-label="Administration pages">{adminNavigation.map(group => <div className="adm-nav-group" key={group.label}><h2>{group.label}</h2>{group.items.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}</div>)}</nav>;
  const searchResults = adminNavigation.flatMap(group => group.items).filter(item => item.label.toLowerCase().includes(query.toLowerCase().trim()));

  return <div className="admin-workspace">
    <a className="adm-skip" href="#admin-content">Skip to content</a>
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
        <div>ComePlayers<small>ADMINISTRATION</small></div>
      </Link>
      {navigation}
      <Link className="adm-store-link" href="/marketplace"><FaArrowLeft /> Back to marketplace</Link>
    </aside>
    <div className="adm-workarea">
      <header className="adm-topbar"><div className="adm-breadcrumb"><button className="adm-icon-button adm-mobile-toggle" onClick={() => menu.current?.showModal()} aria-label="Open navigation"><FaBars /></button><span>Workspace</span><span aria-hidden="true">/</span><strong>{currentPage}</strong></div><div className="adm-topbar-actions"><button className="adm-search-trigger" aria-label="Find an admin page" onClick={() => finder.current?.showModal()}><FaSearch /><span>Find a page</span><kbd>Ctrl K</kbd></button><label className="adm-currency"><span className="adm-sr">Display currency</span><select aria-label="Display currency" value={currency} onChange={event => setPreferences({ currency: event.target.value })}>{CURRENCY_OPTIONS.map(item => <option key={item.currency}>{item.currency}</option>)}</select></label><Link className="adm-profile" href="/account" title="Account settings"><span>{String(overview?.profile.username || "A").slice(0,1).toUpperCase()}</span><div>{overview?.profile.username || "Administrator"}<small>Admin workspace</small></div></Link></div></header>
      <div id="admin-content" tabIndex={-1} className="adm-content">
        {overview && error && <div className="adm-inline-error" role="alert">{error} The last successful snapshot is still shown. <button onClick={() => void refresh()} disabled={refreshing}>Retry</button></div>}
        {loading ? <div className="adm-loading" role="status"><div className="adm-skeleton" /><div className="adm-skeleton" /><p>Loading administration…</p></div> : !overview ? <section className="adm-access"><span className="adm-eyebrow">SECURE WORKSPACE</span><h1>Administrator access</h1><p role="alert">{error || "Sign in with your administrator account."}</p><div className="adm-actions"><Link className="adm-button" href="/login">Sign in</Link><button className="adm-button secondary" onClick={() => void refresh()} disabled={refreshing}>Try again</button></div></section> : <Context.Provider value={{ overview, refreshing, error, refresh }}><div className={pathname === "/admin" ? "adm-dashboard" : "adm-module"}>{children}</div></Context.Provider>}
      </div>
    </div>
    <dialog ref={menu} className="adm-mobile-menu" aria-label="Admin navigation" onClick={event => { if (event.target === event.currentTarget) menu.current?.close(); }}><div className="adm-dialog-heading"><strong>ComePlayers Admin</strong><button className="adm-icon-button" aria-label="Close navigation" onClick={() => menu.current?.close()}><FaTimes /></button></div>{navigation}</dialog>
    <dialog ref={finder} className="adm-finder" aria-label="Find an admin page" onClick={event => { if (event.target === event.currentTarget) finder.current?.close(); }}><div className="adm-dialog-heading"><FaSearch /><input autoFocus aria-label="Find an admin page" placeholder="Find orders, wallets, products…" value={query} onChange={event => setQuery(event.target.value)} /><button className="adm-icon-button" aria-label="Close page finder" onClick={() => finder.current?.close()}><FaTimes /></button></div><nav aria-label="Search results">{searchResults.map(item => <Link key={item.href} href={item.href} onClick={() => finder.current?.close()}><item.icon /><span>{item.label}</span><FaArrowRight /></Link>)}{searchResults.length === 0 && <p>No matching pages. Try “orders” or “wallet”.</p>}</nav></dialog>
  </div>;
}
