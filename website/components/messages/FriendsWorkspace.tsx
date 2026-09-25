"use client";
import { useLiveRefresh } from '@/lib/live/use-live-refresh';

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaArrowLeft,
  FaBell,
  FaCheck,
  FaChevronDown,
  FaCommentDots,
  FaEllipsisH,
  FaGamepad,
  FaInbox,
  FaPaperPlane,
  FaPlus,
  FaSearch,
  FaTimes,
  FaUsers,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";

type FriendProfile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type PresenceStatus = "online" | "away" | "offline";
type OwnPresenceStatus = PresenceStatus | "invisible";
type WorkspaceView = "friends" | "messages";
type FriendTab = "online" | "all" | "pending" | "add";

type FriendRow = {
  relationId?: string;
  profile: FriendProfile;
  relationshipStatus?: string;
  requestDirection?: "incoming" | "outgoing";
  presenceStatus: PresenceStatus;
  lastSeenAt?: string | null;
  roomId?: string | null;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};

type RecentChat = {
  roomId: string;
  profile: FriendProfile;
  presenceStatus: PresenceStatus;
  lastSeenAt?: string | null;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
};

type FriendsResponse = {
  friends: FriendRow[];
  incomingRequests: FriendRow[];
  outgoingRequests: FriendRow[];
  recentChats: RecentChat[];
  onlineCount: number;
  ownStatus: OwnPresenceStatus;
};

type ChatMessage = {
  id: string;
  room_id?: string;
  sender_id: string;
  receiver_id: string;
  message: string | null;
  created_at: string;
  deleted_at?: string | null;
  sender?: FriendProfile | null;
};

type ChatConversation = {
  room: {
    id: string;
    other?: FriendProfile | null;
  };
  messages: ChatMessage[];
};

type Props = {
  userId: string;
  active: boolean;
  friendMenuOpen: boolean;
  privateMessagesOpen: boolean;
  onCloseFriendMenu: () => void;
  onClosePrivateMessages: () => void;
  onUnreadChange?: (count: number) => void;
};

const EMPTY_DATA: FriendsResponse = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  recentChats: [],
  onlineCount: 0,
  ownStatus: "online",
};

function profileName(profile?: FriendProfile | null) {
  return (
    String(profile?.username || "").trim() ||
    String(profile?.full_name || "").trim() ||
    "ComePlayers User"
  );
}

function profileInitial(profile?: FriendProfile | null) {
  return profileName(profile).slice(0, 1).toUpperCase();
}

function statusLabel(status: OwnPresenceStatus) {
  if (status === "away") return "Away";
  if (status === "invisible") return "Invisible";
  if (status === "offline") return "Offline";
  return "Online";
}

function formatLastSeen(value?: string | null) {
  if (!value) return "Offline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Offline";
  return `Last seen ${date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function statusDotClass(status: PresenceStatus | OwnPresenceStatus) {
  if (status === "away") return "bg-yellow-400";
  if (status === "online") return "bg-emerald-400";
  return "bg-slate-500";
}

function Avatar({
  profile,
  status,
  size = "md",
}: {
  profile?: FriendProfile | null;
  status?: PresenceStatus;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dimension =
    size === "xl"
      ? "h-20 w-20 text-2xl"
      : size === "lg"
        ? "h-12 w-12 text-base"
        : size === "sm"
          ? "h-8 w-8 text-[10px]"
          : "h-10 w-10 text-xs";
  const avatarUrl = String(profile?.avatar_url || "").trim();
  const style: CSSProperties | undefined = avatarUrl
    ? { backgroundImage: `url("${avatarUrl.replace(/"/g, "%22")}")` }
    : undefined;

  return (
    <span className="relative shrink-0">
      <span
        className={`flex ${dimension} items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(145deg,#153452,#0a1b2f)] bg-cover bg-center font-black text-cyan-100 shadow-[inset_0_0_22px_rgba(34,211,238,0.06)]`}
        style={style}
      >
        {avatarUrl ? null : profileInitial(profile)}
      </span>
      {status ? (
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-[#10151f] ${statusDotClass(status)}`}
        />
      ) : null}
    </span>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] border border-cyan-300/20 bg-cyan-400/[0.07] text-3xl text-cyan-200 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
        <FaUsers />
      </div>
      <h3 className="text-lg font-black text-white">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export default function FriendsWorkspace({
  userId,
  active,
  friendMenuOpen,
  privateMessagesOpen,
  onCloseFriendMenu,
  onClosePrivateMessages,
  onUnreadChange,
}: Props) {
  const workspaceOpen = active && (friendMenuOpen || privateMessagesOpen);
  const [data, setData] = useState<FriendsResponse>(EMPTY_DATA);
  const [view, setView] = useState<WorkspaceView>("friends");
  const [friendTab, setFriendTab] = useState<FriendTab>("online");
  const [loading, setLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [friendSearch, setFriendSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [friendIdentifier, setFriendIdentifier] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<FriendProfile | null>(null);
  const [selectedPresence, setSelectedPresence] = useState<PresenceStatus>("offline");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const totalUnread = useMemo(
    () => data.recentChats.reduce((sum, chat) => sum + Number(chat.unreadCount || 0), 0),
    [data.recentChats],
  );

  useEffect(() => {
    onUnreadChange?.(totalUnread);
  }, [onUnreadChange, totalUnread]);

  useEffect(() => {
    if (friendMenuOpen) {
      setView("friends");
      setFriendTab("online");
    } else if (privateMessagesOpen) {
      setView("messages");
    }
  }, [friendMenuOpen, privateMessagesOpen]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!active || !userId) return null;
      if (!silent) setLoading(true);
      try {
        const response = await authenticatedFetchJson<FriendsResponse>(
          "/api/messages/friends",
        );
        setData(response);
        setError("");
        return response;
      } catch (loadError) {
        if (!silent) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load friends.",
          );
        }
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [active, userId],
  );

  const heartbeat = useCallback(
    async (status: OwnPresenceStatus = data.ownStatus) => {
      if (!active || !userId) return;
      try {
        await authenticatedFetchJson("/api/messages/friends", {
          method: "POST",
          body: JSON.stringify({ action: "heartbeat", status }),
        });
      } catch {
        // Presence is best-effort and must not block the messaging workspace.
      }
    },
    [active, data.ownStatus, userId],
  );

  useEffect(() => {
    if (!active || !userId) return;
    void loadData().then((response) => heartbeat(response?.ownStatus || "online"));
    const refreshTimer = window.setInterval(() => void loadData(true), 20_000);
    const heartbeatTimer = window.setInterval(() => void heartbeat(), 30_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [active, heartbeat, loadData, userId]);
  useLiveRefresh(async () => { await loadData(true); }, {topics:'account',enabled:active && !!userId});

  const loadConversation = useCallback(
    async (roomId: string) => {
      if (!roomId) return;
      setChatLoading(true);
      setError("");
      try {
        const conversation = await authenticatedFetchJson<ChatConversation>(
          `/api/messages/rooms/${roomId}?limit=100`,
        );
        setSelectedProfile((current) => conversation.room.other || current);
        setMessages(conversation.messages || []);
        await authenticatedFetchJson(`/api/messages/rooms/${roomId}/read`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        void loadData(true);
      } catch (chatError) {
        setError(
          chatError instanceof Error ? chatError.message : "Unable to load conversation.",
        );
      } finally {
        setChatLoading(false);
      }
    },
    [loadData],
  );

  useEffect(() => {
    if (!active || !userId) return;
    const channel = supabase
      .channel(`discord-friends-workspace-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          const roomId = String((payload.new as { room_id?: string }).room_id || "");
          void loadData(true);
          if (roomId && roomId === selectedRoomId) void loadConversation(roomId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, loadConversation, loadData, selectedRoomId, userId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedRoomId]);

  const filteredRecentChats = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return data.recentChats;
    return data.recentChats.filter((chat) =>
      [chat.profile.username, chat.profile.full_name, chat.lastMessage]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [conversationSearch, data.recentChats]);

  const filteredFriends = useMemo(() => {
    const query = friendSearch.trim().toLowerCase();
    const source =
      friendTab === "online"
        ? data.friends.filter((friend) => friend.presenceStatus === "online")
        : data.friends;
    if (!query) return source;
    return source.filter((friend) =>
      [friend.profile.username, friend.profile.full_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [data.friends, friendSearch, friendTab]);

  const activeNow = useMemo(
    () =>
      data.friends
        .filter((friend) => friend.presenceStatus !== "offline")
        .slice(0, 6),
    [data.friends],
  );

  function closeWorkspace() {
    onCloseFriendMenu();
    onClosePrivateMessages();
    setStatusMenuOpen(false);
  }

  async function changeStatus(status: OwnPresenceStatus) {
    setData((current) => ({ ...current, ownStatus: status }));
    setStatusMenuOpen(false);
    await heartbeat(status);
    setNotice(`Status changed to ${statusLabel(status)}.`);
  }

  async function addFriend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const identifier = friendIdentifier.trim();
    if (!identifier) {
      setError("Enter a username or email address.");
      return;
    }
    setActionBusy("add");
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetchJson<{
        alreadyFriends?: boolean;
        accepted?: boolean;
        pending?: boolean;
        profile?: FriendProfile;
      }>("/api/messages/friends", {
        method: "POST",
        body: JSON.stringify({ action: "request", identifier }),
      });
      setNotice(
        response.alreadyFriends
          ? `${profileName(response.profile)} is already your friend.`
          : response.accepted
            ? `${profileName(response.profile)} is now your friend.`
            : response.pending
              ? "Your previous friend request is still pending."
              : `Friend request sent to ${profileName(response.profile)}.`,
      );
      setFriendIdentifier("");
      await loadData(true);
    } catch (friendError) {
      setError(friendError instanceof Error ? friendError.message : "Unable to add friend.");
    } finally {
      setActionBusy("");
    }
  }

  async function respondFriend(
    friend: FriendRow,
    action: "accept" | "decline" | "remove" | "cancel",
  ) {
    const friendId = String(friend.profile.id || "");
    if (!friendId) return;
    if (
      action === "remove" &&
      !window.confirm(`Remove ${profileName(friend.profile)} from your friends list?`)
    ) {
      return;
    }
    setActionBusy(`${action}:${friendId}`);
    setError("");
    try {
      await authenticatedFetchJson(`/api/messages/friends/${friendId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === "accept"
          ? `${profileName(friend.profile)} is now your friend.`
          : action === "remove"
            ? `${profileName(friend.profile)} was removed.`
            : action === "cancel"
              ? "Friend request cancelled."
              : "Friend request declined.",
      );
      await loadData(true);
    } catch (friendError) {
      setError(friendError instanceof Error ? friendError.message : "Friend action failed.");
    } finally {
      setActionBusy("");
    }
  }

  async function openChat(
    profile: FriendProfile,
    presenceStatus: PresenceStatus,
    knownRoomId?: string | null,
  ) {
    setView("messages");
    setError("");
    let roomId = String(knownRoomId || "");
    try {
      if (!roomId) {
        const response = await authenticatedFetchJson<{
          roomId: string;
          profile: FriendProfile;
        }>(`/api/messages/friends/${profile.id}/chat`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        roomId = String(response.roomId || "");
        profile = response.profile || profile;
      }
      if (!roomId) throw new Error("Private room was not created.");
      setSelectedRoomId(roomId);
      setSelectedProfile(profile);
      setSelectedPresence(presenceStatus);
      setDraft("");
      await loadConversation(roomId);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Unable to open private chat.");
    }
  }

  async function sendMessage() {
    const message = draft.trim();
    if (!selectedRoomId || !message || sending) return;
    setSending(true);
    setError("");
    try {
      await authenticatedFetchJson(`/api/messages/rooms/${selectedRoomId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setDraft("");
      await loadConversation(selectedRoomId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message failed.");
    } finally {
      setSending(false);
    }
  }

  if (!workspaceOpen) return null;

  const pendingCount = data.incomingRequests.length + data.outgoingRequests.length;

  return (
    <section className="fixed inset-x-0 bottom-0 top-[76px] z-[84] overflow-hidden bg-[#11151d] text-white">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-[72px] shrink-0 flex-col items-center gap-3 border-r border-black/30 bg-[#090d13] py-3 md:flex">
          <button
            type="button"
            onClick={closeWorkspace}
            className="group flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/25 bg-[linear-gradient(145deg,#112a42,#081522)] text-lg font-black italic text-yellow-300 shadow-[0_0_24px_rgba(34,211,238,0.08)] transition hover:rounded-xl hover:border-yellow-300/50"
            title="Back to ComePlayers Servers"
          >
            CP
          </button>
          <div className="h-px w-8 bg-white/10" />
          <button
            type="button"
            onClick={() => {
              setView("friends");
              setFriendTab("online");
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border text-lg transition hover:rounded-xl ${
              view === "friends"
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                : "border-white/5 bg-white/[0.045] text-slate-400 hover:border-cyan-300/30 hover:text-cyan-100"
            }`}
            title="Friends"
          >
            <FaUsers />
          </button>
          <button
            type="button"
            onClick={() => setView("messages")}
            className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border text-lg transition hover:rounded-xl ${
              view === "messages"
                ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                : "border-white/5 bg-white/[0.045] text-slate-400 hover:border-cyan-300/30 hover:text-cyan-100"
            }`}
            title="Direct Messages"
          >
            <FaCommentDots />
            {totalUnread ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-[#090d13] bg-red-500 px-1 text-center text-[9px] font-black text-white">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              setView("friends");
              setFriendTab("add");
            }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] text-slate-500 transition hover:rounded-xl hover:border-yellow-300/40 hover:bg-yellow-300/10 hover:text-yellow-200"
            title="Add Friend"
          >
            <FaPlus />
          </button>
        </aside>

        <aside
          className={`${
            view === "messages" && selectedRoomId ? "hidden md:flex" : view === "friends" ? "hidden md:flex" : "flex"
          } w-full shrink-0 flex-col border-r border-black/30 bg-[#151922] md:w-[290px]`}
        >
          <div className="border-b border-black/30 p-3">
            <div className="flex h-10 items-center gap-2 rounded-lg bg-[#0f131a] px-3 text-slate-400 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
              <FaSearch className="text-xs" />
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Find or start a conversation"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="space-y-1 px-2 py-3">
            <button
              type="button"
              onClick={() => {
                setView("friends");
                setFriendTab("online");
              }}
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition ${
                view === "friends"
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
              }`}
            >
              <FaUsers className="text-lg" />
              Friends
              {pendingCount ? (
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {pendingCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setView("messages")}
              className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition ${
                view === "messages"
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
              }`}
            >
              <FaInbox className="text-lg" />
              Direct Messages
              {totalUnread ? (
                <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              ) : null}
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-2">
            <div className="flex items-center justify-between px-2 pb-2 pt-2">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Direct Messages
              </p>
              <button
                type="button"
                onClick={() => {
                  setView("friends");
                  setFriendTab("add");
                }}
                className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-white"
                title="Add Friend"
              >
                <FaPlus />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-3">
              {loading ? (
                <p className="px-3 py-4 text-xs text-slate-500">Loading conversations...</p>
              ) : null}
              {!loading && filteredRecentChats.length === 0 ? (
                <p className="px-3 py-5 text-xs leading-5 text-slate-500">
                  Your direct messages will appear here after you start a chat with a friend.
                </p>
              ) : null}
              {filteredRecentChats.map((chat) => (
                <button
                  type="button"
                  key={chat.roomId}
                  onClick={() => void openChat(chat.profile, chat.presenceStatus, chat.roomId)}
                  className={`group mb-0.5 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
                    selectedRoomId === chat.roomId && view === "messages"
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                  }`}
                >
                  <Avatar profile={chat.profile} status={chat.presenceStatus} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{profileName(chat.profile)}</p>
                      <span className="ml-auto shrink-0 text-[9px] text-slate-600">
                        {formatTime(chat.lastMessageAt)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {chat.lastMessage || "Open private chat"}
                    </p>
                  </div>
                  {chat.unreadCount ? (
                    <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[9px] font-black text-white">
                      {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="relative border-t border-black/30 bg-[#10141b] p-2">
            {statusMenuOpen ? (
              <div className="absolute bottom-[70px] left-2 right-2 z-20 overflow-hidden rounded-xl border border-white/10 bg-[#0b1017] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.55)]">
                {(["online", "away", "invisible", "offline"] as OwnPresenceStatus[]).map(
                  (status) => (
                    <button
                      type="button"
                      key={status}
                      onClick={() => void changeStatus(status)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${statusDotClass(status)}`} />
                      <span className="flex-1">{statusLabel(status)}</span>
                      {data.ownStatus === status ? <FaCheck className="text-cyan-300" /> : null}
                    </button>
                  ),
                )}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setStatusMenuOpen((current) => !current)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.06]"
            >
              <Avatar
                profile={{ id: userId, username: "You" }}
                status={data.ownStatus === "invisible" ? "offline" : data.ownStatus}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-white">You</p>
                <p className="truncate text-[10px] text-slate-500">{statusLabel(data.ownStatus)}</p>
              </div>
              <FaChevronDown className={`text-xs text-slate-500 transition ${statusMenuOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </aside>

        <main
          className={`${
            view === "messages" && !selectedRoomId ? "hidden md:flex" : "flex"
          } min-w-0 flex-1 flex-col bg-[#1a1f29]`}
        >
          {view === "friends" ? (
            <>
              <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-black/30 px-3 md:px-5">
                <button
                  type="button"
                  onClick={() => setView("messages")}
                  className="mr-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
                  title="Direct Messages"
                >
                  <FaCommentDots />
                </button>
                <FaUsers className="hidden text-slate-400 sm:block" />
                <span className="hidden h-6 w-px bg-white/10 sm:block" />
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                  {(["online", "all", "pending"] as FriendTab[]).map((tab) => (
                    <button
                      type="button"
                      key={tab}
                      onClick={() => setFriendTab(tab)}
                      className={`h-9 shrink-0 rounded-lg px-3 text-sm font-bold capitalize transition ${
                        friendTab === tab
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                      }`}
                    >
                      {tab}
                      {tab === "pending" && pendingCount ? ` — ${pendingCount}` : ""}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFriendTab("add")}
                    className={`h-9 shrink-0 rounded-lg px-3 text-sm font-black transition ${
                      friendTab === "add"
                        ? "bg-emerald-500 text-white"
                        : "bg-emerald-500/90 text-white hover:bg-emerald-400"
                    }`}
                  >
                    Add Friend
                  </button>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void loadData()}
                    className="hidden rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white sm:block"
                    title="Refresh"
                  >
                    <FaBell />
                  </button>
                  <button
                    type="button"
                    onClick={closeWorkspace}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-500/15 hover:text-red-200"
                    title="Close Friends"
                  >
                    <FaTimes />
                  </button>
                </div>
              </header>

              {friendTab === "add" ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
                  <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.07] bg-[#161b24] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.18)] md:p-7">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">
                      ComePlayers Network
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">Add Friend</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Add a player with their exact ComePlayers username or account email.
                    </p>
                    {notice ? (
                      <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs text-emerald-200">
                        {notice}
                      </div>
                    ) : null}
                    {error ? (
                      <div className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-xs text-red-200">
                        {error}
                      </div>
                    ) : null}
                    <form onSubmit={addFriend} className="mt-6">
                      <label htmlFor="discord-friend-identifier" className="text-xs font-black uppercase tracking-wide text-slate-300">
                        Username or email
                      </label>
                      <div className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0f131a] p-2 focus-within:border-cyan-300/50 focus-within:shadow-[0_0_0_3px_rgba(34,211,238,0.06)]">
                        <FaSearch className="ml-2 shrink-0 text-slate-500" />
                        <input
                          id="discord-friend-identifier"
                          value={friendIdentifier}
                          onChange={(event) => setFriendIdentifier(event.target.value)}
                          placeholder="@username or player@example.com"
                          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                        />
                        <button
                          type="submit"
                          disabled={!friendIdentifier.trim() || actionBusy === "add"}
                          className="h-10 shrink-0 rounded-lg bg-cyan-400 px-4 text-xs font-black text-[#03111c] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {actionBusy === "add" ? "Sending..." : "Send Request"}
                        </button>
                      </div>
                    </form>
                    <div className="mt-6 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.045] p-4 text-xs leading-5 text-slate-400">
                      Friend requests stay pending until the other player accepts them. After acceptance, both players can start a direct message.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-7">
                  <div className="mx-auto max-w-5xl">
                    <div className="flex h-11 items-center gap-3 rounded-lg border border-white/[0.07] bg-[#151a23] px-4">
                      <FaSearch className="text-slate-500" />
                      <input
                        value={friendSearch}
                        onChange={(event) => setFriendSearch(event.target.value)}
                        placeholder="Search friends"
                        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                      />
                    </div>

                    {notice ? (
                      <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs text-emerald-200">
                        {notice}
                      </div>
                    ) : null}
                    {error ? (
                      <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-xs text-red-200">
                        {error}
                      </div>
                    ) : null}

                    {friendTab === "pending" ? (
                      <div className="mt-6 space-y-6">
                        <div>
                          <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">
                            Incoming — {data.incomingRequests.length}
                          </p>
                          {data.incomingRequests.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                              No incoming friend requests.
                            </p>
                          ) : null}
                          {data.incomingRequests.map((friend) => (
                            <div key={friend.profile.id} className="group flex items-center gap-3 border-t border-white/[0.07] px-2 py-3 hover:bg-white/[0.025]">
                              <Avatar profile={friend.profile} status={friend.presenceStatus} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-white">{profileName(friend.profile)}</p>
                                <p className="truncate text-xs text-slate-500">Incoming friend request</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void respondFriend(friend, "accept")}
                                disabled={actionBusy === `accept:${friend.profile.id}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#252b36] text-emerald-300 transition hover:bg-emerald-500 hover:text-white disabled:opacity-40"
                                title="Accept"
                              >
                                <FaCheck />
                              </button>
                              <button
                                type="button"
                                onClick={() => void respondFriend(friend, "decline")}
                                disabled={actionBusy === `decline:${friend.profile.id}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#252b36] text-red-300 transition hover:bg-red-500 hover:text-white disabled:opacity-40"
                                title="Decline"
                              >
                                <FaTimes />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div>
                          <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-400">
                            Outgoing — {data.outgoingRequests.length}
                          </p>
                          {data.outgoingRequests.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
                              No outgoing friend requests.
                            </p>
                          ) : null}
                          {data.outgoingRequests.map((friend) => (
                            <div key={friend.profile.id} className="group flex items-center gap-3 border-t border-white/[0.07] px-2 py-3 hover:bg-white/[0.025]">
                              <Avatar profile={friend.profile} status={friend.presenceStatus} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-white">{profileName(friend.profile)}</p>
                                <p className="truncate text-xs text-slate-500">Outgoing friend request</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void respondFriend(friend, "cancel")}
                                disabled={actionBusy === `cancel:${friend.profile.id}`}
                                className="rounded-lg bg-[#252b36] px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40"
                              >
                                Cancel
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : filteredFriends.length === 0 ? (
                      <EmptyState
                        title={friendTab === "online" ? "No friends online right now" : "Your friends list is empty"}
                        description={
                          friendTab === "online"
                            ? "Online friends will appear here. You can still open All to message someone who is offline."
                            : "Add a ComePlayers player to start private conversations and see their presence."
                        }
                        action={
                          <button
                            type="button"
                            onClick={() => setFriendTab("add")}
                            className="rounded-lg bg-cyan-400 px-4 py-2.5 text-xs font-black text-[#03111c] hover:bg-cyan-300"
                          >
                            Add Friend
                          </button>
                        }
                      />
                    ) : (
                      <div className="mt-6">
                        <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
                          {friendTab === "online" ? "Online" : "All Friends"} — {filteredFriends.length}
                        </p>
                        {filteredFriends.map((friend) => (
                          <div
                            key={friend.profile.id}
                            className="group flex items-center gap-3 border-t border-white/[0.07] px-2 py-3 transition hover:bg-white/[0.025]"
                          >
                            <Avatar profile={friend.profile} status={friend.presenceStatus} />
                            <button
                              type="button"
                              onClick={() => void openChat(friend.profile, friend.presenceStatus, friend.roomId)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-black text-white">{profileName(friend.profile)}</p>
                                <span className="hidden text-[10px] text-slate-600 sm:inline">#{String(friend.profile.id).slice(0, 5)}</span>
                              </div>
                              <p className="truncate text-xs text-slate-500">
                                {friend.presenceStatus === "online"
                                  ? "Online"
                                  : friend.presenceStatus === "away"
                                    ? "Away"
                                    : formatLastSeen(friend.lastSeenAt)}
                              </p>
                            </button>
                            {friend.unreadCount ? (
                              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                                {friend.unreadCount > 99 ? "99+" : friend.unreadCount}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void openChat(friend.profile, friend.presenceStatus, friend.roomId)}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#252b36] text-slate-300 transition hover:bg-cyan-400 hover:text-[#03111c]"
                              title={`Message ${profileName(friend.profile)}`}
                            >
                              <FaCommentDots />
                            </button>
                            <button
                              type="button"
                              onClick={() => void respondFriend(friend, "remove")}
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#252b36] text-slate-400 transition hover:bg-red-500/20 hover:text-red-200"
                              title="Remove Friend"
                            >
                              <FaEllipsisH />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : selectedRoomId && selectedProfile ? (
            <>
              <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-black/30 px-3 md:px-5">
                <button
                  type="button"
                  onClick={() => setSelectedRoomId("")}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
                  title="Back to Direct Messages"
                >
                  <FaArrowLeft />
                </button>
                <Avatar profile={selectedProfile} status={selectedPresence} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-white">{profileName(selectedProfile)}</p>
                  <p className="truncate text-[10px] text-slate-500">
                    {selectedPresence === "online"
                      ? "Online"
                      : selectedPresence === "away"
                        ? "Away"
                        : "Offline"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setView("friends");
                    setFriendTab("all");
                  }}
                  className="hidden rounded-lg px-3 py-2 text-xs font-black text-slate-400 hover:bg-white/10 hover:text-white sm:block"
                >
                  Friends
                </button>
                <button
                  type="button"
                  onClick={closeWorkspace}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-500/15 hover:text-red-200"
                  title="Close Direct Messages"
                >
                  <FaTimes />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-7">
                <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-end">
                  <div className="pb-8 pt-10">
                    <Avatar profile={selectedProfile} status={selectedPresence} size="xl" />
                    <h2 className="mt-4 text-2xl font-black text-white">{profileName(selectedProfile)}</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      This is the beginning of your direct message history with {profileName(selectedProfile)}.
                    </p>
                  </div>

                  {chatLoading ? (
                    <p className="py-8 text-center text-xs text-slate-500">Loading messages...</p>
                  ) : null}
                  {!chatLoading && messages.length === 0 ? (
                    <div className="mb-6 rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">
                      No messages yet. Say hello to start the conversation.
                    </div>
                  ) : null}
                  <div className="space-y-0.5">
                    {messages.map((message, index) => {
                      const mine = message.sender_id === userId;
                      const previous = messages[index - 1];
                      const grouped = previous && previous.sender_id === message.sender_id;
                      return (
                        <div
                          key={message.id}
                          className={`group flex gap-3 rounded-md px-2 py-1.5 hover:bg-black/[0.08] ${grouped ? "mt-0" : "mt-3"}`}
                        >
                          <div className="w-10 shrink-0 pt-0.5">
                            {grouped ? (
                              <span className="block pt-1 text-center text-[9px] text-slate-600 opacity-0 group-hover:opacity-100">
                                {formatTime(message.created_at)}
                              </span>
                            ) : (
                              <Avatar
                                profile={mine ? { id: userId, username: "You" } : selectedProfile}
                                size="md"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {!grouped ? (
                              <div className="mb-0.5 flex items-baseline gap-2">
                                <p className="truncate text-sm font-black text-white">
                                  {mine ? "You" : profileName(selectedProfile)}
                                </p>
                                <span className="text-[9px] text-slate-600">{formatTime(message.created_at)}</span>
                              </div>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words text-sm leading-5 text-slate-200">
                              {message.deleted_at ? "[Message deleted]" : message.message}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div ref={messageEndRef} />
                </div>
              </div>

              <div className="shrink-0 px-3 pb-4 md:px-6 md:pb-6">
                {error ? (
                  <div className="mx-auto mb-2 max-w-4xl rounded-lg border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-xs text-red-200">
                    {error}
                  </div>
                ) : null}
                <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-xl bg-[#2a303b] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] focus-within:ring-1 focus-within:ring-cyan-300/30">
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[#202630] transition hover:bg-white"
                    title="Attach"
                  >
                    <FaPlus />
                  </button>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={`Message @${profileName(selectedProfile)}`}
                    className="max-h-36 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={!draft.trim() || sending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-cyan-400/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
                    title="Send message"
                  >
                    <FaPaperPlane />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-black/30 px-4 md:px-5">
                <FaInbox className="text-slate-400" />
                <h2 className="text-sm font-black text-white">Direct Messages</h2>
                <button
                  type="button"
                  onClick={closeWorkspace}
                  className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-red-500/15 hover:text-red-200"
                  title="Close Direct Messages"
                >
                  <FaTimes />
                </button>
              </header>
              <EmptyState
                title="Select a conversation"
                description="Choose a friend from Direct Messages, or open Friends to start a new private conversation."
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setView("friends");
                      setFriendTab("all");
                    }}
                    className="rounded-lg bg-cyan-400 px-4 py-2.5 text-xs font-black text-[#03111c] hover:bg-cyan-300"
                  >
                    Open Friends
                  </button>
                }
              />
            </div>
          )}
        </main>

        <aside className="hidden w-[320px] shrink-0 border-l border-black/30 bg-[#171b24] p-5 xl:block">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white">Active Now</h3>
            <FaGamepad className="text-cyan-300/70" />
          </div>
          {activeNow.length === 0 ? (
            <div className="mt-5 rounded-2xl bg-[#1d222c] px-5 py-6 text-center">
              <p className="text-sm font-black text-white">It&apos;s quiet for now...</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                When a friend starts playing or comes online, their activity will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {activeNow.map((friend) => (
                <button
                  type="button"
                  key={friend.profile.id}
                  onClick={() => void openChat(friend.profile, friend.presenceStatus, friend.roomId)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.05] bg-[#1d222c] p-4 text-left transition hover:border-cyan-300/20 hover:bg-[#202733]"
                >
                  <Avatar profile={friend.profile} status={friend.presenceStatus} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{profileName(friend.profile)}</p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {friend.presenceStatus === "online" ? "Online on ComePlayers" : "Away"}
                    </p>
                  </div>
                  <FaCommentDots className="text-slate-600" />
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
