import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";
import { formatCurrency, Panel, SectionTitle, StateBlock } from "../components";
import { loadMarketplaceCategories, searchMarketplace } from "../api";
import { colors, radius } from "../theme";
import type { AppTab, MarketplaceCategory, MarketplaceProduct } from "../types";
import { CheckoutSheet } from "./CheckoutSheet";
import { ProductImage } from "../ProductImage";

export function MarketplaceScreen({ session, onNavigate }: {
  session: Session | null;
  onNavigate: (tab: AppTab) => void;
}) {
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [imagesOnly, setImagesOnly] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutTarget, setCheckoutTarget] = useState<MarketplaceProduct | null>(null);
  const cardWidth = Math.max(140, (width - 42) / 2);

  const search = useCallback(async (nextCategory = category, withImages = imagesOnly, append = false) => {
    const generation = ++requestId.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const result = await searchMarketplace(query, nextCategory, append ? nextCursor : null, withImages);
      if (generation !== requestId.current) return;
      setProducts(current => append ? [...current, ...result.products.filter(p => !current.some(c => c.id === p.id))] : result.products);
      setNextCursor(result.nextCursor);
    } catch (reason) {
      if (generation === requestId.current) setError(reason instanceof Error ? reason.message : "Marketplace is temporarily unavailable.");
    } finally {
      if (generation === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [category, query, imagesOnly, nextCursor]);

  useEffect(() => {
    let active = true;
    const generation = ++requestId.current;
    Promise.all([loadMarketplaceCategories(), searchMarketplace("")])
      .then(([availableCategories, result]) => {
        if (!active || generation !== requestId.current) return;
        setCategories(availableCategories);
        setProducts(result.products);
        setNextCursor(result.nextCursor);
      })
      .catch((reason) => {
        if (active && generation === requestId.current) setError(reason instanceof Error ? reason.message : "Marketplace is temporarily unavailable.");
      })
      .finally(() => { if (active && generation === requestId.current) setLoading(false); });
    return () => { active = false; requestId.current++; };
  }, []);

  const chooseCategory = (slug: string) => {
    setCategory(slug);
    void search(slug);
  };

  const startCheckout = (product: MarketplaceProduct) => {
    if (!session) {
      onNavigate("profile");
      return;
    }
    setCheckoutTarget(product);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>COMEPLAYERS MARKETPLACE</Text>
          <Text style={styles.heroTitle}>Find your next gaming upgrade.</Text>
          <Text style={styles.heroText}>Search by game, then narrow the results by product category. Checkout and supported payments stay inside the app.</Text>
        </View>
        <View style={styles.searchRow}>
          <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} placeholder="Search Dragon Nest, item, service..." placeholderTextColor={colors.textDim} style={styles.searchInput} returnKeyType="search" />
          <Pressable style={styles.searchButton} onPress={() => void search()}><Text style={styles.searchButtonText}>Search</Text></Pressable>
        </View>
        <View style={[styles.categoryRow, { flexDirection: "row" }]}>{([true, false] as const).map(value => <Pressable key={String(value)} disabled={loadingMore} onPress={() => { setImagesOnly(value); void search(category, value); }} style={[styles.categoryChip, imagesOnly === value && styles.categoryChipActive]}><Text style={[styles.categoryText, imagesOnly === value && styles.categoryTextActive]}>{value ? "With photos" : "All products"}</Text></Pressable>)}</View>
        <Text style={styles.filterLabel}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <Pressable onPress={() => chooseCategory("")} style={[styles.categoryChip, !category && styles.categoryChipActive]}>
            <Text style={[styles.categoryText, !category && styles.categoryTextActive]}>All</Text>
          </Pressable>
          {categories.map((item) => (
            <Pressable key={item.id} onPress={() => chooseCategory(item.slug)} style={[styles.categoryChip, category === item.slug && styles.categoryChipActive]}>
              <Text style={[styles.categoryText, category === item.slug && styles.categoryTextActive]}>{item.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <SectionTitle eyebrow="LIVE CATALOG" title={`${products.length} offers found`} />
        {loading ? <Panel><StateBlock loading title="Searching the marketplace" /></Panel> : error ? <Panel><StateBlock title="Unable to load offers" message={error} actionLabel="Try again" onAction={() => void search()} /></Panel> : products.length ? (
          <View style={styles.grid}>
            {products.map((product) => (
              <View key={product.id} style={[styles.card, { width: cardWidth }]}>
                <ProductImage uri={product.image_url} />
                <View style={styles.copy}>
                  <View style={styles.tagRow}><Text style={styles.tag}>{product.game_name || product.category || "Gaming"}</Text>{typeof product.stock === "number" ? <Text style={styles.stock}>{product.stock} left</Text> : null}</View>
                  <Text style={styles.title} numberOfLines={2}>{product.title}</Text>
                  <Text style={styles.seller} numberOfLines={1}>{product.seller_name || "Verified ComePlayers seller"}</Text>
                  <Text style={styles.price}>{formatCurrency(product.price, "USD")}</Text>
                  <Pressable style={styles.buyButton} onPress={() => startCheckout(product)}><Text style={styles.buyButtonText}>{session ? "Buy in app" : "Sign in to buy"}</Text></Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : <Panel><StateBlock title="No matching offers" message="Try another game or choose a different category." /></Panel>}
        {nextCursor && !loading ? <Pressable disabled={loadingMore} style={[styles.buyButton, { marginTop: 16 }]} onPress={() => void search(category, imagesOnly, true)}><Text style={styles.buyButtonText}>{loadingMore ? "Loading..." : "Load more products"}</Text></Pressable> : null}
        <Text style={styles.securityNote}>Orders and payment status use the same protected ComePlayers account as the website.</Text>
      </ScrollView>
      <CheckoutSheet product={checkoutTarget} onClose={() => setCheckoutTarget(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 35, backgroundColor: colors.background },
  hero: { padding: 22, borderRadius: 25, borderWidth: 1, borderColor: "rgba(255,208,0,.28)", backgroundColor: "#151507" },
  kicker: { color: colors.yellow, fontSize: 9, fontWeight: "900", letterSpacing: 1.8 },
  heroTitle: { marginTop: 8, color: colors.text, fontSize: 29, lineHeight: 33, fontWeight: "900" },
  heroText: { marginTop: 10, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  searchInput: { flex: 1, height: 50, paddingHorizontal: 15, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.panel },
  searchButton: { minWidth: 82, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: colors.yellow },
  searchButtonText: { color: colors.background, fontSize: 11, fontWeight: "900" },
  filterLabel: { marginTop: 14, color: colors.textDim, fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  categoryRow: { gap: 7, paddingVertical: 10, paddingRight: 18 },
  categoryChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  categoryChipActive: { borderColor: "rgba(255,208,0,.6)", backgroundColor: colors.yellowSoft },
  categoryText: { color: colors.textMuted, fontSize: 9, fontWeight: "800" },
  categoryTextActive: { color: colors.yellow },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { overflow: "hidden", borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  image: { width: "100%", aspectRatio: 1.25, backgroundColor: colors.panelStrong },
  placeholder: { width: "100%", aspectRatio: 1.25, alignItems: "center", justifyContent: "center", backgroundColor: colors.yellowSoft },
  placeholderLogo: { width: "72%", height: "72%" },
  copy: { padding: 10 },
  tagRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  tag: { flex: 1, color: colors.blue, fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  stock: { color: colors.green, fontSize: 7, fontWeight: "800" },
  title: { minHeight: 36, marginTop: 5, color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: "900" },
  seller: { marginTop: 5, color: colors.textMuted, fontSize: 8 },
  price: { marginTop: 9, color: colors.yellow, fontSize: 14, fontWeight: "900" },
  buyButton: { alignItems: "center", marginTop: 10, paddingVertical: 10, borderRadius: radius.small, borderWidth: 1, borderColor: "rgba(255,208,0,.35)", backgroundColor: colors.yellowSoft },
  buyButtonText: { color: colors.yellow, fontSize: 8, fontWeight: "900" },
  securityNote: { marginTop: 17, paddingHorizontal: 12, color: colors.textDim, fontSize: 9, lineHeight: 14, textAlign: "center" },
});
