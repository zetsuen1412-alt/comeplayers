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
import { Avatar, formatCurrency, formatDate, Panel, PrimaryButton, SectionTitle, StateBlock } from "../components";
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
  const [syncStatus, setSyncStatus] = useState("Connecting");
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
      if (generation.current === version) setSyncError(reason instanceof Error ? reason.message : "Community is temporarily unavailable.");
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
      .subscribe((status) => { if (active) { setSyncStatus(status === "SUBSCRIBED" ? "Live" : "Auto refresh"); if (status === "SUBSCRIBED") changed(); } }) : null;
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
      .catch((reason) => active && setMessage(reason instanceof Error ? reason.message : "Voice lobbies could not be loaded."))
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
        setMessage("Community server created with text and voice channels.");
      } else if (dialog === "invite-player" && targetRoom) {
        await chatClient.inviteMember(targetRoom.id, identifier.trim());
        setMessage(`Invitation sent to ${identifier.trim()}.`);
      } else if (dialog === "create-voice" && community) {
        await createCommunityChannel(community.community.id, dialogTitle.trim(), "voice");
        setCommunity(await loadCommunity(selectedRoomId));
        setMessage("Voice lobby created.");
      }
      setDialog(null);
      await reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Action could not be completed.");
    } finally {
      dialogPending.current = false;
      setDialogBusy(false);
    }
  };

  const answerInvitation = async (invitation: PartyInvitation, action: "accept" | "decline") => {
    try {
      await chatClient.respondToInvitation(invitation.id, action);
      setMessage(action === "accept" ? "Community invitation accepted." : "Invitation declined.");
      await reload();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Invitation could not be updated."); }
  };

  const joinVoice = async (channelId: string) => {
    try {
      setCommunityLoading(true);
      setVoiceConnection(await createVoiceToken(selectedRoomId, channelId));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Voice lobby could not be joined."); }
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
      setMessage(`You are registered for ${joinTarget.title}.`);
      setJoinTarget(null);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Registration failed."); }
    finally { setJoining(false); }
  };

  if (!session) {
    return <ScrollView contentContainerStyle={styles.page}><View style={styles.hero}><Text style={styles.kicker}>COMMUNITY NETWORK</Text><Text style={styles.heroTitle}>Squads, contacts, chat, and voice.</Text><Text style={styles.heroText}>Sign in with your ComePlayers account to connect the Android app to your existing community.</Text></View><Panel style={styles.signInPanel}><StateBlock title="Sign in to continue" message="Your groups, contacts, invitations, and voice lobbies will sync automatically." actionLabel="Open profile" onAction={() => onNavigate("profile")} /></Panel></ScrollView>;
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.blue} />}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>COMMUNITY NETWORK</Text>
          <Text style={styles.heroTitle}>Your people, always connected.</Text>
          <Text style={styles.heroText}>Chat, manage servers, invite people, and join live voice or video without leaving the Android app.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.syncStatus}>{syncError ? "Sync interrupted · pull down to retry" : `${syncStatus} · updates automatically`}</Text>
        </View>
        <View style={styles.tabs}>
          <ViewTab label="Chat Hub" active={view === "hub"} onPress={() => setView("hub")} />
          <ViewTab label="Voice" active={view === "voice"} onPress={() => setView("voice")} />
          <ViewTab label="Contacts" active={contactsOpen} onPress={() => setContactsOpen(true)} />
        </View>
        {message ? <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View> : null}
        {syncError ? <Panel><StateBlock title="Unable to sync community" message={syncError} actionLabel="Try again" onAction={() => void reload()} /></Panel> : null}

        {view === "hub" ? <View style={styles.searchPanel}>
          <TextInput accessibilityLabel="Search community servers" value={search} onChangeText={setSearch} placeholder="Find your community…" placeholderTextColor={colors.textDim} autoCapitalize="none" style={styles.searchInput} />
          <Pressable accessibilityRole="button" accessibilityState={{ selected: unreadOnly }} onPress={() => setUnreadOnly(!unreadOnly)} style={[styles.filterChip, unreadOnly && styles.serverChipActive]}><Text style={styles.filterText}>{unreadOnly ? "✓ Unread only" : "Unread only"}</Text></Pressable>
          {(search || unreadOnly) && !visibleRooms.length ? <StateBlock title="No matching servers" message="Try a different name or show all your servers." actionLabel="Clear filters" onAction={() => { setSearch(""); setUnreadOnly(false); }} /> : null}
        </View> : null}

        {view === "hub" && (visibleRooms.length > 0 || (!search && !unreadOnly) || invitations.length > 0) ? <ChatHub hideEmpty={Boolean(search || unreadOnly)} rooms={visibleRooms} invitations={invitations} loading={loading} onOpenRoom={onOpenRoom} onCreate={() => openDialog("create-group")} onInvite={(room) => openDialog("invite-player", room)} onAnswer={answerInvitation} /> : null}
        {view === "voice" ? <VoiceHub rooms={rooms} selectedRoomId={selectedRoomId} onSelectRoom={setSelectedRoomId} community={community} loading={communityLoading} onJoin={joinVoice} onCreate={() => openDialog("create-voice")} /> : null}

        {view === "hub" ? (
          <>
            <SectionTitle eyebrow="COMPETE NOW" title="Tournament arenas" actionLabel="Refresh" onAction={() => void reload()} />
            <View style={styles.tournamentList}>
              {tournaments.map((item) => {
                const joined = registeredIds.has(item.id);
                const full = item.participant_count >= item.max_participants;
                return <View key={item.id} style={[styles.tournamentCard, item.is_featured && styles.featured]}><View style={styles.tournamentHead}><View style={styles.tournamentHeadCopy}><Text style={styles.game}>{item.game_title} · {item.game_mode}</Text><Text style={styles.tournamentTitle}>{item.title}</Text></View>{item.is_verified ? <Text style={styles.verified}>VERIFIED</Text> : null}</View><Text style={styles.description} numberOfLines={3}>{item.description}</Text><View style={styles.infoRow}><Info label="STARTS" value={formatDate(item.starts_at)} /><Info label="REGION" value={item.region} /><Info label="PLATFORM" value={item.platform} /></View><View style={styles.tournamentFooter}><View><Text style={styles.prizeLabel}>PRIZE POOL</Text><Text style={styles.prize}>{formatCurrency(item.prize_pool, item.currency)}</Text></View><Text style={styles.players}>{item.participant_count}/{item.max_participants} players</Text></View><PrimaryButton label={joined ? "Already joined" : full ? "Arena full" : "Join now"} disabled={joined || full} onPress={() => startJoin(item)} tone={item.is_featured ? "yellow" : "blue"} /></View>;
              })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <ContactsSheet allowGroups visible={contactsOpen} onClose={() => setContactsOpen(false)} onOpenRoom={onOpenRoom} />
      <ActionDialog dialog={dialog} title={dialogTitle} description={dialogDescription} identifier={identifier} busy={dialogBusy} onTitle={setDialogTitle} onDescription={setDialogDescription} onIdentifier={setIdentifier} onClose={() => setDialog(null)} onSubmit={() => void submitDialog()} />
      <Modal visible={Boolean(joinTarget)} transparent animationType="fade" onRequestClose={() => setJoinTarget(null)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalKicker}>TOURNAMENT REGISTRATION</Text><Text style={styles.modalTitle}>{joinTarget?.title}</Text><Text style={styles.modalText}>Enter your in-game username.</Text><TextInput value={gameUsername} onChangeText={setGameUsername} autoCapitalize="none" placeholder="In-game username" placeholderTextColor={colors.textDim} style={styles.modalInput} /><PrimaryButton label="Confirm registration" onPress={() => void confirmJoin()} disabled={gameUsername.trim().length < 2} loading={joining} /><Pressable onPress={() => setJoinTarget(null)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></View></Modal>
      {voiceConnection ? <VoiceLobby connection={voiceConnection} onLeave={() => setVoiceConnection(null)} /> : null}
    </>
  );
}

function ViewTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.viewTab, active && styles.viewTabActive]}><Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>{label}</Text></Pressable>; }

function ChatHub({ hideEmpty = false, rooms, invitations, loading, onOpenRoom, onCreate, onInvite, onAnswer }: { hideEmpty?: boolean; rooms: ChatRoom[]; invitations: PartyInvitation[]; loading: boolean; onOpenRoom: (room: ChatRoom) => void; onCreate: () => void; onInvite: (room: ChatRoom) => void; onAnswer: (invite: PartyInvitation, action: "accept" | "decline") => void }) {
  return <><SectionTitle eyebrow="CHAT HUB" title="Community servers" actionLabel="Create server" onAction={onCreate} />{loading ? <Panel><StateBlock loading title="Loading servers" /></Panel> : rooms.length ? <View style={styles.roomGrid}>{rooms.map((room) => <View key={room.id} style={styles.roomCard}><Avatar uri={room.other?.avatar_url} name={roomName(room)} accent="blue" /><Text style={styles.roomTitle} numberOfLines={1}>{roomName(room)}</Text><Text style={styles.roomPreview} numberOfLines={2}>{roomPreview(room)}</Text><Text style={styles.roomMembers}>{room.member_count || room.members?.length || 1} members</Text><View style={styles.roomActions}><Pressable style={styles.roomOpen} onPress={() => onOpenRoom(room)}><Text style={styles.roomOpenText}>Open chat</Text></Pressable><Pressable style={styles.roomInvite} onPress={() => onInvite(room)}><Text style={styles.roomInviteText}>Invite</Text></Pressable></View></View>)}</View> : hideEmpty ? null : <Panel><StateBlock title="No servers yet" message="Create your first server and invite other players." actionLabel="Create server" onAction={onCreate} /></Panel>}{invitations.length ? <><SectionTitle eyebrow="INVITATIONS" title="Waiting for your answer" /><View style={styles.invitationList}>{invitations.map((invite) => <View key={invite.id} style={styles.invitation}><Avatar uri={invite.inviter?.avatar_url} name={profileName(invite.inviter)} size={40} /><View style={styles.invitationCopy}><Text style={styles.invitationTitle}>{invite.room?.title || "Community server"}</Text><Text style={styles.invitationFrom}>From {profileName(invite.inviter)}</Text></View><Pressable onPress={() => onAnswer(invite, "accept")} style={styles.accept}><Text style={styles.acceptText}>Accept</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Decline invitation" onPress={() => onAnswer(invite, "decline")} style={styles.decline}><Text style={styles.declineText}>×</Text></Pressable></View>)}</View></> : null}</>;
}

function VoiceHub({ rooms, selectedRoomId, onSelectRoom, community, loading, onJoin, onCreate }: { rooms: ChatRoom[]; selectedRoomId: string; onSelectRoom: (id: string) => void; community: CommunityBundle | null; loading: boolean; onJoin: (channelId: string) => void; onCreate: () => void }) {
  const voiceChannels = community?.channels.filter((channel) => channel.channel_type === "voice") || [];
  const canCreate = Boolean(community?.currentUser.isOwner || community?.currentUser.isAdmin || community?.currentUser.permissions.includes("*") || community?.currentUser.permissions.includes("manage_channels"));
  return <><SectionTitle eyebrow="LIVE VOICE & VIDEO" title="Voice lobbies" actionLabel={canCreate ? "Create lobby" : undefined} onAction={canCreate ? onCreate : undefined} />{rooms.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serverPicker}>{rooms.map((room) => <Pressable key={room.id} onPress={() => onSelectRoom(room.id)} style={[styles.serverChip, selectedRoomId === room.id && styles.serverChipActive]}><Text style={[styles.serverChipText, selectedRoomId === room.id && styles.serverChipTextActive]}>{roomName(room)}</Text></Pressable>)}</ScrollView> : null}{loading ? <Panel><StateBlock loading title="Connecting to voice services" /></Panel> : !rooms.length ? <Panel><StateBlock title="Create a server first" message="Every new server receives a Lounge voice channel automatically." /></Panel> : voiceChannels.length ? <View style={styles.voiceList}>{voiceChannels.map((channel) => <View key={channel.id} style={styles.voiceCard}><View style={styles.voiceIcon}><Text style={styles.voiceIconText}>◉</Text></View><View style={styles.voiceCopy}><Text style={styles.voiceName}>{channel.name}</Text><Text style={styles.voiceTopic}>{channel.topic || "Live voice and video lobby"}</Text></View><Pressable onPress={() => onJoin(channel.id)} style={styles.joinVoice}><Text style={styles.joinVoiceText}>Join</Text></Pressable></View>)}</View> : <Panel><StateBlock title="No voice lobbies" message="A server manager can create one here." actionLabel={canCreate ? "Create lobby" : undefined} onAction={canCreate ? onCreate : undefined} /></Panel>}<Text style={styles.voiceNote}>Microphone and camera activate only after you join and remain under your control.</Text></>;
}

function ActionDialog({ dialog, title, description, identifier, busy, onTitle, onDescription, onIdentifier, onClose, onSubmit }: { dialog: Dialog; title: string; description: string; identifier: string; busy: boolean; onTitle: (value: string) => void; onDescription: (value: string) => void; onIdentifier: (value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const usesIdentifier = dialog === "invite-player";
  const heading = dialog === "create-group" ? "Create community server" : dialog === "invite-player" ? "Invite a player" : "Create voice lobby";
  const valid = usesIdentifier ? identifier.trim().length >= 2 : title.trim().length >= 3;
  return <Modal visible={Boolean(dialog)} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.modalKicker}>COMEPLAYERS COMMUNITY</Text><Text style={styles.modalTitle}>{heading}</Text>{usesIdentifier ? <><Text style={styles.modalText}>Enter an exact username or verified phone number.</Text><TextInput value={identifier} onChangeText={onIdentifier} autoCapitalize="none" placeholder="username or verified phone number" placeholderTextColor={colors.textDim} style={styles.modalInput} /></> : <><TextInput value={title} onChangeText={onTitle} placeholder={dialog === "create-voice" ? "Lobby name" : "Server name"} placeholderTextColor={colors.textDim} style={styles.modalInput} />{dialog === "create-group" ? <TextInput value={description} onChangeText={onDescription} placeholder="What is this community about?" placeholderTextColor={colors.textDim} multiline style={[styles.modalInput, styles.modalMultiline]} /> : null}</>}<PrimaryButton label={dialog === "invite-player" ? "Send invitation" : "Create"} onPress={onSubmit} disabled={!valid} loading={busy} /><Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></View></Modal>;
}

function Info({ label, value }: { label: string; value: string }) { return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue} numberOfLines={1}>{value}</Text></View>; }

const styles = StyleSheet.create({
  syncStatus: { marginTop: 14, fontSize: 12, color: colors.green, fontWeight: "700" },
  searchPanel: { gap: 10, marginBottom: 16 },
  searchInput: { minHeight: 48, paddingHorizontal: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.panel, color: colors.text, fontSize: 15 },
  filterChip: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong },
  filterText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  page: { padding: 16, paddingBottom: 36, backgroundColor: colors.background },
  hero: { padding: 22, borderRadius: 25, borderWidth: 1, borderColor: "rgba(39,183,255,.28)", backgroundColor: "#071825" },
  kicker: { color: colors.blue, fontSize: 12, fontWeight: "900", letterSpacing: 1.9 },
  heroTitle: { marginTop: 8, color: colors.text, fontSize: 29, lineHeight: 33, fontWeight: "900" },
  heroText: { marginTop: 10, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  signInPanel: { marginTop: 14 },
  tabs: { flexDirection: "row", gap: 7, marginVertical: 15, padding: 5, borderRadius: radius.medium, backgroundColor: colors.panel },
  viewTab: { minHeight: 44, justifyContent: "center", flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12 },
  viewTabActive: { backgroundColor: colors.yellowSoft },
  viewTabText: { color: colors.textMuted, fontSize: 12, fontWeight: "900" },
  viewTabTextActive: { color: colors.yellow },
  notice: { marginBottom: 14, padding: 12, borderRadius: radius.medium, borderWidth: 1, borderColor: "rgba(54,226,160,.24)", backgroundColor: "rgba(54,226,160,.08)" },
  noticeText: { color: colors.green, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  roomGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  roomCard: { width: "48%", minHeight: 194, padding: 14, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  roomTitle: { marginTop: 10, color: colors.text, fontSize: 14, fontWeight: "900" },
  roomPreview: { minHeight: 31, marginTop: 5, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  roomMembers: { marginTop: 8, color: colors.textDim, fontSize: 12, fontWeight: "800" },
  roomActions: { flexDirection: "row", gap: 6, marginTop: 12 },
  roomOpen: { minHeight: 44, justifyContent: "center", flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, backgroundColor: colors.blueSoft },
  roomOpenText: { color: colors.blue, fontSize: 12, fontWeight: "900" },
  roomInvite: { minHeight: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: colors.yellowSoft },
  roomInviteText: { color: colors.yellow, fontSize: 12, fontWeight: "900" },
  invitationList: { gap: 8, marginBottom: 24 },
  invitation: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 66, padding: 10, borderRadius: radius.medium, backgroundColor: colors.panel },
  invitationCopy: { flex: 1 },
  invitationTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
  invitationFrom: { marginTop: 3, color: colors.textMuted, fontSize: 12 },
  accept: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.yellow },
  acceptText: { color: colors.background, fontSize: 12, fontWeight: "900" },
  decline: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  declineText: { color: colors.red, fontSize: 18 },
  serverPicker: { gap: 7, paddingBottom: 13 },
  serverChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  serverChipActive: { borderColor: "rgba(39,183,255,.5)", backgroundColor: colors.blueSoft },
  serverChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  serverChipTextActive: { color: colors.blue },
  voiceList: { gap: 9 },
  voiceCard: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  voiceIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: colors.blueSoft },
  voiceIconText: { color: colors.blue, fontSize: 22 },
  voiceCopy: { flex: 1 },
  voiceName: { color: colors.text, fontSize: 13, fontWeight: "900", textTransform: "capitalize" },
  voiceTopic: { marginTop: 4, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  joinVoice: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.yellow },
  joinVoiceText: { color: colors.background, fontSize: 12, fontWeight: "900" },
  voiceNote: { marginVertical: 15, color: colors.textDim, fontSize: 12, lineHeight: 18, textAlign: "center" },
  friendSection: { gap: 8, marginBottom: 18 },
  friendSectionTitle: { color: colors.textDim, fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  friendRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: radius.medium, backgroundColor: colors.panel },
  friendCopy: { flex: 1 },
  friendName: { color: colors.text, fontSize: 12, fontWeight: "900" },
  friendStatus: { marginTop: 3, color: colors.textDim, fontSize: 12, textTransform: "capitalize" },
  friendOnline: { color: colors.green },
  friendPrimary: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: colors.blueSoft },
  friendPrimaryText: { color: colors.blue, fontSize: 12, fontWeight: "900" },
  friendSecondary: { paddingHorizontal: 7, paddingVertical: 8 },
  friendSecondaryText: { color: colors.red, fontSize: 12, fontWeight: "900" },
  tournamentList: { gap: 12 },
  tournamentCard: { padding: 18, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  featured: { borderColor: "rgba(255,208,0,.35)", backgroundColor: "#151507" },
  tournamentHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tournamentHeadCopy: { flex: 1 },
  game: { color: colors.blue, fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  tournamentTitle: { marginTop: 5, color: colors.text, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  verified: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, color: colors.green, fontSize: 12, fontWeight: "900", backgroundColor: "rgba(54,226,160,.09)" },
  description: { marginTop: 10, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: "row", gap: 6, marginTop: 15 },
  info: { flex: 1, padding: 9, borderRadius: radius.small, backgroundColor: colors.panelStrong },
  infoLabel: { color: colors.textDim, fontSize: 12, fontWeight: "900" },
  infoValue: { marginTop: 3, color: colors.text, fontSize: 12, fontWeight: "800" },
  tournamentFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginVertical: 13 },
  prizeLabel: { color: colors.textDim, fontSize: 12, fontWeight: "900" },
  prize: { marginTop: 3, color: colors.yellow, fontSize: 16, fontWeight: "900" },
  players: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  modalBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,.78)" },
  modalCard: { width: "100%", maxWidth: 440, padding: 22, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,208,0,.3)", backgroundColor: colors.backgroundRaised },
  modalKicker: { color: colors.yellow, fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  modalTitle: { marginTop: 8, color: colors.text, fontSize: 22, fontWeight: "900" },
  modalText: { marginTop: 9, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  modalInput: { minHeight: 50, marginVertical: 10, paddingHorizontal: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, backgroundColor: colors.panel },
  modalMultiline: { minHeight: 85, paddingTop: 13, textAlignVertical: "top" },
  cancel: { alignItems: "center", marginTop: 10, padding: 10 },
  cancelText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
});
