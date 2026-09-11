"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBullhorn,
  FaComments,
  FaHashtag,
  FaLock,
  FaPlus,
  FaShoppingCart,
  FaTrophy,
  FaVolumeUp,
} from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";

export type CommunityCategory = {
  id: string;
  community_id: string;
  name: string;
  position: number;
};

export type CommunityChannel = {
  id: string;
  community_id: string;
  category_id?: string | null;
  name: string;
  channel_type: "text" | "announcement" | "voice";
  topic?: string | null;
  position: number;
  is_private: boolean;
  is_read_only: boolean;
  is_default: boolean;
  unread_count?: number;
};

export type CommunityBundle = {
  community: {
    id: string;
    room_id: string;
    name: string;
    description?: string | null;
    icon_url?: string | null;
    status?: string | null;
  };
  categories: CommunityCategory[];
  channels: CommunityChannel[];
  currentUser: {
    memberRole: string;
    permissions: string[];
    isOwner: boolean;
    isAdmin: boolean;
  };
};

type Props = {
  roomId: string;
  selectedChannelId: string;
  onSelectChannel: (channel: CommunityChannel, source?: "auto" | "user" | "shortcut") => void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
  onBundleChange?: (bundle: CommunityBundle) => void;
  preferredChannelId?: string;
  voiceShortcutToken?: number;
  activeVoice?: {
    channelId: string;
    participantCount: number;
    connected: boolean;
  };
};

function channelIcon(channel: CommunityChannel) {
  const normalizedName = channel.name.toLowerCase();
  if (channel.channel_type === "voice") return <FaVolumeUp />;
  if (channel.channel_type === "announcement") return <FaBullhorn />;
  if (normalizedName.includes("esport") || normalizedName.includes("tournament")) {
    return <FaTrophy />;
  }
  if (normalizedName.includes("market") || normalizedName.includes("shop")) {
    return <FaShoppingCart />;
  }
  if (channel.is_default || normalizedName === "general") return <FaComments />;
  return <FaHashtag />;
}

export default function CommunityChannelSidebar({
  roomId,
  selectedChannelId,
  onSelectChannel,
  onNotice,
  onError,
  onBundleChange,
  preferredChannelId = "",
  voiceShortcutToken = 0,
  activeVoice,
}: Props) {
  const [bundle, setBundle] = useState<CommunityBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const handledVoiceShortcutRef = useRef(0);
  const permissions = useMemo(
    () => new Set(bundle?.currentUser.permissions || []),
    [bundle?.currentUser.permissions],
  );
  const canManageChannels =
    Boolean(bundle?.currentUser.isAdmin || bundle?.currentUser.isOwner) ||
    permissions.has("*") ||
    permissions.has("manage_channels");


  async function loadBundle(requestedChannelId?: string) {
    if (!roomId) return;
    setLoading(true);
    try {
      const data = await authenticatedFetchJson<CommunityBundle>(
        `/api/messages/communities/by-room/${roomId}`,
      );
      setBundle(data);
      onBundleChange?.(data);
      const targetChannelId = requestedChannelId || preferredChannelId;
      const preferred =
        data.channels.find((channel) => channel.id === targetChannelId) ||
        data.channels.find((channel) => channel.id === selectedChannelId) ||
        data.channels.find((channel) => channel.is_default) ||
        data.channels.find((channel) => channel.channel_type !== "voice") ||
        data.channels[0];
      if (preferred && preferred.id !== selectedChannelId)
        onSelectChannel(preferred, "auto");
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Unable to load server channels.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // The parent keys this sidebar by room ID, so every room starts with fresh
    // local channel state while this request hydrates its community bundle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBundle(preferredChannelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (
      !voiceShortcutToken ||
      !bundle ||
      handledVoiceShortcutRef.current === voiceShortcutToken
    )
      return;
    handledVoiceShortcutRef.current = voiceShortcutToken;
    const voiceChannel = bundle.channels.find(
      (channel) => channel.channel_type === "voice",
    );
    if (!voiceChannel) {
      onError?.("This server does not have a voice channel yet.");
      return;
    }
    onSelectChannel(voiceChannel, "shortcut");
      onNotice?.(`Opened server voice channel ${voiceChannel.name}.`);
  }, [voiceShortcutToken, bundle, onError, onNotice, onSelectChannel]);

  async function createChannel(
    category: CommunityCategory,
    type: CommunityChannel["channel_type"],
  ) {
    if (!bundle || !canManageChannels) return;
    const example =
      type === "voice"
        ? "gaming-lounge"
        : type === "announcement"
          ? "updates"
          : "new-channel";
    const name = window.prompt(`Channel name (${type})`, example)?.trim();
    if (!name) return;
    const topic = window.prompt("Optional channel topic", "") || "";
    setBusy(`channel:${category.id}`);
    try {
      const data = await authenticatedFetchJson<{ channel: CommunityChannel }>(
        `/api/messages/communities/${bundle.community.id}/channels`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            type,
            topic,
            categoryId: category.id,
          }),
        },
      );
      onNotice?.(`#${data.channel.name} created.`);
      await loadBundle(data.channel.id);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Channel could not be created.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createCategory() {
    if (!bundle || !canManageChannels) return;
    const name = window.prompt("Category name", "NEW HUB")?.trim();
    if (!name) return;
    setBusy("category");
    try {
      await authenticatedFetchJson(
        `/api/messages/communities/${bundle.community.id}/categories`,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );
      onNotice?.(`${name.toUpperCase()} category created.`);
      await loadBundle(selectedChannelId);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error.message
          : "Category could not be created.",
      );
    } finally {
      setBusy("");
    }
  }

  if (loading && !bundle) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-gray-500">
        Loading channels...
      </div>
    );
  }

  if (!bundle) return null;

  const textChannels = bundle.channels
    .filter((channel) => channel.channel_type !== "voice")
    .sort((a, b) => a.position - b.position);
  const voiceChannels = bundle.channels
    .filter((channel) => channel.channel_type === "voice")
    .sort((a, b) => a.position - b.position);

  function categoryFor(type: CommunityChannel["channel_type"]) {
    const expected = type === "voice" ? "VOICE" : type === "announcement" ? "INFORMATION" : "TEXT";
    return (
      bundle?.categories.find((category) => category.name.toUpperCase().includes(expected)) ||
      bundle?.categories[0] ||
      null
    );
  }

  const textCategory = categoryFor("text");
  const voiceCategory = categoryFor("voice");

  return (
    <div
      data-community-sidebar
      className="relative flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-10"
    >
      <section className="shrink-0 rounded-xl border border-cyan-400/12 bg-black/10 p-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
              Chat Hub
            </span>
            <span className="h-1 w-1 rounded-full bg-cyan-400/70" />
          </div>
          {canManageChannels && textCategory ? (
            <button
              type="button"
              onClick={() => void createChannel(textCategory, "text")}
              disabled={busy === `channel:${textCategory.id}`}
              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-50"
              title="Create chat channel"
            >
              <FaPlus />
            </button>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          {textChannels.length ? (
            textChannels.map((channel) => (
              <ChannelButton
                key={channel.id}
                channel={channel}
                active={selectedChannelId === channel.id}
                onClick={() => onSelectChannel(channel, "user")}
              />
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-[10px] text-gray-600">
              No chat channels yet.
            </p>
          )}
        </div>
      </section>

      <section className="min-h-0 flex-1 rounded-xl border border-cyan-400/12 bg-black/10 p-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">
              Voice Lobbies
            </span>
            <span className="flex items-end gap-px" aria-hidden="true">
              {[5, 9, 13, 8].map((height, index) => (
                <i
                  key={index}
                  className="block w-0.5 rounded-full bg-cyan-300/60"
                  style={{ height }}
                />
              ))}
            </span>
          </div>
          {canManageChannels && voiceCategory ? (
            <button
              type="button"
              onClick={() => void createChannel(voiceCategory, "voice")}
              disabled={busy === `channel:${voiceCategory.id}`}
              className="flex h-6 w-6 items-center justify-center rounded-md text-gray-500 transition hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-50"
              title="Create voice lobby"
            >
              <FaPlus />
            </button>
          ) : null}
        </div>
        <div className="max-h-full space-y-1.5 overflow-y-auto pr-0.5">
          {voiceChannels.length ? (
            voiceChannels.map((channel) => (
              <VoiceChannelButton
                key={channel.id}
                channel={channel}
                active={selectedChannelId === channel.id}
                connected={Boolean(activeVoice?.connected && activeVoice.channelId === channel.id)}
                participantCount={
                  activeVoice?.channelId === channel.id
                    ? activeVoice.participantCount
                    : 0
                }
                onClick={() => onSelectChannel(channel, "user")}
              />
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-[10px] text-gray-600">
              No voice lobbies yet.
            </p>
          )}
        </div>
      </section>

      {canManageChannels ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <button
            type="button"
            onClick={() => void createCategory()}
            disabled={busy === "category"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-gray-400 transition hover:border-cyan-400/35 hover:bg-cyan-400/10 hover:text-cyan-200 disabled:opacity-50"
            title="Create channel category"
          >
            <FaPlus />
          </button>
        </div>
      ) : null}

      <div className="sr-only">
        Role: {bundle.currentUser.memberRole || "member"}
      </div>
    </div>
  );
}

function ChannelButton({
  channel,
  active,
  onClick,
}: {
  channel: CommunityChannel;
  active: boolean;
  onClick: () => void;
}) {
  const unread = Number(channel.unread_count || 0);
  return (
    <button
      data-community-channel
      type="button"
      onClick={onClick}
      title={channel.topic || channel.name}
      className={`group flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition ${
        active
          ? "border-cyan-400/60 bg-gradient-to-r from-cyan-400/15 to-cyan-400/[0.04] text-cyan-50 shadow-[inset_3px_0_0_#22d3ee]"
          : "border-white/[0.065] bg-white/[0.018] text-gray-300 hover:border-cyan-400/25 hover:bg-cyan-400/[0.055]"
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          channel.channel_type === "announcement"
            ? "bg-yellow-400/10 text-yellow-300"
            : active
              ? "bg-cyan-400/15 text-cyan-200"
              : "bg-white/5 text-cyan-300/80"
        }`}
      >
        {channelIcon(channel)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-black leading-4">
          {channel.name}
        </span>
      </span>
      {unread > 0 ? (
        <span
          className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[8px] font-black ${
            channel.channel_type === "announcement"
              ? "bg-yellow-400 text-black"
              : "bg-cyan-400 text-black"
          }`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
      {channel.is_private ? <FaLock className="text-[9px] text-gray-600" /> : null}
    </button>
  );
}

function VoiceChannelButton({
  channel,
  active,
  connected,
  participantCount,
  onClick,
}: {
  channel: CommunityChannel;
  active: boolean;
  connected: boolean;
  participantCount: number;
  onClick: () => void;
}) {
  const live = channel.name.toLowerCase().includes("scrim") || channel.name.toLowerCase().includes("live");
  return (
    <button
      data-community-channel
      data-voice-channel
      type="button"
      onClick={onClick}
      title={channel.topic || channel.name}
      className={`group flex min-h-10 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${
        active
          ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
          : "border-white/[0.065] bg-white/[0.018] text-gray-300 hover:border-cyan-400/30 hover:bg-cyan-400/[0.05]"
      }`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${connected ? "bg-emerald-400/15 text-emerald-300" : live ? "bg-red-400/10 text-red-300" : "bg-cyan-400/10 text-cyan-300"}`}>
        {channelIcon(channel)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-black leading-4">{channel.name}</span>
      </span>
      {connected ? (
        <span className="rounded-md bg-emerald-400/10 px-1.5 py-1 text-[8px] font-black text-emerald-300">
          {participantCount}
        </span>
      ) : (
        <span className="rounded-md border border-cyan-400/20 px-1.5 py-1 text-[8px] font-black text-cyan-300 opacity-0 transition group-hover:opacity-100">
          Open
        </span>
      )}
    </button>
  );
}
