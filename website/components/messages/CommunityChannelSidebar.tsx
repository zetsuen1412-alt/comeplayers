"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaBullhorn, FaChevronDown, FaCog, FaHashtag, FaLock, FaPlus, FaSearch, FaSyncAlt, FaVolumeUp } from "react-icons/fa";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { createRefreshQueue } from "@/lib/live/refresh-queue";
import CommunityChannelEditor, { type ChannelEditorTarget } from "./CommunityChannelEditor";

export type CommunityCategory = { id: string; community_id: string; name: string; position: number };
export type CommunityChannel = {
  id: string; community_id: string; category_id?: string | null; name: string;
  channel_type: "text" | "announcement" | "voice"; topic?: string | null; position: number;
  is_private: boolean; is_read_only: boolean; is_default: boolean; unread_count?: number;
};
export type CommunityBundle = {
  community: { id: string; room_id: string; name: string; description?: string | null; icon_url?: string | null; status?: string | null };
  categories: CommunityCategory[];
  channels: CommunityChannel[];
  currentUser: { userId?: string; memberRole: string; permissions: string[]; isOwner: boolean; isAdmin: boolean };
};
type Props = {
  roomId: string; selectedChannelId: string;
  onSelectChannel: (channel: CommunityChannel, source?: "auto" | "user" | "shortcut") => void;
  onNotice?: (message: string) => void; onError?: (message: string) => void;
  onBundleChange?: (bundle: CommunityBundle) => void; preferredChannelId?: string;
  voiceShortcutToken?: number;
  activeVoice?: { channelId: string; participantCount: number; connected: boolean };
};

export default function CommunityChannelSidebar(props: Props) {
  const { roomId, selectedChannelId, activeVoice, voiceShortcutToken = 0 } = props;
  const [bundle, setBundle] = useState<CommunityBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showManageControls, setShowManageControls] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<ChannelEditorTarget | null>(null);
  const [connection, setConnection] = useState("Connecting");
  const [syncedAt, setSyncedAt] = useState("");
  const current = useRef(props);
  const requestRef = useRef<AbortController | null>(null);
  const refreshQueue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  const lastSnapshot = useRef("");
  const handledVoiceShortcut = useRef(0);
  const realtimeReady = useRef(false);
  useEffect(() => { current.current = props; });

  const loadBundle = useCallback(async (requestedChannelId?: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const data = await authenticatedFetchJson<CommunityBundle>(
        `/api/messages/communities/by-room/${roomId}`, { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const snapshot = JSON.stringify(data);
      const latest = current.current;
      if (snapshot !== lastSnapshot.current) {
        lastSnapshot.current = snapshot;
        setBundle(data);
        latest.onBundleChange?.(data);
      }
      setError("");
      setSyncedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      // Background updates may briefly omit a channel. Keep the user's
      // selection instead of silently jumping to another room on every sync.
      if (!latest.selectedChannelId) {
        const target = requestedChannelId || latest.preferredChannelId;
        const preferred = data.channels.find((item) => item.id === target)
          || data.channels.find((item) => item.is_default)
          || data.channels.find((item) => item.channel_type !== "voice") || data.channels[0];
        if (preferred) latest.onSelectChannel(preferred, "auto");
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Unable to load channels.");
        // Remove cached channel metadata if authorization has been revoked.
        const status = (reason as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) { lastSnapshot.current = ""; setBundle(null); }
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    const queue = createRefreshQueue(() => loadBundle(), () => document.visibilityState === "visible" && navigator.onLine);
    refreshQueue.current = queue;
    const initialLoad = window.setTimeout(() => void loadBundle(), 0);
    const wake = () => {
      if (!navigator.onLine) setConnection("Offline");
      else { setConnection(realtimeReady.current ? "Tersambung" : "Menyegarkan"); queue.request(); }
    };
    const timer = window.setInterval(() => queue.request(), 30_000);
    const readChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string; channelId?: string }>).detail;
      if (detail?.roomId !== roomId) return;
      if (!detail.channelId) { queue.request(); return; }
      // A successful local receipt already tells us this channel is read.
      // Fetching all roles/channels again here creates a message -> read ->
      // navigation refresh cascade on every active conversation.
      setBundle(previous => {
        if (!previous || !previous.channels.some(channel => channel.id === detail.channelId && channel.unread_count)) return previous;
        const next = { ...previous, channels: previous.channels.map(channel => channel.id === detail.channelId ? { ...channel, unread_count: 0 } : channel) };
        lastSnapshot.current = JSON.stringify(next);
        return next;
      });
    };
    window.addEventListener("cp-community-read", readChanged);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      queue.dispose();
      if (refreshQueue.current === queue) refreshQueue.current = null;
      window.clearTimeout(initialLoad);
      requestRef.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("cp-community-read", readChanged);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [loadBundle, roomId]);

  const communityId = bundle?.community.id;
  useEffect(() => {
    if (!communityId) return;
    const refresh = () => refreshQueue.current?.request();
    const channel = supabase.channel(`community-navigation:${roomId}:${communityId}`);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms", filter: `id=eq.${roomId}` }, refresh);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, refresh);
    let active = true;
    channel.subscribe((status) => {
      if (!active) return;
      realtimeReady.current = status === "SUBSCRIBED";
      setConnection(!navigator.onLine ? "Offline" : status === "SUBSCRIBED" ? "Tersambung" : "Menyegarkan");
      if (status === "SUBSCRIBED") refresh();
    });
    return () => { active = false; realtimeReady.current = false; void supabase.removeChannel(channel); };
  }, [communityId, roomId, loadBundle]);

  useEffect(() => {
    if (!voiceShortcutToken || !bundle || handledVoiceShortcut.current === voiceShortcutToken) return;
    handledVoiceShortcut.current = voiceShortcutToken;
    const channel = bundle.channels.find((item) => item.channel_type === "voice");
    if (channel) current.current.onSelectChannel(channel, "shortcut");
    else current.current.onError?.("Komunitas ini belum memiliki ruang suara.");
  }, [voiceShortcutToken, bundle]);

  const canManage = Boolean(bundle?.currentUser.isOwner || bundle?.currentUser.isAdmin
    || bundle?.currentUser.permissions.some((permission) => permission === "*" || permission === "manage_channels"));
  const manageControlsVisible = canManage && showManageControls;
  const categoryLabel = (name: string) => {
    const defaults: Record<string, string> = { information: "Info", "text channels": "Ruang chat", "voice channels": "Ruang suara" };
    return defaults[name.trim().toLowerCase()] || name;
  };
  function openEditor(target: ChannelEditorTarget) {
    setSettingsOpen(false);
    setEditor(target);
  }
  const groups = useMemo(() => {
    if (!bundle) return [];
    const needle = query.trim().toLowerCase();
    const channels = bundle.channels.filter((channel) =>
      (!needle || `${channel.name} ${channel.topic || ""}`.toLowerCase().includes(needle))
      && (!unreadOnly || Number(channel.unread_count) > 0),
    ).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const result = [...bundle.categories].sort((a, b) => a.position - b.position).map((category) => ({
      ...category, channels: channels.filter((channel) => channel.category_id === category.id),
    }));
    const known = new Set(bundle.categories.map((category) => category.id));
    const uncategorized = channels.filter((channel) => !channel.category_id || !known.has(channel.category_id));
    if (uncategorized.length) result.push({ id: "uncategorized", community_id: bundle.community.id, name: "Ruang lainnya", position: 999, channels: uncategorized });
    return result.filter((group) => group.channels.length || (canManage && !needle && !unreadOnly));
  }, [bundle, query, unreadOnly, canManage]);

  if (loading && !bundle) return <div role="status" className="rounded-xl bg-white/5 p-4 text-base text-slate-300">Menyiapkan ruang obrolan…</div>;
  if (!bundle) return <div role="alert" className="space-y-3 rounded-xl bg-white/5 p-4 text-base text-slate-300"><p>Ruang obrolan belum dapat dibuka.</p><button type="button" onClick={() => void loadBundle()} className="min-h-11 rounded-lg border border-cyan-300/30 px-4 font-semibold text-cyan-200">Coba lagi</button>{error ? <details className="text-sm text-slate-400"><summary className="min-h-11 cursor-pointer py-3">Rincian masalah</summary><p className="break-words">{error}</p></details> : null}</div>;

  return (
    <nav data-community-sidebar aria-label="Ruang komunitas" className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div data-channel-toolbar className="shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-base font-bold text-white">Ruang</h2>
          <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(value => !value)} className={`min-h-11 rounded-lg px-2 text-sm font-semibold focus-visible:outline-cyan-300 ${unreadOnly ? "bg-cyan-300/15 text-cyan-100" : "text-slate-300 hover:bg-white/5"}`}>Belum dibaca</button>
          <button type="button" aria-label="Pilihan daftar ruang" title="Pilihan daftar ruang" aria-expanded={settingsOpen} aria-controls={`channel-settings-${roomId}`} onClick={() => setSettingsOpen(value => !value)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-cyan-300 ${settingsOpen ? "bg-cyan-300/15 text-cyan-100" : "text-slate-300 hover:bg-white/10"}`}><FaCog aria-hidden="true" /></button>
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-slate-400 focus-within:border-cyan-300"><FaSearch aria-hidden="true" /><input aria-label="Cari ruang obrolan" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari ruang…" className="min-h-11 w-full min-w-0 bg-transparent text-base text-white outline-none placeholder:text-slate-400" /></label>
        {connection === "Offline" ? <p role="status" className="px-1 text-sm text-amber-200">Tidak ada koneksi. Daftar terakhir tetap tersedia.</p> : null}
      </div>
      {settingsOpen ? <div data-channel-settings id={`channel-settings-${roomId}`} className="max-h-64 shrink-0 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-2 text-sm text-slate-300">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-2"><input type="checkbox" checked={showTopics} onChange={(event) => setShowTopics(event.target.checked)} className="h-4 w-4 accent-cyan-300" />Tampilkan deskripsi ruang</label>
        {canManage ? <>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-2"><input type="checkbox" checked={showManageControls} onChange={(event) => { setShowManageControls(event.target.checked); setSettingsOpen(false); }} className="h-4 w-4 accent-cyan-300" />Tampilkan pengaturan ruang</label>
          <button type="button" onClick={() => openEditor({ kind: "channel" })} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left font-semibold text-cyan-200 hover:bg-white/5"><FaPlus aria-hidden="true" />Tambah ruang</button>
          <button type="button" onClick={() => openEditor({ kind: "category" })} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left font-semibold text-cyan-200 hover:bg-white/5"><FaPlus aria-hidden="true" />Tambah kategori</button>
        </> : null}
        <button type="button" aria-label="Muat ulang ruang obrolan" onClick={() => void loadBundle()} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-white/5"><FaSyncAlt aria-hidden="true" />Muat ulang</button>
        <p role="status" className="px-2 pb-1 text-xs text-slate-400">{connection === "Offline" ? "Tidak ada koneksi" : connection === "Connecting" ? "Menghubungkan…" : "Diperbarui otomatis"}{syncedAt ? ` · ${syncedAt}` : ""}</p>
      </div> : null}
      {error ? <div role="alert" className="rounded-lg bg-amber-400/10 p-3 text-sm text-amber-100"><p>Daftar ruang belum dapat diperbarui.</p><button type="button" onClick={() => void loadBundle()} className="min-h-11 font-bold underline">Coba lagi</button></div> : null}
      <div data-channel-list className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {groups.length ? groups.map((group) => {
          const closed = collapsed.has(group.id) && !query && !unreadOnly;
          return <section key={group.id}>
            <div className="flex items-center gap-1">
              <button type="button" aria-expanded={!closed} aria-controls={`category-${group.id}`} onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm font-semibold text-slate-300">
                <FaChevronDown aria-hidden="true" className={closed ? "-rotate-90" : ""} /><span className="truncate">{categoryLabel(group.name)}</span><span className="ml-auto text-gray-500">{group.channels.length}</span>
              </button>
              {manageControlsVisible ? <button type="button" aria-label={`Tambah ruang di ${categoryLabel(group.name)}`} onClick={() => openEditor({ kind: "channel", categoryId: group.id === "uncategorized" ? "" : group.id })} className="flex h-11 w-11 items-center justify-center rounded-lg text-cyan-200 hover:bg-white/10"><FaPlus /></button> : null}
            </div>
            <div id={`category-${group.id}`} hidden={closed} className="space-y-1">
              {group.channels.map((channel) => {
                const active = selectedChannelId === channel.id;
                const connected = Boolean(activeVoice?.connected && activeVoice.channelId === channel.id);
                const unread = Number(channel.unread_count || 0);
                const Icon = channel.channel_type === "voice" ? FaVolumeUp : channel.channel_type === "announcement" ? FaBullhorn : FaHashtag;
                return <div key={channel.id} className={`flex items-center rounded-lg border ${active ? "border-cyan-300/45 bg-cyan-300/10" : "border-transparent hover:bg-white/5"}`}>
                  <button data-community-channel data-voice-channel={channel.channel_type === "voice" || undefined} type="button" aria-current={active ? "page" : undefined} title={channel.topic || channel.name} onClick={() => { setSettingsOpen(false); props.onSelectChannel(channel, "user"); }} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left focus-visible:outline-cyan-300">
                    <Icon aria-hidden="true" className={connected ? "shrink-0 text-emerald-300" : active ? "shrink-0 text-cyan-200" : "shrink-0 text-gray-400"} />
                    <span className="min-w-0 flex-1"><span className={`block break-words text-base ${active || unread ? "font-bold text-white" : "text-slate-200"}`}>{channel.name}</span>{showTopics && channel.topic ? <span className="mt-0.5 block truncate text-sm text-slate-400">{channel.topic}</span> : null}{connected ? <span className="block text-sm text-emerald-300">Terhubung · {activeVoice?.participantCount} peserta</span> : null}</span>
                    {channel.is_private ? <FaLock aria-label="Ruang khusus anggota" className="shrink-0 text-xs text-slate-400" /> : null}
                    {unread > 0 ? <span aria-label={`${unread} pesan belum dibaca`} className="rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-bold text-slate-950">{unread > 99 ? "99+" : unread}</span> : null}
                  </button>
                  {manageControlsVisible ? <button type="button" aria-label={`Pengaturan ruang ${channel.name}`} onClick={() => openEditor({ kind: "channel", channel })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-cyan-200 focus-visible:outline-cyan-300"><FaCog /></button> : null}
                </div>;
              })}
              {!group.channels.length ? <p className="px-2 py-3 text-sm text-slate-400">Tambahkan ruang untuk mulai mengobrol.</p> : null}
            </div>
          </section>;
        }) : <div className="rounded-xl border border-dashed border-white/15 p-4 text-base text-slate-300"><p>{unreadOnly ? "Semua pesan dalam pencarian ini sudah dibaca." : "Ruang tidak ditemukan. Coba nama lain."}</p><button type="button" onClick={() => { setQuery(""); setUnreadOnly(false); }} className="mt-2 min-h-11 font-semibold text-cyan-200">Tampilkan semua ruang</button></div>}
      </div>
      {editor ? <CommunityChannelEditor bundle={bundle} target={editor} onClose={() => setEditor(null)} onSaved={(channel) => { setEditor(null); props.onNotice?.(channel ? `Ruang ${channel.name} disimpan.` : "Kategori ditambahkan."); void loadBundle(channel?.id); }} /> : null}
    </nav>
  );
}
