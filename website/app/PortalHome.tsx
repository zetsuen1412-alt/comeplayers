"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FaAndroid,
  FaComments,
  FaHandPointLeft,
  FaHandPointRight,
  FaShoppingCart,
  FaWindows,
} from "react-icons/fa";
import styles from "./portal.module.css";

export default function PortalHome() {
  return (
    <main className={styles.portal}>
      <div className={styles.ambient} aria-hidden="true" />

      <header className={styles.brandBar}>
        <Image
          src="/brand/comeplayers-cp-v6.png"
          alt="ComePlayers"
          width={320}
          height={94}
          className={styles.logo}
          priority
        />
        <p>PLAY TOGETHER. <strong>WIN TOGETHER.</strong></p>
      </header>

      <section className={styles.hero} aria-labelledby="portal-title">
        <div className={`${styles.choice} ${styles.chatChoice}`}>
          <span className={styles.eyebrow}>CONNECT</span>
          <FaComments className={styles.choiceIcon} aria-hidden="true" />
          <h2>Chat &amp;<br />Messages</h2>
          <p>Find players, build your squad, create parties, and talk in real time.</p>
          <Link href="/cpcommunity" className={styles.primaryAction}>
            Open Chat &amp; Messages
          </Link>
        </div>

        <div className={styles.alexiaStage}>
          <div className={`${styles.pointer} ${styles.pointerLeft}`} aria-hidden="true">
            <FaHandPointLeft />
          </div>
          <div className={`${styles.pointer} ${styles.pointerRight}`} aria-hidden="true">
            <FaHandPointRight />
          </div>
          <div className={styles.alexiaGlow} aria-hidden="true" />
          <Image
            src="/alexia/alexia-portal.png"
            alt="Alexia, the official ComePlayers mascot"
            width={1122}
            height={1402}
            className={styles.alexia}
            priority
            sizes="(max-width: 900px) 72vw, 38vw"
          />
          <div className={styles.alexiaCopy}>
            <span>WELCOME TO</span>
            <h1 id="portal-title">COME<span>PLAYERS</span></h1>
            <p>Choose where you want to play.</p>
          </div>
        </div>

        <div className={`${styles.choice} ${styles.marketChoice}`}>
          <span className={styles.eyebrow}>TRADE</span>
          <FaShoppingCart className={styles.choiceIcon} aria-hidden="true" />
          <h2>Gaming<br />Marketplace</h2>
          <p>Discover accounts, top-ups, gift cards, items, services, and trusted sellers.</p>
          <Link href="/marketplace" className={styles.primaryAction}>
            Explore Marketplace
          </Link>
        </div>
      </section>

      <section className={styles.downloads} aria-label="Download ComePlayers apps">
        <div>
          <span className={styles.downloadLabel}>TAKE COMEPLAYERS WITH YOU</span>
          <p>Chat, connect, and keep your squad close on every device.</p>
        </div>
        <div className={styles.downloadActions}>
          <a
            href="/api/downloads/windows/ComePlayers_0.5.3_x64-setup.exe"
            className={styles.downloadButton}
            download
          >
            <FaWindows aria-hidden="true" />
            <span><small>DOWNLOAD FOR</small>Windows Desktop</span>
          </a>
          <a
            href="/api/downloads/android/ComePlayers_0.12.1_android.apk"
            className={styles.downloadButton}
            download
          >
            <FaAndroid aria-hidden="true" />
            <span><small>DOWNLOAD APK FOR</small>Android</span>
          </a>
        </div>
      </section>
    </main>
  );
}
