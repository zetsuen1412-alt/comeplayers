"use client";

import Link from "next/link";
import Image from "next/image";
import { useLayoutEffect, useState, type CSSProperties } from "react";
import {
  FaAndroid,
  FaApple,
  FaArrowRight,
  FaComments,
  FaEnvelope,
  FaHeadset,
  FaQuestionCircle,
  FaShoppingCart,
  FaUsers,
  FaWindows,
} from "react-icons/fa";
import styles from "./home.module.css";

type InfoPanel = "how" | "about" | "help" | "ios" | null;

const WINDOWS_URL =
  "/api/downloads/windows/ComePlayers_0.5.3_x64-setup.exe";
const ANDROID_URL =
  "/api/downloads/android/ComePlayers_0.13.0_18_android.apk";
const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@comeplayers.com";

const panelCopy: Record<
  Exclude<InfoPanel, null>,
  { title: string; body: string }
> = {
  how: {
    title: "How It Works",
    body:
      "Enter Chat & Community to meet players, build squads, and communicate. Open Marketplace to discover gaming products and trusted sellers.",
  },
  about: {
    title: "About ComePlayers",
    body:
      "ComePlayers brings gaming communities, player communication, and a gaming marketplace together in one platform.",
  },
  help: {
    title: "Help Center",
    body:
      "For account, chat, marketplace, or application assistance, contact the ComePlayers support team.",
  },
  ios: {
    title: "Install ComePlayers on iPhone",
    body:
      "Open ComePlayers in Safari, tap the Share button, choose Add to Home Screen, then tap Add. ComePlayers will open full screen and automatically use the latest website version.",
  },
};

export default function HomeClient() {
  const [panel, setPanel] = useState<InfoPanel>(null);

  useLayoutEffect(() => {
    document.body.classList.add("cp-home-no-chrome");
    document.documentElement.classList.add("cp-home-active");

    return () => {
      document.body.classList.remove("cp-home-no-chrome");
      document.documentElement.classList.remove("cp-home-active");
    };
  }, []);

  const particles = Array.from({ length: 24 }, (_, index) => ({
    id: index,
    x: (index * 37 + 9) % 100,
    y: (index * 53 + 13) % 100,
    delay: -((index * 0.83) % 8),
    duration: 5.5 + (index % 7) * 0.7,
    side: index % 2 === 0 ? "blue" : "gold",
  }));

  return (
    <main className={styles.home}>
      <section className={styles.stage} aria-label="ComePlayers main menu">
        <div className={styles.ambientBackdrop} aria-hidden="true" />
        <picture>
          <source
            media="(min-width: 2561px)"
            srcSet="/home-v24/comeplayers-home-alexia-3840.webp"
          />
          <source
            media="(min-width: 1921px)"
            srcSet="/home-v24/comeplayers-home-alexia-2560.webp"
          />
          <img
            className={styles.artwork}
            src="/home-v24/comeplayers-home-alexia-1920.webp"
            alt="ComePlayers portal menu featuring the official Alexia between Chat and Community and Marketplace"
            width={1920}
            height={1081}
            draggable={false}
            fetchPriority="high"
          />
        </picture>

        <div className={styles.bluePortalGlow} aria-hidden="true" />
        <div className={styles.goldPortalGlow} aria-hidden="true" />
        <div className={styles.alexiaAura} aria-hidden="true" />
        <div className={styles.floorPulse} aria-hidden="true" />
        <div className={styles.scanline} aria-hidden="true" />
        <div className={styles.particles} aria-hidden="true">
          {particles.map((particle) => (
            <span
              key={particle.id}
              className={`${styles.particle} ${
                particle.side === "blue" ? styles.particleBlue : styles.particleGold
              }`}
              style={
                {
                  "--particle-x": `${particle.x}%`,
                  "--particle-y": `${particle.y}%`,
                  "--particle-delay": `${particle.delay}s`,
                  "--particle-duration": `${particle.duration}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <nav className={styles.hud} aria-label="ComePlayers navigation">
          <Link
            href="/cpcommunity"
            className={`${styles.hotspot} ${styles.chat}`}
            aria-label="Enter Chat and Community"
          >
            <span className={styles.srOnly}>Enter Chat and Community</span>
          </Link>

          <Link
            href="/marketplace"
            className={`${styles.hotspot} ${styles.marketplace}`}
            aria-label="Explore Marketplace"
          >
            <span className={styles.srOnly}>Explore Marketplace</span>
          </Link>

          <button
            type="button"
            className={`${styles.hotspot} ${styles.how}`}
            aria-label="How It Works"
            onClick={() => setPanel("how")}
          >
            <span className={styles.srOnly}>How It Works</span>
          </button>

          <button
            type="button"
            className={`${styles.hotspot} ${styles.about}`}
            aria-label="About Us"
            onClick={() => setPanel("about")}
          >
            <span className={styles.srOnly}>About Us</span>
          </button>

          <button
            type="button"
            className={`${styles.hotspot} ${styles.help}`}
            aria-label="Help Center"
            onClick={() => { window.location.href = "/help-center"; }}
          >
            <span className={styles.srOnly}>Help Center</span>
          </button>

          <a
            className={`${styles.hotspot} ${styles.contact}`}
            href={`mailto:${SUPPORT_EMAIL}`}
            aria-label="Contact ComePlayers support"
          >
            <span className={styles.srOnly}>Contact ComePlayers support</span>
          </a>

          <a
            className={`${styles.hotspot} ${styles.windows}`}
            href={WINDOWS_URL}
            download
            aria-label="Download ComePlayers for Windows"
          >
            <span className={styles.srOnly}>Download for Windows</span>
          </a>

          <a
            className={`${styles.hotspot} ${styles.android}`}
            href={ANDROID_URL}
            download
            aria-label="Download ComePlayers for Android"
          >
            <span className={styles.srOnly}>Download for Android</span>
          </a>
        </nav>
      </section>

      <section
        className={styles.mobilePortal}
        aria-label="ComePlayers mobile main menu"
      >
        <Image
          className={styles.mobilePageArtwork}
          src="/home-v23/comeplayers-mobile-home-raw-v3.png"
          alt=""
          width={941}
          height={1672}
          sizes="(max-width: 760px) 100vw, 680px"
          fetchPriority="high"
          draggable={false}
          aria-hidden="true"
        />
        <div className={styles.mobilePageShade} aria-hidden="true" />

        <header className={styles.mobileHeader}>
          <div className={styles.mobileBrand}>
            <Image
              src="/comeplayers-mark.png"
              alt=""
              width={42}
              height={42}
              aria-hidden="true"
            />
            <span>
              COME<strong>PLAYERS</strong>
            </span>
          </div>
          <p>
            PLAY TOGETHER. <strong>WIN TOGETHER.</strong>
          </p>
        </header>

        <div className={styles.mobileTitle}>
          <p>WELCOME TO</p>
          <h1>
            COME<span>PLAYERS</span>
          </h1>
          <div className={styles.mobileDivider}>
            <span aria-hidden="true" />
            CHOOSE YOUR WORLD
            <span aria-hidden="true" />
          </div>
        </div>

        <nav className={styles.mobileMenu} aria-label="Choose your destination">
          <Link
            href="/cpcommunity"
            className={`${styles.mobileWorldCard} ${styles.mobileChatCard}`}
          >
            <span className={styles.mobileWorldIcon} aria-hidden="true">
              <FaComments />
            </span>
            <span className={styles.mobileWorldCopy}>
              <small>CONNECT &amp; PLAY</small>
              <strong>CHAT &amp; COMMUNITY</strong>
              <span>Chat and find your squad.</span>
            </span>
            <FaArrowRight className={styles.mobileArrow} aria-hidden="true" />
          </Link>

          <Link
            href="/marketplace"
            className={`${styles.mobileWorldCard} ${styles.mobileMarketCard}`}
          >
            <span className={styles.mobileWorldIcon} aria-hidden="true">
              <FaShoppingCart />
            </span>
            <span className={styles.mobileWorldCopy}>
              <small>BUY, SELL &amp; DISCOVER</small>
              <strong>MARKETPLACE</strong>
              <span>Trusted gaming items.</span>
            </span>
            <FaArrowRight className={styles.mobileArrow} aria-hidden="true" />
          </Link>
        </nav>

        <div className={styles.mobileArtFocus} aria-hidden="true" />

        <nav className={styles.mobileUtilities} aria-label="ComePlayers information">
            <button type="button" onClick={() => setPanel("how")}>
              <FaQuestionCircle aria-hidden="true" />
              <span>How It Works</span>
            </button>
            <button type="button" onClick={() => setPanel("about")}>
              <FaUsers aria-hidden="true" />
              <span>About Us</span>
            </button>
            <button type="button" onClick={() => setPanel("help")}>
              <FaHeadset aria-hidden="true" />
              <span>Help Center</span>
            </button>
            <a href={`mailto:${SUPPORT_EMAIL}`}>
              <FaEnvelope aria-hidden="true" />
              <span>Contact</span>
            </a>
        </nav>

        <section
          className={styles.mobileDownloads}
          aria-labelledby="mobile-download-title"
          data-testid="mobile-app-downloads"
        >
          <div className={styles.mobileSectionTitle}>
            <span aria-hidden="true" />
            <h2 id="mobile-download-title">GET THE COMEPLAYERS APP</h2>
            <span aria-hidden="true" />
          </div>
          <div>
            <a
              className={styles.mobileDownloadPrimary}
              href={ANDROID_URL}
              download
              aria-label="Download ComePlayers APK for Android"
            >
              <FaAndroid aria-hidden="true" />
              <span>
                <small>DOWNLOAD APK</small>
                ANDROID
              </span>
            </a>
            <button
              type="button"
              onClick={() => setPanel("ios")}
              aria-label="Install ComePlayers on iPhone"
            >
              <FaApple aria-hidden="true" />
              <span>
                <small>INSTALL ON</small>
                IPHONE / IPAD
              </span>
            </button>
            <a
              className={styles.mobileDownloadDesktop}
              href={WINDOWS_URL}
              download
              aria-label="Download ComePlayers for Windows"
            >
              <FaWindows aria-hidden="true" />
              <span>
                <small>DESKTOP APP</small>
                WINDOWS
              </span>
            </a>
          </div>
        </section>
      </section>

      {panel && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPanel(null);
          }}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-home-dialog-title"
          >
            <p className={styles.modalEyebrow}>COMEPLAYERS</p>
            <h2 id="cp-home-dialog-title">{panelCopy[panel].title}</h2>
            <p>{panelCopy[panel].body}</p>
            <button type="button" onClick={() => setPanel(null)}>
              Close
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
