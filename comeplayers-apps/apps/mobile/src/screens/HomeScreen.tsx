import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { formatCurrency, formatDate, Panel, SectionTitle, StateBlock } from "../components";
import { loadTournaments, searchMarketplace } from "../api";
import { colors, radius } from "../theme";
import type { AppTab, MarketplaceProduct, Tournament } from "../types";

export function HomeScreen({
  session,
  onNavigate,
}: {
  session: Session | null;
  onNavigate: (tab: AppTab) => void;
}) {
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const productCardWidth = Math.max(140, (width - 42) / 2);

  useEffect(() => {
    let active = true;
    Promise.all([searchMarketplace("game"), loadTournaments(Boolean(session))])
      .then(([market, competition]) => {
        if (!active) return;
        setProducts(market.products.slice(0, 4));
        setTournaments(competition.tournaments.slice(0, 3));
      })
      .catch((reason) => console.warn("[ComePlayers] Home feed unavailable:", reason))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [session]);

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.orbBlue} />
        <View style={styles.orbYellow} />
        <Text style={styles.kicker}>COMEPLAYERS MOBILE</Text>
        <Text style={styles.title}>Your gaming world, one native app.</Text>
        <Text style={styles.subtitle}>
          Discover trusted items, join tournaments, and stay connected with your squad.
        </Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.heroPrimary} onPress={() => onNavigate("community")}>
            <Text style={styles.heroPrimaryText}>Explore Community</Text>
          </Pressable>
          <Pressable style={styles.heroSecondary} onPress={() => onNavigate("marketplace")}>
            <Text style={styles.heroSecondaryText}>Open Marketplace</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric value="24/7" label="Protected chat" />
        <Metric value="LIVE" label="Community rooms" blue />
        <Metric value="SAFE" label="Escrow ready" />
      </View>

      <SectionTitle
        eyebrow="PLAY TOGETHER"
        title="Upcoming tournaments"
        actionLabel="View all"
        onAction={() => onNavigate("community")}
      />
      {loading ? (
        <Panel><StateBlock loading title="Loading arenas" /></Panel>
      ) : tournaments.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList}>
          {tournaments.map((item) => (
            <Pressable key={item.id} style={styles.tournamentCard} onPress={() => onNavigate("community")}>
              <Text style={styles.liveBadge}>{item.status === "live" ? "LIVE" : "OPEN"}</Text>
              <Text style={styles.cardGame}>{item.game_title}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>{formatDate(item.starts_at)}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.prize}>{formatCurrency(item.prize_pool, item.currency)}</Text>
                <Text style={styles.slots}>{item.participant_count}/{item.max_participants}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Panel><StateBlock title="No tournaments yet" message="New arenas will appear here." /></Panel>
      )}

      <SectionTitle
        eyebrow="TRUSTED MARKET"
        title="Fresh marketplace offers"
        actionLabel="Browse"
        onAction={() => onNavigate("marketplace")}
      />
      <View style={styles.productGrid}>
        {products.map((item) => (
          <Pressable key={item.id} style={[styles.productCard, { width: productCardWidth }]} onPress={() => onNavigate("marketplace")}>
            {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} /> : <View style={styles.productPlaceholder}><Image source={require("../../assets/comeplayers-logo.png")} style={styles.productPlaceholderLogo} resizeMode="contain" /></View>}
            <View style={styles.productCopy}>
              <Text style={styles.productGame}>{item.game_name || item.category || "Gaming"}</Text>
              <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.productPrice}>{formatCurrency(item.price, "USD")}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Panel style={styles.accountPanel}>
        <Image source={require("../../assets/comeplayers-logo.png")} style={styles.accountIcon} resizeMode="contain" />
        <View style={styles.accountCopy}>
          <Text style={styles.accountTitle}>{session ? "Your account is connected" : "Take ComePlayers everywhere"}</Text>
          <Text style={styles.accountText}>{session ? "Messages, tournaments, and marketplace activity stay synced with the website." : "Sign in once to sync your website and mobile experience."}</Text>
        </View>
        <Pressable onPress={() => onNavigate("profile")}><Text style={styles.accountAction}>{session ? "Profile" : "Sign in"}</Text></Pressable>
      </Panel>
    </ScrollView>
  );
}

function Metric({ value, label, blue = false }: { value: string; label: string; blue?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, blue && styles.metricBlue]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 34, backgroundColor: colors.background },
  hero: { overflow: "hidden", minHeight: 310, padding: 24, justifyContent: "flex-end", borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,208,0,.28)", backgroundColor: "#09111e" },
  orbBlue: { position: "absolute", width: 240, height: 240, left: -90, top: -100, borderRadius: 120, backgroundColor: "rgba(39,183,255,.20)" },
  orbYellow: { position: "absolute", width: 250, height: 250, right: -100, top: -70, borderRadius: 125, backgroundColor: "rgba(255,208,0,.17)" },
  kicker: { color: colors.blue, fontSize: 10, fontWeight: "900", letterSpacing: 2.2 },
  title: { maxWidth: 390, marginTop: 9, color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "900" },
  subtitle: { maxWidth: 410, marginTop: 12, color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  heroPrimary: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: radius.medium, backgroundColor: colors.yellow },
  heroPrimaryText: { color: colors.background, fontSize: 12, fontWeight: "900" },
  heroSecondary: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: "rgba(3,8,15,.5)" },
  heroSecondaryText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  metrics: { flexDirection: "row", gap: 8, marginVertical: 18 },
  metric: { flex: 1, minHeight: 78, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  metricValue: { color: colors.yellow, fontSize: 15, fontWeight: "900" },
  metricBlue: { color: colors.blue },
  metricLabel: { marginTop: 4, color: colors.textMuted, fontSize: 8, fontWeight: "700", textAlign: "center" },
  horizontalList: { gap: 10, paddingBottom: 23 },
  tournamentCard: { width: 238, minHeight: 170, padding: 17, borderRadius: radius.large, borderWidth: 1, borderColor: "rgba(39,183,255,.27)", backgroundColor: colors.panel },
  liveBadge: { alignSelf: "flex-start", color: colors.green, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  cardGame: { marginTop: 20, color: colors.blue, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  cardTitle: { marginTop: 5, color: colors.text, fontSize: 17, lineHeight: 21, fontWeight: "900" },
  cardMeta: { marginTop: 8, color: colors.textMuted, fontSize: 10 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  prize: { color: colors.yellow, fontSize: 12, fontWeight: "900" },
  slots: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 22 },
  productCard: { overflow: "hidden", borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  productImage: { width: "100%", aspectRatio: 1.45, backgroundColor: colors.panelStrong },
  productPlaceholder: { width: "100%", aspectRatio: 1.45, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft },
  productPlaceholderLogo: { width: "72%", height: "72%" },
  productCopy: { padding: 12 },
  productGame: { color: colors.blue, fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  productTitle: { minHeight: 34, marginTop: 4, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  productPrice: { marginTop: 9, color: colors.yellow, fontSize: 13, fontWeight: "900" },
  accountPanel: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15 },
  accountIcon: { width: 46, height: 46, borderRadius: 23 },
  accountCopy: { flex: 1 },
  accountTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  accountText: { marginTop: 3, color: colors.textMuted, fontSize: 9, lineHeight: 13 },
  accountAction: { color: colors.yellow, fontSize: 10, fontWeight: "900" },
});
