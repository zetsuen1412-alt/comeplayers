import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

/** Keep the failed action clear while retaining diagnostic details on request. */
export function ChatProblemNotice({ title, error, onRetry }: { title: string; error: string; onRetry: () => void }) {
  const [details, setDetails] = useState(false);
  return <View accessibilityLiveRegion="polite" style={styles.notice}>
    <Text accessibilityRole="alert" style={styles.title}>{title}</Text>
    <Text style={styles.copy}>Periksa koneksi internet, lalu coba lagi. Pesan yang sudah tersimpan tetap ada.</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Coba lagi</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)} style={styles.details}><Text style={styles.copy}>{details ? "Tutup rincian" : "Lihat rincian"}</Text></Pressable>
    </View>
    {details ? <Text selectable style={styles.copy}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  notice: { paddingHorizontal: 16, paddingVertical: 12, gap: 7, backgroundColor: colors.panel },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", lineHeight: 23 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  retry: { minHeight: 48, justifyContent: "center", paddingHorizontal: 18, borderRadius: 16, backgroundColor: colors.yellow },
  retryText: { color: colors.background, fontSize: 16, fontWeight: "700" },
  details: { minHeight: 48, justifyContent: "center" },
});
