"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import SecureIncomingCallAlert from "@/components/messages/SecureIncomingCallAlert";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaComments, FaSearch, FaShieldAlt, FaShoppingBag } from "react-icons/fa";
import AuthModal from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import styles from "./chat.module.css";

const SecureDirectConversation = dynamic(
  () => import("@/components/messages/SecureDirectConversation"),
  {
    ssr: false,
    loading: () => <div className="flex min-h-0 flex-1 items-center justify-center">Opening encrypted Messages…</div>,
  },
);

type Profile = {
  id: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

type Product = { id: number; title?: string | null; image_url?: string | null };
type OrderSummary = {
  id: number;
  status?: string | null;
  payment_status?: string | null;
  product_title?: string | null;
};
type Room = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id?: number | null;
  order_id?: number | null;
  room_type?: string | null;
  status?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_sender_id?: string | null;
  created_at?: string | null;
  unread_count: number;
  other: Profile | null;
  product: Product | null;
  order: OrderSummary | null;
};
type RoomsResponse = { rooms: Room[] };

function profileName(profile?: Profile | null) {
  return profile?.full_name?.trim() || profile?.username?.trim() || "ComePlayers User";
}
function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "CP";
}
function formatListDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}
function Avatar({ profile }: { profile?: Profile | null }) {
  const name = profileName(profile);
  return (
    <span className={`${styles.avatar} ${styles.avatarmedium}`} aria-hidden="true">
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" />
      ) : initials(name)}
    </span>
  );
}

export default function ChatClient() {
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id || "";
      setUserId(id);
      setAuthOpen(!id);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || "";
      setUserId(id);
      setAuthOpen(!id);
      if (!id) {
        setRooms([]);
        setSelectedRoomId("");
      }
      setAuthReady(true);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadRooms = useCallback(async (preferredRoomId = "", silent = false) => {
    if (!silent) setLoadingRooms(true);
    try {
      const result = await authenticatedFetchJson<RoomsResponse>("/api/messages/rooms?limit=100&scope=direct");
      const next = (result.rooms || []).filter(room => room.room_type !== "group");
      setRooms(next);
      setSelectedRoomId((current) => {
        const requested = preferredRoomId || current;
        return requested && next.some((room) => room.id === requested) ? requested : next[0]?.id || "";
      });
      return next;
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "The chat list could not be loaded.");
      return [];
    } finally {
      if (!silent) setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !userId) return;
    let cancelled = false;
    void (async () => {
      setError("");
      const params = new URLSearchParams(window.location.search);
      let preferredRoomId = params.get("room")?.trim() || "";
      const orderId = Number(params.get("order") || 0);
      const productId = Number(params.get("product") || 0);
      const sellerId = params.get("seller")?.trim() || "";
      if (orderId > 0 || productId > 0) {
        try {
          const created = await authenticatedFetchJson<{ room: { id: string } }>("/api/messages/rooms", {
            method: "POST",
            body: JSON.stringify({ orderId: orderId || undefined, productId: productId || undefined, sellerId: sellerId || undefined }),
          });
          preferredRoomId = created.room?.id || preferredRoomId;
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "The transaction chat could not be created.");
        }
      }
      if (cancelled) return;
      await loadRooms(preferredRoomId);
      if (preferredRoomId && window.matchMedia("(max-width: 760px)").matches) setMobileChatOpen(true);
    })();
    return () => { cancelled = true; };
  }, [authReady, loadRooms, userId]);

  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => void loadRooms(selectedRoomId, true), 18_000);
    return () => window.clearInterval(timer);
  }, [loadRooms, selectedRoomId, userId]);
  useEffect(() => {
    if (!selectedRoomId) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("room", selectedRoomId);
    window.history.replaceState({}, "", url);
  }, [selectedRoomId]);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => [profileName(room.other), room.product?.title, room.order?.product_title, room.order_id ? `#${room.order_id}` : ""]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [rooms, search]);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;

  if (!authReady) {
    return <main className={styles.page}><div className={`${styles.shell} ${styles.loadingShell}`}><span className={styles.spinner} /><p>Preparing encrypted chat…</p></div></main>;
  }
  if (!userId) {
    return (
      <main className={styles.page}>
        <section className={`${styles.shell} ${styles.loginShell}`}>
          <div className={styles.loginIcon}><FaComments /></div>
          <span className={styles.eyebrow}>CUSTOMER &amp; SELLER CHAT</span>
          <h1>Sign in to view encrypted chats</h1>
          <p>Your new private messages are end-to-end encrypted and synchronized as ciphertext.</p>
          <button type="button" onClick={() => setAuthOpen(true)} className={styles.primaryButton}>Sign in to ComePlayers</button>
          <Link href="/marketplace" className={styles.secondaryLink}><FaShoppingBag /> Back to Marketplace</Link>
        </section>
        <AuthModal open={authOpen} initialMode="login" onClose={() => setAuthOpen(false)} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {userId ? <SecureIncomingCallAlert key={userId} userId={userId} onOpenRoom={async roomId => {
        if (!rooms.some(room => room.id === roomId)) {
          const result = await authenticatedFetchJson<{ room: Room }>(`/api/messages/rooms/${encodeURIComponent(roomId)}`);
          if (!result.room || result.room.room_type === "group") throw new Error("Private conversation is unavailable.");
          setRooms(current => [result.room, ...current.filter(room => room.id !== roomId)]);
        }
        setSelectedRoomId(roomId); setMobileChatOpen(true);
      }} /> : null}
      <section className={styles.shell} aria-label="Customer and seller encrypted chat">
        <aside className={`${styles.sidebar} ${mobileChatOpen ? styles.sidebarHiddenMobile : ""}`}>
          <div className={styles.sidebarHeader}>
            <div><span className={styles.eyebrow}>COMEPLAYERS</span><h1>Chat</h1></div>
            <span className={styles.roomCount}>{rooms.length}</span>
          </div>
          <label className={styles.searchBox}>
            <FaSearch /><span className={styles.srOnly}>Search chats</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, product, or order" />
          </label>
          <div className={styles.listHeading}><span>Private conversations</span><small>End-to-end encrypted</small></div>
          {error ? <div className={styles.errorBanner}>{error}</div> : null}
          <div className={styles.roomList}>
            {loadingRooms ? <div className={styles.listLoading}><span className={styles.spinner} /> Loading chats…</div> : filteredRooms.length ? filteredRooms.map((room) => {
              const title = room.order?.product_title || room.product?.title || "Direct message";
              return (
                <button type="button" key={room.id} onClick={() => { setSelectedRoomId(room.id); setMobileChatOpen(true); }} className={`${styles.roomItem} ${selectedRoomId === room.id ? styles.roomItemActive : ""}`}>
                  <Avatar profile={room.other} />
                  <span className={styles.roomCopy}>
                    <span className={styles.roomTopline}><strong>{profileName(room.other)}</strong><time>{formatListDate(room.last_message_at || room.created_at)}</time></span>
                    <span className={styles.roomOrder}>{room.order_id ? `Order #${room.order_id}` : title}</span>
                    <span className={styles.roomPreview}><FaShieldAlt /> Encrypted messages</span>
                  </span>
                  {room.unread_count > 0 ? <span className={styles.unreadBadge}>{room.unread_count > 99 ? "99+" : room.unread_count}</span> : null}
                </button>
              );
            }) : <div className={styles.emptyList}><span><FaComments /></span><strong>{search ? "No chats found" : "No transaction chats yet"}</strong><p>{search ? "Try another search term." : "Chats appear after you contact a seller."}</p>{!search ? <Link href="/marketplace">Open Marketplace</Link> : null}</div>}
          </div>
          <div className={styles.sidebarFooter}><FaShieldAlt /><span><strong>End-to-end encrypted</strong> New content is encrypted before upload.</span></div>
        </aside>
        <section className={`${styles.chatPanel} ${mobileChatOpen ? styles.chatPanelOpenMobile : ""}`}>
          {selectedRoom ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <button type="button" className={`${styles.backButton} m-2 md:hidden`} onClick={() => setMobileChatOpen(false)} aria-label="Back to chat list"><FaArrowLeft /></button>
              <SecureDirectConversation key={selectedRoom.id} userId={userId} room={selectedRoom} />
            </div>
          ) : (
            <div className={styles.noSelection}><span><FaComments /></span><h2>Select a conversation</h2><p>Select a customer or seller to open encrypted Messages.</p></div>
          )}
        </section>
      </section>
    </main>
  );
}
