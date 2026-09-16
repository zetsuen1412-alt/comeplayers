import "react-native-url-polyfill/auto";

import * as Updates from "expo-updates";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Platform, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import type { ChatRoom } from "@comeplayers/chat-core";
import PlayStoreUpdates from "./modules/comeplayers-play-updates";
import { BottomTabs, BrandMark, ScreenHeader } from "./src/components";
import { cachedDeviceSession, supabase } from "./src/runtime";
import { colors } from "./src/theme";
import type { AppTab } from "./src/types";
import { CommunityScreen } from "./src/screens/CommunityScreen";
import { ConversationScreen } from "./src/screens/ConversationScreen";
import { NewsScreen } from "./src/screens/NewsScreen";
import { MarketplaceScreen } from "./src/screens/MarketplaceScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { CallProvider } from "./src/CallProvider";
import { loadPreferences, type AccountPreferences } from "./src/messagingApi";
import { MfaChallenge } from "./src/screens/MfaChallenge";
import { MessageAlerts } from "./src/MessageAlerts";
import { InboxProvider } from "./src/InboxProvider";
import { AccountSessionGuard } from "./src/AccountSessionGuard";

type UpdateStage = "checking" | "downloading" | "applying" | "ready" | "warning";
type UpdateUi = { stage: UpdateStage; message: string; visible: boolean };

const UPDATE_RECHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 15_000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 90_000;
const PLAY_STORE_CHECK_TIMEOUT_MS = 20_000;

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded the ${timeoutMs}ms timeout.`)), timeoutMs);
    operation.then((value) => { clearTimeout(timer); resolve(value); }, (reason) => { clearTimeout(timer); reject(reason); });
  });
}

async function checkPlayStoreBinaryUpdate(setUi: (next: UpdateUi) => void, blocking: boolean) {
  if (__DEV__ || Platform.OS !== "android" || !PlayStoreUpdates) return;
  try {
    setUi({ stage: "checking", message: "Checking the latest Google Play release...", visible: blocking });
    await withTimeout(PlayStoreUpdates.checkAndStartUpdateAsync(), PLAY_STORE_CHECK_TIMEOUT_MS, "Google Play update check");
  } catch (reason) {
    console.warn("[ComePlayers] Google Play update check unavailable:", reason);
  }
}

async function checkAndApplyMobileUpdate(setUi: (next: UpdateUi) => void, blocking: boolean) {
  if (__DEV__ || !Updates.isEnabled) {
    if (blocking) setUi({ stage: "ready", message: "", visible: false });
    return;
  }
  try {
    setUi({ stage: "checking", message: "Checking for the latest ComePlayers update...", visible: blocking });
    const update = await withTimeout(Updates.checkForUpdateAsync(), UPDATE_CHECK_TIMEOUT_MS, "Expo update check");
    if (!update.isAvailable) { setUi({ stage: "ready", message: "", visible: false }); return; }
    setUi({ stage: "downloading", message: "Downloading the latest experience...", visible: blocking });
    await withTimeout(Updates.fetchUpdateAsync(), UPDATE_DOWNLOAD_TIMEOUT_MS, "Expo update download");
    if (!blocking) { setUi({ stage: "ready", message: "", visible: false }); return; }
    setUi({ stage: "applying", message: "Update ready. Reopening ComePlayers...", visible: true });
    await Updates.reloadAsync();
  } catch (reason) {
    console.warn("[ComePlayers] Mobile OTA update failed:", reason);
    setUi({ stage: "warning", message: "Update check failed. You can continue and the app will retry later.", visible: blocking });
  }
}

function NativeComePlayersApp() {
  const updateRunningRef = useRef(false);
  const lastUpdateCheckRef = useRef(0);
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
    setAccount(null); setMfaRequired(false);
    if (session) {
      void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => { if (alive) setMfaRequired(data?.nextLevel === "aal2" && data.currentLevel !== "aal2"); });
      void loadPreferences().then(data => { if (alive) setAccount(data); }).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [session?.access_token]);
  const [bootReady, setBootReady] = useState(true);
  const [updateUi, setUpdateUi] = useState<UpdateUi>({ stage: "ready", message: "", visible: false });

  const runUpdateCheck = useCallback(async (blocking: boolean) => {
    if (updateRunningRef.current) return;
    updateRunningRef.current = true;
    lastUpdateCheckRef.current = Date.now();
    try {
      await checkPlayStoreBinaryUpdate(setUpdateUi, blocking);
      await checkAndApplyMobileUpdate(setUpdateUi, blocking);
    } finally {
      updateRunningRef.current = false;
      if (blocking) setBootReady(true);
    }
  }, []);

  useEffect(() => { void runUpdateCheck(false); }, [runUpdateCheck]);
  useEffect(() => {
    supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
        if (Date.now() - lastUpdateCheckRef.current >= UPDATE_RECHECK_INTERVAL_MS) void runUpdateCheck(false);
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => { subscription.remove(); supabase.auth.stopAutoRefresh(); };
  }, [runUpdateCheck]);

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

  if (!bootReady || !authReady) {
    return <View style={styles.boot}><BrandMark /><Text style={styles.bootEyebrow}>NATIVE MOBILE EXPERIENCE</Text><Text style={styles.bootTitle}>Play. Trade. Connect.</Text><ActivityIndicator size="large" color={colors.yellow} style={styles.spinner} /><Text style={styles.bootMessage}>{!bootReady ? updateUi.message : "Connecting your ComePlayers account..."}</Text>{updateUi.stage === "warning" ? <Pressable style={styles.continueButton} onPress={() => setBootReady(true)}><Text style={styles.continueText}>Continue</Text></Pressable> : null}</View>;
  }

  if (!session) return <ProfileScreen session={null} />;
  if (mfaRequired) return <MfaChallenge onVerified={() => { setMfaRequired(false); refreshAccount(); }} />;

  const title = tab === "home" ? "News" : tab === "community" ? "Community" : tab === "marketplace" ? "Marketplace" : tab === "messages" ? "Messages" : "Your profile";
  const subtitle = session ? `Connected as ${session.user.email || "player"}` : "ComePlayers mobile";
  const Conversation = ConversationScreen;
  return <InboxProvider key={session.user.id} userId={session.user.id} enabled={!mfaRequired && !(account?.phoneRequired && !account.phoneVerified)}><CallProvider session={session} account={account}>{room && session ? <Conversation key={room.id} room={room} session={session} onBack={() => setRoom(null)} onNavigate={next => { setRoom(null); setTab(next); }} onRead={() => setUnread((value) => Math.max(0, value - Number(room.unread_count || 0)))} /> : <View style={styles.app}>
    {tab !== "messages" ? <ScreenHeader title={title} subtitle={subtitle} /> : null}
    <View style={styles.content}>
      {tab === "home" ? <NewsScreen /> : null}
      {tab === "community" ? <CommunityScreen session={session} onOpenRoom={setRoom} onNavigate={setTab} /> : null}
      {tab === "marketplace" ? <MarketplaceScreen session={session} onNavigate={setTab} /> : null}
      {tab === "messages" ? <MessagesScreen session={session} account={account} onOpenRoom={setRoom} onNavigate={setTab} onUnreadChange={setUnread} /> : null}
      {tab === "profile" ? <ProfileScreen session={session} onAccountUpdated={refreshAccount} /> : null}
    </View>
    <BottomTabs active={tab} onChange={(next) => { setRoom(null); setTab(next); }} unread={unread} />
    {updateUi.visible && updateUi.stage !== "ready" ? <View pointerEvents="none" style={styles.updateToast}><ActivityIndicator size="small" color={colors.yellow} /><Text style={styles.updateText}>{updateUi.message}</Text></View> : null}
  </View>}<MessageAlerts session={session} account={account} activeRoom={room?.id} onOpen={setRoom} onUnread={setUnread} /></CallProvider></InboxProvider>;
}

export default function App() {
  return <SafeAreaProvider><AccountSessionGuard /><StatusBar barStyle="light-content" backgroundColor={colors.background} /><SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}><NativeComePlayersApp /></SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, backgroundColor: colors.background },
  bootEyebrow: { marginTop: 5, color: colors.blue, fontSize: 10, fontWeight: "900", letterSpacing: 2.1 },
  bootTitle: { marginTop: 9, color: colors.text, fontSize: 26, fontWeight: "900" },
  spinner: { marginTop: 27 },
  bootMessage: { maxWidth: 390, marginTop: 17, color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  continueButton: { minWidth: 170, alignItems: "center", marginTop: 20, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.yellow },
  continueText: { color: colors.background, fontSize: 12, fontWeight: "900" },
  updateToast: { position: "absolute", bottom: 82, alignSelf: "center", maxWidth: "90%", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,208,0,.3)", backgroundColor: "rgba(5,7,12,.97)" },
  updateText: { flexShrink: 1, color: "#f3e6a6", fontSize: 9, fontWeight: "800" },
});
