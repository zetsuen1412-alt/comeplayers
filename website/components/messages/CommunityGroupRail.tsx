"use client";

import { useState } from "react";
import { FaComments, FaPlus } from "react-icons/fa";
import { DEFAULT_COMMUNITY_GROUP_ICON } from "@/lib/communityAvatar";
import styles from "./community-group-rail.module.css";

export type CommunityGroupRailRoom = {
  id: string;
  name: string;
  iconUrl?: string | null;
  unreadCount?: number;
};

type Props = {
  rooms: readonly CommunityGroupRailRoom[];
  selectedRoomId: string;
  onSelect: (roomId: string) => void;
  onOpenMessages: () => void;
  onCreate: () => void;
  guestPreview?: { name: string; iconUrl?: string | null } | null;
  onGuestSignIn?: () => void;
};

function GroupAvatar({ name, iconUrl }: { name: string; iconUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const customUrl = String(iconUrl || "").trim();
  const showCustomImage = customUrl !== failedUrl && /^(https?:\/\/|\/(?!\/)|data:image\/(?:png|jpeg|webp);base64,)/i.test(customUrl);
  const imageUrl = showCustomImage ? customUrl : DEFAULT_COMMUNITY_GROUP_ICON;
  const initials = Array.from(name.trim() || "CP").slice(0, 2).join("").toLocaleUpperCase("id-ID");
  return <span className={styles.avatar} aria-hidden="true">
    {fallbackFailed && !showCustomImage ? initials : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => {
        if (showCustomImage) setFailedUrl(customUrl);
        else setFallbackFailed(true);
      }} />
    )}
  </span>;
}

/** Membership-backed navigation only. Selection and creation stay with the parent. */
export default function CommunityGroupRail({ rooms, selectedRoomId, onSelect, onOpenMessages, onCreate, guestPreview, onGuestSignIn }: Props) {
  return <nav className={styles.rail} aria-label="Pesan dan grup ComePlayers" data-community-group-rail>
    <button type="button" onClick={onOpenMessages} className={`${styles.entry} ${styles.privateLink}`} title="Pesan pengguna" aria-label="Buka pesan pengguna">
      <span className={`${styles.avatar} ${styles.privateIcon}`} aria-hidden="true"><FaComments /></span>
      <span className={styles.name}>Pesan</span>
    </button>
    <p className={styles.heading}>GRUP</p>
    <div className={styles.groups}>
      {rooms.map(room => {
        const name = room.name.trim() || "Grup ComePlayers";
        const unread = Number.isFinite(room.unreadCount) ? Math.max(0, Math.floor(room.unreadCount || 0)) : 0;
        const selected = room.id === selectedRoomId;
        return <button key={room.id} type="button" onClick={() => onSelect(room.id)} className={styles.entry} aria-current={selected ? "page" : undefined} title={name} aria-label={`${name}${unread ? `, ${unread} pesan belum dibaca` : ""}`}>
          <span className={styles.avatarWrap}>
            <GroupAvatar name={name} iconUrl={room.iconUrl} />
            {unread > 0 ? <span className={styles.badge} aria-hidden="true">{unread > 99 ? "99+" : unread}</span> : null}
          </span>
          <span className={styles.name}>{name}</span>
        </button>;
      })}
      {guestPreview ? <button type="button" onClick={onGuestSignIn} disabled={!onGuestSignIn} className={styles.entry} title={guestPreview.name} aria-label={`Masuk untuk membuka ${guestPreview.name}`}>
        <GroupAvatar name={guestPreview.name} iconUrl={guestPreview.iconUrl} />
        <span className={styles.name}>{guestPreview.name}</span>
      </button> : null}
      {!rooms.length && !guestPreview ? <p className={styles.empty}>Belum ada grup</p> : null}
    </div>
    <button type="button" onClick={onCreate} className={`${styles.entry} ${styles.create}`} title="Buat grup atau komunitas" aria-label="Buat grup atau komunitas">
      <span className={`${styles.avatar} ${styles.createIcon}`} aria-hidden="true"><FaPlus /></span>
      <span className={styles.name}>Buat</span>
    </button>
  </nav>;
}
