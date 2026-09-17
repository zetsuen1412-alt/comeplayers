import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { createPayment, payWithWallet } from "../api";
import { capturePayPalPayment, confirmOrder, createPayPalPayment, loadOrder, loadTopups, loadWallet, type CommerceOrder } from "../commerceApi";
import { useCommerceCurrency } from "../CommerceProvider";
import { idrTotal, money, orderStage, trustedPaymentUrl } from "../commercePolicy";
import type { PaymentResult } from "../types";
import { c, CommerceButton, CommerceError, CommerceLoading, OrderProgress } from "./CommerceUI";
type Method = "wallet" | "card" | "bank_transfer" | "qris" | "doku_wallet" | "paypal";
const methods: Array<[Method, string]> = [["wallet","CPWallet"],["card","Visa / Mastercard"],["bank_transfer","Bank transfer"],["qris","QRIS"],["doku_wallet","DOKU Wallet"],["paypal","PayPal"]];
export function OrderPayment({ orderId, onChanged }: { orderId: number; onChanged?: () => void }) {
  const { formatIdr } = useCommerceCurrency();
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [method, setMethod] = useState<Method>("wallet");
  const [available, setAvailable] = useState({ doku: false, paypal: false });
  const [balance, setBalance] = useState<number | null>(null);
  const [walletActive, setWalletActive] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [paypal, setPaypal] = useState<Awaited<ReturnType<typeof createPayPalPayment>> | null>(null);
  const alive = useRef(true), lock = useRef(false), current = useRef(order), paypalRef = useRef(paypal);
  current.current = order; paypalRef.current = paypal;
  const changed = useRef(onChanged); changed.current = onChanged;
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await task(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Unable to load payment."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const refresh = useCallback(async (capture = false) => {
    const loaded = await loadOrder(orderId);
    if (loaded.role !== "buyer") throw new Error("Open this order from the buyer account.");
    if (alive.current) { current.current = loaded.order; setOrder(loaded.order); }
    const providerOrder = loaded.order.paypal_order_id || paypalRef.current?.paypalOrderId;
    if (capture && orderStage(loaded.order.status) === "awaiting" && providerOrder) {
      await capturePayPalPayment(orderId, providerOrder);
      const confirmed = await loadOrder(orderId);
      if (alive.current) { current.current = confirmed.order; setOrder(confirmed.order); }
    }
    const wallet = await loadWallet();
    if (alive.current) { setBalance(Number(wallet.wallet.balance)); setWalletActive(wallet.wallet.status === "active"); changed.current?.(); }
  }, [orderId]);
  useEffect(() => {
    alive.current = true;
    void run(async () => { await refresh(); const providers = await loadTopups(); if (alive.current) setAvailable(providers.methods); });
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void run(() => refresh(true)); });
    return () => { alive.current = false; subscription.remove(); };
  }, [refresh]);
  const total = order ? idrTotal(order) : 0, stage = orderStage(order?.status);
  const pay = () => run(async () => {
    if (!order || stage !== "awaiting") return;
    if (method === "wallet") { await payWithWallet(order.id); await refresh(); return; }
    if (method === "paypal") {
      // Preparing a provider order is separate from the user's approval/payment.
      const prepared = await createPayPalPayment(order.id);
      if (alive.current) { setPaypal(prepared); setNotice("Review the USD charge below, then approve in PayPal."); }
      return;
    }
    const result = await createPayment(order.id, method);
    if (alive.current) { setPayment(result); setNotice("Payment instructions ready. Your order stays unpaid until the provider confirms."); }
    if (result.alreadyPaid) { await refresh(); return; }
    if (result.paymentUrl) {
      if (!trustedPaymentUrl(result.paymentUrl, "doku")) throw new Error("The payment URL is not recognized.");
      await Linking.openURL(result.paymentUrl);
    }
  });
  return <ScrollView contentContainerStyle={c.page}>
    <CommerceError value={error} />{busy ? <CommerceLoading /> : null}
    {order ? <><View style={c.card}><Text style={c.label}>ORDER #{order.id}</Text><Text style={c.title}>{order.product_title || order.product || "Marketplace order"}</Text><Text style={c.balance}>{formatIdr(total)}</Text><Text style={c.muted}>{money(total,"IDR")} · {order.payment_status}</Text><OrderProgress status={order.status} /></View>
      {notice ? <Text accessibilityLiveRegion="polite" style={c.muted}>{notice}</Text> : null}
      {stage === "awaiting" ? <View style={c.card}><Text style={c.title}>Payment method</Text>{methods.map(([id,label]) => {
        const enabled = id === "wallet" ? walletActive && balance !== null && balance >= total : id === "paypal" ? available.paypal : available.doku;
        return <Pressable key={id} disabled={busy || !enabled || !!payment || !!paypal} accessibilityRole="radio" accessibilityState={{ checked: method === id, disabled: !enabled }} onPress={() => setMethod(id)} style={[c.chip, method === id && c.chipActive, !enabled && { opacity: .45 }]}><Text style={c.text}>{label}{id === "wallet" ? " · " + (balance !== null ? formatIdr(balance) : "Loading") : ""}</Text></Pressable>;
      })}
      <Text style={c.muted}>{method === "wallet" ? "CPWallet will be debited " + money(total,"IDR") + "." : method === "paypal" ? "PayPal confirms the USD charge before approval." : "You will be charged " + money(total,"IDR") + ". Your selected currency is a display estimate. Your bank may apply conversion and fees."}</Text>
      {!payment && !paypal ? <CommerceButton label={method === "wallet" ? "Pay " + money(total,"IDR") + " with CPWallet" : method === "paypal" ? "Review PayPal payment" : "Continue to secure payment"} disabled={busy || !(total > 0) || (method === "wallet" ? !walletActive || balance === null || balance < total : method === "paypal" ? !available.paypal : !available.doku)} onPress={() => void pay()} /> : null}
      {paypal ? <View style={{ gap: 12 }}><Text style={c.title}>PayPal charge: {money(paypal.amountUsd,"USD")}</Text><Text style={c.small}>The saved USD quote pays {money(paypal.amountIdr,"IDR")} for this order.</Text><CommerceButton label="Approve in PayPal" disabled={busy} onPress={() => void run(async () => { if (!trustedPaymentUrl(paypal.approveUrl,"paypal")) throw new Error("The PayPal URL is not recognized."); await Linking.openURL(paypal.approveUrl); })} /></View> : null}
      {payment?.qris ? <View style={{ gap: 10, alignItems: "center" }}><Text style={c.title}>Scan QRIS to pay</Text><Image source={{ uri: payment.qris.imageUrl }} style={{ width: 250, height: 250, backgroundColor: "white", borderRadius: 12 }} resizeMode="contain" /><Text selectable style={c.small}>{payment.qris.content}</Text><Text style={c.muted}>Expires {payment.qris.expiresAt ? new Date(payment.qris.expiresAt).toLocaleString() : "as shown by DOKU"}</Text></View> : null}
      {payment?.virtualAccount ? <View style={{ gap: 8 }}><Text style={c.title}>Virtual account</Text><Text style={c.muted}>{payment.virtualAccount.networkName}</Text><Text selectable style={c.heading}>{payment.virtualAccount.number}</Text><Text style={c.small}>Transfer the exact IDR amount before {payment.virtualAccount.expiresAt ? new Date(payment.virtualAccount.expiresAt).toLocaleString() : "the payment deadline"}.</Text></View> : null}
      {payment?.paymentUrl ? <CommerceButton label="Reopen secure payment" secondary disabled={busy} onPress={() => void run(async () => { if (trustedPaymentUrl(payment.paymentUrl!, "doku")) await Linking.openURL(payment.paymentUrl!); })} /> : null}
      </View> : null}
      <CommerceButton label="Refresh order and payment status" secondary disabled={busy} onPress={() => void run(() => refresh(true))} />
      {order.delivery_message || order.delivery_credentials ? <View style={c.card}><Text style={c.title}>Your delivery</Text>{order.delivery_message ? <Text selectable style={c.text}>{order.delivery_message}</Text> : null}{order.delivery_credentials ? <Text selectable style={c.text}>{order.delivery_credentials}</Text> : null}</View> : null}
      {stage === "delivered" ? <CommerceButton label="Confirm received and complete order" disabled={busy} onPress={() => Alert.alert("Complete this order?", "Confirm only after checking your delivery. This releases the seller's payment.", [{ text: "Cancel", style: "cancel" }, { text: "Confirm received", onPress: () => void run(async () => { await confirmOrder(order.id); await refresh(); }) }])} /> : null}
      <Text style={c.small}>Approved refunds are credited to CPWallet. For a delivery issue, open your order on ComePlayers and use the dispute/support options.</Text>
      <CommerceButton label="Open full order and support" secondary onPress={() => void Linking.openURL("https://www.comeplayers.com/orders/" + order.id)} />
    </> : !busy ? <CommerceButton label="Retry order" onPress={() => void run(() => refresh())} /> : null}
  </ScrollView>;
}
