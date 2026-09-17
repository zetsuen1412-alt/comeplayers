import type { ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import { COMMERCE_CURRENCIES, ORDER_STAGES, orderStage } from "../commercePolicy";
import { useCommerceCurrency } from "../CommerceProvider";
export function CommerceModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Modal animationType="slide" onRequestClose={onClose}><View style={c.root}><View style={c.header}><Text style={c.heading}>{title}</Text><Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={12}><Text style={c.link}>Done</Text></Pressable></View>{children}</View></Modal>;
}
export function CommerceButton({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[c.button, secondary && c.secondary, disabled && { opacity: .45 }]}><Text style={[c.buttonText, secondary && { color: colors.text }]}>{label}</Text></Pressable>;
}
export function CommerceError({ value }: { value: string }) { return value ? <Text accessibilityRole="alert" style={c.error}>{value}</Text> : null; }
export function CommerceLoading() { return <ActivityIndicator style={{ padding: 24 }} color={colors.yellow} />; }
export function CurrencyChoice() {
  const { currency, setCurrency } = useCommerceCurrency();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={c.chips}>{COMMERCE_CURRENCIES.map(code => <Pressable key={code} accessibilityRole="button" accessibilityState={{ selected: currency === code }} onPress={() => setCurrency(code)} style={[c.chip, currency === code && c.chipActive]}><Text style={c.text}>{code}</Text></Pressable>)}</ScrollView>;
}
export function OrderProgress({ status }: { status: string }) {
  const stage = orderStage(status), current = ORDER_STAGES.findIndex(s => s.key === stage);
  if (current < 0) return <Text style={c.muted}>{status}</Text>;
  return <View style={c.progress}>{ORDER_STAGES.map((item, index) => <View key={item.key} style={c.step}><View style={[c.stepLine, index <= current && { backgroundColor: colors.green }]} /><Text style={[c.small, index === current && { color: colors.green, fontWeight: "700" }]}>{item.label}</Text></View>)}</View>;
}
export const c = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: 16 },
  header: { padding: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  page: { padding: 18, gap: 14, paddingBottom: 38 }, card: { padding: 18, borderRadius: 20, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, gap: 12 },
  hero: { padding: 22, borderRadius: 22, backgroundColor: "#16251f", borderWidth: 1, borderColor: "#2d5c46", gap: 12 },
  heading: { color: colors.text, fontSize: 22, fontWeight: "700" }, title: { color: colors.text, fontSize: 17, fontWeight: "700" }, text: { color: colors.text, fontSize: 14, lineHeight: 21 },
  balance: { color: colors.text, fontSize: 31, fontWeight: "800" }, muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 }, small: { color: colors.textDim, fontSize: 11, lineHeight: 17 },
  link: { color: colors.yellow, fontSize: 14, fontWeight: "700" }, label: { color: colors.blue, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  button: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: colors.yellow, alignItems: "center", justifyContent: "center" },
  secondary: { backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.background, fontSize: 14, fontWeight: "700", textAlign: "center" }, error: { color: colors.red, fontSize: 13, lineHeight: 20, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, input: { color: colors.text, padding: 14, minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, fontSize: 18, backgroundColor: colors.background },
  chips: { gap: 8, paddingVertical: 8 }, chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, chipActive: { borderColor: colors.yellow, backgroundColor: colors.yellowSoft },
  progress: { flexDirection: "row", gap: 5, marginTop: 8 }, step: { flex: 1, gap: 5 }, stepLine: { height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
});
