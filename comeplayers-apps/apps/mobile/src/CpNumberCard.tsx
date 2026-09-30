import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { profileCpNumber } from "@comeplayers/chat-core";
import { colors } from "./theme";

export function CpNumberCard({ value, onReload }: { value?: string | null; onReload?: () => void }) {
  const cpNumber = profileCpNumber({ cp_number: value });
  const [notice, setNotice] = useState("");
  useEffect(() => { setNotice(""); }, [cpNumber]);
  const copy = async () => {
    if (!cpNumber) return;
    try { await Clipboard.setStringAsync(cpNumber); setNotice("Nomor CP tersalin. Bagikan kepada teman untuk mulai chat."); }
    catch { setNotice("Belum bisa menyalin. Tekan lama nomor CP untuk menyalinnya."); }
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Nomor CP saya</Text>
    {cpNumber ? <><Text selectable accessibilityLabel={`Nomor CP ${cpNumber.split("").join(" ")}`} style={styles.number}>{cpNumber}</Text><Text style={styles.detail}>Identitas tetap Anda di ComePlayers. Bagikan nomor ini agar teman mudah menemukan Anda.</Text><Pressable accessibilityRole="button" accessibilityLabel="Salin nomor CP" onPress={() => { void copy(); }} style={styles.button}><Text style={styles.buttonText}>Salin nomor CP</Text></Pressable></> : <><Text style={styles.detail}>Nomor CP belum tersedia. Muat ulang profil untuk memeriksanya.</Text>{onReload ? <Pressable accessibilityRole="button" onPress={onReload} style={styles.button}><Text style={styles.buttonText}>Muat ulang profil</Text></Pressable> : null}</>}
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { alignSelf: "stretch", marginTop: 16, padding: 16, gap: 10, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 18 }, title: { color: colors.textMuted, fontSize: 15, fontWeight: "600" }, number: { color: colors.yellow, fontSize: 23, fontWeight: "800", letterSpacing: 1 }, detail: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, button: { minHeight: 48, alignItems: "center", justifyContent: "center", backgroundColor: colors.yellowSoft, borderRadius: 12, paddingHorizontal: 16 }, buttonText: { color: colors.yellow, fontSize: 16, fontWeight: "700" }, notice: { color: colors.green, fontSize: 14, lineHeight: 20 } });
