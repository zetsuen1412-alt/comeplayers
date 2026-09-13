import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius } from "./theme";
import type { AppTab } from "./types";

const TAB_META: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: "home", label: "News", icon: "▤" },
  { id: "community", label: "Community", icon: "◉" },
  { id: "messages", label: "Messages", icon: "▤" },
  { id: "marketplace", label: "Market", icon: "◆" },
  { id: "profile", label: "Profile", icon: "●" },
];

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow} accessibilityLabel="ComePlayers">
      <Image
        source={require("../assets/comeplayers-logo.png")}
        resizeMode="contain"
        style={compact ? styles.brandLogoCompact : styles.brandLogo}
      />
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <BrandMark compact />
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action || <View style={styles.onlineDot} />}
    </View>
  );
}

export function BottomTabs({
  active,
  onChange,
  unread = 0,
}: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  unread?: number;
}) {
  return (
    <View style={styles.tabBar}>
      {TAB_META.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.pressed,
            ]}
          >
            <View>
              {tab.id === "messages" ? <View style={{ width: 24, height: 20, marginTop: 4, marginBottom: 5, borderWidth: 2, borderRadius: 7, borderColor: selected ? colors.yellow : colors.textDim, alignItems: "center", justifyContent: "center" }}><Text style={{ color: selected ? colors.yellow : colors.textDim, fontSize: 12, lineHeight: 12 }}>•••</Text><View style={{ position: "absolute", left: 3, bottom: -5, width: 7, height: 7, borderLeftWidth: 2, borderColor: selected ? colors.yellow : colors.textDim, transform: [{skewY: "-35deg"}] }} /></View> : <Text style={[styles.tabIcon, selected && styles.tabIconSelected]}>{tab.icon}</Text>}
              {tab.id === "messages" && unread > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unread > 99 ? "99+" : unread}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Avatar({
  uri,
  name,
  size = 44,
  accent = "blue",
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  accent?: "blue" | "yellow";
}) {
  const initial = String(name || "C").trim().charAt(0).toUpperCase() || "C";
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri } as ImageSourcePropType} style={[styles.avatar, dimension]} />;
  }
  return (
    <View
      style={[
        styles.avatarFallback,
        dimension,
        accent === "yellow" ? styles.avatarYellow : styles.avatarBlue,
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: Math.max(12, size * 0.36) }]}>
        {initial}
      </Text>
    </View>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function StateBlock({
  loading,
  title,
  message,
  actionLabel,
  onAction,
}: {
  loading?: boolean;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateBlock}>
      {loading ? <ActivityIndicator color={colors.yellow} /> : <Text style={styles.stateIcon}>◎</Text>}
      <Text style={styles.stateTitle}>{title}</Text>
      {message ? <Text style={styles.stateMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={styles.stateButton} onPress={onAction}>
          <Text style={styles.stateButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  tone = "yellow",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "yellow" | "blue" | "neutral";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        tone === "blue" && styles.primaryBlue,
        tone === "neutral" && styles.primaryNeutral,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === "neutral" ? colors.text : colors.background} />
      ) : (
        <Text
          style={[
            styles.primaryButtonText,
            tone === "neutral" && styles.primaryNeutralText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = "USD"
): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "$0";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "IDR" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(currency === "IDR" ? 0 : 2)}`;
  }
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Schedule pending";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandLogo: { width: 132, height: 132, borderRadius: 66 },
  brandLogoCompact: { width: 42, height: 42, borderRadius: 21 },
  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,208,0,0.38)",
    backgroundColor: colors.yellowSoft,
  },
  brandBadgeCompact: { width: 38, height: 36, borderRadius: 12 },
  brandC: {
    color: colors.white,
    fontSize: 23,
    fontWeight: "900",
    fontStyle: "italic",
    letterSpacing: -7,
  },
  brandP: { color: colors.yellow, fontSize: 23, fontWeight: "900", fontStyle: "italic" },
  brandLetterCompact: { fontSize: 18 },
  brandWord: { color: colors.white, fontWeight: "900", fontSize: 17, letterSpacing: -0.5 },
  brandWordYellow: { color: colors.yellow },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(5,7,12,0.98)",
  },
  headerCopy: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  headerSubtitle: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  tabBar: {
    minHeight: 72,
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#070b12",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 15,
  },
  tabSelected: { backgroundColor: "rgba(255,208,0,0.08)" },
  tabIcon: { color: colors.textDim, fontSize: 22, lineHeight: 24, fontWeight: "900" },
  tabIconSelected: { color: colors.yellow },
  tabLabel: { color: colors.textDim, fontSize: 9, fontWeight: "800" },
  tabLabelSelected: { color: colors.text },
  tabBadge: {
    position: "absolute",
    right: -12,
    top: -5,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.red,
  },
  tabBadgeText: { color: colors.white, fontSize: 8, fontWeight: "900" },
  avatar: { backgroundColor: colors.panelStrong },
  avatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  avatarBlue: { backgroundColor: colors.blueSoft, borderColor: "rgba(39,183,255,0.45)" },
  avatarYellow: { backgroundColor: colors.yellowSoft, borderColor: "rgba(255,208,0,0.45)" },
  avatarInitial: { color: colors.text, fontWeight: "900" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionCopy: { flex: 1 },
  eyebrow: { color: colors.blue, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 3 },
  sectionAction: { color: colors.yellow, fontSize: 11, fontWeight: "900" },
  panel: {
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  stateBlock: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 40 },
  stateIcon: { color: colors.blue, fontSize: 32, fontWeight: "900" },
  stateTitle: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 10, textAlign: "center" },
  stateMessage: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: "center" },
  stateButton: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.yellow },
  stateButtonText: { color: colors.background, fontSize: 11, fontWeight: "900" },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: radius.medium,
    backgroundColor: colors.yellow,
  },
  primaryBlue: { backgroundColor: colors.blue },
  primaryNeutral: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panelStrong },
  primaryButtonText: { color: colors.background, fontSize: 13, fontWeight: "900" },
  primaryNeutralText: { color: colors.text },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});
