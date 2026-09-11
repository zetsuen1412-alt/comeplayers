"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaArrowRotateRight,
  FaCheck,
  FaComments,
  FaCompress,
  FaExpand,
  FaFloppyDisk,
  FaGamepad,
  FaGlobe,
  FaPaperPlane,
  FaShieldHalved,
  FaTowerObservation,
  FaUserPlus,
  FaUsers,
  FaXmark,
} from "react-icons/fa6";
import {
  authenticatedFetchJson,
} from "@/lib/authenticatedFetch";

type Profile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type SocialFriend = {
  relationId: string;
  profile: Profile;
  relationshipStatus: string;
  requestDirection: "incoming" | "outgoing";
  gameStatus: "online" | "playing" | "offline";
  worldName?: string | null;
  level: number;
};

type GameInvite = {
  id: string;
  direction: "incoming" | "outgoing";
  profile: Profile;
  expiresAt: string;
};

type OnlinePlayer = {
  profile: Profile;
  gameStatus: "online" | "playing" | "offline";
  worldName?: string | null;
  level: number;
  isFriend: boolean;
};

type SocialResponse = {
  friends: SocialFriend[];
  incomingFriendRequests: SocialFriend[];
  outgoingFriendRequests: SocialFriend[];
  incomingInvites: GameInvite[];
  outgoingInvites: GameInvite[];
  onlinePlayers: OnlinePlayer[];
};

type LaunchResponse = {
  launchUrl: string;
  expiresAt: string;
  playerName: string;
  friendCount: number;
  friendIds: string[];
};

type ChatMessage = {
  id: string;
  sender_id: string;
  message?: string | null;
  created_at: string;
};

type ChatState = {
  roomId: string;
  profile: Profile;
  messages: ChatMessage[];
  draft: string;
  loading: boolean;
  sending: boolean;
  error: string;
};

type LaunchState = "idle" | "loading" | "ready" | "error";
type SocialTab = "friends" | "invites" | "players";

const EMPTY_SOCIAL: SocialResponse = {
  friends: [],
  incomingFriendRequests: [],
  outgoingFriendRequests: [],
  incomingInvites: [],
  outgoingInvites: [],
  onlinePlayers: [],
};

function profileName(profile?: Profile | null) {
  return (
    String(profile?.username || "").trim() ||
    String(profile?.full_name || "").trim() ||
    "ComePlayers User"
  );
}

function initials(profile?: Profile | null) {
  return profileName(profile).slice(0, 1).toUpperCase();
}

function Avatar({ profile, status }: { profile: Profile; status?: string }) {
  const avatar = String(profile.avatar_url || "").trim();
  return (
    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#143149] text-xs font-black text-cyan-100">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(profile)
      )}
      {status ? (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#071522] ${
            status === "playing"
              ? "bg-yellow-300"
              : status === "online"
                ? "bg-emerald-400"
                : "bg-slate-500"
          }`}
        />
      ) : null}
    </span>
  );
}

export default function EmpiresAlliesGame() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [launchState, setLaunchState] = useState<LaunchState>("idle");
  const [launchUrl, setLaunchUrl] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [friendCount, setFriendCount] = useState(0);
  const [launchedFriendIds, setLaunchedFriendIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [socialOpen, setSocialOpen] = useState(true);
  const [socialTab, setSocialTab] = useState<SocialTab>("friends");
  const [social, setSocial] = useState<SocialResponse>(EMPTY_SOCIAL);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialLoaded, setSocialLoaded] = useState(false);
  const [socialError, setSocialError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [chat, setChat] = useState<ChatState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const requestLaunch = useCallback(async () => {
    setLaunchState("loading");
    setError("");
    try {
      const response = await authenticatedFetchJson<LaunchResponse>(
        "/api/games/empires-allies/ticket",
        {
          method: "POST",
          body: JSON.stringify({ source: "messages-arcade" }),
        },
      );
      setLaunchUrl(response.launchUrl);
      setPlayerName(response.playerName);
      setFriendCount(response.friendCount || 0);
      setLaunchedFriendIds((response.friendIds || []).map(String).sort());
      setReloadKey((current) => current + 1);
      setLaunchState("ready");
    } catch (launchError) {
      setError(
        launchError instanceof Error
          ? launchError.message
          : "CP Empires & Allies could not be started.",
      );
      setLaunchState("error");
    }
  }, []);

  const loadSocial = useCallback(async (silent = false) => {
    if (!silent) setSocialLoading(true);
    try {
      const response = await authenticatedFetchJson<SocialResponse>(
        "/api/games/empires-allies/social",
      );
      setSocial(response);
      setSocialLoaded(true);
      setSocialError("");
    } catch (loadError) {
      if (!silent) {
        setSocialError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load online players.",
        );
      }
    } finally {
      if (!silent) setSocialLoading(false);
    }
  }, []);

  const heartbeat = useCallback(async () => {
    try {
      await authenticatedFetchJson("/api/games/empires-allies/social", {
        method: "POST",
        body: JSON.stringify({
          action: "heartbeat",
          status: "playing",
          worldName: playerName ? `${playerName} Empire` : "",
        }),
      });
    } catch {
      // Presence is best-effort and must not interrupt the game.
    }
  }, [playerName]);

  useEffect(() => {
    void requestLaunch();
    void loadSocial();
  }, [loadSocial, requestLaunch]);

  useEffect(() => {
    void heartbeat();
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 30_000);
    const socialTimer = window.setInterval(() => void loadSocial(true), 20_000);
    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(socialTimer);
    };
  }, [heartbeat, loadSocial]);

  const acceptedFriendKey = useMemo(
    () => social.friends.map((friend) => String(friend.profile.id)).sort().join(","),
    [social.friends],
  );
  const launchedFriendKey = launchedFriendIds.join(",");

  useEffect(() => {
    if (launchState !== "ready" || socialLoading || !socialLoaded) return;
    if (acceptedFriendKey === launchedFriendKey) return;
    const frame = window.requestAnimationFrame(() => void requestLaunch());
    return () => window.cancelAnimationFrame(frame);
  }, [
    acceptedFriendKey,
    launchState,
    launchedFriendKey,
    requestLaunch,
    socialLoaded,
    socialLoading,
  ]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const loadChat = useCallback(async (roomId: string, profile: Profile) => {
    setChat((current) =>
      current && current.roomId === roomId
        ? { ...current, loading: true, error: "" }
        : {
            roomId,
            profile,
            messages: [],
            draft: "",
            loading: true,
            sending: false,
            error: "",
          },
    );
    try {
      const response = await authenticatedFetchJson<{ messages: ChatMessage[] }>(
        `/api/messages/rooms/${roomId}?limit=50`,
      );
      setChat((current) =>
        current && current.roomId === roomId
          ? { ...current, messages: response.messages || [], loading: false }
          : current,
      );
    } catch (chatError) {
      setChat((current) =>
        current && current.roomId === roomId
          ? {
              ...current,
              loading: false,
              error:
                chatError instanceof Error
                  ? chatError.message
                  : "Unable to load chat.",
            }
          : current,
      );
    }
  }, []);

  useEffect(() => {
    if (!chat?.roomId) return;
    const timer = window.setInterval(
      () => void loadChat(chat.roomId, chat.profile),
      5_000,
    );
    return () => window.clearInterval(timer);
  }, [chat?.profile, chat?.roomId, loadChat]);

  async function socialAction(
    action: string,
    payload: Record<string, unknown>,
    success: string,
    reloadGameAfter = false,
  ) {
    setBusy(`${action}:${String(payload.targetUserId || payload.inviteId || "")}`);
    setSocialError("");
    try {
      await authenticatedFetchJson("/api/games/empires-allies/social", {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });
      setNotice(success);
      await loadSocial(true);
      if (reloadGameAfter) await requestLaunch();
    } catch (actionError) {
      setSocialError(
        actionError instanceof Error ? actionError.message : "Action failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function openChat(profile: Profile) {
    setBusy(`chat:${profile.id}`);
    try {
      const response = await authenticatedFetchJson<{ roomId: string }>(
        `/api/messages/friends/${profile.id}/chat`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSocialOpen(true);
      await loadChat(response.roomId, profile);
    } catch (chatError) {
      setSocialError(
        chatError instanceof Error ? chatError.message : "Unable to open chat.",
      );
    } finally {
      setBusy("");
    }
  }

  async function sendChat() {
    const message = String(chat?.draft || "").trim();
    if (!chat || !message || chat.sending) return;
    setChat({ ...chat, sending: true, error: "" });
    try {
      await authenticatedFetchJson(`/api/messages/rooms/${chat.roomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setChat((current) => (current ? { ...current, draft: "", sending: false } : null));
      await loadChat(chat.roomId, chat.profile);
    } catch (sendError) {
      setChat((current) =>
        current
          ? {
              ...current,
              sending: false,
              error:
                sendError instanceof Error
                  ? sendError.message
                  : "Unable to send message.",
            }
          : null,
      );
    }
  }

  function reloadGame() {
    if (!launchUrl) {
      void requestLaunch();
      return;
    }
    setReloadKey((current) => current + 1);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === shellRef.current) {
        await document.exitFullscreen();
        return;
      }
      setSocialOpen(false);
      await shellRef.current?.requestFullscreen();
    } catch {
      // Browser or app webview can reject fullscreen.
    }
  }

  const pendingCount =
    social.incomingFriendRequests.length + social.incomingInvites.length;
  const onlineFriendCount = useMemo(
    () => social.friends.filter((friend) => friend.gameStatus !== "offline").length,
    [social.friends],
  );

  return (
    <div
      ref={shellRef}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-yellow-300/25 bg-[#02070d] shadow-[0_24px_90px_rgba(0,0,0,0.65),0_0_42px_rgba(250,204,21,0.07)] [&:fullscreen]:h-[100dvh] [&:fullscreen]:w-screen [&:fullscreen]:rounded-none"
    >
      <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[linear-gradient(90deg,rgba(250,204,21,0.13),rgba(6,24,38,0.94)_35%,rgba(34,211,238,0.08))] px-3 py-2 sm:px-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-300/30 bg-yellow-300/10 text-yellow-200">
          <FaTowerObservation />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white sm:text-base">
            CP Empires &amp; Allies
          </p>
          <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300/80">
            Shared ComePlayers world
            {playerName ? ` • ${playerName}` : ""}
            {friendCount ? ` • ${friendCount} allies synced` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <span
            className="hidden h-9 items-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-200 md:flex"
            title="Every successful game action is saved to your ComePlayers empire"
          >
            <FaFloppyDisk /> Autosave
          </span>
          <button
            type="button"
            onClick={() => setSocialOpen((value) => !value)}
            className="relative flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20"
            title="ComePlayers friends and game invitations"
          >
            <FaUsers />
            <span className="hidden sm:inline">{onlineFriendCount} online</span>
            {pendingCount ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-yellow-300 px-1 text-[10px] text-black">
                {pendingCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={reloadGame}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200"
            title="Reload game and sync new friends"
          >
            <FaArrowRotateRight />
          </button>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-yellow-300/40 hover:text-yellow-200"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen game"}
            aria-label={isFullscreen ? "Exit fullscreen game" : "Enter fullscreen game"}
          >
            {isFullscreen ? <FaCompress /> : <FaExpand />}
          </button>
          {launchUrl ? (
            <button
              type="button"
              onClick={() => window.open(launchUrl, "_blank", "noopener,noreferrer")}
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-200 sm:flex"
              title="Open in a separate window"
            >
              <FaGlobe />
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_15%,rgba(34,211,238,0.12),transparent_38%),linear-gradient(180deg,#071522,#02070d)]">
        <div className="relative min-h-0 min-w-0 flex-1">
          {launchState === "ready" && launchUrl ? (
            <iframe
              key={`${launchUrl}:${reloadKey}`}
              ref={frameRef}
              src={launchUrl}
              title="CP Empires & Allies"
              className="absolute inset-0 h-full min-h-0 w-full border-0 bg-black"
              allow="autoplay; fullscreen; clipboard-read; clipboard-write"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto p-5 sm:p-8">
              <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#07131f]/90 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-9">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-yellow-300/35 bg-yellow-300/10 text-3xl text-yellow-200 shadow-[0_0_42px_rgba(250,204,21,0.13)]">
                  {launchState === "loading" ? (
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-yellow-200/25 border-t-yellow-200" />
                  ) : (
                    <FaShieldHalved />
                  )}
                </div>
                <p className="mt-6 text-2xl font-black text-white sm:text-3xl">
                  {launchState === "error"
                    ? "Online game server is not ready"
                    : "Connecting your empire"}
                </p>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
                  {launchState === "error"
                    ? error
                    : "ComePlayers is loading your persistent online empire and synchronizing accepted friends as allies."}
                </p>
                {launchState === "error" ? (
                  <button
                    type="button"
                    onClick={() => void requestLaunch()}
                    className="mt-6 rounded-xl bg-yellow-300 px-6 py-3 text-sm font-black text-black transition hover:bg-yellow-200"
                  >
                    Retry online connection
                  </button>
                ) : null}
                <div className="mt-7 grid gap-2 text-left sm:grid-cols-3">
                  {[
                    "Progress follows your ComePlayers account",
                    "Accepted friends appear as allied empires",
                    "Visit, tend and battle through shared saves",
                  ].map((label) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs font-bold text-slate-300"
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {socialOpen ? (
          <aside className="absolute inset-y-0 right-0 z-40 flex w-[min(360px,94vw)] flex-col border-l border-cyan-300/20 bg-[#06111d]/[0.98] shadow-[-25px_0_70px_rgba(0,0,0,0.65)] backdrop-blur-xl lg:relative lg:z-auto lg:w-[330px] lg:shrink-0">
            <div className="flex h-14 items-center gap-2 border-b border-white/10 px-3">
              {chat ? (
                <button
                  type="button"
                  onClick={() => setChat(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-300"
                >
                  <FaArrowLeft />
                </button>
              ) : (
                <FaGamepad className="text-yellow-200" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-white">
                  {chat ? profileName(chat.profile) : "Online Commanders"}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/70">
                  {chat ? "ComePlayers private chat" : "Friends • invites • players"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSocialOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:text-white"
              >
                <FaXmark />
              </button>
            </div>

            {chat ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                  {chat.loading && !chat.messages.length ? (
                    <p className="py-10 text-center text-xs text-slate-500">Loading chat…</p>
                  ) : null}
                  {chat.messages.map((message) => (
                    <div
                      key={message.id}
                      className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                    >
                      <p className="text-xs leading-5 text-slate-200">
                        {message.message || "Attachment"}
                      </p>
                      <p className="mt-1 text-[9px] text-slate-600">
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))}
                  {chat.error ? (
                    <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">
                      {chat.error}
                    </p>
                  ) : null}
                </div>
                <div className="border-t border-white/10 p-3">
                  <div className="flex gap-2">
                    <textarea
                      value={chat.draft}
                      onChange={(event) =>
                        setChat((current) =>
                          current ? { ...current, draft: event.target.value } : null,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendChat();
                        }
                      }}
                      placeholder="Message your ally…"
                      className="min-h-12 flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40"
                    />
                    <button
                      type="button"
                      onClick={() => void sendChat()}
                      disabled={chat.sending || !chat.draft.trim()}
                      className="flex w-12 items-center justify-center rounded-xl bg-cyan-300 text-[#03101a] disabled:opacity-40"
                    >
                      <FaPaperPlane />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 border-b border-white/10 p-2">
                  {([
                    ["friends", `Friends ${social.friends.length}`],
                    ["invites", `Invites ${pendingCount}`],
                    ["players", `Online ${social.onlinePlayers.length}`],
                  ] as const).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSocialTab(tab)}
                      className={`rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] ${
                        socialTab === tab
                          ? "bg-cyan-300 text-[#03101a]"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {notice ? (
                  <div className="mx-3 mt-3 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">
                    <FaCheck className="mt-0.5 shrink-0" />
                    <span className="flex-1">{notice}</span>
                    <button type="button" onClick={() => setNotice("")}>
                      <FaXmark />
                    </button>
                  </div>
                ) : null}
                {socialError ? (
                  <p className="mx-3 mt-3 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">
                    {socialError}
                  </p>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {socialLoading ? (
                    <p className="py-12 text-center text-xs text-slate-500">
                      Loading ComePlayers social data…
                    </p>
                  ) : null}

                  {socialTab === "friends" ? (
                    <div className="space-y-3">
                      {social.incomingFriendRequests.map((request) => (
                        <div
                          key={request.profile.id}
                          className="rounded-xl border border-yellow-300/20 bg-yellow-300/[0.06] p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar profile={request.profile} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-black text-white">
                                {profileName(request.profile)}
                              </p>
                              <p className="text-[10px] text-yellow-200">Friend request</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void socialAction(
                                  "friend_accept",
                                  { targetUserId: request.profile.id },
                                  `${profileName(request.profile)} is now your ally.`,
                                  true,
                                )
                              }
                              className="rounded-lg bg-yellow-300 px-2 py-2 text-[10px] font-black text-black"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void socialAction(
                                  "friend_decline",
                                  { targetUserId: request.profile.id },
                                  "Friend request declined.",
                                )
                              }
                              className="rounded-lg border border-white/10 px-2 py-2 text-[10px] font-black text-slate-300"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}

                      {social.friends.map((friend) => (
                        <div
                          key={friend.profile.id}
                          className="rounded-xl border border-white/10 bg-white/[0.035] p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar profile={friend.profile} status={friend.gameStatus} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-black text-white">
                                {profileName(friend.profile)}
                              </p>
                              <p className="truncate text-[10px] text-slate-400">
                                {friend.gameStatus === "playing"
                                  ? `Playing • ${friend.worldName || "Empire"}`
                                  : friend.gameStatus === "online"
                                    ? "Online on ComePlayers"
                                    : "Offline"}
                              </p>
                            </div>
                            {friend.level ? (
                              <span className="rounded-lg bg-yellow-300/10 px-2 py-1 text-[9px] font-black text-yellow-200">
                                LV {friend.level}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={busy === `invite:${friend.profile.id}`}
                              onClick={() =>
                                void socialAction(
                                  "invite",
                                  { targetUserId: friend.profile.id },
                                  `Game invitation sent to ${profileName(friend.profile)}.`,
                                )
                              }
                              className="flex items-center justify-center gap-1 rounded-lg bg-yellow-300 px-2 py-2 text-[10px] font-black text-black disabled:opacity-50"
                            >
                              <FaGamepad /> Invite
                            </button>
                            <button
                              type="button"
                              onClick={() => void openChat(friend.profile)}
                              className="flex items-center justify-center gap-1 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2 py-2 text-[10px] font-black text-cyan-100"
                            >
                              <FaComments /> Chat
                            </button>
                          </div>
                        </div>
                      ))}

                      {!social.friends.length &&
                      !social.incomingFriendRequests.length &&
                      !socialLoading ? (
                        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
                          <FaUserPlus className="mx-auto text-2xl text-slate-600" />
                          <p className="mt-3 text-xs font-black text-slate-300">
                            No allied commanders yet
                          </p>
                          <p className="mt-1 text-[10px] leading-5 text-slate-500">
                            Open the Online tab and add a ComePlayers user. Accepted
                            friends appear as neighbours after the game reloads.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {socialTab === "invites" ? (
                    <div className="space-y-3">
                      {social.incomingInvites.map((invite) => (
                        <div
                          key={invite.id}
                          className="rounded-xl border border-yellow-300/25 bg-yellow-300/[0.06] p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar profile={invite.profile} status="playing" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-black text-white">
                                {profileName(invite.profile)}
                              </p>
                              <p className="text-[10px] text-yellow-200">
                                Invited you to play
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void socialAction(
                                  "invite_accept",
                                  { inviteId: invite.id },
                                  "Invitation accepted. Your empire is connected.",
                                  true,
                                )
                              }
                              className="rounded-lg bg-yellow-300 px-2 py-2 text-[10px] font-black text-black"
                            >
                              Play now
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void socialAction(
                                  "invite_decline",
                                  { inviteId: invite.id },
                                  "Invitation declined.",
                                )
                              }
                              className="rounded-lg border border-white/10 px-2 py-2 text-[10px] font-black text-slate-300"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                      {social.outgoingInvites.map((invite) => (
                        <div
                          key={invite.id}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3"
                        >
                          <Avatar profile={invite.profile} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black text-white">
                              {profileName(invite.profile)}
                            </p>
                            <p className="text-[10px] text-slate-500">Waiting for response</p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void socialAction(
                                "invite_cancel",
                                { inviteId: invite.id },
                                "Invitation cancelled.",
                              )
                            }
                            className="rounded-lg border border-white/10 px-2 py-2 text-[10px] font-black text-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                      {!pendingCount && !socialLoading ? (
                        <p className="py-12 text-center text-xs text-slate-500">
                          No active game invitations.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {socialTab === "players" ? (
                    <div className="space-y-3">
                      {social.onlinePlayers.map((player) => (
                        <div
                          key={player.profile.id}
                          className="rounded-xl border border-white/10 bg-white/[0.035] p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar profile={player.profile} status={player.gameStatus} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-black text-white">
                                {profileName(player.profile)}
                              </p>
                              <p className="truncate text-[10px] text-slate-400">
                                {player.worldName || "ComePlayers Empire"}
                                {player.level ? ` • Level ${player.level}` : ""}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={player.isFriend || busy === `add_friend:${player.profile.id}`}
                            onClick={() =>
                              void socialAction(
                                "add_friend",
                                { targetUserId: player.profile.id },
                                player.isFriend
                                  ? "This commander is already your friend."
                                  : `Friend request sent to ${profileName(player.profile)}.`,
                              )
                            }
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[10px] font-black text-cyan-100 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-slate-500"
                          >
                            <FaUserPlus />
                            {player.isFriend ? "Already friends" : "Add friend"}
                          </button>
                        </div>
                      ))}
                      {!social.onlinePlayers.length && !socialLoading ? (
                        <p className="py-12 text-center text-xs text-slate-500">
                          No other commanders are online right now.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-white/10 p-3 text-[10px] leading-5 text-slate-500">
                  Accepted ComePlayers friends are synchronized automatically as
                  allied empires. Open an ally inside the game to visit, tend, or
                  attack them. Successful attack occupation events create a
                  ComePlayers bell notification for the defender.
                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
