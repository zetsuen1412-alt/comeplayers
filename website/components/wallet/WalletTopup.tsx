"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaCreditCard, FaPaypal, FaShieldAlt, FaWallet } from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { isTrustedDokuPaymentUrl } from "@/lib/dokuPaymentResponse";
import { isTrustedPayPalCheckoutUrl } from "@/lib/paypalCheckout";
import WalletCurrencySelect from "./WalletCurrencySelect";

type Intent = { id: string; provider: "doku" | "paypal"; status: string; amount_idr: number; display_amount: number; display_currency: string; charge_amount: number; charge_currency: string; idr_per_unit: number; rate_date: string; quote_expires_at: string; payment_expires_at: string | null; checkout_url: string | null; created_at: string };
type History = { methods: { doku: boolean; paypal: boolean }; intents: Intent[] };
const api = "/api/wallet/payments";

export default function WalletTopup() {
  const { currency, locale, formatIdrPrice, formatIdrAmount } = useCurrency();
  const [history, setHistory] = useState<History | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletStatus, setWalletStatus] = useState("active");
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<"doku" | "paypal">("doku");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKey = useRef("");
  const returned = useRef(false);
  const returnToken = useRef("");
  const money = (value: number, code: string) => new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "code", maximumFractionDigits: ["IDR", "JPY", "KRW", "VND"].includes(code) ? 0 : 2 }).format(value);
  const load = useCallback(async () => {
    const [list, overview] = await Promise.all([
      authenticatedFetchJson<History>(api),
      authenticatedFetchJson<{ wallet: { balance: string | number; status: string } }>("/api/wallet/overview"),
    ]);
    setHistory(list); setBalance(Number(overview.wallet.balance)); setWalletStatus(overview.wallet.status);
    return list;
  }, []);
  useEffect(() => {
    let active = true;
    void load().then(async list => {
      if (!active || returned.current) return;
      returned.current = true;
      if (!list.methods.doku && list.methods.paypal) setProvider("paypal");
      const query = new URL(window.location.href).searchParams;
      const id = query.get("topup");
      if (!id) return;
      const result = await authenticatedFetchJson<{ intent: Intent }>(`${api}?id=${encodeURIComponent(id)}`);
      if (!active) return;
      setIntent(result.intent);
      if (query.get("cancelled")) setNotice("Payment was not completed. No funds are added until the provider confirms payment.");
      if (query.get("paypalReturn") === "1" && query.get("token")) {
        returnToken.current = query.get("token")!;
        setBusy(true);
        const captured = await authenticatedFetchJson<{ intent: Intent }>(api, { method: "POST", body: JSON.stringify({ action: "capture", id, token: returnToken.current }) });
        if (active) { setIntent(captured.intent); await load(); }
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load top-ups."); }).finally(() => { if (active) { setLoading(false); setBusy(false); } });
    return () => { active = false; };
  }, [load]);
  useEffect(() => {
    if (!intent || !["starting", "pending"].includes(intent.status)) return;
    let active = true;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void authenticatedFetchJson<{ intent: Intent }>(`${api}?id=${intent.id}`).then(result => {
        if (!active) return;
        setIntent(result.intent);
        if (result.intent.status === "credited") { setError(""); void load().catch(() => undefined); }
      }).catch(() => { /* Keep the last confirmed state; manual refresh remains available. */ });
    }, 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [intent?.id, intent?.status, load]);

  async function review(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const result = await authenticatedFetchJson<{ intent: Intent }>(api, { method: "POST", body: JSON.stringify({ action: "quote", requestKey: requestKey.current, amount, currency, provider }) });
      setIntent(result.intent); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to prepare your top-up."); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!intent) return;
    setBusy(true); setError("");
    try {
      const result = await authenticatedFetchJson<{ intent: Intent }>(api, { method: "POST", body: JSON.stringify({ action: "start", id: intent.id }) });
      setIntent(result.intent);
      if (result.intent.status === "credited") { await load(); return; }
      const url = result.intent.checkout_url;
      if (url && result.intent.status === "pending" && (result.intent.provider === "doku" ? isTrustedDokuPaymentUrl(url) : isTrustedPayPalCheckoutUrl(url))) window.location.assign(url);
      else setNotice("Your payment request is being checked. Refresh its status; keep this reference if you contact support.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open payment. Refresh the saved top-up before retrying."); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError("");
    try {
      if (intent) {
        const result = returnToken.current && intent.provider === "paypal" && intent.status === "pending"
          ? await authenticatedFetchJson<{ intent: Intent }>(api, { method: "POST", body: JSON.stringify({ action: "capture", id: intent.id, token: returnToken.current }) })
          : await authenticatedFetchJson<{ intent: Intent }>(`${api}?id=${intent.id}`);
        setIntent(result.intent);
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh payment status."); }
    finally { setBusy(false); }
  }
  function newTopup() { setIntent(null); setError(""); setNotice(""); requestKey.current = ""; returnToken.current = ""; window.history.replaceState(null, "", "/wallet/topup"); }
  const expired = intent && new Date(intent.status === "quoted" ? intent.quote_expires_at : intent.payment_expires_at || intent.quote_expires_at).getTime() <= Date.now();
  return <main className="cpw"><Link href="/wallet" className="cpw-back"><FaArrowLeft />&nbsp; Back to CPWallet</Link>
    <div className="cpw-header"><div><span className="cpw-kicker">CPWallet</span><h1>Add funds</h1><p className="cpw-subtle">Choose an amount, review the exchange rate, and pay securely.</p></div><WalletCurrencySelect /></div>
    {error && <div role="alert" className="cpw-alert">{error}{!history && <> <Link href="/login">Sign in</Link> to continue.</>}</div>}
    {notice && <div role="status" className="cpw-info cpw-card">{notice}</div>}
    {loading ? <div className="cpw-loading" role="status">Loading your payment options…</div> : <div className="cpw-grid"><section className="cpw-card">
      {!intent ? <form onSubmit={review}><span className="cpw-step">01 / AMOUNT & PAYMENT</span><label className="cpw-field" htmlFor="cpw-amount">How much would you like to add?<span className="cpw-amount-input"><input id="cpw-amount" type="text" inputMode="decimal" autoComplete="off" required placeholder="0" value={amount} onChange={event => { setAmount(event.target.value); requestKey.current = ""; }} /><span>{currency}</span></span></label><p className="cpw-info">Minimum {formatIdrPrice(10000)} · Maximum {formatIdrPrice(10000000)} per top-up. Your exact credit and provider charge appear before payment.</p>
        <h2>Payment method</h2>
        <button className="cpw-provider" type="button" disabled={!history?.methods.doku || busy} aria-pressed={provider === "doku"} onClick={() => { setProvider("doku"); requestKey.current = ""; }}><FaCreditCard /><span><strong>DOKU</strong><small>Bank transfers, Visa / Mastercard, QRIS and e-wallets. Choose from your merchant&apos;s enabled methods on the secure payment page.{!history?.methods.doku && " Currently unavailable."}</small></span></button>
        <button className="cpw-provider" type="button" disabled={!history?.methods.paypal || busy} aria-pressed={provider === "paypal"} onClick={() => { setProvider("paypal"); requestKey.current = ""; }}><FaPaypal /><span><strong>PayPal</strong><small>Pay with your PayPal account. The confirmed charge is in USD.{!history?.methods.paypal && " Currently unavailable."}</small></span></button>
        {walletStatus !== "active" && <p role="status" className="cpw-alert">Your CPWallet is frozen. Contact support before adding funds.</p>}
        <button className="cpw-button cpw-full" disabled={busy || !amount || walletStatus !== "active" || !history?.methods[provider]}>{busy ? "Preparing your quote…" : "Review top-up"}</button>
      </form> : <div><span className="cpw-step">02 / REVIEW & PAY</span><h2 style={{ marginTop: 12 }}>{intent.status === "credited" ? "Funds added to CPWallet" : "Your top-up"}</h2>
        {intent.status === "credited" && <div role="status" className="cpw-success">Payment confirmed. {formatIdrPrice(intent.amount_idr)} has been added to your CPWallet.</div>}
        {intent.status === "review" && <div role="status" className="cpw-alert">This payment needs review. Contact support with the reference below.</div>}
        <dl><div className="cpw-row"><dt>You entered</dt><dd>{money(intent.display_amount, intent.display_currency)}</dd></div><div className="cpw-row"><dt>CPWallet credit</dt><dd>{formatIdrPrice(intent.amount_idr)}<br /><small className="cpw-subtle">{formatIdrAmount(intent.amount_idr)} (IDR)</small></dd></div><div className="cpw-row"><dt>Payment provider</dt><dd>{intent.provider === "paypal" ? "PayPal" : "DOKU"}</dd></div><div className="cpw-row"><dt>Provider will charge</dt><dd>{money(intent.charge_amount, intent.charge_currency)}</dd></div><div className="cpw-row"><dt>ComePlayers top-up fee</dt><dd>{money(0, intent.charge_currency)}</dd></div><div className="cpw-row"><dt>Exchange rate · {intent.rate_date}</dt><dd>1 {intent.display_currency} = {new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(intent.idr_per_unit)} IDR</dd></div><div className="cpw-row"><dt>Status</dt><dd><span className="cpw-pill" data-status={intent.status}>{intent.status === "quoted" ? "Ready for review" : intent.status === "starting" ? "Checking payment request" : intent.status === "pending" ? "Awaiting payment confirmation" : intent.status}</span></dd></div></dl>
        <p className="cpw-info">{intent.provider === "doku" ? "DOKU charges IDR. Your bank may convert the amount and apply its own fees." : "PayPal charges the USD amount above. PayPal or your funding bank may apply currency conversion and fees."} The confirmed CPWallet credit stays fixed.</p>
        <p className="cpw-reference">Reference: {intent.id}</p>
        {intent.status === "quoted" && <p className="cpw-info">Quote valid until {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(intent.quote_expires_at))}.</p>}
        {expired && !["credited", "review"].includes(intent.status) && <p className="cpw-info">The payment window has ended. Refresh the status before starting another top-up. Any payment already received will be reconciled using this reference.</p>}
        <div className="cpw-actions">{["quoted", "pending"].includes(intent.status) && !expired && <button className="cpw-button" onClick={() => void pay()} disabled={busy}>{busy ? "Opening payment…" : intent.status === "pending" ? "Continue payment" : `Pay with ${intent.provider === "paypal" ? "PayPal" : "DOKU"}`}</button>}
          {intent.status !== "quoted" && <button className="cpw-secondary" onClick={() => void refresh()} disabled={busy}>Refresh status</button>}
          <button className="cpw-secondary" onClick={newTopup} disabled={busy}>{intent.status === "quoted" ? "Change amount" : "New top-up"}</button>{intent.status === "credited" && <Link className="cpw-button" href="/wallet">Open CPWallet</Link>}</div>
      </div>}
    </section><aside><div className="cpw-card"><div className="cpw-balance-label"><span><FaWallet /> Available balance</span></div><div className="cpw-amount" style={{ fontSize: 32 }}>{balance === null ? "—" : formatIdrPrice(balance)}</div>{currency !== "IDR" && balance !== null && <p className="cpw-info">Recorded balance: {formatIdrAmount(balance)} (IDR). Displayed conversions are estimates.</p>}<h2 style={{ marginTop: 26 }}><FaShieldAlt /> Secure top-ups</h2><ul className="cpw-list"><li>Card and payment details are entered directly with your payment provider.</li><li>Funds are added only after confirmed payment.</li><li>Closing the page does not lose a confirmed top-up.</li><li>Approved product refunds go back to CPWallet.</li></ul><p className="cpw-info">Keep your top-up reference if a payment needs support. Never share card details, passwords or one-time codes.</p></div></aside></div>}
    {history && history.intents.length > 0 && <section className="cpw-card cpw-topup-history"><div className="cpw-section-head"><h2>Recent top-ups</h2><button className="cpw-secondary" onClick={() => void refresh()} disabled={busy}>Refresh</button></div><ul className="cpw-transactions">{history.intents.map(row => <li key={row.id} className="cpw-transaction"><div className="cpw-transaction-main"><strong>{row.provider === "paypal" ? "PayPal" : "DOKU"} · {formatIdrPrice(row.amount_idr)}</strong><p>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</p><button onClick={() => { setIntent(row); setError(""); setNotice(""); returnToken.current = ""; window.scrollTo({ top: 0, behavior: "smooth" }); }}>View details · {row.id.slice(0,8)}</button></div><span className="cpw-pill" data-status={row.status}>{row.status}</span></li>)}</ul></section>}
  </main>;
}
