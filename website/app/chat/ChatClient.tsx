"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import SecureIncomingCallAlert from "@/components/messages/SecureIncomingCallAlert";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FaArrowLeft, FaComments, FaSearch, FaShoppingBag, FaUsers } from "react-icons/fa";
import AuthModal from "@/components/auth/AuthModal";
import { authenticatedFetchJson } from "@/lib/authenticatedFetch";
import { isTransactionChatRoom } from "@/lib/chatRoomScope";
import { supabase } from "@/lib/supabase";
import styles from "./chat.module.css";

const SecureDirectConversation = dynamic(
  () => import("@/components/messages/SecureDirectConversation"),
  {
    ssr: false,
    loading: () => <div role="status" className="flex min-h-0 flex-1 items-center justify-center">Memuat percakapan…</div>,
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
  return profile?.full_name?.trim() || profile?.username?.trim() || "Pengguna ComePlayers";
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
      const result = await authenticatedFetchJson<RoomsResponse>("/api/messages/rooms?limit=100&scope=transaction");
      const next = (result.rooms || []).filter(isTransactionChatRoom);
      setRooms(current => {
        const retained = preferredRoomId && current.find(room => room.id === preferredRoomId && isTransactionChatRoom(room) && !next.some(item => item.id === room.id));
        return retained ? [retained, ...next] : next;
      });
      setSelectedRoomId((current) => {
        const requested = preferredRoomId || current;
        return requested && (preferredRoomId || next.some((room) => room.id === requested)) ? requested : next[0]?.id || "";
      });
      return next;
    } catch (cause) {
      if (!silent) setError(cause instanceof Error ? cause.message : "Daftar chat belum bisa dimuat.");
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
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Chat transaksi belum bisa dibuka.");
        }
      }
      if (cancelled) return;
      const next = await loadRooms(preferredRoomId);
      if (cancelled) return;
      if (preferredRoomId && !next.some(room => room.id === preferredRoomId)) {
        try {
          const result = await authenticatedFetchJson<{ room: Room }>(`/api/messages/rooms/${encodeURIComponent(preferredRoomId)}`);
          if (cancelled) return;
          if (!result.room || !isTransactionChatRoom(result.room)) {
            window.location.replace(`/cpcommunity?room=${encodeURIComponent(preferredRoomId)}`);
            return;
          }
          const requestedRoom = result.room;
          setRooms(current => [requestedRoom, ...current.filter(room => room.id !== requestedRoom.id)]);
          setSelectedRoomId(requestedRoom.id);
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Percakapan belum bisa dibuka.");
          setSelectedRoomId(next[0]?.id || "");
          preferredRoomId = "";
        }
      }
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
  const selectedCandidate = rooms.find((room) => room.id === selectedRoomId) || null;
  const selectedRoom = isTransactionChatRoom(selectedCandidate) ? selectedCandidate : null;

  if (!authReady) {
    return <main className={styles.page}><div role="status" className={`${styles.shell} ${styles.loadingShell}`}><span className={styles.spinner} aria-hidden="true" /><p>Menyiapkan chat…</p></div></main>;
  }
  if (!userId) {
    return (
      <main className={styles.page}>
        <section className={`${styles.shell} ${styles.loginShell}`}>
          <div className={styles.loginIcon}><FaComments /></div>
          <span className={styles.eyebrow}>COMEPLAYERS</span>
          <h1>Chat Toko</h1>
          <p>Masuk untuk mengobrol dengan pembeli atau penjual tentang produk dan pesanan.</p>
          <button type="button" onClick={() => setAuthOpen(true)} className={styles.primaryButton}>Masuk ke ComePlayers</button>
          <Link href="/marketplace" className={styles.secondaryLink}><FaShoppingBag aria-hidden="true" /> Kembali ke toko</Link>
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
          if (!result.room) throw new Error("Percakapan belum bisa dibuka.");
          if (!isTransactionChatRoom(result.room)) {
            window.location.assign(`/cpcommunity?room=${encodeURIComponent(roomId)}`);
            return;
          }
          setRooms(current => [result.room, ...current.filter(room => room.id !== roomId)]);
        }
        setSelectedRoomId(roomId); setMobileChatOpen(true);
      }} /> : null}
      <section className={styles.shell} aria-label="Chat Toko ComePlayers">
        <aside aria-label="Daftar chat toko" className={`${styles.sidebar} ${mobileChatOpen ? styles.sidebarHiddenMobile : ""}`}>
          <div className={styles.sidebarHeader}>
            <div><span className={styles.eyebrow}>COMEPLAYERS</span><h1>Chat Toko</h1></div>
            <span className={styles.roomCount} aria-label={`${rooms.length} percakapan toko`}>{rooms.length}</span>
          </div>
          <label className={styles.searchBox}>
            <FaSearch aria-hidden="true" /><span className={styles.srOnly}>Cari nama, produk, atau pesanan</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari pembeli, produk, atau pesanan" />
          </label>
          <div className={styles.listHeading}>Pembeli dan penjual</div>
          {error ? <div className={styles.listError}><p role="alert">Chat belum bisa dimuat.</p><button type="button" onClick={() => { setError(""); void loadRooms(selectedRoomId); }}>Coba lagi</button><details><summary>Lihat rincian</summary><p>{error}</p></details></div> : null}
          <div className={styles.roomList}>
            {loadingRooms ? <div role="status" className={styles.listLoading}><span className={styles.spinner} aria-hidden="true" /> Memuat chat…</div> : filteredRooms.length ? filteredRooms.map((room) => {
              const title = room.order?.product_title || room.product?.title || "";
              return (
                <button type="button" key={room.id} aria-pressed={selectedRoomId === room.id} onClick={() => { setSelectedRoomId(room.id); setMobileChatOpen(true); }} className={`${styles.roomItem} ${selectedRoomId === room.id ? styles.roomItemActive : ""}`}>
                  <Avatar profile={room.other} />
                  <span className={styles.roomCopy}>
                    <span className={styles.roomTopline}><strong>{profileName(room.other)}</strong><time>{formatListDate(room.last_message_at || room.created_at)}</time></span>
                    {room.order_id || title ? <span className={styles.roomOrder}>{room.order_id ? `Pesanan #${room.order_id}${title ? ` · ${title}` : ""}` : title}</span> : null}
                    <span className={styles.roomPreview}>Ketuk untuk membuka chat</span>
                  </span>
                  {room.unread_count > 0 ? <span aria-label={`${room.unread_count} pesan belum dibaca`} className={styles.unreadBadge}>{room.unread_count > 99 ? "99+" : room.unread_count}</span> : null}
                </button>
              );
            }) : <div className={styles.emptyList}><span><FaComments aria-hidden="true" /></span><strong>{search ? "Chat tidak ditemukan" : "Belum ada chat toko"}</strong><p>{search ? "Coba nama lain, produk, atau nomor pesanan." : "Chat dengan pembeli atau penjual muncul saat Anda membuka produk atau pesanan."}</p>{search ? <button type="button" onClick={() => setSearch("")}>Lihat semua chat</button> : <Link href="/marketplace">Jelajahi produk</Link>}</div>}
          </div>
          <nav className={styles.sidebarFooter} aria-label="Kotak masuk ComePlayers"><Link href="/cpcommunity?inbox=1"><FaUsers aria-hidden="true" /> Pesan pribadi</Link><Link href="/marketplace"><FaShoppingBag aria-hidden="true" /> Toko</Link></nav>
        </aside>
        <section className={`${styles.chatPanel} ${mobileChatOpen ? styles.chatPanelOpenMobile : ""}`}>
          {selectedRoom ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <button type="button" className={`${styles.backButton} m-2 md:hidden`} onClick={() => setMobileChatOpen(false)} aria-label="Kembali ke daftar chat"><FaArrowLeft aria-hidden="true" /></button>
              <SecureDirectConversation key={selectedRoom.id} userId={userId} room={selectedRoom} />
            </div>
          ) : (
            <div className={styles.noSelection}><span><FaComments aria-hidden="true" /></span><h2>Pilih chat toko</h2><p>Pilih pembeli atau penjual di daftar untuk mulai mengobrol.</p></div>
          )}
        </section>
      </section>
    </main>
  );
}
