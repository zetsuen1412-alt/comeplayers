"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaBolt,
  FaCheckCircle,
  FaGamepad,
  FaShieldAlt,
  FaTimes,
} from "react-icons/fa";
import styles from "./PaymentWaitGame.module.css";

const PULSE_POSITIONS = [
  { x: 18, y: 25 },
  { x: 52, y: 20 },
  { x: 81, y: 30 },
  { x: 68, y: 63 },
  { x: 34, y: 70 },
  { x: 13, y: 58 },
  { x: 46, y: 48 },
  { x: 86, y: 72 },
] as const;

type PaymentWaitGameProps = {
  orderId: string | number;
};

export default function PaymentWaitGame({ orderId }: PaymentWaitGameProps) {
  const [open, setOpen] = useState(true);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [pulseIndex, setPulseIndex] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const pulseTimer = window.setInterval(() => {
      setPulseIndex((current) => (current + 1) % PULSE_POSITIONS.length);
      setCombo(0);
    }, 1_650);

    return () => window.clearInterval(pulseTimer);
  }, [open]);

  function catchPulse() {
    setScore((current) => current + 10 + Math.min(combo, 5) * 2);
    setCombo((current) => current + 1);
    setPulseIndex((current) => (current + 3) % PULSE_POSITIONS.length);
  }

  if (!open) return null;

  const pulse = PULSE_POSITIONS[pulseIndex];
  const level = Math.floor(score / 100) + 1;
  const progress = score % 100;

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-wait-game-title"
        aria-describedby="payment-wait-game-description"
      >
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandIcon} aria-hidden="true">
              <FaGamepad />
            </span>
            <div>
              <p>COMEPLAYERS MINI QUEST</p>
              <strong>PAYMENT PULSE</strong>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.secureBadge}>
              <FaShieldAlt /> DOKU secure check
            </span>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.closeButton}
              onClick={() => setOpen(false)}
              aria-label="Close mini-game and continue waiting"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.statusPanel}>
          <span className={styles.statusAnimation} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <p>ORDER #{orderId}</p>
            <h2 id="payment-wait-game-title">Confirming your payment</h2>
            <span id="payment-wait-game-description">
              DOKU confirmation continues automatically while you play.
            </span>
          </div>
          <span className={styles.liveStatus}>
            <i /> Checking securely
          </span>
        </div>

        <div className={styles.content}>
          <div className={styles.gamePanel}>
            <div className={styles.gameHeading}>
              <div>
                <p>Quick game</p>
                <h3>Catch the payment pulse</h3>
              </div>
              <span>Tap the cyan orb before it moves</span>
            </div>

            <div className={styles.scoreboard} aria-live="polite">
              <div>
                <small>Score</small>
                <strong>{score.toString().padStart(4, "0")}</strong>
              </div>
              <div>
                <small>Combo</small>
                <strong>×{combo}</strong>
              </div>
              <div>
                <small>Level</small>
                <strong>{level}</strong>
              </div>
            </div>

            <div className={styles.arena}>
              <span className={styles.arenaGrid} aria-hidden="true" />
              <span className={styles.scanLine} aria-hidden="true" />
              <button
                type="button"
                className={styles.pulse}
                style={{ left: `${pulse.x}%`, top: `${pulse.y}%` }}
                onClick={catchPulse}
                aria-label="Catch payment pulse"
              >
                <span aria-hidden="true">
                  <FaBolt />
                </span>
              </button>
              <div className={styles.arenaMessage} aria-hidden="true">
                <FaBolt /> SIGNAL ONLINE
              </div>
            </div>

            <div className={styles.levelTrack}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <aside className={styles.infoPanel}>
            <div className={styles.infoIcon} aria-hidden="true">
              <FaShieldAlt />
            </div>
            <p>Payment verification</p>
            <h3>Your checkout is still running safely</h3>
            <ul>
              <li>
                <FaCheckCircle /> Card details remain with DOKU
              </li>
              <li>
                <FaCheckCircle /> Payment status checks automatically
              </li>
              <li>
                <FaCheckCircle /> Successful payment redirects instantly
              </li>
            </ul>
            <button
              type="button"
              className={styles.waitButton}
              onClick={() => setOpen(false)}
            >
              Continue waiting in background
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}
