import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNotifications } from "./NotificationProvider";
import { colors } from "./theme";

export function NotificationPrompt() {
  const notifications = useNotifications();
  if (!notifications.showPrompt) return null;
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <View style={styles.copy}><Text style={styles.title}>Jangan lewatkan pesan dan panggilan</Text><Text style={styles.detail}>Aktifkan notifikasi agar ponsel memberi tahu saat ada kabar baru.</Text></View>
    <View style={styles.actions}><Pressable accessibilityRole="button" disabled={notifications.busy} onPress={() => { void notifications.enable(); }} style={styles.enable}><Text style={styles.enableText}>{notifications.busy ? "Menyiapkan…" : "Aktifkan"}</Text></Pressable><Pressable accessibilityRole="button" onPress={notifications.dismissPrompt} style={styles.later}><Text style={styles.detail}>Nanti</Text></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 16, gap: 12, backgroundColor: colors.panelStrong, borderTopWidth: 1, borderColor: colors.border }, copy: { gap: 5 }, title: { color: colors.text, fontSize: 16, fontWeight: "700" }, detail: { color: colors.textMuted, fontSize: 14, lineHeight: 20 }, actions: { flexDirection: "row", gap: 12 }, enable: { minHeight: 44, minWidth: 112, paddingHorizontal: 18, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: colors.yellow }, enableText: { color: colors.background, fontSize: 16, fontWeight: "700" }, later: { minHeight: 44, paddingHorizontal: 18, justifyContent: "center" } });
