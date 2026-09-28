"use client";

import Link from "next/link";
import { useState } from "react";
import { FaComments, FaPlus } from "react-icons/fa";
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
  onCreate: () => void;
  guestPreview?: { name: string; iconUrl?: string | null } | null;
  onGuestSignIn?: () => void;
};

function GroupAvatar({ name, iconUrl }: { name: string; iconUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const words = name.trim().split(/\s+/u);
  const initials = (words.length > 1
    ? `${Array.from(words[0] || "")[0] || ""}${Array.from(words[1] || "")[0] || ""}`
    : Array.from(words[0] || "CP").slice(0, 2).join("")).toLocaleUpperCase("id-ID");
  const showImage = iconUrl && iconUrl !== failedUrl && /^(https?:\/\/|\/(?!\/))/.test(iconUrl);
  return <span className={styles.avatar} aria-hidden="true">
    {showImage ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(iconUrl)} />
    ) : initials}
  </span>;
}

/** Membership-backed navigation only. Selection and creation stay with the parent. */
export default function CommunityGroupRail({ rooms, selectedRoomId, onSelect, onCreate, guestPreview, onGuestSignIn }: Props) {
  return <nav className={styles.rail} aria-label="Pesan dan grup ComePlayers" data-community-group-rail>
    <Link href="/chat" className={`${styles.entry} ${styles.privateLink}`} title="Pesan pribadi" aria-label="Buka pesan pribadi">
      <span className={`${styles.avatar} ${styles.privateIcon}`} aria-hidden="true"><FaComments /></span>
      <span className={styles.name}>Pesan</span>
    </Link>
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
