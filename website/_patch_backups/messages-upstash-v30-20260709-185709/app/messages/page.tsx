"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FaBroadcastTower,
  FaCircle,
  FaDesktop,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaFilePdf,
  FaFlag,
  FaHeadphones,
  FaLock,
  FaPaperclip,
  FaPlus,
  FaEdit,
  FaReply,
  FaTrash,
  FaShieldAlt,
  FaStop,
  FaTimes,
  FaUserMinus,
  FaUserPlus,
  FaUserShield,
  FaUsers,
  FaVideo,
} from "react-icons/fa";
import { useCurrency } from "@/components/CurrencyProvider";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import CommunityChannelSidebar, {
  type CommunityChannel,
} from "@/components/messages/CommunityChannelSidebar";
import CommunityVoicePanel from "@/components/messages/CommunityVoicePanel";
import {
  createStreamIceServers,
  type PublicChatStreamState,
} from "@/lib/chatStream";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  email?: string | null;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type Product = {
  id: number;
  title?: string | null;
  image_url?: string | null;
  price?: string | number | null;
  game_name?: string | null;
  category?: string | null;
};

type OrderSummary = {
  id: number;
  status?: string | null;
  payment_status?: string | null;
  product_title?: string | null;
  created_at?: string | null;
};

type RoomMember = {
  room_id: string;
  user_id: string;
  member_role?: string | null;
  status?: string | null;
  invited_by?: string | null;
  last_read_at?: string | null;
  joined_at?: string | null;
  updated_at?: string | null;
  profile?: Profile | null;
};

type Room = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id?: number | null;
  order_id?: number | null;
  room_type?: string | null;
  title?: string | null;
  description?: string | null;
  created_by?: string | null;
  status?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_sender_id?: string | null;
  stream_status?: string | null;
  stream_host_id?: string | null;
  stream_title?: string | null;
  stream_started_at?: string | null;
  stream_ended_at?: string | null;
  stream_updated_at?: string | null;
  created_at?: string | null;
  unread_count: number;
  member_count?: number | null;
  member_role?: string | null;
  other: Profile | null;
  stream_host?: Profile | null;
  stream?: PublicChatStreamState;
  product: Product | null;
  order: OrderSummary | null;
  members?: RoomMember[];
};

type Attachment = {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  moderation_status?: string | null;
  deleted_at?: string | null;
};

type ReactionSummary = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
};

type ReplyPreview = {
  id: string;
  sender_id: string;
  message: string | null;
  deleted_at?: string | null;
  sender?: Profile | null;
};

type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  receiver_id: string;
  message: string | null;
  message_type?: string | null;
  attachment_id?: number | null;
  channel_id?: string | null;
  reply_to_id?: string | null;
  moderation_status?: string | null;
  risk_score?: number | null;
  risk_flags?: string[] | null;
  is_read?: boolean | null;
  read_at?: string | null;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  attachment?: Attachment | null;
  sender?: Profile | null;
  reply_to?: ReplyPreview | null;
  reactions?: ReactionSummary[];
};

type ConversationResponse = {
  room: Room & { me?: Profile | null; role?: string | null; members?: RoomMember[] };
  channel?: CommunityChannel | null;
  messages: Message[];
  members?: RoomMember[];
};

type SignalPayload = {
  from?: string;
  to?: string;
  viewerId?: string;
  hostId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type RoomBucket = "all" | "live" | "group" | "trade" | "direct";

const STREAM_ICE_SERVERS = createStreamIceServers({
  stunUrls: process.env.NEXT_PUBLIC_WEBRTC_STUN_URLS,
  turnUrls: process.env.NEXT_PUBLIC_WEBRTC_TURN_URLS,
  turnUsername: process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME,
  turnCredential: process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL,
});

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "🎮", "✅"] as const;

function displayName(profile?: Profile | null) {
  return profile?.username || profile?.full_name || "ComePlayers User";
}

function profileInitial(profile?: Profile | null) {
  return displayName(profile).slice(0, 1).toUpperCase();
}

function safeAvatarUrl(profile?: Profile | null) {
  const value = String(profile?.avatar_url || "").trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith("https://") || value.startsWith("http://")) {
    return value;
  }
  return "";
}

const avatarSizes = {
  sm: "h-9 w-9 text-xs",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
  message: "h-11 w-11 text-sm",
};

function ProfileAvatar({
  profile,
  size = "md",
  className = "",
  fallback,
  live = false,
  title,
}: {
  profile?: Profile | null;
  size?: keyof typeof avatarSizes;
  className?: string;
  fallback?: ReactNode;
  live?: boolean;
  title?: string;
}) {
  const avatarUrl = safeAvatarUrl(profile);
  const style: CSSProperties | undefined = avatarUrl
    ? { backgroundImage: `url("${avatarUrl.replace(/"/g, "%22")}")` }
    : undefined;

  return (
    <div
      aria-label={title || displayName(profile)}
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-white/10 bg-cover bg-center font-black text-cyan-300 ring-1 ring-white/10 ${avatarSizes[size]} ${className}`}
      style={style}
    >
      {avatarUrl ? null : fallback || profileInitial(profile)}
      {live ? (
        <span className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-[8px] text-white">
          <FaVideo />
        </span>
      ) : null}
    </div>
  );
}

function isAdminProfile(profile?: Profile | null) {
  return String(profile?.role || "").toLowerCase() === "admin";
}

function isGroupRoom(room?: Room | null) {
  return String(room?.room_type || "").toLowerCase() === "group";
}

function roomTitle(room?: Room | null) {
  if (!room) return "Conversation";
  if (isGroupRoom(room)) return room.title || "Community Group";
  return displayName(room.other);
}

function roomInitial(room?: Room | null) {
  if (!room) return "C";
  if (isGroupRoom(room)) return roomTitle(room).slice(0, 1).toUpperCase();
  return profileInitial(room.other);
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSize(value?: number | null) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function memberRoleLabel(role?: string | null) {
  const normalized = String(role || "member").toLowerCase();
  if (normalized === "owner") return "Owner";
  if (normalized === "moderator") return "Moderator";
  if (normalized === "buyer") return "Buyer";
  if (normalized === "seller") return "Seller";
  return "Member";
}

function canManageMembers(role?: string | null, profile?: Profile | null) {
  const normalized = String(role || "").toLowerCase();
  return (
    isAdminProfile(profile) ||
    normalized === "admin" ||
    normalized === "owner" ||
    normalized === "moderator" ||
    normalized === "group_owner" ||
    normalized === "group_moderator"
  );
}

function isLiveRoom(room?: Room | null) {
  return String(room?.stream_status || "").toLowerCase() === "live";
}

function isTradeRoom(room?: Room | null) {
  return Boolean(room?.product_id || room?.order_id || room?.product || room?.order);
}

function bucketMatches(room: Room, bucket: RoomBucket) {
  if (bucket === "live") return isLiveRoom(room);
  if (bucket === "group") return isGroupRoom(room);
  if (bucket === "trade") return isTradeRoom(room);
  if (bucket === "direct") return !isGroupRoom(room) && !isTradeRoom(room);
  return true;
}

function isImageAttachment(attachment?: Attachment | null) {
  return String(attachment?.mime_type || "").startsWith("image/");
}

function isGenericAttachmentMessage(message?: string | null) {
  return String(message || "").trim().toLowerCase() === "attachment";
}

function AttachmentViewer({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isImage = isImageAttachment(attachment);

  async function reveal(silent = false) {
    setLoading(true);
    if (!silent) setError("");
    try {
      const data = await authenticatedFetchJson<{ url: string }>(
        `/api/messages/attachments/${attachment.id}`
      );
      setUrl(data.url);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not open attachment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isImage) return;
    setUrl("");
    setError("");
    void reveal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id, isImage]);

  if (isImage) {
    if (url) {
      return (
        <a href={url} target="_blank" rel="noreferrer" className="inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={attachment.file_name}
            className="max-h-[430px] max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl shadow-black/30"
            onError={() => {
              setUrl("");
              void reveal(true);
            }}
          />
        </a>
      );
    }

    return (
      <div className="inline-flex min-h-36 min-w-64 max-w-full items-center justify-center rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm text-gray-400">
        {loading ? "Loading image..." : "Image preview is unavailable."}
        {error ? (
          <button
            onClick={() => void reveal()}
            className="ml-3 rounded-lg border border-white/20 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-black"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-black/20 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xl">
          {attachment.mime_type === "application/pdf" ? <FaFilePdf /> : <FaPaperclip />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black">{attachment.file_name}</p>
          <p className="text-xs opacity-60">{formatSize(attachment.size_bytes)}</p>
        </div>
      </div>

      <button
        onClick={() => void reveal()}
        disabled={loading}
        className="mt-3 rounded-lg border border-white/20 px-3 py-2 text-xs font-black hover:bg-white hover:text-black disabled:opacity-50"
      >
        {loading ? "Opening..." : url ? "Refresh secure link" : "Open secure attachment"}
      </button>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-2 inline-flex rounded-lg bg-cyan-400 px-3 py-2 text-xs font-black text-black"
        >
          View file
        </a>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function MessageReplyPreview({ reply }: { reply?: ReplyPreview | null }) {
  if (!reply) return null;
  return (
    <div className="mb-2 rounded-xl border-l-2 border-cyan-400/70 bg-black/20 px-3 py-2 text-xs text-gray-400">
      <p className="font-black text-cyan-300">Replying to {displayName(reply.sender)}</p>
      <p className="mt-1 truncate">{reply.message || "Message unavailable"}</p>
    </div>
  );
}

function MessageInteractions({
  message,
  mine,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onReport,
}: {
  message: Message;
  mine: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onReport: () => void;
}) {
  if (message.deleted_at) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {(message.reactions || []).map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onReact(reaction.emoji)}
          className={`rounded-full border px-2 py-1 text-xs font-black transition ${
            reaction.reacted_by_me
              ? "border-cyan-300 bg-cyan-400/20 text-cyan-200"
              : "border-white/10 bg-white/5 text-gray-300 hover:border-white/30"
          }`}
          title={`${reaction.count} reaction`}
        >
          {reaction.emoji} {reaction.count}
        </button>
      ))}
      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        <button type="button" onClick={onReply} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white" title="Reply">
          <FaReply />
        </button>
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            className="rounded-lg px-1.5 py-1 text-xs hover:bg-white/10"
            title={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
        {mine ? (
          <>
            <button type="button" onClick={onEdit} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white" title="Edit">
              <FaEdit />
            </button>
            <button type="button" onClick={onDelete} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-red-400/10 hover:text-red-300" title="Delete">
              <FaTrash />
            </button>
          </>
        ) : (
          <button type="button" onClick={onReport} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-red-400/10 hover:text-red-300" title="Report">
            <FaFlag />
          </button>
        )}
      </div>
    </div>
  );
}

function StreamVideoFallback({
  title,
  hostName,
  text,
}: {
  title: string;
  hostName: string;
  text: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#020617]/88 p-4 text-center">
      <FaBroadcastTower className="mb-3 text-2xl text-cyan-300" />
      <p className="max-w-md text-sm font-black text-white">{title || "Live gameplay"}</p>
      <p className="mt-1 max-w-md text-xs text-gray-300">{text}</p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-cyan-200">
        Host: {hostName}
      </p>
    </div>
  );
}

function GroupLiveStreamPanel({
  room,
  userId,
  profile,
  onRoomRefresh,
}: {
  room: Room;
  userId: string;
  profile: Profile | null;
  onRoomRefresh: (roomId: string) => Promise<void>;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [hosting, setHosting] = useState(false);
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [onlineCount, setOnlineCount] = useState(0);
  const [streamReady, setStreamReady] = useState(false);
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [streamTitle, setStreamTitle] = useState(room.stream_title || "Live gameplay");
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const candidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const hostingRef = useRef(false);
  const watchingRef = useRef(false);

  const live = String(room.stream_status || "idle").toLowerCase() === "live";
  const hostIsMe = live && room.stream_host_id === userId;
  const hostName = hostIsMe ? "You" : displayName(room.stream_host);
  const streamState = room.stream;
  const liveHref = streamState?.watch_url || `/messages?room=${encodeURIComponent(room.id)}&live=1`;

  useEffect(() => {
    setStreamTitle(room.stream_title || "Live gameplay");
  }, [room.id, room.stream_title]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;
    video.srcObject = localStream;
    if (localStream) {
      void video.play().catch(() => null);
    }
  }, [localStream]);

  useEffect(() => {
    remoteStreamRef.current = remoteStream;
    setRemoteVideoReady(false);
    const video = remoteVideoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) {
      void video.play().catch(() => {
        setStreamError("Tap the video controls if playback does not start automatically.");
      });
    }
  }, [remoteStream]);

  useEffect(() => {
    watchingRef.current = watching;
  }, [watching]);

  function closePeer(peerId: string) {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    candidateQueueRef.current.delete(peerId);
  }

  function closePeers() {
    for (const peer of peersRef.current.values()) {
      peer.close();
    }
    peersRef.current.clear();
    candidateQueueRef.current.clear();
  }

  function stopMediaTracks() {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
  }

  async function sendSignal(event: string, payload: SignalPayload) {
    const channel = channelRef.current;
    if (!channel) throw new Error("Live channel is still connecting.");
    const result = await channel.send({
      type: "broadcast",
      event,
      payload: { ...payload, from: userId },
    });
    if (result !== "ok") {
      throw new Error("Live signal could not be sent.");
    }
  }

  async function flushCandidateQueue(peerId: string, peer: RTCPeerConnection) {
    const queued = candidateQueueRef.current.get(peerId) || [];
    candidateQueueRef.current.delete(peerId);
    for (const candidate of queued) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  function createPeer(peerId: string) {
    const existing = peersRef.current.get(peerId);
    if (existing && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
      return existing;
    }
    if (existing) closePeer(peerId);

    const peer = new RTCPeerConnection({
      iceServers: STREAM_ICE_SERVERS,
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendSignal("ice-candidate", {
        to: peerId,
        candidate: event.candidate.toJSON(),
      }).catch(() => null);
    };

    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteVideoReady(false);
      setRemoteStream(stream);
      setWatching(true);
      setStreamError("");
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStreamError("");
        return;
      }
      if (peer.connectionState === "failed") {
        setStreamError(
          "The live connection failed. Try again or configure a TURN server for different networks."
        );
      }
      if (["closed", "disconnected", "failed"].includes(peer.connectionState)) {
        closePeer(peerId);
        if (!hostingRef.current) {
          setRemoteStream(null);
        }
      }
    };

    peersRef.current.set(peerId, peer);
    return peer;
  }

  async function createOfferForViewer(viewerId: string) {
    const media = localStreamRef.current;
    if (!media || !hostingRef.current) return;

    let peer = createPeer(viewerId);
    if (peer.signalingState !== "stable") {
      closePeer(viewerId);
      peer = createPeer(viewerId);
    }

    for (const track of media.getTracks()) {
      if (!peer.getSenders().some((sender) => sender.track?.id === track.id)) {
        peer.addTrack(track, media);
      }
    }

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendSignal("offer", { to: viewerId, sdp: offer });
  }

  async function handleOffer(payload: SignalPayload) {
    if (!payload.from || payload.to !== userId || !payload.sdp) return;
    const peer = createPeer(payload.from);
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    await flushCandidateQueue(payload.from, peer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    setWatching(true);
    await sendSignal("answer", { to: payload.from, sdp: answer });
  }

  async function handleAnswer(payload: SignalPayload) {
    if (!payload.from || payload.to !== userId || !payload.sdp) return;
    const peer = peersRef.current.get(payload.from);
    if (!peer) return;
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    await flushCandidateQueue(payload.from, peer);
  }

  async function handleCandidate(payload: SignalPayload) {
    if (!payload.from || payload.to !== userId || !payload.candidate) return;
    const peer = peersRef.current.get(payload.from) || createPeer(payload.from);
    if (!peer.remoteDescription) {
      const queued = candidateQueueRef.current.get(payload.from) || [];
      queued.push(payload.candidate);
      candidateQueueRef.current.set(payload.from, queued);
      return;
    }
    await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
  }

  async function requestViewerConnection(hostId: string) {
    if (!hostId || hostId === userId) return;
    closePeers();
    setRemoteStream(null);
    setWatching(true);
    setStreamError("");
    await sendSignal("viewer-join", { viewerId: userId, hostId });
  }

  useEffect(() => {
    if (!room.id || !userId) return;

    closePeers();
    stopMediaTracks();
    hostingRef.current = false;
    watchingRef.current = false;
    setHosting(false);
    setWatching(false);
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteVideoReady(false);
    setStreamError("");

    const channel = supabase.channel(`group-stream:${room.id}`, {
      config: {
        private: true,
        presence: { key: userId },
      },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "viewer-join" }, (event) => {
        const payload = event.payload as SignalPayload;
        if (!payload.viewerId || payload.viewerId === userId) return;
        if (payload.hostId && payload.hostId !== userId) return;
        void createOfferForViewer(payload.viewerId).catch((signalError) => {
          setStreamError(
            signalError instanceof Error ? signalError.message : "Could not connect the viewer."
          );
        });
      })
      .on("broadcast", { event: "stream-started" }, (event) => {
        const payload = event.payload as SignalPayload;
        if (!payload.hostId || payload.hostId === userId) return;
        setStreamError("");
        void onRoomRefresh(room.id).catch(() => null);
      })
      .on("broadcast", { event: "offer" }, (event) => {
        void handleOffer(event.payload as SignalPayload).catch((signalError) => {
          setStreamError(
            signalError instanceof Error ? signalError.message : "Could not join stream."
          );
        });
      })
      .on("broadcast", { event: "answer" }, (event) => {
        void handleAnswer(event.payload as SignalPayload).catch((signalError) => {
          setStreamError(
            signalError instanceof Error ? signalError.message : "Could not connect viewer."
          );
        });
      })
      .on("broadcast", { event: "ice-candidate" }, (event) => {
        void handleCandidate(event.payload as SignalPayload).catch(() => null);
      })
      .on("broadcast", { event: "stream-ended" }, (event) => {
        const payload = event.payload as SignalPayload;
        if (payload.hostId === userId) return;
        closePeers();
        setRemoteStream(null);
        setRemoteVideoReady(false);
        setWatching(false);
        setStreamError("");
        void onRoomRefresh(room.id).catch(() => null);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        const count = Object.values(state).reduce((sum, entries) => sum + entries.length, 0);
        setOnlineCount(count);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setStreamReady(true);
          setStreamError("");
          void channel.track({
            userId,
            name: displayName(profile),
            streaming: hostingRef.current,
            onlineAt: new Date().toISOString(),
          });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setStreamReady(false);
          setStreamError("Live channel permission is not available yet.");
        }
      });

    return () => {
      const wasHosting = hostingRef.current;
      if (wasHosting) {
        void authenticatedFetchJson(`/api/messages/rooms/${room.id}/stream`, {
          method: "POST",
          body: JSON.stringify({ action: "stop" }),
        }).catch(() => null);
      }
      closePeers();
      stopMediaTracks();
      hostingRef.current = false;
      watchingRef.current = false;
      channelRef.current = null;
      setHosting(false);
      setWatching(false);
      setLocalStream(null);
      setRemoteStream(null);
      setRemoteVideoReady(false);
      setStreamReady(false);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, userId, profile?.id]);

  useEffect(() => {
    if (live || hostingRef.current) return;
    closePeers();
    setRemoteStream(null);
    setRemoteVideoReady(false);
    setWatching(false);
  }, [live, room.id]);

  async function startStreaming() {
    setBusy(true);
    setStreamError("");
    try {
      if (!streamReady || !channelRef.current) {
        throw new Error("Live channel is still connecting. Try again in a moment.");
      }
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not supported in this browser.");
      }

      closePeers();
      setWatching(false);
      setRemoteStream(null);
      setRemoteVideoReady(false);

      const media = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: true,
      });
      const videoTrack = media.getVideoTracks()[0];
      if (!videoTrack) {
        media.getTracks().forEach((track) => track.stop());
        throw new Error("No screen video track was selected.");
      }

      localStreamRef.current = media;
      setLocalStream(media);

      videoTrack.addEventListener(
        "ended",
        () => {
          if (hostingRef.current) void stopStreaming();
        },
        { once: true }
      );

      await authenticatedFetchJson<{ room: Room }>(`/api/messages/rooms/${room.id}/stream`, {
        method: "POST",
        body: JSON.stringify({ action: "start", title: streamTitle }),
      });

      hostingRef.current = true;
      setHosting(true);
      await channelRef.current.track({
        userId,
        name: displayName(profile),
        streaming: true,
        onlineAt: new Date().toISOString(),
      });
      await sendSignal("stream-started", { hostId: userId });
      await onRoomRefresh(room.id);
    } catch (startError) {
      closePeers();
      stopMediaTracks();
      hostingRef.current = false;
      setHosting(false);
      setLocalStream(null);
      setRemoteStream(null);
      setRemoteVideoReady(false);
      setWatching(false);
      setStreamError(
        startError instanceof Error ? startError.message : "Could not start live stream."
      );
    } finally {
      setBusy(false);
    }
  }

  async function stopStreaming() {
    setBusy(true);
    setStreamError("");
    try {
      await sendSignal("stream-ended", { hostId: userId }).catch(() => null);
      closePeers();
      stopMediaTracks();
      hostingRef.current = false;
      setHosting(false);
      setLocalStream(null);
      setRemoteStream(null);
      setRemoteVideoReady(false);
      setWatching(false);
      await authenticatedFetchJson<{ room: Room }>(`/api/messages/rooms/${room.id}/stream`, {
        method: "POST",
        body: JSON.stringify({ action: "stop" }),
      });
      await channelRef.current?.track({
        userId,
        name: displayName(profile),
        streaming: false,
        onlineAt: new Date().toISOString(),
      });
      await onRoomRefresh(room.id);
    } catch (stopError) {
      setStreamError(
        stopError instanceof Error ? stopError.message : "Could not stop live stream."
      );
    } finally {
      setBusy(false);
    }
  }

  async function watchStream() {
    setStreamError("");
    const streamData = await authenticatedFetchJson<{
      stream: PublicChatStreamState;
    }>(`/api/messages/rooms/${room.id}/stream`).catch(() => null);
    const hostId = streamData?.stream.host_id || room.stream_host_id;
    if (!streamData?.stream.is_live && !live) {
      setStreamError("No member is live right now.");
      return;
    }
    if (!hostId) {
      setStreamError("Live host is not available yet.");
      return;
    }
    if (!streamReady || !channelRef.current) {
      setStreamError("Live channel is still connecting.");
      return;
    }
    await requestViewerConnection(hostId);
  }

  function stopWatching() {
    closePeers();
    setRemoteStream(null);
    setRemoteVideoReady(false);
    setWatching(false);
    setStreamError("");
  }

  useEffect(() => {
    if (!live || !room.stream_host_id || watching || !streamReady) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("room") !== room.id || params.get("live") !== "1") return;

    const timer = window.setTimeout(() => {
      void watchStream();
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, room.id, room.stream_host_id, streamReady, watching]);

  const showLocalVideo = Boolean(localStream);
  const showRemoteVideo = Boolean(watching || remoteStream);

  return (
    <div className="border-b border-white/10 bg-[#050a14] p-4">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-300">
              <FaBroadcastTower />
              <span>Group Live</span>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-gray-300">
                {onlineCount || 1} online
              </span>
              {live || hosting ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-1 text-[10px] text-white">
                  <FaCircle className="text-[8px]" /> Live
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 truncate text-lg font-black">
              {live || hosting
                ? streamTitle || room.stream_title || "Live gameplay"
                : "Ready for a live gameplay session"}
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              {hosting
                ? "You are sharing your screen in this group."
                : live
                  ? `${hostName} is streaming in this group.`
                  : "Start a screen share when the group is ready."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!live || hostIsMe ? (
              <input
                value={streamTitle}
                onChange={(event) => setStreamTitle(event.target.value)}
                maxLength={80}
                className="h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-sm outline-none placeholder:text-gray-500 focus:border-cyan-400 sm:w-56"
                placeholder="Stream title"
                disabled={busy || (live && !hostIsMe)}
              />
            ) : null}
            {hosting || hostIsMe ? (
              <button
                onClick={() => void stopStreaming()}
                disabled={busy}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-black text-white hover:bg-red-400 disabled:opacity-50"
              >
                <FaStop /> Stop
              </button>
            ) : live ? (
              watching ? (
                <button
                  type="button"
                  onClick={stopWatching}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-black text-white hover:bg-white/10"
                >
                  <FaStop /> Leave stream
                </button>
              ) : (
                <a
                  href={liveHref}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={busy || !streamReady}
                  onClick={(event) => {
                    if (busy || !streamReady) {
                      event.preventDefault();
                      return;
                    }
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    void watchStream();
                  }}
                  className={`inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-black hover:bg-cyan-300 ${
                    busy || !streamReady ? "opacity-50" : ""
                  }`}
                  title="Watch live. Right-click or Ctrl-click to open in a new tab."
                >
                  <FaVideo /> Watch
                  <FaExternalLinkAlt className="text-xs" />
                </a>
              )
            ) : (
              <button
                onClick={() => void startStreaming()}
                disabled={busy || !streamReady}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-black hover:bg-cyan-300 disabled:opacity-50"
              >
                <FaDesktop /> {busy ? "Starting..." : "Go Live"}
              </button>
            )}
          </div>
        </div>

        {showLocalVideo || showRemoteVideo ? (
          <div className={`mt-4 grid gap-3 ${showLocalVideo && showRemoteVideo ? "lg:grid-cols-2" : "grid-cols-1"}`}>
            {showLocalVideo ? (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  controls
                  className="aspect-video w-full bg-black object-contain"
                />
              </div>
            ) : null}
            {showRemoteVideo ? (
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
                {remoteStream ? (
                  <>
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      controls
                      onLoadedData={() => setRemoteVideoReady(true)}
                      onPlaying={() => setRemoteVideoReady(true)}
                      onWaiting={() => setRemoteVideoReady(false)}
                      className="aspect-video w-full bg-black object-contain"
                    />
                    {!remoteVideoReady ? (
                      <StreamVideoFallback
                        title={streamTitle || room.stream_title || "Live gameplay"}
                        hostName={hostName}
                        text="Stream tersambung. Menunggu frame video pertama dari host..."
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="relative flex aspect-video items-center justify-center text-sm text-gray-500">
                    <StreamVideoFallback
                      title={streamTitle || room.stream_title || "Live gameplay"}
                      hostName={hostName}
                      text={streamState?.fallback_text || "Connecting to live stream..."}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {streamError ? (
          <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
            {streamError}
          </div>
        ) : null}
      </div>
    </div>
  );
}


export default function MessagesPage() {
  const { formatPrice } = useCurrency();
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [communityChannelSelection, setCommunityChannelSelection] = useState<{
    roomId: string;
    channel: CommunityChannel;
  } | null>(null);
  const [conversation, setConversation] = useState<ConversationResponse | null>(null);
  const [search, setSearch] = useState("");
  const [roomBucket, setRoomBucket] = useState<RoomBucket>("all");
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; at: number }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [candidateUsers, setCandidateUsers] = useState<Profile[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [memberActionBusy, setMemberActionBusy] = useState("");
  const initializedQueryRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || conversation?.room || null,
    [rooms, selectedRoomId, conversation]
  );
  const selectedIsGroup = isGroupRoom(selectedRoom);
  const selectedCommunityChannel =
    communityChannelSelection?.roomId === selectedRoomId
      ? communityChannelSelection.channel
      : conversation?.room.id === selectedRoomId
        ? conversation.channel || null
        : null;
  const selectedChannelId = selectedIsGroup ? String(selectedCommunityChannel?.id || "") : "";
  const selectedChannelIsVoice = selectedCommunityChannel?.channel_type === "voice";
  const isAdmin = isAdminProfile(profile);
  const conversationMembers = useMemo(
    () => conversation?.members || conversation?.room.members || [],
    [conversation]
  );
  const memberProfileMap = useMemo(
    () =>
      new Map(
        conversationMembers.map((member) => [String(member.user_id), member.profile || null])
      ),
    [conversationMembers]
  );
  const selectedGroupRole = String(
    conversation?.room.role || selectedRoom?.member_role || ""
  ).toLowerCase();
  const canManageSelectedGroupMembers =
    selectedIsGroup && canManageMembers(selectedGroupRole, profile);
  const channelComposerDisabled = Boolean(
    selectedIsGroup &&
      (selectedChannelIsVoice ||
        (selectedCommunityChannel?.is_read_only && !canManageSelectedGroupMembers)),
  );

  const roomStats = useMemo(() => {
    const unread = rooms.reduce((sum, room) => sum + Number(room.unread_count || 0), 0);
    const live = rooms.filter(isLiveRoom).length;
    const groups = rooms.filter(isGroupRoom).length;
    const trades = rooms.filter(isTradeRoom).length;
    const direct = rooms.filter((room) => !isGroupRoom(room) && !isTradeRoom(room)).length;
    return { unread, live, groups, trades, direct };
  }, [rooms]);

  const roomBuckets = useMemo(
    () =>
      [
        { id: "all" as const, label: "Home", icon: <FaDesktop />, count: rooms.length },
        { id: "live" as const, label: "Live", icon: <FaBroadcastTower />, count: roomStats.live },
        { id: "group" as const, label: "Groups", icon: <FaUsers />, count: roomStats.groups },
        { id: "trade" as const, label: "Trade", icon: <FaShieldAlt />, count: roomStats.trades },
        { id: "direct" as const, label: "DM", icon: <FaLock />, count: roomStats.direct },
      ],
    [rooms.length, roomStats.direct, roomStats.groups, roomStats.live, roomStats.trades]
  );

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (!bucketMatches(room, roomBucket)) return false;
      if (!query) return true;
      return [
        roomTitle(room),
        displayName(room.other),
        room.last_message || "",
        room.product?.title || "",
        room.order?.product_title || "",
        String(room.order_id || ""),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [rooms, roomBucket, search]);

  const filteredCandidates = useMemo(() => {
    const query = groupDescription.startsWith("@")
      ? groupDescription.slice(1).trim().toLowerCase()
      : "";
    if (!query) return candidateUsers;
    return candidateUsers.filter((candidate) =>
      displayName(candidate).toLowerCase().includes(query)
    );
  }, [candidateUsers, groupDescription]);

  async function loadRooms(preferredRoomId?: string) {
    const data = await authenticatedFetchJson<{ rooms: Room[] }>("/api/messages/rooms?limit=60");
    setRooms(data.rooms || []);
    const nextId = preferredRoomId || selectedRoomId || data.rooms?.[0]?.id || "";
    if (nextId) setSelectedRoomId(nextId);
    return data.rooms || [];
  }

  async function loadConversation(
    roomId: string,
    silent = false,
    channelId = communityChannelSelection?.roomId === roomId
      ? communityChannelSelection.channel.id
      : "",
  ) {
    if (!roomId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const channelQuery = channelId ? `&channel=${encodeURIComponent(channelId)}` : "";
      const data = await authenticatedFetchJson<ConversationResponse>(
        `/api/messages/rooms/${roomId}?limit=80${channelQuery}`
      );
      setConversation(data);
      await authenticatedFetchJson(`/api/messages/rooms/${roomId}/read`, {
        method: "POST",
        body: JSON.stringify({ channelId: data.channel?.id || channelId || undefined }),
      });
      setRooms((current) =>
        current.map((room) => (room.id === roomId ? { ...room, unread_count: 0 } : room))
      );
    } catch (loadError) {
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load conversation.");
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }

  async function refreshSelectedRoom(roomId: string) {
    const channelId =
      communityChannelSelection?.roomId === roomId
        ? communityChannelSelection.channel.id
        : "";
    await Promise.all([loadRooms(roomId), loadConversation(roomId, true, channelId)]);
  }

  async function loadGroupCandidates() {
    if (!isAdmin) return;
    setLoadingCandidates(true);
    try {
      const data = await authenticatedFetchJson<{ users: Profile[] }>("/api/messages/groups");
      setCandidateUsers(data.users || []);
    } catch (candidateError) {
      setError(candidateError instanceof Error ? candidateError.message : "Could not load users.");
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function createRoomFromQuery() {
    if (initializedQueryRef.current) return "";
    initializedQueryRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("invite") || "";
    if (inviteCode) {
      const joined = await authenticatedFetchJson<{ roomId: string }>(
        `/api/messages/invites/${encodeURIComponent(inviteCode)}/join`,
        { method: "POST", body: JSON.stringify({}) },
      );
      window.history.replaceState({}, "", `/messages?room=${encodeURIComponent(joined.roomId)}`);
      setNotice("You joined the community.");
      return joined.roomId;
    }

    const directRoom = params.get("room") || "";
    if (directRoom) return directRoom;

    const sellerId = params.get("seller") || "";
    const productId = Number(params.get("product") || 0);
    const orderId = Number(params.get("order") || 0);
    if (!productId && !orderId) return "";

    const data = await authenticatedFetchJson<{ room: { id: string } }>(
      "/api/messages/rooms",
      {
        method: "POST",
        body: JSON.stringify({
          sellerId: sellerId || undefined,
          productId: productId || undefined,
          orderId: orderId || undefined,
        }),
      }
    );
    return String(data.room?.id || "");
  }

  function toggleMember(userIdToToggle: string) {
    setSelectedMemberIds((current) =>
      current.includes(userIdToToggle)
        ? current.filter((memberId) => memberId !== userIdToToggle)
        : [...current, userIdToToggle]
    );
  }

  async function createGroup() {
    setCreatingGroup(true);
    setError("");
    setNotice("");
    try {
      const data = await authenticatedFetchJson<{ room: Room }>("/api/messages/groups", {
        method: "POST",
        body: JSON.stringify({
          title: groupTitle,
          description: groupDescription.startsWith("@") ? "" : groupDescription,
          memberIds: selectedMemberIds,
        }),
      });
      const roomId = String(data.room?.id || "");
      setGroupTitle("");
      setGroupDescription("");
      setSelectedMemberIds([]);
      setShowCreateGroup(false);
      setNotice("Group chat created.");
      if (roomId) {
        await loadRooms(roomId);
        await loadConversation(roomId);
      }
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : "Group could not be created.");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function inviteMember(identifier?: string) {
    const lookup = String(identifier || inviteIdentifier || "").trim();
    if (!selectedRoomId || !lookup) return;

    setMemberActionBusy(`invite:${lookup}`);
    setError("");
    setNotice("");
    try {
      await authenticatedFetchJson(`/api/messages/rooms/${selectedRoomId}/members`, {
        method: "POST",
        body: JSON.stringify({ identifier: lookup }),
      });
      setInviteIdentifier("");
      setNotice("Member invited to the group.");
      await refreshSelectedRoom(selectedRoomId);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Member invite failed.");
    } finally {
      setMemberActionBusy("");
    }
  }

  async function removeMember(member: RoomMember) {
    if (!selectedRoomId || !member.user_id) return;
    const memberName = displayName(member.profile);
    if (!window.confirm(`Remove ${memberName} from this group?`)) return;

    setMemberActionBusy(`remove:${member.user_id}`);
    setError("");
    setNotice("");
    try {
      await authenticatedFetchJson(`/api/messages/rooms/${selectedRoomId}/members`, {
        method: "DELETE",
        body: JSON.stringify({ userId: member.user_id }),
      });
      setNotice(`${memberName} was removed from the group.`);
      await refreshSelectedRoom(selectedRoomId);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Member removal failed.");
    } finally {
      setMemberActionBusy("");
    }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) {
          window.location.replace("/");
          return;
        }
        if (!active) return;
        setUserId(data.user.id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id,email,username,full_name,avatar_url,role")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!active) return;
        setProfile((profileData || null) as Profile | null);

        const queryRoomId = await createRoomFromQuery();
        const roomList = await loadRooms(queryRoomId);
        const initialRoomId = queryRoomId || roomList[0]?.id || "";
        if (initialRoomId) {
          setSelectedRoomId(initialRoomId);
          await loadConversation(initialRoomId);
        }
      } catch (initError) {
        setError(initError instanceof Error ? initError.message : "Failed to initialize messages.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile || !isAdminProfile(profile)) return;
    void loadGroupCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!selectedRoomId || loading) return;
    const channelId =
      communityChannelSelection?.roomId === selectedRoomId
        ? communityChannelSelection.channel.id
        : "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConversation(selectedRoomId, false, channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, communityChannelSelection?.channel.id]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(async () => {
      try {
        await loadRooms(selectedRoomId);
        if (selectedRoomId) {
          const channelId =
            communityChannelSelection?.roomId === selectedRoomId
              ? communityChannelSelection.channel.id
              : "";
          await loadConversation(selectedRoomId, true, channelId);
        }
      } catch {
        // Polling is a quiet fallback for cross-tab updates.
      }
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId || !userId) return;
    const resetTypingTimer = window.setTimeout(() => setTypingUsers({}), 0);
    const activeChannelId =
      communityChannelSelection?.roomId === selectedRoomId
        ? communityChannelSelection.channel.id
        : "";
    const refresh = () => {
      void loadConversation(selectedRoomId, true, activeChannelId);
      void loadRooms(selectedRoomId);
    };
    const channel = supabase
      .channel(`chat-room:${selectedRoomId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${selectedRoomId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
          filter: `room_id=eq.${selectedRoomId}`,
        },
        () => void loadConversation(selectedRoomId, true)
      )
      .on("broadcast", { event: "typing" }, (event) => {
        const payload = event.payload as {
          userId?: string;
          name?: string;
          active?: boolean;
          channelId?: string;
        };
        if (!payload.userId || payload.userId === userId) return;
        if (String(payload.channelId || "") !== activeChannelId) return;
        setTypingUsers((current) => {
          const next = { ...current };
          if (payload.active) {
            next[payload.userId as string] = {
              name: String(payload.name || "Someone"),
              at: Date.now(),
            };
          } else {
            delete next[payload.userId as string];
          }
          return next;
        });
      })
      .subscribe();
    typingChannelRef.current = channel;

    const staleTimer = window.setInterval(() => {
      setTypingUsers((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, entry]) => Date.now() - entry.at < 4000)
        )
      );
    }, 1200);

    return () => {
      window.clearTimeout(resetTypingTimer);
      window.clearInterval(staleTimer);
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomId, userId, communityChannelSelection?.channel.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  function signalTyping(active: boolean) {
    const channel = typingChannelRef.current;
    if (!channel || !userId) return;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId,
        name: displayName(profile),
        active,
        channelId: selectedChannelId,
      },
    });
  }

  function updateDraft(value: string) {
    setDraft(value);
    setError("");
    signalTyping(Boolean(value.trim()));
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => signalTyping(false), 1400);
  }

  function beginReply(message: Message) {
    setReplyingTo(message);
    setEditingMessage(null);
  }

  function beginEdit(message: Message) {
    if (message.sender_id !== userId || message.deleted_at) return;
    setEditingMessage(message);
    setReplyingTo(null);
    setDraft(String(message.message || ""));
  }

  function cancelComposerMode() {
    setReplyingTo(null);
    setEditingMessage(null);
    setDraft("");
    signalTyping(false);
  }

  async function deleteMessage(message: Message) {
    if (!selectedRoomId || !window.confirm("Delete this message?")) return;
    setError("");
    try {
      await authenticatedFetchJson(
        `/api/messages/rooms/${selectedRoomId}/messages/${message.id}`,
        { method: "DELETE" }
      );
      if (editingMessage?.id === message.id) cancelComposerMode();
      await Promise.all([loadConversation(selectedRoomId, true), loadRooms(selectedRoomId)]);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Message could not be deleted.");
    }
  }

  async function toggleReaction(message: Message, emoji: string) {
    if (!selectedRoomId) return;
    try {
      await authenticatedFetchJson(
        `/api/messages/rooms/${selectedRoomId}/messages/${message.id}/reactions`,
        { method: "POST", body: JSON.stringify({ emoji }) }
      );
      await loadConversation(selectedRoomId, true);
    } catch (reactionError) {
      setError(reactionError instanceof Error ? reactionError.message : "Reaction failed.");
    }
  }

  async function sendMessage(attachmentId?: number) {
    if (channelComposerDisabled) return;
    if (!selectedRoomId || (!draft.trim() && !attachmentId)) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      if (editingMessage) {
        await authenticatedFetchJson(
          `/api/messages/rooms/${selectedRoomId}/messages/${editingMessage.id}`,
          { method: "PATCH", body: JSON.stringify({ message: draft.trim() }) }
        );
        setNotice("Message edited.");
      } else {
        await authenticatedFetchJson(`/api/messages/rooms/${selectedRoomId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            message: draft.trim(),
            attachmentId,
            replyToId: replyingTo?.id || undefined,
            channelId: selectedChannelId || undefined,
          }),
        });
      }
      setDraft("");
      setReplyingTo(null);
      setEditingMessage(null);
      signalTyping(false);
      await Promise.all([loadConversation(selectedRoomId, true), loadRooms(selectedRoomId)]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (!selectedRoomId) return;
    setUploading(true);
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error("Please login again before uploading.");
      }
      const formData = new FormData();
      formData.set("roomId", selectedRoomId);
      formData.set("file", file);
      const response = await fetch("/api/messages/attachments", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        attachment?: { id: number };
      };
      if (!response.ok || !payload.attachment?.id) {
        throw new Error(payload.error || "Attachment upload failed.");
      }
      await sendMessage(payload.attachment.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Attachment upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function reportMessage(message: Message) {
    const reason = window.prompt(
      "Report reason: scam, off_platform_payment, external_contact, harassment, spam, suspicious_attachment, or other",
      "scam"
    );
    if (!reason) return;
    const details = window.prompt("Optional details for the moderator", "") || "";
    try {
      await authenticatedFetchJson("/api/messages/reports", {
        method: "POST",
        body: JSON.stringify({ messageId: message.id, reason, details }),
      });
      setNotice("Message reported to ComePlayers moderation.");
      await loadConversation(selectedRoomId, true);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Report failed.");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] text-white">
        <p className="text-xl font-black text-cyan-300">Loading protected messages...</p>
      </main>
    );
  }

  const roomLocked = String(selectedRoom?.status || "active").toLowerCase() !== "active";

  return (
    <main className="min-h-screen bg-[#020617] text-white lg:grid lg:grid-cols-[84px_minmax(0,1fr)]">
      <nav className="hidden border-r border-white/10 bg-[#050814] px-3 py-4 lg:flex lg:flex-col lg:items-center lg:gap-3">
        <Link
          href="/"
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400 font-black text-black shadow-lg shadow-cyan-950/30"
          title="ComePlayers"
        >
          CP
        </Link>
        {roomBuckets.map((bucket) => (
          <button
            key={bucket.id}
            type="button"
            onClick={() => setRoomBucket(bucket.id)}
            title={bucket.label}
            className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-2xl border text-lg transition ${
              roomBucket === bucket.id
                ? "border-cyan-300 bg-cyan-400 text-black"
                : "border-white/10 bg-[#0b1020] text-gray-300 hover:border-cyan-400/50 hover:text-cyan-200"
            }`}
          >
            {bucket.icon}
            {bucket.count > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                {bucket.count > 99 ? "99+" : bucket.count}
              </span>
            ) : null}
          </button>
        ))}
        <div className="mt-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
          <FaCircle className="text-xs" />
        </div>
      </nav>

      <section className="min-w-0">
        <header className="border-b border-white/10 bg-[#07101f] px-5 py-4">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-300">
                <span className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5">
                  <FaShieldAlt /> Protected Messages
                </span>
                <span className="rounded-lg border border-white/10 px-3 py-1.5 text-gray-400">
                  {roomStats.unread} unread
                </span>
                <span className="rounded-lg border border-red-400/30 px-3 py-1.5 text-red-200">
                  {roomStats.live} live
                </span>
              </div>
              <h1 className="mt-2 truncate text-2xl font-black">ComePlayers Community</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/discover"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-cyan-400/40 px-4 text-sm font-black text-cyan-200 hover:bg-cyan-400 hover:text-black"
              >
                Marketplace
              </Link>
              <Link
                href="/resolution-center"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-orange-400/60 px-4 text-sm font-black text-orange-300 hover:bg-orange-400 hover:text-black"
              >
                Resolution Center
              </Link>
            </div>
          </div>
        </header>

        <section className="grid min-h-[calc(100vh-89px)] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="overflow-hidden border-b border-white/10 bg-[#0b1020] lg:border-b-0 lg:border-r">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center gap-3">
              <ProfileAvatar
                profile={profile}
                size="lg"
                className="bg-cyan-400 text-black"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{displayName(profile)}</p>
                <p className="text-xs font-bold text-cyan-300">
                  {isAdmin ? "Admin community controls" : "Protected by anti-scam filters"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search chats or groups"
                className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
              {isAdmin ? (
                <button
                  onClick={() => setShowCreateGroup((current) => !current)}
                  className="flex w-12 items-center justify-center rounded-2xl border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400 hover:text-black"
                  title="Create group chat"
                >
                  {showCreateGroup ? <FaTimes /> : <FaPlus />}
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2 lg:hidden">
              {roomBuckets.map((bucket) => (
                <button
                  key={bucket.id}
                  type="button"
                  onClick={() => setRoomBucket(bucket.id)}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-xl border text-[10px] font-black ${
                    roomBucket === bucket.id
                      ? "border-cyan-300 bg-cyan-400 text-black"
                      : "border-white/10 bg-black/30 text-gray-300"
                  }`}
                >
                  <span className="text-sm">{bucket.icon}</span>
                  {bucket.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                  Live
                </p>
                <p className="mt-1 text-xl font-black text-red-300">{roomStats.live}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                  Unread
                </p>
                <p className="mt-1 text-xl font-black text-cyan-300">{roomStats.unread}</p>
              </div>
            </div>
          </div>

          {isAdmin && showCreateGroup ? (
            <div className="border-b border-white/10 bg-black/20 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-black text-cyan-300">
                <FaUserShield /> New Group Chat
              </div>
              <input
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
                maxLength={80}
                placeholder="Group name"
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
              <textarea
                value={groupDescription}
                onChange={(event) => setGroupDescription(event.target.value)}
                maxLength={240}
                rows={3}
                placeholder="Short description"
                className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black px-3 py-3 text-sm outline-none placeholder:text-gray-500 focus:border-cyan-400"
              />
              <div className="mt-3 max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-[#070b16]">
                {loadingCandidates ? (
                  <div className="p-4 text-sm text-gray-400">Loading users...</div>
                ) : filteredCandidates.length ? (
                  filteredCandidates.map((candidate) => {
                    const checked = selectedMemberIds.includes(candidate.id);
                    return (
                      <button
                        key={candidate.id}
                        onClick={() => toggleMember(candidate.id)}
                        className={`flex w-full items-center gap-3 border-b border-white/5 p-3 text-left last:border-b-0 hover:bg-white/5 ${
                          checked ? "bg-cyan-400/10" : ""
                        }`}
                      >
                        <ProfileAvatar profile={candidate} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black">
                            {displayName(candidate)}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {candidate.email}
                          </span>
                        </span>
                        <span
                          className={`h-4 w-4 rounded border ${
                            checked ? "border-cyan-400 bg-cyan-400" : "border-white/30"
                          }`}
                        />
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-sm text-gray-400">No users available.</div>
                )}
              </div>
              <button
                onClick={() => void createGroup()}
                disabled={creatingGroup || groupTitle.trim().length < 3}
                className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-black hover:bg-cyan-300 disabled:opacity-50"
              >
                {creatingGroup ? "Creating..." : `Create Group (${selectedMemberIds.length + 1})`}
              </button>
            </div>
          ) : null}

          <div className="border-b border-white/10 px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                {roomBuckets.find((bucket) => bucket.id === roomBucket)?.label || "Channels"}
              </p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-gray-300">
                {filteredRooms.length}
              </span>
            </div>
          </div>

          <div className="max-h-[calc(100vh-365px)] overflow-y-auto">
            {filteredRooms.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">
                {isAdmin ? "Create a group or open a product chat." : "No conversations yet. Open a product and select Chat Seller."}
              </div>
            ) : (
              filteredRooms.map((room) => {
                const group = isGroupRoom(room);
                const live = String(room.stream_status || "").toLowerCase() === "live";
                return (
                  <button
                    key={room.id}
                    onClick={() => {
                      setCommunityChannelSelection(null);
                      setSelectedRoomId(room.id);
                    }}
                    className={`flex w-full gap-3 border-b border-white/10 p-4 text-left transition hover:bg-white/5 ${
                      selectedRoomId === room.id ? "bg-white/10" : ""
                    }`}
                    >
                    <ProfileAvatar
                      profile={group ? null : room.other}
                      size="lg"
                      fallback={group ? <FaUsers /> : roomInitial(room)}
                      className={group ? "bg-cyan-400 text-black" : "bg-white/10 text-cyan-300"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-black">{roomTitle(room)}</p>
                        <p className="shrink-0 text-[11px] text-gray-500">
                          {formatDate(room.last_message_at || room.created_at)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-sm text-gray-400">
                        {room.last_message || "Conversation created"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {group ? (
                          <span className="text-xs font-bold text-cyan-300">
                            {room.member_count || 0} members
                          </span>
                        ) : null}
                        {live ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                            <FaCircle className="text-[7px]" /> Live
                          </span>
                        ) : null}
                        {room.order_id ? (
                          <span className="text-xs font-bold text-yellow-300">
                            Order #{room.order_id}
                          </span>
                        ) : null}
                        {room.unread_count > 0 ? (
                          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black">
                            {room.unread_count}
                          </span>
                        ) : null}
                        {room.status === "locked" ? (
                          <span className="text-xs text-red-300">Locked</span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden border-b border-white/10 bg-[#070b16] lg:border-b-0">
          {!selectedRoom ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div>
                <FaLock className="mx-auto text-4xl text-cyan-300" />
                <h2 className="mt-4 text-3xl font-black">Select a conversation</h2>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-white/10 bg-[#0b1020] p-5">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div className="flex items-center gap-4">
                    <ProfileAvatar
                      profile={selectedIsGroup ? null : selectedRoom.other}
                      size="lg"
                      fallback={selectedIsGroup ? <FaUsers /> : roomInitial(selectedRoom)}
                      className="bg-cyan-400 text-black"
                    />
                    <div className="min-w-0">
                      <h2 className="truncate font-black">
                        {selectedIsGroup && selectedCommunityChannel
                          ? `${selectedCommunityChannel.channel_type === "voice" ? "Voice: " : "#"}${selectedCommunityChannel.name}`
                          : roomTitle(selectedRoom)}
                      </h2>
                      <p className="text-xs text-cyan-300">
                        {selectedIsGroup
                          ? `${roomTitle(selectedRoom)} · ${conversation?.room.member_count || selectedRoom.member_count || 0} members`
                          : selectedRoom.order_id
                            ? `Order #${selectedRoom.order_id}`
                            : "Pre-sale product chat"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedIsGroup &&
                    String(selectedRoom.stream_status || "").toLowerCase() === "live" ? (
                      <span className="inline-flex h-10 items-center gap-2 rounded-full bg-red-500 px-4 text-sm font-black text-white">
                        <FaCircle className="text-[8px]" /> Live Now
                      </span>
                    ) : null}
                    {selectedRoom.order_id ? (
                      <Link
                        href={`/orders/${selectedRoom.order_id}`}
                        className="rounded-full border border-yellow-400 px-4 py-2 text-sm font-black text-yellow-300 hover:bg-yellow-400 hover:text-black"
                      >
                        Open Order
                      </Link>
                    ) : null}
                    {selectedRoom.product_id ? (
                      <Link
                        href={`/product/${selectedRoom.product_id}`}
                        className="rounded-full border border-cyan-400 px-4 py-2 text-sm font-black text-cyan-300 hover:bg-cyan-400 hover:text-black"
                      >
                        View Product
                      </Link>
                    ) : null}
                  </div>
                </div>
                {selectedIsGroup && selectedRoom.description ? (
                  <p className="mt-3 max-w-3xl text-sm text-gray-400">{selectedRoom.description}</p>
                ) : null}
              </div>

              <div className={`min-h-0 flex-1 ${selectedIsGroup ? "grid xl:grid-cols-[220px_minmax(0,1fr)_260px]" : "flex flex-col"}`}>
                {selectedIsGroup ? (
                  <CommunityChannelSidebar
                    key={selectedRoomId}
                    roomId={selectedRoomId}
                    selectedChannelId={selectedChannelId}
                    onSelectChannel={(channel) => {
                      setCommunityChannelSelection({ roomId: selectedRoomId, channel });
                      setReplyingTo(null);
                      setEditingMessage(null);
                      setDraft("");
                    }}
                    onNotice={setNotice}
                    onError={setError}
                  />
                ) : null}
                <div className="flex min-h-0 flex-col">
                  {selectedRoom.product ? (
                    <div className="border-b border-white/10 bg-cyan-400/5 p-4">
                      <div className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-black/30 p-4">
                        <div className="min-w-0">
                          <p className="text-xs font-black uppercase tracking-wider text-cyan-300">Product Context</p>
                          <p className="truncate font-black">{selectedRoom.product.title || "Product"}</p>
                        </div>
                        <p className="shrink-0 font-black text-green-300">
                          {formatPrice(selectedRoom.product.price || 0)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {selectedIsGroup ? (
                    <GroupLiveStreamPanel
                      key={selectedRoom.id}
                      room={conversation?.room || selectedRoom}
                      userId={userId}
                      profile={profile}
                      onRoomRefresh={refreshSelectedRoom}
                    />
                  ) : (
                    <div className="border-b border-yellow-400/20 bg-yellow-400/10 px-5 py-3 text-sm text-yellow-100">
                      <strong>Safety:</strong> Never move payment outside ComePlayers. Sellers must send account credentials through the encrypted delivery form on the order page, not chat.
                    </div>
                  )}

                  {selectedIsGroup && selectedCommunityChannel ? (
                    <div className="border-b border-white/10 bg-black/20 px-5 py-3 text-sm text-gray-300">
                      <strong className="text-cyan-300">
                        {selectedCommunityChannel.channel_type === "voice"
                          ? `🔊 ${selectedCommunityChannel.name}`
                          : `#${selectedCommunityChannel.name}`}
                      </strong>
                      {selectedCommunityChannel.topic ? ` — ${selectedCommunityChannel.topic}` : ""}
                      {selectedChannelIsVoice ? (
                        <span className="ml-2 text-emerald-300">Secure LiveKit voice, video, and screen sharing are available in this channel.</span>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedIsGroup ? (
                    <CommunityVoicePanel
                      key={`community-voice:${selectedRoom.id}`}
                      roomId={selectedRoom.id}
                      selectedChannel={selectedCommunityChannel}
                      onNotice={setNotice}
                      onError={setError}
                    />
                  ) : null}

                  <div className="flex-1 overflow-y-auto p-5">
                    {selectedChannelIsVoice ? (
                      <div className="flex h-full min-h-52 items-center justify-center text-center text-sm text-gray-500">
                        <div>
                          <FaHeadphones className="mx-auto mb-3 text-3xl text-emerald-300" />
                          <p className="font-black text-gray-300">Voice channel selected</p>
                          <p className="mt-1">Use the LiveKit controls above to talk, enable video, share your screen, or leave.</p>
                        </div>
                      </div>
                    ) : loadingMessages ? (
                      <div className="flex h-full items-center justify-center text-gray-400">Loading chat...</div>
                    ) : conversation?.messages?.length ? (
                      <div className="space-y-5">
                        {conversation.messages.map((message) => {
                          const mine = message.sender_id === userId;
                          const sender =
                            message.sender ||
                            memberProfileMap.get(String(message.sender_id)) ||
                            null;
                          const imageAttachment = isImageAttachment(message.attachment);
                          const showMessageText = Boolean(
                            message.message &&
                              !(imageAttachment && isGenericAttachmentMessage(message.message))
                          );
                          const imageOnly = imageAttachment && !showMessageText;
                          if (selectedIsGroup) {
                            return (
                              <div
                                key={message.id}
                                className={`group flex gap-3 rounded-2xl px-2 py-1 transition hover:bg-white/[0.03] ${
                                  message.deleted_at ? "opacity-60" : ""
                                }`}
                              >
                                <ProfileAvatar
                                  profile={sender}
                                  size="message"
                                  className={mine ? "ring-cyan-400/40" : ""}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <p className="truncate text-sm font-black text-white">
                                      {displayName(sender)}
                                    </p>
                                    {mine ? (
                                      <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-300">
                                        You
                                      </span>
                                    ) : null}
                                    <span className="text-[11px] text-gray-500">
                                      {formatDate(message.created_at)}
                                    </span>
                                    {message.moderation_status === "reported" ? (
                                      <span className="text-[11px] text-red-300">Reported</span>
                                    ) : null}
                                  </div>
                                  <MessageReplyPreview reply={message.reply_to} />
                                  {showMessageText || message.attachment ? (
                                    <div
                                      className={`mt-1 max-w-[880px] ${
                                        imageOnly
                                          ? ""
                                          : "rounded-2xl bg-white/[0.07] px-4 py-3 text-white"
                                      }`}
                                    >
                                      {showMessageText ? (
                                        <p className="whitespace-pre-wrap text-sm leading-6">
                                          {message.message}
                                        </p>
                                      ) : null}
                                      {message.attachment ? (
                                        <div className={showMessageText ? "mt-3" : ""}>
                                          <AttachmentViewer attachment={message.attachment} />
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  <MessageInteractions
                                    message={message}
                                    mine={mine}
                                    onReply={() => beginReply(message)}
                                    onEdit={() => beginEdit(message)}
                                    onDelete={() => void deleteMessage(message)}
                                    onReact={(emoji) => void toggleReaction(message, emoji)}
                                    onReport={() => void reportMessage(message)}
                                  />
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={message.id}
                              className={`flex items-end gap-3 ${mine ? "justify-end" : "justify-start"}`}
                            >
                              {!mine ? (
                                <ProfileAvatar profile={sender} size="message" />
                              ) : null}
                              <div className={`group max-w-[82%] ${mine ? "text-right" : "text-left"}`}>
                                <MessageReplyPreview reply={message.reply_to} />
                                <div
                                  className={`${
                                    imageOnly
                                      ? "rounded-2xl p-0 shadow-none"
                                      : `rounded-3xl px-5 py-4 shadow-xl ${
                                          mine ? "bg-cyan-400 text-black" : "bg-white/10 text-white"
                                        }`
                                  } ${message.deleted_at ? "opacity-60" : ""}`}
                                >
                                  {showMessageText ? (
                                    <p className="whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                                  ) : null}
                                  {message.attachment ? (
                                    <div className={showMessageText ? "mt-3" : ""}>
                                      <AttachmentViewer attachment={message.attachment} />
                                    </div>
                                  ) : null}
                                  <div className={`mt-2 flex items-center gap-2 text-[11px] ${
                                    mine
                                      ? imageOnly
                                        ? "justify-end text-gray-500"
                                        : "justify-end text-black/60"
                                      : "text-gray-500"
                                  }`}>
                                    <span>{formatDate(message.created_at)}</span>
                                    {message.edited_at ? <span>Edited</span> : null}
                                    {mine && !selectedIsGroup ? (
                                      <span>{message.is_read ? "Read" : "Sent"}</span>
                                    ) : null}
                                    {message.moderation_status === "reported" ? <span>Reported</span> : null}
                                  </div>
                                </div>
                                <MessageInteractions
                                  message={message}
                                  mine={mine}
                                  onReply={() => beginReply(message)}
                                  onEdit={() => beginEdit(message)}
                                  onDelete={() => void deleteMessage(message)}
                                  onReact={(emoji) => void toggleReaction(message, emoji)}
                                  onReport={() => void reportMessage(message)}
                                />
                              </div>
                              {mine ? (
                                <ProfileAvatar
                                  profile={sender || profile}
                                  size="message"
                                  className="ring-cyan-400/40"
                                />
                              ) : null}
                            </div>
                          );
                        })}
                        <div ref={bottomRef} />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-center">
                        <div>
                          {selectedIsGroup ? (
                            <FaUsers className="mx-auto text-4xl text-cyan-300" />
                          ) : (
                            <FaShieldAlt className="mx-auto text-4xl text-cyan-300" />
                          )}
                          <h2 className="mt-4 text-2xl font-black">
                            {selectedIsGroup ? "Start the group conversation" : "Start a protected conversation"}
                          </h2>
                          <p className="mt-2 text-gray-400">
                            {selectedIsGroup
                              ? "Share updates with the group or start a live gameplay session."
                              : "Ask about the product without sharing external contact details."}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {!selectedChannelIsVoice && Object.values(typingUsers).length ? (
                    <div className="px-5 pb-2 text-xs font-bold text-cyan-300">
                      {Object.values(typingUsers).map((entry) => entry.name).slice(0, 3).join(", ")} typing…
                    </div>
                  ) : null}

                  <div className="border-t border-white/10 bg-[#0b1020] p-5">
                    {notice ? (
                      <div className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
                        {notice}
                      </div>
                    ) : null}
                    {error ? (
                      <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
                        <FaExclamationTriangle className="mt-0.5 shrink-0" /> {error}
                      </div>
                    ) : null}

                    {selectedChannelIsVoice ? (
                      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-100">
                        Voice channels use the LiveKit controls above and do not accept text messages.
                      </div>
                    ) : roomLocked ? (
                      <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-center font-black text-red-200">
                        This conversation is locked by moderation.
                      </div>
                    ) : (
                      <>
                        {replyingTo || editingMessage ? (
                          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm">
                            <div className="min-w-0">
                              <p className="font-black text-cyan-200">
                                {editingMessage
                                  ? "Editing your message"
                                  : `Replying to ${displayName(replyingTo?.sender)}`}
                              </p>
                              <p className="mt-1 truncate text-xs text-gray-400">
                                {(editingMessage?.message || replyingTo?.message || "Attachment").slice(0, 140)}
                              </p>
                            </div>
                            <button type="button" onClick={cancelComposerMode} className="rounded-lg p-2 text-gray-300 hover:bg-white/10" title="Cancel">
                              <FaTimes />
                            </button>
                          </div>
                        ) : null}
                        {!selectedIsGroup ? (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {[
                              "Is this product still available?",
                              "What is the delivery estimate?",
                              "I have completed payment through ComePlayers.",
                            ].map((text) => (
                              <button
                                key={text}
                                onClick={() => setDraft(text)}
                                className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-white hover:text-black"
                              >
                                {text}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadAttachment(file);
                          }}
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={sending || uploading || Boolean(editingMessage) || channelComposerDisabled}
                            className="flex w-14 items-center justify-center rounded-2xl border border-white/10 bg-black text-cyan-300 hover:border-cyan-400 disabled:opacity-50"
                            title="Upload private image or PDF"
                          >
                            <FaPaperclip />
                          </button>
                          <textarea
                            value={draft}
                            onChange={(event) => updateDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void sendMessage();
                              }
                            }}
                            rows={2}
                            maxLength={2000}
                            disabled={channelComposerDisabled}
                            placeholder={
                              selectedIsGroup
                                ? selectedChannelIsVoice
                                  ? "Voice channels do not accept text messages."
                                  : `Message #${selectedCommunityChannel?.name || "general"}`
                                : "Type a message. External contacts, links, and credentials are blocked."
                            }
                            className="min-h-[56px] flex-1 resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm outline-none placeholder:text-gray-500 focus:border-cyan-400"
                          />
                          <button
                            onClick={() => void sendMessage()}
                            disabled={sending || uploading || !draft.trim() || channelComposerDisabled}
                            className="w-24 rounded-2xl bg-cyan-400 font-black text-black hover:bg-cyan-300 disabled:opacity-50"
                          >
                            {sending || uploading ? "..." : editingMessage ? "Save" : "Send"}
                          </button>
                        </div>
                        <p className="mt-2 text-right text-xs text-gray-500">{draft.length}/2000</p>
                      </>
                    )}
                  </div>
                </div>

                {selectedIsGroup ? (
                  <aside className="hidden border-l border-white/10 bg-[#0b1020] xl:block">
                    <div className="border-b border-white/10 p-4">
                      <div className="flex items-center gap-2 text-sm font-black text-cyan-300">
                        <FaUsers /> Members
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {conversationMembers.length} active in this group
                      </p>
                    </div>
                    {canManageSelectedGroupMembers ? (
                      <form
                        className="border-b border-white/10 p-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void inviteMember();
                        }}
                      >
                        <label className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                          Invite member
                        </label>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={inviteIdentifier}
                            onChange={(event) => setInviteIdentifier(event.target.value)}
                            placeholder="Email or @username"
                            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-3 py-2 text-xs outline-none placeholder:text-gray-600 focus:border-cyan-400"
                          />
                          <button
                            type="submit"
                            disabled={
                              !inviteIdentifier.trim() ||
                              memberActionBusy.startsWith("invite:")
                            }
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-black hover:bg-cyan-300 disabled:opacity-50"
                            title="Invite user"
                          >
                            <FaUserPlus />
                          </button>
                        </div>
                      </form>
                    ) : null}
                    <div className="max-h-[720px] overflow-y-auto p-3">
                      {conversationMembers.map((member) => {
                        const memberProfile = member.profile;
                        const liveHost = selectedRoom.stream_host_id === member.user_id;
                        const role = String(member.member_role || "member").toLowerCase();
                        const canRemoveMember =
                          canManageSelectedGroupMembers &&
                          member.user_id !== userId &&
                          role !== "owner";
                        const removing = memberActionBusy === `remove:${member.user_id}`;
                        return (
                          <div
                            key={member.user_id}
                            className="mb-2 flex items-center gap-3 rounded-xl p-2 hover:bg-white/5"
                          >
                            <ProfileAvatar profile={memberProfile} size="md" live={liveHost} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black">{displayName(memberProfile)}</p>
                              <p className="text-xs text-gray-500">{memberRoleLabel(member.member_role)}</p>
                            </div>
                            {canRemoveMember ? (
                              <button
                                onClick={() => void removeMember(member)}
                                disabled={removing}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-400/30 text-red-300 opacity-70 transition hover:bg-red-500 hover:text-white hover:opacity-100 disabled:opacity-40"
                                title={`Remove ${displayName(memberProfile)}`}
                              >
                                <FaUserMinus />
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </aside>
                ) : null}
              </div>
            </>
          )}
        </section>
        </section>
      </section>
    </main>
  );
}
