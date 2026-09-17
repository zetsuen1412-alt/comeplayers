"use client";

import { adminLabel, adminText } from "@/lib/adminLocale";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaSearch, FaSyncAlt, FaTimes } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { adminStatus } from "./AdminOverview";

type Order = { id: number; product_title: string | null; product: string | null; buyer: string | null; buyer_id: string | null; seller_id: string | null; quantity: number; total_amount: number | string | null; total_price: number | string | null; status: string; payment_status: string; payment_method: string | null; payment_proof: string | null; escrow_status: string | null; seller_payout_status: string | null; created_at: string };
type Result = { orders: Order[]; total: number; page: number; pageSize: number };
const statuses = [{ value: "all", label: "Semua status" }, { value: "pending", label: "Menunggu pembayaran" }, { value: "verification", label: "Verifikasi pembayaran" }, { value: "processing", label: "Dibayar / diproses" }, { value: "delivered", label: "Diserahkan" }, { value: "completed", label: "Selesai" }, { value: "cancelled", label: "Dibatalkan / kedaluwarsa" }, { value: "refunded", label: "Pengembalian dana" }, { value: "disputed", label: "Disengketakan" }];
type Action = "refund" | "complete" | "cancelled" | "disputed" | "confirm_payment" | "processing" | "delivered";
const actionLabels: Record<Action, string> = { refund: "Kembalikan dana ke CPWallet", complete: "Selesaikan dan lepas dana ditahan", cancelled: "Batalkan pesanan belum dibayar", disputed: "Buka sengketa", confirm_payment: "Konfirmasi pembayaran manual", processing: "Tandai sedang diproses", delivered: "Tandai sudah diserahkan" };

export default function AdminOrders() {
  const { formatIdrPrice, formatIdrAmount, currency } = useCurrency();
  const [result, setResult] = useState<Result>({ orders: [], total: 0, page: 1, pageSize: 25 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [action, setAction] = useState<Action | "">("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), status, q: query });
      const data = await authenticatedFetchJson<Result>(`/api/admin/orders?${params}`);
      if (current === sequence.current) setResult(data);
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Gagal memuat pesanan."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page, query, status]);
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, [load]);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  const amount = (order: Order) => Number(order.total_amount) || Number(order.total_price) || 0;
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
  function open(order: Order) { setSelected(order); setAction(""); setNote(""); setActionError(""); }
  function actions(order: Order): Action[] {
    const paid = order.payment_status === "paid";
    if (["refunded", "cancelled", "expired"].includes(order.status)) return [];
    const result: Action[] = [];
    if (paid && ["paid", "disputed"].includes(order.status)) result.push("processing");
    if (paid && ["paid", "processing", "disputed"].includes(order.status)) result.push("delivered");
    if (paid && order.status === "delivered") result.push("complete");
    if (paid && order.escrow_status !== "released" && !["paid", "released"].includes(order.seller_payout_status || "")) result.push("refund");
    if (!paid) result.push("cancelled");
    if (paid && order.status !== "completed") result.push("disputed");
    if (!paid && order.payment_proof && !["paypal", "doku", "wallet"].includes(String(order.payment_method).toLowerCase())) result.push("confirm_payment");
    return result;
  }
  async function submitAction(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !action || !note.trim()) return;
    setSaving(true); setActionError("");
    try {
      await authenticatedFetchJson("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: selected.id, action: ["cancelled", "disputed", "processing", "delivered"].includes(action) ? "status" : action, status: action, note: note.trim() }) });
      setNotice(`Pesanan #${selected.id} diperbarui. ${action === "refund" ? "Pengembalian dana yang disetujui telah masuk ke CPWallet." : "Tindakan telah dicatat dalam log audit."}`);
      setSelected(null); await load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Gagal memperbarui pesanan ini."); }
    finally { setSaving(false); }
  }
  return <main className="adm-orders-page">
    <div className="adm-page-heading"><div><span className="adm-eyebrow">MARKETPLACE</span><h1>Pesanan</h1><p>Tinjau pembayaran, penyerahan, dan pengembalian dana dari satu tempat.</p></div><button className="adm-button secondary" onClick={() => void load()} disabled={loading}><FaSyncAlt /> Muat Ulang</button></div>
    {notice && <div className="adm-inline-success" role="status">{adminText(notice)}</div>}{error && <div className="adm-inline-error" role="alert">{adminText(error)}</div>}
    <section className="adm-panel"><form className="adm-order-filters" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}><label><span className="adm-sr">Cari pesanan</span><FaSearch /><input type="search" aria-label={"Cari pesanan"} placeholder={"ID pesanan, produk, atau email pembeli"} value={search} onChange={event => setSearch(event.target.value)} /><button className="adm-button secondary">Cari</button></label><select aria-label={"Saring status pesanan"} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></form>
    <div className="adm-list-meta"><span>{loading ? "Memuat pesanan…" : `${result.total.toLocaleString("id-ID")} pesanan sesuai pencarian`}</span><span>Tampilan: {currency} · Pencatatan: IDR</span></div>
    <div className="adm-table-scroll adm-orders"><table aria-busy={loading}><caption className="adm-sr">Pesanan marketplace dan status pembayaran</caption><thead><tr><th>Pesanan / produk</th><th>Pembeli</th><th>Status pesanan</th><th>Pembayaran</th><th className="adm-number">Total</th><th>Tindakan</th></tr></thead><tbody>{result.orders.map(order => {
      const state = adminStatus(order.status), payment = adminStatus(order.payment_status);
      return <tr key={order.id}><td><Link href={`/orders/${order.id}`}><strong>#{order.id} · {date(order.created_at)}</strong><span title={order.product_title || order.product || ""}>{order.product_title || order.product || "Pesanan marketplace"}</span></Link></td><td><span className="adm-buyer" title={order.buyer || order.buyer_id || ""}>{order.buyer || order.buyer_id || "—"}</span></td><td><span className={`adm-status ${state.tone}`}>{state.label}</span></td><td><span className={`adm-status ${payment.tone}`}>{payment.label}</span></td><td className="adm-number">{formatIdrPrice(amount(order))}</td><td><button className="adm-button secondary" disabled={loading} onClick={() => open(order)}>Kelola</button></td></tr>;
    })}</tbody></table>{!loading && result.orders.length === 0 && <div className="adm-empty"><h3>Tidak ada pesanan yang sesuai</h3><p>Coba status atau kata pencarian lain.</p></div>}</div><div className="adm-pagination"><span>Halaman {page} dari {Math.max(1,Math.ceil(result.total / result.pageSize))}</span><div><button className="adm-button secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Sebelumnya</button><button className="adm-button secondary" disabled={loading || page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Berikutnya</button></div></div></section>
    <dialog ref={dialog} className="adm-order-dialog" aria-label={selected ? `Kelola pesanan ${selected.id}` : "Kelola pesanan"} onCancel={event => { if (saving) event.preventDefault(); else setSelected(null); }}>
      {selected && <><div className="adm-dialog-heading"><div><span className="adm-eyebrow">PESANAN #{selected.id}</span><h2>Kelola pesanan</h2></div><button className="adm-icon-button" aria-label={"Tutup pesanan"} disabled={saving} onClick={() => setSelected(null)}><FaTimes /></button></div><div className="adm-order-detail"><h3>{selected.product_title || selected.product}</h3><dl><div><dt>Total</dt><dd>{formatIdrPrice(amount(selected))}</dd></div><div><dt>Pembayaran</dt><dd>{adminLabel(selected.payment_method || "—")} · {adminLabel(selected.payment_status)}</dd></div><div><dt>Status penyerahan</dt><dd>{adminLabel(selected.status.replaceAll("_", " "))}</dd></div><div><dt>Dana ditahan</dt><dd>{adminLabel(selected.escrow_status || "—")}</dd></div></dl><Link className="adm-button secondary" href={`/orders/${selected.id}`}>Buka detail pesanan</Link>
      {actions(selected).length > 0 ? <form onSubmit={submitAction}><label>Tindakan<select required value={action} disabled={saving} onChange={event => { setAction(event.target.value as Action); setActionError(""); }}><option value="">Pilih tindakan</option>{actions(selected).map(value => <option value={value} key={value}>{actionLabels[value]}</option>)}</select></label>{action && <><p className="adm-action-disclosure">{action === "refund" ? `Konfirmasi akan menambahkan ${formatIdrAmount(amount(selected))} (IDR) ke CPWallet pembeli. Tindakan ini tidak mengembalikan dana ke rekening bank atau kartu.` : action === "complete" ? "Konfirmasi akan melepas dana ditahan pesanan ini kepada penjual. Periksa penyerahan sebelum melanjutkan." : action === "confirm_payment" ? "Konfirmasi hanya setelah pembayaran manual diverifikasi secara terpisah. Pembayaran otomatis ditangani melalui pemberitahuan penyedia yang telah diverifikasi." : "Perubahan yang dipilih akan diterapkan pada pesanan ini dan dicatat dalam log audit."}</p><label>Alasan / catatan admin<textarea required maxLength={1000} rows={3} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder={"Jelaskan alasan tindakan ini dilakukan."} /></label>{actionError && <p role="alert" className="adm-inline-error">{adminText(actionError)}</p>}<button className="adm-button" disabled={saving || !note.trim()}>{saving ? "Menyimpan…" : `Konfirmasi: ${actionLabels[action]}`}</button></>}</form> : <p className="adm-footnote">Tidak ada tindakan keuangan yang tersedia untuk status pesanan saat ini.</p>}</div></>}
    </dialog>
  </main>;
}
