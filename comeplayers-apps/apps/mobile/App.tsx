import "react-native-url-polyfill/auto";

import * as Updates from "expo-updates";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, BackHandler, Linking, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import type { ChatRoom } from "@comeplayers/chat-core";
import PlayStoreUpdates from "./modules/comeplayers-play-updates";
import { BottomTabs, BrandMark, ScreenHeader } from "./src/components";
import { cachedDeviceSession, supabase } from "./src/runtime";
import { colors } from "./src/theme";
import type { AppTab } from "./src/types";
const CommunityScreen = lazy(() => import("./src/screens/CommunityScreen").then(module => ({ default: module.CommunityScreen })));
import { ConversationScreen } from "./src/screens/ConversationScreen";
import { PrivateConversationScreen } from "./src/screens/PrivateConversationScreen";
const NewsScreen = lazy(() => import("./src/screens/NewsScreen").then(module => ({ default: module.NewsScreen })));
const MarketplaceScreen = lazy(() => import("./src/screens/MarketplaceScreen").then(module => ({ default: module.MarketplaceScreen })));
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { CallProvider } from "./src/CallProvider";
import { loadPreferences, type AccountPreferences } from "./src/messagingApi";
import { MfaChallenge } from "./src/screens/MfaChallenge";
import { MessageAlerts } from "./src/MessageAlerts";
import { InboxProvider } from "./src/InboxProvider";
import { PrivateProvider } from "./src/secure/PrivateProvider";
import { CommerceProvider } from "./src/CommerceProvider";
import { parseCommerceLink, type CommerceLink } from "./src/commercePolicy";
import { AccountSessionGuard } from "./src/AccountSessionGuard";
import { createMobileUpdateController, type MobileUpdateState } from "./src/mobileUpdates";

const UPDATE_RECHECK_INTERVAL_MS = 30 * 60 * 1000;
const PLAY_STORE_CHECK_TIMEOUT_MS = 20_000;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded the ${timeoutMs}ms timeout.`)), timeoutMs);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (reason) => { clearTimeout(timer); reject(reason); });
  });
}

async function checkPlayStoreBinaryUpdate() {
  if (__DEV__ || Platform.OS !== "android" || !PlayStoreUpdates) return;
  try {
    await withTimeout(PlayStoreUpdates.checkAndStartUpdateAsync(), PLAY_STORE_CHECK_TIMEOUT_MS, "Google Play update check");
  } catch (reason) {
    console.warn("[ComePlayers] Google Play update check unavailable:", reason);
  }
}

function NativeComePlayersApp() {
  const [commerceLink, setCommerceLink] = useState<CommerceLink | null>(null);
  useEffect(() => {
    const open = (url: string) => { const link = parseCommerceLink(url); if (link) { setCommerceLink(link); setRoom(null); setTab("profile"); } };
    void Linking.getInitialURL().then(url => { if (url) open(url); });
    const subscription = Linking.addEventListener("url", event => open(event.url));
    return () => subscription.remove();
  }, []);
  const [tab, setTab] = useState<AppTab>("messages");
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const [account, setAccount] = useState<AccountPreferences | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const refreshAccount = useCallback(() => { if (session) void loadPreferences().then(setAccount).catch(() => undefined); }, [session?.user.id]);
  useEffect(() => {
    let alive = true;
    setMfaRequired(false);
    if (session) {
      void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => { if (alive) setMfaRequired(data?.nextLevel === "aal2" && data.currentLevel !== "aal2"); });

    }
    return () => { alive = false; };
  }, [session?.access_token]);
  useEffect(() => {
    let alive = true; setAccount(null);
    if (session) void loadPreferences().then(data => { if (alive) setAccount(data); }).catch(() => undefined);
    return () => { alive = false; };
  }, [session?.user.id]);
  useEffect(() => {
    supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => { subscription.remove(); supabase.auth.stopAutoRefresh(); };
  }, []);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    void cachedDeviceSession().then(saved => {
      if (active && !authEventSeen) { setSession(saved); setAuthReady(true); }
    });
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch((reason) => {
        console.warn("[ComePlayers] Stored session could not be restored:", reason);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventSeen = true;
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) { setUnread(0); setRoom(null); }
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (room) { setRoom(null); return true; }
      if (tab !== "messages") { setTab("messages"); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [room, tab]);

  if (!authReady) {
    return <View style={styles.boot}><BrandMark /><Text style={styles.bootTitle}>Selamat datang di ComePlayers</Text><ActivityIndicator size="large" color={colors.yellow} style={styles.spinner} /><Text style={styles.bootMessage}>Menyiapkan akun Anda…</Text></View>;
  }

  if (!session) return <ProfileScreen session={null} />;
  if (mfaRequired) return <MfaChallenge onVerified={() => { setMfaRequired(false); refreshAccount(); }} />;

  const title = tab === "home" ? "Berita" : tab === "community" ? "Komunitas" : tab === "marketplace" ? "Toko" : tab === "messages" ? "Chat" : "Profil";
  const subtitle = tab === "community" ? "Temukan teman dan kegiatan bersama" : tab === "marketplace" ? "Belanja kebutuhan Anda" : tab === "home" ? "Kabar terbaru untuk Anda" : "Kelola akun Anda";
  const Conversation = room?.room_type === "group" ? ConversationScreen : PrivateConversationScreen;
  return <PrivateProvider key={`private:${session.user.id}`} userId={session.user.id} enabled={!(account?.phoneRequired && !account.phoneVerified)}><CommerceProvider key={session.user.id} userId={session.user.id}><InboxProvider key={session.user.id} userId={session.user.id} enabled={!mfaRequired && !(account?.phoneRequired && !account.phoneVerified)}><CallProvider session={session} account={account}>{room && session ? <Conversation key={room.id} room={room} session={session} onBack={() => setRoom(null)} onNavigate={next => { setRoom(null); setTab(next); }} onRead={() => setUnread((value) => Math.max(0, value - Number(room.unread_count || 0)))} /> : <View style={styles.app}>
    {tab !== "messages" ? <ScreenHeader title={title} subtitle={subtitle} /> : null}
    <View style={styles.content}><Suspense fallback={<ActivityIndicator style={{ padding: 30 }} color={colors.yellow} />}>
      {tab === "home" ? <NewsScreen /> : null}
      {tab === "community" ? <CommunityScreen session={session} onOpenRoom={setRoom} onNavigate={setTab} /> : null}
      {tab === "marketplace" ? <MarketplaceScreen session={session} onNavigate={setTab} /> : null}
      {tab === "messages" ? <MessagesScreen session={session} account={account} onOpenRoom={setRoom} onNavigate={setTab} onUnreadChange={setUnread} /> : null}
      {tab === "profile" ? <ProfileScreen session={session} commerceLink={commerceLink} onCommerceLinkHandled={() => setCommerceLink(null)} onAccountUpdated={refreshAccount} /> : null}
    </Suspense></View>
    <BottomTabs active={tab} onChange={(next) => { setRoom(null); setTab(next); }} unread={unread} />
  </View>}<MessageAlerts session={session} account={account} activeRoom={room?.id} onOpen={setRoom} onUnread={setUnread} /></CallProvider></InboxProvider></CommerceProvider></PrivateProvider>;
}

export default function App() {
  const { isUpdatePending } = Updates.useUpdates();
  const [update, setUpdate] = useState<MobileUpdateState>({ status: "idle" });
  const controller = useRef<ReturnType<typeof createMobileUpdateController> | null>(null);
  useEffect(() => {
    const current = createMobileUpdateController({
      isEnabled: !__DEV__ && Updates.isEnabled,
      checkForUpdateAsync: Updates.checkForUpdateAsync,
      fetchUpdateAsync: Updates.fetchUpdateAsync,
      reloadAsync: Updates.reloadAsync,
    }, setUpdate, { onError: error => console.warn("[ComePlayers] Pembaruan belum tersedia:", error) });
    controller.current = current;
    let lastCheck = 0;
    const check = () => {
      if (Date.now() - lastCheck < UPDATE_RECHECK_INTERVAL_MS) return;
      lastCheck = Date.now();
      // A slow Play Store response must not delay downloading a ready app update.
      void checkPlayStoreBinaryUpdate();
      void current.check();
    };
    check();
    const listener = AppState.addEventListener("change", state => { if (state === "active") check(); });
    return () => { listener.remove(); current.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { if (isUpdatePending) controller.current?.markPending(); }, [isUpdatePending]);
  const applyUpdate = () => Alert.alert("Terapkan pembaruan?", "Aplikasi akan dibuka ulang. Selesaikan pesan atau panggilan Anda terlebih dahulu.", [
    { text: "Nanti", style: "cancel" },
    { text: "Terapkan", onPress: () => { void controller.current?.apply(); } },
  ]);
  return <SafeAreaProvider><AccountSessionGuard /><StatusBar barStyle="light-content" backgroundColor={colors.background} /><SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}><NativeComePlayersApp />
    {update.status !== "idle" ? <View style={styles.updateNotice} accessibilityLiveRegion="polite"><View style={styles.updateCopy}><Text style={styles.updateTitle}>{update.status === "applying" ? "Membuka pembaruan…" : "Pembaruan siap"}</Text><Text style={styles.updateText}>{update.error || "Terapkan saat Anda sudah selesai menggunakan aplikasi."}</Text></View>{update.status === "applying" ? <ActivityIndicator color={colors.yellow} /> : <Pressable accessibilityRole="button" accessibilityLabel="Terapkan pembaruan ComePlayers" style={styles.updateButton} onPress={applyUpdate}><Text style={styles.updateButtonText}>Terapkan</Text></Pressable>}</View> : null}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, backgroundColor: colors.background },
  bootTitle: { marginTop: 9, color: colors.text, fontSize: 26, fontWeight: "900" },
  spinner: { marginTop: 27 },
  bootMessage: { maxWidth: 390, marginTop: 17, color: colors.textMuted, fontSize: 16, lineHeight: 24, textAlign: "center" },
  updateNotice: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  updateCopy: { flex: 1, gap: 4 },
  updateTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  updateText: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  updateButton: { minHeight: 48, minWidth: 88, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.yellow },
  updateButtonText: { color: colors.background, fontSize: 16, fontWeight: "700" },
});
