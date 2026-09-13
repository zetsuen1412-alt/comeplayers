import { useCallback, useEffect, useState } from "react";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { request } from "../api";
import { StateBlock } from "../components";
import { colors } from "../theme";

type Article = { id: number; title: string; summary: string | null; content: string; type: string; image_url: string | null; publish_at: string | null; created_at: string; is_pinned: boolean };
const plain = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
export function NewsScreen() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [active, setActive] = useState<Article | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { const data = await request<{ articles: Article[] }>("/api/news"); setArticles(data.articles); }
    catch { setError("Could not load news. Pull down to try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const visible = articles.filter(a => `${a.title} ${a.summary || ""} ${a.type}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={loading && !!articles.length} onRefresh={reload} tintColor={colors.yellow} />}>
      <Text style={styles.eyebrow}>THE LATEST FROM COMEPLAYERS</Text>
      <Text style={styles.title}>News & updates</Text>
      <Text style={styles.subtitle}>Announcements, events, and what’s new in your gaming community.</Text>
      <TextInput accessibilityLabel="Search news" value={query} onChangeText={setQuery} placeholder="Search news" placeholderTextColor={colors.textDim} style={styles.search} />
      {loading && !articles.length ? <StateBlock loading title="Loading news" /> : error ? <StateBlock title="News unavailable" message={error} actionLabel="Try again" onAction={reload} /> : !visible.length ? <StateBlock title={query ? "No matching news" : "You’re all caught up"} message="Published ComePlayers news will appear here." /> : visible.map(a => <Pressable key={a.id} style={styles.card} onPress={() => setActive(a)}>
        {a.image_url ? <Image source={{ uri: a.image_url }} style={styles.image} /> : null}
        <View style={styles.copy}><Text style={styles.eyebrow}>{a.is_pinned ? "PINNED · " : ""}{a.type.replace(/_/g, " ").toUpperCase()}</Text><Text style={styles.headline}>{a.title}</Text><Text style={styles.subtitle} numberOfLines={3}>{plain(a.summary || a.content)}</Text><Text style={styles.date}>{new Date(a.publish_at || a.created_at).toLocaleDateString()} · Read more →</Text></View>
      </Pressable>)}
    </ScrollView>
    <Modal visible={!!active} animationType="slide" onRequestClose={() => setActive(null)}><ScrollView contentContainerStyle={styles.page} style={{ backgroundColor: colors.background }}><Pressable accessibilityLabel="Close article" onPress={() => setActive(null)} style={styles.close}><Text style={styles.closeText}>‹ Back to News</Text></Pressable>{active?.image_url ? <Image source={{ uri: active.image_url }} style={styles.image} /> : null}<Text style={styles.title}>{active?.title}</Text><Text style={styles.body}>{plain(active?.content || "")}</Text></ScrollView></Modal>
  </>;
}
const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40, backgroundColor: colors.background },
  eyebrow: { color: colors.yellow, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 29, fontWeight: "800", marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  search: { borderRadius: 24, paddingHorizontal: 18, minHeight: 48, backgroundColor: colors.panel, color: colors.text, fontSize: 15, marginVertical: 20 },
  card: { borderRadius: 20, overflow: "hidden", backgroundColor: colors.panel, marginBottom: 18 },
  image: { width: "100%", aspectRatio: 1.9, backgroundColor: colors.panelStrong },
  copy: { padding: 18 }, headline: { color: colors.text, fontSize: 21, fontWeight: "700", marginTop: 8 },
  date: { color: colors.textDim, marginTop: 15, fontSize: 12 }, close: { paddingVertical: 24 }, closeText: { color: colors.yellow, fontSize: 16 },
  body: { color: colors.text, fontSize: 16, lineHeight: 26, marginTop: 20 },
});
