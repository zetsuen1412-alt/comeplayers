import { useEffect, useState } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { apiUrl } from "./runtime";
import { colors } from "./theme";

export function ProductImage({ uri, style }: { uri?: string | null; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  let source = "";
  try {
    const url = new URL(uri || "", apiUrl);
    if (uri && url.protocol === "https:" && !/placehold\.co|\.svg(?:$|\?)/i.test(url.href)) source = url.href;
  } catch { /* Render the bundled fallback for malformed catalog URLs. */ }
  return <View style={[styles.frame, style]}>{source && !failed
    ? <Image accessibilityLabel="Product image" source={{ uri: source }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
    : <Image accessibilityLabel="ComePlayers product" source={require("../assets/comeplayers-logo.png")} style={styles.fallback} resizeMode="contain" />}</View>;
}
const styles = StyleSheet.create({ frame: { width: "100%", aspectRatio: 1.25, backgroundColor: colors.panelStrong, alignItems: "center", justifyContent: "center" }, fallback: { width: "60%", height: "60%" } });
