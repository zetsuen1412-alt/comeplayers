"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaSearch, FaSyncAlt, FaTimes } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { adminStatus } from "./AdminOverview";

type Order = { id: number; product_title: string | null; product: string | null; buyer: string | null; buyer_id: string | null; seller_id: string | null; quantity: number; total_amount: number | string | null; total_price: number | string | null; status: string; payment_status: string; payment_method: string | null; payment_proof: string | null; escrow_status: string | null; seller_payout_status: string | null; created_at: string };
type Result = { orders: Order[]; total: number; page: number; pageSize: number };
const statuses = [{ value: "all", label: "All statuses" }, { value: "pending", label: "Awaiting payment" }, { value: "verification", label: "Payment verification" }, { value: "processing", label: "Paid / processing" }, { value: "delivered", label: "Delivered" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled / expired" }, { value: "refunded", label: "Refunds" }, { value: "disputed", label: "Disputed" }];
type Action = "refund" | "complete" | "cancelled" | "disputed" | "confirm_payment" | "processing" | "delivered";
const actionLabels: Record<Action, string> = { refund: "Refund to CPWallet", complete: "Complete & release escrow", cancelled: "Cancel unpaid order", disputed: "Open dispute", confirm_payment: "Confirm manual payment", processing: "Mark as processing", delivered: "Mark as delivered" };

export default function AdminOrders() {
  const { formatIdrPrice, formatIdrAmount, locale, currency } = useCurrency();
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
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Unable to load orders."); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page, query, status]);
  useEffect(() => { void load(); return () => { ++sequence.current; }; }, [load]);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  const amount = (order: Order) => Number(order.total_amount) || Number(order.total_price) || 0;
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
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
      setNotice(`Order #${selected.id} updated. ${action === "refund" ? "The approved refund was credited to CPWallet." : "The action was recorded in the audit log."}`);
      setSelected(null); await load();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Unable to update this order."); }
    finally { setSaving(false); }
  }
  return <main className="adm-orders-page">
    <div className="adm-page-heading"><div><span className="adm-eyebrow">MARKETPLACE</span><h1>Orders</h1><p>Review payments, delivery and refunds from one place.</p></div><button className="adm-button secondary" onClick={() => void load()} disabled={loading}><FaSyncAlt /> Refresh</button></div>
    {notice && <div className="adm-inline-success" role="status">{notice}</div>}{error && <div className="adm-inline-error" role="alert">{error}</div>}
    <section className="adm-panel"><form className="adm-order-filters" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}><label><span className="adm-sr">Search orders</span><FaSearch /><input type="search" aria-label="Search orders" placeholder="Order ID, product or buyer email" value={search} onChange={event => setSearch(event.target.value)} /><button className="adm-button secondary">Search</button></label><select aria-label="Filter order status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></form>
    <div className="adm-list-meta"><span>{loading ? "Loading orders…" : `${result.total.toLocaleString(locale)} matching orders`}</span><span>Display: {currency} · Ledger: IDR</span></div>
    <div className="adm-table-scroll adm-orders"><table aria-busy={loading}><caption className="adm-sr">Marketplace orders and payment status</caption><thead><tr><th>Order / product</th><th>Buyer</th><th>Order status</th><th>Payment</th><th className="adm-number">Total</th><th>Action</th></tr></thead><tbody>{result.orders.map(order => {
      const state = adminStatus(order.status), payment = adminStatus(order.payment_status);
      return <tr key={order.id}><td><Link href={`/orders/${order.id}`}><strong>#{order.id} · {date(order.created_at)}</strong><span title={order.product_title || order.product || ""}>{order.product_title || order.product || "Marketplace order"}</span></Link></td><td><span className="adm-buyer" title={order.buyer || order.buyer_id || ""}>{order.buyer || order.buyer_id || "—"}</span></td><td><span className={`adm-status ${state.tone}`}>{state.label}</span></td><td><span className={`adm-status ${payment.tone}`}>{payment.label}</span></td><td className="adm-number">{formatIdrPrice(amount(order))}</td><td><button className="adm-button secondary" disabled={loading} onClick={() => open(order)}>Manage</button></td></tr>;
    })}</tbody></table>{!loading && result.orders.length === 0 && <div className="adm-empty"><h3>No matching orders</h3><p>Try another status or search term.</p></div>}</div><div className="adm-pagination"><span>Page {page} of {Math.max(1,Math.ceil(result.total / result.pageSize))}</span><div><button className="adm-button secondary" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="adm-button secondary" disabled={loading || page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Next</button></div></div></section>
    <dialog ref={dialog} className="adm-order-dialog" aria-label={selected ? `Manage order ${selected.id}` : "Manage order"} onCancel={event => { if (saving) event.preventDefault(); else setSelected(null); }}>
      {selected && <><div className="adm-dialog-heading"><div><span className="adm-eyebrow">ORDER #{selected.id}</span><h2>Manage order</h2></div><button className="adm-icon-button" aria-label="Close order" disabled={saving} onClick={() => setSelected(null)}><FaTimes /></button></div><div className="adm-order-detail"><h3>{selected.product_title || selected.product}</h3><dl><div><dt>Total</dt><dd>{formatIdrPrice(amount(selected))}</dd></div><div><dt>Payment</dt><dd>{selected.payment_method || "—"} · {selected.payment_status}</dd></div><div><dt>Delivery status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div><div><dt>Escrow</dt><dd>{selected.escrow_status || "—"}</dd></div></dl><Link className="adm-button secondary" href={`/orders/${selected.id}`}>Open full order</Link>
      {actions(selected).length > 0 ? <form onSubmit={submitAction}><label>Action<select required value={action} disabled={saving} onChange={event => { setAction(event.target.value as Action); setActionError(""); }}><option value="">Choose an action</option>{actions(selected).map(value => <option value={value} key={value}>{actionLabels[value]}</option>)}</select></label>{action && <><p className="adm-action-disclosure">{action === "refund" ? `Confirming will credit ${formatIdrAmount(amount(selected))} (IDR) to the buyer's CPWallet. It will not send a bank or card refund.` : action === "complete" ? "Confirming releases this order's escrow to the seller. Review delivery before continuing." : action === "confirm_payment" ? "Confirm only after independently verifying the manual payment. Automated provider payments are handled by their verified callbacks." : "The selected change will be applied to this order and recorded in the audit log."}</p><label>Reason / admin note<textarea required maxLength={1000} rows={3} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder="Explain why this action is appropriate." /></label>{actionError && <p role="alert" className="adm-inline-error">{actionError}</p>}<button className="adm-button" disabled={saving || !note.trim()}>{saving ? "Saving…" : `Confirm: ${actionLabels[action]}`}</button></>}</form> : <p className="adm-footnote">No financial actions are available for this order's current state.</p>}</div></>}
    </dialog>
  </main>;
}
