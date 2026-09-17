import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useCommerceCurrency } from "../CommerceProvider";
import { loadTopup, loadTopups, loadWallet, walletAction, type WalletHistory, type WalletIntent, type WalletOverview } from "../commerceApi";
import { money, trustedPaymentUrl } from "../commercePolicy";
import { c, CommerceButton, CommerceError, CommerceLoading, CommerceModal, CurrencyChoice } from "./CommerceUI";
export function WalletScreen({ initialTopup, onClose }: { initialTopup?: string; onClose: () => void }) {
  const { currency, formatIdr, rateNote } = useCommerceCurrency();
  const [overview, setOverview] = useState<WalletOverview | null>(null);
  const [history, setHistory] = useState<WalletHistory | null>(null);
  const [intent, setIntent] = useState<WalletIntent | null>(null);
  const [provider, setProvider] = useState<"doku" | "paypal">("doku");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(false), alive = useRef(true), requestKey = useRef(""), current = useRef(intent);
  current.current = intent;
  const refresh = useCallback(async () => {
    const [wallet, list] = await Promise.all([loadWallet(), loadTopups()]);
    if (alive.current) { setOverview(wallet); setHistory(list); }
    return list;
  }, []);
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await task(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Unable to load CPWallet."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const check = useCallback(async () => {
    const saved = current.current;
    if (saved) {
      const result = await walletAction({ action: "reconcile", id: saved.id });
      if (alive.current) { setIntent(result.intent); setNotice(result.intent.status === "credited" ? "Your top-up is confirmed. Balance updated." : "Payment is not confirmed yet. Your balance changes only after provider confirmation."); }
    }
    await refresh();
  }, [refresh]);
  useEffect(() => {
    alive.current = true;
    void run(async () => {
      const list = await refresh();
      if (alive.current && !list.methods.doku && list.methods.paypal) setProvider("paypal");
      if (initialTopup) { const result = await loadTopup(initialTopup); if (alive.current) { current.current = result.intent; setIntent(result.intent); } await check(); }
    });
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void run(check); });
    return () => { alive.current = false; subscription.remove(); };
  }, [refresh, initialTopup, check]);
  useEffect(() => { requestKey.current = ""; }, [amount, currency, provider]);
  const review = () => run(async () => {
    if (!requestKey.current) requestKey.current = randomUUID();
    const result = await walletAction({ action: "quote", requestKey: requestKey.current, amount, currency, provider });
    if (alive.current) { setIntent(result.intent); setNotice(""); } await refresh();
  });
  const pay = () => run(async () => {
    if (!intent) return;
    const { intent: updated } = await walletAction({ action: "start", id: intent.id, returnTo: "mobile" });
    if (alive.current) setIntent(updated);
    if (updated.status === "credited") { await refresh(); return; }
    if (updated.status === "pending" && updated.checkout_url && trustedPaymentUrl(updated.checkout_url, updated.provider)) await Linking.openURL(updated.checkout_url);
    else setNotice("The payment request is being checked. Check its status before creating another top-up.");
  });
  return <CommerceModal title="CPWallet" onClose={onClose}><ScrollView contentContainerStyle={c.page} keyboardShouldPersistTaps="handled">
    <View style={c.hero}><Text style={c.label}>AVAILABLE BALANCE</Text><Text style={c.balance}>{overview ? formatIdr(Number(overview.wallet.balance)) : "—"}</Text><Text style={c.muted}>{overview ? money(Number(overview.wallet.balance), "IDR") + " recorded balance" : "Loading your balance"}</Text><Text style={c.small}>{rateNote}</Text></View>
    <CurrencyChoice /><CommerceError value={error} />{notice ? <Text accessibilityLiveRegion="polite" style={c.muted}>{notice}</Text> : null}
    {busy ? <CommerceLoading /> : null}
    {intent ? <View style={c.card}><Text style={c.title}>Top-up · {intent.status}</Text><Text selectable style={c.small}>Reference: {intent.id}</Text><View style={c.row}><Text style={c.muted}>CPWallet credit</Text><Text style={c.text}>{money(intent.amount_idr, "IDR")}</Text></View><View style={c.row}><Text style={c.muted}>You pay</Text><Text style={c.title}>{money(intent.charge_amount, intent.charge_currency)}</Text></View><Text style={c.small}>Rate date {intent.rate_date}. Quote expires {new Date(intent.quote_expires_at).toLocaleString()}. Provider or bank conversion fees may apply.</Text>
      {["quoted", "pending"].includes(intent.status) ? <CommerceButton label={intent.status === "quoted" ? "Confirm and open secure payment" : "Continue saved payment"} onPress={() => void pay()} disabled={busy || (intent.status === "quoted" && Date.parse(intent.quote_expires_at) <= Date.now())} /> : null}
      <CommerceButton label="Check payment status" secondary onPress={() => void run(check)} disabled={busy} /><CommerceButton label="Back to top-ups" secondary onPress={() => { setIntent(null); setNotice(""); requestKey.current = ""; }} disabled={busy} />
    </View> : <View style={c.card}><Text style={c.title}>Add funds</Text><Text style={c.muted}>Enter your amount in {currency}. Review the exact charge before payment.</Text><TextInput accessibilityLabel={"Top-up amount in " + currency} value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#748197" style={c.input} />
      <View style={c.row}>{(["doku", "paypal"] as const).map(method => <Pressable key={method} accessibilityState={{ selected: provider === method, disabled: !history?.methods[method] }} disabled={busy || !history?.methods[method]} onPress={() => setProvider(method)} style={[c.chip, provider === method && c.chipActive, !history?.methods[method] && { opacity: .4 }]}><Text style={c.text}>{method === "doku" ? "DOKU" : "PayPal"}</Text></Pressable>)}</View>
      <Text style={c.small}>{provider === "doku" ? "Choose from the payment methods enabled in DOKU secure checkout, including cards, bank transfer, QRIS and supported wallets. DOKU charges IDR." : "PayPal charges the confirmed USD amount. Review currency conversion in PayPal."}</Text>
      <Text style={c.small}>Top up between IDR 10,000 and IDR 10,000,000 equivalent. Approved marketplace refunds return to CPWallet.</Text>
      <CommerceButton label="Review top-up" disabled={busy || !amount || overview?.wallet.status !== "active" || !history?.methods[provider]} onPress={() => void review()} />
      <CommerceButton label="Refresh balance" secondary disabled={busy} onPress={() => void run(check)} />
    </View>}
    {history?.intents.length ? <View style={c.card}><Text style={c.title}>Recent top-ups</Text>{history.intents.slice(0,10).map(item => <Pressable key={item.id} disabled={busy} onPress={() => { setIntent(item); setNotice(""); }} style={c.row}><View><Text style={c.text}>{formatIdr(item.amount_idr)}</Text><Text style={c.small}>{new Date(item.created_at).toLocaleDateString()} · {item.provider}</Text></View><Text style={c.link}>{item.status} ›</Text></Pressable>)}</View> : null}
    <View style={c.card}><Text style={c.title}>Balance activity</Text>{overview?.transactions.length ? overview.transactions.map(item => <View key={item.id} style={c.row}><View style={{ flex: 1 }}><Text style={c.text}>{item.description || item.type}</Text><Text style={c.small}>{new Date(item.created_at).toLocaleString()} · {item.status}</Text></View><View><Text style={c.text}>{formatIdr(Number(item.amount))}</Text><Text style={c.small}>Balance {formatIdr(Number(item.balance_after))}</Text></View></View>) : <Text style={c.muted}>No balance activity yet.</Text>}
    {overview?.nextCursor ? <CommerceButton label="Earlier activity" secondary disabled={busy} onPress={() => void run(async () => { const next = await loadWallet(overview.nextCursor!); if (alive.current) setOverview(old => old ? { ...next, transactions: [...old.transactions, ...next.transactions.filter(row => !old.transactions.some(previous => previous.id === row.id))] } : next); })} /> : null}</View>
  </ScrollView></CommerceModal>;
}
