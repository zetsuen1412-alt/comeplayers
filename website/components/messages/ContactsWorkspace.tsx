"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaArrowLeft, FaBan, FaCommentDots, FaPaperPlane, FaPlus, FaSearch, FaTimes, FaUsers } from "react-icons/fa";
import { authenticatedFetchJson as api } from "@/lib/authenticatedFetch";
import { DEFAULT_COMMUNITY_GROUP_ICON } from "@/lib/communityAvatar";
import styles from "./ContactsWorkspace.module.css";

type Profile = { id: string; username?: string | null; full_name?: string | null; avatar_url?: string | null };
type Room = { id: string; title?: string; room_type?: string; other?: Profile; server?: { icon_url?: string | null } | null; unread_count?: number; last_message?: string; last_message_at?: string; blocked_by_me?: boolean; contact_unavailable?: boolean };
type Message = { id: string; sender_id: string; message: string; created_at: string; deleted_at?: string; is_read?: boolean; sender?: Profile; attachment?: { file_name: string } };
type Props = { userId: string; active: boolean; friendMenuOpen: boolean; privateMessagesOpen: boolean; onCloseFriendMenu: () => void; onClosePrivateMessages: () => void; onUnreadChange?: (count: number) => void };
const name = (p?: Profile) => p?.username || p?.full_name || "ComePlayers user";
const roomName = (r: Room) => r.room_type === "group" ? r.title || "Group" : name(r.other);
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });
const errorText = (e: unknown) => e instanceof Error ? e.message : "Please try again.";

function Avatar({ profile, title }: { profile?: Profile; title?: string }) {
  return <span className={styles.avatar}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="" onError={e => { e.currentTarget.style.display = "none"; }} /> : (title || name(profile)).slice(0, 1).toUpperCase()}</span>;
}

function GroupAvatar({ iconUrl, title }: { iconUrl?: string | null; title: string }) {
  const [failedCustomUrl, setFailedCustomUrl] = useState<string | null>(null);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const customUrl = String(iconUrl || "").trim();
  const showCustomImage = customUrl !== failedCustomUrl && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp);base64,)/i.test(customUrl);
  const imageUrl = showCustomImage ? customUrl : DEFAULT_COMMUNITY_GROUP_ICON;
  return <span className={`${styles.avatar} ${styles.groupAvatar}`} aria-label={`${title} group icon`}>
    {fallbackFailed && !showCustomImage ? title.slice(0, 1).toUpperCase() : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => {
        if (showCustomImage) setFailedCustomUrl(customUrl);
        else setFallbackFailed(true);
      }} />
    )}
  </span>;
}

export default function ContactsWorkspace(props: Props) {
  const { userId, active, friendMenuOpen, privateMessagesOpen } = props;
  const visible = friendMenuOpen || privateMessagesOpen;
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; }, [props]);
  const panel = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"chats" | "contacts" | "group" | "blocked">("chats");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);
  const [invite, setInvite] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);

  const loadRooms = useCallback(async () => {
    const result = await api<{ rooms: Room[] }>("/api/messages/rooms?limit=100");
    setRooms(result.rooms);
    callbacks.current.onUnreadChange?.(result.rooms.reduce((sum, r) => sum + (r.room_type === "group" ? 0 : r.unread_count || 0), 0));
  }, []);
  useEffect(() => {
    if (!active || !userId) { setRooms([]); setSelected(null); return; }
    let live = true;
    let running = false;
    const refresh = async () => {
      if (running || document.hidden) return;
      running = true;
      try { await loadRooms(); } catch (e) { if (live && visible) setNotice(errorText(e)); }
      finally { running = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { live = false; clearInterval(timer); };
  }, [active, userId, loadRooms, visible]);

  useEffect(() => {
    if (!visible) return;
    setMode(friendMenuOpen ? "contacts" : "chats"); setSelected(null); setQuery(""); setNotice("");
    const prior = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { callbacks.current.onCloseFriendMenu(); callbacks.current.onClosePrivateMessages(); }
      if (event.key !== "Tab") return;
      const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [tabindex="0"]');
      if (!nodes?.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); prior?.focus(); };
  }, [visible, friendMenuOpen]);

  const selectedId = selected?.id;
  useEffect(() => {
    if (!visible || !active || selectedId || (mode === "chats" && query.trim().length < 2)) { setUsers([]); return; }
    let live = true;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void api<{ users: Profile[] }>(mode === "blocked" ? "/api/messages/blocks" : `/api/messages/contacts?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(data => { if (live) setUsers(data.users); }).catch(e => { if (live) setNotice(errorText(e)); })
        .finally(() => { if (live) setLoading(false); });
    }, 400);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [visible, active, mode, query, selectedId]);
  useEffect(() => {
    if (!visible || !selectedId) return;
    if (selected?.room_type !== "group") {
      window.location.assign(`/chat?room=${encodeURIComponent(selectedId)}`);
      return;
    }
    let live = true; let running = false;
    let lastId = "";
    setConversationLoading(true); setMessages([]); setDraft(""); setInvite("");
    const refresh = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const data = await api<{ room: Room; messages: Message[] }>(`/api/messages/rooms/${selectedId}?limit=120`);
        if (!live) return;
        setSelected(current => current?.id === selectedId ? data.room : current);
        setMessages(data.messages);
        const latest = data.messages.at(-1)?.id || "";
        if (latest !== lastId) {
          const firstLoad = !lastId; lastId = latest;
          if (firstLoad) requestAnimationFrame(() => end.current?.scrollIntoView({ block: "nearest" }));
          await api(`/api/messages/rooms/${selectedId}/read`, json("POST", {}));
          if (live) await loadRooms();
        }
      } catch (e) { if (live) setNotice(errorText(e)); }
      finally { running = false; if (live) setConversationLoading(false); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    return () => { live = false; clearInterval(timer); };
  }, [selectedId, selected?.room_type, visible, loadRooms]);

  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice("");
    try { await fn(); } catch (e) { setNotice(errorText(e)); } finally { setBusy(false); }
  };
  const choose = (user: Profile) => {
    if (mode === "group") { setMembers(rows => rows.some(p => p.id === user.id) ? rows.filter(p => p.id !== user.id) : [...rows, user]); return; }
    void action(async () => {
      if (mode === "blocked") { await api("/api/messages/blocks", json("DELETE", { userId: user.id })); setUsers(rows => rows.filter(p => p.id !== user.id)); return; }
      const data = await api<{ room: Room }>("/api/messages/contacts", json("POST", { userId: user.id })); setSelected(data.room);
    });
  };
  const close = () => { props.onCloseFriendMenu(); props.onClosePrivateMessages(); };
  const filtered = rooms.filter(r => (filter !== "unread" || !!r.unread_count) && (filter !== "groups" || r.room_type === "group") && `${roomName(r)} ${r.last_message || ""}`.toLowerCase().includes(query.toLowerCase()));
  if (!visible || !active) return null;
  return createPortal(<div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-label={selected ? roomName(selected) : "Messages and contacts"} tabIndex={-1}>
      <header className={styles.header}>
        {selected ? <button aria-label="Back to chats" onClick={() => { setSelected(null); setNotice(""); }}><FaArrowLeft /></button> : <FaCommentDots />}
        <h2>{selected ? roomName(selected) : mode === "chats" ? "Messages" : mode === "blocked" ? "Blocked contacts" : mode === "group" ? "New group" : "Contacts"}</h2>
        {selected && selected.room_type !== "group" && selected.other ? <button title={selected.blocked_by_me ? "Unblock contact" : "Block contact"} aria-label={selected.blocked_by_me ? "Unblock contact" : "Block contact"} disabled={busy} onClick={() => {
          const block = !selected.blocked_by_me;
          if (!window.confirm(block ? "Block this contact? Direct messages and invitations will stop. Shared groups are not affected." : "Unblock this contact?")) return;
          void action(async () => { await api("/api/messages/blocks", json(block ? "POST" : "DELETE", { userId: selected.other!.id })); const data = await api<{room: Room}>(`/api/messages/rooms/${selected.id}`); setSelected(data.room); });
        }}><FaBan /></button> : null}
        <button onClick={close} aria-label="Close messages"><FaTimes /></button>
      </header>
      {!selected ? <>
        <nav className={styles.tabs} aria-label="Contacts views">{([['chats','Chats'],['contacts','Contacts'],['group','New group'],['blocked','Blocked']] as const).map(([id,label]) => <button key={id} aria-pressed={mode===id} onClick={() => { setMode(id); setQuery(""); setNotice(""); }}>{label}</button>)}</nav>
        {mode === "group" ? <div className={styles.group}><input aria-label="Group name" placeholder="Group name" value={groupName} maxLength={80} onChange={e=>setGroupName(e.target.value)} /><small>{members.length} selected: {members.map(name).join(", ")}</small><button disabled={busy || groupName.trim().length < 3} onClick={() => void action(async () => { const data = await api<{ room: Room }>("/api/messages/groups", json("POST", {title: groupName.trim(), memberIds: members.map(p=>p.id)})); setMembers([]); setGroupName(""); setSelected(data.room); await loadRooms(); })}><FaUsers /> Create group</button></div> : null}
        {mode !== "blocked" ? <label className={styles.search}><FaSearch /><input aria-label="Search chats or contacts" placeholder="Search username or phone number" value={query} autoComplete="off" onChange={e=>setQuery(e.target.value)} /></label> : null}
        {mode === "chats" ? <div className={styles.tabs}>{["all", "unread", "groups"].map(value => <button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value}</button>)}</div> : null}
        <div className={styles.list}>
          {(mode !== "chats" || query.length >= 2) ? <><p className={styles.label}>{mode === "blocked" ? "Blocked contacts" : query ? "People" : "Recently contacted"}</p>{loading ? <p className={styles.empty}>Loading contacts…</p> : users.map(user => <button className={styles.row} key={user.id} disabled={busy} onClick={()=>choose(user)}><Avatar profile={user} /><span className={styles.copy}><strong>{name(user)}</strong><small>@{user.username || "player"}</small></span><span className={styles.accent}>{mode === "blocked" ? "Unblock" : mode === "group" ? members.some(p=>p.id===user.id) ? "Selected" : "Select" : "Chat"}</span></button>)}{!loading && !users.length ? <p className={styles.empty}>{mode === "blocked" ? "No blocked contacts." : "Search an exact username or a complete verified phone number, including country code. No friend request needed."}</p> : null}</> : null}
          {mode === "chats" ? <><p className={styles.label}>Chats</p>{filtered.map(room => <button className={styles.row} key={room.id} onClick={()=>{setSelected(room); setNotice("");}}>{room.room_type === "group" ? <GroupAvatar iconUrl={room.server?.icon_url} title={roomName(room)} /> : <Avatar profile={room.other} title={roomName(room)} />}<span className={styles.copy}><strong>{roomName(room)}</strong><small>{room.last_message || "No messages yet"}</small></span><span className={styles.meta}>{room.last_message_at ? new Date(room.last_message_at).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : ""}{room.unread_count ? <b>{room.unread_count}</b> : null}</span></button>)}{!filtered.length ? <p className={styles.empty}>No conversations here yet. Open Contacts to start a chat.</p> : null}</> : null}
        </div>
      </> : <>
        {selected.room_type === "group" ? <form className={styles.invite} onSubmit={e=>{e.preventDefault(); void action(async()=>{await api(`/api/messages/rooms/${selected.id}/members`,json("POST",{identifier:invite.trim()}));setInvite("");setNotice("Group invitation sent.");});}}><input aria-label="Invite by username or phone" placeholder="Invite by username or phone" value={invite} onChange={e=>setInvite(e.target.value)} /><button disabled={busy || !invite.trim()}><FaPlus /> Invite</button></form> : null}
        <div className={styles.messages}>{conversationLoading ? <p className={styles.empty}>Loading messages…</p> : messages.length ? messages.map((message,index) => <div key={message.id}>
          {index===0 || new Date(messages[index-1].created_at).toDateString()!==new Date(message.created_at).toDateString() ? <p className={styles.date}>{new Date(message.created_at).toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"})}</p> : null}
          <article className={`${styles.bubble} ${message.sender_id===userId ? styles.own : ""}`}>{selected.room_type === "group" && message.sender_id!==userId ? <strong>{name(message.sender)}</strong> : null}<p>{message.deleted_at ? "Message deleted" : message.message || (message.attachment ? `Attachment: ${message.attachment.file_name}` : "")}</p><small>{new Date(message.created_at).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}{message.sender_id===userId ? message.is_read ? " ✓✓" : " ✓" : ""}</small></article>
        </div>) : <p className={styles.empty}>Start the conversation. Say hello!</p>}<div ref={end} /></div>
        {selected.contact_unavailable ? <p className={styles.empty}>{selected.blocked_by_me ? "You blocked this contact. Use the block button to unblock." : "Messaging is unavailable for this contact."}</p> : null}
        <form className={styles.composer} onSubmit={e=>{e.preventDefault(); if (!draft.trim() || selected.contact_unavailable) return; void action(async()=>{await api(`/api/messages/rooms/${selected.id}/messages`,json("POST",{message:draft.trim()}));setDraft("");const data=await api<{messages:Message[]}>(`/api/messages/rooms/${selected.id}?limit=120`);setMessages(data.messages);requestAnimationFrame(()=>end.current?.scrollIntoView({block:"nearest"}));await loadRooms();});}}><input aria-label="Message" placeholder="Type a message" maxLength={2000} value={draft} disabled={selected.contact_unavailable} onChange={e=>setDraft(e.target.value)} /><button aria-label="Send message" disabled={busy || !draft.trim() || selected.contact_unavailable}><FaPaperPlane /></button></form>
      </>}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    </div>
  </div>, document.body);
}
