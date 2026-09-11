"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FaAndroid,
  FaComments,
  FaShoppingCart,
  FaWindows,
} from "react-icons/fa";
import styles from "./home.module.css";

type MainChoice = "chat" | "marketplace" | null;
type DownloadChoice = "pc" | "android" | null;

const PC_DOWNLOAD_URL = process.env.NEXT_PUBLIC_COMEPLAYERS_PC_URL ?? "";
const ANDROID_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_COMEPLAYERS_ANDROID_URL ?? "";

export default function HomeClient() {
  const rootRef = useRef<HTMLElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [activeChoice, setActiveChoice] = useState<MainChoice>(null);
  const [downloadNotice, setDownloadNotice] =
    useState<DownloadChoice>(null);

  useLayoutEffect(() => {
    document.body.classList.add("cp-home-no-chrome");
    document.documentElement.classList.add("cp-home-active");

    return () => {
      document.body.classList.remove("cp-home-no-chrome");
      document.documentElement.classList.remove("cp-home-active");
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const updatePointer = () => {
      root.style.setProperty("--pointer-x", `${pointerRef.current.x * 10}px`);
      root.style.setProperty("--pointer-y", `${pointerRef.current.y * 7}px`);
      root.style.setProperty(
        "--pointer-rotate",
        `${pointerRef.current.x * 0.7}deg`
      );
      animationFrameRef.current = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      pointerRef.current = {
        x: Math.max(
          -1,
          Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)
        ),
        y: Math.max(
          -1,
          Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)
        ),
      };

      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(updatePointer);
      }
    };

    const resetPointer = () => {
      pointerRef.current = { x: 0, y: 0 };
      if (animationFrameRef.current === null) {
        animationFrameRef.current = window.requestAnimationFrame(updatePointer);
      }
    };

    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", resetPointer);

    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", resetPointer);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleUnavailableDownload = (choice: DownloadChoice) => {
    setDownloadNotice(choice);
    window.setTimeout(() => setDownloadNotice(null), 2400);
  };

  return (
    <main ref={rootRef} className={styles.home}>
      <div className={styles.backgroundGrid} aria-hidden="true" />
      <div className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.particles} aria-hidden="true" />

      <section className={styles.shell} aria-label="ComePlayers main menu">
        <div className={styles.contentColumn}>
          <header className={styles.intro}>
            <p className={styles.eyebrow}>WELCOME TO</p>
            <h1 className={styles.title}>COMEPLAYERS</h1>
            <p className={styles.subtitle}>
              Connect with players, build your squad, and explore the gaming
              marketplace.
            </p>
          </header>

          <nav className={styles.primaryMenu} aria-label="Main destinations">
            <Link
              href="/messages"
              className={styles.primaryCard}
              data-active={activeChoice === "chat"}
              onPointerEnter={() => setActiveChoice("chat")}
              onPointerLeave={() => setActiveChoice(null)}
              onFocus={() => setActiveChoice("chat")}
              onBlur={() => setActiveChoice(null)}
            >
              <span className={styles.primaryIcon} aria-hidden="true">
                <FaComments />
              </span>
              <span className={styles.primaryCopy}>
                <strong>CHAT &amp; MESSAGES</strong>
                <small>Find players, create parties, and talk in real time.</small>
              </span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>

            <Link
              href="/marketplace"
              className={styles.primaryCard}
              data-active={activeChoice === "marketplace"}
              onPointerEnter={() => setActiveChoice("marketplace")}
              onPointerLeave={() => setActiveChoice(null)}
              onFocus={() => setActiveChoice("marketplace")}
              onBlur={() => setActiveChoice(null)}
            >
              <span className={styles.primaryIcon} aria-hidden="true">
                <FaShoppingCart />
              </span>
              <span className={styles.primaryCopy}>
                <strong>MARKETPLACE</strong>
                <small>Discover products, services, and trusted sellers.</small>
              </span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </nav>

          <div className={styles.downloadSection}>
            <p className={styles.downloadLabel}>Get the ComePlayers app</p>
            <div className={styles.downloadRow}>
              {PC_DOWNLOAD_URL ? (
                <a className={styles.downloadButton} href={PC_DOWNLOAD_URL}>
                  <FaWindows aria-hidden="true" />
                  <span>DOWNLOAD PC</span>
                </a>
              ) : (
                <button
                  type="button"
                  className={styles.downloadButton}
                  onClick={() => handleUnavailableDownload("pc")}
                >
                  <FaWindows aria-hidden="true" />
                  <span>DOWNLOAD PC</span>
                </button>
              )}

              {ANDROID_DOWNLOAD_URL ? (
                <a
                  className={styles.downloadButton}
                  href={ANDROID_DOWNLOAD_URL}
                >
                  <FaAndroid aria-hidden="true" />
                  <span>DOWNLOAD ANDROID</span>
                </a>
              ) : (
                <button
                  type="button"
                  className={styles.downloadButton}
                  onClick={() => handleUnavailableDownload("android")}
                >
                  <FaAndroid aria-hidden="true" />
                  <span>DOWNLOAD ANDROID</span>
                </button>
              )}
            </div>
            <p className={styles.downloadNotice} aria-live="polite">
              {downloadNotice === "pc" && "Link download PC belum diatur."}
              {downloadNotice === "android" &&
                "Link download Android belum diatur."}
            </p>
          </div>
        </div>

        <div
          className={styles.characterColumn}
          data-active={activeChoice ?? "idle"}
          aria-label="Alexia, ComePlayers mascot"
        >
          <div className={styles.characterPointerLayer}>
            <div className={styles.characterPoseLayer}>
              <div className={styles.characterFloatLayer}>
                <Image
                  src="/home-v11/alexia-stacked.webp"
                  alt="Alexia, mascot of ComePlayers"
                  fill
                  priority
                  sizes="(max-width: 900px) 88vw, 46vw"
                  className={styles.alexiaImage}
                  draggable={false}
                />
              </div>
            </div>
          </div>
          <div className={styles.characterHalo} aria-hidden="true" />
          <p className={styles.mascotLabel}>ALEXIA · YOUR GAMING GUIDE</p>
        </div>
      </section>

      <footer className={styles.tagline}>PLAY TOGETHER. WIN TOGETHER.</footer>
    </main>
  );
}
