import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { createCheckoutOrder } from "../api";
import { quoteCheckout, type QuoteResult } from "../commerceApi";
import { useCommerceCurrency } from "../CommerceProvider";
import { money } from "../commercePolicy";
import type { MarketplaceProduct } from "../types";
import { c, CommerceButton, CommerceError, CommerceModal } from "./CommerceUI";
import { OrderPayment } from "./OrderPayment";
export function CheckoutSheet({ product, onClose }: { product: MarketplaceProduct | null; onClose: () => void }) {
  const { formatIdr, formatUsd } = useCommerceCurrency();
  const [quantity, setQuantity] = useState("1"), [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<QuoteResult | null>(null), [orderId, setOrderId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [uncertain, setUncertain] = useState(false);
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => { generation.current++; setQuantity("1"); setCoupon(""); setQuote(null); setOrderId(null); setError(""); setBusy(false); setUncertain(false); return () => { generation.current++; }; }, [product?.id]);
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; const version = generation.current; setBusy(true); setError("");
    try { await task(); } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : "Checkout unavailable."); }
    finally { lock.current = false; if (version === generation.current) setBusy(false); }
  };
  if (!product) return null;
  return <CommerceModal title={orderId ? "Order #" + orderId : "Review your order"} onClose={onClose}>{orderId ? <OrderPayment key={orderId} orderId={orderId} /> : <ScrollView contentContainerStyle={c.page} keyboardShouldPersistTaps="handled">
    <View style={c.card}><Text style={c.title}>{product.title}</Text><Text style={c.muted}>Listed price {formatUsd(Number(product.price))} · final amount is confirmed below.</Text><Text style={c.label}>QUANTITY</Text><TextInput accessibilityLabel="Quantity" value={quantity} onChangeText={value => { setQuantity(value); setQuote(null); }} editable={!busy && !uncertain} keyboardType="number-pad" style={c.input} maxLength={3} /><Text style={c.label}>COUPON (OPTIONAL)</Text><TextInput accessibilityLabel="Coupon code" value={coupon} onChangeText={value => { setCoupon(value); setQuote(null); }} editable={!busy && !uncertain} autoCapitalize="characters" style={c.input} maxLength={100} /></View>
    <CommerceError value={error} />
    {quote ? <View style={c.card}><Text style={c.title}>Order summary</Text>{[["Subtotal",quote.quote.subtotal],["Discount",-quote.quote.discount],["Payment fee",quote.quote.payment_fee],["Total",quote.quote.total]].map(([label,amount]) => <View key={String(label)} style={c.row}><Text style={c.text}>{label}</Text><Text style={c.text}>{formatIdr(Number(amount))}</Text></View>)}<Text style={c.muted}>Recorded order total: {money(quote.quote.total,"IDR")}. Review your payment method next.</Text></View> : null}
    {uncertain ? <Text style={c.muted}>The order request could not be confirmed. Check Profile → My orders before placing another order. No payment was attempted.</Text> : quote ? <CommerceButton label="Create order · choose payment" disabled={busy} onPress={() => void run(async () => {
      const version = generation.current;
      // Never repeat an uncertain order mutation automatically.
      setUncertain(true);
      const created = await createCheckoutOrder(product.id, Number(quantity), quote.quoteToken, coupon);
      if (version === generation.current) { setOrderId(created.id); setUncertain(false); }
    })} /> : <CommerceButton label={busy ? "Checking price…" : "Review final price"} disabled={busy || !/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 100} onPress={() => void run(async () => { const version = generation.current; const reviewed = await quoteCheckout(product.id, Number(quantity), coupon); if (version === generation.current) setQuote(reviewed); })} />}
    <Text style={c.small}>Stock, coupon and price are checked on the server. Creating an order does not charge your wallet or card.</Text>
  </ScrollView>}</CommerceModal>;
}
