import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Pressable, Text, View } from "react-native";
import { useCommerceCurrency } from "../CommerceProvider";
import { loadCommerce, loadOrders, type CommerceOrder, type CommerceOverview } from "../commerceApi";
import { idrTotal, ORDER_STAGES, type CommerceLink } from "../commercePolicy";
import { c, CommerceButton, CommerceError, CommerceLoading, CommerceModal, CurrencyChoice, OrderProgress } from "./CommerceUI";
import { WalletScreen } from "./WalletScreen";
import { OrderPayment } from "./OrderPayment";
export function ProfileCommerce({ commerceLink, onLinkHandled }: { commerceLink?: CommerceLink | null; onLinkHandled?: () => void }) {
  const { formatIdr, rateNote } = useCommerceCurrency();
  const [overview, setOverview] = useState<CommerceOverview | null>(null), [error, setError] = useState("");
  const [wallet, setWallet] = useState(false), [bucket, setBucket] = useState<string | null>(null), [order, setOrder] = useState<number | null>(null);
  const [topupId, setTopupId] = useState<string | undefined>();
  const alive = useRef(true), pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return; pending.current = true;
    try { const data = await loadCommerce(); if (alive.current) { setOverview(data); setError(""); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Could not load your account overview."); }
    finally { pending.current = false; }
  }, []);
  useEffect(() => { alive.current = true; void refresh(); const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); }); return () => { alive.current = false; listener.remove(); }; }, [refresh]);
  useEffect(() => { if (commerceLink?.kind === "topup") { setTopupId(commerceLink.id); setWallet(true); } else if (commerceLink?.kind === "order") setOrder(Number(commerceLink.id)); if (commerceLink) onLinkHandled?.(); }, [commerceLink]);
  return <View style={{ gap: 16, marginBottom: 20 }}>
    <View style={c.hero}><View style={c.row}><Text style={c.label}>CPWALLET</Text><Pressable accessibilityLabel="Refresh balance and orders" onPress={() => void refresh()}><Text style={c.link}>Refresh</Text></Pressable></View><Text style={c.balance}>{overview ? formatIdr(Number(overview.wallet.balance)) : "—"}</Text><Text style={c.small}>{rateNote}</Text><CommerceButton label="Top up & balance activity" onPress={() => { setTopupId(undefined); setWallet(true); }} /><Text style={c.small}>Your marketplace balance. Approved refunds are returned here.</Text></View>
    <CurrencyChoice /><CommerceError value={error} />
    <View style={c.card}><View style={c.row}><Text style={c.title}>My orders</Text><Pressable onPress={() => setBucket("all")}><Text style={c.link}>View all ›</Text></Pressable></View><View style={c.progress}>{ORDER_STAGES.map(stage => <Pressable key={stage.key} style={{ flex: 1, gap: 8, alignItems: "center", paddingVertical: 12 }} onPress={() => setBucket(stage.key)}><Text style={c.heading}>{overview?.counts[stage.key] ?? "—"}</Text><Text style={[c.small, { textAlign: "center" }]}>{stage.label}</Text></Pressable>)}</View>
      {overview?.recentOrders.map(item => <Pressable key={item.id} onPress={() => setOrder(item.id)} style={{ gap: 8, paddingVertical: 12 }}><Text numberOfLines={2} style={c.text}>{item.product_title || item.product || "Order #" + item.id}</Text><View style={c.row}><Text style={c.small}>#{item.id}</Text><Text style={c.link}>{formatIdr(idrTotal(item))} ›</Text></View><OrderProgress status={item.status} /></Pressable>)}
      {overview && !overview.recentOrders.length ? <Text style={c.muted}>Your first order will appear here.</Text> : null}
    </View>
    {wallet ? <WalletScreen initialTopup={topupId} onClose={() => { setWallet(false); void refresh(); }} /> : null}
    {bucket !== null ? <OrdersList bucket={bucket} onOpen={id => { setBucket(null); setOrder(id); }} onClose={() => setBucket(null)} /> : null}
    {order ? <CommerceModal title={"Order #" + order} onClose={() => { setOrder(null); void refresh(); }}><OrderPayment key={order} orderId={order} onChanged={() => void refresh()} /></CommerceModal> : null}
  </View>;
}
function OrdersList({ bucket, onOpen, onClose }: { bucket: string; onOpen: (id: number) => void; onClose: () => void }) {
  const { formatIdr } = useCommerceCurrency();
  const [items, setItems] = useState<CommerceOrder[]>([]), [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const busy = useRef(false), alive = useRef(true);
  const load = async (before?: number) => {
    if (busy.current) return; busy.current = true; setLoading(true); setError("");
    try { const data = await loadOrders(bucket, before); if (alive.current) { setItems(old => before ? [...old, ...data.orders.filter(item => !old.some(row => row.id === item.id))] : data.orders); setCursor(data.nextCursor); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Could not load orders."); }
    finally { busy.current = false; if (alive.current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, [bucket]);
  return <CommerceModal title={ORDER_STAGES.find(stage => stage.key === bucket)?.label || "All orders"} onClose={onClose}><FlatList contentContainerStyle={c.page} data={items} keyExtractor={item => String(item.id)} initialNumToRender={8} windowSize={5} refreshing={loading} onRefresh={() => void load()} ListHeaderComponent={<CommerceError value={error} />} ListEmptyComponent={loading ? <CommerceLoading /> : <Text style={c.muted}>No orders in this stage.</Text>} renderItem={({ item }) => <Pressable style={c.card} onPress={() => onOpen(item.id)}><Text style={c.small}>#{item.id} · {new Date(item.created_at).toLocaleDateString()}</Text><Text style={c.title} numberOfLines={2}>{item.product_title || item.product || "Marketplace order"}</Text><Text style={c.link}>{formatIdr(idrTotal(item))} ›</Text><OrderProgress status={item.status} /></Pressable>} ListFooterComponent={cursor ? <CommerceButton label="Load more orders" secondary disabled={loading} onPress={() => void load(cursor)} /> : null} /></CommerceModal>;
}
