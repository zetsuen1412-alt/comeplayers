import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import {
  isGroupRoom,
  profileName,
  roomName,
  roomPreview,
  type ChatRoom,
  type PartyInvitation,
} from "@comeplayers/chat-core";
import { Avatar, formatCurrency, formatDate, GroupAvatar, Panel, PrimaryButton, SectionTitle, StateBlock } from "../components";
import {
  createCommunityChannel,
  createVoiceToken,
  joinTournament,
  loadCommunity,
  loadTournaments,
} from "../api";
import { chatClient, supabase } from "../runtime";
import { colors, radius } from "../theme";
import type { AppTab, CommunityBundle, Tournament, TournamentRegistration, VoiceToken } from "../types";
import { ContactsSheet } from "./ContactsSheet";
import { VoiceLobby } from "./VoiceLobby";

type CommunityView = "hub" | "voice";
type Dialog = "create-group" | "invite-player" | "create-voice" | null;


export function CommunityScreen({ session, onOpenRoom, onNavigate }: {
  session: Session | null;
  onOpenRoom: (room: ChatRoom) => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const [view, setView] = useState<CommunityView>("hub");
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [invitations, setInvitations] = useState<PartyInvitation[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogDescription, setDialogDescription] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [targetRoom, setTargetRoom] = useState<ChatRoom | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [community, setCommunity] = useState<CommunityBundle | null>(null);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [voiceConnection, setVoiceConnection] = useState<VoiceToken | null>(null);
  const [joinTarget, setJoinTarget] = useState<Tournament | null>(null);
  const [gameUsername, setGameUsername] = useState("");
  const [joining, setJoining] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Menghubungkan…");
  const [syncError, setSyncError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user.id || "";
  const generation = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const dialogPending = useRef(false);

  const reload = useCallback((quiet = false): Promise<void> => {
    if (pending.current) return pending.current;
    const version = generation.current;
    if (!quiet) setRefreshing(true);
    const operation = (async () => {
    try {
      const [feed, allRooms, inviteData] = await Promise.all([
        loadTournaments(Boolean(userId)),
        userId ? chatClient.listRooms() : Promise.resolve([]),
        userId ? chatClient.listInvitations() : Promise.resolve({ received: [], sent: [] }),
      ]);
      if (generation.current !== version) return;
      const groups = allRooms.filter(isGroupRoom);
      setTournaments(feed.tournaments);
      setRegistrations(feed.registrations);
      setRooms(groups);
      setInvitations(inviteData.received);
      setSyncError("");
      setSelectedRoomId((current) => current && groups.some((room) => room.id === current) ? current : groups[0]?.id || "");
    } catch (reason) {
      if (generation.current === version) setSyncError(reason instanceof Error ? reason.message : "Komunitas belum bisa dimuat. Coba lagi.");
    } finally {
      if (generation.current === version) { setLoading(false); setRefreshing(false); }
    }
    })();
    pending.current = operation;
    void operation.finally(() => { if (pending.current === operation) pending.current = null; });
    return operation;
  }, [userId]);

  useEffect(() => {
    generation.current++;
    pending.current = null;
    setRooms([]); setInvitations([]); setRegistrations([]); setCommunity(null); setVoiceConnection(null);
    setLoading(true);
    void reload();
    let active = true;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const changed = () => {
      dirty = true;
      if (scheduled || AppState.currentState !== "active") return;
      scheduled = setTimeout(() => {
        scheduled = undefined;
        if (!active || AppState.currentState !== "active") return;
        // Retain events received during a read for a trailing refresh.
        if (pending.current) { void pending.current.then(() => { if (active && dirty) changed(); }); return; }
        dirty = false;
        void reload(true);
      }, 400);
    };
    const channel = userId ? supabase.channel(`community-hub:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms" }, changed)
      .subscribe((status) => { if (active) { setSyncStatus(status === "SUBSCRIBED" ? "Terhubung" : "Memperbarui otomatis"); if (status === "SUBSCRIBED") changed(); } }) : null;
    const timer = setInterval(changed, 30_000);
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") changed(); });
    return () => { active = false; generation.current++; clearTimeout(scheduled); clearInterval(timer); listener.remove(); if (channel) void supabase.removeChannel(channel); };
  }, [reload, userId]);

  useEffect(() => {
    if (!userId || view !== "voice" || !selectedRoomId) { setCommunity(null); setCommunityLoading(false); return; }
    let active = true;
    let running = false;
    setCommunity(null);
    setCommunityLoading(true);
    const refresh = () => {
      if (running || AppState.currentState !== "active") return;
      running = true;
      void loadCommunity(selectedRoomId)
      .then((bundle) => active && setCommunity(bundle))
      .catch((reason) => active && setMessage(reason instanceof Error ? reason.message : "Ruang suara belum bisa dimuat."))
      .finally(() => { running = false; if (active) setCommunityLoading(false); });
    };
    refresh();
    const channel = supabase.channel(`community-voice:${selectedRoomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_rooms", filter: `id=eq.${selectedRoomId}` }, refresh)
      .subscribe(status => { if (active && status === "SUBSCRIBED") refresh(); });
    const timer = setInterval(refresh, 30_000);
    const listener = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { active = false; clearInterval(timer); listener.remove(); void supabase.removeChannel(channel); };
  }, [selectedRoomId, userId, view]);

  const registeredIds = useMemo(() => new Set(registrations.map((item) => item.tournament_id)), [registrations]);
  const visibleRooms = useMemo(() => rooms.filter((room) =>
    (!search.trim() || `${roomName(room)} ${room.description || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    && (!unreadOnly || Number(room.unread_count) > 0)), [rooms, search, unreadOnly]);

  const openDialog = (next: Dialog, room?: ChatRoom) => {
    setDialog(next);
    setTargetRoom(room || null);
    setDialogTitle("");
    setDialogDescription("");
    setIdentifier("");
    setMessage("");
  };

  const submitDialog = async () => {
    if (dialogPending.current) return;
    dialogPending.current = true;
    setDialogBusy(true);
    setMessage("");
    try {
      if (dialog === "create-group") {
        await chatClient.createGroup({ title: dialogTitle.trim(), description: dialogDescription.trim() });
        setMessage("Komunitas siap. Undang teman untuk mulai mengobrol.");
      } else if (dialog === "invite-player" && targetRoom) {
        await chatClient.inviteMember(targetRoom.id, identifier.trim());
        setMessage(`Undangan dikirim ke ${identifier.trim()}.`);
      } else if (dialog === "create-voice" && community) {
        await createCommunityChannel(community.community.id, dialogTitle.trim(), "voice");
        setCommunity(await loadCommunity(selectedRoomId));
        setMessage("Ruang suara berhasil dibuat.");
      }
      setDialog(null);
      await reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Belum berhasil. Silakan coba lagi.");
    } finally {
      dialogPending.current = false;
      setDialogBusy(false);
    }
  };

  const answerInvitation = async (invitation: PartyInvitation, action: "accept" | "decline") => {
    try {
      await chatClient.respondToInvitation(invitation.id, action);
      setMessage(action === "accept" ? "Anda sudah bergabung dengan komunitas." : "Undangan ditolak.");
      await reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Undangan belum bisa diperbarui."); }
  };

  const joinVoice = async (channelId: string) => {
    try {
      setCommunityLoading(true);
      setVoiceConnection(await createVoiceToken(selectedRoomId, channelId));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Belum bisa bergabung ke ruang suara."); }
    finally { setCommunityLoading(false); }
  };

  const startJoin = (tournament: Tournament) => {
    if (!session) { onNavigate("profile"); return; }
    setGameUsername("");
    setJoinTarget(tournament);
  };

  const confirmJoin = async () => {
    if (!joinTarget || gameUsername.trim().length < 2) return;
    setJoining(true);
    try {
      const registration = await joinTournament(joinTarget.id, gameUsername.trim());
      setRegistrations((items) => [registration, ...items.filter((item) => item.tournament_id !== registration.tournament_id)]);
      setMessage(`Anda sudah terdaftar di ${joinTarget.title}.`);
      setJoinTarget(null);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Pendaftaran belum berhasil."); }
    finally { setJoining(false); }
  };

  if (!session) {
    return <ScrollView contentContainerStyle={styles.page}><View style={styles.hero}><Text style={styles.kicker}>KOMUNITAS</Text><Text style={styles.heroTitle}>Tempat berkumpul bersama.</Text><Text style={styles.heroText}>Temukan teman, kirim pesan, dan mengobrol bersama lewat suara.</Text></View><Panel style={styles.signInPanel}><StateBlock title="Masuk untuk bergabung" message="Komunitas dan teman Anda akan muncul otomatis setelah masuk." actionLabel="Masuk" onAction={() => onNavigate("profile")} /></Panel></ScrollView>;
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.blue} />}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Komunitas</Text>
          <Text style={styles.heroText}>Ngobrol bersama teman.</Text>
          {syncError || syncStatus === "Menghubungkan…" ? <Text accessibilityLiveRegion="polite" style={styles.syncStatus}>{syncError ? "Belum terhubung · tarik ke bawah untuk mencoba lagi" : syncStatus}</Text> : null}
        </View>
        <View style={styles.tabs}>
          <ViewTab label="Grup" active={view === "hub"} onPress={() => setView("hub")} />
          <ViewTab label="Ruang suara" active={view === "voice"} onPress={() => setView("voice")} />
          <ViewTab label="Teman" active={contactsOpen} onPress={() => setContactsOpen(true)} />
        </View>
        {message ? <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View> : null}
        {syncError ? <Panel><StateBlock title="Komunitas belum bisa dimuat" message={syncError} actionLabel="Coba lagi" onAction={() => void reload()} /></Panel> : null}

        {view === "hub" ? <View style={styles.searchPanel}>
          <TextInput accessibilityLabel="Cari komunitas" value={search} onChangeText={setSearch} placeholder="Cari komunitas…" placeholderTextColor={colors.textDim} autoCapitalize="none" style={styles.searchInput} />
          <Pressable accessibilityRole="button" accessibilityState={{ selected: unreadOnly }} onPress={() => setUnreadOnly(!unreadOnly)} style={[styles.filterChip, unreadOnly && styles.serverChipActive]}><Text style={styles.filterText}>{unreadOnly ? "✓ Belum dibaca" : "Belum dibaca"}</Text></Pressable>
          {(search || unreadOnly) && !visibleRooms.length ? <StateBlock title="Komunitas tidak ditemukan" message="Coba nama lain atau tampilkan semua komunitas." actionLabel="Tampilkan semua" onAction={() => { setSearch(""); setUnreadOnly(false); }} /> : null}
        </View> : null}

        {view === "hub" && (visibleRooms.length > 0 || (!search && !unreadOnly) || invitations.length > 0) ? <ChatHub hideEmpty={Boolean(search || unreadOnly)} rooms={visibleRooms} invitations={invitations} loading={loading} onOpenRoom={onOpenRoom} onCreate={() => openDialog("create-group")} onInvite={(room) => openDialog("invite-player", room)} onAnswer={answerInvitation} /> : null}
        {view === "voice" ? <VoiceHub rooms={rooms} selectedRoomId={selectedRoomId} onSelectRoom={setSelectedRoomId} community={community} loading={communityLoading} onJoin={joinVoice} onCreate={() => openDialog("create-voice")} /> : null}

        {view === "hub" ? (
          <>
            <SectionTitle eyebrow="BERMAIN BERSAMA" title="Turnamen" actionLabel="Muat ulang" onAction={() => void reload()} />
            <View style={styles.tournamentList}>
              {tournaments.map((item) => {
                const joined = registeredIds.has(item.id);
                const full = item.participant_count >= item.max_participants;
                return <View key={item.id} style={[styles.tournamentCard, item.is_featured && styles.featured]}><View style={styles.tournamentHead}><View style={styles.tournamentHeadCopy}><Text style={styles.game}>{item.game_title} · {item.game_mode}</Text><Text style={styles.tournamentTitle}>{item.title}</Text></View>{item.is_verified ? <Text style={styles.verified}>TERVERIFIKASI</Text> : null}</View><Text style={styles.description} numberOfLines={3}>{item.description}</Text><View style={styles.infoRow}><Info label="MULAI" value={formatDate(item.starts_at)} /><Info label="WILAYAH" value={item.region} /><Info label="PLATFORM" value={item.platform} /></View><View style={styles.tournamentFooter}><View><Text style={styles.prizeLabel}>TOTAL HADIAH</Text><Text style={styles.prize}>{formatCurrency(item.prize_pool, item.currency)}</Text></View><Text style={styles.players}>{item.participant_count}/{item.max_participants} peserta</Text></View><PrimaryButton label={joined ? "Sudah terdaftar" : full ? "Peserta penuh" : "Daftar"} disabled={joined || full} onPress={() => startJoin(item)} tone={item.is_featured ? "yellow" : "blue"} /></View>;
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <ContactsSheet allowGroups visible={contactsOpen} onClose={() => setContactsOpen(false)} onOpenRoom={onOpenRoom} />
      <ActionDialog dialog={dialog} title={dialogTitle} description={dialogDescription} identifier={identifier} busy={dialogBusy} onTitle={setDialogTitle} onDescription={setDialogDescription} onIdentifier={setIdentifier} onClose={() => setDialog(null)} onSubmit={() => void submitDialog()} />
      <Modal visible={Boolean(joinTarget)} transparent animationType="fade" onRequestClose={() => setJoinTarget(null)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalKicker}>DAFTAR TURNAMEN</Text><Text style={styles.modalTitle}>{joinTarget?.title}</Text><Text style={styles.modalText}>Masukkan nama Anda di dalam game.</Text><TextInput value={gameUsername} onChangeText={setGameUsername} autoCapitalize="none" placeholder="Nama di dalam game" placeholderTextColor={colors.textDim} style={styles.modalInput} /><PrimaryButton label="Daftar sekarang" onPress={() => void confirmJoin()} disabled={gameUsername.trim().length < 2} loading={joining} /><Pressable onPress={() => setJoinTarget(null)} style={styles.cancel}><Text style={styles.cancelText}>Batal</Text></Pressable></View></View></Modal>
      {voiceConnection ? <VoiceLobby connection={voiceConnection} onLeave={() => setVoiceConnection(null)} /> : null}
    </>
  );
}

function ViewTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.viewTab, active && styles.viewTabActive]}><Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text></Pressable>; }

function ChatHub({ hideEmpty = false, rooms, invitations, loading, onOpenRoom, onCreate, onInvite, onAnswer }: { hideEmpty?: boolean; rooms: ChatRoom[]; invitations: PartyInvitation[]; loading: boolean; onOpenRoom: (room: ChatRoom) => void; onCreate: () => void; onInvite: (room: ChatRoom) => void; onAnswer: (invite: PartyInvitation, action: "accept" | "decline") => void }) {
  return <><SectionTitle title="Grup Anda" actionLabel="Buat baru" onAction={onCreate} />{loading ? <Panel><StateBlock loading title="Memuat komunitas…" /></Panel> : rooms.length ? <View style={styles.roomGrid}>{rooms.map((room) => <View key={room.id} style={styles.roomCard}><GroupAvatar uri={room.server?.icon_url} /><Text style={styles.roomTitle} numberOfLines={1}>{roomName(room)}</Text><Text style={styles.roomPreview} numberOfLines={2}>{room.last_message ? roomPreview(room) : room.description || "Sapa anggota komunitas Anda"}</Text><Text style={styles.roomMembers}>{room.member_count || room.members?.length || 1} anggota</Text><View style={styles.roomActions}><Pressable accessibilityRole="button" style={styles.roomOpen} onPress={() => onOpenRoom(room)}><Text style={styles.roomOpenText}>Buka chat</Text></Pressable><Pressable accessibilityRole="button" style={styles.roomInvite} onPress={() => onInvite(room)}><Text style={styles.roomInviteText}>Undang</Text></Pressable></View></View>)}</View> : hideEmpty ? null : <Panel><StateBlock title="Belum ada komunitas" message="Buat komunitas untuk keluarga, teman, atau teman bermain Anda." actionLabel="Buat komunitas" onAction={onCreate} /></Panel>}{invitations.length ? <><SectionTitle eyebrow="UNDANGAN" title="Ayo bergabung" /><View style={styles.invitationList}>{invitations.map((invite) => <View key={invite.id} style={styles.invitation}><Avatar uri={invite.inviter?.avatar_url} name={profileName(invite.inviter)} size={40} /><View style={styles.invitationCopy}><Text style={styles.invitationTitle}>{invite.room?.title || "Komunitas"}</Text><Text style={styles.invitationFrom}>Dari {profileName(invite.inviter)}</Text></View><Pressable onPress={() => onAnswer(invite, "accept")} style={styles.accept}><Text style={styles.acceptText}>Terima</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Tolak undangan" onPress={() => onAnswer(invite, "decline")} style={styles.decline}><Text style={styles.declineText}>×</Text></Pressable></View>)}</View></> : null}</>;
}

function VoiceHub({ rooms, selectedRoomId, onSelectRoom, community, loading, onJoin, onCreate }: { rooms: ChatRoom[]; selectedRoomId: string; onSelectRoom: (id: string) => void; community: CommunityBundle | null; loading: boolean; onJoin: (channelId: string) => void; onCreate: () => void }) {
  const voiceChannels = community?.channels.filter((channel) => channel.channel_type === "voice") || [];
  const canCreate = Boolean(community?.currentUser.isOwner || community?.currentUser.isAdmin || community?.currentUser.permissions.includes("*") || community?.currentUser.permissions.includes("manage_channels"));
  return <><SectionTitle eyebrow="NGOBROL BERSAMA" title="Ruang suara" actionLabel={canCreate ? "Buat ruang" : undefined} onAction={canCreate ? onCreate : undefined} />{rooms.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverPicker}>{rooms.map((room) => <Pressable key={room.id} onPress={() => onSelectRoom(room.id)} style={[styles.serverChip, selectedRoomId === room.id && styles.serverChipActive]}><Text style={[styles.serverChipText, selectedRoomId === room.id && styles.serverChipTextActive]}>{roomName(room)}</Text></Pressable>)}</ScrollView> : null}{loading ? <Panel><StateBlock loading title="Menyiapkan ruang suara…" /></Panel> : !rooms.length ? <Panel><StateBlock title="Buat komunitas lebih dulu" message="Setiap komunitas langsung memiliki ruang untuk mengobrol bersama lewat suara." /></Panel> : voiceChannels.length ? <View style={styles.voiceList}>{voiceChannels.map((channel) => <View key={channel.id} style={styles.voiceCard}><View style={styles.voiceIcon}><Text style={styles.voiceIconText}>◉</Text></View><View style={styles.voiceCopy}><Text style={styles.voiceName}>{channel.name}</Text><Text style={styles.voiceTopic}>{channel.topic || "Ngobrol bersama lewat suara atau video"}</Text></View><Pressable onPress={() => onJoin(channel.id)} style={styles.joinVoice}><Text style={styles.joinVoiceText}>Gabung</Text></Pressable></View>)}</View> : <Panel><StateBlock title="Belum ada ruang suara" message="Pengelola komunitas dapat membuat ruang di sini." actionLabel={canCreate ? "Buat ruang" : undefined} onAction={canCreate ? onCreate : undefined} /></Panel>}<Text style={styles.voiceNote}>Anda bisa menyalakan atau mematikan mikrofon dan kamera setelah bergabung.</Text></>;
}

function ActionDialog({ dialog, title, description, identifier, busy, onTitle, onDescription, onIdentifier, onClose, onSubmit }: { dialog: Dialog; title: string; description: string; identifier: string; busy: boolean; onTitle: (value: string) => void; onDescription: (value: string) => void; onIdentifier: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const usesIdentifier = dialog === "invite-player";
  const heading = dialog === "create-group" ? "Buat komunitas" : dialog === "invite-player" ? "Undang teman" : "Buat ruang suara";
  const valid = usesIdentifier ? identifier.trim().length >= 2 : title.trim().length >= 3;
  return <Modal visible={Boolean(dialog)} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalKicker}>KOMUNITAS COMEPLAYERS</Text><Text style={styles.modalTitle}>{heading}</Text>{usesIdentifier ? <><Text style={styles.modalText}>Masukkan nomor CP teman. Nama pengguna juga bisa digunakan.</Text><TextInput value={identifier} onChangeText={onIdentifier} autoCapitalize="none" accessibilityLabel="Nomor CP atau nama pengguna teman" autoCorrect={false} placeholder="Nomor CP atau nama pengguna" placeholderTextColor={colors.textDim} style={styles.modalInput} /></> : <><TextInput value={title} onChangeText={onTitle} placeholder={dialog === "create-voice" ? "Nama ruang suara" : "Nama komunitas"} placeholderTextColor={colors.textDim} style={styles.modalInput} />{dialog === "create-group" ? <TextInput value={description} onChangeText={onDescription} placeholder="Ceritakan komunitas ini (boleh dikosongkan)" placeholderTextColor={colors.textDim} multiline style={[styles.modalInput, styles.modalMultiline]} /> : null}</>}<PrimaryButton label={dialog === "invite-player" ? "Kirim undangan" : "Buat"} onPress={onSubmit} disabled={!valid} loading={busy} /><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Batal</Text></Pressable></View></View></Modal>;
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={1}>{value}</Text></View>; }

const styles = StyleSheet.create({
  syncStatus: { marginTop: 14, fontSize: 14, color: colors.green, fontWeight: "700" },
  searchPanel: { gap: 10, marginBottom: 16 },
  searchInput: { minHeight: 52, paddingHorizontal: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel, color: colors.text, fontSize: 17 },
  filterChip: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  filterText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  page: { padding: 16, paddingBottom: 36, backgroundColor: colors.background },
  hero: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  kicker: { color: colors.blue, fontSize: 14, fontWeight: "900", letterSpacing: 1.9 },
  heroTitle: { marginTop: 8, color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  heroText: { marginTop: 8, color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  signInPanel: { marginTop: 14 },
  tabs: { flexDirection: "row", gap: 7, marginVertical: 15, padding: 5, borderRadius: radius.medium, backgroundColor: colors.panel },
  viewTab: { minHeight: 50, justifyContent: "center", flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12 },
  viewTabActive: { backgroundColor: colors.yellowSoft },
  viewTabText: { color: colors.textMuted, fontSize: 14, fontWeight: "900" },
  viewTabTextActive: { color: colors.yellow },
  notice: { marginBottom: 14, padding: 12, borderRadius: radius.medium, borderWidth: 1, borderColor: "rgba(54,226,160,.24)", backgroundColor: "rgba(54,226,160,.08)" },
  noticeText: { color: colors.green, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  roomGrid: { gap: 12, marginBottom: 24 },
  roomCard: { width: "100%", padding: 18, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  roomTitle: { marginTop: 10, color: colors.text, fontSize: 19, fontWeight: "900" },
  roomPreview: { minHeight: 31, marginTop: 5, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  roomMembers: { marginTop: 8, color: colors.textDim, fontSize: 14, fontWeight: "800" },
  roomActions: { flexDirection: "row", gap: 6, marginTop: 12 },
  roomOpen: { minHeight: 50, justifyContent: "center", flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, backgroundColor: colors.blueSoft },
  roomOpenText: { color: colors.blue, fontSize: 14, fontWeight: "900" },
  roomInvite: { minHeight: 50, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.yellowSoft },
  roomInviteText: { color: colors.yellow, fontSize: 14, fontWeight: "900" },
  invitationList: { gap: 8, marginBottom: 24 },
  invitation: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 66, padding: 10, borderRadius: radius.medium, backgroundColor: colors.panel },
  invitationCopy: { flex: 1 },
  invitationTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  invitationFrom: { marginTop: 3, color: colors.textMuted, fontSize: 14 },
  accept: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.yellow },
  acceptText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  decline: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  declineText: { color: colors.red, fontSize: 18 },
  serverPicker: { gap: 7, paddingBottom: 13 },
  serverChip: { minHeight: 48, justifyContent: "center", paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  serverChipActive: { borderColor: "rgba(39,183,255,.5)", backgroundColor: colors.blueSoft },
  serverChipText: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },
  serverChipTextActive: { color: colors.blue },
  voiceList: { gap: 9 },
  voiceCard: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  voiceIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.blueSoft },
  voiceIconText: { color: colors.blue, fontSize: 22 },
  voiceCopy: { flex: 1 },
  voiceName: { color: colors.text, fontSize: 13, fontWeight: "900", textTransform: "capitalize" },
  voiceTopic: { marginTop: 4, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  joinVoice: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.yellow },
  joinVoiceText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  voiceNote: { marginVertical: 15, color: colors.textDim, fontSize: 14, lineHeight: 21, textAlign: "center" },
  friendSection: { gap: 8, marginBottom: 18 },
  friendSectionTitle: { color: colors.textDim, fontSize: 14, fontWeight: "900", letterSpacing: 1.1 },
  friendRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: radius.medium, backgroundColor: colors.panel },
  friendCopy: { flex: 1 },
  friendName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  friendStatus: { marginTop: 3, color: colors.textDim, fontSize: 14, textTransform: "capitalize" },
  friendOnline: { color: colors.green },
  friendPrimary: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.blueSoft },
  friendPrimaryText: { color: colors.blue, fontSize: 14, fontWeight: "900" },
  friendSecondary: { paddingHorizontal: 7, paddingVertical: 8 },
  friendSecondaryText: { color: colors.red, fontSize: 14, fontWeight: "900" },
  tournamentList: { gap: 12 },
  tournamentCard: { padding: 18, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  featured: { borderColor: "rgba(255,208,0,.35)", backgroundColor: "#151507" },
  tournamentHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tournamentHeadCopy: { flex: 1 },
  game: { color: colors.blue, fontSize: 14, fontWeight: "900", textTransform: "uppercase" },
  tournamentTitle: { marginTop: 5, color: colors.text, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  verified: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, color: colors.green, fontSize: 14, fontWeight: "900", backgroundColor: "rgba(54,226,160,.09)" },
  description: { marginTop: 10, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  infoRow: { flexDirection: "row", gap: 6, marginTop: 15 },
  info: { flex: 1, padding: 9, borderRadius: radius.small, backgroundColor: colors.panelStrong },
  infoLabel: { color: colors.textDim, fontSize: 14, fontWeight: "900" },
  infoValue: { marginTop: 3, color: colors.text, fontSize: 14, fontWeight: "800" },
  tournamentFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginVertical: 13 },
  prizeLabel: { color: colors.textDim, fontSize: 14, fontWeight: "900" },
  prize: { marginTop: 3, color: colors.yellow, fontSize: 16, fontWeight: "900" },
  players: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,.78)" },
  modalCard: { width: "100%", maxWidth: 440, padding: 22, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,208,0,.3)", backgroundColor: colors.backgroundRaised },
  modalKicker: { color: colors.yellow, fontSize: 14, fontWeight: "900", letterSpacing: 1.5 },
  modalTitle: { marginTop: 8, color: colors.text, fontSize: 22, fontWeight: "900" },
  modalText: { marginTop: 9, color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  modalInput: { minHeight: 50, marginVertical: 10, paddingHorizontal: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.panel },
  modalMultiline: { minHeight: 85, paddingTop: 13, textAlignVertical: "top" },
  cancel: { minHeight: 48, justifyContent: "center", alignItems: "center", marginTop: 10, padding: 10 },
  cancelText: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },
});
