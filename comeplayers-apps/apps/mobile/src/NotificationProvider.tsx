import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { Session } from "@supabase/supabase-js";
import { apiUrl, chatClient } from "./runtime";
import type { ChatRoom } from "@comeplayers/chat-core";
import { freshIncomingCall, notificationTarget, permissionGranted } from "./notificationPolicy";
import { useInbox } from "./InboxProvider";

export type NotificationStatus = "checking" | "ready" | "not-enabled" | "blocked" | "unavailable";
type NotificationContext = {
  status: NotificationStatus;
  busy: boolean;
  showPrompt: boolean;
  incomingCallSignal: number;
  setCallActive: (active: boolean) => void;
  enable: () => Promise<void>;
  dismissPrompt: () => void;
  openSettings: () => Promise<void>;
};
const Context = createContext<NotificationContext>({ status: "checking", busy: false, showPrompt: false, incomingCallSignal: 0, setCallActive: () => undefined, enable: async () => undefined, dismissPrompt: () => undefined, openSettings: async () => undefined });
export const useNotifications = () => useContext(Context);

let foregroundPolicy: { userId: string; enabled: boolean; messagesEnabled: boolean; activeRoom?: string; activeChannel?: string; callActive: boolean } | null = null;
// Direct messages/calls have their own foreground UI. The direct inbox excludes
// community channels, which use a native banner while a different room is open.
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const current = foregroundPolicy;
    const target = current ? notificationTarget(notification.request.content.data, current.userId) : null;
    const showGroup = !!current?.enabled && current.messagesEnabled && target?.type === "chat_message" && !!target.channelId && (target.roomId !== current.activeRoom || target.channelId !== current.activeChannel);
    return { shouldPlaySound: showGroup && !current?.callActive, shouldSetBadge: false, shouldShowBanner: showGroup, shouldShowList: showGroup };
  },
});

type Registration = { userId: string; token: string; accessToken: string };
let currentRegistration: Registration | null = null;
let tokenOperations: Promise<void> = Promise.resolve();

async function sendTokenRequest(registration: Registration, method: "POST" | "DELETE") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiUrl}/api/messages/push-tokens`, {
      method,
      headers: { Authorization: `Bearer ${registration.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expoPushToken: registration.token, platform: Platform.OS }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Notification registration was not saved.");
  } finally { clearTimeout(timeout); }
}

function tokenRequest(registration: Registration, method: "POST" | "DELETE") {
  // A slow registration from the previous account cannot overwrite a newer one.
  const operation = tokenOperations.catch(() => undefined).then(() => sendTokenRequest(registration, method));
  tokenOperations = operation.catch(() => undefined);
  return operation;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Notification setup timed out.")), timeoutMs);
    operation.then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
}

// Called before explicit sign-out, while its session is still available.
export async function unregisterDeviceNotifications() {
  const registration = currentRegistration;
  currentRegistration = null;
  if (registration) await tokenRequest(registration, "DELETE").catch(() => undefined);
  await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  await Notifications.setBadgeCountAsync(0).catch(() => undefined);
}

async function prepareChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Pesan baru", importance: Notifications.AndroidImportance.HIGH,
    sound: "comeplayers_message.wav", vibrationPattern: [0, 120], lightColor: "#ffd600",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.setNotificationChannelAsync("calls", {
    name: "Panggilan masuk", importance: Notifications.AndroidImportance.MAX,
    sound: "comeplayers_call.wav", vibrationPattern: [0, 500, 300, 500], lightColor: "#ffd600",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
  });
}

export function NotificationProvider({ session, enabled, unread, onOpen, activeRoom, activeChannel, messagesEnabled = true, children }: { session: Session; enabled: boolean; unread: number; activeRoom?: string; activeChannel?: string; messagesEnabled?: boolean; onOpen: (room: ChatRoom, channelId?: string) => void; children: ReactNode }) {
  const [status, setStatus] = useState<NotificationStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [incomingCallSignal, setIncomingCallSignal] = useState(0);
  const [callActive, setCallActive] = useState(false);
  const { reload } = useInbox();
  const sessionRef = useRef(session); sessionRef.current = session;
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const reloadRef = useRef(reload); reloadRef.current = reload;
  const registrationRef = useRef<Registration | null>(null);
  const syncRef = useRef<(ask: boolean) => Promise<void>>(async () => undefined);
  const promptKey = `comeplayers:notification-prompt:${session.user.id}`;
  useEffect(() => {
    const policy = { userId: session.user.id, enabled, messagesEnabled, activeRoom, activeChannel, callActive };
    foregroundPolicy = policy;
    return () => { if (foregroundPolicy === policy) foregroundPolicy = null; };
  }, [session.user.id, enabled, messagesEnabled, activeRoom, activeChannel, callActive]);

  useEffect(() => {
    let alive = true;
    let syncing = false;
    let pendingSync = false;
    let pendingAsk = false;
    const ownerId = session.user.id;
    const handled = new Set<string>();
    setStatus("checking"); setDismissed(true);
    void AsyncStorage.getItem(promptKey).then(value => { if (alive) setDismissed(value === "dismissed"); }).catch(() => undefined);

    const sync = async (ask: boolean) => {
      if (!alive || !enabled || AppState.currentState !== "active") return;
      // Native token/session refresh can arrive while permission or network I/O is pending.
      if (syncing) { pendingSync = true; pendingAsk ||= ask; return; }
      syncing = true; setBusy(true);
      try {
        await prepareChannels();
        let permission = await Notifications.getPermissionsAsync();
        if (ask && !permissionGranted(permission) && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
        if (!alive) return;
        if (!permissionGranted(permission)) {
          setStatus(permission.canAskAgain ? "not-enabled" : "blocked");
          const previous = registrationRef.current;
          registrationRef.current = null;
          if (currentRegistration?.userId === ownerId) currentRegistration = null;
          if (previous) await tokenRequest(previous, "DELETE").catch(() => undefined);
          return;
        }
        const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) throw new Error("Push project is not configured.");
        const { data: token } = await withTimeout(Notifications.getExpoPushTokenAsync({ projectId }), 15_000);
        if (!alive || sessionRef.current.user.id !== ownerId) return;
        const registration = { userId: ownerId, token, accessToken: sessionRef.current.access_token };
        const previous = registrationRef.current;
        await tokenRequest(registration, "POST");
        if (!alive) { await tokenRequest(registration, "DELETE").catch(() => undefined); return; }
        registrationRef.current = registration;
        currentRegistration = registration;
        if (previous && previous.token !== token) await tokenRequest(previous, "DELETE").catch(() => undefined);
        setStatus("ready");
      } catch { if (alive) setStatus("unavailable"); }
      finally {
        syncing = false;
        if (alive && pendingSync) {
          const askAgain = pendingAsk;
          pendingSync = false; pendingAsk = false;
          setBusy(false);
          void sync(askAgain);
        } else if (alive) setBusy(false);
      }
    };
    syncRef.current = sync;
    const received = Notifications.addNotificationReceivedListener(notification => {
      if (!alive || !enabled) return;
      const target = notificationTarget(notification.request.content.data, ownerId);
      if (!target) return;
      void reloadRef.current(true);
      if (freshIncomingCall(target)) setIncomingCallSignal(value => value + 1);
    });
    const tapped = async (response: Notifications.NotificationResponse | null) => {
      if (!alive || !enabled || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const notification = response.notification;
      if (handled.has(notification.request.identifier)) return;
      handled.add(notification.request.identifier);
      const target = notificationTarget(notification.request.content.data, ownerId);
      await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      if (!target) return;
      try {
        // Never trust a room title or membership from a notification payload.
        const conversation = await chatClient.getConversation(target.roomId, 20, { channelId: target.channelId });
        if (!alive || sessionRef.current.user.id !== ownerId) return;
        onOpenRef.current(conversation.room, target.channelId);
        if (freshIncomingCall(target)) setIncomingCallSignal(value => value + 1);
        void Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => undefined);
      } catch { /* A deleted/inaccessible conversation must not redirect another chat. */ }
    };
    const responses = Notifications.addNotificationResponseReceivedListener(response => { void tapped(response); });
    void Notifications.getLastNotificationResponseAsync().then(tapped).catch(() => undefined);
    const tokenChanges = Notifications.addPushTokenListener(() => { void sync(false); });
    const appState = AppState.addEventListener("change", state => { if (state === "active") void sync(false); });
    void sync(false);
    return () => {
      alive = false; received.remove(); responses.remove(); tokenChanges.remove(); appState.remove();
      const previous = registrationRef.current; registrationRef.current = null;
      if (currentRegistration?.userId === ownerId) currentRegistration = null;
      if (previous) void tokenRequest({ ...previous, accessToken: sessionRef.current.user.id === ownerId ? sessionRef.current.access_token : previous.accessToken }, "DELETE").catch(() => undefined);
    };
  }, [session.user.id, enabled, promptKey]);

  // A cached startup session may be refreshed after the first registration.
  useEffect(() => { void syncRef.current(false); }, [session.access_token]);
  useEffect(() => { if (status === "ready") void Notifications.setBadgeCountAsync(Math.max(0, unread)).catch(() => undefined); }, [unread, status]);
  const dismissPrompt = useCallback(() => { setDismissed(true); void AsyncStorage.setItem(promptKey, "dismissed").catch(() => undefined); }, [promptKey]);
  const enable = useCallback(async () => { await syncRef.current(true); }, []);
  const openSettings = useCallback(async () => { await Linking.openSettings(); }, []);
  return <Context.Provider value={{ status, busy, showPrompt: !dismissed && status === "not-enabled", incomingCallSignal, setCallActive, enable, dismissPrompt, openSettings }}>{children}</Context.Provider>;
}
